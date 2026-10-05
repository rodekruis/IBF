import { expect, test } from '@playwright/test';

import { MockScenario } from '@ibf-e2e/nrw/helpers/enums';
import { mockDb } from '@ibf-e2e/nrw/helpers/mock';
import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { freezeEventsViewTime } from '@ibf-e2e/nrw/helpers/view-time';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

// The exposure of the South Sudan event splits into two states, so the event
// card opens at the states and can drill down into their counties.
const COUNTRIES = ['SSD'];
const ALERT_ISSUED_AT = new Date('2026-09-22T00:00:00Z');

test.describe('exposed admin areas', () => {
  test.beforeAll(async () => {
    await resetDb(COUNTRIES);
    await mockDb({
      scenario: MockScenario.events,
      countryCodes: COUNTRIES,
      issuedAt: ALERT_ISSUED_AT,
    });
  });

  test.beforeEach(async ({ page }) => {
    await freezeEventsViewTime(page, ALERT_ISSUED_AT);
  });

  test('drilling down into a row shows its exposed admin areas, and back returns', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();
    await nrwMapPage.eventCardToggle(nrwMapPage.eventCards.first()).click();
    await expect(nrwMapPage.eventDetail).toContainText('Total exposed States');
    await expect(nrwMapPage.exposedAdminAreaRows).toHaveCount(2);
    await expect(
      nrwMapPage.exposedAdminAreaRows.first().getByRole('cell'),
    ).toHaveText(['Jonglei', '258,439']);
    await expect(nrwMapPage.exposedAdminAreasBackButton).toHaveCount(0);

    // Act
    await nrwMapPage.exposedAdminAreaRows.first().click();

    // Assert
    await expect(nrwMapPage.selectedAdminArea).toHaveText('Jonglei State');
    await expect(nrwMapPage.eventDetail).toContainText(
      'Total exposed Counties',
    );
    await expect(nrwMapPage.exposedAdminAreaRows).toHaveCount(2);
    await expect(
      nrwMapPage.exposedAdminAreaRows.first().getByRole('cell'),
    ).toHaveText(['Bor South', '135,195']);

    // Act
    await nrwMapPage.exposedAdminAreasBackButton.click();

    // Assert
    await expect(nrwMapPage.selectedAdminArea).toHaveCount(0);
    await expect(nrwMapPage.eventDetail).toContainText('Total exposed States');
    await expect(
      nrwMapPage.exposedAdminAreaRows.first().getByRole('cell'),
    ).toHaveText(['Jonglei', '258,439']);
  });
});
