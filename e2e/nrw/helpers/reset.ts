import { env } from '@ibf-e2e/env';

export async function resetDb(
  countryCodes: string[] = ['MWI'],
  resetIdentifier = 'e2e',
): Promise<void> {
  const url = new URL(`${env.API_SERVICE_URL}/api/seed/reset`);
  for (const code of countryCodes) {
    url.searchParams.append('countryCodes', code);
  }
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
