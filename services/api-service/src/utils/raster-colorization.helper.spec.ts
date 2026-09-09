import { PNG } from 'pngjs';

import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  colorizeGrayscalePng,
  getColorizationConfig,
  processPopulationRaster,
  reprojectExtents4326To3857,
  reprojectPng4326To3857,
} from '@api-service/src/utils/raster-colorization.helper';

const FLOOD_DEPTH_CONFIG = getColorizationConfig(LayerName.floodDepth);

function createGrayscalePng({
  width,
  height,
  values,
}: {
  width: number;
  height: number;
  values: number[];
}): string {
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

function readOutputPixel({
  base64,
  pixelIndex,
}: {
  base64: string;
  pixelIndex: number;
}): { r: number; g: number; b: number; a: number } {
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
      expect(
        colorizeGrayscalePng({
          base64Grayscale: '',
          config: FLOOD_DEPTH_CONFIG,
        }),
      ).toBe('');
    });

    it('should make zero pixels transparent with default config', () => {
      const input = createGrayscalePng({
        width: 2,
        height: 2,
        values: [0, 100, 200, 0],
      });
      const result = colorizeGrayscalePng({
        base64Grayscale: input,
        config: FLOOD_DEPTH_CONFIG,
      });

      const pixel0 = readOutputPixel({ base64: result, pixelIndex: 0 });
      expect(pixel0.a).toBe(0);

      const pixel3 = readOutputPixel({ base64: result, pixelIndex: 3 });
      expect(pixel3.a).toBe(0);
    });

    it('should colorize non-zero pixels with opacity', () => {
      const input = createGrayscalePng({ width: 1, height: 1, values: [128] });
      const result = colorizeGrayscalePng({
        base64Grayscale: input,
        config: FLOOD_DEPTH_CONFIG,
      });

      const pixel = readOutputPixel({ base64: result, pixelIndex: 0 });
      expect(pixel.a).toBe(179);
      expect(pixel.r).toBeGreaterThanOrEqual(0);
      expect(pixel.r).toBeLessThanOrEqual(255);
    });

    it('should render zero pixels with colorLow when zeroIsTransparent is false', () => {
      const config = {
        mode: 'gradient' as const,
        colorLow: [255, 0, 0, 255] as [number, number, number, number],
        colorHigh: [0, 0, 255, 255] as [number, number, number, number],
        zeroIsTransparent: false,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng({ width: 1, height: 1, values: [0] });
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      const pixel = readOutputPixel({ base64: result, pixelIndex: 0 });
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      expect(pixel.a).toBe(255);
    });

    it('should map max value pixel to colorHigh', () => {
      const config = {
        mode: 'gradient' as const,
        colorLow: [255, 0, 0, 255] as [number, number, number, number],
        colorHigh: [0, 0, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng({
        width: 1,
        height: 2,
        values: [0, 200],
      });
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      const pixel = readOutputPixel({ base64: result, pixelIndex: 1 });
      expect(pixel.r).toBe(0);
      expect(pixel.b).toBe(255);
      expect(pixel.a).toBe(255);
    });

    it('should produce intermediate colors for mid-range values', () => {
      const config = {
        mode: 'gradient' as const,
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 100,
        useLogScale: false,
      };
      const input = createGrayscalePng({
        width: 1,
        height: 3,
        values: [0, 100, 200],
      });
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      const pixelMid = readOutputPixel({ base64: result, pixelIndex: 1 });
      const pixelHigh = readOutputPixel({ base64: result, pixelIndex: 2 });
      expect(pixelMid.r).toBeGreaterThan(0);
      expect(pixelMid.r).toBeLessThan(pixelHigh.r);
    });

    it('should apply log scale when useLogScale is true', () => {
      const configLinear = {
        mode: 'gradient' as const,
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 100,
        useLogScale: false,
      };
      const configLog = { ...configLinear, useLogScale: true };

      const input = createGrayscalePng({
        width: 1,
        height: 3,
        values: [0, 10, 200],
      });

      const resultLinear = colorizeGrayscalePng({
        base64Grayscale: input,
        config: configLinear,
      });
      const resultLog = colorizeGrayscalePng({
        base64Grayscale: input,
        config: configLog,
      });

      const linearMid = readOutputPixel({
        base64: resultLinear,
        pixelIndex: 1,
      });
      const logMid = readOutputPixel({ base64: resultLog, pixelIndex: 1 });

      expect(logMid.r).toBeGreaterThan(linearMid.r);
    });

    it('should produce banded output with fewer steps', () => {
      const config = {
        mode: 'gradient' as const,
        colorLow: [0, 0, 0, 255] as [number, number, number, number],
        colorHigh: [255, 255, 255, 255] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 2,
        useLogScale: false,
      };
      const input = createGrayscalePng({
        width: 1,
        height: 5,
        values: [0, 50, 100, 150, 200],
      });
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      const colors = new Set<number>();
      for (let i = 1; i < 5; i++) {
        colors.add(readOutputPixel({ base64: result, pixelIndex: i }).r);
      }
      expect(colors.size).toBeLessThanOrEqual(3);
    });

    it('should map lowest non-zero value to first palette color and max to last', () => {
      // Arrange
      const config = {
        mode: 'palette' as const,
        zeroIsTransparent: true,
        useLogScale: false,
        palette: [
          [10, 0, 0, 10],
          [20, 0, 0, 20],
          [30, 0, 0, 30],
        ] as [number, number, number, number][],
      };
      const input = createGrayscalePng({
        width: 1,
        height: 3,
        values: [0, 1, 100],
      });

      // Act
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      // Assert
      const pixelLow = readOutputPixel({ base64: result, pixelIndex: 1 });
      expect(pixelLow).toEqual({ r: 10, g: 0, b: 0, a: 10 });

      const pixelHigh = readOutputPixel({ base64: result, pixelIndex: 2 });
      expect(pixelHigh).toEqual({ r: 30, g: 0, b: 0, a: 30 });
    });

    it('should clamp normalized value of 1 to the last palette band', () => {
      // Arrange
      const config = {
        mode: 'palette' as const,
        zeroIsTransparent: true,
        useLogScale: false,
        palette: [
          [10, 0, 0, 10],
          [20, 0, 0, 20],
          [30, 0, 0, 30],
        ] as [number, number, number, number][],
      };
      const input = createGrayscalePng({ width: 1, height: 1, values: [200] });

      // Act
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      // Assert
      const pixel = readOutputPixel({ base64: result, pixelIndex: 0 });
      expect(pixel).toEqual({ r: 30, g: 0, b: 0, a: 30 });
    });

    it('should handle all-zero image', () => {
      const input = createGrayscalePng({
        width: 2,
        height: 2,
        values: [0, 0, 0, 0],
      });
      const result = colorizeGrayscalePng({
        base64Grayscale: input,
        config: FLOOD_DEPTH_CONFIG,
      });

      for (let i = 0; i < 4; i++) {
        const pixel = readOutputPixel({ base64: result, pixelIndex: i });
        expect(pixel.a).toBe(0);
      }
    });

    it('should handle uniform non-zero image', () => {
      const config = {
        mode: 'gradient' as const,
        colorLow: [100, 100, 100, 204] as [number, number, number, number],
        colorHigh: [200, 200, 200, 204] as [number, number, number, number],
        zeroIsTransparent: true,
        steps: 6,
        useLogScale: false,
      };
      const input = createGrayscalePng({
        width: 2,
        height: 2,
        values: [50, 50, 50, 50],
      });
      const result = colorizeGrayscalePng({ base64Grayscale: input, config });

      const pixel0 = readOutputPixel({ base64: result, pixelIndex: 0 });
      const pixel3 = readOutputPixel({ base64: result, pixelIndex: 3 });
      expect(pixel0.r).toBe(pixel3.r);
      expect(pixel0.g).toBe(pixel3.g);
      expect(pixel0.b).toBe(pixel3.b);
      expect(pixel0.a).toBe(204);
    });
  });

  describe('getColorizationConfig', () => {
    it('should return a distinct config for windSpeed vs floodDepth', () => {
      const floodConfig = getColorizationConfig(LayerName.floodDepth);
      const windConfig = getColorizationConfig(LayerName.windSpeed);

      expect(windConfig).not.toEqual(floodConfig);
    });

    it('should fall back to floodDepth config for unknown layers', () => {
      const floodConfig = getColorizationConfig(LayerName.floodDepth);
      const unknownConfig = getColorizationConfig(LayerName.glofasStations);

      expect(unknownConfig).toEqual(floodConfig);
    });
  });

  describe('reproject4326To3857', () => {
    it('should convert (0,0) to (0,0)', () => {
      const result = reprojectExtents4326To3857({
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
      const result = reprojectExtents4326To3857({
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
      const result = reprojectExtents4326To3857({
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
    function createTestPngBuffer({
      width,
      height,
    }: {
      width: number;
      height: number;
    }): Buffer {
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

    function createEncodedPngBuffer({
      width,
      height,
      values,
    }: {
      width: number;
      height: number;
      values: number[];
    }): Buffer {
      const png = new PNG({ width, height });
      for (let i = 0; i < width * height; i++) {
        const scaled = Math.round((values[i] ?? 0) * 1000);
        const idx = i * 4;
        png.data[idx] = (scaled >> 24) & 0xff;
        png.data[idx + 1] = (scaled >> 16) & 0xff;
        png.data[idx + 2] = (scaled >> 8) & 0xff;
        png.data[idx + 3] = scaled & 0xff;
      }
      return PNG.sync.write(png);
    }

    it('should compute extent from transform and PNG dimensions', () => {
      const pngBuffer = createTestPngBuffer({ width: 10, height: 20 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [0.5, 0, 33.0, 0, -0.25, 5.0],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.data.extent.xmin).toBe(33.0);
      expect(result.metadata.data.extent.xmax).toBe(33.0 + 0.5 * 10);
      expect(result.metadata.data.extent.ymax).toBe(5.0);
      expect(result.metadata.data.extent.ymin).toBe(5.0 - 0.25 * 20);
    });

    it('should set data CRS from input metadata', () => {
      const pngBuffer = createTestPngBuffer({ width: 2, height: 2 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 2],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.data.crs).toBe(EPSG.WGS84);
    });

    it('should set nodata to 0', () => {
      const pngBuffer = createTestPngBuffer({ width: 2, height: 2 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 2],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.data.nodata).toBe(0);
    });

    it('should reproject coloured extent to EPSG:3857 when input is EPSG:4326', () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 33.0, 0, -1, 5.0],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.coloured.crs).toBe(EPSG.WebMercator);
      expect(result.metadata.coloured.extent.xmin).not.toBe(
        result.metadata.data.extent.xmin,
      );
    });

    it('should keep coloured extent unchanged when input is not EPSG:4326', () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1000, 0, 500000, 0, -1000, 600000],
          crs: EPSG.WebMercator,
        },
      });

      expect(result.metadata.coloured.crs).toBe(EPSG.WebMercator);
      expect(result.metadata.coloured.extent).toEqual(
        result.metadata.data.extent,
      );
    });

    it('should return a valid base64 coloured PNG', () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 4],
          crs: EPSG.WGS84,
        },
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
      const pngBuffer = createTestPngBuffer({ width: 20, height: 20 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 20],
          crs: EPSG.WGS84,
        },
      });

      const decoded = Buffer.from(result.colouredBase64, 'base64');
      const outputPng = PNG.sync.read(decoded);
      expect(outputPng.width).toBe(2);
      expect(outputPng.height).toBe(2);
    });

    it('should not downsample when input is smaller than the factor', () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 4],
          crs: EPSG.WGS84,
        },
      });

      const decoded = Buffer.from(result.colouredBase64, 'base64');
      const outputPng = PNG.sync.read(decoded);
      expect(outputPng.width).toBe(4);
      expect(outputPng.height).toBe(4);
    });

    it('should decode RGBA-encoded population values into palette bands', () => {
      // Arrange
      const pngBuffer = createEncodedPngBuffer({
        width: 3,
        height: 1,
        values: [0, 1.0, 4.0],
      });

      // Act
      const result = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 1],
          crs: EPSG.WebMercator,
        },
      });

      // Assert
      const pixelZero = readOutputPixel({
        base64: result.colouredBase64,
        pixelIndex: 0,
      });
      expect(pixelZero.a).toBe(0);

      // log1p(1.0) / log1p(4.0) ≈ 0.43 -> third palette band
      const pixelMid = readOutputPixel({
        base64: result.colouredBase64,
        pixelIndex: 1,
      });
      expect(pixelMid.a).toBe(56);

      // max value -> last palette band
      const pixelHigh = readOutputPixel({
        base64: result.colouredBase64,
        pixelIndex: 2,
      });
      expect(pixelHigh.a).toBe(94);
    });
  });

  describe('reprojectPng4326To3857', () => {
    // A single-pixel-wide column, so each pixel index is a row.
    const input = createGrayscalePng({
      width: 1,
      height: 4,
      values: [10, 20, 30, 40],
    });

    function readRows(base64: string): number[] {
      return [0, 1, 2, 3].map(
        (pixelIndex) => readOutputPixel({ base64, pixelIndex }).r,
      );
    }

    it('should leave rows in place for a bbox straddling the equator', () => {
      const result = reprojectPng4326To3857({
        base64Png: input,
        ymin: -10,
        ymax: 10,
      });

      expect(readRows(result)).toEqual([10, 20, 30, 40]);
    });

    it('should pull rows towards the pole for a high-latitude bbox', () => {
      const result = reprojectPng4326To3857({
        base64Png: input,
        ymin: 0,
        ymax: 80,
      });

      // Mercator stretches high latitudes, so the northernmost row spans two
      // output rows and one southern row is dropped.
      expect(readRows(result)).toEqual([10, 10, 20, 40]);
    });

    it('should return the input unchanged for a degenerate extent', () => {
      expect(
        reprojectPng4326To3857({ base64Png: input, ymin: 5, ymax: 5 }),
      ).toBe(input);
    });
  });
});
