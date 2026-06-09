import { PNG } from 'pngjs';

type Rgba = [number, number, number, number];

const COLOR_START: Rgba = [255, 200, 0, 0];
const COLOR_END: Rgba = [255, 0, 100, 255];
const COLOR_STEPS = 6;

export function colorizeGrayscalePng(base64Grayscale: string): string {
  if (!base64Grayscale) {
    return '';
  }

  const inputBuffer = Buffer.from(base64Grayscale, 'base64');
  const grayscalePng = PNG.sync.read(inputBuffer);
  const { width, height } = grayscalePng;

  const grayscalePixels = extractGrayscaleValues(grayscalePng);
  const logScaled = applyLogScale(grayscalePixels);
  const normalized = normalize(logScaled);
  const stepped = applyColorSteps(normalized, COLOR_STEPS);

  const outputPng = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (grayscalePixels[i] === 0) {
      outputPng.data[idx] = 0;
      outputPng.data[idx + 1] = 0;
      outputPng.data[idx + 2] = 0;
      outputPng.data[idx + 3] = 0;
    } else {
      const n = stepped[i];
      outputPng.data[idx] = Math.round(
        COLOR_START[0] * (1 - n) + COLOR_END[0] * n,
      );
      outputPng.data[idx + 1] = Math.round(
        COLOR_START[1] * (1 - n) + COLOR_END[1] * n,
      );
      outputPng.data[idx + 2] = Math.round(
        COLOR_START[2] * (1 - n) + COLOR_END[2] * n,
      );
      outputPng.data[idx + 3] = Math.round(
        COLOR_START[3] * (1 - n) + COLOR_END[3] * n,
      );
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

function normalize(values: Float64Array): Float64Array {
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
