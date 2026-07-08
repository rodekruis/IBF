import { PNG } from 'pngjs';

import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import {
  colorizeGrayscalePng,
  FLOOD_DEPTH_CONFIG,
  processPopulationRaster,
  reproject4326To3857,
} from '@api-service/src/utils/raster-colorization.helper';

function createGrayscalePng(
  width: number,
  height: number,
  values: number[],
): string {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const v = values[i] ?? 0;
    png.data[idx] = v;
    png.data[idx + 1] = v;
    png.data[idx + 2] = v;
    png.data[idx + 3] = 255;
  }
  const buffer = PNG.sync.write(png);
  return buffer.toString('base64');
}

function readOutputPixel(
  base64: string,
  pixelIndex: number,
): { r: number; g: number; b: number; a: number } {
  const buffer = Buffer.from(base64, 'base64');
  const png = PNG.sync.read(buffer);
  const idx = pixelIndex * 4;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

describe('raster-colorization.helper', () => {
  describe('colorizeGrayscalePng', () => {
    it('should return empty string for empty input', () => {
      expect(colorizeGrayscalePng('', FLOOD_DEPTH_CONFIG)).toBe('');
    });

    it('should make zero pixels transparent with default config', () => {
      const input = createGrayscalePng(2, 2, [0, 100, 200, 0]);
      const result = colorizeGrayscalePng(input, FLOOD_DEPTH_CONFIG);

      const pixel0 = readOutputPixel(result, 0);
      expect(pixel0.a).toBe(0);

      const pixel3 = readOutputPixel(result, 3);
      expect(pixel3.a).toBe(0);
    });

    it('should colorize non-zero pixels with opacity', () => {
      const input = createGrayscalePng(1, 1, [128]);
      const result = colorizeGrayscalePng(input, FLOOD_DEPTH_CONFIG);

      const pixel = readOutputPixel(result, 0);
      expect(pixel.a).toBe(179);
      expect(pixel.r).toBeGreaterThanOrEqual(0);
      expect(pixel.r).toBeLessThanOrEqual(255);
    });

    it('should render zero pixels with colorLow when zeroIsTransparent is false', () => {
      const config = {
        colorLow: [255, 0, 0, 255] as [number, number, number, number],
        colorHigh: [0, 0, 255, 255] as [number, number, number, number],
        zeroIsTransparent: false,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng(1, 1, [0]);
      const result = colorizeGrayscalePng(input, config);

      const pixel = readOutputPixel(result, 0);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      expect(pixel.a).toBe(255);
    });

    it('should map max value pixel to colorHigh', () => {
      const config = {
        colorLow: [255, 0, 0, 255] as [number, number, number, number],
        colorHigh: [0, 0, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng(1, 2, [0, 200]);
      const result = colorizeGrayscalePng(input, config);

      const pixel = readOutputPixel(result, 1);
      expect(pixel.r).toBe(0);
      expect(pixel.b).toBe(255);
      expect(pixel.a).toBe(255);
    });

    it('should produce intermediate colors for mid-range values', () => {
      const config = {
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 100,
        useLogScale: false,
      };
      const input = createGrayscalePng(1, 3, [0, 100, 200]);
      const result = colorizeGrayscalePng(input, config);

      const pixelMid = readOutputPixel(result, 1);
      const pixelHigh = readOutputPixel(result, 2);
      expect(pixelMid.r).toBeGreaterThan(0);
      expect(pixelMid.r).toBeLessThan(pixelHigh.r);
    });

    it('should apply log scale when useLogScale is true', () => {
      const configLinear = {
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 100,
        useLogScale: false,
      };
      const configLog = { ...configLinear, useLogScale: true };

      const input = createGrayscalePng(1, 3, [0, 10, 200]);

      const resultLinear = colorizeGrayscalePng(input, configLinear);
      const resultLog = colorizeGrayscalePng(input, configLog);

      const linearMid = readOutputPixel(resultLinear, 1);
      const logMid = readOutputPixel(resultLog, 1);

      expect(logMid.r).toBeGreaterThan(linearMid.r);
    });

    it('should produce banded output with fewer steps', () => {
      const config = {
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 2,
        useLogScale: false,
      };
      const input = createGrayscalePng(1, 5, [0, 50, 100, 150, 200]);
      const result = colorizeGrayscalePng(input, config);

      const colors = new Set<number>();
      for (let i = 1; i < 5; i++) {
        colors.add(readOutputPixel(result, i).r);
      }
      expect(colors.size).toBeLessThanOrEqual(3);
    });

    it('should handle all-zero image', () => {
      const input = createGrayscalePng(2, 2, [0, 0, 0, 0]);
      const result = colorizeGrayscalePng(input, FLOOD_DEPTH_CONFIG);

      for (let i = 0; i < 4; i++) {
        const pixel = readOutputPixel(result, i);
        expect(pixel.a).toBe(0);
      }
    });

    it('should handle uniform non-zero image', () => {
      const config = {
        colorLow: [100, 100, 100, 204] as [number, number, number, number],
        colorHigh: [200, 200, 200, 204] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng(2, 2, [50, 50, 50, 50]);
      const result = colorizeGrayscalePng(input, config);

      const pixel0 = readOutputPixel(result, 0);
      const pixel3 = readOutputPixel(result, 3);
      expect(pixel0.r).toBe(pixel3.r);
      expect(pixel0.g).toBe(pixel3.g);
      expect(pixel0.b).toBe(pixel3.b);
      expect(pixel0.a).toBe(204);
    });
  });

  describe('reproject4326To3857', () => {
    it('should convert (0,0) to (0,0)', () => {
      const result = reproject4326To3857({
        xmin: 0,
        ymin: 0,
        xmax: 0,
        ymax: 0,
      });
      expect(result.xmin).toBeCloseTo(0);
      expect(result.ymin).toBeCloseTo(0);
      expect(result.xmax).toBeCloseTo(0);
      expect(result.ymax).toBeCloseTo(0);
    });

    it('should convert known coordinates correctly', () => {
      const result = reproject4326To3857({
        xmin: -180,
        ymin: -85,
        xmax: 180,
        ymax: 85,
      });
      expect(result.xmin).toBeCloseTo(-20037508.34);
      expect(result.xmax).toBeCloseTo(20037508.34);
      expect(result.ymin).toBeLessThan(0);
      expect(result.ymax).toBeGreaterThan(0);
    });

    it('should produce symmetric results for symmetric input', () => {
      const result = reproject4326To3857({
        xmin: -10,
        ymin: -10,
        xmax: 10,
        ymax: 10,
      });
      expect(result.xmin).toBeCloseTo(-result.xmax);
      expect(result.ymin).toBeCloseTo(-result.ymax);
    });
  });

  describe('processPopulationRaster', () => {
    function createTestPngBuffer(width: number, height: number): Buffer {
      const png = new PNG({ width, height });
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        png.data[idx] = 128;
        png.data[idx + 1] = 128;
        png.data[idx + 2] = 128;
        png.data[idx + 3] = 255;
      }
      return PNG.sync.write(png);
    }

    it('should compute extent from transform and PNG dimensions', () => {
      const pngBuffer = createTestPngBuffer(10, 20);
      const result = processPopulationRaster(pngBuffer, {
        transform: [0.5, 0, 33.0, 0, -0.25, 5.0],
        crs: EPSG.WGS84,
      });

      expect(result.metadata.data.extent.xmin).toBe(33.0);
      expect(result.metadata.data.extent.xmax).toBe(33.0 + 0.5 * 10);
      expect(result.metadata.data.extent.ymax).toBe(5.0);
      expect(result.metadata.data.extent.ymin).toBe(5.0 - 0.25 * 20);
    });

    it('should set data CRS from input metadata', () => {
      const pngBuffer = createTestPngBuffer(2, 2);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 0, 0, -1, 2],
        crs: EPSG.WGS84,
      });

      expect(result.metadata.data.crs).toBe(EPSG.WGS84);
    });

    it('should set nodata to 0', () => {
      const pngBuffer = createTestPngBuffer(2, 2);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 0, 0, -1, 2],
        crs: EPSG.WGS84,
      });

      expect(result.metadata.data.nodata).toBe(0);
    });

    it('should reproject coloured extent to EPSG:3857 when input is EPSG:4326', () => {
      const pngBuffer = createTestPngBuffer(4, 4);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 33.0, 0, -1, 5.0],
        crs: EPSG.WGS84,
      });

      expect(result.metadata.coloured.crs).toBe(EPSG.WebMercator);
      expect(result.metadata.coloured.extent.xmin).not.toBe(
        result.metadata.data.extent.xmin,
      );
    });

    it('should keep coloured extent unchanged when input is not EPSG:4326', () => {
      const pngBuffer = createTestPngBuffer(4, 4);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1000, 0, 500000, 0, -1000, 600000],
        crs: EPSG.WebMercator,
      });

      expect(result.metadata.coloured.crs).toBe(EPSG.WebMercator);
      expect(result.metadata.coloured.extent).toEqual(
        result.metadata.data.extent,
      );
    });

    it('should return a valid base64 coloured PNG', () => {
      const pngBuffer = createTestPngBuffer(4, 4);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 0, 0, -1, 4],
        crs: EPSG.WGS84,
      });

      expect(result.colouredBase64).toBeTruthy();
      const decoded = Buffer.from(result.colouredBase64, 'base64');
      const pngSignature = [0x89, 0x50, 0x4e, 0x47];
      expect(decoded[0]).toBe(pngSignature[0]);
      expect(decoded[1]).toBe(pngSignature[1]);
      expect(decoded[2]).toBe(pngSignature[2]);
      expect(decoded[3]).toBe(pngSignature[3]);
    });

    it('should downsample a 20x20 input to 2x2', () => {
      const pngBuffer = createTestPngBuffer(20, 20);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 0, 0, -1, 20],
        crs: EPSG.WGS84,
      });

      const decoded = Buffer.from(result.colouredBase64, 'base64');
      const outputPng = PNG.sync.read(decoded);
      expect(outputPng.width).toBe(2);
      expect(outputPng.height).toBe(2);
    });

    it('should not downsample when input is smaller than the factor', () => {
      const pngBuffer = createTestPngBuffer(4, 4);
      const result = processPopulationRaster(pngBuffer, {
        transform: [1, 0, 0, 0, -1, 4],
        crs: EPSG.WGS84,
      });

      const decoded = Buffer.from(result.colouredBase64, 'base64');
      const outputPng = PNG.sync.read(decoded);
      expect(outputPng.width).toBe(4);
      expect(outputPng.height).toBe(4);
    });
  });
});
