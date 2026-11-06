import { PackerOptions, PNG } from 'pngjs';

import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  colorizeGrayscalePng,
  decodeRgbaEncodedPng,
  Downsampling,
  FLOOD_DEPTH_CONFIG,
  getColorizationConfig,
  processPopulationRaster,
  reprojectExtents4326To3857,
  reprojectPng4326To3857,
} from '@api-service/src/utils/raster-colorization.helper';

const CRC32_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function splitIdatChunks({
  pngBuffer,
  chunkSize,
}: {
  pngBuffer: Buffer;
  chunkSize: number;
}): Buffer {
  const parts: Buffer[] = [pngBuffer.subarray(0, 8)];
  let offset = 8;
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('latin1', offset + 4, offset + 8);
    const chunk = pngBuffer.subarray(offset, offset + 12 + length);
    if (type !== 'IDAT') {
      parts.push(chunk);
    } else {
      const payload = chunk.subarray(8, 8 + length);
      for (let i = 0; i < payload.length; i += chunkSize) {
        const piece = payload.subarray(i, i + chunkSize);
        const header = Buffer.alloc(8);
        header.writeUInt32BE(piece.length, 0);
        header.write('IDAT', 4, 'latin1');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(
          crc32(Buffer.concat([header.subarray(4), piece])) >>> 0,
          0,
        );
        parts.push(header, piece, crc);
      }
    }
    offset += 12 + length;
  }
  return Buffer.concat(parts);
}

function patchIhdr({
  pngBuffer,
  patch,
}: {
  pngBuffer: Buffer;
  patch: (ihdrData: Buffer) => void;
}): Buffer {
  const out = Buffer.from(pngBuffer);
  const ihdrData = out.subarray(16, 29);
  patch(ihdrData);
  out.writeUInt32BE(crc32(out.subarray(12, 29)), 29);
  return out;
}

function setInterlaced(pngBuffer: Buffer): Buffer {
  return patchIhdr({
    pngBuffer,
    patch: (ihdrData) => {
      ihdrData[12] = 1;
    },
  });
}

function setIhdrHeight({
  pngBuffer,
  height,
}: {
  pngBuffer: Buffer;
  height: number;
}): Buffer {
  return patchIhdr({
    pngBuffer,
    patch: (ihdrData) => {
      ihdrData.writeUInt32BE(height, 4);
    },
  });
}

function countChunks({
  pngBuffer,
  type,
}: {
  pngBuffer: Buffer;
  type: string;
}): number {
  let count = 0;
  let offset = 8;
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    if (pngBuffer.toString('latin1', offset + 4, offset + 8) === type) {
      count++;
    }
    offset += 12 + length;
  }
  return count;
}

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
  describe('colorizeGrayscalePng (gradient/steps mode)', () => {
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
      expect(pixel.a).toBeGreaterThan(0);
      expect(pixel.a).toBeLessThan(255);
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

  describe('colorizeGrayscalePng (palette mode)', () => {
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
  });

  describe('colorizeGrayscalePng (fixed scale mode)', () => {
    it('should color flood depth by fixed metre cut-offs, independent of the raster max', () => {
      // Arrange
      // Grey levels for 0.1 m, 1 m and 3 m on the pipeline's 0-10 m scale (depth / 10 * 254 + 1).
      const input = createGrayscalePng({
        width: 1,
        height: 3,
        values: [4, 26, 77],
      });

      // Act
      const result = colorizeGrayscalePng({
        base64Grayscale: input,
        config: FLOOD_DEPTH_CONFIG,
      });

      // Assert
      const { palette } = FLOOD_DEPTH_CONFIG;
      const readRgba = (pixelIndex: number) => {
        const { r, g, b, a } = readOutputPixel({ base64: result, pixelIndex });
        return [r, g, b, a];
      };
      expect(readRgba(0)).toEqual(palette[0]);
      expect(readRgba(1)).toEqual(palette[2]);
      expect(readRgba(2)).toEqual(palette[4]);
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

    it('should compute extent from transform and PNG dimensions', async () => {
      const pngBuffer = createTestPngBuffer({ width: 10, height: 20 });
      const result = await processPopulationRaster({
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

    it('should set data CRS from input metadata', async () => {
      const pngBuffer = createTestPngBuffer({ width: 2, height: 2 });
      const result = await processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 2],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.data.crs).toBe(EPSG.WGS84);
    });

    it('should set nodata to 0', async () => {
      const pngBuffer = createTestPngBuffer({ width: 2, height: 2 });
      const result = await processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 2],
          crs: EPSG.WGS84,
        },
      });

      expect(result.metadata.data.nodata).toBe(0);
    });

    it('should reproject coloured extent to EPSG:3857 when input is EPSG:4326', async () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = await processPopulationRaster({
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

    it('should throw when input is not EPSG:4326', async () => {
      // Arrange
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });

      // Act
      const act = processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1000, 0, 500000, 0, -1000, 600000],
          crs: EPSG.WebMercator,
        },
      });

      // Assert
      await expect(act).rejects.toThrow(
        'Only WGS84 population rasters are supported',
      );
    });

    it('should return a valid base64 coloured PNG', async () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = await processPopulationRaster({
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

    it('should downsample a 20x20 input to 2x2', async () => {
      const pngBuffer = createTestPngBuffer({ width: 20, height: 20 });
      const result = await processPopulationRaster({
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

    it('should not downsample when input is smaller than the factor', async () => {
      const pngBuffer = createTestPngBuffer({ width: 4, height: 4 });
      const result = await processPopulationRaster({
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

    it('should decode RGBA-encoded population values into palette bands', async () => {
      // Arrange
      const pngBuffer = createEncodedPngBuffer({
        width: 3,
        height: 1,
        values: [0, 1.0, 4.0],
      });

      // Act
      const result = await processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, 1],
          crs: EPSG.WGS84,
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

    it('should average population values when downsampling', async () => {
      // Arrange
      const width = 20;
      const height = 10;
      const values = Array.from({ length: width * height }, (_, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        return x < 10 || y === 0 ? 1 : 0;
      });
      const pngBuffer = createEncodedPngBuffer({ width, height, values });

      // Act
      const result = await processPopulationRaster({
        dataPngBuffer: pngBuffer,
        metadata: {
          transform: [1, 0, 0, 0, -1, height],
          crs: EPSG.WGS84,
        },
      });

      // Assert
      // Means are 1 (left) and 0.1 (right): log1p(0.1) / log1p(1) ≈ 0.14 -> first palette band
      const pixelRight = readOutputPixel({
        base64: result.colouredBase64,
        pixelIndex: 1,
      });
      expect(pixelRight.a).toBe(20);
    });
  });

  describe('decodeRgbaEncodedPng', () => {
    // Deterministic pseudo-random RGBA data so every channel (and thus every
    // PNG filter type) gets exercised. Mulberry32 PRNG.
    function createNoisyRgbaData({
      width,
      height,
      seed,
    }: {
      width: number;
      height: number;
      seed: number;
    }): Buffer {
      let state = seed;
      const next = (): number => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (t ^ (t >>> 14)) >>> 0;
      };
      const data = Buffer.alloc(width * height * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = next() & 0xff;
      }
      return data;
    }

    function writePng({
      width,
      height,
      data,
      options,
    }: {
      width: number;
      height: number;
      data: Buffer;
      options?: PackerOptions;
    }): Buffer {
      const png = new PNG({ width, height });
      data.copy(png.data);
      return PNG.sync.write(png, options);
    }

    // Expected output computed straight from the raw pixel buffer the test
    // generated, independent of any PNG decoding.
    function expectedFromRawPixels({
      width,
      height,
      data,
      downsampling,
    }: {
      width: number;
      height: number;
      data: Buffer;
      downsampling: Downsampling;
    }): { width: number; height: number; decoded: Float32Array } {
      const factor =
        width >= downsampling.factor && height >= downsampling.factor
          ? downsampling.factor
          : 1;
      const outWidth = Math.floor(width / factor);
      const outHeight = Math.floor(height / factor);
      const decoded = new Float32Array(outWidth * outHeight);
      const valueAt = (x: number, y: number): number => {
        const idx = (y * width + x) * 4;
        return (
          (data[idx] * 16777216 +
            data[idx + 1] * 65536 +
            data[idx + 2] * 256 +
            data[idx + 3]) /
          1000
        );
      };
      for (let oy = 0; oy < outHeight; oy++) {
        for (let ox = 0; ox < outWidth; ox++) {
          let sum = 0;
          for (let dy = 0; dy < factor; dy++) {
            for (let dx = 0; dx < factor; dx++) {
              sum += valueAt(ox * factor + dx, oy * factor + dy);
            }
          }
          decoded[oy * outWidth + ox] =
            downsampling.aggregation === 'sum' ? sum : sum / (factor * factor);
        }
      }
      return { width: outWidth, height: outHeight, decoded };
    }

    function toComparable({
      width,
      height,
      decoded,
    }: {
      width: number;
      height: number;
      decoded: Float32Array;
    }): { width: number; height: number; decoded: number[] } {
      return { width, height, decoded: Array.from(decoded) };
    }

    const noisyWidth = 237;
    const noisyHeight = 191;
    const noisyData = createNoisyRgbaData({
      width: noisyWidth,
      height: noisyHeight,
      seed: 42,
    });
    const meanBy10: Downsampling = { factor: 10, aggregation: 'mean' };
    const noisyExpectedMeanBy10 = expectedFromRawPixels({
      width: noisyWidth,
      height: noisyHeight,
      data: noisyData,
      downsampling: meanBy10,
    });

    it('should decode and downsample (mean) noisy data', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
      });

      // Act
      const result = await decodeRgbaEncodedPng({
        inputBuffer,
        downsampling: meanBy10,
      });

      // Assert
      expect(toComparable(result)).toEqual(toComparable(noisyExpectedMeanBy10));
    });

    it('should decode noisy data without downsampling', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
      });

      // Act
      const result = await decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      expect(toComparable(result)).toEqual(
        toComparable(
          expectedFromRawPixels({
            width: noisyWidth,
            height: noisyHeight,
            data: noisyData,
            downsampling: { factor: 1, aggregation: 'mean' },
          }),
        ),
      );
    });

    it('should decode and downsample (sum) noisy data', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
      });
      const sumBy10: Downsampling = { factor: 10, aggregation: 'sum' };

      // Act
      const result = await decodeRgbaEncodedPng({
        inputBuffer,
        downsampling: sumBy10,
      });

      // Assert
      expect(toComparable(result)).toEqual(
        toComparable(
          expectedFromRawPixels({
            width: noisyWidth,
            height: noisyHeight,
            data: noisyData,
            downsampling: sumBy10,
          }),
        ),
      );
    });

    // Real population PNGs use all five filter types (adaptive filtering per row).
    it.each([
      ['None', 0],
      ['Sub', 1],
      ['Up', 2],
      ['Average', 3],
      ['Paeth', 4],
      ['adaptive', -1],
    ])('should decode PNGs using filter type %s', async (_name, filterType) => {
      // Arrange
      const inputBuffer = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
        options: { filterType },
      });

      // Act
      const result = await decodeRgbaEncodedPng({
        inputBuffer,
        downsampling: meanBy10,
      });

      // Assert
      expect(toComparable(result)).toEqual(toComparable(noisyExpectedMeanBy10));
    });

    // Real population PNGs are split into hundreds of IDAT chunks whose
    // boundaries do not align with row boundaries. pngjs's sync writer always
    // emits a single IDAT, so re-chunk it manually.
    it.each([
      ['many small IDAT chunks', { deflateLevel: 6 }, 512],
      ['stored (uncompressed) deflate blocks', { deflateLevel: 0 }, undefined],
      ['stored blocks in small IDAT chunks', { deflateLevel: 0 }, 1024],
    ])('should decode PNGs with %s', async (_name, options, idatChunkSize) => {
      // Arrange
      const singleIdat = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
        options,
      });
      const inputBuffer =
        idatChunkSize === undefined
          ? singleIdat
          : splitIdatChunks({
              pngBuffer: singleIdat,
              chunkSize: idatChunkSize,
            });

      // Act
      const result = await decodeRgbaEncodedPng({
        inputBuffer,
        downsampling: meanBy10,
      });

      // Assert
      expect(toComparable(result)).toEqual(toComparable(noisyExpectedMeanBy10));
    });

    it('should produce a multi-IDAT fixture with splitIdatChunks', () => {
      // Arrange
      const singleIdat = writePng({
        width: noisyWidth,
        height: noisyHeight,
        data: noisyData,
      });

      // Act
      const inputBuffer = splitIdatChunks({
        pngBuffer: singleIdat,
        chunkSize: 512,
      });

      // Assert
      expect(countChunks({ pngBuffer: singleIdat, type: 'IDAT' })).toBe(1);
      expect(
        countChunks({ pngBuffer: inputBuffer, type: 'IDAT' }),
      ).toBeGreaterThan(1);
      expect(PNG.sync.read(inputBuffer).data).toEqual(noisyData);
    });

    it.each([
      ['width and height not multiples of the factor', 23, 17],
      ['exactly one block', 10, 10],
      ['one extra row', 10, 11],
      ['one extra column', 11, 10],
      ['single row below the factor', 25, 1],
      ['single column below the factor', 1, 25],
      ['single pixel', 1, 1],
    ])('should handle dimensions: %s (%ix%i)', async (_name, width, height) => {
      // Arrange
      const data = createNoisyRgbaData({
        width,
        height,
        seed: width * 31 + height,
      });
      const inputBuffer = writePng({ width, height, data });

      // Act
      const result = await decodeRgbaEncodedPng({
        inputBuffer,
        downsampling: meanBy10,
      });

      // Assert
      expect(toComparable(result)).toEqual(
        toComparable(
          expectedFromRawPixels({
            width,
            height,
            data,
            downsampling: meanBy10,
          }),
        ),
      );
    });

    it('should weight channels as base-256 digits (R most significant)', async () => {
      // Arrange
      const width = 4;
      const height = 1;
      const data = Buffer.from([
        1,
        0,
        0,
        0, // 16777216 / 1000
        0,
        1,
        0,
        0, // 65536 / 1000
        0,
        0,
        1,
        0, // 256 / 1000
        0,
        0,
        0,
        1, // 1 / 1000
      ]);
      const inputBuffer = writePng({ width, height, data });

      // Act
      const result = await decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      expect(Array.from(result.decoded)).toEqual([
        Math.fround(16777.216),
        Math.fround(65.536),
        Math.fround(0.256),
        Math.fround(0.001),
      ]);
    });

    it('should decode the maximum encodable value', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: 1,
        height: 1,
        data: Buffer.from([255, 255, 255, 255]),
      });

      // Act
      const result = await decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      expect(result.decoded[0]).toBe(Math.fround(4294967.295));
    });

    // Only what the pipeline emits is supported (8-bit RGBA, non-interlaced);
    // anything else cannot carry the 4-channel encoding and is rejected.
    it.each<[string, PackerOptions]>([
      ['RGB without alpha', { colorType: 2 }],
      ['greyscale', { colorType: 0 }],
      ['greyscale with alpha', { colorType: 4 }],
      ['16-bit RGBA', { bitDepth: 16 }],
    ])('should reject %s PNGs', async (_name, options) => {
      // Arrange
      const inputBuffer = writePng({
        width: 4,
        height: 4,
        data: createNoisyRgbaData({ width: 4, height: 4, seed: 7 }),
        options,
      });

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      await expect(act).rejects.toThrow(
        'Unsupported PNG for RGBA-encoded raster',
      );
    });

    it('should reject interlaced PNGs', async () => {
      // Arrange
      const inputBuffer = setInterlaced(
        writePng({
          width: 4,
          height: 4,
          data: createNoisyRgbaData({ width: 4, height: 4, seed: 7 }),
        }),
      );

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      await expect(act).rejects.toThrow(
        'Unsupported PNG for RGBA-encoded raster',
      );
    });

    it('should reject non-PNG input', async () => {
      // Arrange
      const inputBuffer = Buffer.from('definitely not a png');

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      await expect(act).rejects.toThrow('Not a PNG file');
    });

    it('should reject truncated image data', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: 4,
        height: 8,
        data: createNoisyRgbaData({ width: 4, height: 8, seed: 7 }),
      });
      const truncated = setIhdrHeight({ pngBuffer: inputBuffer, height: 9 });

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer: truncated });

      // Assert
      await expect(act).rejects.toThrow('PNG image data is truncated');
    });

    it('should reject PNGs whose header declares more than 500 Mpx', async () => {
      // Arrange
      const inputBuffer = patchIhdr({
        pngBuffer: writePng({
          width: 4,
          height: 4,
          data: createNoisyRgbaData({ width: 4, height: 4, seed: 7 }),
        }),
        patch: (ihdrData) => {
          ihdrData.writeUInt32BE(30000, 0);
          ihdrData.writeUInt32BE(20000, 4);
        },
      });

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      await expect(act).rejects.toThrow('PNG is too large');
    });

    it('should reject corrupt image data without leaving an unhandled rejection', async () => {
      // Arrange
      const inputBuffer = writePng({
        width: 4,
        height: 4,
        data: createNoisyRgbaData({ width: 4, height: 4, seed: 7 }),
      });
      const idatOffset = inputBuffer.indexOf('IDAT', 8, 'latin1') + 4;
      inputBuffer.fill(0xff, idatOffset, idatOffset + 8);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      // Act
      const act = decodeRgbaEncodedPng({ inputBuffer });

      // Assert
      try {
        await expect(act).rejects.toThrow();
        await new Promise((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
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
      // Act
      const result = reprojectPng4326To3857({
        base64Png: input,
        ymin: -10,
        ymax: 10,
      });

      // Assert
      expect(readRows(result)).toEqual([10, 20, 30, 40]);
    });

    it('should pull rows towards the pole for a high-latitude bbox', () => {
      // Act
      const result = reprojectPng4326To3857({
        base64Png: input,
        ymin: 0,
        ymax: 80,
      });

      // Assert
      // Mercator stretches high latitudes, so the northernmost row spans two
      // output rows and one southern row is dropped.
      expect(readRows(result)).toEqual([10, 10, 20, 40]);
    });

    it('should return the input unchanged for a degenerate extent', () => {
      // Act
      const result = reprojectPng4326To3857({
        base64Png: input,
        ymin: 5,
        ymax: 5,
      });

      // Assert
      expect(result).toBe(input);
    });
  });
});
