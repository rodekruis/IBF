import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
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
  alertName: string,
  apiKey: string,
): Promise<{ adminAccessToken: string; alertId: number }> {
  const adminAccessToken = await getAccessToken();
  const alertCreateDto = getAlertCreateDto(alertName);

  const response = await getServer()
    .post('/alerts')
    .set('x-api-key', apiKey)
    .send([alertCreateDto]);

  const seededAlert = response.body[0];

  return { adminAccessToken, alertId: seededAlert.id };
}
