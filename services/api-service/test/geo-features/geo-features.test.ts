import { HttpStatus } from '@nestjs/common';

import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Geo Features', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename);
    accessToken = await getAccessToken();
  });

  describe('GET /geo-features', () => {
    it('should return a GeoJSON FeatureCollection', async () => {
      const response = await getServer()
        .get('/geo-features')
        .query({
          filter: `countryCodeIso3='ETH' AND layer='${LayerName.glofasStations}'`,
        })
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.type).toBe('FeatureCollection');
      expect(Array.isArray(response.body.features)).toBe(true);
      expect(response.body.features.length).toBeGreaterThan(0);

      const feature = response.body.features[0];
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.properties.countryCodeIso3).toBe('ETH');
      expect(feature.properties.layer).toBe(LayerName.glofasStations);
    });
  });

  const validGeoFeature = {
    countryCodeIso3: 'ETH',
    featureType: GeoFeatureType.point,
    layer: LayerName.glofasStations,
    referenceId: 'TEST_STATION_01',
    geometry: { type: 'Point', coordinates: [38.5, 9.0] },
    attributes: { name: 'Test Station' },
  };

  describe('POST /geo-features', () => {
    it('should create a geo-feature', async () => {
      const response = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send(validGeoFeature);

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.type).toBe('Feature');
      expect(response.body.id).toBeDefined();
      expect(response.body.properties.countryCodeIso3).toBe('ETH');
      expect(response.body.properties.referenceId).toBe('TEST_STATION_01');
      expect(response.body.geometry.coordinates).toEqual([38.5, 9.0]);
    });

    it('should return 409 for duplicate geo-feature', async () => {
      const firstResponse = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send({ ...validGeoFeature, referenceId: 'DUPLICATE_TEST_01' });

      expect(firstResponse.status).toBe(HttpStatus.CREATED);

      const response = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send({ ...validGeoFeature, referenceId: 'DUPLICATE_TEST_01' });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('should return 400 for non-existent country', async () => {
      const response = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send({
          ...validGeoFeature,
          countryCodeIso3: 'XXX',
          referenceId: 'UNIQUE',
        });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /geo-features/:id', () => {
    it('should update a geo-feature', async () => {
      const createResponse = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send({ ...validGeoFeature, referenceId: 'TO_UPDATE' });

      expect(createResponse.status).toBe(HttpStatus.CREATED);
      const id = createResponse.body.id;

      const response = await getServer()
        .patch(`/geo-features/${id}`)
        .set('Cookie', [accessToken])
        .send({ attributes: { name: 'Updated Station' } });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.type).toBe('Feature');
      expect(response.body.properties.attributes.name).toBe('Updated Station');
    });

    it('should return 404 for non-existent id', async () => {
      const response = await getServer()
        .patch('/geo-features/999999')
        .set('Cookie', [accessToken])
        .send({ attributes: { name: 'Does not exist' } });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /geo-features/:id', () => {
    it('should delete a geo-feature', async () => {
      const createResponse = await getServer()
        .post('/geo-features')
        .set('Cookie', [accessToken])
        .send({ ...validGeoFeature, referenceId: 'TO_DELETE' });

      expect(createResponse.status).toBe(HttpStatus.CREATED);
      const id = createResponse.body.id;

      const response = await getServer()
        .delete(`/geo-features/${id}`)
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NO_CONTENT);
    });

    it('should return 404 for non-existent id', async () => {
      const response = await getServer()
        .delete('/geo-features/999999')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
