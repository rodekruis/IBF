import { expect, test } from '@playwright/test';

import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

// NOTE: this test currently seeds only, so loads no-events view
const COUNTRY_CODE = 'MWI';

test.beforeAll(async () => {
  await resetDb([COUNTRY_CODE]);
});

test('NRW loads MWI page and shows the empty-events state', async ({
  page,
}) => {
  const nrwMapPage = new NrwMapPage(page);

  await nrwMapPage.goto(COUNTRY_CODE);

  await expect(nrwMapPage.noUpcomingEventsMessage(COUNTRY_CODE)).toBeVisible();
});
