import {
  buildBasicGlofasStationGeoFeature,
  MockFloodAlert,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { SSD_G5100_FLOOD_DEPTH_BASE64 } from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildSouthSudanFloodAlerts(issuedAt: Date): MockFloodAlert[] {
  return [
    {
      eventName: 'G5100',
      centroid: { latitude: 6.606, longitude: 31.5314 },
      stationThresholds: {
        1.5: 5990.52,
        2: 6691.53,
        5: 8416.7,
        10: 9558.91,
        20: 10654.54,
        50: 12072.73,
        100: 13135.46,
        200: 14194.32,
        500: 15591.27,
      },
      exposure: {
        adminAreas: [
          {
            placeCode: 'SS030301',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1164,
          },
          {
            placeCode: 'SS030302',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4741,
          },
          {
            placeCode: 'SS030303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 84287,
          },
          {
            placeCode: 'SS030304',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3959,
          },
          {
            placeCode: 'SS030305',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12787,
          },
          {
            placeCode: 'SS030306',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 703,
          },
          {
            placeCode: 'SS031001',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 15437,
          },
          {
            placeCode: 'SS031002',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 50365,
          },
          {
            placeCode: 'SS031003',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9866,
          },
          {
            placeCode: 'SS031004',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 29982,
          },
          {
            placeCode: 'SS031005',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 16402,
          },
          {
            placeCode: 'SS040101',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 530,
          },
          {
            placeCode: 'SS040103',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2391,
          },
          {
            placeCode: 'SS040104',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7467,
          },
          {
            placeCode: 'SS040105',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'SS040106',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7394,
          },
          {
            placeCode: 'SS040107',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 6957,
          },
          {
            placeCode: 'SS040108',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 286,
          },
          {
            placeCode: 'SS040701',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 962,
          },
          {
            placeCode: 'SS040702',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'SS040703',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 299,
          },
          {
            placeCode: 'SS040704',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 384,
          },
          {
            placeCode: 'SS040705',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 62,
          },
          {
            placeCode: 'SS040706',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 147,
          },
          {
            placeCode: 'SS0303',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 107641,
          },
          {
            placeCode: 'SS0310',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 122052,
          },
          {
            placeCode: 'SS0401',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 25038,
          },
          {
            placeCode: 'SS0407',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1856,
          },
          {
            placeCode: 'SS03',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 229693,
          },
          {
            placeCode: 'SS04',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 26894,
          },
          {
            placeCode: 'SS',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 256587,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5100',
            medianDischarge: 11363.64,
            onset: { startDay: 3, dischargeBeforeStart: 5391.47 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: SSD_G5100_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 30.318751350720206,
              ymin: 5.849566666679536,
              xmax: 32.63291802377786,
              ymax: 7.449566666678081,
            },
          },
        ],
      },
    },
  ];
}
