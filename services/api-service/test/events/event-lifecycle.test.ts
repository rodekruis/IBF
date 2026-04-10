import { HttpStatus } from '@nestjs/common';

import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getOpenEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events - lifecycle across multiple forecasts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.initialState, __filename);
    accessToken = await getAccessToken();
  });

  it('should create, update, and close events through the alert lifecycle', async () => {
    const viewTimestamp = '2026-03-25T00:00:00Z';
    const laterViewTimestamp = '2026-03-27T00:00:00Z';

    // median=120 → severity 'low', runs all exceed 100 → prob=1.0 → 'high'
    // matrix[low][high] = 'min', below triggerAlertClass 'max' → trigger false
    const alertA = buildAlert({
      alertName: 'TEST-station-A',
      issuedAt: new Date('2026-03-23T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    // Same station, upgraded severity: median=500 → severity 'high', prob=1.0 → 'high'
    // matrix[high][high] = 'max', within P7D of issuedAt → trigger true
    const alertAUpgraded = buildAlert({
      ...alertA,
      issuedAt: new Date('2026-03-24T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 500,
        runValues: [500, 500, 500],
      }),
    });

    // Different station: median=250 → severity 'mid', prob=1.0 → 'high'
    // matrix[mid][high] = 'med', below triggerAlertClass 'max' → trigger false
    const alertB = buildAlert({
      alertName: 'TEST-station-B',
      issuedAt: new Date('2026-03-24T12:00:00Z'),
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 250,
        runValues: [300, 300, 300],
      }),
    });

    // Step 1: Create alert → creates event
    await createAlerts([alertA], apiKey!);
    let response = await getOpenEvents(accessToken, viewTimestamp);
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
      isOngoing: true,
    });

    // Step 2: Create an alert with higher severity → updates event
    await createAlerts([alertAUpgraded], apiKey!);
    response = await getOpenEvents(accessToken, viewTimestamp);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'TEST-station-A',
      alertClass: 'max',
      trigger: true,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      isOngoing: true,
    });

    // Step 3: Create two alerts → both events open
    await createAlerts([alertAUpgraded, alertB], apiKey!);
    response = await getOpenEvents(accessToken, viewTimestamp);
    expect(response.body).toHaveLength(2);
    const names = response.body
      .map((e: { eventName: string }) => e.eventName)
      .sort();
    expect(names).toEqual(['TEST-station-A', 'TEST-station-B']);

    // Step 4: Create only alertB → stale event for alertA is closed
    await createAlerts([alertB], apiKey!);
    response = await getOpenEvents(accessToken, laterViewTimestamp);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].eventName).toBe('TEST-station-B');
    expect(response.body[0].isOngoing).toBe(true);
  });

  describe('view-timestamp behavior', () => {
    it('should mark an event as ongoing today when the latest available forecast from yesterday predicted the event to start today', async () => {
      const viewTimestamp = '2026-03-23T12:00:00Z';
      const laterViewTimestamp = '2026-03-24T12:00:00Z';

      const alertThatStartsNextDay = buildAlert({
        alertName: 'TEST-station-no-rerun',
        issuedAt: new Date('2026-03-23T12:00:00Z'),
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 120,
          runValues: [150, 150, 150],
        }),
      });

      await createAlerts([alertThatStartsNextDay], apiKey!);

      const responseBeforeStart = await getOpenEvents(
        accessToken,
        viewTimestamp,
      );
      expect(responseBeforeStart.status).toBe(HttpStatus.OK);
      expect(responseBeforeStart.body).toHaveLength(1);
      expect(responseBeforeStart.body[0]).toMatchObject({
        eventName: 'TEST-station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: false,
      });

      const responseOnStartDay = await getOpenEvents(
        accessToken,
        laterViewTimestamp,
      );
      expect(responseOnStartDay.status).toBe(HttpStatus.OK);
      expect(responseOnStartDay.body).toHaveLength(1);
      expect(responseOnStartDay.body[0]).toMatchObject({
        eventName: 'TEST-station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: true,
      });
    });

    it('should exclude events where endAt <= view-timestamp', async () => {
      const viewTimestamp = '2026-03-24T12:00:00Z';
      const laterViewTimestamp = '2026-03-25T12:00:00Z';

      const expiredAlert = buildAlert({
        alertName: 'TEST-station-expired',
        issuedAt: new Date('2026-03-23T12:00:00Z'),
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 120,
          runValues: [150, 150, 150],
        }),
      });

      await createAlerts([expiredAlert], apiKey!);

      const responseBeforeExpiry = await getOpenEvents(
        accessToken,
        viewTimestamp,
      );
      expect(responseBeforeExpiry.status).toBe(HttpStatus.OK);
      expect(responseBeforeExpiry.body).toHaveLength(1);
      expect(responseBeforeExpiry.body[0]).toMatchObject({
        eventName: 'TEST-station-expired',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: true,
      });

      const responseAfterExpiry = await getOpenEvents(
        accessToken,
        laterViewTimestamp,
      );
      expect(responseAfterExpiry.status).toBe(HttpStatus.OK);
      expect(responseAfterExpiry.body).toHaveLength(0);
    });
  });
});
