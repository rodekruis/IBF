import { addHours } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { PHL_WP20_WIND_SPEED_BASE64 } from '@api-service/src/seed/seed-data/mock-events/tropical-cyclone/mock-tropical-cyclone-rasters.const';
import {
  EnsembleMemberType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

export function buildPhilippinesTropicalCycloneAlerts(
  issuedAt: Date,
): AlertCreateDto[] {
  return [
    {
      eventName: 'WP20_2024',
      centroid: { latitude: 20.5524, longitude: 121.8879 },
      severity: [
        ...Array.from({ length: 7 }, (_, i) => ({
          timeInterval: {
            start: addHours(issuedAt, i * 3),
            end: addHours(issuedAt, (i + 1) * 3),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.windSpeed,
          severityValue: [38.7, 33.8, 37.3, 41.2, 41.3, 42.0, 37.2][i],
        })),
        ...Array.from({ length: 21 }, (_, i) => ({
          timeInterval: {
            start: addHours(issuedAt, Math.floor(i / 3) * 3),
            end: addHours(issuedAt, (Math.floor(i / 3) + 1) * 3),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.windSpeed,
          severityValue: [
            40.3, 28.5, 38.7, 40.8, 30.9, 33.8, 40.6, 32.7, 37.3, 42.6, 35.9,
            41.2, 42.5, 37.9, 41.3, 42.8, 37.8, 42.0, 37.9, 37.0, 37.2,
          ][i],
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH0200903',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1471,
          },
          {
            placeCode: 'PH0200901',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10221,
          },
          {
            placeCode: 'PH0200902',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3361,
          },
          {
            placeCode: 'PH0200904',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1740,
          },
          {
            placeCode: 'PH0200905',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1804,
          },
          {
            placeCode: 'PH0200906',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1445,
          },
          {
            placeCode: 'PH02009',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
          {
            placeCode: 'PH02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
          {
            placeCode: 'PH',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
        ],
        rasters: [
          {
            layer: LayerName.windSpeed,
            valueGreyscale: PHL_WP20_WIND_SPEED_BASE64,
            extent: {
              xmin: 114.125,
              ymin: 9.375,
              xmax: 126.125,
              ymax: 21.125,
            },
          },
        ],
      },
    },
  ];
}
