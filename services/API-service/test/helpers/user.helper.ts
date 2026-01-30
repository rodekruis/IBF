import * as request from 'supertest';

import { getServer } from '@API-service/test/helpers/utility.helper';

export async function getAllUsers(
  accessToken: string,
): Promise<request.Response> {
  return getServer().get('/users').set('Cookie', [accessToken]).send();
}

export async function getAllUsersByProgramId(
  accessToken: string,
  programId: string,
): Promise<request.Response> {
  return getServer()
    .get(`/programs/${programId}/users`)
    .set('Cookie', [accessToken])
    .send();
}

export async function getCurrentUser({
  accessToken,
}: {
  accessToken: string;
}): Promise<request.Response> {
  return await getServer().get('/users/current').set('Cookie', [accessToken]);
}
