import { env } from '@ibf-e2e/env';
import { apiRequest } from '@ibf-e2e/nrw/helpers/api-request';
import { HttpMethod } from '@ibf-e2e/nrw/helpers/enums';

export async function resetDb(
  countryCodes: string[] = ['MWI'],
  resetIdentifier = 'e2e',
): Promise<void> {
  const searchParams = new URLSearchParams();
  for (const code of countryCodes) {
    searchParams.append('countryCodes', code);
  }
  searchParams.set('resetIdentifier', resetIdentifier);

  await apiRequest({
    method: HttpMethod.post,
    path: '/api/reset',
    searchParams,
    action: 'Failed to reset api-service database',
  });

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
