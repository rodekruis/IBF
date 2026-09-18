import { HttpStatus } from '@nestjs/common';

import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import {
  AlertClassificationLevel,
  LayerName,
} from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { readEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('GET /events – hazardTypeDetails.floods', () => {
  // MWI flood config (seed-alert-configs.const.ts): severityClassLevels = [{ singleThreshold, 5 }]
  const stationCode = 'TEST_STATION_DETAILS';
  const viewTimestamp = '2026-03-25T12:00:00Z';
  const waterDischargeTimeSeries = [
    {
      start: '2026-03-24T00:00:00Z',
      end: '2026-03-25T00:00:00Z',
      median: 100,
      low: 80,
      high: 120,
    },
    {
      start: '2026-03-25T00:00:00Z',
      end: '2026-03-26T00:00:00Z',
      median: 200,
      low: 160,
      high: 240,
    },
  ];
  let accessToken: string;

  beforeAll(async () => {
    await resetDB({
      countryCodes: ['MWI'],
      resetIdentifier: __filename,
    });
    accessToken = await getAccessToken();

    const stationResponse = await getServer()
      .post('/geo-features')
      .set('Cookie', [accessToken])
      .send([
        {
          countryCodeIso3: 'MWI',
          featureType: GeoFeatureType.point,
          layer: LayerName.glofasStations,
          referenceId: stationCode,
          geometry: { type: 'Point', coordinates: [34.5, -14.0] },
          attributes: {
            name: 'Details Test Station',
            thresholds: [
              { return_period: 2, threshold_value: 1500 },
              { return_period: 5, threshold_value: 1800 },
              { return_period: 10, threshold_value: 2200 },
              { return_period: 20, threshold_value: 3000 },
            ],
          },
        },
      ]);
    if (stationResponse.status !== HttpStatus.CREATED) {
      throw new Error(
        `Failed to create test station: ${stationResponse.status}`,
      );
    }

    const alertWithStation = buildAlert({
      eventName: 'station-details',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 6, 6, 4],
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW31001',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1000,
          },
        ],
        geoFeatures: [
          {
            geoFeatureId: stationCode,
            layer: LayerName.glofasStations,
            attributes: { waterDischarge: waterDischargeTimeSeries },
          },
        ],
      },
    });

    const alertWithoutGeoFeatures = buildAlert({
      eventName: 'station-no-geo-features',
      severity: buildSeverityData({
        start: new Date('2026-03-25T00:00:00Z'),
        end: new Date('2026-03-26T00:00:00Z'),
        medianValue: 10,
        runValues: [10, 6, 6, 4],
      }),
    });

    const createResponse = await createAlerts({
      forecast: buildForecast({
        alerts: [alertWithStation, alertWithoutGeoFeatures],
        overrides: {
          issuedAt: new Date('2026-03-24T12:00:00Z'),
        },
      }),
    });
    if (createResponse.status !== HttpStatus.CREATED) {
      throw new Error(`Failed to create alerts: ${createResponse.status}`);
    }
  });

  it('should expose floods details built from stored geo-features, severity and station data', async () => {
    // Act
    const response = await readEvents({
      accessToken,
      countryCodesIso3: ['MWI'],
      query: { timestamp: viewTimestamp },
    });

    // Assert
    expect(response.status).toBe(HttpStatus.OK);
    const event = response.body.find(
      (e: { eventName: string }) => e.eventName === 'station-details',
    );
    expect(event.hazardTypeDetails.floods).toEqual({
      stationCode,
      stationName: 'Details Test Station',
      alertDetails: {
        timeSeries: waterDischargeTimeSeries,
        current: 100,
        peakDay: '2026-03-25T00:00:00Z',
        peakValue: 200,
        // 3 of 4 runs >= the resolved severity threshold (5): [10, 6, 6] of [10, 6, 6, 4]
        returnPeriod: 10,
        probabilityOfExceedance: 0.75,
      },
      returnPeriodThresholds: [
        {
          returnPeriod: 5,
          thresholdValue: 1800,
          severityClass: AlertClassificationLevel.singleThreshold,
        },
        // Above the max severity threshold but reached by the peak return period
        {
          returnPeriod: 10,
          thresholdValue: 2200,
          severityClass: AlertClassificationLevel.singleThreshold,
        },
      ],
    });
  });

  it('should return empty hazardTypeDetails for a flood event without geo-features', async () => {
    // Act
    const response = await readEvents({
      accessToken,
      countryCodesIso3: ['MWI'],
      query: { timestamp: viewTimestamp },
    });

    // Assert
    expect(response.status).toBe(HttpStatus.OK);
    const event = response.body.find(
      (e: { eventName: string }) => e.eventName === 'station-no-geo-features',
    );
    expect(event.hazardTypeDetails).toEqual({});
  });
});
