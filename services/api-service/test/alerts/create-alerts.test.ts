import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { createAlert } from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

const VALID_ALERT = createAlert('TEST-flood-2026-03-23');

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
        .send([VALID_ALERT]);

      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('POST /alerts – authentication', () => {
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

  describe('POST /alerts – validation', () => {
    it('should allow empty alerts array', async () => {
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
            ensembleMemberType: 'median',
            severityKey: 'water_discharge',
            severityValue: 1,
          },
          {
            timeInterval: {
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
        .send([badAlert]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });
});
