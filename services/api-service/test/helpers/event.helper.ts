import * as request from 'supertest';

import { getServer } from '@api-service/test/helpers/utility.helper';

export async function readEvents(
  accessToken: string,
  countryCodeIso3?: string,
  query?: { active?: boolean; timestamp?: string },
): Promise<request.Response> {
  const requestBuilder = getServer()
    .get('/events')
    .set('Cookie', [accessToken]);

  if (countryCodeIso3) {
    requestBuilder.query({ countryCodeIso3 });
  }

  if (query) {
    requestBuilder.query(query);
  }

  return requestBuilder;
}

export async function getActiveEvents(
  accessToken: string,
  countryCodeIso3 = 'ETH',
  timestamp?: string,
): Promise<request.Response> {
  return readEvents(accessToken, countryCodeIso3, { active: true, timestamp });
}
