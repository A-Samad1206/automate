import { chromium } from "playwright";
import { Parser } from "json2csv";

import fs from "fs";
import { parse } from "csv-parse/sync";
import { CONFIG } from "./config.js";

const PROCESS_TYPE = {
  PROCESSED: "PROCESSED",
  NOT_PROCESSED: "NOT_PROCESSED",
};

const processedOrder = [];

async function login(page) {
  await page.goto("https://go.tradeshift.com");
  try {
    await page.click("#cookie-consent-accept-all", { timeout: 3000 });
    console.log("Cookie consent accepted.");
  } catch {
    console.log("Cookie consent button not found — skipping.");
  }

  await page.fill('input[name="j_username"]', CONFIG.username);
  await page.fill('input[name="j_password"]', CONFIG.password);
  await page.click('button[id="proceed"]');
  await page.waitForLoadState("networkidle");
}

async function navigateToDocumentManager(page) {
  let navigationSuccess = false;
  let retries = 3;

  while (retries > 0 && !navigationSuccess) {
    try {
      console.log(`Navigating to Document Manager (attempt ${4 - retries}/3)`);

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
      console.log("Navigation to Document Manager successful");
    } catch (navError) {
      console.log(`Navigation failed: ${navError.message}`);
      retries--;
      if (retries === 0) {
        console.log("All navigation attempts failed, trying page reload...");
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
          console.log("Navigation successful after reload");
        } catch (reloadError) {
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

const getObjFromRow = (row) => {
  const orderNo = row["Order no"];
  const invoiceNo = row["HFS Invoice No"];
  const invoiceDate = row["HFS Invoice Date"];
  const irnNo = row["IRN NO"];
  const businessArea = row["Business Area"];
  const totalInvoiceBaseAmount = parseFloat(
    row["Total Invoice Base Amount"].split(",").join("")
  );

  const hsnSac = row["HSN/SAC"];
  const sac = row["SAC"];

  const choosenFile = row["HFS Invoice No"];

  return {
    orderNo,
    invoiceNo,
    invoiceDate,
    irnNo,
    businessArea: businessArea || "C002",
    totalInvoiceBaseAmount,
    hsnSac: hsnSac || "SAC",
    sac: sac || 998599,
    choosenFile: `${choosenFile}.pdf`,
  };
};

const isMissing = (row) => {
  return (
    !row.orderNo ||
    !row.invoiceNo ||
    !row.invoiceDate ||
    !row.irnNo ||
    !row.businessArea ||
    !row.totalInvoiceBaseAmount ||
    !row.hsnSac ||
    !row.sac ||
    !row.choosenFile
  );
};

const getCSVData = () => {
  try {
    const file = fs.readFileSync(CONFIG.dataFile);
    const records = parse(file, {
      columns: true, // converts to array of objects
      skip_empty_lines: true,
    }).map((o) => getObjFromRow(o));

    console.log(`${records.length} Rows fetched`);
    const invalidRows = records.filter((o) => isMissing(o));
    if (invalidRows.length > 0) {
      console.log(`${invalidRows.length} Invalid rows found`);
      console.log("Invalid rows :", invalidRows);
      process.exit(1);
    }

    const validRows = records.filter((o) => !isMissing(o));

    if (validRows.length === 0) {
      console.log("No valid rows found");
      process.exit(1);
    }

    const fileFound = validRows.map((o) => o.choosenFile);
    const existingFiles = fileFound.filter((file) =>
      fs.existsSync(CONFIG.pdfDir + file)
    );

    // Check for missing files
    if (existingFiles.length < fileFound.length) {
      const missingFiles = fileFound.filter(
        (file) => !fs.existsSync(CONFIG.pdfDir + file)
      );
      console.log(
        `Error: ${missingFiles.length} file(s) not found in ${CONFIG.pdfDir}:`
      );
      missingFiles.forEach((file) => console.log(`- ${file}`));
      process.exit(1);
    }
    const irns = validRows.map((p) => p["irnNo"]);
    const uniqueIrns = [...new Set(irns)];
    if (uniqueIrns.length != validRows.length) {
      console.log(
        `Error: ${validRows.length - uniqueIrns.length} duplicate irn(s) found`
      );
      console.log(
        "Duplicate rows :",
        validRows.filter((p) => p["irnNo"])
      );
      process.exit(1);
    }
    const uniqueRows = validRows.map((p) => p["orderNo"]);
    const uniqueOrderNo = [...new Set(uniqueRows)];

    if (uniqueOrderNo.length != validRows.length) {
      console.log(
        `Error: ${
          validRows.length - uniqueOrderNo.length
        } duplicate order(s) found`
      );
      console.log(
        "Duplicate rows :",
        validRows.filter((p) => p["orderNo"])
      );
      process.exit(1);
    }
    return validRows;
  } catch (err) {
    console.error("Failed to fetch records", err);
    process.exit(1);
  }
};

function saveToCSV(filename, jsonArray) {
  const parser = new Parser();
  if (jsonArray.length === 0) return;
  const csv = parser.parse(jsonArray);
  fs.writeFileSync(filename, csv, "utf8");
}

async function applyFilter(page, orderNo) {
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
}

const getPendingRows = () => {
  let processedOrders = [];
  const allRows = getCSVData();

  try {
    const file = fs.readFileSync(CONFIG.processedOrderFile);
    processedOrders = parse(file, {
      columns: true, // converts to array of objects
      skip_empty_lines: true,
    })
      .map((o) => ({
        orderNo: o.orderNo,
        message: o.message,
        status: o.status,
        timestamp: o.timestamp,
        success: o.success,
        url: o.url,
        errors: o.errors,
      }))
      .filter((r) => r.status === PROCESS_TYPE.PROCESSED)
      .map((p) => p.orderNo);

    const allPendingRows = allRows.filter(
      (row) => !processedOrders.includes(row.orderNo)
    );
    return allPendingRows;
  } catch (error) {
    return allRows;
  }
};

async function main() {
  const rows = getPendingRows();
  console.log(rows);
  if (!rows.length) {
    console.error(
      "No data found. Make sure the sheet is shared with the service account email."
    );
    return { status: "error", message: "No data found" };
  }

  try {
    const browser = await chromium.launch({
      headless: false,
      args: ["--start-maximized", "--start-fullscreen"],
    });

    let context = await browser.newContext({
      viewport: null, // Use full screen viewport
    });

    let page = await context.newPage();

    page.setDefaultTimeout(120 * 1000);
    page.setDefaultNavigationTimeout(120 * 1000);

    await login(page);
    // let previousPage = null;
    for (const orderIndex in rows) {
      const orderObj = rows[orderIndex];

      const orderNo = orderObj.orderNo;
      console.log(
        "\n\n\n\n\n\n\n\n\n\n\n========================================================================"
      );
      console.log(`Processing order: ${orderNo}`);
      // Close previous tab if it exists
      // if (previousPage) {
      //   await previousPage.reload();
      //   await previousPage.close();
      //   previousPage = page = await context.newPage();
      //   page.setDefaultTimeout(1200000);
      //   page.setDefaultNavigationTimeout(1200000);
      // } else {
      //   previousPage = page;
      // }

      try {
        // Always navigate to Document Manager at the start of each order
        await navigateToDocumentManager(page);

        await applyFilter(page, orderNo);
        console.log(`Applied filter for order: ${orderNo}`);
        await page.waitForTimeout(5000);
        console.log(`Waited for 5 seconds for filter to apply`);
        if (!page.frame({ name: "main-app-iframe" })) {
          throw new Error("Main iframe not found");
        }

        const link = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole("link", { name: orderNo });
        console.log(`Link for order: ${orderNo}`);
        if ((await link.count()) === 0) {
          console.log(`${orderNo}: Order not found in search results`);
          processedOrder.push({
            orderNo: orderNo,
            message: "Order not found on the platform with this id!",
            status: PROCESS_TYPE.PROCESSED,
            success: false,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        await link.waitFor({ state: "visible", timeout: 15000 });
        const trLocator = link.locator("xpath=ancestor::tr[1]");
        const tdText = await trLocator.locator("td").nth(3).innerText();
        console.log("Status Text: ", tdText);
        console.log(`Order ${orderNo} status is "${tdText.trim()}"`);

        if (tdText.trim() !== "RECEIVED") {
          console.log(`Order ${orderNo} status is not "RECEIVED"`);
          processedOrder.push({
            orderNo: orderNo,
            message: `Order found with status ${tdText.trim()}, but not RECEIVED!`,
            status: PROCESS_TYPE.PROCESSED,
            success: false,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Click on the link on order no
        await link.click({
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        console.log(`Clicked on link for order: ${orderNo}`);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("button", { name: "Create Invoice" })
          .click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(3000);
        console.log(`Clicked on Create Invoice for order: ${orderNo}`);

        let inputValue = await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__amount")
          .inputValue();
        console.log(`Input value for order: ${inputValue}`);
        inputValue = parseFloat(inputValue.replace(/,/g, ""));
        const crtUrl = page.url();
        console.log("crtUrl: ", crtUrl);

        if (inputValue < orderObj.totalInvoiceBaseAmount) {
          // wait for 15 sec
          console.log(
            `order no: ${orderNo} amount on platform is: ${inputValue}, which is less than total invoice base amount found in the sheet: ${orderObj.totalInvoiceBaseAmount}`
          );
          await page.waitForTimeout(15000);
          processedOrder.push({
            orderNo: orderNo,
            message: `order no: ${orderNo} amount on platform is: ${inputValue}, which is less than total invoice base amount found in the sheet: ${orderObj.totalInvoiceBaseAmount}`,
            status: PROCESS_TYPE.PROCESSED,
            success: false,
            timestamp: new Date().toISOString(),
            url: crtUrl,
          });
          continue;
        }

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "Invoice number" })
          .fill(orderObj.invoiceNo);
        console.log(`Invoice number filled for order: ${orderNo}`);
        const dateStr = orderObj.invoiceDate;
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
        console.log(`Issue date filled for order: ${orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "IRN (Invoice Reference Number)" })
          .fill(orderObj.irnNo);
        console.log(`IRN filled for order: ${orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole("textbox", { name: "Business Area" })
          .fill(orderObj.businessArea);

        console.log(`Business Area filled for order: ${orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__amount")
          .fill(orderObj.totalInvoiceBaseAmount.toString());

        console.log(`Total Invoice Base Amount filled for order: ${orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__additionalItemIdentification_schemeId")
          .selectOption(orderObj.hsnSac);

        console.log(`HSN/SAC selected for order: ${orderNo}`);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator("#lines_0__additionalItemIdentification_value")
          .fill(orderObj.sac.toString());

        console.log(`HSN/SAC filled for order: ${orderNo}`);

        await page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .locator('input[name="attachment"]')
          .setInputFiles(CONFIG.pdfDir + orderObj.choosenFile);

        console.log(`Attachment filled for order: ${orderNo}`);

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

        console.log(`Preview clicked for order: ${orderNo}`);

        await page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .getByText("Invoice draft saved.")
          .waitFor({ state: "visible", timeout: 10000 });
        console.log("):-waited for 5s");
        await page.waitForTimeout(5000);
        console.log("Found toast message");

        const errorList = page
          .frameLocator('iframe[name="main-app-iframe"]')
          .frameLocator('iframe[name="legacy-frame"]')
          .locator("ul.messageContainer.error > li");

        console.log("errors:", errorList);
        if ((await errorList.count()) > 0) {
          const errors = await errorList.allTextContents();
          console.log("crtUrl: ", crtUrl);
          console.log("errors:", errors);
          processedOrder.push({
            orderNo: orderObj.orderNo,
            message: `Order have not been successfully processd! Reason :${errors}`,
            status: PROCESS_TYPE.PROCESSED,
            success: false,
            timestamp: new Date().toISOString(),
            errors: errors,
            url: crtUrl,
          });
        } else {
          console.log("✅ No error list found");
          processedOrder.push({
            orderNo: orderObj.orderNo,
            message: "Order have been successfully processd!",
            status: PROCESS_TYPE.PROCESSED,
            success: true,
            timestamp: new Date().toISOString(),
            url: crtUrl,
          });
          console.log("No errors");
        }

        await page.waitForTimeout(30000 / 2);
      } catch (error) {
        console.error(
          `Error processing order ${orderObj.orderNo}:`,
          error.message
        );

        processedOrder.push({
          orderNo: orderObj.orderNo,
          message:
            "Error while processing order" + error.message ||
            JSON.stringify(error),
          status: PROCESS_TYPE.NOT_PROCESSED,
          success: false,
          timestamp: new Date().toISOString(),
        });

        // Recovery logic
        try {
          await context.close();
          context = await browser.newContext({
            viewport: null, // Use full screen viewport
          });
          page = await context.newPage();
          page.setDefaultTimeout(60000);
          page.setDefaultNavigationTimeout(60000);
          await login(page);
        } catch (recoveryError) {
          console.log("Recovery failed:", recoveryError.message);
          console.log("Critical error - exiting script");
          await browser.close();
          reSaveProcessedFile(processedOrder);
          if (getPendingRows().length) await main();
          process.exit(1);
        }
      }
    }

    console.log("Processing completed");
    console.log("Browser will stay open. Press Ctrl+C to quit.");
  } catch (error) {
    console.log("error: ", error);
  } finally {
    reSaveProcessedFile(processedOrder);
    const pending = getPendingRows();
    if (pending.length) await main();
    browser.close();
  }

  await new Promise(() => {});
}
main();

function reSaveProcessedFile(processedOrder) {
  if (processedOrder.length == 0) return;
  let records = [];
  try {
    const file = fs.readFileSync(CONFIG.processedOrderFile);
    records = parse(file, {
      columns: true, // converts to array of objects
      skip_empty_lines: true,
    }).map((o) => ({
      orderNo: o.orderNo,
      message: o.message,
      status: o.status,
      timestamp: o.timestamp,
    }));
  } catch (error) {}

  saveToCSV(
    CONFIG.processedOrderFile,
    [...records, ...processedOrder].map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      success: o.success,
      url: o.url,
      timestamp: o.timestamp,
      errors: o.errors,
      message: o.message,
    }))
  );
}

process.on("SIGINT", () => {
  console.log("\nScript interrupted by user (SIGINT)");
  reSaveProcessedFile(processedOrder);
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\nScript interrupted by user (SIGTERM)");
  reSaveProcessedFile(processedOrder);
  process.exit(0);
});

process.on("exit", () => {
  console.log("\nScript interrupted by user (exit)");
  reSaveProcessedFile(processedOrder);
  process.exit(0);
});
