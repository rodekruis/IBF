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
  return getServer().get(`/rasters/alert/${id}`);
}

function readRasterImageById(id: number) {
  return getServer().get(`/rasters/alert/${id}/image`);
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

  describe('GET /rasters/alert/:id – success', () => {
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

  describe('GET /rasters/alert/:id/image – success', () => {
    it('should return a PNG image with correct content-type', async () => {
      const response = await readRasterImageById(rasterId);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /rasters/alert/:id/image – not found', () => {
    it('should return 404 for a non-existent raster id', async () => {
      const response = await readRasterImageById(999999);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /rasters/alert/:id – not found', () => {
    it('should return 404 for a non-existent raster id', async () => {
      const response = await readRasterById(999999);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /rasters/alert/:id – invalid id', () => {
    it('should return 400 for a non-numeric id', async () => {
      const response = getServer().get('/rasters/alert/not-a-number');

      expect((await response).status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});

describe('/rasters/static', () => {
  const country = 'ETH';
  const layer = Layer.population;

  beforeAll(async () => {
    await resetDB(SeedScript.test, __filename);
  });

  describe('GET /rasters/static/:countryCodeIso3/:layer – success', () => {
    it('should return the static raster metadata with id, layer and extent', async () => {
      const response = await getServer().get(
        `/rasters/static/${country}/${layer}`,
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.id).toEqual(expect.any(Number));
      expect(response.body.layer).toBe(Layer.population);
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

  describe('GET /rasters/static/:countryCodeIso3/:layer – not found', () => {
    it('should return 404 for a non-existent country', async () => {
      const response = await getServer().get(`/rasters/static/XXX/${layer}`);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /rasters/static/:countryCodeIso3/:layer – invalid layer', () => {
    it('should return 400 for an invalid layer value', async () => {
      const response = await getServer().get(
        `/rasters/static/${country}/not-a-layer`,
      );

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /rasters/static/:countryCodeIso3/:layer/image – success', () => {
    it('should return a PNG image with correct content-type', async () => {
      const response = await getServer()
        .get(`/rasters/static/${country}/${layer}/image`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /rasters/static/:countryCodeIso3/:layer/data – success', () => {
    it('should return a raw data PNG with correct content-type', async () => {
      const response = await getServer()
        .get(`/rasters/static/${country}/${layer}/data`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
