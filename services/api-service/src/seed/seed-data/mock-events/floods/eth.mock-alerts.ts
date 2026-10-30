import {
  buildBasicGlofasStationGeoFeature,
  MockFloodAlert,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import {
  ETH_ADAITU_FLOOD_DEPTH_BASE64,
  ETH_G1904_FLOOD_DEPTH_BASE64,
  ETH_TENDAHO_FLOOD_DEPTH_BASE64,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-rasters.const';
import { LayerName } from '@api-service/src/shared-enums';

export function buildEthiopiaFloodAlerts(issuedAt: Date): MockFloodAlert[] {
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
      stationThresholds: {
        1.5: 1065.3,
        2: 1148.63,
        5: 1353.69,
        10: 1489.46,
        20: 1619.7,
        50: 1788.27,
        100: 1914.59,
        200: 2040.45,
        500: 2206.5,
      },
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
            // Narrower than default, to stay above ETH's minimum exceedance probability on all alert days
            rangeScale: 0.4,
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
      stationThresholds: {
        1.5: 1060.57,
        2: 1143.1,
        5: 1346.22,
        10: 1480.71,
        20: 1609.7,
        50: 1776.68,
        100: 1901.8,
        200: 2026.47,
        500: 2190.95,
      },
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
            // Scenario 'rising': crosses several return periods (1.5, 2, 5) before peaking, then recedes
            waterDischarge: tendahoWaterDischarge,
            // Narrower than default, to stay above ETH's minimum exceedance probability on all alert days
            rangeScale: 0.35,
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
      stationThresholds: {
        1.5: 1005.02,
        2: 1076.87,
        5: 1253.7,
        10: 1370.77,
        20: 1483.08,
        50: 1628.44,
        100: 1737.37,
        200: 1845.9,
        500: 1989.09,
      },
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
            // Raised from the sweep value (1426.93) towards the top of the narrow 10-year band (1370.77-1483.08),
            // so that with a narrower range all days stay above ETH's minimum exceedance probability
            medianDischarge: 1470,
            rangeScale: 0.2,
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
