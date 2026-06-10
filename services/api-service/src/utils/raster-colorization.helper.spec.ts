import { PNG } from 'pngjs';

import { colorizeGrayscalePng } from '@api-service/src/utils/raster-colorization.helper';

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
      expect(colorizeGrayscalePng('')).toBe('');
    });

    it('should make zero pixels transparent with default config', () => {
      const input = createGrayscalePng(2, 2, [0, 100, 200, 0]);
      const result = colorizeGrayscalePng(input);

      const pixel0 = readOutputPixel(result, 0);
      expect(pixel0.a).toBe(0);

      const pixel3 = readOutputPixel(result, 3);
      expect(pixel3.a).toBe(0);
    });

    it('should colorize non-zero pixels with opacity', () => {
      const input = createGrayscalePng(1, 1, [128]);
      const result = colorizeGrayscalePng(input);

      const pixel = readOutputPixel(result, 0);
      expect(pixel.a).toBe(Math.round(0.5 * 255));
      expect(pixel.r).toBeGreaterThanOrEqual(0);
      expect(pixel.r).toBeLessThanOrEqual(255);
    });

    it('should render zero pixels with colorLow when zeroIsTransparent is false', () => {
      const config = {
        colorLow: [255, 0, 0] as [number, number, number],
        colorHigh: [0, 0, 255] as [number, number, number],
        opacity: 1,
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
        colorLow: [255, 0, 0] as [number, number, number],
        colorHigh: [0, 0, 255] as [number, number, number],
        opacity: 1,
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
        colorLow: [0, 0, 0] as [number, number, number],
        colorHigh: [255, 255, 255] as [number, number, number],
        opacity: 1,
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
        colorLow: [0, 0, 0] as [number, number, number],
        colorHigh: [255, 255, 255] as [number, number, number],
        opacity: 1,
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
        colorLow: [0, 0, 0] as [number, number, number],
        colorHigh: [255, 255, 255] as [number, number, number],
        opacity: 1,
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
      const result = colorizeGrayscalePng(input);

      for (let i = 0; i < 4; i++) {
        const pixel = readOutputPixel(result, i);
        expect(pixel.a).toBe(0);
      }
    });

    it('should handle uniform non-zero image', () => {
      const config = {
        colorLow: [100, 100, 100] as [number, number, number],
        colorHigh: [200, 200, 200] as [number, number, number],
        opacity: 0.8,
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
      expect(pixel0.a).toBe(Math.round(0.8 * 255));
    });
  });
});
