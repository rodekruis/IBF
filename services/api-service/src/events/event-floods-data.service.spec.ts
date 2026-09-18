import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Event } from '@prisma/client';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { EventFloodsDataService } from '@api-service/src/events/event-floods-data.service';
import { EventsRepository } from '@api-service/src/events/events.repository';
import {
  AlertClass,
  AlertClassificationLevel,
  EnsembleMemberType,
  HazardType,
} from '@api-service/src/shared-enums';

function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 42,
    created: new Date('2026-03-23T12:00:00Z'),
    updated: new Date('2026-03-23T12:00:00Z'),
    countryCodeIso3: 'ETH',
    eventName: 'station-A',
    hazardType: HazardType.floods,
    forecastSources: ['glofas'],
    alertClass: AlertClass.medium,
    trigger: false,
    centroid: { latitude: 0.35, longitude: 32.6 },
    startAt: new Date('2026-03-25T00:00:00Z'),
    reachesPeakAlertClassAt: new Date('2026-03-25T00:00:00Z'),
    endAt: new Date('2026-03-26T00:00:00Z'),
    firstIssuedAt: new Date('2026-03-23T12:00:00Z'),
    lastUpdatedAt: new Date('2026-03-23T12:00:00Z'),
    closedAt: null,
    ...overrides,
  };
}

describe('EventFloodsDataService', () => {
  let service: EventFloodsDataService;
  let repository: jest.Mocked<EventsRepository>;
  let alertConfigsService: jest.Mocked<AlertConfigsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventFloodsDataService,
        AlertClassificationService,
        {
          provide: EventsRepository,
          useValue: {
            getGeoFeatureExposureForLatestAlerts: jest.fn(),
            getGloFasStationDetails: jest.fn(),
          },
        },
        {
          provide: AlertConfigsService,
          useValue: {
            getAlertConfigs: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EventFloodsDataService);
    repository = module.get(EventsRepository);
    alertConfigsService = module.get(AlertConfigsService);
    repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
      new Map(),
    );
    repository.getGloFasStationDetails.mockResolvedValue(new Map());
    alertConfigsService.getAlertConfigs.mockResolvedValue([]);
  });

  describe('buildDetails', () => {
    it('should return null for a flood event when there is no geo-feature exposure data', async () => {
      const event = buildEvent();
      const floodsContext = await service.buildContext([event]);

      expect(service.buildDetails({ event, floodsContext })).toBeNull();
    });

    it('should derive current, peakDay, peakValue, returnPeriod, probability, stationName and returnPeriodThresholds', async () => {
      // reachesPeakAlertClassAt is intentionally NOT the peakDay to pin that returnPeriod
      // and probability are evaluated at peakDay.
      const event = buildEvent({
        reachesPeakAlertClassAt: new Date('2026-03-24T00:00:00Z'),
      });
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      {
                        start: '2026-03-24T00:00:00Z',
                        end: '2026-03-24T23:59:59Z',
                        median: 100,
                        low: 80,
                        high: 120,
                      },
                      {
                        start: '2026-03-25T00:00:00Z',
                        end: '2026-03-25T23:59:59Z',
                        median: 200,
                        low: 160,
                        high: 240,
                      },
                    ],
                  },
                },
              ],
              severity: [
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.median,
                  severityValue: 10,
                },
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.run,
                  severityValue: 10,
                },
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.run,
                  severityValue: 5,
                },
              ],
            },
          ],
        ]),
      );
      repository.getGloFasStationDetails.mockResolvedValue(
        new Map([
          [
            'ETH::G1',
            {
              name: 'Station One',
              thresholds: [
                { return_period: 1.5, threshold_value: 1200 },
                { return_period: 2, threshold_value: 1500 },
                { return_period: 5, threshold_value: 1800 },
                { return_period: 10, threshold_value: 2200 },
                { return_period: 20, threshold_value: 3000 },
              ],
            },
          ],
        ]),
      );
      alertConfigsService.getAlertConfigs.mockResolvedValue([
        {
          id: 1,
          created: new Date(),
          updated: new Date(),
          countryCodeIso3: 'ETH',
          hazardType: HazardType.floods,
          spatialExtentName: 'G1',
          spatialExtentPlaceCodes: [],
          temporalExtents: [],
          severityClassLevels: [
            { label: AlertClassificationLevel.low, threshold: 2 },
            { label: AlertClassificationLevel.medium, threshold: 5 },
            { label: AlertClassificationLevel.high, threshold: 10 },
          ],
          probabilityClassLevels: [],
          triggerAlertClass: null,
          triggerLeadTimeDuration: null,
        },
      ]);

      const floodsContext = await service.buildContext([event]);

      expect(service.buildDetails({ event, floodsContext })).toEqual({
        stationCode: 'G1',
        stationName: 'Station One',
        alertDetails: {
          timeSeries: [
            {
              start: '2026-03-24T00:00:00Z',
              end: '2026-03-24T23:59:59Z',
              median: 100,
              low: 80,
              high: 120,
            },
            {
              start: '2026-03-25T00:00:00Z',
              end: '2026-03-25T23:59:59Z',
              median: 200,
              low: 160,
              high: 240,
            },
          ],
          current: 100,
          peakDay: '2026-03-25T00:00:00Z',
          peakValue: 200,
          returnPeriod: 10,
          probabilityOfExceedance: 0.5,
        },
        returnPeriodThresholds: [
          {
            returnPeriod: 2,
            thresholdValue: 1500,
            severityClass: AlertClassificationLevel.low,
          },
          {
            returnPeriod: 5,
            thresholdValue: 1800,
            severityClass: AlertClassificationLevel.medium,
          },
          {
            returnPeriod: 10,
            thresholdValue: 2200,
            severityClass: AlertClassificationLevel.high,
          },
        ],
      });
    });

    it('should sort an unsorted waterDischarge time series and derive current from the earliest entry', async () => {
      // Arrange
      const event = buildEvent();
      const entryForDay = (day: number, median: number) => ({
        start: `2026-03-2${day}T00:00:00Z`,
        end: `2026-03-2${day}T23:59:59Z`,
        median,
        low: median - 20,
        high: median + 20,
      });
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      entryForDay(5, 200),
                      entryForDay(4, 100),
                      entryForDay(6, 150),
                    ],
                  },
                },
              ],
              severity: [],
            },
          ],
        ]),
      );

      // Act
      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      // Assert
      expect(
        details?.alertDetails.timeSeries.map((entry) => entry.start),
      ).toEqual([
        '2026-03-24T00:00:00Z',
        '2026-03-25T00:00:00Z',
        '2026-03-26T00:00:00Z',
      ]);
      expect(details?.alertDetails.current).toBe(100);
    });

    it('should return null stationName for the no-name placeholder', async () => {
      // Arrange
      const event = buildEvent();
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      {
                        start: '2026-03-25T00:00:00Z',
                        end: '2026-03-25T23:59:59Z',
                        median: 100,
                        low: 80,
                        high: 120,
                      },
                    ],
                  },
                },
              ],
              severity: [],
            },
          ],
        ]),
      );
      repository.getGloFasStationDetails.mockResolvedValue(
        new Map([['ETH::G1', { name: 'Na', thresholds: [] }]]),
      );

      // Act
      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      // Assert
      expect(details?.stationName).toBeNull();
    });

    it('should prefer the first peak candidate with severity data when multiple candidates exist', async () => {
      // Arrange
      const event = buildEvent();
      const flatEntry = (day: number) => ({
        start: `2026-03-2${day}T00:00:00Z`,
        end: `2026-03-2${day}T23:59:59Z`,
        median: 100,
        low: 90,
        high: 110,
      });
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    // Flat series starting a day before the severity window
                    waterDischarge: [flatEntry(4), flatEntry(5), flatEntry(6)],
                  },
                },
              ],
              severity: [
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.median,
                  severityValue: 3,
                },
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.run,
                  severityValue: 3,
                },
              ],
            },
          ],
        ]),
      );
      alertConfigsService.getAlertConfigs.mockResolvedValue([
        {
          id: 1,
          created: new Date(),
          updated: new Date(),
          countryCodeIso3: 'ETH',
          hazardType: HazardType.floods,
          spatialExtentName: 'G1',
          spatialExtentPlaceCodes: [],
          temporalExtents: [],
          severityClassLevels: [
            { label: AlertClassificationLevel.low, threshold: 2 },
          ],
          probabilityClassLevels: [],
          triggerAlertClass: null,
          triggerLeadTimeDuration: null,
        },
      ]);

      // Act
      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      // Assert
      expect(details?.alertDetails.peakDay).toBe('2026-03-25T00:00:00Z');
      expect(details?.alertDetails.returnPeriod).toBe(3);
      expect(details?.alertDetails.probabilityOfExceedance).toBe(1);
    });

    it('should compute probability against the resolved severity-class threshold', async () => {
      // Arrange
      const event = buildEvent();
      const timeInterval = {
        start: '2026-03-25T00:00:00Z',
        end: '2026-03-25T23:59:59Z',
      };
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      { ...timeInterval, median: 100, low: 80, high: 120 },
                    ],
                  },
                },
              ],
              severity: [
                {
                  timeInterval,
                  ensembleMemberType: EnsembleMemberType.median,
                  severityValue: 10,
                },
                ...[11, 6, 4, 2].map((severityValue) => ({
                  timeInterval,
                  ensembleMemberType: EnsembleMemberType.run,
                  severityValue,
                })),
              ],
            },
          ],
        ]),
      );
      alertConfigsService.getAlertConfigs.mockResolvedValue([
        {
          id: 1,
          created: new Date(),
          updated: new Date(),
          countryCodeIso3: 'ETH',
          hazardType: HazardType.floods,
          spatialExtentName: 'G1',
          spatialExtentPlaceCodes: [],
          temporalExtents: [],
          severityClassLevels: [
            { label: AlertClassificationLevel.low, threshold: 2 },
            { label: AlertClassificationLevel.high, threshold: 5 },
          ],
          probabilityClassLevels: [],
          triggerAlertClass: null,
          triggerLeadTimeDuration: null,
        },
      ]);

      // Act
      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      // Assert
      // Median 10 resolves to 'high' (threshold 5): 2 of 4 runs >= 5.
      expect(details?.alertDetails.probabilityOfExceedance).toBe(0.5);
    });

    it('should log an error and return empty returnPeriodThresholds when static station details are missing', async () => {
      const event = buildEvent();
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      {
                        start: '2026-03-25T00:00:00Z',
                        end: '2026-03-25T23:59:59Z',
                        median: 100,
                        low: 80,
                        high: 120,
                      },
                    ],
                  },
                },
              ],
              severity: [],
            },
          ],
        ]),
      );
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      expect(details?.returnPeriodThresholds).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("No static station details found for 'G1'"),
      );
      errorSpy.mockRestore();
    });

    it('should include return periods above the highest severity threshold when the peak reaches them', async () => {
      const event = buildEvent();
      repository.getGeoFeatureExposureForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            {
              geoFeatures: [
                {
                  geoFeatureId: 'G1',
                  attributes: {
                    waterDischarge: [
                      {
                        start: '2026-03-25T00:00:00Z',
                        end: '2026-03-25T23:59:59Z',
                        median: 100,
                        low: 80,
                        high: 120,
                      },
                    ],
                  },
                },
              ],
              severity: [
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.median,
                  severityValue: 20,
                },
                {
                  timeInterval: {
                    start: '2026-03-25T00:00:00Z',
                    end: '2026-03-25T23:59:59Z',
                  },
                  ensembleMemberType: EnsembleMemberType.run,
                  severityValue: 20,
                },
              ],
            },
          ],
        ]),
      );
      repository.getGloFasStationDetails.mockResolvedValue(
        new Map([
          [
            'ETH::G1',
            {
              name: 'Station One',
              thresholds: [
                { return_period: 2, threshold_value: 1500 },
                { return_period: 5, threshold_value: 1800 },
                { return_period: 10, threshold_value: 2200 },
                { return_period: 20, threshold_value: 3000 },
                { return_period: 50, threshold_value: 4000 },
              ],
            },
          ],
        ]),
      );
      alertConfigsService.getAlertConfigs.mockResolvedValue([
        {
          id: 1,
          created: new Date(),
          updated: new Date(),
          countryCodeIso3: 'ETH',
          hazardType: HazardType.floods,
          spatialExtentName: 'G1',
          spatialExtentPlaceCodes: [],
          temporalExtents: [],
          severityClassLevels: [
            { label: AlertClassificationLevel.low, threshold: 2 },
            { label: AlertClassificationLevel.high, threshold: 10 },
          ],
          probabilityClassLevels: [],
          triggerAlertClass: null,
          triggerLeadTimeDuration: null,
        },
      ]);

      const floodsContext = await service.buildContext([event]);
      const details = service.buildDetails({ event, floodsContext });

      expect(
        details?.returnPeriodThresholds.map((t) => t.returnPeriod),
      ).toEqual([2, 10, 20]);
    });
  });
});
