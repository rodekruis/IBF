import { expect, test } from '@playwright/test';

import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

test.describe('multi-country, no alert', () => {
  const countryCodes = ['MWI', 'UGA'];

  test.beforeAll(async () => {
    await resetDb(countryCodes);
  });

  test('shows map zoomed to countries without event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(countryCodes);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(page).toHaveScreenshot('multi-country-no-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe('single country, no alert', () => {
  const countryCodes = ['MWI'];

  test.beforeAll(async () => {
    await resetDb(countryCodes);
  });

  test('shows map zoomed to country without event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(countryCodes);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(page).toHaveScreenshot('single-country-no-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
