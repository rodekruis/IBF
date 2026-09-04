import { apiRequest } from '@ibf-e2e/nrw/helpers/api-request';
import {
  HazardType,
  HttpMethod,
  MockScenario,
} from '@ibf-e2e/nrw/helpers/enums';

export async function mockDb({
  scenario,
  countryCodes,
  hazardTypes,
  clearEvents = true,
  issuedAt,
}: {
  scenario: MockScenario;
  countryCodes?: string[];
  hazardTypes?: HazardType[];
  clearEvents?: boolean;
  issuedAt?: Date;
}): Promise<void> {
  const searchParams = new URLSearchParams();
  searchParams.set('scenario', scenario);
  searchParams.set('clearEvents', String(clearEvents));

  for (const countryCode of countryCodes ?? []) {
    searchParams.append('countryCodes', countryCode);
  }
  for (const hazardType of hazardTypes ?? []) {
    searchParams.append('hazardTypes', hazardType);
  }
  if (issuedAt) {
    searchParams.set('issuedAt', issuedAt.toISOString());
  }

  await apiRequest({
    method: HttpMethod.post,
    path: '/api/mock',
    searchParams,
    action: `Failed to load mock scenario '${scenario}'`,
  });
}
