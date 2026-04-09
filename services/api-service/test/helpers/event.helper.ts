import * as request from 'supertest';

import { getServer } from '@api-service/test/helpers/utility.helper';

export async function getOpenEvents(
  accessToken: string,
  timestamp?: string,
): Promise<request.Response> {
  const requestBuilder = getServer()
    .get('/events')
    .set('Cookie', [accessToken]);

  if (timestamp) {
    requestBuilder.query({ timestamp });
  }

  return requestBuilder;
}
