import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  buildBasicGlofasStationGeoFeature,
  buildFloodSeverity,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { MWI_CHIKWAWA_FLOOD_DEPTH_BASE64 } from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildMalawiFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  // NOTE: MWI currently has single threshold for both severity and probability, and therefore only 'high' alert-class is possible. Therefore only 1 event is mocked here.
  return [
    {
      eventName: 'Chikwawa',
      centroid: { latitude: -16.0636, longitude: 34.7915 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 2,
        medianReturnPeriod: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW31005',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 988,
          },
          {
            placeCode: 'MW31009',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 411,
          },
          {
            placeCode: 'MW31020',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'MW310',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
          {
            placeCode: 'MW3',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
          {
            placeCode: 'MW',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5694',
            medianDischarge: 3860.89,
            onset: { startDay: 2, dischargeBeforeStart: 1580.98 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MWI_CHIKWAWA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 34.65291802951741,
              ymin: -16.168766666651962,
              xmax: 34.89291803018021,
              ymax: -15.914599999985526,
            },
          },
        ],
      },
    },
  ];
}
