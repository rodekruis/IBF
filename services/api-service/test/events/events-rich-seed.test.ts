import { HttpStatus } from '@nestjs/common';
import { addDays } from 'date-fns';

import { ExposureAdminAreaDto } from '@api-service/src/alerts/dto/exposure-admin-area.dto';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  buildSeverityData,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getActiveEvents } from '@api-service/test/helpers/event.helper';
import {
  getAccessToken,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

// TODO: refine these mock flood extents to more accurately reflect the actual flood footprint, rather than just being a generic placeholder raster for testing the presence of raster data and multi-level admin areas in the seeded events. This will enhance the realism of the seed data for demo and debugging purposes, especially when visualizing the raster data in the frontend.
// 15x20 grayscale PNG simulating a river flood corridor (Awash River, ETH)
const AWASH_RIVER_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAUCAYAAABSx2cSAAAA0ElEQVR4AaXBsW0jQRREwXezedDpNNpmTDTXZEy0OxLa7fwIpFvgCAjCeVP153a7fd3vdy6Px4OP5/PJ5fV68X6/+Z/FhmNmzrZIIgm2udgmCZJoy8zw22LDYsMBnDNDWySRBNtcbJMESbRlZvhpsWGxYbHhAE7+mhnaIokk2OZimyRIoi0zw8diw2LDAZz8MzO0RRJJsM3FNkmQRFtmhstiw2LDAZz8MDO0RRJJsM3FNkmQRFtmhsWGxYbFhgM4+WVmaIskkmCbi22SIIm2fANUaHZa8hEamQAAAABJRU5ErkJggg==';

// 15x15 grayscale PNG simulating a broad floodplain (Gambella, ETH)
const GAMBELLA_RASTER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAPCAYAAAA71pVKAAAAkElEQVR4AaXB0WkEAQxDwRfXpcJUggpTXwmGO1hM/nbmB/jlQRLLNlcSVlvWcLRlJeGyzZLEGv7RlpWEyzZLEsMLwwvDPySxbHMlYbVlOCSxbHMlYbVlDQ+SWLa5krDa8jV8SGLZ5krCasvT8MLwwvDRlpWEyzZLEk/DC8NDW1YSLtssSXwNR1tWEi7bLEmsP2VPPR0QvluXAAAAAElFTkSuQmCC';

// Awash River zone hierarchy (station: AWASH G5305)
// Admin 3 (woredas) → Admin 2 (zones) → Admin 1 (region) → Admin 0 (country)
const AWASH_RIVER_ADMIN_AREAS: ExposureAdminAreaDto[] = [
  // Admin level 3 — woredas along the Awash River
  {
    placeCode: 'ET0040180088',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 12400,
  },
  {
    placeCode: 'ET0040180089',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 8300,
  },
  {
    placeCode: 'ET0040180091',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 5600,
  },
  {
    placeCode: 'ET0040190092',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 15200,
  },
  {
    placeCode: 'ET0040190093',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 9100,
  },
  {
    placeCode: 'ET0040190094',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 3400,
  },
  {
    placeCode: 'ET0040200096',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 7800,
  },
  // Admin level 2 — zones
  {
    placeCode: 'ET004018',
    adminLevel: 2,
    layer: LayerName.populationExposed,
    value: 26300,
  },
  {
    placeCode: 'ET004019',
    adminLevel: 2,
    layer: LayerName.populationExposed,
    value: 27700,
  },
  {
    placeCode: 'ET004020',
    adminLevel: 2,
    layer: LayerName.populationExposed,
    value: 7800,
  },
  // Admin level 1 — Afar region
  {
    placeCode: 'ET004',
    adminLevel: 1,
    layer: LayerName.populationExposed,
    value: 61800,
  },
  // Admin level 0 — Ethiopia
  {
    placeCode: 'ET',
    adminLevel: 0,
    layer: LayerName.populationExposed,
    value: 61800,
  },
];

// Gambella region — second event with smaller footprint
const GAMBELLA_ADMIN_AREAS: ExposureAdminAreaDto[] = [
  {
    placeCode: 'ET0402301149',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 4200,
  },
  {
    placeCode: 'ET0402301150',
    adminLevel: 3,
    layer: LayerName.populationExposed,
    value: 3100,
  },
  {
    placeCode: 'ET040230',
    adminLevel: 2,
    layer: LayerName.populationExposed,
    value: 7300,
  },
  {
    placeCode: 'ET040',
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
];

describe('GET /events - rich seed data for demo/debugging', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetDB(SeedScript.test, __filename);
    accessToken = await getAccessToken();
  });

  it('should seed two realistic flood events with multi-level admin areas', async () => {
    const now = new Date();
    const daysFromNow = (days: number): Date => addDays(now, days);

    // Event 1: Awash River — high severity, triggered
    const awashRiverAlert = buildAlert({
      eventName: 'ETH_floods_awash-metehara',
      centroid: { latitude: 8.9, longitude: 39.9 },
      severity: buildSeverityData({
        start: daysFromNow(-1),
        end: daysFromNow(7),
        medianValue: 25,
        runValues: [25, 25, 25, 25, 25],
      }),
      exposure: {
        adminAreas: AWASH_RIVER_ADMIN_AREAS,
        rasters: [
          {
            layer: LayerName.alertExtent,
            valueBlackWhite: AWASH_RIVER_RASTER_BASE64,
            extent: { xmin: 39.0, ymin: 8.0, xmax: 40.5, ymax: 10.0 },
          },
        ],
      },
    });

    // Event 2: Gambella — medium severity, not triggered
    const gambellaAlert = buildAlert({
      eventName: 'ETH_floods_baro-gambella',
      centroid: { latitude: 8.25, longitude: 34.59 },
      severity: buildSeverityData({
        start: daysFromNow(1),
        end: daysFromNow(8),
        medianValue: 2,
        runValues: [2, 2, 2],
      }),
      exposure: {
        adminAreas: GAMBELLA_ADMIN_AREAS,
        rasters: [
          {
            layer: LayerName.alertExtent,
            valueBlackWhite: GAMBELLA_RASTER_BASE64,
            extent: { xmin: 33.5, ymin: 7.5, xmax: 35.0, ymax: 9.0 },
          },
        ],
      },
    });

    // Submit as a single forecast
    const forecast = buildForecast([awashRiverAlert, gambellaAlert], {
      issuedAt: daysFromNow(-2),
    });

    const createResponse = await createAlerts(forecast);
    expect(createResponse.status).toBe(HttpStatus.CREATED);

    // Verify events are returned without explicit viewTimestamp (defaults to now)
    const response = await getActiveEvents(accessToken);
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toHaveLength(2);
  });
});
