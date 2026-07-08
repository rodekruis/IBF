import { HttpStatus } from '@nestjs/common';

import {
  AlertClass,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';
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
  // Uses UGA because it has multi-level severity classification and both floods + drought configs
  const countryCodeIso3 = 'UGA';
  let accessToken: string;

  beforeEach(async () => {
    await resetDB([countryCodeIso3], __filename);
    accessToken = await getAccessToken();
  });

  it('should create, update, and close events through the alert lifecycle', async () => {
    const viewTimestamp = '2026-03-25T00:00:00Z';
    const laterViewTimestamp = '2026-03-27T00:00:00Z';

    // median=2 → severity 'medium' (≥2), runs all exceed 2 → prob=1.0 → 'single'
    // matrix[medium][single] = 'medium', below triggerAlertClass 'high' → trigger false
    const alertA = buildAlert({
      eventName: 'UGA_floods_station-A',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 2,
        runValues: [2, 2, 2],
      }),
    });

    // Same station, upgraded severity: median=25 → severity 'high', prob=1.0 → 'single'
    // matrix[high][single] = 'high', within P5D of issuedAt → trigger true
    const alertAUpgraded = buildAlert({
      eventName: 'UGA_floods_station-A',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    // Different station: median=10 → severity 'high', prob=1.0 → 'single'
    // matrix[high][single] = 'high', within P5D of issuedAt → trigger true
    const alertB = buildAlert({
      eventName: 'UGA_floods_station-B',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    // Step 1: Create alert → creates event
    await createAlerts(
      buildForecast([alertA], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-23T12:00:00Z'),
      }),
    );
    let response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      viewTimestamp,
    );
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'UGA_floods_station-A',
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      alertClass: AlertClass.medium,
      trigger: false,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      lastUpdatedAt: '2026-03-23T12:00:00.000Z',
      startAt: '2026-03-25T00:00:00.000Z',
      endAt: '2026-03-26T00:00:00.000Z',
      isOngoing: true,
      exposedAdminAreas: [
        {
          placeCode: 'MW31001',
          adminLevel: 3,
          exposure: [{ layerName: 'populationExposed', exposed: 1000 }],
        },
      ],
    });

    // Step 2: Create an alert with higher severity → updates event
    await createAlerts(
      buildForecast([alertAUpgraded], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    );
    response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      viewTimestamp,
    );
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'UGA_floods_station-A',
      alertClass: AlertClass.high,
      trigger: true,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      lastUpdatedAt: '2026-03-24T12:00:00.000Z',
      isOngoing: true,
      exposedAdminAreas: [
        {
          placeCode: 'MW31001',
          adminLevel: 3,
          exposure: [{ layerName: 'populationExposed', exposed: 1000 }],
        },
      ],
    });

    // Step 3: Create two alerts → both events open
    await createAlerts(
      buildForecast([alertAUpgraded, alertB], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    );
    response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      viewTimestamp,
    );
    expect(response.body).toHaveLength(2);
    const names = response.body
      .map((e: { eventName: string }) => e.eventName)
      .sort();
    expect(names).toEqual(['UGA_floods_station-A', 'UGA_floods_station-B']);

    // Step 4: Create only alertB → stale event for alertA is closed
    await createAlerts(
      buildForecast([alertB], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    );
    response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      laterViewTimestamp,
    );
    expect(response.body).toHaveLength(1);
    expect(response.body[0].eventName).toBe('UGA_floods_station-B');
    expect(response.body[0].isOngoing).toBe(true);
  });

  describe('view-timestamp behavior', () => {
    it('should mark an event as ongoing today when the latest available forecast from yesterday predicted the event to start today', async () => {
      const viewTimestamp = '2026-03-23T12:00:00Z';
      const laterViewTimestamp = '2026-03-24T12:00:00Z';

      const alertThatStartsNextDay = buildAlert({
        eventName: 'UGA_floods_station-no-rerun',
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 25,
          runValues: [25, 25, 25],
        }),
      });

      await createAlerts(
        buildForecast([alertThatStartsNextDay], {
          countryCodeIso3,
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        }),
      );

      const responseBeforeStart = await getActiveEvents(
        accessToken,
        countryCodeIso3,
        viewTimestamp,
      );
      expect(responseBeforeStart.status).toBe(HttpStatus.OK);
      expect(responseBeforeStart.body).toHaveLength(1);
      expect(responseBeforeStart.body[0]).toMatchObject({
        eventName: 'UGA_floods_station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: false,
      });

      const responseOnStartDay = await getActiveEvents(
        accessToken,
        countryCodeIso3,
        laterViewTimestamp,
      );
      expect(responseOnStartDay.status).toBe(HttpStatus.OK);
      expect(responseOnStartDay.body).toHaveLength(1);
      expect(responseOnStartDay.body[0]).toMatchObject({
        eventName: 'UGA_floods_station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: true,
      });
    });

    it('should exclude events where endAt <= view-timestamp', async () => {
      const viewTimestamp = '2026-03-24T12:00:00Z';
      const laterViewTimestamp = '2026-03-25T12:00:00Z';

      const expiredAlert = buildAlert({
        eventName: 'UGA_floods_station-expired',
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 25,
          runValues: [25, 25, 25],
        }),
      });

      await createAlerts(
        buildForecast([expiredAlert], {
          countryCodeIso3,
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        }),
      );

      const responseBeforeExpiry = await getActiveEvents(
        accessToken,
        countryCodeIso3,
        viewTimestamp,
      );
      expect(responseBeforeExpiry.status).toBe(HttpStatus.OK);
      expect(responseBeforeExpiry.body).toHaveLength(1);
      expect(responseBeforeExpiry.body[0]).toMatchObject({
        eventName: 'UGA_floods_station-expired',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        isOngoing: true,
      });

      const responseAfterExpiry = await getActiveEvents(
        accessToken,
        countryCodeIso3,
        laterViewTimestamp,
      );
      expect(responseAfterExpiry.status).toBe(HttpStatus.OK);
      expect(responseAfterExpiry.body).toHaveLength(0);
    });
  });

  it('should keep startAt pinned to startAt of first ongoing alert, even if later alerts forecast upcoming alert again', async () => {
    const eventName = 'UGA_floods_station-pinned-start-at';

    const firstUpcomingAlert = buildAlert({
      eventName,
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    const firstOngoingAlert = buildAlert({
      eventName,
      severity: buildSeverityData({
        start: new Date('2026-03-26T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    const laterUpcomingAlert = buildAlert({
      eventName,
      severity: buildSeverityData({
        start: new Date('2026-03-30T00:00:00Z'),
        end: new Date('2026-03-31T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    await createAlerts(
      buildForecast([firstUpcomingAlert], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-20T12:00:00Z'),
      }),
    );
    await createAlerts(
      buildForecast([firstOngoingAlert], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-27T12:00:00Z'),
      }),
    );
    await createAlerts(
      buildForecast([laterUpcomingAlert], {
        countryCodeIso3,
        issuedAt: new Date('2026-03-28T12:00:00Z'),
      }),
    );

    const response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      '2026-03-29T00:00:00Z',
    );
    expect(response.status).toBe(HttpStatus.OK);

    const pinnedStartEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === eventName,
    );
    expect(pinnedStartEvent).toBeDefined();
    expect(pinnedStartEvent).toMatchObject({
      eventName,
      firstIssuedAt: '2026-03-20T12:00:00.000Z',
      startAt: '2026-03-26T00:00:00.000Z',
      endAt: '2026-03-31T00:00:00.000Z',
      isOngoing: true,
    });
  });

  it('should update startAt to latest alert startAt when no history is ongoing', async () => {
    const eventName = 'UGA_floods_station-latest-start-at';

    const firstUpcomingAlert = buildAlert({
      eventName,
      severity: buildSeverityData({
        start: new Date('2026-04-05T00:00:00Z'),
        end: new Date('2026-04-06T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    const secondUpcomingAlert = buildAlert({
      eventName,
      severity: buildSeverityData({
        start: new Date('2026-04-07T00:00:00Z'),
        end: new Date('2026-04-08T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });

    await createAlerts(
      buildForecast([firstUpcomingAlert], {
        countryCodeIso3,
        issuedAt: new Date('2026-04-01T12:00:00Z'),
      }),
    );
    await createAlerts(
      buildForecast([secondUpcomingAlert], {
        countryCodeIso3,
        issuedAt: new Date('2026-04-02T12:00:00Z'),
      }),
    );

    const response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      '2026-04-03T00:00:00Z',
    );
    expect(response.status).toBe(HttpStatus.OK);

    const eventWithLatestStartAt = response.body.find(
      (event: { eventName: string }) => event.eventName === eventName,
    );
    expect(eventWithLatestStartAt).toBeDefined();
    expect(eventWithLatestStartAt).toMatchObject({
      eventName,
      firstIssuedAt: '2026-04-01T12:00:00.000Z',
      startAt: '2026-04-07T00:00:00.000Z',
      endAt: '2026-04-08T00:00:00.000Z',
      isOngoing: false,
    });
  });

  it('should close old events of same hazardType when current forecast produces no alerts', async () => {
    const oldForecastTimestamp = '2026-04-10T00:00:00Z';
    const oldFloodsEventName = 'UGA_floods_station-close-previous';
    const oldFloodsAlert = buildAlert({
      eventName: oldFloodsEventName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });
    const oldFloodsForecast = buildForecast([oldFloodsAlert], {
      countryCodeIso3,
      hazardType: HazardType.floods,
      issuedAt: new Date(oldForecastTimestamp),
    });

    const oldDroughtEventName = 'UGA_drought_event-close-previous';
    const oldDroughtAlert = buildAlert({
      eventName: oldDroughtEventName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });
    const oldDroughtForecast = buildForecast([oldDroughtAlert], {
      countryCodeIso3,
      hazardType: HazardType.drought,
      issuedAt: new Date(oldForecastTimestamp),
    });

    await createAlerts(oldFloodsForecast);
    await createAlerts(oldDroughtForecast);

    // Act
    const currentForecastTimestamp = '2026-04-11T00:00:00Z';
    const currentFloodsAlerts: never[] = [];
    const currentFloodsForecast = buildForecast(currentFloodsAlerts, {
      countryCodeIso3,
      hazardType: HazardType.floods,
      issuedAt: new Date(currentForecastTimestamp),
    });
    await createAlerts(currentFloodsForecast);

    const response = await getActiveEvents(
      accessToken,
      countryCodeIso3,
      currentForecastTimestamp,
    );
    expect(response.status).toBe(HttpStatus.OK);

    const oldFloodsEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === oldFloodsEventName,
    );
    const oldDroughtEvent = response.body.find(
      (event: { eventName: string }) => event.eventName === oldDroughtEventName,
    );
    expect(oldFloodsEvent).toBeUndefined();
    expect(oldDroughtEvent).toBeDefined();
  });
});
