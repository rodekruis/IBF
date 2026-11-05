import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflate } from 'node:zlib';
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
}

interface RelativeColorizationConfigBase extends ColorizationConfigBase {
  // Whether to apply log1p scaling before normalizing.
  // true: compresses high dynamic range, revealing detail in low values.
  // false: linear mapping (uniform spread from min to max).
  useLogScale: boolean;
}

interface GradientColorizationConfig extends RelativeColorizationConfigBase {
  mode: 'gradient';

  // Color+alpha for the lowest non-zero values (RGBA, each 0–255).
  colorLow: Rgba;

  // Color+alpha for the highest values (RGBA, each 0–255).
  colorHigh: Rgba;

  // Number of discrete color bands between colorLow and colorHigh.
  // Higher = smoother gradient; lower = more banded/posterized appearance.
  steps: number;
}

interface PaletteColorizationConfig extends RelativeColorizationConfigBase {
  mode: 'palette';

  // Color palette for the color steps, in order of lowest step color to highest
  palette: Rgba[];
}

interface FixedScaleColorizationConfig extends ColorizationConfigBase {
  mode: 'fixedScale';

  // Value of grey level 255; grey levels 1–255 map linearly to 0–maxValue, as encoded by the pipeline.
  maxValue: number;

  // Ascending lower bounds (in the raster's unit) of palette colors 2..n.
  thresholds: number[];

  palette: Rgba[];
}

type RelativeColorizationConfig =
  GradientColorizationConfig | PaletteColorizationConfig;

type ColorizationConfig =
  RelativeColorizationConfig | FixedScaleColorizationConfig;

export interface Downsampling {
  factor: number;
  // 'sum' for counts per pixel (e.g. population), 'mean' for intensities (e.g. flood depth).
  aggregation: 'sum' | 'mean';
}

const POPULATION_CONFIG: RelativeColorizationConfig = {
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

const POPULATION_DOWNSAMPLING: Downsampling = {
  factor: 10,
  // Not 'sum': the log1p/max scale is not scale-invariant, and 'mean' gives the desired contrast.
  aggregation: 'mean',
};

// Must match FLOOD_DEPTH_GREYSCALE_MAX_METRES in the pipeline. This is needed to map greyscale levels back to metres.
const FLOOD_DEPTH_GREYSCALE_MAX_METRES = 10;

export const FLOOD_DEPTH_CONFIG: FixedScaleColorizationConfig = {
  mode: 'fixedScale',
  zeroIsTransparent: true,
  maxValue: FLOOD_DEPTH_GREYSCALE_MAX_METRES,
  thresholds: [0.25, 0.75, 1.5, 2.5],
  palette: [
    [203, 221, 242, 166], // Blue 20 — 65% #CBDDF2
    [158, 186, 220, 166], // Blue 30 — 65% #9EBADC
    [110, 150, 197, 166], // Blue 40 — 65% #6E96C5
    [70, 122, 188, 166], // Blue 50 — 65% #467ABC
    [49, 99, 160, 166], // Blue 60 — 65% #3163A0
  ],
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
  config: RelativeColorizationConfig;
  normalized: number;
}): Rgba {
  if (config.mode === 'palette') {
    if (config.palette.length === 0) {
      throw new Error('Colorization palette must contain at least one color');
    }

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

function resolveFixedScaleColor({
  config,
  greyLevel,
}: {
  config: FixedScaleColorizationConfig;
  greyLevel: number;
}): Rgba {
  const value = ((greyLevel - 1) / 254) * config.maxValue;
  let band = 0;
  while (band < config.thresholds.length && value >= config.thresholds[band]) {
    band++;
  }
  return config.palette[band];
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

  const { zeroIsTransparent } = config;

  const inputBuffer = Buffer.from(base64Grayscale, 'base64');
  const grayscalePng = PNG.sync.read(inputBuffer);
  const { width, height, data } = grayscalePng;
  const pixelCount = width * height;

  // Pass 1: find max value (with optional log scaling) for normalization
  let max = 0;
  if (config.mode !== 'fixedScale') {
    for (let i = 0; i < pixelCount; i++) {
      let value = data[i * 4];
      if (config.useLogScale) {
        value = Math.log1p(value);
      }
      if (value > max) {
        max = value;
      }
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
      const color =
        config.mode === 'fixedScale'
          ? resolveFixedScaleColor({ config, greyLevel: raw })
          : resolveColor({
              config,
              normalized: (config.useLogScale ? Math.log1p(raw) : raw) / max,
            });

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
    metadata.crs === EPSG.WGS84 ? reprojectExtents4326To3857(extent) : extent;
  const colouredCrs =
    metadata.crs === EPSG.WGS84 ? EPSG.WebMercator : metadata.crs;

  return {
    data: { extent, crs: metadata.crs, nodata: 0 },
    coloured: { extent: colouredExtent, crs: colouredCrs },
  };
}

export async function processPopulationRaster({
  dataPngBuffer,
  metadata,
}: {
  dataPngBuffer: Buffer;
  metadata: { transform: number[]; crs: EPSG };
}): Promise<PopulationRasterResult> {
  if (metadata.crs !== EPSG.WGS84) {
    throw new Error('Only WGS84 population rasters are supported');
  }
  const rasterMetadata = computeRasterMetadata({ dataPngBuffer, metadata });
  const colouredBase64 = await colorizeRgbaEncodedPng({
    inputBuffer: dataPngBuffer,
    config: POPULATION_CONFIG,
    downsampling: POPULATION_DOWNSAMPLING,
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
// This function decodes those values into a Float32Array, optionally downsampling.
//
// The PNG is decoded as a stream: IDAT chunks are inflated incrementally and each
// row is unfiltered and folded into the (downsampled) output as soon as it is
// complete. Memory use is therefore bounded by the compressed input plus two
// rows and the output, independent of image height. This matters because
// country-sized population rasters decode to ~1 GB of RGBA (e.g. ETH is
// 18001x13788 px), which must never be materialised in the API process.
export async function decodeRgbaEncodedPng({
  inputBuffer,
  downsampling = { factor: 1, aggregation: 'mean' },
}: {
  inputBuffer: Buffer;
  downsampling?: Downsampling;
}): Promise<{ width: number; height: number; decoded: Float32Array }> {
  const { width, height, idatChunks } = parsePngStructure(inputBuffer);

  const effectiveFactor =
    width >= downsampling.factor && height >= downsampling.factor
      ? downsampling.factor
      : 1;
  const outWidth = Math.floor(width / effectiveFactor);
  const outHeight = Math.floor(height / effectiveFactor);
  const decoded = new Float32Array(outWidth * outHeight);

  const bytesPerPixel = 4;
  const rowLength = 1 + width * bytesPerPixel;
  let currentRow = Buffer.alloc(rowLength);
  let previousRow = Buffer.alloc(rowLength);
  let rowFill = 0;
  let rowIndex = 0;

  const usedWidth = outWidth * effectiveFactor;
  const usedHeight = outHeight * effectiveFactor;
  const blockSums = new Float64Array(outWidth);

  const consumeRow = (): void => {
    unfilterRow({ row: currentRow, previousRow, bytesPerPixel });

    if (rowIndex < usedHeight) {
      for (let x = 0; x < usedWidth; x++) {
        const idx = 1 + x * bytesPerPixel;
        blockSums[Math.floor(x / effectiveFactor)] +=
          (currentRow[idx] * 16777216 +
            currentRow[idx + 1] * 65536 +
            currentRow[idx + 2] * 256 +
            currentRow[idx + 3]) /
          1000;
      }

      if ((rowIndex + 1) % effectiveFactor === 0) {
        const outRowOffset = Math.floor(rowIndex / effectiveFactor) * outWidth;
        const divisor = effectiveFactor * effectiveFactor;
        for (let ox = 0; ox < outWidth; ox++) {
          decoded[outRowOffset + ox] =
            downsampling.aggregation === 'sum'
              ? blockSums[ox]
              : blockSums[ox] / divisor;
        }
        blockSums.fill(0);
      }
    }

    [previousRow, currentRow] = [currentRow, previousRow];
    rowFill = 0;
    rowIndex++;
  };

  const inflate = createInflate();
  const feed = pipeline(Readable.from(idatChunks), inflate);
  try {
    // try-catch because the inflate can be invalid
    for await (const chunk of inflate) {
      let offset = 0;
      while (offset < chunk.length) {
        const take = Math.min(rowLength - rowFill, chunk.length - offset);
        chunk.copy(currentRow, rowFill, offset, offset + take);
        rowFill += take;
        offset += take;
        if (rowFill === rowLength) {
          consumeRow();
        }
      }
    }
    await feed;
  } catch (error) {
    // When the loop throws, feed rejects too and for the same reason. If we
    // don't do anything here we get an unhandled rejection which can crash
    // Node. Solution: add a catch handler to feed which does nothing. This
    // handles the rejection.
    await feed.catch(() => undefined);
    throw error;
  }

  if (rowIndex !== height) {
    throw new Error(
      `PNG image data is truncated: expected ${height} rows, got ${rowIndex}`,
    );
  }

  return { width: outWidth, height: outHeight, decoded };
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_COLOR_TYPE_RGBA = 6;
// Largest raster we are willing to decode. The biggest real input so far is
// ~300 Mpx (PHL flood extent); the header-declared size is checked before any
// buffer is sized from it so a corrupt or wrong file fails fast instead of
// exhausting memory.
const MAX_PNG_PIXELS = 500_000_000;

function parsePngStructure(buffer: Buffer): {
  width: number;
  height: number;
  idatChunks: Buffer[];
} {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file');
  }

  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (width * height > MAX_PNG_PIXELS) {
        throw new Error(
          `PNG is too large: ${width}x${height} = ${width * height} pixels exceeds the maximum of ${MAX_PNG_PIXELS}`,
        );
      }
      const bitDepth = data[8];
      const colorType = data[9];
      const interlaceMethod = data[12];
      // Only what the pipeline produces for population rasters is supported:
      // 8-bit RGBA, non-interlaced. Other variants (RGB without alpha,
      // greyscale, palette, 16-bit, Adam7) cannot carry the 4-channel base-256
      // encoding anyway, so rather than silently decoding garbage, reject them.
      if (
        bitDepth !== 8 ||
        colorType !== PNG_COLOR_TYPE_RGBA ||
        interlaceMethod !== 0
      ) {
        throw new Error(
          `Unsupported PNG for RGBA-encoded raster: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlaceMethod} (expected 8-bit RGBA, non-interlaced)`,
        );
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (width === 0 || height === 0) {
    throw new Error('PNG is missing a valid IHDR chunk');
  }

  return { width, height, idatChunks };
}

// Reverses the per-row PNG filter in place (PNG spec section 9). Byte 0 of the
// row is the filter type; previousRow must already be unfiltered.
function unfilterRow({
  row,
  previousRow,
  bytesPerPixel,
}: {
  row: Buffer;
  previousRow: Buffer;
  bytesPerPixel: number;
}): void {
  const filterType = row[0];
  const length = row.length;

  switch (filterType) {
    case 0:
      return;
    case 1:
      for (let i = 1 + bytesPerPixel; i < length; i++) {
        row[i] = (row[i] + row[i - bytesPerPixel]) & 0xff;
      }
      return;
    case 2:
      for (let i = 1; i < length; i++) {
        row[i] = (row[i] + previousRow[i]) & 0xff;
      }
      return;
    case 3:
      for (let i = 1; i < length; i++) {
        const left = i > bytesPerPixel ? row[i - bytesPerPixel] : 0;
        row[i] = (row[i] + ((left + previousRow[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 1; i < length; i++) {
        const left = i > bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const up = previousRow[i];
        const upLeft = i > bytesPerPixel ? previousRow[i - bytesPerPixel] : 0;
        row[i] = (row[i] + paethPredictor({ left, up, upLeft })) & 0xff;
      }
      return;
    default:
      throw new Error(`Invalid PNG filter type ${filterType}`);
  }
}

function paethPredictor({
  left,
  up,
  upLeft,
}: {
  left: number;
  up: number;
  upLeft: number;
}): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  if (pb <= pc) {
    return up;
  }
  return upLeft;
}

// Colorizes an RGBA-encoded population PNG (see decodeRgbaEncodedPng) using two passes (max scan, render).
async function colorizeRgbaEncodedPng({
  inputBuffer,
  config,
  downsampling = { factor: 1, aggregation: 'mean' },
}: {
  inputBuffer: Buffer;
  config: RelativeColorizationConfig;
  downsampling?: Downsampling;
}): Promise<string> {
  const { zeroIsTransparent, useLogScale } = config;

  const {
    width: outWidth,
    height: outHeight,
    decoded,
  } = await decodeRgbaEncodedPng({ inputBuffer, downsampling });
  const outPixelCount = outWidth * outHeight;

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

// Reprojects the extents (corners) of a rectangle from EPSG:4326 to EPSG:3857
export function reprojectExtents4326To3857(extent: {
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

// Reprojects all pixels in a PNG from EPSG:4326 to EPSG:3857
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
