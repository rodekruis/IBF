import { expect, test } from '@playwright/test';

import { MockScenario } from '@ibf-e2e/nrw/helpers/enums';
import { mockDb } from '@ibf-e2e/nrw/helpers/mock';
import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

const COUNTRIES = ['MWI', 'UGA'];

test.describe('no alerts', () => {
  test.beforeAll(async () => {
    await resetDb(COUNTRIES);
    await mockDb({
      scenario: MockScenario.noEvents,
      countryCodes: COUNTRIES,
    });
  });

  test('single country: shows map zoomed to country without event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto([COUNTRIES[0]]);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(nrwMapPage.eventMarkers).toHaveCount(0);
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
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(nrwMapPage.eventMarkers).toHaveCount(0);
    await expect(page).toHaveScreenshot('multi-country-no-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
