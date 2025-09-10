import puppeteer from 'puppeteer';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

// DOM logging utility
async function logDOM(page, frame, selector = null) {
  try {
    const frameContext = frame || page;
    let elementInfo = 'No selector provided';
    
    if (selector) {
      const element = await frameContext.$(selector);
      if (element) {
        elementInfo = await frameContext.evaluate(el => {
          return {
            tagName: el.tagName,
            id: el.id,
            class: el.className,
            text: el.innerText?.substring(0, 100) + (el.innerText?.length > 100 ? '...' : ''),
            isVisible: el.offsetParent !== null
          };
        }, element);
      } else {
        elementInfo = `Element not found with selector: ${selector}`;
      }
    }
    
    const url = await page.url();
    console.log('\n--- DOM State ---');
    console.log(`URL: ${url}`);
    console.log('Element Info:', JSON.stringify(elementInfo, null, 2));
    console.log('--- End DOM State ---\n');
    
    return true;
  } catch (error) {
    console.error('Error logging DOM:', error);
    return false;
  }
}

// Verify element exists and is visible
async function verifyElement(frame, selector, action = 'find') {
  try {
    const element = await frame.$(selector);
    if (!element) {
      console.error(`❌ Failed to ${action}: Element not found with selector: ${selector}`);
      return false;
    }
    
    const isVisible = await frame.evaluate(el => {
      return el.offsetParent !== null && 
             !el.hidden && 
             el.style.display !== 'none' && 
             el.style.visibility !== 'hidden';
    }, element);
    
    if (!isVisible) {
      console.error(`❌ Element found but not visible: ${selector}`);
      return false;
    }
    
    console.log(`✅ Successfully found and verified element: ${selector}`);
    return true;
  } catch (error) {
    console.error(`❌ Error verifying element ${selector}:`, error.message);
    return false;
  }
}

async function getCSVData() {
  const file = fs.readFileSync('data.csv');
  return parse(file, { columns: true, skip_empty_lines: true });
}

// --- Helper to get fresh frames every iteration ---
async function getFrames(page) {
  console.log('Getting frames...');
  try {
    const mainFrameHandle = await page.$('iframe[name="main-app-iframe"]');
    if (!mainFrameHandle) throw new Error('Main app iframe not found');
    
    const mainFrame = await mainFrameHandle.contentFrame();
    await logDOM(mainFrame, null, 'body');
    
    const legacyFrameHandle = await mainFrame.$('iframe[name="legacy-frame"]');
    if (!legacyFrameHandle) throw new Error('Legacy frame not found');
    
    const legacyFrame = await legacyFrameHandle.contentFrame();
    await logDOM(legacyFrame, null, 'body');
    
    console.log('Frames loaded successfully');
    return { mainFrame, legacyFrame };
  } catch (error) {
    console.error('Error getting frames:', error);
    throw error;
  }
}

async function login(page) {
  console.log('Navigating to login page...');
  await page.goto('https://go.tradeshift.com', { waitUntil: 'networkidle2' });
  await logDOM(page, null, 'body');

  try {
    console.log('Checking for cookie consent...');
    await verifyElement(page, '#cookie-consent-accept-all');
    await page.click('#cookie-consent-accept-all', { timeout: 3000 });
    console.log('Cookie consent accepted.');
    await logDOM(page, null, 'body');
  } catch (error) {
    console.log('Cookie consent button not found — skipping.');
  }

  console.log('Filling login form...');
  await verifyElement(page, 'input[name="j_username"]', 'find username field');
  await page.type('input[name="j_username"]', 'Nilkanth.sonar@smollan.com');
  
  await verifyElement(page, 'input[name="j_password"]', 'find password field');
  await page.type('input[name="j_password"]', 'Welcome@123');
  
  await verifyElement(page, 'button[id="proceed"]', 'find login button');
  await logDOM(page, null, 'form');
  
  console.log('Submitting login form...');
  await page.click('button[id="proceed"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await logDOM(page, null, 'body');
  console.log('Login successful');
}

async function navigateToDocumentManager(page) {
  let retries = 3;
  while (retries > 0) {
    try {
      console.log(`\n--- Attempt ${4 - retries}/3: Navigating to Document Manager ---`);
      
      // Navigate to the page
      await page.goto(
        'https://go.tradeshift.com/#/Tradeshift.DocumentManager',
        {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        }
      );
      await logDOM(page, null, 'body');

      // Wait for and verify main iframe
      console.log('Waiting for main app iframe...');
      await verifyElement(page, 'iframe[name="main-app-iframe"]', 'find main app iframe');
      const mainFrameHandle = await page.$('iframe[name="main-app-iframe"]');
      const mainFrame = await mainFrameHandle.contentFrame();
      
      // Log main frame content
      await logDOM(mainFrame, null, 'body');

      // Verify filter button
      console.log('Verifying filter button...');
      const filterButtonSelector = 'button:has-text(")Filter")';
      await verifyElement(mainFrame, filterButtonSelector, 'find filter button');
      
      // Verify search input
      console.log('Verifying search input...');
      const searchInputSelector = 'input[role="textbox"][name="Search"]';
      await verifyElement(mainFrame, searchInputSelector, 'find search input');

      console.log('✅ Navigation to Document Manager successful');
      return mainFrame;
    } catch (err) {
      console.error(`❌ Navigation failed (${retries} retries left):`, err.message);
      
      // Take screenshot on error
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({ path: `error-${timestamp}.png`, fullPage: true });
      console.log(`Screenshot saved as error-${timestamp}.png`);
      
      retries--;
      if (retries === 0) {
        console.error('❌ All navigation attempts failed');
        throw new Error('Failed to navigate to Document Manager');
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

(async () => {
  const rows = await getCSVData();
  if (!rows.length) {
    console.error('No data found.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome', // path to Chrome/Chromium on your system
    defaultViewport: null,
    args: ['--start-maximized', '--start-fullscreen'],
  });

  let page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await login(page);

  for (const order of rows) {
    try {
      const mainFrame = await navigateToDocumentManager(page);

      const orderNo = order['Order no'];
      console.log(`Processing order: ${orderNo}`);

      // --- Refresh frames ---
      const { legacyFrame } = await getFrames(page);

      // Click filters
      await mainFrame.click('button:has-text(")Filter")');
      await mainFrame.waitForTimeout(1000);
      await mainFrame.click('button:has-text("Document Types")');
      await mainFrame.waitForTimeout(500);
      await mainFrame.click('text="Unselect all"');
      await mainFrame.waitForTimeout(500);
      await mainFrame.click('.invoice.flex-none');
      await mainFrame.click('.order.flex-none');
      await mainFrame.click('button:has-text("Status")');
      await mainFrame.click('div:has-text("Unselect all")');
      await mainFrame.click('.DELIVERED_RECEIVED.flex-none');

      // Search for order
      const searchBox = await mainFrame.$(
        'input[role="textbox"][name="Search"]'
      );
      await searchBox.click({ clickCount: 3 });
      await searchBox.press('Backspace');
      await searchBox.type(orderNo);
      console.log(`Searching for order: ${orderNo}`);

      const link = await mainFrame.$(`a:has-text("${orderNo}")`);
      if (!link) {
        console.log(`${orderNo}: Order not found`);
        continue;
      }

      const tr = await link.evaluateHandle((el) => el.closest('tr'));
      const tdText = await (
        await tr.$$('td')
      )[3].evaluate((el) => el.innerText.trim());
      console.log('Status Text: ', tdText);

      if (tdText === 'RECEIVED') {
        await link.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Refresh frames before interacting
        const { legacyFrame: lf } = await getFrames(page);

        await lf.waitForSelector('button:has-text("Create Invoice")', {
          timeout: 15000,
        });
        await lf.click('button:has-text("Create Invoice")');

        // Fill form fields
        await lf.type(
          'input[role="textbox"][name="Invoice number"]',
          order['Invoice No']
        );
        const formattedDate = order['Invoice Date'].replace(/-/g, '/');
        await lf.type('div:has-text("Issue date *...") input', formattedDate);
        await lf.type(
          'input[role="textbox"][name="IRN (Invoice Reference Number)"]',
          order['IRN NO']
        );
        await lf.type(
          'input[role="textbox"][name="Business Area"]',
          order['Business Area']
        );

        // Amount check
        const amountInput = await lf.$('#lines_0__amount');
        const currentValue = await lf.evaluate((el) => el.value, amountInput);
        if (
          parseInt(currentValue) <
          parseInt(order['Total Invoice Base Amount (Quantity)'])
        ) {
          console.log(
            `Order ${orderNo} current amount ${currentValue} < total. Skipping`
          );
          continue;
        }
        await amountInput.click({ clickCount: 3 });
        await amountInput.type(order['Total Invoice Base Amount (Quantity)']);

        await lf.select(
          '#lines_0__additionalItemIdentification_schemeId',
          order['HSN/SAC']
        );
        await lf.type(
          '#lines_0__additionalItemIdentification_value',
          order['SAC']
        );

        await lf.$eval(
          'input[name="attachment"]',
          (el, file) => (el.files = file),
          order['Choose File']
        );

        console.log('Form filled - waiting 5 seconds to review...');
        await lf.click('#preview');
        await lf.click('button:has-text("o Save as draft")');

        console.log('Navigating back to Document Manager...');
        await page.goBack({ waitUntil: 'networkidle2' });
        await page.goBack({ waitUntil: 'networkidle2' });
      } else {
        console.log(`Order ${orderNo} status is "${tdText}" - skipping`);
        continue;
      }
    } catch (err) {
      console.error(
        `Error processing order ${order['Order no']}:`,
        err.message
      );
      console.log('Attempting recovery...');
      await page.close();
      page = await browser.newPage();
      await login(page);
    }
  }

  console.log('Processing completed. Browser stays open.');
})();
