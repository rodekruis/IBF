import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { SEED_COUNTRIES } from '@api-service/src/scripts/seed-data/seed-countries.const';
import { HazardType, Layer } from '@api-service/src/shared-enums';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('Seed – all countries', () => {
  let accessToken: string;

  beforeAll(async () => {
    // This intentionally uses the all-country seed, unlike other tests. With the purpose of doing a basic comprehensive check on this, which outweighs the downside of longer seeding time.
    await resetDB(SeedScript.allCountries, __filename);
    accessToken = await getAccessToken();
  }, 120_000);

  describe('Admin areas', () => {
    it.each(
      SEED_COUNTRIES.map((c) => [c.countryCodeIso3, c.deepestAdminLevel]),
    )(
      '%s should have admin areas seeded up to level %i',
      async (countryCodeIso3, deepestAdminLevel) => {
        const response = await getServer()
          .get('/admin-areas')
          .query({ countryCodeIso3 })
          .set('Cookie', [accessToken]);

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.features.length).toBeGreaterThan(0);

        const adminLevels = [
          ...new Set(
            response.body.features.map(
              (feature: { properties: { adminLevel: number } }) =>
                feature.properties.adminLevel,
            ),
          ),
        ];
        for (let level = 0; level <= (deepestAdminLevel as number); level++) {
          expect(adminLevels).toContain(level);
        }
      },
    );
  });

  describe('Alert configs – floods', () => {
    const floodCountries = SEED_COUNTRIES.filter((c) =>
      c.hazardTypes.includes(HazardType.floods),
    ).map((c) => c.countryCodeIso3);

    it.each(floodCountries)(
      '%s should have flood alert configs',
      async (countryCodeIso3) => {
        const response = await getServer()
          .get('/alert-configs')
          .query({ countryCodeIso3, hazardType: HazardType.floods })
          .set('Cookie', [accessToken]);

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.length).toBeGreaterThan(0);

        for (const config of response.body) {
          expect(config.countryCodeIso3).toBe(countryCodeIso3);
          expect(config.hazardType).toBe(HazardType.floods);
          expect(config.spatialExtentName).toBeTruthy();
          expect(Array.isArray(config.spatialExtentPlaceCodes)).toBe(true);
          expect(config.spatialExtentPlaceCodes.length).toBeGreaterThan(0);
        }
      },
    );
  });

  describe('Alert configs – drought', () => {
    const droughtCountries = SEED_COUNTRIES.filter((c) =>
      c.hazardTypes.includes(HazardType.drought),
    ).map((c) => c.countryCodeIso3);

    it.each(droughtCountries)(
      '%s should have drought alert configs',
      async (countryCodeIso3) => {
        const response = await getServer()
          .get('/alert-configs')
          .query({ countryCodeIso3, hazardType: HazardType.drought })
          .set('Cookie', [accessToken]);

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.length).toBeGreaterThan(0);

        for (const config of response.body) {
          expect(config.countryCodeIso3).toBe(countryCodeIso3);
          expect(config.hazardType).toBe(HazardType.drought);
          expect(config.spatialExtentName).toBeTruthy();
          expect(Array.isArray(config.temporalExtents)).toBe(true);
          expect(config.temporalExtents.length).toBeGreaterThan(0);
        }
      },
    );
  });

  describe('Geo-features – GloFAS stations', () => {
    const floodCountries = SEED_COUNTRIES.filter((c) =>
      c.hazardTypes.includes(HazardType.floods),
    ).map((c) => c.countryCodeIso3);

    it.each(floodCountries)(
      '%s should have GloFAS station geo-features',
      async (countryCodeIso3) => {
        const response = await getServer()
          .get('/geo-features')
          .query({
            filter: `countryCodeIso3='${countryCodeIso3}' AND layer='${Layer.glofasStations}'`,
          })
          .set('Cookie', [accessToken]);

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.type).toBe('FeatureCollection');
        expect(response.body.features.length).toBeGreaterThan(0);

        const feature = response.body.features[0];
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties.countryCodeIso3).toBe(countryCodeIso3);
        expect(feature.properties.layer).toBe(Layer.glofasStations);
      },
    );
  });
});
