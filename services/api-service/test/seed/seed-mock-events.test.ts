import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { readEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const COUNTRY_CODE_ISO3 = 'MWI';
const SECOND_COUNTRY_CODE_ISO3 = 'UGA';

function mockEvents(params: {
  countryCodes?: string[];
  scenario: string;
  clearEvents?: boolean;
  issuedAt?: string;
}) {
  return getServer()
    .post('/mock')
    .query({
      ...(params.countryCodes && {
        countryCodes: params.countryCodes.join(','),
      }),
      scenario: params.scenario,
      ...(params.clearEvents !== undefined && {
        clearEvents: params.clearEvents,
      }),
      ...(params.issuedAt && { issuedAt: params.issuedAt }),
    })
    .send({ secret: env.RESET_SECRET });
}

describe('POST /mock', () => {
  let accessToken: string;

  jest.setTimeout(60_000);

  describe('single country', () => {
    beforeAll(async () => {
      await resetDB([COUNTRY_CODE_ISO3], __filename);
      accessToken = await getAccessToken();
    });

    beforeEach(async () => {
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
        clearEvents: true,
      });
    });

    it('should create events for the country', async () => {
      const response = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);

      for (const event of response.body) {
        expect(event.countryCodeIso3).toBe(COUNTRY_CODE_ISO3);
      }
    });

    it('should close all events when scenario is no-events', async () => {
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.noEvents,
      });

      const response = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(0);
    });

    it('should remove existing events when clearEvents is true', async () => {
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
      });

      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
        clearEvents: true,
      });

      const response = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should create events with the given issuedAt date', async () => {
      const pastDate = '2026-01-15T00:00:00.000Z';

      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
        clearEvents: true,
        issuedAt: pastDate,
      });

      const response = await readEvents(accessToken, COUNTRY_CODE_ISO3);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].firstIssuedAt).toContain('2026-01');
    });

    it('should return 400 for unsupported country', async () => {
      const response = await mockEvents({
        countryCodes: ['XXX'],
        scenario: MockScenario.events,
      });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should return 403 for wrong secret', async () => {
      const response = await getServer()
        .post('/mock')
        .query({
          countryCodes: COUNTRY_CODE_ISO3,
          scenario: MockScenario.events,
        })
        .send({ secret: 'wrong' });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('multiple countries', () => {
    beforeAll(async () => {
      await resetDB([COUNTRY_CODE_ISO3, SECOND_COUNTRY_CODE_ISO3], __filename);
      accessToken = await getAccessToken();
    });

    it('should create events for multiple countries in one call', async () => {
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3, SECOND_COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
        clearEvents: true,
      });

      const mwiResponse = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });
      const ugaResponse = await readEvents(
        accessToken,
        SECOND_COUNTRY_CODE_ISO3,
        {
          active: true,
        },
      );

      expect(mwiResponse.status).toBe(HttpStatus.OK);
      expect(mwiResponse.body.length).toBeGreaterThan(0);
      expect(ugaResponse.status).toBe(HttpStatus.OK);
      expect(ugaResponse.body.length).toBeGreaterThan(0);
    });

    it('should clear events for multiple countries in one call', async () => {
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3, SECOND_COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
      });

      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3, SECOND_COUNTRY_CODE_ISO3],
        scenario: MockScenario.noEvents,
      });

      const mwiResponse = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });
      const ugaResponse = await readEvents(
        accessToken,
        SECOND_COUNTRY_CODE_ISO3,
        {
          active: true,
        },
      );

      expect(mwiResponse.status).toBe(HttpStatus.OK);
      expect(mwiResponse.body).toHaveLength(0);
      expect(ugaResponse.status).toBe(HttpStatus.OK);
      expect(ugaResponse.body).toHaveLength(0);
    });

    it('should not affect other countries', async () => {
      // mock events for another country (UGA)
      await mockEvents({
        countryCodes: [SECOND_COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
      });

      // clear events for MWI, which should then not clear UGA
      await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3],
        scenario: MockScenario.events,
        clearEvents: true,
      });

      const ugaResponse = await readEvents(
        accessToken,
        SECOND_COUNTRY_CODE_ISO3,
        {
          active: true,
        },
      );

      expect(ugaResponse.status).toBe(HttpStatus.OK);
      expect(ugaResponse.body.length).toBeGreaterThan(0);
    });

    it('should return 400 if any country code is unsupported', async () => {
      const response = await mockEvents({
        countryCodes: [COUNTRY_CODE_ISO3, 'XXX'],
        scenario: MockScenario.events,
      });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should mock all seeded countries when countryCodes is omitted', async () => {
      const response = await mockEvents({
        scenario: MockScenario.events,
        clearEvents: true,
      });

      expect(response.status).toBe(HttpStatus.OK);

      const mwiResponse = await readEvents(accessToken, COUNTRY_CODE_ISO3, {
        active: true,
      });
      const ugaResponse = await readEvents(
        accessToken,
        SECOND_COUNTRY_CODE_ISO3,
        { active: true },
      );

      expect(mwiResponse.body.length).toBeGreaterThan(0);
      expect(ugaResponse.body.length).toBeGreaterThan(0);
    });
  });
});
