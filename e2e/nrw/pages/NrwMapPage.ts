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

  async goto(countryCodes: string[]): Promise<void> {
    await this.page.goto(`/?countries=${countryCodes.join(',')}`);
  }

  async waitForMapLoaded(): Promise<void> {
    await this.mapCanvas.waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  get mapCanvas(): Locator {
    return this.page.locator('.mapboxgl-canvas');
  }
}
