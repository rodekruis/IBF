import { HttpStatus } from '@nestjs/common';

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

const ALERT_NAME = 'delete-test';

describe('/ Alerts', () => {
  let adminAccessToken: string;
  let seededAlertId: number;

  beforeAll(async () => {
    await resetDB({ countryCodes: ['MWI'], resetIdentifier: __filename });
    const alert = buildAlert({ eventName: ALERT_NAME });
    const forecast = buildForecast({ alerts: [alert] });
    await createAlerts({ forecast });
    adminAccessToken = await getAccessToken();
    seededAlertId = (await readAlerts(adminAccessToken)).body[0].id;
  });

  describe('DELETE /alerts/:id – authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await deleteAlert({
        id: seededAlertId,
        accessToken: '',
      });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /alerts/:id – not found', () => {
    it('should return 404 for a non-existent alert id', async () => {
      const response = await deleteAlert({
        id: 9999,
        accessToken: adminAccessToken,
      });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /alerts/:id – success', () => {
    it('should delete the alert and return 204', async () => {
      const deleteResponse = await deleteAlert({
        id: seededAlertId,
        accessToken: adminAccessToken,
      });

      expect(deleteResponse.status).toBe(HttpStatus.NO_CONTENT);

      // alert should no longer be retrievable
      const getResponse = await readAlertById({
        id: seededAlertId,
        accessToken: adminAccessToken,
      });

      expect(getResponse.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
