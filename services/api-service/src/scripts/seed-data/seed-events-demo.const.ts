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

const AWASH_RIVER_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAUCAYAAABSx2cSAAAA0ElEQVR4AaXBsW0jQRREwXezedDpNNpmTDTXZEy0OxLa7fwIpFvgCAjCeVP153a7fd3vdy6Px4OP5/PJ5fV68X6/+Z/FhmNmzrZIIgm2udgmCZJoy8zw22LDYsMBnDNDWySRBNtcbJMESbRlZvhpsWGxYbHhAE7+mhnaIokk2OZimyRIoi0zw8diw2LDAZz8MzO0RRJJsM3FNkmQRFtmhstiw2LDAZz8MDO0RRJJsM3FNkmQRFtmhsWGxYbFhgM4+WVmaIskkmCbi22SIIm2fANUaHZa8hEamQAAAABJRU5ErkJggg==';

const GAMBELLA_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAPCAYAAAA71pVKAAAAkElEQVR4AaXB0WkEAQxDwRfXpcJUggpTXwmGO1hM/nbmB/jlQRLLNlcSVlvWcLRlJeGyzZLEGv7RlpWEyzZLEsMLwwvDPySxbHMlYbVlOCSxbHMlYbVlDQ+SWLa5krDa8jV8SGLZ5krCasvT8MLwwvDRlpWEyzZLEk/DC8NDW1YSLtssSXwNR1tWEi7bLEmsP2VPPR0QvluXAAAAAElFTkSuQmCC';

export function buildDemoForecast(): ForecastCreateDto {
  const now = new Date();
  const daysFromNow = (days: number): Date => addDays(now, days);

  const awashRiverAlert: AlertCreateDto = {
    eventName: 'ETH_floods_awash-metehara',
    centroid: { latitude: 8.9, longitude: 39.9 },
    severity: [
      {
        timeInterval: {
          start: daysFromNow(-1),
          end: daysFromNow(7),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 25,
      },
      ...Array.from({ length: 5 }, () => ({
        timeInterval: {
          start: daysFromNow(-1),
          end: daysFromNow(7),
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
          valueBlackWhite: AWASH_RIVER_RASTER_BASE64,
          extent: { xmin: 39.0, ymin: 8.0, xmax: 40.5, ymax: 10.0 },
        },
      ],
    },
  };

  const gambellaAlert: AlertCreateDto = {
    eventName: 'ETH_floods_baro-gambella',
    centroid: { latitude: 8.25, longitude: 34.59 },
    severity: [
      {
        timeInterval: {
          start: daysFromNow(1),
          end: daysFromNow(8),
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 2,
      },
      ...Array.from({ length: 3 }, () => ({
        timeInterval: {
          start: daysFromNow(1),
          end: daysFromNow(8),
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: SeverityKey.returnPeriod,
        severityValue: 2,
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
          valueBlackWhite: GAMBELLA_RASTER_BASE64,
          extent: { xmin: 33.5, ymin: 7.5, xmax: 35.0, ymax: 9.0 },
        },
      ],
    },
  };

  return {
    issuedAt: daysFromNow(-2),
    hazardType: HazardType.floods,
    forecastSources: [ForecastSource.glofas],
    alerts: [awashRiverAlert, gambellaAlert],
  };
}
