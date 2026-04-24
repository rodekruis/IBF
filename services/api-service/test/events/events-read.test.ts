import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
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
    await resetDB(SeedScript.test, __filename);
    accessToken = await getAccessToken();
  });

  async function seedEventsForReadTests(): Promise<void> {
    await resetDB(SeedScript.test, __filename);

    const closedAlert = buildAlert({
      eventName: 'KEN_floods_station-closed',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 500,
        runValues: [500, 500, 500],
      }),
    });

    const ongoingAlert = buildAlert({
      eventName: 'KEN_floods_station-ongoing',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 250,
        runValues: [300, 300, 300],
      }),
    });

    const expiredAlert = buildAlert({
      eventName: 'KEN_floods_station-expired',
      severity: buildSeverityData({
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
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

  describe('authentication', () => {
    it('should reject request without authentication', async () => {
      const response = await readEvents('');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('active filter', () => {
    beforeEach(async () => {
      await seedEventsForReadTests();
    });

    it('should return all events when active is omitted', async () => {
      const response = await readEvents(accessToken, {
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(3);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual([
        'KEN_floods_station-closed',
        'KEN_floods_station-expired',
        'KEN_floods_station-ongoing',
      ]);
    });

    it('should return only ongoing open events when active is true', async () => {
      const response = await readEvents(accessToken, {
        active: true,
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        eventName: 'KEN_floods_station-ongoing',
        eventLabel: 'station-ongoing',
        isOngoing: true,
      });
    });

    it('should return closed or expired events when active is false', async () => {
      const response = await readEvents(accessToken, {
        active: false,
        timestamp: viewTimestamp,
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveLength(2);
      expect(
        response.body
          .map((event: { eventName: string }) => event.eventName)
          .sort(),
      ).toEqual(['KEN_floods_station-closed', 'KEN_floods_station-expired']);

      const closedEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'KEN_floods_station-closed',
      );
      const expiredEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'KEN_floods_station-expired',
      );

      expect(closedEvent.isOngoing).toBe(false);
      expect(expiredEvent.isOngoing).toBe(false);
    });
  });

  describe('event label derivation', () => {
    it('should derive event label from event name', async () => {
      // Seed an event with a name that has multiple parts
      const droughtEventName = 'ETH_drought_Meher_MAM';
      await createAlerts(
        buildForecast([
          buildAlert({
            eventName: droughtEventName,
          }),
        ]),
      );

      const response = await readEvents(accessToken);
      const event = response.body.find(
        (event: { eventName: string }) => event.eventName === droughtEventName,
      );

      expect(event.eventLabel).toBe('Meher MAM');
    });
  });
});
