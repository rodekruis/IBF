import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { HazardType, LayerName } from '@api-service/src/shared-enums';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('Seed', () => {
  let accessToken: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename, false);
    accessToken = await getAccessToken();
  });

  describe('Admin areas', () => {
    it('should have admin areas seeded up to level 3', async () => {
      const response = await getServer()
        .get('/admin-areas')
        .query({ countryCodeIso3: 'ETH' })
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
      for (let level = 0; level <= 3; level++) {
        expect(adminLevels).toContain(level);
      }
    });
  });

  describe('Alert configs – floods', () => {
    it('should have flood alert configs', async () => {
      const response = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'ETH', hazardType: HazardType.floods })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);

      for (const config of response.body) {
        expect(config.countryCodeIso3).toBe('ETH');
        expect(config.hazardType).toBe(HazardType.floods);
        expect(config.spatialExtentName).toBeTruthy();
        expect(Array.isArray(config.spatialExtentPlaceCodes)).toBe(true);
        expect(config.spatialExtentPlaceCodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Alert configs – drought', () => {
    it('should have drought alert configs', async () => {
      const response = await getServer()
        .get('/alert-configs')
        .query({ countryCodeIso3: 'ETH', hazardType: HazardType.drought })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.length).toBeGreaterThan(0);

      for (const config of response.body) {
        expect(config.countryCodeIso3).toBe('ETH');
        expect(config.hazardType).toBe(HazardType.drought);
        expect(config.spatialExtentName).toBeTruthy();
        expect(Array.isArray(config.temporalExtents)).toBe(true);
        expect(config.temporalExtents.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Geo-features – GloFAS stations', () => {
    it('should have GloFAS station geo-features', async () => {
      const response = await getServer()
        .get('/geo-features')
        .query({
          filter: `countryCodeIso3='ETH' AND layer='${LayerName.glofasStations}'`,
        })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.type).toBe('FeatureCollection');
      expect(response.body.features.length).toBeGreaterThan(0);

      const feature = response.body.features[0];
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.properties.countryCodeIso3).toBe('ETH');
      expect(feature.properties.layer).toBe(LayerName.glofasStations);
    });
  });

  describe('Population raster', () => {
    it('should have a population raster with metadata', async () => {
      const response = await getServer().get(
        `/rasters/static/ETH/${LayerName.population}`,
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.layer).toBe(LayerName.population);
      expect(response.body.metadata.data.extent).toEqual(
        expect.objectContaining({
          xmin: expect.any(Number),
          ymin: expect.any(Number),
          xmax: expect.any(Number),
          ymax: expect.any(Number),
        }),
      );
      expect(response.body.metadata.coloured.extent).toEqual(
        expect.objectContaining({
          xmin: expect.any(Number),
          ymin: expect.any(Number),
          xmax: expect.any(Number),
          ymax: expect.any(Number),
        }),
      );
    });
  });
});
