import { HttpStatus } from '@nestjs/common';
import { LayerName, LayerType } from '@prisma/client';

import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

describe('/ Layers', () => {
  let accessToken: string;

  beforeAll(async () => {
    await resetDB(['MWI'], __filename);
    accessToken = await getAccessToken();
  });

  describe('GET /layers', () => {
    it('should return all seeded layers', async () => {
      const response = await getServer()
        .get('/layers')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(7);
    });

    it('should return layers with expected properties', async () => {
      const response = await getServer()
        .get('/layers')
        .set('Cookie', [accessToken]);

      const population = response.body.find(
        (layer: { name: string }) => layer.name === LayerName.population,
      );
      expect(population).toBeDefined();
      expect(population.type).toBe(LayerType.raster);
      expect(population.hazardType).toBeNull();
      expect(population.description).toBeNull();
    });

    it('should return hazard-specific layers with hazardType set', async () => {
      const response = await getServer()
        .get('/layers')
        .set('Cookie', [accessToken]);

      const floodDepth = response.body.find(
        (layer: { name: string }) => layer.name === LayerName.floodDepth,
      );
      expect(floodDepth).toBeDefined();
      expect(floodDepth.hazardType).toBe('floods');
    });
  });

  describe('POST /layers', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await getServer().post('/layers').send({
        name: LayerName.population,
        label: 'Test',
        type: 'raster',
      });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 409 for duplicate layer name', async () => {
      const response = await getServer()
        .post('/layers')
        .set('Cookie', [accessToken])
        .send({
          name: LayerName.population,
          label: 'Population Duplicate',
          type: 'raster',
        });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('PATCH /layers/:layerName', () => {
    it('should update layer label', async () => {
      const response = await getServer()
        .patch(`/layers/${LayerName.population}`)
        .set('Cookie', [accessToken])
        .send({ label: 'Updated Population' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.label).toBe('Updated Population');
      expect(response.body.name).toBe(LayerName.population);
    });

    it('should update layer hazardType', async () => {
      const response = await getServer()
        .patch(`/layers/${LayerName.population}`)
        .set('Cookie', [accessToken])
        .send({ hazardType: 'floods' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.hazardType).toBe('floods');

      await getServer()
        .patch(`/layers/${LayerName.population}`)
        .set('Cookie', [accessToken])
        .send({ hazardType: null });
    });

    it('should return 400 for invalid layer name', async () => {
      const response = await getServer()
        .patch('/layers/nonExistent')
        .set('Cookie', [accessToken])
        .send({ label: 'Does Not Exist' });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await getServer()
        .patch(`/layers/${LayerName.population}`)
        .send({ label: 'Unauthorized' });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /layers/:layerName', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await getServer().delete('/layers/windSpeed');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 for invalid layer name', async () => {
      const response = await getServer()
        .delete('/layers/nonExistent')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
