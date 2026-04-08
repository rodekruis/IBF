import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { createAlert } from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const ALERT_NAME = 'TEST-get-flood-2026-03-23';

describe('/ Alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  let adminAccessToken: string;
  let seededAlertId: number;

  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
    ({ adminAccessToken, alertId: seededAlertId } = await createAlert(
      ALERT_NAME,
      apiKey!,
    ));
  });

  describe('GET /alerts – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await getServer().get('/alerts');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /alerts – success', () => {
    it('should return an array of alerts', async () => {
      const response = await getServer()
        .get('/alerts')
        .set('Cookie', [adminAccessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should include the seeded alert in the response', async () => {
      const response = await getServer()
        .get('/alerts')
        .set('Cookie', [adminAccessToken]);

      const alert = response.body.find(
        ({ alertName }: { alertName: string }) => alertName === ALERT_NAME,
      );
      expect(alert).toBeDefined();
      expect(alert.id).toBe(seededAlertId);
    });
  });

  describe('GET /alerts/:id – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await getServer().get(`/alerts/${seededAlertId}`);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /alerts/:id – success', () => {
    it('should return the alert for the given id', async () => {
      const response = await getServer()
        .get(`/alerts/${seededAlertId}`)
        .set('Cookie', [adminAccessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.id).toBe(seededAlertId);
      expect(response.body.alertName).toBe(ALERT_NAME);
    });

    it('should return full nested data', async () => {
      const response = await getServer()
        .get(`/alerts/${seededAlertId}`)
        .set('Cookie', [adminAccessToken]);

      expect(response.body.severity).toBeDefined();
      expect(Array.isArray(response.body.severity)).toBe(true);
      expect(response.body.exposure).toBeDefined();
      expect(Array.isArray(response.body.exposure.adminAreas)).toBe(true);
      expect(Array.isArray(response.body.exposure.rasters)).toBe(true);
    });
  });

  describe('GET /alerts/:id – not found', () => {
    it('should return 404 for a non-existent alert id', async () => {
      const response = await getServer()
        .get('/alerts/999999')
        .set('Cookie', [adminAccessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
