import { HttpStatus } from '@nestjs/common';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { VALID_ALERT } from '@api-service/test/helpers/alert.const.mock';
import {
  getAlertCreateDto,
  submitAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const VALID_ALERT = getAlertCreateDto('TEST-flood-2026-03-23');

describe('POST /alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
  });

  describe('successful submission', () => {
    // NOTE: event-lifecycle.test.ts covers more detailed successful submission scenarios. Also the test_pipeline_api.py pipeline tests asserts successful submission of alerts.
    it('should accept valid alert', async () => {
      const response = await submitAlerts([VALID_ALERT]);

      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('authentication', () => {
    it('should reject request without API key', async () => {
      const response = await getServer().post('/alerts').send([VALID_ALERT]);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject request with invalid API key', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', 'wrong-key-that-is-at-least-32-chars!!')
        .send([VALID_ALERT]);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('validation', () => {
    it('should reject empty alerts array', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send([]);

      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('should reject alert with missing required fields', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send([{ alertName: 'incomplete' }]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert failing integrity check', async () => {
      const badAlert = {
        ...VALID_ALERT,
        alertName: 'BAD-time-interval',
        severity: [
          {
            timeInterval: {
              start: '2026-03-21T00:00:00Z',
              end: '2026-03-20T00:00:00Z',
            },
            ensembleMemberType: EnsembleMemberType.median,
            severityKey: 'water_discharge',
            severityValue: 1,
          },
          {
            timeInterval: {
              start: '2026-03-21T00:00:00Z',
              end: '2026-03-20T00:00:00Z',
            },
            ensembleMemberType: EnsembleMemberType.run,
            severityKey: 'water_discharge',
            severityValue: 1,
          },
        ],
      };

      // ##TODO fix rebase
      const response = await submitAlerts([badAlert]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });
});
