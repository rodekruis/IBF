import { expect, test } from '@playwright/test';

import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

test.describe('no alert', () => {
  test.beforeAll(async () => {
    await resetDb(['MWI', 'UGA']);
  });

  test('single country: shows map zoomed to country without event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(['MWI']);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(page).toHaveScreenshot('single-country-no-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('multi-country: shows map zoomed to countries without event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(['MWI', 'UGA']);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(page).toHaveScreenshot('multi-country-no-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
