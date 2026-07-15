import { env } from '@ibf-e2e/env';

export async function resetDb(
  countryCodes: string[] = ['MWI'],
  resetIdentifier = 'e2e',
): Promise<void> {
  const url = new URL(`${env.API_SERVICE_URL}/api/reset`);
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

  await waitForResetComplete();
}

async function waitForResetComplete(): Promise<void> {
  const pollIntervalMs = 1000;
  const maxWaitMs = 600_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const statusResponse = await fetch(
      `${env.API_SERVICE_URL}/api/reset/status`,
    );
    if (statusResponse.ok) {
      const status = (await statusResponse.json()) as {
        inProgress: boolean;
        error: string | null;
      };
      if (!status.inProgress) {
        if (status.error) {
          throw new Error(`Reset failed: ${status.error}`);
        }
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Reset did not complete within the expected time');
}
