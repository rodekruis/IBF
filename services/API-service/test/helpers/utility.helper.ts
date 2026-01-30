import { HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { CookieNames } from '@api-service/src/shared/enum/cookie.enums';

export function getHostname(): string {
  return `${env.EXTERNAL_API_SERVICE_URL}/api`;
}

export function getServer(): TestAgent<request.Test> {
  return request.agent(getHostname());
}

export function resetDB(
  seedScript: SeedScript,
  resetIdentifier: string,
): Promise<request.Response> {
  return getServer()
    .post('/scripts/reset')
    .query({
      script: seedScript,
      isApiTests: true,
      resetIdentifier,
    })
    .send({
      secret: env.RESET_SECRET,
    });
}

export function loginApi(
  username: string,
  password: string,
): Promise<request.Response> {
  return getServer().post(`/users/login`).send({
    username,
    password,
  });
}

export async function logoutUser(
  accessToken: string,
): Promise<request.Response> {
  return getServer().post('/users/logout').set('Cookie', [accessToken]).send();
}

export async function getAccessToken(
  username = env.USERCONFIG_API_SERVICE_EMAIL_ADMIN,
  password = env.USERCONFIG_API_SERVICE_PASSWORD_ADMIN,
): Promise<string> {
  const login = await loginApi(username, password);

  if (login.statusCode !== HttpStatus.CREATED) {
    throw new Error(`Login failed with status code: ${login.statusCode}`);
  }

  const cookies = login.get('Set-Cookie');
  const accessToken = cookies
    ?.find((cookie: string) => cookie.startsWith(CookieNames.general))
    ?.split(';')[0];

  if (!accessToken) {
    throw new Error('Access token not found');
  }

  return accessToken;
}

/**
 * Searches for a user by username within a program context
 */
export async function findUserByUsername({
  programId,
  username,
  adminAccessToken,
}: {
  programId: number;
  username: string;
  adminAccessToken: string;
}): Promise<number> {
  const searchUserResponse = await getServer()
    .get(`/programs/${programId}/users/search`)
    .set('Cookie', [adminAccessToken])
    .query({ username });

  if (
    searchUserResponse.status !== HttpStatus.OK ||
    !searchUserResponse.body.length
  ) {
    throw new Error(
      `Failed to find created user: ${searchUserResponse.status}`,
    );
  }

  return searchUserResponse.body[0].id;
}
