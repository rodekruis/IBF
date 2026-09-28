import { Page } from '@playwright/test';

/**
 * Pins the `timestamp` the frontend sends to `GET /api/events`, so event
 * status and the dates it renders stay deterministic across days.
 */
export async function freezeEventsViewTime(
  page: Page,
  viewTime: Date,
): Promise<void> {
  await page.route('**/api/events*', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('timestamp', viewTime.toISOString());
    await route.continue({ url: url.toString() });
  });
}
