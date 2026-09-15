import { HttpStatus } from '@nestjs/common';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { EventStatus } from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { readEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events', () => {
  const viewTimestamp = '2026-03-25T12:00:00Z';
  let accessToken: string;

  beforeAll(async () => {
    await resetDB({
      countryCodes: ['MWI', 'UGA'],
      resetIdentifier: __filename,
    });
    accessToken = await getAccessToken();
  });

  async function seedEventsForReadTests(): Promise<void> {
    await resetDB({
      countryCodes: ['MWI', 'UGA'],
      resetIdentifier: __filename,
    });

    const closedAlert = buildAlert({
      eventName: 'station-closed',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    const ongoingAlert = buildAlert({
      eventName: 'station-ongoing',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    const endedAlert = buildAlert({
      eventName: 'station-ended',
      severity: buildSeverityData({
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    await createAlerts({
      forecast: buildForecast({
        alerts: [closedAlert],
        overrides: {
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        },
      }),
    });
    await createAlerts({
      forecast: buildForecast({
        alerts: [ongoingAlert, endedAlert],
        overrides: {
          issuedAt: new Date('2026-03-24T12:00:00Z'),
        },
      }),
    });
  }

  describe('active filter', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
    });

    it('should return all events when active is omitted', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual(['station-closed', 'station-ended', 'station-ongoing']);
    });

    it('should return only ongoing open events when active is true', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          active: true,
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        eventName: 'station-ongoing',
        eventLabel: 'station-ongoing',
        eventStatus: EventStatus.ongoing,
      });
    });

    it('should return closed or ended events when active is false', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          active: false,
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(2);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual(['station-closed', 'station-ended']);

      const closedEvent = response.body.find(
        (event: { eventName: string }) => event.eventName === 'station-closed',
      );
      const endedEvent = response.body.find(
        (event: { eventName: string }) => event.eventName === 'station-ended',
      );

      expect(closedEvent.eventStatus).toBe(EventStatus.ended);
      expect(endedEvent.eventStatus).toBe(EventStatus.ended);
    });
  });

  describe('order', () => {
    const forecastIssuedAt = new Date('2026-03-24T12:00:00Z');

    function buildEventAlert({
      eventName,
      start,
      end,
    }: {
      eventName: string;
      start: string;
      end: string;
    }): AlertCreateDto {
      return buildAlert({
        eventName,
        severity: buildSeverityData({
          start: new Date(start),
          end: new Date(end),
          medianValue: 10,
          runValues: [10, 10, 10],
        }),
      });
    }

    beforeEach(async () => {
      await resetDB({
        countryCodes: ['MWI', 'UGA'],
        resetIdentifier: __filename,
      });

      // Arrange: insert out of start order so the response order cannot come from insertion order
      await createAlerts({
        forecast: buildForecast({
          alerts: [
            buildEventAlert({
              eventName: 'station-imminent-far',
              start: '2026-03-28T00:00:00Z',
              end: '2026-03-29T00:00:00Z',
            }),
            buildEventAlert({
              eventName: 'station-ongoing-later',
              start: '2026-03-25T06:00:00Z',
              end: '2026-03-26T00:00:00Z',
            }),
            buildEventAlert({
              eventName: 'station-imminent-near',
              start: '2026-03-26T00:00:00Z',
              end: '2026-03-27T00:00:00Z',
            }),
            buildEventAlert({
              eventName: 'station-ongoing-earlier',
              start: '2026-03-24T18:00:00Z',
              end: '2026-03-30T00:00:00Z',
            }),
          ],
          overrides: { issuedAt: forecastIssuedAt },
        }),
      });
    });

    it('should return ongoing events first and then imminent events by start date', async () => {
      // Act
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          active: true,
          timestamp: viewTimestamp,
        },
      });

      // Assert
      expect(response.status).toBe(HttpStatus.OK);
      expect(
        response.body.map(
          (event: { eventName: string; eventStatus: EventStatus }) => [
            event.eventName,
            event.eventStatus,
          ],
        ),
      ).toEqual([
        ['station-ongoing-earlier', EventStatus.ongoing],
        ['station-ongoing-later', EventStatus.ongoing],
        ['station-imminent-near', EventStatus.imminent],
        ['station-imminent-far', EventStatus.imminent],
      ]);
    });

    it('should return all events by start date when active is omitted', async () => {
      // Act
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      // Assert
      expect(response.status).toBe(HttpStatus.OK);
      const startDates = response.body.map(
        (event: { startAt: string }) => event.startAt,
      );
      expect(startDates).toHaveLength(4);
      expect(startDates).toEqual([...startDates].sort());
    });
  });

  describe('event label derivation', () => {
    it('should derive event label from event name', async () => {
      const eventName = 'Meher_MAM';
      await createAlerts({
        forecast: buildForecast({
          alerts: [
            buildAlert({
              eventName,
            }),
          ],
        }),
      });

      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
      });
      const event = response.body.find(
        (event: { eventName: string }) => event.eventName === eventName,
      );

      expect(event.eventLabel).toBe('Meher_MAM');
    });
  });

  describe('countryCodesIso3 filter', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
    });

    it('should return only events for the specified country', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
      expect(
        response.body.every(
          (event: { countryCodeIso3: string }) =>
            event.countryCodeIso3 === 'MWI',
        ),
      ).toBe(true);
    });

    it('should return no events for a country with no events', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['KEN'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(0);
    });

    it('should return all events when countryCodesIso3 is omitted', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: undefined,
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
    });
  });

  describe('multiple countries', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
      await createAlerts({
        forecast: buildForecast({
          alerts: [buildAlert({ eventName: 'station-second-country' })],
          overrides: {
            countryCodeIso3: 'UGA',
            issuedAt: new Date('2026-03-24T12:00:00Z'),
          },
        }),
      });
    });

    it('should return events for all requested countries', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['MWI', 'UGA'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(4);
      expect(
        new Set(
          response.body.map(
            (event: { countryCodeIso3: string }) => event.countryCodeIso3,
          ),
        ),
      ).toEqual(new Set(['MWI', 'UGA']));
    });

    it('should ignore unknown countries in the list', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: ['UGA', 'KEN'],
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].countryCodeIso3).toBe('UGA');
    });

    it('should return events for all countries when countryCodesIso3 is omitted', async () => {
      const response = await readEvents({
        accessToken,
        countryCodesIso3: undefined,
        query: {
          timestamp: viewTimestamp,
        },
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(4);
    });
  });
});
