import { HttpStatus } from '@nestjs/common';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { Layer } from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { getServer, resetDB } from '@api-service/test/helpers/utility.helper';

function readRasterById(id: number) {
  return getServer().get(`/rasters/${id}`);
}

function readRasterImageById(id: number) {
  return getServer().get(`/rasters/${id}/image`);
}

describe('/rasters', () => {
  let rasterId: number;

  beforeAll(async () => {
    await resetDB(SeedScript.ethiopiaOnly, __filename);
    const alert = buildAlert({ eventName: 'ETH_floods_raster-test' });
    const createResponse = await createAlerts(buildForecast([alert]));
    const createdAlert = createResponse.body[0];
    rasterId = createdAlert.exposure.rasters[0].id;
  });

  describe('GET /rasters/:id – success', () => {
    it('should return the raster metadata with layer and extent', async () => {
      const response = await readRasterById(rasterId);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.layer).toBe(Layer.floodDepth);
      expect(response.body.valueColoured).toBeUndefined();
      expect(response.body.extent).toEqual(
        expect.objectContaining({
          xmin: expect.any(Number),
          ymin: expect.any(Number),
          xmax: expect.any(Number),
          ymax: expect.any(Number),
        }),
      );
    });
  });

  describe('GET /rasters/:id/image – success', () => {
    it('should return a PNG image with correct content-type', async () => {
      const response = await readRasterImageById(rasterId);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /rasters/:id/image – not found', () => {
    it('should return 404 for a non-existent raster id', async () => {
      const response = await readRasterImageById(999999);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /rasters/:id – not found', () => {
    it('should return 404 for a non-existent raster id', async () => {
      const response = await readRasterById(999999);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /rasters/:id – invalid id', () => {
    it('should return 400 for a non-numeric id', async () => {
      const response = getServer().get('/rasters/not-a-number');

      expect((await response).status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
