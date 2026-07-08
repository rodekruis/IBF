import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { readEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const countryCodeIso3 = 'MWI';

function mockEvents(params: {
  countryCode: string;
  scenario: string;
  clearEvents?: boolean;
  issuedAt?: string;
}) {
  return getServer()
    .post('/seed/mock-events')
    .query({
      countryCode: params.countryCode,
      scenario: params.scenario,
      ...(params.clearEvents !== undefined && {
        clearEvents: params.clearEvents,
      }),
      ...(params.issuedAt && { issuedAt: params.issuedAt }),
    })
    .send({ secret: env.RESET_SECRET });
}

describe('POST /seed/mock-events', () => {
  let accessToken: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    await resetDB([countryCodeIso3], __filename);
    accessToken = await getAccessToken();
  });

  describe('scenario: events', () => {
    beforeEach(async () => {
      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
        clearEvents: true,
      });
    });

    it('should create events for the country', async () => {
      const response = await readEvents(accessToken, countryCodeIso3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);

      for (const event of response.body) {
        expect(event.eventName).toMatch(new RegExp(`^${countryCodeIso3}_`));
      }
    });
  });

  describe('scenario: no-events', () => {
    it('should close all events for the country', async () => {
      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
        clearEvents: true,
      });

      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.noEvents,
      });

      const response = await readEvents(accessToken, countryCodeIso3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('clearEvents', () => {
    it('should remove existing events when clearEvents is true', async () => {
      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
      });

      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
        clearEvents: true,
      });

      const response = await readEvents(accessToken, countryCodeIso3, {
        active: true,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('issuedAt', () => {
    it('should create events with the given issuedAt date', async () => {
      const pastDate = '2026-01-15T00:00:00.000Z';

      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
        clearEvents: true,
        issuedAt: pastDate,
      });

      const response = await readEvents(accessToken, countryCodeIso3);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].firstIssuedAt).toContain('2026-01');
    });
  });

  describe('validation', () => {
    it('should return 400 for unsupported country', async () => {
      const response = await mockEvents({
        countryCode: 'XXX',
        scenario: MockScenario.events,
      });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should return 403 for wrong secret', async () => {
      const response = await getServer()
        .post('/seed/mock-events')
        .query({
          countryCode: countryCodeIso3,
          scenario: MockScenario.events,
        })
        .send({ secret: 'wrong' });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('should not affect other countries', async () => {
      await resetDB([countryCodeIso3, 'UGA'], __filename);
      accessToken = await getAccessToken();

      // mock events for another country (UGA)
      await mockEvents({
        countryCode: 'UGA',
        scenario: MockScenario.events,
      });

      // clear events for MWI, which should then not clear UGA
      await mockEvents({
        countryCode: countryCodeIso3,
        scenario: MockScenario.events,
        clearEvents: true,
      });

      const ugaResponse = await readEvents(accessToken, 'UGA', {
        active: true,
      });

      expect(ugaResponse.status).toBe(HttpStatus.OK);
      expect(ugaResponse.body.length).toBeGreaterThan(0);
    });
  });
});
