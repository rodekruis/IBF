import * as request from 'supertest';

import { getServer } from '@api-service/test/helpers/utility.helper';

export async function readEvents({
  accessToken,
  countryCodesIso3,
  query,
}: {
  accessToken: string;
  countryCodesIso3?: string[];
  query?: { active?: boolean; timestamp?: string };
}): Promise<request.Response> {
  const requestBuilder = getServer()
    .get('/events')
    .set('Cookie', [accessToken]);

  if (countryCodesIso3) {
    requestBuilder.query({ countryCodesIso3: countryCodesIso3.join(',') });
  }

  if (query) {
    requestBuilder.query(query);
  }

  return requestBuilder;
}

export async function getActiveEvents({
  accessToken,
  countryCodesIso3 = ['MWI'],
  timestamp,
}: {
  accessToken: string;
  countryCodesIso3?: string[];
  timestamp?: string;
}): Promise<request.Response> {
  return readEvents({
    accessToken,
    countryCodesIso3,
    query: { active: true, timestamp },
  });
}
