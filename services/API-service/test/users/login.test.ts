import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { CookieNames } from '@api-service/src/shared/enum/cookie.enums';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

describe('/ Users', () => {
  describe('/ Login', () => {
    const fixtureUser = {
      username: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN,
      password: env.USERCONFIG_API_SERVICE_PASSWORD_ADMIN,
    };

    beforeAll(async () => {
      await resetDB(SeedScript.productionInitialState, __filename);
    });

    it('should log-in with valid credentials', async () => {
      // Arrange
      const testUser = fixtureUser;

      // Act
      const response = await getServer().post('/users/login').send(testUser);

      // Assert
      expect(response.status).toBe(HttpStatus.CREATED);
      const cookies = response.get('Set-Cookie');
      expect(cookies).toBeDefined(); // Ensure cookies are defined
      expect(
        cookies &&
          cookies.findIndex((cookie) => cookie.startsWith(CookieNames.general)),
      ).not.toBe(-1);
      expect(response.body.username).toBe(testUser.username);
      expect(response.body.expires).toBeDefined();
      expect(Date.parse(response.body.expires)).not.toBeNaN();
    });

    it('should not log-in with invalid credentials', async () => {
      // Arrange
      const testUser = {
        ...fixtureUser,
        password: 'wrong',
      };

      // Act
      const response = await getServer().post('/users/login').send(testUser);

      // Assert
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body).toBeDefined();
    });
  });
});
