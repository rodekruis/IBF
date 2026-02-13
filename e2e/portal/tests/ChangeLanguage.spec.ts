import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { resetDB } from '@api-service/test/helpers/utility.helper';
import { test } from '@playwright/test';
import LoginPage from '@ibf-e2e/portal/pages/LoginPage';
import BasePage from '@ibf-e2e/portal/pages/BasePage';

test.beforeEach(async ({ page }) => {
  await resetDB(SeedScript.initialState, __filename);

  // Login
  const loginPage = new LoginPage(page);
  await page.goto('/');
  await loginPage.login();
});

test('Change Language', async ({ page }) => {
  const homePage = new BasePage(page);
  await page.waitForURL((url) => url.pathname.startsWith('/en-GB/'));

  await homePage.changeLanguage('Nederlands');
  await page.waitForURL((url) => url.pathname.startsWith('/nl/'));

  await homePage.changeLanguage('English');
  await page.waitForURL((url) => url.pathname.startsWith('/en-GB/'));
});
