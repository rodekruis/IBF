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

  async goto(countryCode: string): Promise<void> {
    await this.page.goto(`/?countries=${countryCode}`);
  }

  /**
   * TODO: This is an intentionally simple, deterministic smoke target. It is
   * expected to change once the frontend loads real event data from the
   * backend — at which point only this locator/assertion needs updating.
   */
  get mapCanvas(): Locator {
    return this.page.locator('.mapboxgl-canvas');
  }
}
