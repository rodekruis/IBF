import { env } from '@ibf-e2e/env';

/**
 * Seed scripts supported by the api-service `/instance/reset` endpoint.
 * Mirrors `SeedScript` in services/api-service. Kept as a local constant so the
 * e2e package stays decoupled from the api-service source and its test deps.
 */
export const SeedScript = {
  allCountries: 'all-countries',
  ethiopiaOnly: 'ethiopia-only',
  ethiopiaWithEvents: 'ethiopia-with-events',
} as const;

export type SeedScript = (typeof SeedScript)[keyof typeof SeedScript];

// Reset and seed the api-service database with mock data.
export async function resetDb(
  seedScript: SeedScript = SeedScript.ethiopiaOnly,
  resetIdentifier = 'e2e',
): Promise<void> {
  const url = new URL(`${env.API_SERVICE_URL}/api/instance/reset`);
  url.searchParams.set('script', seedScript);
  url.searchParams.set('resetIdentifier', resetIdentifier);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.RESET_SECRET }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to reset api-service database (${String(response.status)}): ${body}`,
    );
  }
}
