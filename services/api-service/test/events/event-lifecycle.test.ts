import { HttpStatus } from '@nestjs/common';

import {
  AlertClass,
  EventStatus,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import {
  getActiveEvents,
  getEndedEvents,
} from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events - lifecycle across multiple forecasts', () => {
  // Uses UGA because it has multi-level severity classification and both floods + drought configs
  const countryCodeIso3 = 'UGA';
  let accessToken: string;

  beforeEach(async () => {
    await resetDB({
      countryCodes: [countryCodeIso3],
      resetIdentifier: __filename,
    });
    accessToken = await getAccessToken();
  });

  it('should create, update, and close events through the alert lifecycle', async () => {
    const viewTimestamp = '2026-03-25T00:00:00Z';
    const laterViewTimestamp = '2026-03-27T00:00:00Z';

    // median=2 → severity 'medium' (≥2), runs all exceed 2 → prob=1.0 → 'single'
    // matrix[medium][single] = 'medium', below triggerAlertClass 'high' → trigger false
    const alertA = buildAlert({
      eventName: 'station-A',
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
      eventName: 'station-A',
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
      eventName: 'station-B',
      severity: buildSeverityData({
        start: new Date('2026-03-27T00:00:00Z'),
        end: new Date('2026-03-28T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 10, 10],
      }),
    });

    // Step 1: Create alert → creates event
    await createAlerts({
      forecast: buildForecast({
        alerts: [alertA],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-23T12:00:00Z'),
        },
      }),
    });
    let response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: viewTimestamp,
    });
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'station-A',
      hazardType: HazardType.floods,
      forecastSources: [{ name: ForecastSource.glofasRiverDischarge }],
      alertClass: AlertClass.medium,
      trigger: false,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      lastUpdatedAt: '2026-03-23T12:00:00.000Z',
      startAt: '2026-03-25T00:00:00.000Z',
      endAt: '2026-03-26T00:00:00.000Z',
      eventStatus: EventStatus.ongoing,
      exposedAdminAreas: {
        '3': [
          {
            placeCode: 'MW31001',
            name: 'MW31001',
            adminLevel: 3,
            exposure: [
              { layerName: 'exposedPopulation', exposed: 1000, total: null },
            ],
          },
        ],
      },
    });

    // Step 2: Create an alert with higher severity → updates event
    await createAlerts({
      forecast: buildForecast({
        alerts: [alertAUpgraded],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-24T12:00:00Z'),
        },
      }),
    });
    response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: viewTimestamp,
    });
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      eventName: 'station-A',
      alertClass: AlertClass.high,
      trigger: true,
      firstIssuedAt: '2026-03-23T12:00:00.000Z',
      lastUpdatedAt: '2026-03-24T12:00:00.000Z',
      eventStatus: EventStatus.ongoing,
      exposedAdminAreas: {
        '3': [
          {
            placeCode: 'MW31001',
            name: 'MW31001',
            adminLevel: 3,
            exposure: [
              { layerName: 'exposedPopulation', exposed: 1000, total: null },
            ],
          },
        ],
      },
    });

    // Step 3: Create two alerts → both events open
    await createAlerts({
      forecast: buildForecast({
        alerts: [alertAUpgraded, alertB],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-24T12:00:00Z'),
        },
      }),
    });
    response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: viewTimestamp,
    });
    expect(response.body).toHaveLength(2);
    const names = response.body
      .map((e: { eventName: string }) => e.eventName)
      .sort();
    expect(names).toEqual(['station-A', 'station-B']);

    // Step 4: Create only alertB → stale event for alertA is closed
    await createAlerts({
      forecast: buildForecast({
        alerts: [alertB],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-24T12:00:00Z'),
        },
      }),
    });
    response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: laterViewTimestamp,
    });
    expect(response.body).toHaveLength(1);
    expect(response.body[0].eventName).toBe('station-B');
    expect(response.body[0].eventStatus).toBe(EventStatus.ongoing);
  });

  describe('view-timestamp behavior', () => {
    it('should mark an event as ongoing today when the latest available forecast from yesterday predicted the event to start today', async () => {
      const viewTimestamp = '2026-03-23T12:00:00Z';
      const laterViewTimestamp = '2026-03-24T12:00:00Z';

      const alertThatStartsNextDay = buildAlert({
        eventName: 'station-no-rerun',
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 25,
          runValues: [25, 25, 25],
        }),
      });

      await createAlerts({
        forecast: buildForecast({
          alerts: [alertThatStartsNextDay],
          overrides: {
            countryCodeIso3,
            issuedAt: new Date('2026-03-23T12:00:00Z'),
          },
        }),
      });

      const responseBeforeStart = await getActiveEvents({
        accessToken,
        countryCodesIso3: [countryCodeIso3],
        timestamp: viewTimestamp,
      });
      expect(responseBeforeStart.status).toBe(HttpStatus.OK);
      expect(responseBeforeStart.body).toHaveLength(1);
      expect(responseBeforeStart.body[0]).toMatchObject({
        eventName: 'station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        eventStatus: EventStatus.imminent,
      });

      const responseOnStartDay = await getActiveEvents({
        accessToken,
        countryCodesIso3: [countryCodeIso3],
        timestamp: laterViewTimestamp,
      });
      expect(responseOnStartDay.status).toBe(HttpStatus.OK);
      expect(responseOnStartDay.body).toHaveLength(1);
      expect(responseOnStartDay.body[0]).toMatchObject({
        eventName: 'station-no-rerun',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        eventStatus: EventStatus.ongoing,
      });
    });

    it('should exclude events where endAt <= view-timestamp', async () => {
      const viewTimestamp = '2026-03-24T12:00:00Z';
      const endViewTimestamp = '2026-03-25T00:00:00Z';

      const endedAlert = buildAlert({
        eventName: 'station-ended',
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 25,
          runValues: [25, 25, 25],
        }),
      });

      await createAlerts({
        forecast: buildForecast({
          alerts: [endedAlert],
          overrides: {
            countryCodeIso3,
            issuedAt: new Date('2026-03-23T12:00:00Z'),
          },
        }),
      });

      const responseBeforeEnd = await getActiveEvents({
        accessToken,
        countryCodesIso3: [countryCodeIso3],
        timestamp: viewTimestamp,
      });
      expect(responseBeforeEnd.status).toBe(HttpStatus.OK);
      expect(responseBeforeEnd.body).toHaveLength(1);
      expect(responseBeforeEnd.body[0]).toMatchObject({
        eventName: 'station-ended',
        startAt: '2026-03-24T00:00:00.000Z',
        endAt: '2026-03-25T00:00:00.000Z',
        eventStatus: EventStatus.ongoing,
      });

      const responseAfterEnd = await getActiveEvents({
        accessToken,
        countryCodesIso3: [countryCodeIso3],
        timestamp: endViewTimestamp,
      });
      expect(responseAfterEnd.status).toBe(HttpStatus.OK);
      expect(responseAfterEnd.body).toHaveLength(0);
    });

    describe('next-morning gap between the forecast end and the next forecast', () => {
      // Forecast issued at 12:00 on 24 Mar predicts the event to end at the end of that day, before the next forecast is due.
      // So endAt is set to when the forecast is stale instead, for floods 26.4h later: 25 Mar 14:24.
      const eventName = 'station-next-morning';
      const firstIssuedAt = new Date('2026-03-24T12:00:00Z');
      const newerIssuedAt = new Date('2026-03-25T12:00:00Z');
      const nextMorningViewTimestamp = '2026-03-25T06:00:00Z';
      const justBeforeForecastStaleViewTimestamp = '2026-03-25T14:20:00Z';
      const justAfterForecastStaleViewTimestamp = '2026-03-25T14:30:00Z';

      const alertEndingToday = buildAlert({
        eventName,
        severity: buildSeverityData({
          start: new Date('2026-03-24T00:00:00Z'),
          end: new Date('2026-03-25T00:00:00Z'),
          medianValue: 25,
          runValues: [25, 25, 25],
        }),
      });

      beforeEach(async () => {
        await createAlerts({
          forecast: buildForecast({
            alerts: [alertEndingToday],
            overrides: { countryCodeIso3, issuedAt: firstIssuedAt },
          }),
        });
      });

      it('should keep an event ongoing after the forecast end until its forecast is stale, and end it after', async () => {
        // Act
        const activeNextMorning = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: nextMorningViewTimestamp,
        });
        const endedNextMorning = await getEndedEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: nextMorningViewTimestamp,
        });
        const activeJustBeforeForecastStale = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: justBeforeForecastStaleViewTimestamp,
        });
        const activeJustAfterForecastStale = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: justAfterForecastStaleViewTimestamp,
        });
        const endedJustAfterForecastStale = await getEndedEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: justAfterForecastStaleViewTimestamp,
        });

        // Assert
        expect(activeNextMorning.status).toBe(HttpStatus.OK);
        expect(activeNextMorning.body).toHaveLength(1);
        expect(activeNextMorning.body[0]).toMatchObject({
          eventName,
          endAt: '2026-03-25T14:24:00.000Z',
          eventStatus: EventStatus.ongoing,
        });
        expect(endedNextMorning.body).toHaveLength(0);

        expect(activeJustBeforeForecastStale.body).toHaveLength(1);

        expect(activeJustAfterForecastStale.body).toHaveLength(0);
        expect(endedJustAfterForecastStale.body).toHaveLength(1);
        expect(endedJustAfterForecastStale.body[0]).toMatchObject({
          eventName,
          eventStatus: EventStatus.ended,
        });
      });

      it('should keep it the same event when a newer forecast extends it', async () => {
        // Arrange
        const alertExtendedNextDay = buildAlert({
          eventName,
          severity: buildSeverityData({
            start: new Date('2026-03-25T00:00:00Z'),
            end: new Date('2026-03-26T00:00:00Z'),
            medianValue: 25,
            runValues: [25, 25, 25],
          }),
        });
        const activeNextMorning = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: nextMorningViewTimestamp,
        });

        // Act
        await createAlerts({
          forecast: buildForecast({
            alerts: [alertExtendedNextDay],
            overrides: { countryCodeIso3, issuedAt: newerIssuedAt },
          }),
        });
        const activeAfterNewerForecast = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: justAfterForecastStaleViewTimestamp,
        });

        // Assert
        expect(activeAfterNewerForecast.status).toBe(HttpStatus.OK);
        expect(activeAfterNewerForecast.body).toHaveLength(1);
        expect(activeAfterNewerForecast.body[0]).toMatchObject({
          eventId: activeNextMorning.body[0].eventId,
          eventName,
          firstIssuedAt: '2026-03-24T12:00:00.000Z',
          lastUpdatedAt: '2026-03-25T12:00:00.000Z',
          // The newer forecast also ends before the next forecast is due, so endAt is when it is stale.
          endAt: '2026-03-26T14:24:00.000Z',
          eventStatus: EventStatus.ongoing,
        });
      });

      it('should end the event as soon as a newer forecast no longer contains it, even before its forecast is stale', async () => {
        // Arrange
        const viewTimestampBeforeForecastStale = '2026-03-25T13:00:00Z';
        const noAlerts: never[] = [];

        // Act
        await createAlerts({
          forecast: buildForecast({
            alerts: noAlerts,
            overrides: { countryCodeIso3, issuedAt: newerIssuedAt },
          }),
        });
        const activeEvents = await getActiveEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: viewTimestampBeforeForecastStale,
        });
        const endedEvents = await getEndedEvents({
          accessToken,
          countryCodesIso3: [countryCodeIso3],
          timestamp: viewTimestampBeforeForecastStale,
        });

        // Assert
        expect(activeEvents.status).toBe(HttpStatus.OK);
        expect(activeEvents.body).toHaveLength(0);
        expect(endedEvents.body).toHaveLength(1);
        expect(endedEvents.body[0]).toMatchObject({
          eventName,
          eventStatus: EventStatus.ended,
        });
      });
    });
  });

  it('should keep startAt pinned to startAt of first ongoing alert, even if later alerts forecast upcoming alert again', async () => {
    const eventName = 'station-pinned-start-at';

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

    await createAlerts({
      forecast: buildForecast({
        alerts: [firstUpcomingAlert],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-20T12:00:00Z'),
        },
      }),
    });
    await createAlerts({
      forecast: buildForecast({
        alerts: [firstOngoingAlert],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-27T12:00:00Z'),
        },
      }),
    });
    await createAlerts({
      forecast: buildForecast({
        alerts: [laterUpcomingAlert],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-03-28T12:00:00Z'),
        },
      }),
    });

    const response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: '2026-03-29T00:00:00Z',
    });
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
      eventStatus: EventStatus.ongoing,
    });
  });

  it('should update startAt to latest alert startAt when no history is ongoing', async () => {
    const eventName = 'station-latest-start-at';

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

    await createAlerts({
      forecast: buildForecast({
        alerts: [firstUpcomingAlert],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-04-01T12:00:00Z'),
        },
      }),
    });
    await createAlerts({
      forecast: buildForecast({
        alerts: [secondUpcomingAlert],
        overrides: {
          countryCodeIso3,
          issuedAt: new Date('2026-04-02T12:00:00Z'),
        },
      }),
    });

    const response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: '2026-04-03T00:00:00Z',
    });
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
      eventStatus: EventStatus.imminent,
    });
  });

  it('should close old events of same hazardType when current forecast produces no alerts', async () => {
    const oldForecastTimestamp = '2026-04-10T00:00:00Z';
    const oldFloodsEventName = 'station-close-previous';
    const oldFloodsAlert = buildAlert({
      eventName: oldFloodsEventName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });
    const oldFloodsForecast = buildForecast({
      alerts: [oldFloodsAlert],
      overrides: {
        countryCodeIso3,
        hazardType: HazardType.floods,
        issuedAt: new Date(oldForecastTimestamp),
      },
    });

    const oldDroughtEventName = 'event-close-previous';
    const oldDroughtAlert = buildAlert({
      eventName: oldDroughtEventName,
      severity: buildSeverityData({
        start: new Date('2026-04-11T00:00:00Z'),
        end: new Date('2026-04-12T00:00:00Z'),
        medianValue: 25,
        runValues: [25, 25, 25],
      }),
    });
    const oldDroughtForecast = buildForecast({
      alerts: [oldDroughtAlert],
      overrides: {
        countryCodeIso3,
        hazardType: HazardType.drought,
        issuedAt: new Date(oldForecastTimestamp),
      },
    });

    await createAlerts({ forecast: oldFloodsForecast });
    await createAlerts({ forecast: oldDroughtForecast });

    // Act
    const currentForecastTimestamp = '2026-04-11T00:00:00Z';
    const currentFloodsAlerts: never[] = [];
    const currentFloodsForecast = buildForecast({
      alerts: currentFloodsAlerts,
      overrides: {
        countryCodeIso3,
        hazardType: HazardType.floods,
        issuedAt: new Date(currentForecastTimestamp),
      },
    });
    await createAlerts({ forecast: currentFloodsForecast });

    const response = await getActiveEvents({
      accessToken,
      countryCodesIso3: [countryCodeIso3],
      timestamp: currentForecastTimestamp,
    });
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
