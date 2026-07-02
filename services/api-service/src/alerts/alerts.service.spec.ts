import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

// Minimal 1x1 grayscale PNG — structural placeholder for tests that only need a valid raster
const TEST_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNoaGj4DwAFhAKAfr3l1AAAAABJRU5ErkJggg==';

function createMockValidForecast(
  alerts: AlertCreateDto[],
  overrides: Partial<ForecastCreateDto> = {},
): ForecastCreateDto {
  return {
    issuedAt: new Date('2026-03-20T12:00:00Z'),
    hazardType: HazardType.floods,
    forecastSources: [ForecastSource.glofas],
    alerts,
    ...overrides,
  };
}

function createMockValidAlert(
  overrides: Partial<AlertCreateDto> = {},
): AlertCreateDto {
  return {
    eventName: 'ETH_floods_station-A',
    centroid: { latitude: 0.35, longitude: 32.6 },
    severity: [
      {
        timeInterval: {
          start: new Date('2026-03-20T00:00:00Z'),
          end: new Date('2026-03-20T23:59:59Z'),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 5,
      },
      {
        timeInterval: {
          start: new Date('2026-03-20T00:00:00Z'),
          end: new Date('2026-03-20T23:59:59Z'),
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 10,
      },
    ],
    exposure: {
      adminAreas: [
        {
          placeCode: 'ETH_01_001',
          adminLevel: 3,
          layer: LayerName.populationExposed,
          value: 1,
        },
      ],
      rasters: [
        {
          layer: LayerName.floodDepth,
          valueGreyscale: TEST_RASTER_BASE64,
          extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
        },
      ],
    },
    ...overrides,
  };
}

describe('AlertsService', () => {
  let service: AlertsService;
  let repository: AlertsRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: AlertsRepository,
          useValue: {
            createAlerts: jest.fn(),
            getAlerts: jest.fn(),
            getAlertOrThrow: jest.fn(),
            deleteAlertOrThrow: jest.fn(),
          },
        },
        {
          provide: AlertToEventService,
          useValue: {
            matchAndStore: jest.fn(),
            closeStaleEvents: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AlertsService);
    repository = module.get(AlertsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAlerts – valid data', () => {
    it('should create alerts when integrity checks pass', async () => {
      const alerts = [createMockValidAlert()];
      await service.createAlerts(createMockValidForecast(alerts));
      expect(repository.createAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          alertCreateDtos: alerts,
          forecastMetadata: expect.objectContaining({
            hazardType: HazardType.floods,
          }),
        }),
      );
    });
  });

  describe('createAlerts – centroid validation', () => {
    it('should reject latitude out of range', async () => {
      const alerts = [
        createMockValidAlert({
          centroid: { latitude: 91, longitude: 0 },
        }),
      ];
      await expect(
        service.createAlerts(createMockValidForecast(alerts)),
      ).rejects.toThrow(HttpException);
    });

    it('should reject longitude out of range', async () => {
      const alerts = [
        createMockValidAlert({
          centroid: { latitude: 0, longitude: -181 },
        }),
      ];
      await expect(
        service.createAlerts(createMockValidForecast(alerts)),
      ).rejects.toThrow(HttpException);
    });

    it('should include alert name in centroid error message', async () => {
      const alerts = [
        createMockValidAlert({
          eventName: 'ETH_floods_bad-centroid',
          centroid: { latitude: 100, longitude: 200 },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ETH_floods_bad-centroid'),
          expect.stringContaining('latitude'),
        ]),
      );
    });
  });

  describe('createAlerts – severity validation', () => {
    it('should reject empty severity data', async () => {
      const alerts = [createMockValidAlert({ severity: [] })];
      await expect(
        service.createAlerts(createMockValidForecast(alerts)),
      ).rejects.toThrow(HttpException);
    });

    it('should reject time interval where start >= end', async () => {
      const alerts = [
        createMockValidAlert({
          severity: [
            {
              timeInterval: {
                start: new Date('2026-03-21T00:00:00Z'),
                end: new Date('2026-03-20T00:00:00Z'),
              },
              ensembleMemberType: EnsembleMemberType.median,
              severityKey: SeverityKey.returnPeriod,
              severityValue: 1,
            },
            {
              timeInterval: {
                start: new Date('2026-03-21T00:00:00Z'),
                end: new Date('2026-03-20T00:00:00Z'),
              },
              ensembleMemberType: EnsembleMemberType.run,
              severityKey: SeverityKey.returnPeriod,
              severityValue: 1,
            },
          ],
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('start must be before end'),
        ]),
      );
    });

    it('should reject when median record is missing', async () => {
      const alerts = [
        createMockValidAlert({
          severity: [
            {
              timeInterval: {
                start: new Date('2026-03-20T00:00:00Z'),
                end: new Date('2026-03-20T23:59:59Z'),
              },
              ensembleMemberType: EnsembleMemberType.run,
              severityKey: SeverityKey.returnPeriod,
              severityValue: 1,
            },
          ],
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('expected 1 median record, found 0'),
        ]),
      );
    });

    it('should reject when no ensemble-run record exists', async () => {
      const alerts = [
        createMockValidAlert({
          severity: [
            {
              timeInterval: {
                start: new Date('2026-03-20T00:00:00Z'),
                end: new Date('2026-03-20T23:59:59Z'),
              },
              ensembleMemberType: EnsembleMemberType.median,
              severityKey: SeverityKey.returnPeriod,
              severityValue: 1,
            },
          ],
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ensemble-run record, found 0'),
        ]),
      );
    });
  });

  describe('createAlerts – admin-area validation', () => {
    it('should reject empty admin-area', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: TEST_RASTER_BASE64,
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('expected at least 1 record'),
        ]),
      );
    });

    it('should reject admin-area missing required population_exposed layer', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.glofasStations,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: TEST_RASTER_BASE64,
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "missing required layer 'population_exposed'",
          ),
        ]),
      );
    });

    it('should reject unequal record counts across layers', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.glofasStations, // not actually admin-area layerName, but works to test the record count validation
                value: 1,
              },
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 100,
              },
              {
                placeCode: 'B',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 200,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: TEST_RASTER_BASE64,
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'admin-area level 3: record count differs across layers',
          ),
        ]),
      );
    });
  });

  describe('createAlerts – raster validation', () => {
    it('should reject raster with invalid extent', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: TEST_RASTER_BASE64,
                extent: { xmin: 10, ymin: 5, xmax: 5, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('invalid extent')]),
      );
    });

    it('should reject raster with invalid base64 characters', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: '!!!not-base64!!!',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('valueGreyscale is not valid base64'),
        ]),
      );
    });

    it('should reject raster with base64 of invalid length', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: 'AQI',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('valueGreyscale is not valid base64'),
        ]),
      );
    });

    it('should reject raster with valid base64 that is not a PNG', async () => {
      const notPngBase64 = Buffer.from('this is not a png file').toString(
        'base64',
      );
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: notPngBase64,
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as {
        errors: string[];
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('valueGreyscale is not a valid PNG'),
        ]),
      );
    });

    it('should accept rasters with valid flood_depth', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: LayerName.floodDepth,
                valueGreyscale: TEST_RASTER_BASE64,
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      await service.createAlerts(createMockValidForecast(alerts));
      expect(repository.createAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          alertCreateDtos: alerts,
          forecastMetadata: expect.objectContaining({
            hazardType: HazardType.floods,
          }),
        }),
      );
    });

    it('should accept alert with rasters omitted', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: LayerName.populationExposed,
                value: 1,
              },
            ],
          },
        }),
      ];
      await service.createAlerts(createMockValidForecast(alerts));
      expect(repository.createAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          alertCreateDtos: alerts,
        }),
      );
    });
  });

  describe('createAlerts – error response format', () => {
    it('should return BAD_REQUEST with message and errors array', async () => {
      const alerts = [
        createMockValidAlert({
          severity: [],
          centroid: { latitude: 100, longitude: 0 },
        }),
      ];
      const error = await service
        .createAlerts(createMockValidForecast(alerts))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = (error as HttpException).getResponse() as {
        message: string;
        errors: string[];
      };
      expect(response.message).toBe('Alert integrity check failed');
      expect(response.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
