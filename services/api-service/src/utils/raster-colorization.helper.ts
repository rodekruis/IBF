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
  const { width, height } = grayscalePng;

  const grayscalePixels = extractGrayscaleValues(grayscalePng);
  const scaled = useLogScale ? applyLogScale(grayscalePixels) : grayscalePixels;
  const normalized = normalizeBetween0And1(scaled);
  const stepped = applyColorSteps(normalized, steps);

  const outputPng = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (grayscalePixels[i] === 0 && zeroIsTransparent) {
      outputPng.data[idx] = 0;
      outputPng.data[idx + 1] = 0;
      outputPng.data[idx + 2] = 0;
      outputPng.data[idx + 3] = 0;
    } else {
      const n = stepped[i];
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

function extractGrayscaleValues(png: PNG): Float64Array {
  const { width, height, data } = png;
  const values = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    values[i] = data[i * 4];
  }
  return values;
}

function applyLogScale(values: Float64Array): Float64Array {
  const result = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    result[i] = Math.log1p(values[i]);
  }
  return result;
}

function normalizeBetween0And1(values: Float64Array): Float64Array {
  let max = 0;
  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }
  if (max === 0) {
    max = 1;
  }

  const result = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    result[i] = values[i] / max;
  }
  return result;
}

function applyColorSteps(
  normalized: Float64Array,
  steps: number,
): Float64Array {
  const result = new Float64Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    const stepIndex = Math.round(normalized[i] * steps);
    result[i] = Math.min(stepIndex, steps) / steps;
  }
  return result;
}

export interface PopulationRasterResult {
  colouredBase64: string;
  metadata: {
    data: {
      extent: { xmin: number; ymin: number; xmax: number; ymax: number };
      crs: string;
      nodata: number;
    };
    coloured: {
      extent: { xmin: number; ymin: number; xmax: number; ymax: number };
      crs: string;
    };
  };
}

export function processPopulationRaster(
  dataPngBuffer: Buffer,
  metadata: { transform: number[]; crs: string },
): PopulationRasterResult {
  const png = PNG.sync.read(dataPngBuffer);
  const { width, height } = png;

  const transform = metadata.transform.slice(0, 6);
  const xmin = transform[2];
  const ymax = transform[5];
  const xRes = transform[0];
  const yRes = Math.abs(transform[4]);
  const xmax = xmin + xRes * width;
  const ymin = ymax - yRes * height;

  const extent4326 = { xmin, ymin, xmax, ymax };
  const extent3857 = reproject4326To3857(extent4326);

  const colouredBase64 = colorizeGrayscalePng(dataPngBuffer.toString('base64'));

  return {
    colouredBase64,
    metadata: {
      data: { extent: extent4326, crs: 'EPSG:4326', nodata: 0 },
      coloured: { extent: extent3857, crs: 'EPSG:3857' },
    },
  };
}

function reproject4326To3857(extent: {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const toMercatorX = (lon: number): number => (lon * 20037508.34) / 180;
  const toMercatorY = (lat: number): number => {
    const rad = (lat * Math.PI) / 180;
    return (Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) * 20037508.34;
  };

  return {
    xmin: toMercatorX(extent.xmin),
    ymin: toMercatorY(extent.ymin),
    xmax: toMercatorX(extent.xmax),
    ymax: toMercatorY(extent.ymax),
  };
}
