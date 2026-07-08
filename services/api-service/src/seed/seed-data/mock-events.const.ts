import { addDays } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

const MOCK_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAUCAYAAABSx2cSAAAA0ElEQVR4AaXBsW0jQRREwXezedDpNNpmTDTXZEy0OxLa7fwIpFvgCAjCeVP153a7fd3vdy6Px4OP5/PJ5fV68X6/+Z/FhmNmzrZIIgm2udgmCZJoy8zw22LDYsMBnDNDWySRBNtcbJMESbRlZvhpsWGxYbHhAE7+mhnaIokk2OZimyRIoi0zw8diw2LDAZz8MzO0RRJJsM3FNkmQRFtmhstiw2LDAZz8MDO0RRJJsM3FNkmQRFtmhsWGxYbFhgM4+WVmaIskkmCbi22SIIm2fANUaHZa8hEamQAAAABJRU5ErkJggg==';

const MOCK_BUILDERS: Record<string, MockCountryBuilder> = {
  ETH: buildEthiopiaAlerts,
  UGA: buildUgandaAlerts,
  MWI: buildMalawiAlerts,
};

export const SUPPORTED_MOCK_COUNTRIES = Object.keys(MOCK_BUILDERS);

type MockCountryBuilder = (issuedAt: Date) => AlertCreateDto[];

function buildEthiopiaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'ETH_floods_awash-metehara',
      centroid: { latitude: 8.9, longitude: 39.9 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 25,
        },
        ...Array.from({ length: 5 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 9),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 25,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020301',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 12400,
          },
          {
            placeCode: 'ET020302',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 8300,
          },
          {
            placeCode: 'ET020303',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5600,
          },
          {
            placeCode: 'ET020101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15200,
          },
          {
            placeCode: 'ET020103',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9100,
          },
          {
            placeCode: 'ET020104',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3400,
          },
          {
            placeCode: 'ET020105',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 7800,
          },
          {
            placeCode: 'ET0203',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 26300,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 35500,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 61800,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 61800,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 39.0, ymin: 8.0, xmax: 40.5, ymax: 10.0 },
          },
        ],
      },
    },
    {
      eventName: 'ETH_floods_baro-gambella',
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
            value: 4200,
          },
          {
            placeCode: 'ET120202',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 3100,
          },
          {
            placeCode: 'ET1202',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 7300,
          },
          {
            placeCode: 'ET12',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 7300,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 7300,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 33.5, ymin: 7.5, xmax: 35.0, ymax: 9.0 },
          },
        ],
      },
    },
    {
      eventName: 'ETH_floods_dawa-borena',
      centroid: { latitude: 5.5, longitude: 39.5 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 7),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        },
        {
          timeInterval: {
            start: addDays(issuedAt, 2),
            end: addDays(issuedAt, 7),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 3,
        },
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET040101',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 2100,
          },
          {
            placeCode: 'ET0401',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 2100,
          },
          {
            placeCode: 'ET04',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 2100,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 2100,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 38.5, ymin: 5.0, xmax: 40.5, ymax: 6.0 },
          },
        ],
      },
    },
  ];
}

function buildUgandaAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'UGA_floods_nile-jinja',
      centroid: { latitude: 0.44, longitude: 33.2 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 7),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        },
        ...Array.from({ length: 4 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 7),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 5,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG20400101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 8200,
          },
          {
            placeCode: 'UG20400102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 6100,
          },
          {
            placeCode: 'UG20400104',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 4500,
          },
          {
            placeCode: 'UG204001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 18800,
          },
          {
            placeCode: 'UG2040',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 18800,
          },
          {
            placeCode: 'UG2',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 18800,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 18800,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 32.5, ymin: -0.2, xmax: 33.8, ymax: 1.0 },
          },
        ],
      },
    },
    {
      eventName: 'UGA_floods_lokok-karamoja',
      centroid: { latitude: 3.45, longitude: 34.5 },
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
            placeCode: 'UG30660101',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 3400,
          },
          {
            placeCode: 'UG30660102',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 2100,
          },
          {
            placeCode: 'UG306601',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 5500,
          },
          {
            placeCode: 'UG3066',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 5500,
          },
          {
            placeCode: 'UG3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 5500,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 5500,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 33.8, ymin: 2.8, xmax: 35.2, ymax: 4.2 },
          },
        ],
      },
    },
    {
      eventName: 'UGA_floods_mpologoma-kyankwanzi',
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
            placeCode: 'UG10120110',
            adminLevel: 4,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG101201',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG1012',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG1',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 1200,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 1200,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 31.2, ymin: 0.5, xmax: 32.4, ymax: 1.7 },
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
      eventName: 'MWI_floods_shire-chikwawa',
      centroid: { latitude: -16.03, longitude: 34.77 },
      severity: [
        {
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 8),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        },
        ...Array.from({ length: 5 }, () => ({
          timeInterval: {
            start: addDays(issuedAt, 1),
            end: addDays(issuedAt, 8),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.returnPeriod,
          severityValue: 10,
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW31001',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 22000,
          },
          {
            placeCode: 'MW31002',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 15400,
          },
          {
            placeCode: 'MW31003',
            adminLevel: 3,
            layer: LayerName.populationExposed,
            value: 9800,
          },
          {
            placeCode: 'MW310',
            adminLevel: 2,
            layer: LayerName.populationExposed,
            value: 47200,
          },
          {
            placeCode: 'MW3',
            adminLevel: 1,
            layer: LayerName.populationExposed,
            value: 47200,
          },
          {
            placeCode: 'MW',
            adminLevel: 0,
            layer: LayerName.populationExposed,
            value: 47200,
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MOCK_RASTER_BASE64,
            extent: { xmin: 34.2, ymin: -16.8, xmax: 35.5, ymax: -15.3 },
          },
        ],
      },
    },
  ];
}

export function buildMockForecast(
  countryCode: string,
  issuedAt: Date,
  alertsOverride?: AlertCreateDto[],
): ForecastCreateDto {
  let alerts: AlertCreateDto[];
  if (alertsOverride !== undefined) {
    alerts = alertsOverride;
  } else {
    const builder = MOCK_BUILDERS[countryCode];
    if (!builder) {
      throw new Error(
        `No mock event configuration for country '${countryCode}'. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
      );
    }
    alerts = builder(issuedAt);
  }

  return {
    issuedAt,
    hazardType: HazardType.floods, // TODO: for now we mock only flood events. To be extended later.
    forecastSources: [ForecastSource.glofas],
    countryCodeIso3: countryCode,
    alerts,
  };
}
