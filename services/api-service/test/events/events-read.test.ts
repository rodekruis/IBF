import { HttpStatus } from '@nestjs/common';

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
    await resetDB(['MWI'], __filename);
    accessToken = await getAccessToken();
  });

  async function seedEventsForReadTests(): Promise<void> {
    await resetDB(['MWI'], __filename);

    const closedAlert = buildAlert({
      eventName: 'MWI_floods_station-closed',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    const ongoingAlert = buildAlert({
      eventName: 'MWI_floods_station-ongoing',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    const expiredAlert = buildAlert({
      eventName: 'MWI_floods_station-expired',
      severity: buildSeverityData({
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    await createAlerts(
      buildForecast([closedAlert], {
        issuedAt: new Date('2026-03-23T12:00:00Z'),
      }),
    );
    await createAlerts(
      buildForecast([ongoingAlert, expiredAlert], {
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    );
  }

  describe('active filter', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
    });

    it('should return all events when active is omitted', async () => {
      const response = await readEvents(accessToken, 'MWI', {
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual([
        'MWI_floods_station-closed',
        'MWI_floods_station-expired',
        'MWI_floods_station-ongoing',
      ]);
    });

    it('should return only ongoing open events when active is true', async () => {
      const response = await readEvents(accessToken, 'MWI', {
        active: true,
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        eventName: 'MWI_floods_station-ongoing',
        eventLabel: 'station-ongoing',
        isOngoing: true,
      });
    });

    it('should return closed or expired events when active is false', async () => {
      const response = await readEvents(accessToken, 'MWI', {
        active: false,
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(2);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual(['MWI_floods_station-closed', 'MWI_floods_station-expired']);

      const closedEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'MWI_floods_station-closed',
      );
      const expiredEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'MWI_floods_station-expired',
      );

      expect(closedEvent.isOngoing).toBe(false);
      expect(expiredEvent.isOngoing).toBe(false);
    });
  });

  describe('event label derivation', () => {
    it('should derive event label from event name', async () => {
      const eventName = 'MWI_floods_Meher_MAM';
      await createAlerts(
        buildForecast([
          buildAlert({
            eventName,
          }),
        ]),
      );

      const response = await readEvents(accessToken, 'MWI');
      const event = response.body.find(
        (event: { eventName: string }) => event.eventName === eventName,
      );

      expect(event.eventLabel).toBe('Meher MAM');
    });
  });

  describe('countryCodeIso3 filter', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
    });

    it('should return only events for the specified country', async () => {
      const response = await readEvents(accessToken, 'MWI', {
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
      expect(
        response.body.every((event: { eventName: string }) =>
          event.eventName.startsWith('MWI_'),
        ),
      ).toBe(true);
    });

    it('should return no events for a country with no events', async () => {
      const response = await readEvents(accessToken, 'KEN', {
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(0);
    });

    it('should return all events when countryCodeIso3 is omitted', async () => {
      const response = await readEvents(accessToken, undefined, {
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
    });
  });
});
