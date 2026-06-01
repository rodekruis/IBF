import { Locator, Page } from '@playwright/test';

/**
 * Page object for the NRW map view (`/nrw`).
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
    await this.page.goto(`/nrw?c=${countryCode}`);
  }

  /**
   * The empty-state message shown when a country has no upcoming events.
   *
   * The control panel renders `No upcoming events for{countryCode}` (no space),
   * so the visible text is e.g. `No upcoming events forETH`.
   *
   * TODO: This is an intentionally simple, deterministic smoke target. It is
   * expected to change once the frontend loads real event data from the
   * backend — at which point only this locator/assertion needs updating.
   */
  noUpcomingEventsMessage(countryCode: string): Locator {
    return this.page.getByText(`No upcoming events for${countryCode}`);
  }
}
