import * as request from 'supertest';

import { getServer } from '@api-service/test/helpers/utility.helper';

export async function readEvents(
  accessToken: string,
  query?: { active?: boolean; timestamp?: string },
): Promise<request.Response> {
  const requestBuilder = getServer()
    .get('/events')
    .set('Cookie', [accessToken]);

  if (query) {
    requestBuilder.query(query);
  }

  return requestBuilder;
}

export async function getActiveEvents(
  accessToken: string,
  timestamp?: string,
): Promise<request.Response> {
  return readEvents(accessToken, { active: true, timestamp });
}
