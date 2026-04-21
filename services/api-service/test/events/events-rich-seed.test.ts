import { HttpStatus } from '@nestjs/common';

import { ExposureAdminAreaDto } from '@api-service/src/alerts/dto/exposure-admin-area.dto';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
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

// Tana River county hierarchy (station: TANA HOLA G5305)
// Admin 3 (wards) → Admin 2 (sub-counties) → Admin 1 (county) → Admin 0 (country)
const TANA_RIVER_ADMIN_AREAS: ExposureAdminAreaDto[] = [
  // Admin level 3 — wards along the Tana River
  {
    placeCode: 'KE0040180088',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 12400,
  },
  {
    placeCode: 'KE0040180089',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 8300,
  },
  {
    placeCode: 'KE0040180091',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 5600,
  },
  {
    placeCode: 'KE0040190092',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 15200,
  },
  {
    placeCode: 'KE0040190093',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 9100,
  },
  {
    placeCode: 'KE0040190094',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 3400,
  },
  {
    placeCode: 'KE0040200096',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 7800,
  },
  // Admin level 2 — sub-counties
  {
    placeCode: 'KE004018',
    adminLevel: 2,
    layer: Layer.populationExposed,
    value: 26300,
  },
  {
    placeCode: 'KE004019',
    adminLevel: 2,
    layer: Layer.populationExposed,
    value: 27700,
  },
  {
    placeCode: 'KE004020',
    adminLevel: 2,
    layer: Layer.populationExposed,
    value: 7800,
  },
  // Admin level 1 — Tana River county
  {
    placeCode: 'KE004',
    adminLevel: 1,
    layer: Layer.populationExposed,
    value: 61800,
  },
  // Admin level 0 — Kenya
  {
    placeCode: 'KE',
    adminLevel: 0,
    layer: Layer.populationExposed,
    value: 61800,
  },
];

// Busia county — second event with smaller footprint
const BUSIA_ADMIN_AREAS: ExposureAdminAreaDto[] = [
  {
    placeCode: 'KE0402301149',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 4200,
  },
  {
    placeCode: 'KE0402301150',
    adminLevel: 3,
    layer: Layer.populationExposed,
    value: 3100,
  },
  {
    placeCode: 'KE040230',
    adminLevel: 2,
    layer: Layer.populationExposed,
    value: 7300,
  },
  {
    placeCode: 'KE040',
    adminLevel: 1,
    layer: Layer.populationExposed,
    value: 7300,
  },
  {
    placeCode: 'KE',
    adminLevel: 0,
    layer: Layer.populationExposed,
    value: 7300,
  },
];

describe('GET /events - rich seed data for demo/debugging', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetDB(SeedScript.initialState, __filename);
    accessToken = await getAccessToken();
  });

  it('should seed two realistic flood events with multi-level admin areas', async () => {
    const now = new Date();
    const daysFromNow = (days: number): Date =>
      new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Event 1: Tana River — high severity, triggered
    const tanaRiverAlert = buildAlert({
      eventName: 'KEN_floods_tana-hola',
      centroid: { latitude: -1.5, longitude: 40.05 },
      severity: buildSeverityData({
        start: daysFromNow(-1),
        end: daysFromNow(7),
        medianValue: 500,
        runValues: [480, 520, 510, 490, 530],
      }),
      exposure: {
        adminAreas: TANA_RIVER_ADMIN_AREAS,
        rasters: [
          {
            layer: Layer.alertExtent,
            value: 'base64-tana-river',
            extent: { xmin: 39.5, ymin: -2.0, xmax: 40.5, ymax: -1.0 },
          },
        ],
      },
    });

    // Event 2: Busia — medium severity, not triggered
    const busiaAlert = buildAlert({
      eventName: 'KEN_floods_nzoia-ruambwa',
      centroid: { latitude: 0.124, longitude: 34.09 },
      severity: buildSeverityData({
        start: daysFromNow(1),
        end: daysFromNow(8),
        medianValue: 120,
        runValues: [150, 140, 160],
      }),
      exposure: {
        adminAreas: BUSIA_ADMIN_AREAS,
        rasters: [
          {
            layer: Layer.alertExtent,
            value: 'base64-busia',
            extent: { xmin: 33.5, ymin: -0.5, xmax: 34.5, ymax: 0.5 },
          },
        ],
      },
    });

    // Submit as a single forecast
    const forecast = buildForecast([tanaRiverAlert, busiaAlert], {
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
