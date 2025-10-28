import { chromium } from "playwright";
import { getPendingRows, PROCESS_TYPE, writeOrAppendXLSX } from "./util.js";

import path from "path";

export const processing_script = async (
  rows,
  { subDir, processedFilePath, username, password }
) => {
  const pendingRows = getPendingRows(rows, path.join(processedFilePath));

  if (pendingRows.length === 0) {
    console.info(":- No pending rows found");

    return {
      message: "All have been processed",
      status: "success",
    };
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized", "--start-fullscreen"],
  });

  try {
    const context = await browser.newContext({
      viewport: null, // Use full screen viewport
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120 * 1000);
    page.setDefaultNavigationTimeout(120 * 1000);
    console.info("):- Launched browser");
    try {
      // login - start
      await page.goto("https://go.tradeshift.com");
      try {
        await page.click("#cookie-consent-accept-all", { timeout: 3000 });
        console.info("):- Cookie consent accepted.");
      } catch (err) {
        console.error("Cookie consent button not found — skipping. \n\n" + err);
      }

      await page.fill('input[name="j_username"]', username);
      await page.fill('input[name="j_password"]', password);
      await page.click('button[id="proceed"]');
      await page.waitForLoadState("networkidle");
      console.info("):- Logged in successfully");
    } catch (error) {
      console.error("Error while loging in \n\n" + error);
      return {
        status: false,
        message: "Failed to login with provided credentials!",
      };
    }

    await page.waitForTimeout(10000);

    // login - end
    for (const orderIndex in pendingRows) {
      const order = pendingRows[orderIndex];
      try {
        console.info("\n\n\n\n\n=============================================");
        console.info(
          ":- Processing order: ",
          order.orderNo,
          "index: ",
          orderIndex
        );

        await navigateToDocumentManager(page);

        await applyFilter(page, order.orderNo);

        // If order exist
        const link = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole("link", { name: order.orderNo });

        if ((await link.count()) === 0) {
          console.info(`${order.orderNo}: Order not found in search results`);
          await writeOrAppendXLSX(processedFilePath, [
            {
              orderNo: order.orderNo,
              message: "Order not found in the table with this orderNo!",
              status: PROCESS_TYPE.PROCESSED,
              success: false,
              timestamp: new Date().toISOString(),
            },
          ]);
          continue;
        }
        await link.waitFor({ state: "visible", timeout: 15000 });
        const trLocator = link.locator("xpath=ancestor::tr[1]");
        const tdText = await trLocator.locator("td").nth(3).innerText();
        console.info("Status: ", tdText.trim());
        // If order havingn status other than "RECEIVED" then skip

        if (tdText.trim() !== "RECEIVED") {
          console.info(`Order ${order.orderNo} status is not "RECEIVED"`);
          await writeOrAppendXLSX(processedFilePath, [
            {
              orderNo: order.orderNo,
              message: `Order found with status ${tdText.trim()}, but not RECEIVED!`,
              status: PROCESS_TYPE.PROCESSED,
              success: false,
              timestamp: new Date().toISOString(),
            },
          ]);
          continue;
        }

        // Click on the link on order no
        await link.click({
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        console.log(`Clicking on the link for order`);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("button", { name: "Create Invoice" })
          .click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(3000);
        console.log(`Clicked on Create Invoice for order`);

        const crtUrl = page.url();
        console.info(":- Comparing the amounts!");

        let inputValue = await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__amount")
          .inputValue();
        console.log(`Input value for order: ${inputValue}`);
        inputValue = parseFloat(inputValue.replace(/,/g, ""));

        if (inputValue < order.totalInvoiceBaseAmount) {
          // wait for 15 sec
          console.log(
            `order no: ${order.orderNo} amount on platform is: ${inputValue}, which is less than total invoice base amount found in the sheet: ${order.totalInvoiceBaseAmount}`
          );
          // await page.waitForTimeout(15000);
          await writeOrAppendXLSX(processedFilePath, [
            {
              orderNo: order.orderNo,
              message: `order no: ${order.orderNo} amount on platform is: ${inputValue}, which is less than total invoice base amount found in the sheet: ${order.totalInvoiceBaseAmount}`,
              status: PROCESS_TYPE.PROCESSED,
              success: false,
              timestamp: new Date().toISOString(),
              url: crtUrl,
            },
          ]);
          continue;
        }

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "Invoice number" })
          .fill(order.invoiceNo);
        console.log(`Invoice number filled for order: ${order.orderNo}`);
        const dateStr = order.invoiceDate;
        const formatted = dateStr.replace(/-/g, "/");

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("div")
          .filter({ hasText: /^Issue date \*\.\.\.$/ })
          .locator("input") // <-- target the input if present
          .fill(formatted);
        console.log(`Issue date filled for order: ${order.orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "IRN (Invoice Reference Number)" })
          .fill(order.irnNo);
        console.log(`IRN filled for order: ${order.orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "Business Area" })
          .fill(order.businessArea);

        console.log(`Business Area filled for order: ${order.orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__amount")
          .fill(order.totalInvoiceBaseAmount.toString());

        console.log(
          `Total Invoice Base Amount filled for order: ${order.orderNo}`
        );

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__additionalItemIdentification_schemeId")
          .selectOption(order.hsnSac);

        console.log(`HSN/SAC selected for order: ${order.orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__additionalItemIdentification_value")
          .fill(order.sac.toString());

        console.log(`HSN/SAC filled for order: ${order.orderNo}`);

        await page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .locator('input[name="attachment"]')
          .setInputFiles(path.join(subDir, order.choosenFile));

        console.log(`Attachment filled for order: ${order.orderNo}`);

        await Promise.all([
          // page.waitForLoadState('networkidle'),
          page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole("button", { name: "Preview" })
            .click(),
        ]);

        console.log(`Preview clicked for order: ${order.orderNo}`);

        await page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .getByText("Invoice draft saved.")
          .waitFor({ state: "visible", timeout: 10000 });
        console.log("):-waiting for 5s");
        await page.waitForTimeout(5000);
        console.log("):-waited for 5s");

        const errorList = page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .locator("ul.messageContainer.error > li");

        if ((await errorList.count()) > 0) {
          const errors = await errorList.allTextContents();
          console.log("errors in toast: ", errors);
          await writeOrAppendXLSX(processedFilePath, [
            {
              orderNo: order.orderNo,
              message: `Order could not been processd due to invalid data!`,
              status: PROCESS_TYPE.PROCESSED,
              success: false,
              timestamp: new Date().toISOString(),
              errors: errors.toString(),
              url: crtUrl,
            },
          ]);
        } else {
          console.log("✅ No error list found");
          await writeOrAppendXLSX(processedFilePath, [
            {
              orderNo: order.orderNo,
              message: "Order have been successfully processd!",
              status: PROCESS_TYPE.PROCESSED,
              success: true,
              timestamp: new Date().toISOString(),
              url: crtUrl,
            },
          ]);
          console.log("No errors");
        }

        await page.waitForTimeout(10000);
      } catch (error) {
        console.error(
          "Error from processing_script's for loop catch block. \n\n" + error
        );
        await writeOrAppendXLSX(processedFilePath, [
          {
            orderNo: order.orderNo,
            message:
              "Error while processing order" + error.message ||
              JSON.stringify(error),
            status: PROCESS_TYPE.NOT_PROCESSED,
            success: false,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    }
  } catch (error) {
    console.error("Error from processing_script's catch block. \n\n" + error);
  } finally {
    await browser.close();
    await processing_script(pendingRows, {
      subDir,
      processedFilePath,
      username,
      password,
    });
  }
};

async function navigateToDocumentManager(page) {
  let navigationSuccess = false;
  let retries = 3;

  while (retries > 0 && !navigationSuccess) {
    try {
      console.info(`Navigating to Document Manager (attempt ${4 - retries}/3)`);

      // Use domcontentloaded instead of networkidle for faster navigation
      await page.goto(
        "https://go.tradeshift.com/#/Tradeshift.DocumentManager",
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

      // Wait for critical elements to ensure page is loaded
      await page.waitForSelector('iframe[name="main-app-iframe"]', {
        timeout: 20000,
      });

      // Use contentFrame() method for more reliable frame access
      const mainFrame = page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame();

      // Wait for the filter button specifically as it indicates the page is ready
      await mainFrame.getByRole("button", { name: ")Filter" }).waitFor({
        state: "visible",
        timeout: 20000,
      });

      // Additional check to ensure the search functionality is available
      await mainFrame.getByRole("textbox", { name: "Search" }).waitFor({
        state: "visible",
        timeout: 15000,
      });

      navigationSuccess = true;
      console.info("Navigation to Document Manager successful");
    } catch (navError) {
      console.error(`Navigation failed: ${navError.message}`);
      retries--;
      if (retries === 0) {
        console.info("All navigation attempts failed, trying page reload...");
        try {
          await page.reload({
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
          await page.waitForTimeout(2000);
          // Try one more time after reload
          await page.goto(
            "https://go.tradeshift.com/#/Tradeshift.DocumentManager",
            {
              waitUntil: "domcontentloaded",
              timeout: 60000,
            }
          );
          await page.waitForSelector('iframe[name="main-app-iframe"]', {
            timeout: 20000,
          });
          navigationSuccess = true;
          console.info("Navigation successful after reload");
        } catch (reloadError) {
          console.error(
            `Failed to navigate to Document Manager: ${reloadError.message}`
          );
          throw new Error(
            `Failed to navigate to Document Manager: ${reloadError.message}`
          );
        }
      } else {
        await page.waitForTimeout(2000);
      }
    }
  }
}

async function applyFilter(page, orderNo) {
  try {
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator("div")
      .filter({ hasText: /^Filter$/ })
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: ")Filter" })
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: "Document Types" })
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".invoice.flex-none")
      .check();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByText("Unselect all")
      .first()
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".invoice.flex-none")
      .check();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".order.flex-none")
      .check();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: "Status" })
      .first()
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator("div")
      .filter({ hasText: /^Unselect all$/ })
      .nth(1)
      .click();
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByText("Unselect all")
      .nth(1)
      .click();
    await page.waitForTimeout(1000);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".DELIVERED_RECEIVED.flex-none")
      .check();
    await page.waitForTimeout(1000);

    // Clear the search field first, then fill with current order number
    const searchBox = page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("textbox", { name: "Search" });

    await searchBox.click();
    await searchBox.selectText();
    await searchBox.press("Delete");
    await page.waitForTimeout(500);
    await searchBox.fill(orderNo);
    console.info("Applied filters, needs to wait");
    await page.waitForTimeout(5000);
    console.info(`Waited for 5 seconds for filter to apply`);
    if (!page.frame({ name: "main-app-iframe" })) {
      throw new Error("Main iframe not found");
    }
    console.info("Applied filters successfully.");
  } catch (error) {
    console.error("):- error from applyFilters catch block: \n\n\n\n", error);
    throw error;
  }
}
