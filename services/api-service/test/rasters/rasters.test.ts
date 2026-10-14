import { HttpStatus } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildForecast,
  createAlerts,
} from '@api-service/test/helpers/alert.helper';
import { createStaticRaster } from '@api-service/test/helpers/raster.helper';
import {
  getAccessToken,
  getServer,
  resetDB,
} from '@api-service/test/helpers/utility.helper';

const apiKey = env.PIPELINE_API_KEY!;

function readRasterById(id: number) {
  return getServer().get(`/rasters/alert/${id}`);
}

function readRasterImageById(id: number) {
  return getServer().get(`/rasters/alert/${id}/image`);
}

let rasterId: number;
let accessToken: string;

jest.setTimeout(60_000);

beforeAll(async () => {
  await resetDB({
    countryCodes: ['MWI'],
    resetIdentifier: __filename,
    skipStaticRasters: false,
  });
  const alert = buildAlert({ eventName: 'raster-test' });
  const createResponse = await createAlerts({
    forecast: buildForecast({ alerts: [alert] }),
  });
  const createdAlert = createResponse.body[0];
  rasterId = createdAlert.exposure.rasters[0].id;
  accessToken = await getAccessToken();
});

describe('/rasters', () => {
  describe('GET /rasters/alert/:id – success', () => {
    it('should return the raster metadata with layer and extent', async () => {
      const response = await readRasterById(rasterId);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.layer).toBe(LayerName.floodDepth);
      expect(response.body.valueColoured).toBeUndefined();
      expect(response.body.metadata.data.extent).toEqual(
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
      const response = await getServer().get('/rasters/alert/not-a-number');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});

describe('/rasters/static', () => {
  const country = 'MWI';
  const layer = LayerName.populationDensity;

  describe('GET /rasters/static/:countryCodeIso3/:layer – success', () => {
    it('should return the static raster metadata with id, layer and extent', async () => {
      const response = await getServer().get(
        `/rasters/static/${country}/${layer}`,
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.id).toEqual(expect.any(Number));
      expect(response.body.layer).toBe(LayerName.populationDensity);
      expect(response.body.metadata.data.extent).toEqual(
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
        .set('x-api-key', apiKey)
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

  describe('PUT /rasters/static – success', () => {
    it('should store the data PNG and its server-side coloured image', async () => {
      // Act
      const response = await createStaticRaster({
        accessToken,
        countryCodeIso3: country,
        layer,
      });

      // Assert
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.layer).toBe(layer);
      expect(response.body.metadata.coloured.crs).toBe(EPSG.WebMercator);
      const imageResponse = await getServer().get(
        `/rasters/static/${country}/${layer}/image`,
      );
      expect(imageResponse.status).toBe(HttpStatus.OK);
      expect(imageResponse.headers['content-type']).toBe('image/png');
    });
  });

  describe('PUT /rasters/static – unsupported layer', () => {
    it('should return 400 for a layer without static raster colouring', async () => {
      // Act
      const response = await createStaticRaster({
        accessToken,
        countryCodeIso3: country,
        layer: LayerName.windSpeed,
      });

      // Assert
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /rasters/static/:countryCodeIso3/:layer – success', () => {
    it('should delete the static raster and return 204', async () => {
      const response = await getServer()
        .delete(`/rasters/static/${country}/${layer}`)
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NO_CONTENT);

      const getResponse = await getServer().get(
        `/rasters/static/${country}/${layer}`,
      );

      expect(getResponse.status).toBe(HttpStatus.NOT_FOUND);

      // Restore it, as tests run in random order and other GET tests need it
      const restoreResponse = await createStaticRaster({
        accessToken,
        countryCodeIso3: country,
        layer,
      });
      expect(restoreResponse.status).toBe(HttpStatus.OK);
    });
  });

  describe('DELETE /rasters/static/:countryCodeIso3/:layer – not found', () => {
    it('should return 404 for a non-existent static raster', async () => {
      const response = await getServer()
        .delete(`/rasters/static/XXX/${layer}`)
        .set('Cookie', [accessToken]);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /rasters/static/:countryCodeIso3/:layer – unauthorized', () => {
    it('should return 401 without auth', async () => {
      const response = await getServer().delete(
        `/rasters/static/${country}/${layer}`,
      );

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});
