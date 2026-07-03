import { PNG } from 'pngjs';

type Rgba = [number, number, number, number];

// ─── Colorization configuration ───────────────────────────────────────────────
// These parameters control how grayscale raster values are mapped to colors.
// Adjust these to change the visual output without altering the algorithm.

interface ColorizationConfig {
  // Color+alpha for the lowest non-zero values (RGBA, each 0–255).
  colorLow: Rgba;

  // Color+alpha for the highest values (RGBA, each 0–255).
  colorHigh: Rgba;

  // Whether zero-value pixels are fully transparent.
  // true: zero pixels are invisible (typical for flood extents on a map).
  // false: zero pixels are rendered using colorLow.
  zeroIsTransparent: boolean;

  // Number of discrete color bands between colorLow and colorHigh.
  // Higher = smoother gradient; lower = more banded/posterized appearance.
  steps: number;

  // Whether to apply log1p scaling before normalizing.
  // true: compresses high dynamic range, revealing detail in low values.
  // false: linear mapping (uniform spread from min to max).
  useLogScale: boolean;
}

const POPULATION_CONFIG: ColorizationConfig = {
  colorLow: [0, 200, 0, 0],
  colorHigh: [100, 100, 255, 255],
  zeroIsTransparent: true,
  steps: 6,
  useLogScale: true,
};

const POPULATION_DOWNSAMPLE_FACTOR = 10;

export const FLOOD_DEPTH_CONFIG: ColorizationConfig = {
  colorLow: [173, 216, 230, 179],
  colorHigh: [0, 0, 139, 179],
  zeroIsTransparent: true,
  steps: 6,
  useLogScale: false,
};
// ──────────────────────────────────────────────────────────────────────────────

export function colorizeGrayscalePng(
  base64Grayscale: string,
  config: ColorizationConfig,
): string {
  if (!base64Grayscale) {
    return '';
  }

  const { colorLow, colorHigh, zeroIsTransparent, steps, useLogScale } = config;

  const inputBuffer = Buffer.from(base64Grayscale, 'base64');
  const grayscalePng = PNG.sync.read(inputBuffer);
  const { width, height, data } = grayscalePng;
  const pixelCount = width * height;

  // Pass 1: find max value (with optional log scaling) for normalization
  let max = 0;
  for (let i = 0; i < pixelCount; i++) {
    let value = data[i * 4];
    if (useLogScale) {
      value = Math.log1p(value);
    }
    if (value > max) {
      max = value;
    }
  }
  if (max === 0) {
    max = 1;
  }

  // Pass 2: colorize directly into output PNG without intermediate arrays
  const outputPng = new PNG({ width, height });
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const raw = data[i * 4];

    if (raw === 0 && zeroIsTransparent) {
      outputPng.data[idx] = 0;
      outputPng.data[idx + 1] = 0;
      outputPng.data[idx + 2] = 0;
      outputPng.data[idx + 3] = 0;
    } else {
      const scaled = useLogScale ? Math.log1p(raw) : raw;
      const normalized = scaled / max;
      const stepIndex = Math.round(normalized * steps);
      const n = Math.min(stepIndex, steps) / steps;

      outputPng.data[idx] = Math.round(
        colorLow[0] * (1 - n) + colorHigh[0] * n,
      );
      outputPng.data[idx + 1] = Math.round(
        colorLow[1] * (1 - n) + colorHigh[1] * n,
      );
      outputPng.data[idx + 2] = Math.round(
        colorLow[2] * (1 - n) + colorHigh[2] * n,
      );
      outputPng.data[idx + 3] = Math.round(
        colorLow[3] * (1 - n) + colorHigh[3] * n,
      );
    }
  }

  const outputBuffer = PNG.sync.write(outputPng);
  return outputBuffer.toString('base64');
}

interface RasterMetadata {
  data: {
    extent: { xmin: number; ymin: number; xmax: number; ymax: number };
    crs: string;
    nodata: number;
  };
  coloured: {
    extent: { xmin: number; ymin: number; xmax: number; ymax: number };
    crs: string;
  };
}

export interface PopulationRasterResult {
  colouredBase64: string;
  metadata: RasterMetadata;
}

function computeRasterMetadata(
  dataPngBuffer: Buffer,
  metadata: { transform: number[]; crs: string },
): RasterMetadata {
  const width = dataPngBuffer.readUInt32BE(16);
  const height = dataPngBuffer.readUInt32BE(20);

  const transform = metadata.transform.slice(0, 6);
  const xmin = transform[2];
  const ymax = transform[5];
  const xRes = transform[0];
  const yRes = Math.abs(transform[4]);
  const xmax = xmin + xRes * width;
  const ymin = ymax - yRes * height;

  const extent = { xmin, ymin, xmax, ymax };
  const colouredExtent =
    metadata.crs === 'EPSG:4326' ? reproject4326To3857(extent) : extent;
  const colouredCrs = metadata.crs === 'EPSG:4326' ? 'EPSG:3857' : metadata.crs;

  return {
    data: { extent, crs: metadata.crs, nodata: 0 },
    coloured: { extent: colouredExtent, crs: colouredCrs },
  };
}

export function processPopulationRaster(
  dataPngBuffer: Buffer,
  metadata: { transform: number[]; crs: string },
): PopulationRasterResult {
  const rasterMetadata = computeRasterMetadata(dataPngBuffer, metadata);
  const colouredBase64 = colorizeRgbaEncodedPng(
    dataPngBuffer,
    POPULATION_CONFIG,
    POPULATION_DOWNSAMPLE_FACTOR,
  );

  return {
    colouredBase64,
    metadata: rasterMetadata,
  };
}

// The data PNG encodes population values across RGBA channels:
// value = (R * 16777216 + G * 65536 + B * 256 + A) / 1000
// (This treats RGBA as digits of a single base-256 number.
// Divide by 1000 since the number was encoded with 3 decimal places of precision.)
// This function decodes those values (optionally downsampling) and colorizes based on population.
// It allocates a Float32Array for decoded values and uses three passes (decode, max scan, render).
// Peak memory is roughly input + output + decoded, so keep downsampleFactor in mind for large rasters.
function colorizeRgbaEncodedPng(
  inputBuffer: Buffer,
  config: ColorizationConfig,
  downsampleFactor = 1,
): string {
  const { colorLow, colorHigh, zeroIsTransparent, steps, useLogScale } = config;

  const png = PNG.sync.read(inputBuffer);
  const { width, height, data } = png;

  const effectiveFactor =
    width >= downsampleFactor && height >= downsampleFactor
      ? downsampleFactor
      : 1;
  const outWidth = Math.floor(width / effectiveFactor);
  const outHeight = Math.floor(height / effectiveFactor);
  const outPixelCount = outWidth * outHeight;

  const decoded = new Float32Array(outPixelCount);

  if (effectiveFactor <= 1) {
    for (let i = 0; i < outPixelCount; i++) {
      const idx = i * 4;
      decoded[i] =
        (data[idx] * 16777216 +
          data[idx + 1] * 65536 +
          data[idx + 2] * 256 +
          data[idx + 3]) /
        1000;
    }
  } else {
    for (let oy = 0; oy < outHeight; oy++) {
      for (let ox = 0; ox < outWidth; ox++) {
        let sum = 0;
        for (let dy = 0; dy < effectiveFactor; dy++) {
          for (let dx = 0; dx < effectiveFactor; dx++) {
            const srcX = ox * effectiveFactor + dx;
            const srcY = oy * effectiveFactor + dy;
            const idx = (srcY * width + srcX) * 4;
            sum +=
              (data[idx] * 16777216 +
                data[idx + 1] * 65536 +
                data[idx + 2] * 256 +
                data[idx + 3]) /
              1000;
          }
        }
        decoded[oy * outWidth + ox] = sum / (effectiveFactor * effectiveFactor);
      }
    }
  }

  let max = 0;
  for (let i = 0; i < outPixelCount; i++) {
    const v = useLogScale ? Math.log1p(decoded[i]) : decoded[i];
    if (v > max) {
      max = v;
    }
  }
  if (max === 0) {
    max = 1;
  }

  const outputPng = new PNG({ width: outWidth, height: outHeight });
  for (let i = 0; i < outPixelCount; i++) {
    const idx = i * 4;
    const v = useLogScale ? Math.log1p(decoded[i]) : decoded[i];

    if (v === 0 && zeroIsTransparent) {
      outputPng.data[idx] = 0;
      outputPng.data[idx + 1] = 0;
      outputPng.data[idx + 2] = 0;
      outputPng.data[idx + 3] = 0;
    } else {
      const normalized = v / max;
      const stepIndex = Math.round(normalized * steps);
      const n = Math.min(stepIndex, steps) / steps;

      outputPng.data[idx] = Math.round(
        colorLow[0] * (1 - n) + colorHigh[0] * n,
      );
      outputPng.data[idx + 1] = Math.round(
        colorLow[1] * (1 - n) + colorHigh[1] * n,
      );
      outputPng.data[idx + 2] = Math.round(
        colorLow[2] * (1 - n) + colorHigh[2] * n,
      );
      outputPng.data[idx + 3] = Math.round(
        colorLow[3] * (1 - n) + colorHigh[3] * n,
      );
    }
  }

  const outputBuffer = PNG.sync.write(outputPng);
  return outputBuffer.toString('base64');
}

export function reproject4326To3857(extent: {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const toMercatorX = (lon: number): number => (lon * 20037508.34) / 180;
  const toMercatorY = (lat: number): number => {
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat)); // Web Mercator formula is undefined at the poles
    const rad = (clampedLat * Math.PI) / 180;
    return (Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) * 20037508.34;
  };

  return {
    xmin: toMercatorX(extent.xmin),
    ymin: toMercatorY(extent.ymin),
    xmax: toMercatorX(extent.xmax),
    ymax: toMercatorY(extent.ymax),
  };
}
