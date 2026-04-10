import * as request from 'supertest';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { env } from '@api-service/src/env';
import { getServer } from '@api-service/test/helpers/utility.helper';

export async function createAlerts(
  forecast: ForecastCreateDto,
  apiKey: string = env.PIPELINE_API_KEY!,
): Promise<request.Response> {
  return getServer().post('/alerts').set('x-api-key', apiKey).send(forecast);
}

export async function readAlerts(
  accessToken: string,
): Promise<request.Response> {
  return getServer().get('/alerts').set('Cookie', [accessToken]);
}

export async function readAlertById(
  id: number,
  accessToken: string,
): Promise<request.Response> {
  return getServer().get(`/alerts/${id}`).set('Cookie', [accessToken]);
}

export async function deleteAlert(
  id: number,
  accessToken: string,
): Promise<request.Response> {
  return getServer().delete(`/alerts/${id}`).set('Cookie', [accessToken]);
}

export function buildAlert(
  overrides: Partial<AlertCreateDto> = {},
): AlertCreateDto {
  return {
    alertName: 'KEN_floods_test-station',
    centroid: { latitude: 0.35, longitude: 32.6 },
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

export function buildForecast(
  alerts: AlertCreateDto[],
  overrides: Partial<Omit<ForecastCreateDto, 'alerts'>> = {},
): ForecastCreateDto {
  return {
    issuedAt: new Date('2026-03-30T00:00:00Z'),
    hazardTypes: [HazardType.floods],
    forecastSources: [ForecastSource.glofas],
    alerts,
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
