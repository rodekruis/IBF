import { test } from '@playwright/test';

import { SeedScript } from '@API-service/src/scripts/enum/seed-script.enum';
import { resetDB } from '@API-service/test/helpers/utility.helper';

import BasePage from '@ibf-e2e/portal/pages/BasePage';
import LoginPage from '@ibf-e2e/portal/pages/LoginPage';

test.beforeEach(async ({ page }) => {
  await resetDB(SeedScript.productionInitialState, __filename);

  // Login
  const loginPage = new LoginPage(page);
  await page.goto('/');
  await loginPage.login();
});

test('Log Out via Menu', async ({ page }) => {
  const homePage = new BasePage(page);
  const loginPage = new LoginPage(page);

  await test.step('Should navigate to user account dropdown and select Log-out option', async () => {
    await homePage.selectAccountOption('Logout');

    await loginPage.loginButton.isVisible();
  });
});
