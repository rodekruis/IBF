import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildForecast,
  createAlerts,
  readAlertById,
  readAlerts,
} from '@api-service/test/helpers/alert.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const ALERT_NAME = 'KEN_floods_get-test';

describe('/ Alerts', () => {
  let adminAccessToken: string;
  let seededAlertId: number;

  beforeAll(async () => {
    await resetDB(SeedScript.test, __filename);
    const alert = buildAlert({ eventName: ALERT_NAME });
    await createAlerts(buildForecast([alert]));
    adminAccessToken = await getAccessToken();
    seededAlertId = (await readAlerts(adminAccessToken)).body[0].id;
  });

  describe('GET /alerts – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await readAlerts('');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /alerts – success', () => {
    it('should return an array of alerts', async () => {
      const response = await readAlerts(adminAccessToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should include the seeded alert in the response', async () => {
      const response = await readAlerts(adminAccessToken);

      const alert = response.body.find(
        ({ eventName }: { eventName: string }) => eventName === ALERT_NAME,
      );
      expect(alert).toBeDefined();
      expect(alert.id).toBe(seededAlertId);
    });
  });

  describe('GET /alerts/:id – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await readAlertById(seededAlertId, '');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /alerts/:id – success', () => {
    it('should return the alert for the given id', async () => {
      const response = await readAlertById(seededAlertId, adminAccessToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.id).toBe(seededAlertId);
      expect(response.body.eventName).toBe(ALERT_NAME);
    });

    it('should return full nested data', async () => {
      const response = await readAlertById(seededAlertId, adminAccessToken);

      expect(response.body.severity).toBeDefined();
      expect(Array.isArray(response.body.severity)).toBe(true);
      expect(response.body.exposure).toBeDefined();
      expect(Array.isArray(response.body.exposure.adminAreas)).toBe(true);
      expect(Array.isArray(response.body.exposure.rasters)).toBe(true);
    });
  });

  describe('GET /alerts/:id – not found', () => {
    it('should return 404 for a non-existent alert id', async () => {
      const response = await readAlertById(999999, adminAccessToken);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
