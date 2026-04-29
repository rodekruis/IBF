import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildForecast,
  createAlerts,
  deleteAlert,
  readAlertById,
  readAlerts,
} from '@api-service/test/helpers/alert.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const ALERT_NAME = 'KEN_floods_delete-test';

describe('/ Alerts', () => {
  let adminAccessToken: string;
  let seededAlertId: number;

  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
    const alert = buildAlert({ eventName: ALERT_NAME });
    const forecast = buildForecast([alert]);
    await createAlerts(forecast);
    adminAccessToken = await getAccessToken();
    seededAlertId = (await readAlerts(adminAccessToken)).body[0].id;
  });

  describe('DELETE /alerts/:id – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await deleteAlert(seededAlertId, '');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /alerts/:id – not found', () => {
    it('should return 404 for a non-existent alert id', async () => {
      const response = await deleteAlert(9999, adminAccessToken);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /alerts/:id – success', () => {
    it('should delete the alert and return 204', async () => {
      const deleteResponse = await deleteAlert(seededAlertId, adminAccessToken);

      expect(deleteResponse.status).toBe(HttpStatus.NO_CONTENT);

      // alert should no longer be retrievable
      const getResponse = await readAlertById(seededAlertId, adminAccessToken);

      expect(getResponse.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
