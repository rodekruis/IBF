import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Admin Areas', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename);
    accessToken = await getAccessToken();
  });

  const validAdminArea = {
    placeCode: 'TEST01',
    adminLevel: 1,
    nameEn: 'Test Admin Area',
    countryCodeIso3: 'ETH',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [38.0, 8.0],
            [38.5, 8.0],
            [38.5, 8.5],
            [38.0, 8.5],
            [38.0, 8.0],
          ],
        ],
      ],
    },
    attributes: { population: 12345 },
  };

  describe('GET /admin-areas', () => {
    it('should return a GeoJSON FeatureCollection', async () => {
      const response = await getServer()
        .get('/admin-areas')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.type).toBe('FeatureCollection');
      expect(Array.isArray(response.body.features)).toBe(true);
    });
  });

  describe('POST /admin-areas', () => {
    it('should create admin areas', async () => {
      const response = await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([{ ...validAdminArea, placeCode: 'CREATE01' }]);

      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('should return 409 for duplicate placeCode', async () => {
      await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([{ ...validAdminArea, placeCode: 'DUP01' }]);

      const response = await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([{ ...validAdminArea, placeCode: 'DUP01' }]);

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('should return 400 for non-existent country', async () => {
      const response = await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([
          {
            ...validAdminArea,
            placeCode: 'BAD01',
            countryCodeIso3: 'XXX',
          },
        ]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /admin-areas/:placeCode', () => {
    it('should update an admin area', async () => {
      const createResponse = await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([{ ...validAdminArea, placeCode: 'PATCH01' }]);

      expect(createResponse.status).toBe(HttpStatus.CREATED);

      const response = await getServer()
        .patch('/admin-areas/PATCH01')
        .set('Cookie', [accessToken])
        .send({ nameEn: 'Updated Admin Area' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.properties.nameEn).toBe('Updated Admin Area');
    });

    it('should return 404 for non-existent admin area', async () => {
      const response = await getServer()
        .patch('/admin-areas/NONEXISTENT')
        .set('Cookie', [accessToken])
        .send({ nameEn: 'Does Not Exist' });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /admin-areas/:placeCode', () => {
    it('should delete an admin area', async () => {
      const createResponse = await getServer()
        .post('/admin-areas')
        .set('Cookie', [accessToken])
        .send([{ ...validAdminArea, placeCode: 'DEL01' }]);

      expect(createResponse.status).toBe(HttpStatus.CREATED);

      const response = await getServer()
        .delete('/admin-areas/DEL01')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NO_CONTENT);
    });

    it('should return 404 for non-existent admin area', async () => {
      const response = await getServer()
        .delete('/admin-areas/NONEXISTENT')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
