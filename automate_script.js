import { chromium } from "playwright";
import { google } from "googleapis";
import fs from "fs";

// --- Load Google Sheets credentials ---
const creds = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));

async function getSheetData(sheetId, range) {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return res.data.values || [];
}

function convertToObjects(rows) {
  if (rows.length === 0) return [];

  const headers = rows[0]; // First row contains headers
  const dataRows = rows.slice(1); // Remaining rows contain data

  return dataRows.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || ""; // Use empty string if cell is undefined
    });
    return obj;
  });
}

(async () => {
  const sheetId = "1IZw-bWzeO0UGW2_wmbOHBrGLyLLLWj4xM89jWotg554";
  const range = "A1:M4"; // Include header row (A1) and data rows

  const rows = await getSheetData(sheetId, range);
  if (!rows.length) {
    console.error(
      "No data found. Make sure the sheet is shared with the service account email."
    );
    process.exit(1);
  }

  console.log("Raw rows from Google Sheets:", rows);

  // Convert to objects with column names as keys
  const dataObjects = convertToObjects(rows);
  console.log("Converted to objects:", JSON.stringify(dataObjects, null, 2));

  const browser = await chromium.launch({ headless: false }); // set to true for headless
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, // set screen size
  });
  const page = await context.newPage();

  await page.goto("https://go.tradeshift.com"); // replace with your actual URL
  try {
    await page.click("#cookie-consent-accept-all", { timeout: 3000 });
    console.log("Cookie consent accepted.");
  } catch {
    console.log("Cookie consent button not found — skipping.");
  }
  await page.fill('input[name="j_username"]', "Nilkanth.sonar@smollan.com"); // adjust selector if needed
  await page.fill('input[name="j_password"]', "Welcome@123"); // adjust selector if needed
  await page.click('button[id="proceed"]'); // or use proper selector for submit

  // Wait for navigation or success message (optional)
  await page.waitForTimeout(3000);

  const docIds = [];
  // Wait for the page to load completely
  await page.waitForLoadState("networkidle");
  for (const order of [dataObjects[0]]) {
    await page.goto("https://go.tradeshift.com/#/Tradeshift.DocumentManager"); // replace with your actual URL
    const orderNo = order["Order no"];

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: ")Filter" })
      .click();
    await page.waitForTimeout(100);

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: "Document Types" })
      .click();
    await page.waitForTimeout(100);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByText("Unselect all")
      .first()
      .click();
    await page.waitForTimeout(100);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".invoice.flex-none")
      .check();
    await page.waitForTimeout(100);
    await page.waitForTimeout(100);

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".order.flex-none")
      .check();
    await page.waitForTimeout(100);

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: "Status" })
      .first()
      .click();
    await page.waitForTimeout(100);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".DELIVERED_RECEIVED.flex-none")
      .uncheck();
    await page.waitForTimeout(100);
    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .locator(".DELIVERED_RECEIVED.flex-none")
      .check();
    await page.waitForTimeout(100);

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("button", { name: ")Filter" })
      .click();
    await page.waitForTimeout(100);

    await page
      .locator('iframe[name="main-app-iframe"]')
      .contentFrame()
      .getByRole("textbox", { name: "Search" })
      .fill(orderNo);

    await page.waitForTimeout(3000);

    const frame = page.locator('iframe[name="main-app-iframe"]').contentFrame();
    const link = frame.getByRole("link", { name: orderNo });

    if ((await link.count()) === 0) {
      console.log(invoiceNo, ": This order not found");
      continue;
    }

    // ensure link is visible before interacting
    await link.waitFor({ state: "visible", timeout: 10000 });

    // Find the <tr> containing the link
    const trLocator = link.locator("xpath=ancestor::tr[1]");

    // Get text of the 4th <td> (0-based index)
    const tdText = await trLocator.locator("td").nth(3).innerText();
    console.log("Status Text: ", tdText);

    if (tdText.trim() === "RECEIVED") {
      await link.click();

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("button", { name: "Create Invoice" })
        .click();

      const invoiceNo = order["Invoice No"];
      const invoiceDate = order["Invoice Date"];
      const irnNo = order["IRN NO"];
      const businessArea = order["Business Area"];
      const totalInvoiceBaseAmount =
        order["Total Invoice Base Amount (Quantity)"];
      const cgst = order["CGST"];
      const sgst = order["SGST"];
      const totalInvoiceAmount = order["Total Invoice Amount"];
      const hsnSac = order["HSN/SAC"];
      const sac = order["SAC"];
      const chooseFile = order["Choose File"];

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "Invoice number" })
        .click();

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "Invoice number" })
        .fill(invoiceNo);

      const dateStr = invoiceDate;
      const formatted = dateStr.replace(/-/g, "/");
      console.log(formatted); // "12/05/2025"

      const legacyFrame = page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame();

      await legacyFrame
        .locator("div")
        .filter({ hasText: /^Issue date \*\.\.\.$/ })
        .locator("input") // <-- target the input if present
        .fill(formatted);

      const frame3 = page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame();

      // Try common selectors for the close button
      const closeBtn = frame3.getByRole("button", { name: /close/i });
      if ((await closeBtn.count()) > 0) {
        await closeBtn.click();
        await page.waitForTimeout(1000); // allow panel to close fully
      } else {
        console.log("Close button not found — check selector");
      }
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "IRN (Invoice Reference Number)" })
        .click();
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "IRN (Invoice Reference Number)" })
        .fill(irnNo);

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "POS (Place of supply)" })
        .click();
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .getByRole("textbox", { name: "POS (Place of supply)" })
        .fill(businessArea);

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator("#lines_0__amount")
        .fill(totalInvoiceBaseAmount);

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator("#lines_0__additionalItemIdentification_schemeId")
        .selectOption(hsnSac);
      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator("#lines_0__additionalItemIdentification_value")
        .click();

      await page
        .locator('iframe[name="main-app-iframe"]')
        .contentFrame()
        .locator('iframe[name="legacy-frame"]')
        .contentFrame()
        .locator("#lines_0__additionalItemIdentification_value")
        .fill(sac);

      console.log('The 4th TD contains "Recieved"');
    } else {
      console.log(`The Status Column text is: "${tdText}"`);
      continue;
    }
  }

  console.log("docIds", docIds);

  console.log("Browser will stay open. Press Ctrl+C to quit.");

  await new Promise(() => {});
})();
