import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://go.tradeshift.com/?currentScreen=0');
  await page.getByRole('button', { name: 'Accept All' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).click();
  await page
    .getByRole('textbox', { name: 'Email address' })
    .fill('Nilkanth.sonar@smollan.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('Welcome@123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Document Manager Document' }).click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .getByRole('link', { name: 'PO16484445' })
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('button', { name: 'Create Invoice' })
    .click();
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
    .fill('scsddes');
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByText('Next number: POSM-MH2526-')
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('textbox', { name: 'Issue date *' })
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('link', { name: '2', exact: true })
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('textbox', { name: 'POS (Place of supply)' })
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('textbox', { name: 'POS (Place of supply)' })
    .fill('POS');
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .getByRole('textbox', { name: 'IRN (Invoice Reference Number)' })
    .fill('IRN');
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
    .fill('BA');
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .locator('#lines_0__amount')
    .click();
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .locator('#lines_0__amount')
    .fill('123');
  await page
    .locator('iframe[name="main-app-iframe"]')
    .contentFrame()
    .locator('iframe[name="legacy-frame"]')
    .contentFrame()
    .locator('#lines_0__additionalItemIdentification_schemeId')
    .selectOption('SAC');
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
    .locator('#lines_0__additionalItemIdentification_value')
    .fill('123');
});
