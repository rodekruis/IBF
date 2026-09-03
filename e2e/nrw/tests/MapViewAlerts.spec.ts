import { expect, test } from '@playwright/test';

import { MockScenario } from '@ibf-e2e/nrw/helpers/enums';
import { mockDb } from '@ibf-e2e/nrw/helpers/mock';
import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

const COUNTRIES = ['MWI'];

test.describe('alerts', () => {
  test.beforeAll(async () => {
    await resetDb(COUNTRIES);
    await mockDb({
      scenario: MockScenario.events,
      countryCodes: COUNTRIES,
    });
  });

  test('single country: shows event markers for active alerts', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    await expect(nrwMapPage.eventMarkers.first()).toBeVisible();
    await expect(page).toHaveScreenshot('single-country-alert.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
