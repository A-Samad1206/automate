import { chromium } from "playwright";
import { google } from "googleapis";
import fs from "fs";

// --- Load Google Sheets credentials ---
const creds = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));

async function getSheetData(sheetId, range) {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
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
  
  return dataRows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || ''; // Use empty string if cell is undefined
    });
    return obj;
  });
}

async function main() {
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

  // --- Launch Playwright ---
  // const browser = await chromium.launch({ headless: false });
  // const page = await browser.newPage();

  // for (const row of rows) {
  //   const [name, email, phone] = row;

  //   await page.goto("https://testproduct.actuality.live");

  //   // Fill form fields (provide empty string if cell is missing)
  //   await page.fill("#name", name || "");
  //   await page.fill("#email", email || "");
  //   await page.fill("#phone", phone || "");

  //   // Submit the form
  //   await page.click("#submit-btn");

  //   // Optional: wait to avoid rate limits
  //   await page.waitForTimeout(2000);
  // }

  // await browser.close();
}

main().catch((err) => {
  console.error("Error running script:", err);
  process.exit(1);
});
