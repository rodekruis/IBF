import { HttpStatus } from '@nestjs/common';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildForecast,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const VALID_FORECAST = buildForecast([buildAlert()]);

describe('POST /alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
  });

  describe('successful submission', () => {
    // NOTE: event-lifecycle.test.ts covers more detailed successful submission scenarios. Also the test_pipeline_api.py pipeline tests asserts successful submission of alerts.
    it('should accept valid alert', async () => {
      const response = await createAlerts(VALID_FORECAST, apiKey!);

      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('authentication', () => {
    it('should reject request without API key', async () => {
      const response = await getServer().post('/alerts').send(VALID_FORECAST);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject request with invalid API key', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', 'wrong-key-that-is-at-least-32-chars!!')
        .send(VALID_FORECAST);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('validation', () => {
    it('should reject alert with missing required fields', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({ alerts: [{ alertName: 'incomplete' }] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert failing integrity check', async () => {
      const badAlert = buildAlert({
        alertName: 'BAD-time-interval',
        severity: [
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-20T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.median,
            severityKey: 'water_discharge',
            severityValue: 1,
          },
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-20T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.run,
            severityKey: 'water_discharge',
            severityValue: 1,
          },
        ],
      });

      const response = await createAlerts(buildForecast([badAlert]), apiKey!);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });
});
