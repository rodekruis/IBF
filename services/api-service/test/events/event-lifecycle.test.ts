import { HttpStatus } from '@nestjs/common';

import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  buildAlert,
  buildForecast,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getActiveEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events - lifecycle across multiple forecasts', () => {
  const apiKey = env.PIPELINE_API_KEY;
  let accessToken: string;

  beforeEach(async () => {
    await resetDB(SeedScript.initialState, __filename);
    accessToken = await getAccessToken();
  });

  it('should create, update, and close events through the alert lifecycle', async () => {
    const viewTimestamp = '2026-03-25T00:00:00Z';
    const laterViewTimestamp = '2026-03-27T00:00:00Z';

    // median=120 → severity 'low', runs all exceed 100 → prob=1.0 → 'high'
    // matrix[low][high] = 'med', below triggerAlertClass 'high' → trigger false
    const alertA = buildAlert({
      alertName: 'TEST-station-A',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    // Same station, upgraded severity: median=500 → severity 'high', prob=1.0 → 'high'
    // matrix[high][high] = 'high', within P7D of issuedAt → trigger true
    const alertAUpgraded = buildAlert({
      alertName: 'TEST-station-A',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 500,
        runValues: [500, 500, 500],
      }),
    });

    // Different station: median=250 → severity 'mid', prob=1.0 → 'high'
    // matrix[mid][high] = 'med', below triggerAlertClass 'high' → trigger false
    const alertB = buildAlert({
      alertName: 'TEST-station-B',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 250,
        runValues: [300, 300, 300],
      }),
    });

    // Step 1: Create alert → creates event
    await createAlerts(
      buildForecast([alertA], { issuedAt: new Date('2026-03-23T12:00:00Z') }),
      apiKey!,
    );
    let response = await getActiveEvents(accessToken, viewTimestamp);
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'TEST-station-A',
      hazardTypes: [HazardType.floods],
      forecastSources: [ForecastSource.glofas],
      alertClass: 'med',
      trigger: false,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      startAt: '2026-03-25T00:00:00.000Z',
      endAt: '2026-03-26T00:00:00.000Z',
      closedAt: null,
      isOngoing: true,
    });

    // Step 2: Create an alert with higher severity → updates event
    await createAlerts(
      buildForecast([alertAUpgraded], {
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
      apiKey!,
    );
    response = await getActiveEvents(accessToken, viewTimestamp);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'TEST-station-A',
      alertClass: 'high',
      trigger: true,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      isOngoing: true,
    });

    // Step 3: Create two alerts → both events open
    await createAlerts(
      buildForecast([alertAUpgraded, alertB], {
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
      apiKey!,
    );
    response = await getActiveEvents(accessToken, viewTimestamp);
    expect(response.body).toHaveLength(2);
    const names = response.body
      .map((e: { eventName: string }) => e.eventName)
      .sort();
    expect(names).toEqual(['TEST-station-A', 'TEST-station-B']);

    // Step 4: Create only alertB → stale event for alertA is closed
    await createAlerts(
      buildForecast([alertB], { issuedAt: new Date('2026-03-24T12:00:00Z') }),
      apiKey!,
    );
    response = await getActiveEvents(accessToken, laterViewTimestamp);
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
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 120,
          runValues: [150, 150, 150],
        }),
      });

      await createAlerts(
        buildForecast([alertThatStartsNextDay], {
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        }),
        apiKey!,
      );

      const responseBeforeStart = await getActiveEvents(
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

      const responseOnStartDay = await getActiveEvents(
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
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 120,
          runValues: [150, 150, 150],
        }),
      });

      await createAlerts(
        buildForecast([expiredAlert], {
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        }),
        apiKey!,
      );

      const responseBeforeExpiry = await getActiveEvents(
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

      const responseAfterExpiry = await getActiveEvents(
        accessToken,
        laterViewTimestamp,
      );
      expect(responseAfterExpiry.status).toBe(HttpStatus.OK);
      expect(responseAfterExpiry.body).toHaveLength(0);
    });
  });

  it('should keep startAt pinned to startAt of first ongoing alert, even if later alerts forecast upcoming alert again', async () => {
    const alertName = 'TEST-station-pinned-start-at';

    const firstUpcomingAlert = buildAlert({
      alertName,
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    const firstOngoingAlert = buildAlert({
      alertName,
      severity: buildSeverityData({
        start: new Date('2026-03-26T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    const laterUpcomingAlert = buildAlert({
      alertName,
      severity: buildSeverityData({
        start: new Date('2026-03-30T00:00:00Z'),
        end: new Date('2026-03-31T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    await createAlerts(
      buildForecast([firstUpcomingAlert], {
        issuedAt: new Date('2026-03-20T12:00:00Z'),
      }),
      apiKey!,
    );
    await createAlerts(
      buildForecast([firstOngoingAlert], {
        issuedAt: new Date('2026-03-27T12:00:00Z'),
      }),
      apiKey!,
    );
    await createAlerts(
      buildForecast([laterUpcomingAlert], {
        issuedAt: new Date('2026-03-28T12:00:00Z'),
      }),
      apiKey!,
    );

    const response = await getActiveEvents(accessToken, '2026-03-29T00:00:00Z');
    expect(response.status).toBe(HttpStatus.OK);

    const pinnedStartEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === alertName,
    );
    expect(pinnedStartEvent).toBeDefined();
    expect(pinnedStartEvent).toMatchObject({
      eventName: alertName,
      firstIssuedAt: '2026-03-20T12:00:00.000Z',
      startAt: '2026-03-26T00:00:00.000Z',
      endAt: '2026-03-31T00:00:00.000Z',
      isOngoing: true,
    });
  });

  it('should update startAt to latest alert startAt when no history is ongoing', async () => {
    const alertName = 'TEST-station-latest-start-at';

    const firstUpcomingAlert = buildAlert({
      alertName,
      severity: buildSeverityData({
        start: new Date('2026-04-05T00:00:00Z'),
        end: new Date('2026-04-06T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    const secondUpcomingAlert = buildAlert({
      alertName,
      severity: buildSeverityData({
        start: new Date('2026-04-07T00:00:00Z'),
        end: new Date('2026-04-08T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });

    await createAlerts(
      buildForecast([firstUpcomingAlert], {
        issuedAt: new Date('2026-04-01T12:00:00Z'),
      }),
      apiKey!,
    );
    await createAlerts(
      buildForecast([secondUpcomingAlert], {
        issuedAt: new Date('2026-04-02T12:00:00Z'),
      }),
      apiKey!,
    );

    const response = await getActiveEvents(accessToken, '2026-04-03T00:00:00Z');
    expect(response.status).toBe(HttpStatus.OK);

    const eventWithLatestStartAt = response.body.find(
      (event: { eventName: string }) => event.eventName === alertName,
    );
    expect(eventWithLatestStartAt).toBeDefined();
    expect(eventWithLatestStartAt).toMatchObject({
      eventName: alertName,
      firstIssuedAt: '2026-04-01T12:00:00.000Z',
      startAt: '2026-04-07T00:00:00.000Z',
      endAt: '2026-04-08T00:00:00.000Z',
      isOngoing: false,
    });
  });

  it('should close old events of same hazardType when current forecast produces no alerts', async () => {
    // Arrange
    const oldForecastTimestamp = '2026-04-10T00:00:00Z';
    const oldFloodsAlertName = 'TEST-station-close-previous';
    const oldFloodsAlert = buildAlert({
      alertName: oldFloodsAlertName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });
    const oldFloodsForecast = buildForecast([oldFloodsAlert], {
      hazardTypes: [HazardType.floods],
      issuedAt: new Date(oldForecastTimestamp),
    });

    const oldDroughtAlertName = 'TEST-drought-event';
    const oldDroughtAlert = buildAlert({
      alertName: oldDroughtAlertName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 120,
        runValues: [150, 150, 150],
      }),
    });
    const oldDroughtForecast = buildForecast([oldDroughtAlert], {
      hazardTypes: [HazardType.drought],
      issuedAt: new Date(oldForecastTimestamp),
    });

    await createAlerts(oldFloodsForecast, apiKey!);
    await createAlerts(oldDroughtForecast, apiKey!);

    // Act
    const currentForecastTimestamp = '2026-04-11T00:00:00Z';
    const currentFloodsAlerts = [];
    const currentFloodsForecast = buildForecast(currentFloodsAlerts, {
      hazardTypes: [HazardType.floods],
      issuedAt: new Date(currentForecastTimestamp),
    });
    await createAlerts(currentFloodsForecast, apiKey!);

    // Assert: Get events immediately after forecast
    const response = await getActiveEvents(
      accessToken,
      currentForecastTimestamp,
    );
    expect(response.status).toBe(HttpStatus.OK);

    const oldFloodsEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === oldFloodsAlertName,
    );
    const oldDroughtEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === oldDroughtAlertName,
    );
    expect(oldFloodsEvent).toBeUndefined();
    expect(oldDroughtEvent).toBeDefined();
  });
});
