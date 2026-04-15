import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { createAlert } from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const ALERT_NAME = 'TEST-delete-flood-2026-03-23';

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

  describe('DELETE /alerts/:id – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await getServer().delete(`/alerts/${seededAlertId}`);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /alerts/:id – not found', () => {
    it('should return 404 for a non-existent alert id', async () => {
      const response = await getServer()
        .delete('/alerts/999999')
        .set('Cookie', [adminAccessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /alerts/:id – success', () => {
    it('should delete the alert and return 204', async () => {
      const deleteResponse = await getServer()
        .delete(`/alerts/${seededAlertId}`)
        .set('Cookie', [adminAccessToken]);

      expect(deleteResponse.status).toBe(HttpStatus.NO_CONTENT);

      // alert should no longer be retrievable
      const getResponse = await getServer()
        .get(`/alerts/${seededAlertId}`)
        .set('Cookie', [adminAccessToken]);

      expect(getResponse.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
