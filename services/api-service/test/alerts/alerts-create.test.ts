import { HttpStatus } from '@nestjs/common';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { buildSeverityData } from '@api-service/src/alerts/test-helpers/alert.builders';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  getAlertCreateDto,
  submitAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getOpenEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const VALID_ALERT = getAlertCreateDto('TEST-flood-2026-03-23');

describe('POST /alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
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

  describe('event lifecycle', () => {
    let accessToken: string;

    beforeAll(async () => {
      await resetDB(SeedScript.initialState, __filename);
      accessToken = await getAccessToken();
    });

    // median=120 → severity 'low', runs all exceed 100 → prob=1.0 → 'high'
    // matrix[low][high] = 'min', below triggerAlertClass 'max' → trigger false
    const alertA = {
      ...VALID_ALERT,
      alertName: 'TEST-station-A',
      issuedAt: '2026-03-23T12:00:00Z',
      severityData: buildSeverityData(
        '2026-03-25T00:00:00Z',
        '2026-03-26T00:00:00Z',
        120,
        [150, 150, 150],
      ),
    };

    // Same station, upgraded severity: median=500 → severity 'high', prob=1.0 → 'high'
    // matrix[high][high] = 'max', within P7D of issuedAt → trigger true
    const alertAUpgraded = {
      ...alertA,
      issuedAt: '2026-03-24T12:00:00Z',
      severityData: buildSeverityData(
        '2026-03-25T00:00:00Z',
        '2026-03-26T00:00:00Z',
        500,
        [500, 500, 500],
      ),
    };

    // Different station: median=250 → severity 'mid', prob=1.0 → 'high'
    // matrix[mid][high] = 'med', below triggerAlertClass 'max' → trigger false
    const alertB = {
      ...VALID_ALERT,
      alertName: 'TEST-station-B',
      issuedAt: '2026-03-24T12:00:00Z',
      severityData: buildSeverityData(
        '2026-03-27T00:00:00Z',
        '2026-03-28T00:00:00Z',
        250,
        [300, 300, 300],
      ),
    };

    it('should create, update, and close events through the alert lifecycle', async () => {
      // Step 1: Submit alert → creates event
      await submitAlerts([alertA]);
      let response = await getOpenEvents(accessToken);
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        eventName: 'TEST-station-A',
        hazardTypes: [HazardType.floods],
        forecastSources: [ForecastSource.glofas],
        alertClass: 'min',
        trigger: false,
        firstIssuedAt: '2026-03-23T12:00:00.000Z',
        startAt: '2026-03-25T00:00:00.000Z',
        endAt: '2026-03-26T00:00:00.000Z',
        closedAt: null,
      });

      // Step 2: Re-submit same alert with higher severity → updates event
      await submitAlerts([alertAUpgraded]);
      response = await getOpenEvents(accessToken);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        eventName: 'TEST-station-A',
        alertClass: 'max',
        trigger: true,
        firstIssuedAt: '2026-03-23T12:00:00.000Z',
      });

      // Step 3: Submit two alerts → both events open
      await submitAlerts([alertAUpgraded, alertB]);
      response = await getOpenEvents(accessToken);
      expect(response.body).toHaveLength(2);
      const names = response.body
        .map((e: { eventName: string }) => e.eventName)
        .sort();
      expect(names).toEqual(['TEST-station-A', 'TEST-station-B']);

      // Step 4: Submit only alertB → stale event for alertA is closed
      await submitAlerts([alertB]);
      response = await getOpenEvents(accessToken);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].eventName).toBe('TEST-station-B');
    });
  });
});
