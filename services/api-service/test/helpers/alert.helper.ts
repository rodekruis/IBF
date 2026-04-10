import * as request from 'supertest';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import {
  getAccessToken,
  getServer,
} from '@api-service/test/helpers/utility.helper';

export function getAlertCreateDto(alertName: string): AlertCreateDto {
  return {
    alertName,
    issuedAt: new Date('2026-03-23T12:00:00Z'),
    centroid: { latitude: 0.35, longitude: 32.6 },
    hazardTypes: [HazardType.floods],
    forecastSources: [ForecastSource.glofas],
    severity: [
      {
        timeInterval: {
          start: new Date('2026-03-23T00:00:00Z'),
          end: new Date('2026-03-23T23:59:59Z'),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        timeInterval: {
          start: new Date('2026-03-23T00:00:00Z'),
          end: new Date('2026-03-23T23:59:59Z'),
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
          layer: Layer.populationExposed,
          value: 1,
        },
      ],
      rasters: [
        {
          layer: Layer.alertExtent,
          value: 'raster-file-path.tif',
          extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
        },
      ],
    },
  };
}

export async function createAlert(
  alert: AlertCreateDto,
  apiKey: string,
): Promise<{ adminAccessToken: string; alertId: number }> {
  const adminAccessToken = await getAccessToken();

  const response = await getServer()
    .post('/alerts')
    .set('x-api-key', apiKey)
    .send([alert]);

  const seededAlert = response.body[0];

  return { adminAccessToken, alertId: seededAlert.id };
}

export async function createAlerts(
  alerts: AlertCreateDto[],
  apiKey: string,
): Promise<request.Response> {
  return getServer().post('/alerts').set('x-api-key', apiKey).send(alerts);
}

export function buildAlert(
  overrides: Partial<AlertCreateDto> = {},
): AlertCreateDto {
  return {
    alertName: 'KEN_floods_test-station',
    issuedAt: new Date('2026-03-30T00:00:00Z'),
    centroid: { latitude: 0.35, longitude: 32.6 },
    hazardTypes: [HazardType.floods],
    forecastSources: [ForecastSource.glofas],
    severity: [
      {
        timeInterval: {
          start: new Date('2026-03-30T00:00:00Z'),
          end: new Date('2026-03-31T00:00:00Z'),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        timeInterval: {
          start: new Date('2026-03-30T00:00:00Z'),
          end: new Date('2026-03-31T00:00:00Z'),
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: 'water_discharge',
        severityValue: 135.0,
      },
    ],
    exposure: {
      adminAreas: [
        {
          placeCode: 'KEN_01',
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

export function buildSeverityData({
  start,
  end,
  medianValue,
  runValues,
}: {
  start: Date;
  end: Date;
  medianValue: number;
  runValues: number[];
}): SeverityDto[] {
  return [
    {
      timeInterval: { start, end },
      ensembleMemberType: EnsembleMemberType.median,
      severityKey: 'water_discharge',
      severityValue: medianValue,
    },
    ...runValues.map((value) => ({
      timeInterval: { start, end },
      ensembleMemberType: EnsembleMemberType.run as const,
      severityKey: 'water_discharge',
      severityValue: value,
    })),
  ];
}
