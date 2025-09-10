// install first: npm i -D playwright

import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false }); // headless: true to hide browser
  async () => {
    const page = await browser.newPage();
    await page.goto('https://google.com');

    const title = await page.title();
    console.log('Page title:', title);
  };
  async () => {
    const page = await browser.newPage();
    await page.goto('https://google.com');

    const title = await page.title();
    console.log('Page title:', title);
  };
  await new Promise(() => {});

  //   await browser.close();
})();
