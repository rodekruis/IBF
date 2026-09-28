import { apiRequest } from '@ibf-e2e/nrw/helpers/api-request';
import { HttpMethod } from '@ibf-e2e/nrw/helpers/enums';

export type NrwEvent = {
  eventId: number;
  countryCodeIso3: string;
  eventName: string;
};

export async function getEvents(
  countryCodes: string[],
  viewTime?: Date,
): Promise<NrwEvent[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('active', 'true');
  searchParams.set('countryCodesIso3', countryCodes.join(','));
  if (viewTime) {
    searchParams.set('timestamp', viewTime.toISOString());
  }

  const response = await apiRequest({
    method: HttpMethod.get,
    path: '/api/events',
    searchParams,
    action: 'Failed to get events from api-service',
  });

  return (await response.json()) as NrwEvent[];
}
