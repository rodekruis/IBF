import { HttpStatus } from '@nestjs/common';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const VALID_ALERT = {
  alertName: 'TEST-flood-2026-03-23',
  issuedAt: '2026-03-23T12:00:00Z',
  centroid: { latitude: 0.35, longitude: 32.6 },
  hazardTypes: [HazardType.floods],
  forecastSources: [ForecastSource.glofas],
  severityData: [
    {
      leadTime: { start: '2026-03-23T00:00:00Z', end: '2026-03-23T23:59:59Z' },
      ensembleMemberType: EnsembleMemberType.median,
      severityKey: 'water_discharge',
      severityValue: 120.5,
    },
    {
      leadTime: { start: '2026-03-23T00:00:00Z', end: '2026-03-23T23:59:59Z' },
      ensembleMemberType: EnsembleMemberType.run,
      severityKey: 'water_discharge',
      severityValue: 135.0,
    },
  ],
  exposure: {
    adminArea: [
      {
        placeCode: 'KEN_01_001',
        adminLevel: 3,
        layer: Layer.populationExposed,
        value: 1,
      },
    ],
  },
};

describe('/ Alerts', () => {
  const apiKey = env.PIPELINE_API_KEY;

  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
  });

  describe('POST /alerts – success', () => {
    // NOTE: the success flow is tested from the pipeline as well, thereby asserting integration between pipeline and API.
    // The success flow here is redundant, but added for documentation. The added value of this file is on the error scenarios.
    it('should accept valid alert', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({ alerts: [VALID_ALERT] });

      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('POST /alerts – authentication', () => {
    it('should reject request without API key', async () => {
      const response = await getServer()
        .post('/alerts')
        .send({ alerts: [VALID_ALERT] });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject request with invalid API key', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', 'wrong-key-that-is-at-least-32-chars!!')
        .send({ alerts: [VALID_ALERT] });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /alerts – validation', () => {
    it('should reject empty alerts array', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({ alerts: [] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert with missing required fields', async () => {
      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({ alerts: [{ alertName: 'incomplete' }] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject alert failing integrity check', async () => {
      const badAlert = {
        ...VALID_ALERT,
        alertName: 'BAD-lead-time',
        severityData: [
          {
            leadTime: {
              start: '2026-03-21T00:00:00Z',
              end: '2026-03-20T00:00:00Z',
            },
            ensembleMemberType: 'median',
            severityKey: 'water_discharge',
            severityValue: 1,
          },
          {
            leadTime: {
              start: '2026-03-21T00:00:00Z',
              end: '2026-03-20T00:00:00Z',
            },
            ensembleMemberType: 'run',
            severityKey: 'water_discharge',
            severityValue: 1,
          },
        ],
      };

      const response = await getServer()
        .post('/alerts')
        .set('x-api-key', apiKey!)
        .send({ alerts: [badAlert] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });
});
