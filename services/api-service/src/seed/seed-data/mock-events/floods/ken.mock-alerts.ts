import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  buildBasicGlofasStationGeoFeature,
  buildFloodSeverity,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64 } from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildKenyaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'ATHI MUNYU (3DA02)',
      centroid: { latitude: -3.1789, longitude: 39.3795 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 1,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'KEN.14.1.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 169,
          },
          {
            placeCode: 'KEN.14.1.4_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 259,
          },
          {
            placeCode: 'KEN.14.3.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 14822,
          },
          {
            placeCode: 'KEN.14.3.3_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3007,
          },
          {
            placeCode: 'KEN.14.5.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1352,
          },
          {
            placeCode: 'KEN.14.5.2_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7694,
          },
          {
            placeCode: 'KEN.14.5.5_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 17745,
          },
          {
            placeCode: 'KEN.14.6.2_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 435,
          },
          {
            placeCode: 'KEN.14.6.3_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2867,
          },
          {
            placeCode: 'KEN.39.3.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 294,
          },
          {
            placeCode: 'KEN.39.3.3_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'KEN.39.3.4_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 30,
          },
          {
            placeCode: 'KEN.39.3.6_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 6,
          },
          {
            placeCode: 'KEN.14.1_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 428,
          },
          {
            placeCode: 'KEN.14.3_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 17829,
          },
          {
            placeCode: 'KEN.14.5_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 26791,
          },
          {
            placeCode: 'KEN.14.6_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 3302,
          },
          {
            placeCode: 'KEN.39.3_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 332,
          },
          {
            placeCode: 'KEN.14_1',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 48350,
          },
          {
            placeCode: 'KEN.39_1',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 332,
          },
          {
            placeCode: 'KE',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 48682,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5142',
            medianDischarge: 8.16,
            onset: { startDay: 1, dischargeBeforeStart: 2.17 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 38.433751373292196,
              ymin: -3.966266666653965,
              xmax: 40.193751378152754,
              ymax: -2.3087666666554725,
            },
          },
        ],
      },
    },
  ];
}
