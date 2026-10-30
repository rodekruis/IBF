import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  buildBasicGlofasStationGeoFeature,
  buildFloodSeverity,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { PHL_NABUA_FLOOD_DEPTH_BASE64 } from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildPhilippinesFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Nabua',
      centroid: { latitude: 13.3964, longitude: 123.3779 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 2,
        medianReturnPeriod: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH0500502',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'PH0500503',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 14,
          },
          {
            placeCode: 'PH0500504',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'PH0500506',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 413,
          },
          {
            placeCode: 'PH0500507',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 147,
          },
          {
            placeCode: 'PH0500508',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'PH0500509',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 269,
          },
          {
            placeCode: 'PH0500510',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 170,
          },
          {
            placeCode: 'PH0500512',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 37,
          },
          {
            placeCode: 'PH0500513',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'PH0500514',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 11,
          },
          {
            placeCode: 'PH0500516',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'PH0500518',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 795,
          },
          {
            placeCode: 'PH0501701',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4792,
          },
          {
            placeCode: 'PH0501703',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 166,
          },
          {
            placeCode: 'PH0501704',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9671,
          },
          {
            placeCode: 'PH0501705',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1396,
          },
          {
            placeCode: 'PH0501706',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13865,
          },
          {
            placeCode: 'PH0501707',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 14212,
          },
          {
            placeCode: 'PH0501708',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 49580,
          },
          {
            placeCode: 'PH0501709',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25224,
          },
          {
            placeCode: 'PH0501710',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 35215,
          },
          {
            placeCode: 'PH0501713',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12502,
          },
          {
            placeCode: 'PH0501718',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 42745,
          },
          {
            placeCode: 'PH0501720',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 20430,
          },
          {
            placeCode: 'PH0501721',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 19164,
          },
          {
            placeCode: 'PH0501722',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 15887,
          },
          {
            placeCode: 'PH0501723',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 11612,
          },
          {
            placeCode: 'PH0501724',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 32624,
          },
          {
            placeCode: 'PH0501726',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5429,
          },
          {
            placeCode: 'PH0501727',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 74,
          },
          {
            placeCode: 'PH0501728',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'PH0501731',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 127,
          },
          {
            placeCode: 'PH0501732',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3998,
          },
          {
            placeCode: 'PH0501736',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'PH05005',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1878,
          },
          {
            placeCode: 'PH05017',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 318714,
          },
          {
            placeCode: 'PH05',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 320592,
          },
          {
            placeCode: 'PH',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 320592,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G4611',
            medianDischarge: 1083.58,
            onset: { startDay: 2, dischargeBeforeStart: 400.95 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: PHL_NABUA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 122.79791827423342,
              ymin: 12.985400000015474,
              xmax: 123.86541827718152,
              ymax: 13.777900000014753,
            },
          },
        ],
      },
    },
  ];
}
