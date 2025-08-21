import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch({ headless: false }); // set to true for headless
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, // set screen size
  });
  const page = await context.newPage();

  await page.goto("https://testproduct.actuality.live/auth/login");
  await page.getByRole("textbox", { name: "Email" }).click();
  await page
    .getByRole("textbox", { name: "Email" })
    .fill("super_admin1@email.com");
  await page.getByRole("textbox", { name: "Email" }).press("Tab");
  await page.getByRole("textbox", { name: "Password" }).fill("Pwd@1234");
  await page.getByRole("button", { name: "Login" }).click();

  await page.waitForLoadState("networkidle");
  //   await page.goto("https://testproduct.actuality.live/app/orgs/xt58eB");
  await page.getByRole("button", { name: "RFP Response" }).click();
  await page.getByText("+").click();
  await page.getByRole("textbox", { name: "Name" }).click();
  await page.getByRole("textbox", { name: "Name" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("IST 1024");
  await page.getByRole("textbox", { name: "Name" }).press("Enter");
  await page.getByRole("button", { name: "Create" }).click();

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Upload Docs" }).click();
  await page
    .getByRole("button", { name: "Upload Docs" })
    .setInputFiles("Roots RFP.pdf");
  await page.locator(".w-full.flex-1.scrollbar-thin").click();
})();
