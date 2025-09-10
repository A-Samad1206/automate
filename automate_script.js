import { chromium } from 'playwright';
import { Parser } from 'json2csv';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { CONFIG } from './config.js';

async function login(page) {
  await page.goto('https://go.tradeshift.com');
  try {
    await page.click('#cookie-consent-accept-all', { timeout: 3000 });
    console.log('Cookie consent accepted.');
  } catch {
    console.log('Cookie consent button not found — skipping.');
  }

  await page.fill('input[name="j_username"]', CONFIG.username);
  await page.fill('input[name="j_password"]', CONFIG.password);
  await page.click('button[id="proceed"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

async function navigateToDocumentManager(page) {
  let navigationSuccess = false;
  let retries = 3;

  while (retries > 0 && !navigationSuccess) {
    try {
      console.log(`Navigating to Document Manager (attempt ${4 - retries}/3)`);

      // Use domcontentloaded instead of networkidle for faster navigation
      await page.goto(
        'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
        {
          waitUntil: 'domcontentloaded',
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
      await mainFrame.getByRole('button', { name: ')Filter' }).waitFor({
        state: 'visible',
        timeout: 20000,
      });

      // Additional check to ensure the search functionality is available
      await mainFrame.getByRole('textbox', { name: 'Search' }).waitFor({
        state: 'visible',
        timeout: 15000,
      });

      navigationSuccess = true;
      console.log('Navigation to Document Manager successful');
      await page.waitForTimeout(1000);
    } catch (navError) {
      console.log(`Navigation failed: ${navError.message}`);
      retries--;
      if (retries === 0) {
        console.log('All navigation attempts failed, trying page reload...');
        try {
          await page.reload({
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          await page.waitForTimeout(2000);
          // Try one more time after reload
          await page.goto(
            'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
            {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            }
          );
          await page.waitForSelector('iframe[name="main-app-iframe"]', {
            timeout: 20000,
          });
          navigationSuccess = true;
          console.log('Navigation successful after reload');
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
const getCSVData = (path) => {
  try {
    const file = fs.readFileSync(path);
    const records = parse(file, {
      columns: true, // converts to array of objects
      skip_empty_lines: true,
    });
    return records;
  } catch {
    return [];
  }
};

function saveToCSV(filename, jsonArray) {
  const parser = new Parser();
  const csv = parser.parse(jsonArray);
  fs.writeFileSync(filename, csv, 'utf8');
}

async function main() {
  const processedOrder = [];
  let rows = getCSVData(CONFIG.dataFile);
  const process = getCSVData(CONFIG.processedOrderFile);

  rows = rows.filter(
    (row) => process.find((p) => p.orderNo === row.orderNo)?.status !== 'error'
  );

  // const rows = await getSheetData(sheetId, range);
  if (!rows.length) {
    console.error(
      'No data found. Make sure the sheet is shared with the service account email.'
    );
    process.exit(1);
  }

  try {
    // const sheetId = '1IZw-bWzeO0UGW2_wmbOHBrGLyLLLWj4xM89jWotg554';
    // const range = 'A1:M5';

    // console.log('Raw rows from Google Sheets:', rows);

    // const dataObjects = convertToObjects(rows);
    // console.log('Converted to objects:', JSON.stringify(dataObjects, null, 2));

    const browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized', '--start-fullscreen'],
    });
    let context = await browser.newContext({
      viewport: null, // Use full screen viewport
    });
    let page = await context.newPage();

    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    await login(page);

    const dataObjects = rows;
    for (const orderIndex in dataObjects) {
      const order = dataObjects[orderIndex];

      console.log(`Processing order: ${order['Order no']}`);

      try {
        // Always navigate to Document Manager at the start of each order
        await navigateToDocumentManager(page);
        if (orderIndex > 0) {
          await page.reload({ waitUntil: 'networkidle' });
        }
        const orderNo = order['Order no'];

        const mainFrame = page.frame({ name: 'main-app-iframe' });
        if (!mainFrame) {
          throw new Error('Main iframe not found');
        }
        await page.waitForTimeout(1000);

        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Filter$/ })
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: ')Filter' })
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: 'Document Types' })
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByText('Unselect all')
          .first()
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.order.flex-none')
          .check();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: 'Status' })
          .first()
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Unselect all$/ })
          .nth(1)
          .click();
        await page.waitForTimeout(1000);
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.DELIVERED_RECEIVED.flex-none')
          .check();
        await page.waitForTimeout(1000);

        // Clear the search field first, then fill with current order number
        const searchBox = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('textbox', { name: 'Search' });

        await searchBox.click();
        await searchBox.selectText();
        await searchBox.press('Delete');
        await page.waitForTimeout(500);
        await searchBox.fill(orderNo);
        console.log(`Searching for order: ${orderNo}`);

        // // Apply filters
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("button", { name: ")Filter" })
        //   .click();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("button", { name: "Document Types" })
        //   .click();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByText("Unselect all")
        //   .first()
        //   .click();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .locator(".invoice.flex-none")
        //   .check();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .locator(".order.flex-none")
        //   .check();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("button", { name: "Status" })
        //   .first()
        //   .click();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .locator(".DELIVERED_RECEIVED.flex-none")
        //   .uncheck();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .locator(".DELIVERED_RECEIVED.flex-none")
        //   .check();
        // await page.waitForTimeout(1000);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("button", { name: ")Filter" })
        //   .click();
        // await page.waitForTimeout(2000);

        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("textbox", { name: "Search" })
        //   .waitFor({ state: "visible", timeout: 10000 });
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("textbox", { name: "Search" })
        //   .click();
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("textbox", { name: "Search" })
        //   .fill("");
        // await page.waitForTimeout(500);
        // await page
        //   .locator('iframe[name="main-app-iframe"]')
        //   .contentFrame()
        //   .getByRole("textbox", { name: "Search" })
        //   .fill(orderNo);
        // console.log(`Searching for order: ${orderNo}`);
        await page.waitForTimeout(5000);

        const link = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('link', { name: orderNo });
        if ((await link.count()) === 0) {
          console.log(`${orderNo}: Order not found in search results`);
          processedOrder.push({
            orderNo: orderNo,
            message: 'Order not found in on the portal with this id!',
            status: 'skipped',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        await link.waitFor({ state: 'visible', timeout: 15000 });
        const trLocator = link.locator('xpath=ancestor::tr[1]');
        const tdText = await trLocator.locator('td').nth(3).innerText();
        console.log('Status Text: ', tdText);

        if (tdText.trim() === 'RECEIVED') {
          await link.click({
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          // await page.waitForLoadState('networkidle');
          await page.waitForTimeout(3000);

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('button', { name: 'Create Invoice' })
            .click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(3000);

          const invoiceNo = order['Invoice No'];
          const invoiceDate = order['Invoice Date'];
          const irnNo = order['IRN NO'];
          const businessArea = order['Business Area'];
          const totalInvoiceBaseAmount = parseFloat(
            order['Total Invoice Base Amount (Quantity)']
          );
          const hsnSac = order['HSN/SAC'];
          const sac = order['SAC'];
          const choosenFile = order['Choose File'];

          let inputValue = await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__amount')
            .inputValue();

          inputValue = parseFloat(inputValue.replace(/,/g, ''));

          if (inputValue < totalInvoiceBaseAmount) {
            console.log(
              `order no: ${orderNo} amount having amount = ${inputValue} is less than total invoice base amount = ${totalInvoiceBaseAmount}`
            );
            processedOrder.push({
              orderNo: orderNo,
              message: `order no: ${orderNo} amount having amount = ${inputValue} is less than total invoice base amount = ${totalInvoiceBaseAmount}`,
              status: 'skipped',
              timestamp: new Date().toISOString(),
            });
            continue;
          }

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .click();

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .fill(invoiceNo);

          const dateStr = invoiceDate;
          const formatted = dateStr.replace(/-/g, '/');

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('div')
            .filter({ hasText: /^Issue date \*\.\.\.$/ })
            .locator('input') // <-- target the input if present
            .fill(formatted);

          // await page
          //   .locator('iframe[name="main-app-iframe"]')
          //   .contentFrame()
          //   .locator('iframe[name="legacy-frame"]')
          //   .contentFrame()
          //   .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
          //   .click();

          // await page
          //   .locator('iframe[name="main-app-iframe"]')
          //   .contentFrame()
          //   .locator('iframe[name="legacy-frame"]')
          //   .contentFrame()
          //   .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
          //   .fill(irnNo);

          // if (orderIndex == 0)
          //   await page
          //     .locator('iframe[name="main-app-iframe"]')
          //     .contentFrame()
          //     .locator('iframe[name="legacy-frame"]')
          //     .contentFrame()
          //     .getByText(/^Next number:/) // regex, beginning of string
          //     .click();

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .click();

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .fill(businessArea);

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__amount')
            .fill(totalInvoiceBaseAmount.toString());

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .click();

          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_schemeId')
            .selectOption(hsnSac);
          console.log('clicking on additionalItemIdentification_value');
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .fill(sac);
          console.log('clicking on attachment button');
          await page
            .frameLocator('iframe[name="main-app-iframe"]')
            .frameLocator('iframe[name="legacy-frame"]')
            .locator('input[name="attachment"]')
            .setInputFiles(choosenFile);

          await Promise.all([
            // page.waitForLoadState('networkidle'),
            page
              .locator('iframe[name="main-app-iframe"]')
              .contentFrame()
              .locator('iframe[name="legacy-frame"]')
              .contentFrame()
              .getByRole('button', { name: 'Preview' })
              .click(),
          ]);

          console.log('wait is over');
          const errorExists = await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByText(/^Invoice is not valid/i) // regex, starts with "Invoice is not valid"
            .isVisible();

          console.log('errorExists: ', errorExists);

          if (errorExists) {
            const messages = await page
              .locator('iframe[name="main-app-iframe"]')
              .contentFrame()
              .locator('iframe[name="legacy-frame"]')
              .contentFrame()
              .locator('ul.messageContainer li')
              .allTextContents();
            console.log('messageS: ', messages);
            processedOrder.push({
              orderNo: order['Order no'],
              message: `Order have not been successfully processd! Reason :${messages}`,
              status: 'processed',
              timestamp: new Date().toISOString(),
            });
          } else {
            processedOrder.push({
              orderNo: order['Order no'],
              message: 'Order have been successfully processd!',
              status: 'processed',
              timestamp: new Date().toISOString(),
            });
          }
          await page.waitForTimeout(30000 / 2);
        } else {
          console.log(
            `Order ${orderNo} status is "${tdText.trim()}" - skipping`
          );
          processedOrder.push({
            orderNo: order['Order no'],
            message: `Order found but with status ${tdText}`,
            status: 'skipped',
            timestamp: new Date().toISOString(),
          });
          continue;
        }
      } catch (error) {
        console.error(
          `Error processing order ${order['Order no']}:`,
          error.message
        );

        processedOrder.push({
          orderNo: order['Order no'],
          message: 'Error while processing order',
          status: 'error',
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
          console.log('Recovery failed:', recoveryError.message);
          console.log('Critical error - exiting script');
          await browser.close();
          process.exit(1);
        }
      }
    }

    console.log('Processing completed');
    console.log('Browser will stay open. Press Ctrl+C to quit.');
  } catch (error) {
  } finally {
    saveToCSV(CONFIG.processedOrderFile, processedOrder);
    await main();
  }

  await new Promise(() => {});
}
main();
