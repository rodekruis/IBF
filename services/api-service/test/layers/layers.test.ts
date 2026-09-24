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
    await resetDB({ countryCodes: ['MWI'], resetIdentifier: __filename });
    accessToken = await getAccessToken();
  });

  describe('GET /layers', () => {
    it('should return shared layers (no hazardType filter)', async () => {
      const response = await getServer()
        .get('/layers')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(4);
      response.body.forEach((layer: { hazardType: string | null }) => {
        expect(layer.hazardType).toBeNull();
      });
    });

    it('should return layers with expected properties', async () => {
      const response = await getServer()
        .get('/layers')
        .set('Cookie', [accessToken]);

      const populationDensity = response.body.find(
        (layer: { name: string }) => layer.name === LayerName.populationDensity,
      );
      expect(populationDensity).toBeDefined();
      expect(populationDensity.type).toBe(LayerType.raster);
      expect(populationDensity.hazardType).toBeNull();
      expect(populationDensity.description).toBeNull();
    });

    it('should return hazard-specific layers when hazardType is provided', async () => {
      const response = await getServer()
        .get('/layers?hazardType=floods')
        .set('Cookie', [accessToken]);

      const glofasStations = response.body.find(
        (layer: { name: string }) => layer.name === LayerName.glofasStations,
      );
      expect(glofasStations).toBeDefined();
      expect(glofasStations.hazardType).toBe('floods');
    });

    it('should include shape layers and exclude hazard-specific raster layers', async () => {
      const response = await getServer()
        .get('/layers?hazardType=floods')
        .set('Cookie', [accessToken]);

      const layerNames = response.body.map(
        (layer: { name: string }) => layer.name,
      );
      expect(layerNames).toContain(LayerName.exposedPopulation);
      expect(layerNames).not.toContain(LayerName.floodDepth);
    });

    it('should reject invalid hazardType', async () => {
      const response = await getServer()
        .get('/layers?hazardType=invalid')
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /layers', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await getServer().post('/layers').send({
        name: LayerName.populationDensity,
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
          name: LayerName.populationDensity,
          label: 'Population Duplicate',
          type: 'raster',
        });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('PATCH /layers/:layerName', () => {
    it('should update layer label', async () => {
      const response = await getServer()
        .patch(`/layers/${LayerName.populationDensity}`)
        .set('Cookie', [accessToken])
        .send({ label: 'Updated Population' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.label).toBe('Updated Population');
      expect(response.body.name).toBe(LayerName.populationDensity);
    });

    it('should update layer hazardType', async () => {
      const response = await getServer()
        .patch(`/layers/${LayerName.populationDensity}`)
        .set('Cookie', [accessToken])
        .send({ hazardType: 'floods' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.hazardType).toBe('floods');

      await getServer()
        .patch(`/layers/${LayerName.populationDensity}`)
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
        .patch(`/layers/${LayerName.populationDensity}`)
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
