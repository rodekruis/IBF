import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  buildBasicGlofasStationGeoFeature,
  buildFloodSeverity,
  buildFloodSeverityForDay,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import {
  ETH_ADAITU_FLOOD_DEPTH_BASE64,
  ETH_G1904_FLOOD_DEPTH_BASE64,
  ETH_TENDAHO_FLOOD_DEPTH_BASE64,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildEthiopiaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  // The 'Tendaho' event overrides the default waterDischarge medians to match its per-day severity variation.
  const tendahoPerDaySeverities: {
    day: number;
    median: number;
    runs: number[];
  }[] = [
    { day: 1, median: 1.5, runs: Array<number>(10).fill(1.5) },
    { day: 2, median: 2, runs: [1.5, 1.5, 2, 2, 2, 2, 2, 2, 2, 2] },
    { day: 3, median: 2, runs: Array<number>(10).fill(2) },
    { day: 4, median: 5, runs: [1.5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    { day: 5, median: 5, runs: [2, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    { day: 6, median: 5, runs: Array<number>(10).fill(5) },
    { day: 7, median: 2, runs: Array<number>(10).fill(2) },
  ];
  const tendahoWaterDischarge = [
    { day: 0, median: 955 },
    { day: 1, median: 1102 },
    { day: 2, median: 1245 },
    { day: 3, median: 1245 },
    { day: 4, median: 1413 },
    { day: 5, median: 1413 },
    { day: 6, median: 1413 },
    { day: 7, median: 1245 },
  ];

  return [
    {
      eventName: 'Adaitu',
      centroid: { latitude: 10.7846, longitude: 40.7136 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 4,
        medianReturnPeriod: 2,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020105',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 574,
          },
          {
            placeCode: 'ET020106',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 129,
          },
          {
            placeCode: 'ET020112',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 87,
          },
          {
            placeCode: 'ET020303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3958,
          },
          {
            placeCode: 'ET020305',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 654,
          },
          {
            placeCode: 'ET020308',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ET020602',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'ET020603',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 165,
          },
          {
            placeCode: 'ET020604',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 790,
          },
          {
            placeCode: 'ET0203',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 4612,
          },
          {
            placeCode: 'ET0206',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 205,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 5607,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 5607,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1053',
            medianDischarge: 1251.16,
            onset: { startDay: 4, dischargeBeforeStart: 958.77 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_ADAITU_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 39.926251377414005,
              ymin: 9.657900000009406,
              xmax: 41.241251381045615,
              ymax: 11.769566666674152,
            },
          },
        ],
      },
    },
    {
      eventName: 'Tendaho',
      centroid: { latitude: 11.7504, longitude: 40.6902 },
      severity: tendahoPerDaySeverities.flatMap(({ day, median, runs }) =>
        buildFloodSeverityForDay({
          issuedAt,
          day,
          medianReturnPeriod: median,
          runReturnPeriods: runs,
        }),
      ),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020101',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 36779,
          },
          {
            placeCode: 'ET020103',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25977,
          },
          {
            placeCode: 'ET020402',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ET030308',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 30,
          },
          {
            placeCode: 'ET030422',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 62756,
          },
          {
            placeCode: 'ET0204',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ET0303',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 30,
          },
          {
            placeCode: 'ET0304',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 62766,
          },
          {
            placeCode: 'ET03',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 42,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 62808,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1045',
            waterDischarge: tendahoWaterDischarge,
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_TENDAHO_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 39.53625137633695,
              ymin: 11.179566666674688,
              xmax: 41.61875138208815,
              ymax: 12.232066666673731,
            },
          },
        ],
      },
    },
    {
      eventName: 'G1904',
      centroid: { latitude: 5.574, longitude: 44.2208 },
      severity: buildFloodSeverity({
        issuedAt,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET050603',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1071,
          },
          {
            placeCode: 'ET050604',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10209,
          },
          {
            placeCode: 'ET050605',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 85784,
          },
          {
            placeCode: 'ET050606',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25287,
          },
          {
            placeCode: 'ET050607',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7356,
          },
          {
            placeCode: 'ET0506',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
          {
            placeCode: 'ET05',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1904',
            medianDischarge: 1426.93,
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_G1904_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 43.19291805310216,
              ymin: 4.902066666680398,
              xmax: 45.3795847258077,
              ymax: 6.819566666678654,
            },
          },
        ],
      },
    },
  ];
}
