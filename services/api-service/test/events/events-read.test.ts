import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { readEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events', () => {
  const apiKey = env.PIPELINE_API_KEY;
  const viewTimestamp = '2026-03-25T12:00:00Z';
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
    accessToken = await getAccessToken();
  });

  async function seedEventsForReadTests(): Promise<void> {
    await resetDB(SeedScript.initialState, __filename);

    const closedAlert = buildAlert({
      alertName: 'TEST-station-closed',
      issuedAt: new Date('2026-03-23T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 500,
        runValues: [500, 500, 500],
      }),
    });

    const ongoingAlert = buildAlert({
      alertName: 'TEST-station-ongoing',
      issuedAt: new Date('2026-03-24T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 250,
        runValues: [300, 300, 300],
      }),
    });

    const expiredAlert = buildAlert({
      alertName: 'TEST-station-expired',
      issuedAt: new Date('2026-03-24T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    await createAlerts([closedAlert], apiKey!);
    await createAlerts([ongoingAlert, expiredAlert], apiKey!);
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
        'TEST-station-closed',
        'TEST-station-expired',
        'TEST-station-ongoing',
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
        eventName: 'TEST-station-ongoing',
        closedAt: null,
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
      ).toEqual(['TEST-station-closed', 'TEST-station-expired']);

      const closedEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'TEST-station-closed',
      );
      const expiredEvent = response.body.find(
        (event: { eventName: string }) =>
          event.eventName === 'TEST-station-expired',
      );

      expect(closedEvent.closedAt).not.toBeNull();
      expect(closedEvent.isOngoing).toBe(false);
      expect(expiredEvent.closedAt).toBeNull();
      expect(expiredEvent.isOngoing).toBe(false);
    });
  });
});
