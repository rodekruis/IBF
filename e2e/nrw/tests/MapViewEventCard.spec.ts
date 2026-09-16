import { expect, test } from '@playwright/test';

import { MockScenario } from '@ibf-e2e/nrw/helpers/enums';
import { getEvents } from '@ibf-e2e/nrw/helpers/events';
import { mockDb } from '@ibf-e2e/nrw/helpers/mock';
import { resetDb } from '@ibf-e2e/nrw/helpers/reset';
import { NrwMapPage } from '@ibf-e2e/nrw/pages/NrwMapPage';

const COUNTRIES = ['MWI'];

test.describe('event card', () => {
  test.beforeAll(async () => {
    await resetDb(COUNTRIES);
    await mockDb({
      scenario: MockScenario.events,
      countryCodes: COUNTRIES,
    });
  });

  test('expanding a card shows the event detail and hides the event markers', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();
    const eventCard = nrwMapPage.eventCards.first();

    // Act
    await nrwMapPage.eventCardToggle(eventCard).click();

    // Assert
    await expect(nrwMapPage.eventCardToggle(eventCard)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page).toHaveURL(/[?&]event=\d+/);
    await expect(nrwMapPage.eventDetail).toContainText(
      'Trigger - activate EAP',
    );
    await expect(nrwMapPage.exposedAdminAreaRows).toHaveCount(1);
    await expect(
      nrwMapPage.exposedAdminAreaRows.first().getByRole('cell'),
    ).toHaveText(['Southern', '61']);
    await expect(nrwMapPage.eventMarkers).toHaveCount(0);
    await expect(nrwMapPage.layersButton).toBeVisible();
    await expect(page).toHaveScreenshot(
      'single-country-event-card-expanded.png',
      { maxDiffPixelRatio: 0.01 },
    );
  });

  test('collapsing a card shows all events and the event markers again', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();
    const eventCardToggle = nrwMapPage.eventCardToggle(
      nrwMapPage.eventCards.first(),
    );
    await eventCardToggle.click();
    await expect(eventCardToggle).toHaveAttribute('aria-expanded', 'true');

    // Act
    await eventCardToggle.click();

    // Assert
    await expect(eventCardToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page).not.toHaveURL(/[?&]event=/);
    await expect(nrwMapPage.eventDetail).toHaveCount(0);
    await expect(nrwMapPage.eventMarkers).toHaveCount(1);
    await expect(nrwMapPage.layersButton).toHaveCount(0);
  });

  test('opening an event link shows the expanded card', async ({ page }) => {
    // Arrange
    const [event] = await getEvents(COUNTRIES);
    const nrwMapPage = new NrwMapPage(page);

    // Act
    await nrwMapPage.goto(COUNTRIES, event.eventId);
    await nrwMapPage.waitForMapLoaded();

    // Assert
    const eventCard = nrwMapPage.eventCards.first();
    await expect(eventCard).toContainText(event.eventName);
    await expect(nrwMapPage.eventCardToggle(eventCard)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(nrwMapPage.eventMarkers).toHaveCount(0);
  });

  test('clicking an event marker expands the event card', async ({ page }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();

    // Act
    await nrwMapPage.eventMarkerButtons.first().click();

    // Assert
    await expect(
      nrwMapPage.eventCardToggle(nrwMapPage.eventCards.first()),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(/[?&]event=\d+/);
  });

  test('hovering an event card highlights its event marker', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();

    // Act
    await nrwMapPage.eventCards.first().hover();

    // Assert
    await expect(nrwMapPage.hoveredEventMarkers).toHaveCount(1);
  });

  test('hovering an event marker highlights its event card', async ({
    page,
  }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();

    // Act
    await nrwMapPage.eventMarkerButtons.first().hover();

    // Assert
    await expect(nrwMapPage.hoveredEventCards).toHaveCount(1);
  });

  test('showing the population layer adds it to the map', async ({ page }) => {
    // Arrange
    const nrwMapPage = new NrwMapPage(page);
    await nrwMapPage.goto(COUNTRIES);
    await nrwMapPage.waitForMapLoaded();
    await nrwMapPage.eventCardToggle(nrwMapPage.eventCards.first()).click();
    await nrwMapPage.layersButton.click();
    await expect(nrwMapPage.layersButton).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const populationLayerToggle = nrwMapPage.layerToggle('Population');

    // Act
    // Do not assume the layer's default state: only click when it is hidden.
    await populationLayerToggle.setChecked(true);

    // Assert
    await expect(populationLayerToggle).toBeChecked();
    await expect(page).toHaveScreenshot(
      'single-country-event-population-layer-visible.png',
      { maxDiffPixelRatio: 0.01 },
    );
  });
});
