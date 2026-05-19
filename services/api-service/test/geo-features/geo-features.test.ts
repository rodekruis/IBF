import { HttpStatus } from '@nestjs/common';

import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Geo Features', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.test, __filename);
    accessToken = await getAccessToken();
  });

  describe('GET /geo-features', () => {
    it('should return geo-features for a country and layer', async () => {
      const response = await getServer()
        .get('/geo-features')
        .query({ countryCodeIso3: 'ETH', layer: Layer.glofasStations })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const feature = response.body[0];
      expect(feature.countryCodeIso3).toBe('ETH');
      expect(feature.layer).toBe(Layer.glofasStations);
      expect(feature.featureType).toBe(GeoFeatureType.point);
      expect(feature.referenceId).toBeDefined();
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry.type).toBe(GeoFeatureType.point);
      expect(feature.geometry.coordinates).toHaveLength(2);
      expect(feature.attributes).toBeDefined();
    });

    it('should reject invalid layer value', async () => {
      const response = await getServer()
        .get('/geo-features')
        .query({ countryCodeIso3: 'ETH', layer: 'nonexistent_layer' })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
