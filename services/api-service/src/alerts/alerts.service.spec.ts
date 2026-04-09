import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { CreateAlertDto } from '@api-service/src/alerts/dto/alert.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';

function createMockValidAlert(
  overrides: Partial<CreateAlertDto> = {},
): CreateAlertDto {
  return {
    alertName: 'KEN-flood-2026-03-20',
    issuedAt: new Date('2026-03-20T12:00:00Z'),
    centroid: { latitude: 0.35, longitude: 32.6 },
    hazardTypes: [HazardType.floods],
    forecastSources: [ForecastSource.glofas],
    severity: [
      {
        timeInterval: {
          start: new Date('2026-03-20T00:00:00Z'),
          end: new Date('2026-03-20T23:59:59Z'),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        timeInterval: {
          start: new Date('2026-03-20T00:00:00Z'),
          end: new Date('2026-03-20T23:59:59Z'),
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: 'water_discharge',
        severityValue: 135.0,
      },
    ],
    exposure: {
      adminAreas: [
        {
          placeCode: 'KEN_01_001',
          adminLevel: 3,
          layer: Layer.spatialExtent,
          value: 1,
        },
      ],
      rasters: [
        {
          layer: Layer.alertExtent,
          value: 'base64',
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
      await service.createAlerts(alerts);
      expect(repository.createAlerts).toHaveBeenCalledWith(alerts);
    });
  });

  describe('createAlerts – centroid validation', () => {
    it('should reject latitude out of range', async () => {
      const alerts = [
        createMockValidAlert({
          centroid: { latitude: 91, longitude: 0 },
        }),
      ];
      await expect(service.createAlerts(alerts)).rejects.toThrow(HttpException);
    });

    it('should reject longitude out of range', async () => {
      const alerts = [
        createMockValidAlert({
          centroid: { latitude: 0, longitude: -181 },
        }),
      ];
      await expect(service.createAlerts(alerts)).rejects.toThrow(HttpException);
    });

    it('should include alert name in centroid error message', async () => {
      const alerts = [
        createMockValidAlert({
          alertName: 'BAD-centroid',
          centroid: { latitude: 100, longitude: 200 },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('BAD-centroid'),
            expect.stringContaining('latitude'),
          ]),
        );
      }
    });
  });

  describe('createAlerts – severity validation', () => {
    it('should reject empty severity data', async () => {
      const alerts = [createMockValidAlert({ severity: [] })];
      await expect(service.createAlerts(alerts)).rejects.toThrow(HttpException);
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
              severityKey: 'k',
              severityValue: 1,
            },
            {
              timeInterval: {
                start: new Date('2026-03-21T00:00:00Z'),
                end: new Date('2026-03-20T00:00:00Z'),
              },
              ensembleMemberType: EnsembleMemberType.run,
              severityKey: 'k',
              severityValue: 1,
            },
          ],
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('start must be before end'),
          ]),
        );
      }
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
              severityKey: 'k',
              severityValue: 1,
            },
          ],
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('expected 1 median record, found 0'),
          ]),
        );
      }
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
              severityKey: 'k',
              severityValue: 1,
            },
          ],
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('ensemble-run record, found 0'),
          ]),
        );
      }
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
                layer: Layer.alertExtent,
                value: 'base64',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('expected at least 1 record'),
          ]),
        );
      }
    });

    it('should reject unequal record counts across layers', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.spatialExtent,
                value: 1,
              },
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.populationExposed,
                value: 100,
              },
              {
                placeCode: 'B',
                adminLevel: 3,
                layer: Layer.populationExposed,
                value: 200,
              },
            ],
            rasters: [
              {
                layer: Layer.alertExtent,
                value: 'base64',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('record count differs across layers'),
          ]),
        );
      }
    });
  });

  describe('createAlerts – raster validation', () => {
    it('should reject rasters missing alert_extent layer', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.spatialExtent,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: Layer.populationExposed, // invalid raster layer
                value: 'base64',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining("missing required 'alert_extent' layer"),
          ]),
        );
      }
    });

    it('should reject raster with invalid extent', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.spatialExtent,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: Layer.alertExtent,
                value: 'base64',
                extent: { xmin: 10, ymin: 5, xmax: 5, ymax: 1 },
              },
            ],
          },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('invalid extent')]),
        );
      }
    });

    it('should reject alert with empty rasters array', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.spatialExtent,
                value: 1,
              },
            ],
            rasters: [],
          },
        }),
      ];
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        const response = (e as HttpException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining("missing required 'alert_extent' layer"),
          ]),
        );
      }
    });

    it('should accept rasters with valid alert_extent', async () => {
      const alerts = [
        createMockValidAlert({
          exposure: {
            adminAreas: [
              {
                placeCode: 'A',
                adminLevel: 3,
                layer: Layer.spatialExtent,
                value: 1,
              },
            ],
            rasters: [
              {
                layer: Layer.alertExtent,
                value: 'base64',
                extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
              },
            ],
          },
        }),
      ];
      await service.createAlerts(alerts);
      expect(repository.createAlerts).toHaveBeenCalledWith(alerts);
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
      try {
        await service.createAlerts(alerts);
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = (e as HttpException).getResponse() as {
          message: string;
          errors: string[];
        };
        expect(response.message).toBe('Alert integrity check failed');
        expect(response.errors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
