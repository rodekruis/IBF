import { addDays, addHours } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

const ETH_G5173_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAANsAAACRCAAAAABvK5KWAAAElElEQVR42u1cy3IbRwzsBmZXVCpOyof8/0emKqK4C3QOJGVLIZcSo7JnxtMXHchSbS+AxmuGwMAvCB7/TKXGh/P30zC4rrGTmuU2y3YTXfnNVACAL3+VjFqpvXrSq/w9nExEgq95uK9Zb8C8w2708HRJIoVXFlJsG6xAlXOL4u6h1Iddz7J2n8SDZ4QgtIV3iLdrwkFqjRlg7/BaY2S2R+02NzM8Pj0bGoTfpKY5vw81mrMPbmbkbh84kTMUQaJR7RSE1z4t0MN6IJWAked09pvi0LrdJkbJFaCA4njJ1Ms6/+Tc9f+5WbCsMAEwvSqv4rGgdse8wQ2mpSAhwxszLQv+ULSbA8wlGBMi821kMp92Lee3QJYSAvDfiks4yJr1SRalTREEebGYXEqpuRSzzc9kjgTBy7KRdVvOtjsUs0gAea0HOESj3Fxpc8C19S02yc0nshwWSiB4hUOj8UY3zulIQkG3nnocLjGvCYgQixEd9TiWxcCwpFBiVU/cykMszKRwmkx25JO+LmTIjBNbpLbBjbYIAWDiuqK3mYIlXbJocQ50SycJmIBGmW1ySwAi2Sq1zRyAJADV3F7zTi3JBAnUbTjeqSWiSfQ4xp57jYlg6837RjkpYyZJwkg+1Jm/7S67OYAg8xhvtDonkro+B97s30AalaCE1FxnxCXtnnkJlLQkSJAslfbYKlcst1mXeAoUoWPIZqVKmVfUcrMuOQ/vqEzzSksvAbqslpv9G5HnDGdAzWOfi15pm/lNgAECAdZcMeuiV25wkwtkCmCtsfadGT46MxcMOh6XqbxifvuAnLgZbwREP8YqYHX3Oip6VYilbvQBlDkIFKp45W75rV2Z7SQN5UbmEIxWmLmq7kWpZKAEI88jOd88fXGena8zcoeoXU8sIehl2rihEcUoZBIlZDP2zc3x7EZ35J6+BnXI7GimwELCmG4rAbAsPc0nDaRY5EZHV2fVSEhKLwEzYO2Lm8iEPxePhGvtKN7mCZJLJVJAoj0tuZ67y94KloWCas9sH+XmUiSCDDa5oNrwyWkXKJIUuHYCo1Utmb9kukCjo9U1zhuf9N/9nz3nxzCfSohxHHahB5/8ks8McTI9l8PpRBClLrjlfl2BfD6IFuU0s80+dlQvNEzkvhhESOxr/+Yln0yrMyhrdXPql1dZmR5KsCxJdqAlUx4NdrohBU0uW5VR/X2hD/4vApgezfHzl4efHu6cWM1m9F52fq1AmZsNs83Fsc8A6OgKJ37nRaRNbdOxN9ecAbwUkJo6s93F6SvGDf2BgcZ8kiPefuAd6E7y29DSe5+bwyeHlvxIu5FDk1p8VLZDQj2UJT5ydxfcetI7e89BxA+kADZ2P+IDr6gqs9u9wnhFAoVeKy52qJOl52Efb5qNbcttbfnjk5xpIgWqT6/0Up/XfZYIyOs7qu2ff4a9PxSMlU+DdYl13L+pX27seCtnbf/m96bZ/tw912eoz3nh+vvrY7f9W9f7bus23vp+3zX+MPGw250X44fdxj5gcBsYGBjHKweGMw4MDAwM/OKJYPQ4A6M4GRgYGBioBf8CH23Ha8QmUDgAAAAASUVORK5CYII=';

const UGA_AKOKORIO_FLOOD_DEPTH_BASE64 =
  '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';

const MWI_SINOYA_FLOOD_DEPTH_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABcAAAAZCAAAAAD/S+oMAAAAWklEQVR42tWPOQ6AMAwE14cIDTTk/2+kQQIhEj4wqajYcizP2tL3TLPkwFsYL2QdqbYgaqiXlI6D8IbcfSBaRL32FPT0WG/2nN3p+npRb8+yG3ni4G9L6jd5AYRLDIKQLf+zAAAAAElFTkSuQmCC';

const KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64 =
  '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';

const PHL_NIA_PUMPING_STATION_FLOOD_DEPTH_BASE64 =
  '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';

const SSD_G5100_FLOOD_DEPTH_BASE64 =
  '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';

const ZMB_NGWERERECONFLUENCE_FLOOD_DEPTH_BASE64 =
  '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';

// This basic flood depth raster is used for any additional events per country, in addition to the realistic/pipeline-based one above.
// The image is the same for every event/country, just the extent changes (below).
const MOCK_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAUCAYAAABSx2cSAAAA0ElEQVR4AaXBsW0jQRREwXezedDpNNpmTDTXZEy0OxLa7fwIpFvgCAjCeVP153a7fd3vdy6Px4OP5/PJ5fV68X6/+Z/FhmNmzrZIIgm2udgmCZJoy8zw22LDYsMBnDNDWySRBNtcbJMESbRlZvhpsWGxYbHhAE7+mhnaIokk2OZimyRIoi0zw8diw2LDAZz8MzO0RRJJsM3FNkmQRFtmhstiw2LDAZz8MDO0RRJJsM3FNkmQRFtmhsWGxYbFhgM4+WVmaIskkmCbi22SIIm2fANUaHZa8hEamQAAAABJRU5ErkJggg==';

const PHL_WP20_WIND_SPEED_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAvCAAAAACA6RYVAAAALklEQVR4nGNgwA/+owsw4VfvvYOBRJBAonrGC6TaMApGwSgYBaNgFIyCUcCAAACvkwM25qvXfgAAAABJRU5ErkJggg==';

type MockCountryBuilder = (issuedAt: Date) => AlertCreateDto[];

interface MockHazardConfig {
  hazardType: HazardType;
  forecastSources: ForecastSource[];
  builder: MockCountryBuilder;
}

const MOCK_BUILDERS: Record<string, MockHazardConfig[]> = {
  ETH: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildEthiopiaAlerts,
    },
  ],
  UGA: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildUgandaAlerts,
    },
  ],
  MWI: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildMalawiAlerts,
    },
  ],
  KEN: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildKenyaAlerts,
    },
  ],
  PHL: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildPhilippinesAlerts,
    },
    {
      hazardType: HazardType.tropicalCyclone,
      forecastSources: [ForecastSource.GEFS],
      builder: buildPhilippinesTropicalCycloneAlerts,
    },
  ],
  SSD: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildSouthSudanAlerts,
    },
  ],
  ZMB: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildZambiaAlerts,
    },
  ],
};

export const SUPPORTED_MOCK_COUNTRIES = Object.keys(MOCK_BUILDERS);

function buildEthiopiaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'awash-metehara',
      centroid: { latitude: 8.9, longitude: 39.9 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        },
        ...Array.from({ length: 5 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET040701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 12400,
          },
          {
            placeCode: 'ET040799',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 6800,
          },
          {
            placeCode: 'ET020302',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5300,
          },
          {
            placeCode: 'ET020396',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9400,
          },
          {
            placeCode: 'ET020301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 11700,
          },
          {
            placeCode: 'ET020310',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3900,
          },
          {
            placeCode: 'ET020304',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4100,
          },
          {
            placeCode: 'ET0407',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 19200,
          },
          {
            placeCode: 'ET0203',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 34400,
          },
          {
            placeCode: 'ET04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 19200,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 34400,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 53600,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 39.66, ymin: 8.66, xmax: 40.43, ymax: 9.69 },
          },
        ],
      },
    },
    {
      eventName: 'baro-gambella',
      centroid: { latitude: 8.25, longitude: 34.59 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 3),
            end: addDays(issuedAt, 10),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        },
        ...Array.from({ length: 3 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 3),
            end: addDays(issuedAt, 10),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET120201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'ET120202',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 6400,
          },
          {
            placeCode: 'ET120206',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 14100,
          },
          {
            placeCode: 'ET120407',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5300,
          },
          {
            placeCode: 'ET1202',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 22000,
          },
          {
            placeCode: 'ET1204',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 5300,
          },
          {
            placeCode: 'ET12',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 27300,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 27300,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 33.99, ymin: 7.55, xmax: 35.16, ymax: 8.71 },
          },
        ],
      },
    },
    {
      eventName: 'G5173',
      centroid: { latitude: 2.85, longitude: 37.45 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET041207',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 29,
          },
          {
            placeCode: 'ET041212',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 734,
          },
          {
            placeCode: 'ET0412',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 763,
          },
          {
            placeCode: 'ET04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 763,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_G5173_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 36.64625136835569,
              ymin: 4.0229000000145305,
              xmax: 38.46791804005322,
              ymax: 5.227900000013435,
            },
          },
        ],
      },
    },
  ];
}

function buildUgandaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Akokorio at Uganda Gauge',
      centroid: { latitude: 1.775, longitude: 33.875 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG20270101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 5,
          },
          {
            placeCode: 'UG20270110',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 39,
          },
          {
            placeCode: 'UG20460101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 11,
          },
          {
            placeCode: 'UG20460102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'UG20460103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 6,
          },
          {
            placeCode: 'UG20460104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'UG20460105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'UG20460106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'UG20470101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 77,
          },
          {
            placeCode: 'UG20470103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 7,
          },
          {
            placeCode: 'UG20470104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 19,
          },
          {
            placeCode: 'UG20470105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'UG20470106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 13,
          },
          {
            placeCode: 'UG20470201',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 58,
          },
          {
            placeCode: 'UG20470202',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 22,
          },
          {
            placeCode: 'UG20470203',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 29,
          },
          {
            placeCode: 'UG20470204',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'UG30640101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'UG30640108',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 40,
          },
          {
            placeCode: 'UG30800101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 658,
          },
          {
            placeCode: 'UG30800102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 608,
          },
          {
            placeCode: 'UG30800103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 31,
          },
          {
            placeCode: 'UG30800104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 14,
          },
          {
            placeCode: 'UG30800105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3421,
          },
          {
            placeCode: 'UG30800202',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 14,
          },
          {
            placeCode: 'UG30800203',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 427,
          },
          {
            placeCode: 'UG30800204',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 45,
          },
          {
            placeCode: 'UG30900102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 77,
          },
          {
            placeCode: 'UG30900103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 92,
          },
          {
            placeCode: 'UG30900105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 284,
          },
          {
            placeCode: 'UG30900106',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 583,
          },
          {
            placeCode: 'UG30900108',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 253,
          },
          {
            placeCode: 'UG202701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'UG204601',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 26,
          },
          {
            placeCode: 'UG204701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 120,
          },
          {
            placeCode: 'UG204702',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 113,
          },
          {
            placeCode: 'UG306401',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 42,
          },
          {
            placeCode: 'UG308001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4732,
          },
          {
            placeCode: 'UG308002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 486,
          },
          {
            placeCode: 'UG309001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1289,
          },
          {
            placeCode: 'UG2027',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 44,
          },
          {
            placeCode: 'UG2046',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 26,
          },
          {
            placeCode: 'UG2047',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 233,
          },
          {
            placeCode: 'UG3064',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 42,
          },
          {
            placeCode: 'UG3080',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 5218,
          },
          {
            placeCode: 'UG3090',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1289,
          },
          {
            placeCode: 'UG2',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 303,
          },
          {
            placeCode: 'UG3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 6549,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_AKOKORIO_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 33.34708469241683,
              ymin: 1.6345666666742744,
              xmax: 34.58541802917004,
              ymax: 3.3620666666727033,
            },
          },
        ],
      },
    },
    {
      eventName: 'lokok-karamoja',
      centroid: { latitude: 3.381, longitude: 34.302 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 6),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 2,
        },
        ...Array.from({ length: 3 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 6),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 2,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG30750101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 600,
          },
          {
            placeCode: 'UG30750102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1300,
          },
          {
            placeCode: 'UG30750103',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 500,
          },
          {
            placeCode: 'UG30750105',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 900,
          },
          {
            placeCode: 'UG30750109',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1100,
          },
          {
            placeCode: 'UG30750112',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1600,
          },
          {
            placeCode: 'UG307501',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 6000,
          },
          {
            placeCode: 'UG3075',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 6000,
          },
          {
            placeCode: 'UG3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 6000,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 6000,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 34.05, ymin: 3.08, xmax: 34.56, ymax: 3.7 },
          },
        ],
      },
    },
    {
      eventName: 'mpologoma-kyankwanzi',
      centroid: { latitude: 1.1, longitude: 31.8 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 5),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 1.5,
        },
        ...Array.from({ length: 2 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 5),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 1.5,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG10110104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'UG10120111',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG10120112',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1100,
          },
          {
            placeCode: 'UG10120116',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1100,
          },
          {
            placeCode: 'UG10120117',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'UG10120123',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4200,
          },
          {
            placeCode: 'UG101101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'UG101201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'UG1011',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1500,
          },
          {
            placeCode: 'UG1012',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'UG1',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 10600,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 10600,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 31.54, ymin: 0.85, xmax: 32.01, ymax: 1.36 },
          },
        ],
      },
    },
  ];
}

function buildMalawiAlerts(issuedAt: Date): AlertCreateDto[] {
  // NOTE: MWI currently has single threshold for both severity and probability, and therefore only 'high' alert-class is possible. Therefore only 1 event is mocked here.
  return [
    {
      eventName: 'Sinoya South',
      centroid: { latitude: -16.223, longitude: 35.307 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW30701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 24,
          },
          {
            placeCode: 'MW30703',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 37,
          },
          {
            placeCode: 'MW307',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 61,
          },
          {
            placeCode: 'MW3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 61,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MWI_SINOYA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 35.11375136412342,
              ymin: -16.377099999985106,
              xmax: 35.308751364661944,
              ymax: -16.166266666651964,
            },
          },
        ],
      },
    },
  ];
}

function buildKenyaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'ATHI MUNYU (3DA02)',
      centroid: { latitude: -1.095, longitude: 37.194 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'KEN.14.1.1_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 48,
          },
          {
            placeCode: 'KEN.14.1.4_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 176,
          },
          {
            placeCode: 'KEN.14.3.1_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 14199,
          },
          {
            placeCode: 'KEN.14.3.3_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1788,
          },
          {
            placeCode: 'KEN.14.5.1_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'KEN.14.5.2_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3650,
          },
          {
            placeCode: 'KEN.14.5.5_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 17680,
          },
          {
            placeCode: 'KEN.14.6.2_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 363,
          },
          {
            placeCode: 'KEN.14.6.3_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2761,
          },
          {
            placeCode: 'KEN.39.3.1_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 156,
          },
          {
            placeCode: 'KEN.39.3.4_1',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15,
          },
          {
            placeCode: 'KEN.14.1_1',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 224,
          },
          {
            placeCode: 'KEN.14.3_1',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 15987,
          },
          {
            placeCode: 'KEN.14.5_1',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 22530,
          },
          {
            placeCode: 'KEN.14.6_1',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 3124,
          },
          {
            placeCode: 'KEN.39.3_1',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 171,
          },
          {
            placeCode: 'KEN.14_1',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 41865,
          },
          {
            placeCode: 'KEN.39_1',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 171,
          },
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

function buildPhilippinesAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Nia Pumping Station',
      centroid: { latitude: 8.886, longitude: 125.541 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH1600201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 34748,
          },
          {
            placeCode: 'PH1600202',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 250693,
          },
          {
            placeCode: 'PH1600203',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 21307,
          },
          {
            placeCode: 'PH1600204',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3579,
          },
          {
            placeCode: 'PH1600205',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 525,
          },
          {
            placeCode: 'PH1600207',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 13551,
          },
          {
            placeCode: 'PH1600208',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 18750,
          },
          {
            placeCode: 'PH1600209',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 12252,
          },
          {
            placeCode: 'PH1600210',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2036,
          },
          {
            placeCode: 'PH1600211',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8467,
          },
          {
            placeCode: 'PH1600212',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2553,
          },
          {
            placeCode: 'PH1600301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1360,
          },
          {
            placeCode: 'PH1600303',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 27524,
          },
          {
            placeCode: 'PH1600306',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1233,
          },
          {
            placeCode: 'PH1600309',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 11565,
          },
          {
            placeCode: 'PH16002',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 368461,
          },
          {
            placeCode: 'PH16003',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 41682,
          },
          {
            placeCode: 'PH16',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 410143,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: PHL_NIA_PUMPING_STATION_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 125.16958286001241,
              ymin: 8.311250169469588,
              xmax: 126.03541618991946,
              ymax: 9.467916831480181,
            },
          },
        ],
      },
    },
  ];
}

function buildPhilippinesTropicalCycloneAlerts(
  issuedAt: Date,
): AlertCreateDto[] {
  return [
    {
      eventName: 'WP20_2024',
      centroid: { latitude: 20.69, longitude: 121.8 },
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
            layer: LayerName.populationExposed,
            value: 1471,
          },
          {
            placeCode: 'PH0200901',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 10221,
          },
          {
            placeCode: 'PH0200902',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3361,
          },
          {
            placeCode: 'PH0200904',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1740,
          },
          {
            placeCode: 'PH0200905',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1804,
          },
          {
            placeCode: 'PH0200906',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1445,
          },
          {
            placeCode: 'PH02009',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 20042,
          },
          {
            placeCode: 'PH02',
            adminLevel: 1,
            layer: LayerName.populationExposed,
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

function buildSouthSudanAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'G5100',
      centroid: { latitude: 6.208, longitude: 31.542 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 50,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 50,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'SS030301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1496,
          },
          {
            placeCode: 'SS030302',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5517,
          },
          {
            placeCode: 'SS030303',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 107012,
          },
          {
            placeCode: 'SS030304',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 4194,
          },
          {
            placeCode: 'SS030305',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 16042,
          },
          {
            placeCode: 'SS030306',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 934,
          },
          {
            placeCode: 'SS031001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15503,
          },
          {
            placeCode: 'SS031002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 50445,
          },
          {
            placeCode: 'SS031003',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 10881,
          },
          {
            placeCode: 'SS031004',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 30002,
          },
          {
            placeCode: 'SS031005',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 16413,
          },
          {
            placeCode: 'SS040101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 530,
          },
          {
            placeCode: 'SS040103',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2903,
          },
          {
            placeCode: 'SS040104',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8362,
          },
          {
            placeCode: 'SS040105',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 13,
          },
          {
            placeCode: 'SS040106',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 7745,
          },
          {
            placeCode: 'SS040107',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9070,
          },
          {
            placeCode: 'SS040108',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 341,
          },
          {
            placeCode: 'SS040701',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1029,
          },
          {
            placeCode: 'SS040702',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'SS040703',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 300,
          },
          {
            placeCode: 'SS040704',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 390,
          },
          {
            placeCode: 'SS040705',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 98,
          },
          {
            placeCode: 'SS040706',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 150,
          },
          {
            placeCode: 'SS0303',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 135195,
          },
          {
            placeCode: 'SS0310',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 123244,
          },
          {
            placeCode: 'SS0401',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 28964,
          },
          {
            placeCode: 'SS0407',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1969,
          },
          {
            placeCode: 'SS03',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 258439,
          },
          {
            placeCode: 'SS04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 30933,
          },
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

function buildZambiaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'NgwerereConfluence',
      centroid: { latitude: -15.2167, longitude: 28.5 },
      severity: [
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          timeInterval: {
            start: addDays(issuedAt, i),
            end: addDays(issuedAt, i + 1),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 20,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ZM101001001002',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'ZM101001001003',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 30,
          },
          {
            placeCode: 'ZM101001001005',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 25,
          },
          {
            placeCode: 'ZM101001001006',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 86,
          },
          {
            placeCode: 'ZM101001001007',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 317,
          },
          {
            placeCode: 'ZM101001001008',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 23,
          },
          {
            placeCode: 'ZM101001002009',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 27,
          },
          {
            placeCode: 'ZM101001002010',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 18,
          },
          {
            placeCode: 'ZM101001002011',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM101001002012',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 12,
          },
          {
            placeCode: 'ZM101001002014',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 66,
          },
          {
            placeCode: 'ZM101001002015',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 33,
          },
          {
            placeCode: 'ZM101001002016',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: 'ZM101001002017',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 26,
          },
          {
            placeCode: 'ZM101001002018',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 379,
          },
          {
            placeCode: 'ZM101001002019',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 174,
          },
          {
            placeCode: 'ZM101001002020',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 49,
          },
          {
            placeCode: 'ZM101001002021',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 97,
          },
          {
            placeCode: 'ZM101002003001',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM101002003002',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 16,
          },
          {
            placeCode: 'ZM101002003003',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 47,
          },
          {
            placeCode: 'ZM101002003005',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 127,
          },
          {
            placeCode: 'ZM101002003006',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 50,
          },
          {
            placeCode: 'ZM101002003007',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 17,
          },
          {
            placeCode: 'ZM101002003008',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM101002003009',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 12,
          },
          {
            placeCode: 'ZM101002003010',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 116,
          },
          {
            placeCode: 'ZM101002003011',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM101002003012',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 35,
          },
          {
            placeCode: 'ZM101005006002',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2,
          },
          {
            placeCode: 'ZM101005006011',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4,
          },
          {
            placeCode: 'ZM101005007020',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: 'ZM101005007021',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 205,
          },
          {
            placeCode: 'ZM101005007022',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 11,
          },
          {
            placeCode: 'ZM102002017001',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 19,
          },
          {
            placeCode: 'ZM102002017002',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 28,
          },
          {
            placeCode: 'ZM102002017003',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 24,
          },
          {
            placeCode: 'ZM102002017004',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 280,
          },
          {
            placeCode: 'ZM102002017005',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 466,
          },
          {
            placeCode: 'ZM102002017009',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1,
          },
          {
            placeCode: 'ZM102002017010',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3,
          },
          {
            placeCode: 'ZM102002017011',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 96,
          },
          {
            placeCode: 'ZM102002017013',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 6,
          },
          {
            placeCode: 'ZM102002018026',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 140,
          },
          {
            placeCode: 'ZM102002018027',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 16,
          },
          {
            placeCode: 'ZM101001001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 485,
          },
          {
            placeCode: 'ZM101001002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 885,
          },
          {
            placeCode: 'ZM101002003',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 423,
          },
          {
            placeCode: 'ZM101005006',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 6,
          },
          {
            placeCode: 'ZM101005007',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 219,
          },
          {
            placeCode: 'ZM102002017',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 923,
          },
          {
            placeCode: 'ZM102002018',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 156,
          },
          {
            placeCode: 'ZM101001',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1370,
          },
          {
            placeCode: 'ZM101002',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 423,
          },
          {
            placeCode: 'ZM101005',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 225,
          },
          {
            placeCode: 'ZM102002',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1079,
          },
          {
            placeCode: 'ZM101',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 2018,
          },
          {
            placeCode: 'ZM102',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 1079,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ZMB_NGWERERECONFLUENCE_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 27.153751341979486,
              ymin: -15.344599999986045,
              xmax: 28.997918013739152,
              ymax: -12.24626666665553,
            },
          },
        ],
      },
    },
  ];
}

export class MockConfigError extends Error {}

export function buildMockForecasts({
  countryCodeIso3,
  issuedAt,
  alertsOverride,
  hazardTypes,
}: {
  countryCodeIso3: string;
  issuedAt: Date;
  alertsOverride?: AlertCreateDto[];
  hazardTypes?: HazardType[];
}): ForecastCreateDto[] {
  if (!Object.hasOwn(MOCK_BUILDERS, countryCodeIso3)) {
    throw new Error(
      `No mock event configuration for country '${countryCodeIso3}'. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
    );
  }

  const configs = hazardTypes
    ? MOCK_BUILDERS[countryCodeIso3].filter((c) =>
        hazardTypes.includes(c.hazardType),
      )
    : MOCK_BUILDERS[countryCodeIso3];

  if (configs.length === 0) {
    const available = MOCK_BUILDERS[countryCodeIso3]
      .map((c) => c.hazardType)
      .join(', ');
    throw new MockConfigError(
      `No mock configuration for hazard type(s) '${hazardTypes?.join(', ')}' in country '${countryCodeIso3}'. Available: ${available}`,
    );
  }

  return configs.map((config) => ({
    issuedAt,
    hazardType: config.hazardType,
    forecastSources: config.forecastSources,
    countryCodeIso3,
    alerts: alertsOverride ?? config.builder(issuedAt),
  }));
}
