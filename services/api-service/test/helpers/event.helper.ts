import * as request from 'supertest';

import { getServer } from '@api-service/test/helpers/utility.helper';

export async function getOpenEvents(
  accessToken: string,
): Promise<request.Response> {
  return getServer().get('/events').set('Cookie', [accessToken]);
}
