import { HttpStatus } from '@nestjs/common';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildForecast,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getActiveEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const VALID_FORECAST = buildForecast([buildAlert()]);

describe('POST /alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  let accessToken: string;
  beforeAll(async () => {
    await resetDB(SeedScript.test, __filename);

    accessToken = await getAccessToken();
  });

  describe('successful submission', () => {
    // NOTE: event-lifecycle.test.ts covers more detailed successful submission scenarios. Also the test_pipeline_api.py pipeline tests asserts successful submission of alerts.
    it('should accept valid alert', async () => {
      const response = await createAlerts(VALID_FORECAST, apiKey!);

      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('should not create event on too low alert severity', async () => {
      const lowSeverityAlert = buildAlert({
        eventName: 'KEN_floods_low-severity',
        severity: [
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-22T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.median,
            severityKey: 'water_discharge',
            severityValue: 1, // too low to trigger event
          },
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-22T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.run,
            severityKey: 'water_discharge',
            severityValue: 1, // too low to trigger event
          },
        ],
      });

      await createAlerts(buildForecast([lowSeverityAlert]), apiKey!);

      const eventResponse = await getActiveEvents(accessToken);
      expect(eventResponse.status).toBe(HttpStatus.OK);
      const event = eventResponse.body.find(
        (e: { name: string }) => e.name === lowSeverityAlert.eventName,
      );
      expect(event).toBeUndefined();
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
        .send({
          ...VALID_FORECAST,
          alerts: [{ eventName: 'incomplete' }],
        });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert failing integrity check', async () => {
      const badAlert = buildAlert({
        eventName: 'BAD-time-interval',
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
