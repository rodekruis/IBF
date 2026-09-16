import { Locator, Page } from '@playwright/test';

/**
 * Page object for the standalone NRW page.
 *
 * Locators here are the only place that should need updating as the frontend
 * evolves; the surrounding e2e setup (orchestration, seeding, CI) stays stable.
 */
export class NrwMapPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(countryCodes: string[], eventId?: number): Promise<void> {
    const eventParam = eventId === undefined ? '' : `&event=${String(eventId)}`;
    await this.page.goto(`/?countries=${countryCodes.join(',')}${eventParam}`);
  }

  async waitForMapLoaded(): Promise<void> {
    await this.mapCanvas.waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  get mapCanvas(): Locator {
    return this.page.locator('.mapboxgl-canvas');
  }

  get eventMarkers(): Locator {
    return this.page.locator('.mapboxgl-marker:has([class*="event-marker"])');
  }

  get hoveredEventMarkers(): Locator {
    return this.page.locator(
      '.mapboxgl-marker [class*="event-marker"][class*="hovered"]',
    );
  }

  get eventMarkerButtons(): Locator {
    return this.eventMarkers.getByRole('button');
  }

  get eventCards(): Locator {
    return this.page.locator('[class*="nrw-event-card"]');
  }

  get hoveredEventCards(): Locator {
    return this.page.locator('[class*="nrw-event-card"][class*="hovered"]');
  }

  /** The toggle is the only card button that exposes the expanded state. */
  eventCardToggle(eventCard: Locator): Locator {
    return eventCard.locator('button[aria-expanded]');
  }

  get eventDetail(): Locator {
    return this.page.locator('[class*="nrw-event-detail"]');
  }

  get exposedAdminAreaRows(): Locator {
    return this.eventDetail.locator('tbody tr');
  }

  get layersButton(): Locator {
    return this.page.getByRole('button', { name: 'Layers', exact: true });
  }

  layerToggle(label: string): Locator {
    return this.page.getByRole('checkbox', { name: label, exact: true });
  }
}
