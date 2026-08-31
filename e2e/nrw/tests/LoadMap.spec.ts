import { expect, test } from '@playwright/test';

import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

const COUNTRY_CODE = 'MWI';

test.beforeAll(async () => {
  await resetDb([COUNTRY_CODE]);
});

test('NRW loads MWI page and shows the map', async ({ page }) => {
  // Arrange
  const nrwMapPage = new NrwMapPage(page);

  // Act
  await nrwMapPage.goto(COUNTRY_CODE);

  // Assert
  await expect(nrwMapPage.mapCanvas).toBeVisible();
});
