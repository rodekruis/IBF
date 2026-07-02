import { PNG } from 'pngjs';

type Rgb = [number, number, number];

// ─── Colorization configuration ───────────────────────────────────────────────
// These parameters control how grayscale raster values are mapped to colors.
// Adjust these to change the visual output without altering the algorithm.

interface ColorizationConfig {
  // Color for the lowest non-zero values (RGB, each 0–255).
  colorLow: Rgb;

  // Color for the highest values (RGB, each 0–255).
  colorHigh: Rgb;

  // Opacity for all non-zero pixels (0 = fully transparent, 1 = fully opaque).
  opacity: number;

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

const DEFAULT_CONFIG: ColorizationConfig = {
  colorLow: [173, 216, 230], // Light blue
  colorHigh: [0, 0, 139], // Dark blue
  opacity: 0.5,
  zeroIsTransparent: true,
  steps: 6,
  useLogScale: true,
};

export const FLOOD_DEPTH_CONFIG: ColorizationConfig = {
  colorLow: [173, 216, 230], // Light blue
  colorHigh: [0, 0, 139], // Dark blue
  opacity: 0.7,
  zeroIsTransparent: true,
  steps: 6,
  useLogScale: false,
};
// ──────────────────────────────────────────────────────────────────────────────

export function colorizeGrayscalePng(
  base64Grayscale: string,
  config: ColorizationConfig = DEFAULT_CONFIG,
): string {
  if (!base64Grayscale) {
    return '';
  }

  const {
    colorLow,
    colorHigh,
    opacity,
    zeroIsTransparent,
    steps,
    useLogScale,
  } = config;
  const alpha = Math.round(opacity * 255);

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
      outputPng.data[idx + 3] = alpha;
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
  const colouredBase64 = colorizeGrayscalePngFromBuffer(dataPngBuffer);

  return {
    colouredBase64,
    metadata: rasterMetadata,
  };
}

function colorizeGrayscalePngFromBuffer(
  inputBuffer: Buffer,
  config: ColorizationConfig = DEFAULT_CONFIG,
): string {
  const {
    colorLow,
    colorHigh,
    opacity,
    zeroIsTransparent,
    steps,
    useLogScale,
  } = config;
  const alpha = Math.round(opacity * 255);

  const grayscalePng = PNG.sync.read(inputBuffer);
  const { width, height, data } = grayscalePng;
  const pixelCount = width * height;

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
      outputPng.data[idx + 3] = alpha;
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
