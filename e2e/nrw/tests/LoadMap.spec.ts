import { expect, test } from '@playwright/test';

import { resetDb, SeedScript } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

// NOTE: ETH is seeded by the `test` seed script and currently has no frontend
// mock event data, so the map view renders the deterministic empty-events state.
const COUNTRY_CODE = 'ETH';

test.beforeAll(async () => {
  await resetDb(SeedScript.test);
});

test('NRW loads ETH events and shows the empty-events state', async ({
  page,
}) => {
  const nrwMapPage = new NrwMapPage(page);

  await nrwMapPage.goto(COUNTRY_CODE);

  await expect(nrwMapPage.noUpcomingEventsMessage(COUNTRY_CODE)).toBeVisible();
});
