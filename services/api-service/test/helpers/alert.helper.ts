import { addDays } from 'date-fns';
import * as request from 'supertest';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { env } from '@api-service/src/env';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';
import { getServer } from '@api-service/test/helpers/utility.helper';

// Minimal 1x1 grayscale PNG — structural placeholder for tests that only need a valid raster
const TEST_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNoaGj4DwAFhAKAfr3l1AAAAABJRU5ErkJggg==';

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
  const now = new Date();
  const tomorrow = addDays(now, 1);
  return {
    eventName: 'ETH_floods_test-station',
    centroid: { latitude: 0.35, longitude: 32.6 },
    severity: [
      {
        timeInterval: {
          start: now,
          end: tomorrow,
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 5,
      },
      {
        timeInterval: {
          start: now,
          end: tomorrow,
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 10,
      },
    ],
    exposure: {
      adminAreas: [
        {
          placeCode: 'ETH_01',
          adminLevel: 3,
          layer: LayerName.populationExposed,
          value: 1000,
        },
      ],
      rasters: [
        {
          layer: LayerName.alertExtent,
          valueBlackWhite: TEST_RASTER_BASE64,
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
    issuedAt: new Date(),
    hazardType: HazardType.floods,
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
      severityKey: SeverityKey.returnPeriod,
      severityValue: medianValue,
    },
    ...runValues.map((value) => ({
      timeInterval: { start, end },
      ensembleMemberType: EnsembleMemberType.run as const,
      severityKey: SeverityKey.returnPeriod,
      severityValue: value,
    })),
  ];
}
