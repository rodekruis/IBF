import { PNG } from 'pngjs';

import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';

type Rgba = [number, number, number, number];

// ─── Colorization configuration ───────────────────────────────────────────────
// These parameters control how grayscale raster values are mapped to colors.
// Adjust these to change the visual output without altering the algorithm.

interface ColorizationConfigBase {
  // Whether zero-value pixels are fully transparent.
  // true: zero pixels are invisible (typical for flood depth rasters on a map).
  // false: zero pixels are rendered using the lowest color.
  zeroIsTransparent: boolean;

  // Whether to apply log1p scaling before normalizing.
  // true: compresses high dynamic range, revealing detail in low values.
  // false: linear mapping (uniform spread from min to max).
  useLogScale: boolean;
}

interface GradientColorizationConfig extends ColorizationConfigBase {
  mode: 'gradient';

  // Color+alpha for the lowest non-zero values (RGBA, each 0–255).
  colorLow: Rgba;

  // Color+alpha for the highest values (RGBA, each 0–255).
  colorHigh: Rgba;

  // Number of discrete color bands between colorLow and colorHigh.
  // Higher = smoother gradient; lower = more banded/posterized appearance.
  steps: number;
}

interface PaletteColorizationConfig extends ColorizationConfigBase {
  mode: 'palette';

  // Color palette for the color steps, in order of lowest step color to highest
  palette: Rgba[];
}

type ColorizationConfig =
  GradientColorizationConfig | PaletteColorizationConfig;

const POPULATION_CONFIG: ColorizationConfig = {
  mode: 'palette',
  zeroIsTransparent: true,
  useLogScale: true,
  palette: [
    [0, 0, 0, 20], // Grey 30 — ~8% black
    [0, 0, 0, 37], // Grey 40 — ~14.5% black
    [0, 0, 0, 56], // Grey 50 — ~22% black
    [0, 0, 0, 74], // Grey 60 — ~29% black
    [0, 0, 0, 94], // Grey 70 — ~37% black
  ],
};

const POPULATION_DOWNSAMPLE_FACTOR = 10;

const FLOOD_DEPTH_CONFIG: ColorizationConfig = {
  mode: 'gradient',
  colorLow: [173, 216, 230, 179],
  colorHigh: [0, 0, 139, 179],
  zeroIsTransparent: true,
  steps: 6,
  useLogScale: false,
};

const WIND_SPEED_CONFIG: ColorizationConfig = {
  mode: 'gradient',
  colorLow: [255, 237, 160, 179],
  colorHigh: [189, 0, 38, 179],
  zeroIsTransparent: true,
  steps: 8,
  useLogScale: false,
};

const LAYER_COLORIZATION_CONFIG: Partial<
  Record<LayerName, ColorizationConfig>
> = {
  [LayerName.floodDepth]: FLOOD_DEPTH_CONFIG,
  [LayerName.windSpeed]: WIND_SPEED_CONFIG,
};

export function getColorizationConfig(
  layerName: LayerName,
): ColorizationConfig {
  return LAYER_COLORIZATION_CONFIG[layerName] ?? FLOOD_DEPTH_CONFIG;
}
// ──────────────────────────────────────────────────────────────────────────────

function resolveColor({
  config,
  normalized,
}: {
  config: ColorizationConfig;
  normalized: number;
}): Rgba {
  if (config.mode === 'palette') {
    const band = Math.min(
      Math.floor(normalized * config.palette.length),
      config.palette.length - 1,
    );
    return config.palette[band];
  }

  const { colorLow, colorHigh, steps } = config;
  const stepIndex = Math.round(normalized * steps);
  const n = Math.min(stepIndex, steps) / steps;

  return [
    Math.round(colorLow[0] * (1 - n) + colorHigh[0] * n),
    Math.round(colorLow[1] * (1 - n) + colorHigh[1] * n),
    Math.round(colorLow[2] * (1 - n) + colorHigh[2] * n),
    Math.round(colorLow[3] * (1 - n) + colorHigh[3] * n),
  ];
}

export function colorizeGrayscalePng({
  base64Grayscale,
  config,
}: {
  base64Grayscale: string;
  config: ColorizationConfig;
}): string {
  if (!base64Grayscale) {
    return '';
  }

  const { zeroIsTransparent, useLogScale } = config;

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
      const color = resolveColor({ config, normalized });

      outputPng.data[idx] = color[0];
      outputPng.data[idx + 1] = color[1];
      outputPng.data[idx + 2] = color[2];
      outputPng.data[idx + 3] = color[3];
    }
  }

  const outputBuffer = PNG.sync.write(outputPng);
  return outputBuffer.toString('base64');
}

interface RasterMetadata {
  data: {
    extent: { xmin: number; ymin: number; xmax: number; ymax: number };
    crs: EPSG;
    nodata: number;
  };
  coloured: {
    extent: { xmin: number; ymin: number; xmax: number; ymax: number };
    crs: EPSG;
  };
}

export interface PopulationRasterResult {
  colouredBase64: string;
  metadata: RasterMetadata;
}

function computeRasterMetadata({
  dataPngBuffer,
  metadata,
}: {
  dataPngBuffer: Buffer;
  metadata: { transform: number[]; crs: EPSG };
}): RasterMetadata {
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
    metadata.crs === EPSG.WGS84 ? reproject4326To3857(extent) : extent;
  const colouredCrs =
    metadata.crs === EPSG.WGS84 ? EPSG.WebMercator : metadata.crs;

  return {
    data: { extent, crs: metadata.crs, nodata: 0 },
    coloured: { extent: colouredExtent, crs: colouredCrs },
  };
}

export function processPopulationRaster({
  dataPngBuffer,
  metadata,
}: {
  dataPngBuffer: Buffer;
  metadata: { transform: number[]; crs: EPSG };
}): PopulationRasterResult {
  const rasterMetadata = computeRasterMetadata({ dataPngBuffer, metadata });
  const colouredBase64 = colorizeRgbaEncodedPng({
    inputBuffer: dataPngBuffer,
    config: POPULATION_CONFIG,
    downsampleFactor: POPULATION_DOWNSAMPLE_FACTOR,
  });
  const { ymin, ymax } = rasterMetadata.data.extent;

  return {
    colouredBase64: reprojectPng4326To3857({
      base64Png: colouredBase64,
      ymin,
      ymax,
    }),
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
function colorizeRgbaEncodedPng({
  inputBuffer,
  config,
  downsampleFactor = 1,
}: {
  inputBuffer: Buffer;
  config: ColorizationConfig;
  downsampleFactor?: number;
}): string {
  const { zeroIsTransparent, useLogScale } = config;

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
      const color = resolveColor({ config, normalized });

      outputPng.data[idx] = color[0];
      outputPng.data[idx + 1] = color[1];
      outputPng.data[idx + 2] = color[2];
      outputPng.data[idx + 3] = color[3];
    }
  }

  const outputBuffer = PNG.sync.write(outputPng);
  return outputBuffer.toString('base64');
}

const MERCATOR_WORLD_EXTENT_METRES = 20037508.34;
const MAX_MERCATOR_LATITUDE = 85.05112878; // Web Mercator formula is undefined at the poles

function longitudeToMercatorX(longitude: number): number {
  return (longitude * MERCATOR_WORLD_EXTENT_METRES) / 180;
}

function latitudeToMercatorY(latitude: number): number {
  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const rad = (clampedLatitude * Math.PI) / 180;
  return (
    (Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) *
    MERCATOR_WORLD_EXTENT_METRES
  );
}

function mercatorYToLatitude(mercatorY: number): number {
  const rad = (mercatorY / MERCATOR_WORLD_EXTENT_METRES) * Math.PI;
  return ((2 * Math.atan(Math.exp(rad)) - Math.PI / 2) * 180) / Math.PI;
}

export function reproject4326To3857(extent: {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}): { xmin: number; ymin: number; xmax: number; ymax: number } {
  return {
    xmin: longitudeToMercatorX(extent.xmin),
    ymin: latitudeToMercatorY(extent.ymin),
    xmax: longitudeToMercatorX(extent.xmax),
    ymax: latitudeToMercatorY(extent.ymax),
  };
}

// Reprojects a PNG from EPSG:4326 to EPSG:3857. Rows of a geographic raster are evenly
// spaced in latitude, but map renderers space them evenly in Mercator Y, so each output
// row is resampled from the source row at its latitude. Columns are untouched because
// Mercator X is linear in longitude. Nearest-neighbour keeps nodata edges crisp.
export function reprojectPng4326To3857({
  base64Png,
  ymin,
  ymax,
}: {
  base64Png: string;
  ymin: number;
  ymax: number;
}): string {
  if (ymax <= ymin) {
    return base64Png;
  }

  const png = PNG.sync.read(Buffer.from(base64Png, 'base64'));
  const { width, height, data } = png;

  const mercatorTop = latitudeToMercatorY(ymax);
  const mercatorBottom = latitudeToMercatorY(ymin);
  const outputPng = new PNG({ width, height });
  const rowBytes = width * 4;

  for (let outputRow = 0; outputRow < height; outputRow++) {
    const mercatorY =
      mercatorTop +
      ((outputRow + 0.5) / height) * (mercatorBottom - mercatorTop);
    const latitude = mercatorYToLatitude(mercatorY);
    const sourceRow = Math.min(
      height - 1,
      Math.max(0, Math.floor(((ymax - latitude) / (ymax - ymin)) * height)),
    );

    data.copy(
      outputPng.data,
      outputRow * rowBytes,
      sourceRow * rowBytes,
      sourceRow * rowBytes + rowBytes,
    );
  }

  return PNG.sync.write(outputPng).toString('base64');
}
