import { chromium } from 'playwright';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
async function login(page) {
  console.log('=== Starting login process ===');
  await page.goto('https://go.tradeshift.com');
  try {
    await page.click('#cookie-consent-accept-all', { timeout: 3000 });
    console.log('Cookie consent accepted.');
  } catch {
    console.log('Cookie consent button not found — skipping.');
  }
  console.log('Filling username...');
  await page.fill('input[name="j_username"]', 'Nilkanth.sonar@smollan.com');
  console.log('Filling password...');
  await page.fill('input[name="j_password"]', 'Welcome@123');
  console.log('Clicking proceed button...');
  await page.click('button[id="proceed"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('=== Login process completed ===');
}
async function navigateToDocumentManager(page) {
  console.log('=== Navigating to Document Manager ===');
  let navigationSuccess = false;
  let retries = 3;
  while (retries > 0 && !navigationSuccess) {
    try {
      console.log(`Navigating to Document Manager (attempt ${4 - retries}/3)`);
      // Use domcontentloaded instead of networkidle for faster navigation
      await page.goto(
        'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
        {
          waitUntil: 'networkidle',
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
            waitUntil: 'domcontentloaded',
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
const getCSVData = () => {
  console.log('=== Reading CSV data ===');
  const file = fs.readFileSync('data.csv');
  const records = parse(file, {
    columns: true,
    skip_empty_lines: true,
  });
  console.log(`Found ${records.length} records in CSV.`);
  return records;
};
const rows = getCSVData();
if (!rows.length) {
  console.error(
    'No data found. Make sure the sheet is shared with the service account email.'
  );
  process.exit(1);
}
const validRows = rows.every((order) => {
  const invoiceNo = order['Invoice No'];
  const invoiceDate = order['Invoice Date'];
  const irnNo = order['IRN NO'];
  const businessArea = order['Business Area'];
  const totalInvoiceBaseAmount = order['Total Invoice Base Amount (Quantity)'];
  const hsnSac = order['HSN/SAC'];
  const sac = order['SAC'];
  return (
    invoiceNo != undefined &&
    invoiceDate != undefined &&
    irnNo != undefined &&
    businessArea != undefined &&
    totalInvoiceBaseAmount != undefined &&
    hsnSac != undefined &&
    sac != undefined
  );
});
if (!validRows) {
  console.error('Invalid data found in the sheet.');
  process.exit(1);
}
(async () => {
  // const sheetId = '1IZw-bWzeO0UGW2_wmbOHBrGLyLLLWj4xM89jWotg554';
  // const range = 'A1:M5';
  // const rows = await getSheetData(sheetId, range);
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
  for (const orderIndex in rows) {
    const order = rows[orderIndex];
    console.log(`=== Processing order: ${order['Order no']} ===`);
    try {
      // Always navigate to Document Manager at the start of each order
      await navigateToDocumentManager(page);
      const orderNo = order['Order no'];
      const mainFrame = page.frame({ name: 'main-app-iframe' });
      if (!mainFrame) {
        throw new Error('Main iframe not found');
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Filter$/ })
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Filter$/ })
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: ')Filter' })
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole('button', { name: ')Filter' })
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: 'Document Types' })
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole('button', { name: 'Document Types' })
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByText('Unselect all')
          .first()
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByText('Unselect all')
          .first()
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('.invoice.flex-none')
          .check();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.order.flex-none')
          .check();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('.order.flex-none')
          .check();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('button', { name: 'Status' })
          .first()
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole('button', { name: 'Status' })
          .first()
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Unselect all$/ })
          .nth(1)
          .click();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('div')
          .filter({ hasText: /^Unselect all$/ })
          .nth(1)
          .click();
      }
      await page.waitForTimeout(1000);
      try {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('.DELIVERED_RECEIVED.flex-none')
          .check();
      } catch (error) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .locator('.DELIVERED_RECEIVED.flex-none')
          .check();
      }
      await page.waitForTimeout(1000);
      // Clear the search field first, then fill with current order number
      try {
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
      } catch (error) {
        const searchBox = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole('textbox', { name: 'Search' });
        await searchBox.click();
        await searchBox.selectText();
        await searchBox.press('Delete');
        await page.waitForTimeout(500);
        await searchBox.fill(orderNo);
        console.log(`Searching for order: ${orderNo}`);
      }
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
      let tdText = '';
      let link = '';
      try {
        link = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .getByRole('link', { name: orderNo });
        if ((await link.count()) === 0) {
          console.log(`${orderNo}: Order not found in search results`);
          continue;
        }
        await link.waitFor({ state: 'visible', timeout: 15000 });
        const trLocator = link.locator('xpath=ancestor::tr[1]');
        tdText = await trLocator.locator('td').nth(3).innerText();
      } catch (error) {
        link = page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByRole('link', { name: orderNo });
        if ((await link.count()) === 0) {
          console.log(`${orderNo}: Order not found in search results`);
          continue;
        }
        await link.waitFor({ state: 'visible', timeout: 15000 });
        const trLocator = link.locator('xpath=ancestor::tr[1]');
        tdText = await trLocator.locator('td').nth(3).innerText();
      }
      console.log('Status Text: ', tdText);
      console.log(`Status Text: ${tdText}`);
      if (tdText.trim() === 'RECEIVED') {
        console.log('Order status is RECEIVED, creating invoice...');
        await link.click({
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('button', { name: 'Create Invoice' })
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('button', { name: 'Create Invoice' })
            .click();
        }
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        const invoiceNo = order['Invoice No'];
        const invoiceDate = order['Invoice Date'];
        const irnNo = order['IRN NO'];
        const businessArea = order['Business Area'];
        const totalInvoiceBaseAmount =
          order['Total Invoice Base Amount (Quantity)'];
        const hsnSac = order['HSN/SAC'];
        const sac = order['SAC'];
        const choosenFile = order['Choose File'];
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .click();
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .fill(invoiceNo);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Invoice number' })
            .fill(invoiceNo);
        }
        const dateStr = invoiceDate;
        const formatted = dateStr.replace(/-/g, '/');
        console.log(formatted); // "12/05/2025"
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('div')
            .filter({ hasText: /^Issue date \*\.\.\.$/ })
            .locator('input') // <-- target the input if present
            .fill(formatted);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('div')
            .filter({ hasText: /^Issue date \*\.\.\.$/ })
            .locator('input') // <-- target the input if present
            .fill(formatted);
        }
        // try {
        //   const closeBtn = page
        //     .locator('iframe[name="main-app-iframe"]')
        //     .contentFrame()
        //     .getByRole('button', { name: /close/i });
        //   if ((await closeBtn.count()) > 0) {
        //     await closeBtn.click();
        //     await page.waitForTimeout(1000); // allow panel to close fully
        //   } else {
        //     console.log('Close button not found — check selector');
        //   }
        // } catch (error) {
        //   const closeBtn = page
        //     .locator('iframe[name="main-app-iframe"]')
        //     .contentFrame()
        //     .locator('iframe[name="legacy-frame"]')
        //     .contentFrame()
        //     .getByRole('button', { name: /close/i });
        //   if ((await closeBtn.count()) > 0) {
        //     await closeBtn.click();
        //     await page.waitForTimeout(1000); // allow panel to close fully
        //   } else {
        //     console.log('Close button not found — check selector');
        //   }
        // }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
            .click();
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
            .fill(irnNo);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
            .fill(irnNo);
        }
        if (orderIndex == 0) {
          try {
            await page
              .locator('iframe[name="main-app-iframe"]')
              .contentFrame()
              .locator('iframe[name="legacy-frame"]')
              .contentFrame()
              .getByText(/^Next number:/) // matches any text starting with "Next number:"
              .click();
          } catch (error) {
            await page
              .locator('iframe[name="main-app-iframe"]')
              .contentFrame()
              .getByText(/^Next number:/) // matches any text starting with "Next number:"
              .click();
          }
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .click();
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .fill(businessArea);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('textbox', { name: 'Business Area' })
            .fill(businessArea);
        }
        try {
          const amountInput = page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__amount');
          let currentValue = await amountInput.inputValue();

          console.log('Current value in amount input:', currentValue);
          currentValue = parseFloat(currentValue.split(',').join(''));
          totalInvoiceBaseAmount = parseFloat(
            totalInvoiceBaseAmount.split(',').join('')
          );
          if (currentValue < totalInvoiceBaseAmount) {
            console.log(
              'order id',
              order['Order No'],
              'Current value in amount input:',
              currentValue,
              'is less than',
              totalInvoiceBaseAmount
            );
            continue;
          }
          await amountInput.fill(totalInvoiceBaseAmount);
        } catch (error) {
          const amountInput = page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('#lines_0__amount');
          const currentValue = await amountInput.inputValue();
          currentValue = parseFloat(currentValue.split(',').join(''));
          totalInvoiceBaseAmount = parseFloat(
            totalInvoiceBaseAmount.split(',').join('')
          );
          if (currentValue < totalInvoiceBaseAmount) {
            console.log(
              'order id',
              order['Order No'],
              'Current value in amount input:',
              currentValue,
              'is less than',
              totalInvoiceBaseAmount
            );
            continue;
          }
          await amountInput.fill(totalInvoiceBaseAmount);
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_schemeId')
            .selectOption(hsnSac);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_schemeId')
            .selectOption(hsnSac);
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .click();
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .fill(sac);
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('#lines_0__additionalItemIdentification_value')
            .fill(sac);
        }
        try {
          await page
            .frameLocator('iframe[name="main-app-iframe"]')
            .frameLocator('iframe[name="legacy-frame"]')
            .locator('input[name="attachment"]')
            .setInputFiles(choosenFile);
        } catch (error) {
          await page
            .frameLocator('iframe[name="main-app-iframe"]')
            .locator('input[name="attachment"]')
            .setInputFiles(choosenFile);
        }
        await page.waitForTimeout(5000);
        console.log('Form filled - waiting 5 seconds to review...');
        try {
          await page
            .frameLocator('iframe[name="main-app-iframe"]')
            .frameLocator('iframe[name="legacy-frame"]')
            .locator('#preview')
            .click();
        } catch (error) {
          await page
            .frameLocator('iframe[name="main-app-iframe"]')
            .locator('#preview')
            .click();
        }
        try {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .locator('iframe[name="legacy-frame"]')
            .contentFrame()
            .getByRole('button', { name: 'o Save as draft' })
            .click();
        } catch (error) {
          await page
            .locator('iframe[name="main-app-iframe"]')
            .contentFrame()
            .getByRole('button', { name: 'o Save as draft' })
            .click();
        }
        // await page.locator('iframe[name="main-app-iframe"]').contentFrame().locator('iframe[name="legacy-frame"]').contentFrame().locator('#tradeshiftBody').click();
        // await page.locator('iframe[name="main-app-iframe"]').contentFrame().locator('iframe[name="legacy-frame"]').contentFrame().getByRole('button', { name: 'Send' }).click();
        await page.waitForTimeout(30000 / 2);
        // await previewButton.click();
        console.log('=== Invoice created and saved as draft ===');
        // Navigate back to Document Manager for next iteration
        console.log('Navigating back to Document Manager...');
        page = await context.newPage();
        await navigateToDocumentManager(page);
      } else {
        console.log(`Order ${orderNo} status is "${tdText.trim()}" - skipping`);
        continue;
      }
    } catch (error) {
      console.error(
        `Error processing order ${order['Order no']}:`,
        error.message
      );
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
  console.log('=== Processing completed ===');
  console.log('Browser will stay open. Press Ctrl+C to quit.');
  await new Promise(() => {});
})();
