import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { EnsembleMemberType, SeverityKey } from '@api-service/src/shared-enums';
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

const VALID_FORECAST = buildForecast({ alerts: [buildAlert()] });

describe('POST /alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  let accessToken: string;
  beforeAll(async () => {
    await resetDB({ countryCodes: ['MWI'], resetIdentifier: __filename });

    accessToken = await getAccessToken();
  });

  describe('successful submission', () => {
    // NOTE: event-lifecycle.test.ts covers more detailed successful submission scenarios. Also the test_pipeline_api.py pipeline tests asserts successful submission of alerts.
    it('should accept valid alert', async () => {
      // Act
      const response = await createAlerts({
        forecast: VALID_FORECAST,
        apiKey: apiKey!,
      });

      // Assert
      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('should not create event on too low alert severity', async () => {
      // Arrange
      const lowSeverityAlert = buildAlert({
        eventName: 'low-severity',
        severity: [
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-22T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.median,
            severityKey: SeverityKey.returnPeriod,
            severityValue: 0,
          },
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-22T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.run,
            severityKey: SeverityKey.returnPeriod,
            severityValue: 0,
          },
        ],
      });

      // Act
      await createAlerts({
        forecast: buildForecast({ alerts: [lowSeverityAlert] }),
        apiKey: apiKey!,
      });

      // Assert
      const eventResponse = await getActiveEvents({ accessToken });
      expect(eventResponse.status).toBe(HttpStatus.OK);
      const event = eventResponse.body.find(
        (e: { name: string }) => e.name === lowSeverityAlert.eventName,
      );
      expect(event).toBeUndefined();
    });
  });

  describe('authentication', () => {
    it('should reject request without API key', async () => {
      // Act
      const response = await getServer().post('/alerts').send(VALID_FORECAST);

      // Assert
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject request with invalid API key', async () => {
      // Act
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', 'wrong-key-that-is-at-least-32-chars!!')
        .send(VALID_FORECAST);

      // Assert
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('validation', () => {
    it('should reject alert with missing required fields', async () => {
      // Act
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({
          ...VALID_FORECAST,
          alerts: [{ eventName: 'incomplete' }],
        });

      // Assert
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert failing integrity check', async () => {
      // Arrange
      const badAlert = buildAlert({
        eventName: 'BAD-time-interval',
        severity: [
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-20T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.median,
            severityKey: SeverityKey.returnPeriod,
            severityValue: 1,
          },
          {
            timeInterval: {
              start: new Date('2026-03-21T00:00:00Z'),
              end: new Date('2026-03-20T00:00:00Z'),
            },
            ensembleMemberType: EnsembleMemberType.run,
            severityKey: SeverityKey.returnPeriod,
            severityValue: 1,
          },
        ],
      });

      // Act
      const response = await createAlerts({
        forecast: buildForecast({ alerts: [badAlert] }),
        apiKey: apiKey!,
      });

      // Assert
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should reject alert with two rasters for the same layer', async () => {
      // Arrange
      const alert = buildAlert({ eventName: 'duplicate-raster-layer' });
      const [raster] = alert.exposure.rasters!;

      // Act
      const response = await createAlerts({
        forecast: buildForecast({
          alerts: [
            {
              ...alert,
              exposure: { ...alert.exposure, rasters: [raster, raster] },
            },
          ],
        }),
        apiKey: apiKey!,
      });

      // Assert
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
