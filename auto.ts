import { chromium, type Page } from 'playwright';
import { google } from 'googleapis';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

console.log('0: Starting script execution');

// --- Load Google Sheets credentials ---

async function login(page: Page) {
  console.log('18: Entering login function');
  await page.goto('https://go.tradeshift.com');
  console.log('19: Navigated to Tradeshift login page');
  try {
    await page.click('#cookie-consent-accept-all', { timeout: 3000 });
    console.log('20: Cookie consent accepted');
  } catch {
    console.log('21: Cookie consent button not found — skipping');
  }

  await page.fill('input[name="j_username"]', 'Nilkanth.sonar@smollan.com');
  console.log('22: Username filled');
  await page.fill('input[name="j_password"]', 'Welcome@123');
  console.log('23: Password filled');
  await page.click('button[id="proceed"]');
  console.log('24: Login button clicked');
  await page.waitForLoadState('networkidle');
  console.log('25: Network idle state reached after login');
  await page.waitForTimeout(3000);
  console.log('26: Waited 3 seconds after login');
}

async function navigateToDocumentManager(page: Page) {
  console.log('27: Entering navigateToDocumentManager function');
  let navigationSuccess = false;
  console.log('28: Navigation success flag initialized to false');
  let retries = 3;
  console.log('29: Navigation retries set to 3');

  while (retries > 0 && !navigationSuccess) {
    try {
      console.log(
        `30: Navigating to Document Manager (attempt ${4 - retries}/3)`
      );

      // Use domcontentloaded instead of networkidle for faster navigation
      await page.goto(
        'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
        {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        }
      );
      console.log('31: Navigation to Document Manager URL attempted');

      // Wait for critical elements to ensure page is loaded
      await page.waitForSelector('iframe[name="main-app-iframe"]', {
        timeout: 20000,
      });
      console.log('32: Main iframe selector found');

      // Use contentFrame() method for more reliable frame access
      const mainFrame = page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame();
      console.log('33: Main frame content accessed');

      // Wait for the filter button specifically as it indicates the page is ready
      await mainFrame.getByRole('button', { name: ')Filter' }).waitFor({
        state: 'visible',
        timeout: 20000,
      });
      console.log('34: Filter button is visible');

      // Additional check to ensure the search functionality is available
      await mainFrame.getByRole('textbox', { name: 'Search' }).waitFor({
        state: 'visible',
        timeout: 15000,
      });
      console.log('35: Search textbox is visible');

      navigationSuccess = true;
      console.log('36: Navigation to Document Manager successful');
      await page.waitForTimeout(1000);
      console.log('37: Waited 1 second after successful navigation');
    } catch (navError: any) {
      console.log(`38: Navigation failed: ${navError.message}`);
      retries--;
      if (retries === 0) {
        console.log('39: All navigation attempts failed, trying page reload');
        try {
          await page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          console.log('40: Page reload completed');
          await page.waitForTimeout(2000);
          console.log('41: Waited 2 seconds after reload');
          // Try one more time after reload
          await page.goto(
            'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
            {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            }
          );
          console.log('42: Navigation attempt after reload');
          await page.waitForSelector('iframe[name="main-app-iframe"]', {
            timeout: 20000,
          });
          console.log('43: Main iframe found after reload navigation');
          navigationSuccess = true;
          console.log('44: Navigation successful after reload');
        } catch (reloadError: any) {
          console.log('45: Reload navigation failed');
          throw new Error(
            `Failed to navigate to Document Manager: ${reloadError.message}`
          );
        }
      } else {
        console.log('46: Waiting 2 seconds before next navigation attempt');
        await page.waitForTimeout(2000);
      }
    }
  }
}

const getCSVData = () => {
  console.log('47: Entering getCSVData function');
  const file = fs.readFileSync('data.csv');
  console.log('48: CSV file read from filesystem');
  const records = parse(file, {
    columns: true, // converts to array of objects
    skip_empty_lines: true,
  });
  console.log('49: CSV data parsed into records');
  return records;
};

type TOrder = {
  'S. No.': string;
  'Order no': string;
  'Invoice No': string;
  'Invoice Date': string;
  'IRN NO': string;
  'Business Area': string;
  'Total Invoice Base Amount (Quantity)': string;
  CGST: string;
  SGST: string;
  'Total Invoice Amount': string;
  'HSN/SAC': string;
  SAC: string;
  'Choose File': string;
};

type ProcessingResult = {
  orderNo: string;
  status: 'success' | 'failed';
  error?: string;
};

async function processOrder(
  page: Page,
  order: TOrder,
  orderIndex: number,
  context: any,
  browser: any
): Promise<ProcessingResult> {
  console.log(`61: Starting processing for order index: ${orderIndex}`);
  console.log(`62: Order object retrieved for index ${orderIndex}`);
  console.log(`63: Processing order: ${order['Order no']}`);

  try {
    // Always navigate to Document Manager at the start of each order
    await navigateToDocumentManager(page);
    console.log('64: Navigation to Document Manager completed');
    const orderNo = order['Order no'];
    console.log(`65: Order number extracted: ${orderNo}`);

    const mainFrame = page.frame({ name: 'main-app-iframe' });
    console.log('66: Main frame reference obtained');
    if (!mainFrame) {
      console.log('67: Main iframe not found');
      throw new Error('Main iframe not found');
    }
    await page.waitForTimeout(1000);
    console.log('68: Waited 1 second after frame check');

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('div')
      .filter({ hasText: /^Filter$/ })
      .click();
    console.log('69: Filter div clicked');
    await page.waitForTimeout(1000);
    console.log('70: Waited 1 second after filter click');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole('button', { name: ')Filter' })
      .click();
    console.log('71: Filter button clicked');
    await page.waitForTimeout(1000);
    console.log('72: Waited 1 second after filter button click');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole('button', { name: 'Document Types' })
      .click();
    console.log('73: Document Types button clicked');
    await page.waitForTimeout(1000);
    console.log('74: Waited 1 second after document types click');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('.invoice.flex-none')
      .check();
    console.log('75: Invoice checkbox checked');
    await page.waitForTimeout(1000);
    console.log('76: Waited 1 second after invoice checkbox');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByText('Unselect all')
      .first()
      .click();
    console.log('77: Unselect all clicked');
    await page.waitForTimeout(1000);
    console.log('78: Waited 1 second after unselect all');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('.invoice.flex-none')
      .check();
    console.log('79: Invoice checkbox checked again');
    await page.waitForTimeout(1000);
    console.log('80: Waited 1 second after second invoice checkbox');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('.order.flex-none')
      .check();
    console.log('81: Order checkbox checked');
    await page.waitForTimeout(1000);
    console.log('82: Waited 1 second after order checkbox');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole('button', { name: 'Status' })
      .first()
      .click();
    console.log('83: Status button clicked');
    await page.waitForTimeout(1000);
    console.log('84: Waited 1 second after status button click');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('div')
      .filter({ hasText: /^Unselect all$/ })
      .nth(1)
      .click();
    console.log('85: Second unselect all clicked');
    await page.waitForTimeout(1000);
    console.log('86: Waited 1 second after second unselect all');
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator('.DELIVERED_RECEIVED.flex-none')
      .check();
    console.log('87: DELIVERED_RECEIVED checkbox checked');
    await page.waitForTimeout(1000);
    console.log('88: Waited 1 second after status checkbox');

    // Clear the search field first, then fill with current order number
    const searchBox = page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole('textbox', { name: 'Search' });
    console.log('89: Search box located');

    await searchBox.click();
    console.log('90: Search box clicked');
    await searchBox.selectText();
    console.log('91: Text in search box selected');
    await searchBox.press('Delete');
    console.log('92: Delete key pressed to clear search box');
    await page.waitForTimeout(500);
    console.log('93: Waited 0.5 seconds after clearing search');
    await searchBox.fill(orderNo);
    console.log(`94: Order number ${orderNo} filled in search box`);
    console.log(`95: Searching for order: ${orderNo}`);

    await page.waitForTimeout(5000);
    console.log('96: Waited 5 seconds after search');

    const link = page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole('link', { name: orderNo });
    console.log('97: Order link located');

    if ((await link.count()) === 0) {
      console.log(`98: ${orderNo}: Order not found in search results`);
      throw new Error(`98: ${orderNo}: Order not found in search results`);
    }
    console.log('99: Order link found in search results');

    await link.waitFor({ state: 'visible', timeout: 15000 });
    console.log('100: Order link is visible');
    const trLocator = link.locator('xpath=ancestor::tr[1]');
    console.log('101: Table row located for order');
    const tdText = await trLocator.locator('td').nth(3).innerText();
    console.log('102: Status text retrieved from table');
    console.log('103: Status Text: ', tdText);

    if (tdText.trim() === 'RECEIVED') {
      console.log('104: Order status is RECEIVED - proceeding');
      await link.click({
        timeout: 30000,
      });
      console.log('105: Order link clicked');
      await page.waitForLoadState('networkidle');
      console.log('106: Network idle after order click');
      await page.waitForTimeout(3000);
      console.log('107: Waited 3 seconds after order page load');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('button', { name: 'Create Invoice' })
        .click();
      console.log('108: Create Invoice button clicked');
      await page.waitForLoadState('networkidle');
      console.log('109: Network idle after create invoice click');
      await page.waitForTimeout(3000);
      console.log('110: Waited 3 seconds after invoice creation');

      const invoiceNo = order['Invoice No'];
      console.log(`111: Invoice No: ${invoiceNo}`);
      const invoiceDate = order['Invoice Date'];
      console.log(`112: Invoice Date: ${invoiceDate}`);
      const irnNo = order['IRN NO'];
      console.log(`113: IRN NO: ${irnNo}`);
      const businessArea = order['Business Area'];
      console.log(`114: Business Area: ${businessArea}`);
      const totalInvoiceBaseAmount =
        order['Total Invoice Base Amount (Quantity)'];
      console.log(`115: Total Invoice Base Amount: ${totalInvoiceBaseAmount}`);
      const hsnSac = order['HSN/SAC'];
      console.log(`116: HSN/SAC: ${hsnSac}`);
      const sac = order['SAC'];
      console.log(`117: SAC: ${sac}`);
      const choosenFile = order['Choose File'];
      console.log(`118: File to choose: ${choosenFile}`);
      const currentValue = await page
        .frameLocator('iframe[name="main-app-iframe"]')
        .frameLocator('iframe[name="legacy-frame"]')
        .locator('#lines_0__amount')
        .inputValue();
      console.log('129.2: Current value retrieved');

      if (parseInt(currentValue) < parseInt(totalInvoiceBaseAmount)) {
        console.log(
          `Order No: ${orderNo} Current value ${currentValue} is less than total invoice base amount ${totalInvoiceBaseAmount}`
        );
        throw new Error(
          `Order No: ${orderNo} Current value ${currentValue} is less than total invoice base amount ${totalInvoiceBaseAmount}`
        );
      }

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'Invoice number' })
        .click();
      console.log('119: Invoice number textbox clicked');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'Invoice number' })
        .fill(invoiceNo);
      console.log('120: Invoice number filled');

      const dateStr = invoiceDate;
      console.log(`121: Original date string: ${dateStr}`);
      const formatted = dateStr.replace(/-/g, '/');
      console.log(`122: Formatted date: ${formatted}`);

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('div')
        .filter({ hasText: /^Issue date \*\.\.\.$/ })
        .locator('input') // <-- target the input if present
        .fill(formatted);
      console.log('123: Issue date filled');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('div')
        .filter({ hasText: /^Issue date \*\.\.\.$/ })
        .getByRole('button')
        .click();
      console.log('124: Issue date button clicked');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
        .click();
      console.log('125: IRN textbox clicked');
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
        .fill(irnNo);
      console.log('126: IRN number filled');

      if (orderIndex == 0) {
        await page
          .locator('iframe[name="main-app-iframe"]')
          .contentFrame()
          .locator('iframe[name="legacy-frame"]')
          .contentFrame()
          .getByText(/Next number: .*/)
          .click();
        console.log('127: Next number text clicked (first order only)');
      }
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'Business Area' })
        .click();
      console.log('128: POS textbox clicked');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('textbox', { name: 'Business Area' })
        .fill(businessArea);
      console.log('129: POS filled with business area');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('#lines_0__amount')
        .fill(totalInvoiceBaseAmount);
      console.log('130: Total invoice amount filled');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('#lines_0__additionalItemIdentification_schemeId')
        .selectOption(hsnSac);
      console.log('131: HSN/SAC scheme selected');
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('#lines_0__additionalItemIdentification_value')
        .click();
      console.log('132: Additional item identification value clicked');

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator('#lines_0__additionalItemIdentification_value')
        .fill(sac);
      console.log('133: SAC value filled');
      await page
        .frameLocator('iframe[name="main-app-iframe"]')
        .frameLocator('iframe[name="legacy-frame"]')
        .locator('input[name="attachment"]')
        .setInputFiles(choosenFile);
      console.log('134: File attached');
      await page.waitForTimeout(5000);
      console.log('135: Waited 5 seconds after file attachment');

      console.log('136: Form filled - waiting 5 seconds to review...');

      await page
        .frameLocator('iframe[name="main-app-iframe"]')
        .frameLocator('iframe[name="legacy-frame"]')
        .locator('#preview')
        .click();
      console.log('137: Preview button clicked');
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole('button', { name: 'o Save as draft' })
        .click();
      console.log('138: Save as draft button clicked');

      await page.waitForTimeout(15000);
      console.log('139: Waited 15 seconds after save');

      return {
        orderNo: orderNo,
        status: 'success' as const,
      };
    } else {
      console.log(
        `143: Order ${orderNo} status is "${tdText.trim()}" - skipping`
      );
      throw new Error(
        `143: Order ${orderNo} status is "${tdText.trim()}" - skipping`
      );
    }
  } catch (error: any) {
    console.log('144: Error caught in order processing');
    console.error(
      `145: Error processing order ${order['Order no']}:`,
      error.message
    );

    return {
      orderNo: order['Order no'],
      status: 'failed' as const,
      error: error.message,
    };
  }
}

async function processOrdersRecursively(
  page: Page,
  orders: TOrder[],
  context: any,
  browser: any,
  maxRetries: number = 3
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];
  const pendingOrders: TOrder[] = [...orders];
  let retryCount = 0;

  while (pendingOrders.length > 0 && retryCount < maxRetries) {
    console.log(
      `\n=== Processing batch - Attempt ${retryCount + 1}/${maxRetries} ===`
    );
    console.log(`Pending orders: ${pendingOrders.length}`);

    const batchResults = await Promise.allSettled(
      pendingOrders.map((order, index) =>
        processOrder(page, order, index, context, browser)
      )
    );

    // Process results
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const order = pendingOrders[i];

      if (result.status === 'fulfilled') {
        results.push(result.value);
        // Remove successfully processed orders from pending list
        pendingOrders.splice(i, 1);
        i--; // Adjust index after removal
      } else {
        console.error(
          `Failed to process order ${order['Order no']}:`,
          result.reason
        );
        results.push({
          orderNo: order['Order no'],
          status: 'failed',
          error: result.reason.message,
        });
      }
    }

    retryCount++;

    // If there are still pending orders, wait before retry
    if (pendingOrders.length > 0 && retryCount < maxRetries) {
      console.log(`\nWaiting 10 seconds before retry ${retryCount + 1}...`);
      await page.waitForTimeout(10000);

      // Refresh page and login again for fresh session
      try {
        await context.close();
        context = await browser.newContext({ viewport: null });
        page = await context.newPage();
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);
        await login(page);
      } catch (recoveryError: any) {
        console.log('Recovery failed:', recoveryError.message);
      }
    }
  }

  // Add any remaining orders as failed
  pendingOrders.forEach((order) => {
    results.push({
      orderNo: order['Order no'],
      status: 'failed',
      error: 'Max retries exceeded',
    });
  });

  return results;
}

(async () => {
  console.log('50: Starting main async function');
  const rows = getCSVData() as unknown as TOrder[];
  console.log('51: CSV data retrieved');

  if (!rows.length) {
    console.log('52: No data found in rows');
    console.error('53: No data found in CSV file.');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--start-fullscreen'],
  });
  console.log('54: Browser launched');

  let context = await browser.newContext({ viewport: null });
  console.log('55: Browser context created');

  let page = await context.newPage();
  console.log('56: New page created');

  page.setDefaultTimeout(60000);
  console.log('57: Default timeout set to 60 seconds');
  page.setDefaultNavigationTimeout(60000);
  console.log('58: Default navigation timeout set to 60 seconds');

  await login(page);
  console.log('59: Login completed');

  // Process all orders recursively
  const results = await processOrdersRecursively(page, rows, context, browser);

  // Print summary
  console.log('\n=== PROCESSING SUMMARY ===');
  const successful = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'failed');

  console.log(`Total orders: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed orders:');
    failed.forEach((result, index) => {
      console.log(`${index + 1}. Order ${result.orderNo}: ${result.error}`);
    });
  }

  console.log('157: Processing completed');
  console.log('158: Browser will stay open. Press Ctrl+C to quit.');

  await new Promise(() => {});
  console.log('159: Promise created to keep browser open');
})();
