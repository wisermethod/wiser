import { Buffer } from 'node:buffer';

/** Alpha-only support, in row-major luma and quarter-size chroma order. */
export function supportMasks(layer, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width % 2 || height % 2 ||
      !Number.isSafeInteger(width * height * 4)) {
    throw new RangeError('Dimensions must be positive, even safe integers');
  }
  if (!Buffer.isBuffer(layer) || layer.length !== width * height * 4) {
    throw new RangeError('Layer must be one same-size RGBA Buffer');
  }
  const luma = new Uint8Array(width * height);
  const chroma = new Uint8Array(width * height / 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (layer[p * 4 + 3] > 0) {
        luma[p] = 1;
        chroma[Math.floor(y / 2) * (width / 2) + Math.floor(x / 2)] = 1;
      }
    }
  }
  return { luma, chroma };
}

/** composite-alpha-policy/1 and composite-alpha-support/1. No intermediate rounding. */
export function composeAlpha(base, width, height, layer) {
  const { luma, chroma } = supportMasks(layer, width, height);
  const pixels = width * height;
  if (!Buffer.isBuffer(base) || base.length !== pixels * 3 / 2) {
    throw new RangeError('Base must be one same-size yuv420p Buffer');
  }
  const output = Buffer.from(base);
  for (let p = 0; p < pixels; p++) {
    if (!luma[p]) continue; // Do not read RGB under alpha zero.
    const i = p * 4;
    const a = layer[i + 3];
    const weighted = 2126 * layer[i] + 7152 * layer[i + 1] + 722 * layer[i + 2];
    const n = (a === 255 ? 0 : (255 - a) * base[p] * 2550000) +
      a * (40800000 + 219 * weighted);
    const d = 650250000;
    output[p] = Math.floor((2 * n + d) / (2 * d));
  }
  for (let cy = 0; cy < height / 2; cy++) {
    for (let cx = 0; cx < width / 2; cx++) {
      const c = cy * (width / 2) + cx;
      if (!chroma[c]) continue;
      let sumA = 0, cb = 0, cr = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((2 * cy + dy) * width + 2 * cx + dx) * 4;
          const a = layer[i + 3];
          if (a === 0) continue;
          const r = layer[i], g = layer[i + 1], b = layer[i + 2];
          sumA += a;
          cb += a * (302833920 + 112 * (9278 * b - 2126 * r - 7152 * g));
          cr += a * (257007360 + 112 * (7874 * r - 7152 * g - 722 * b));
        }
      }
      if (sumA !== 1020) {
        cb += (1020 - sumA) * base[pixels + c] * 2365890;
        cr += (1020 - sumA) * base[pixels * 5 / 4 + c] * 2007870;
      }
      output[pixels + c] = Math.floor((2 * cb + 2413207800) / (2 * 2413207800));
      output[pixels * 5 / 4 + c] = Math.floor((2 * cr + 2048027400) / (2 * 2048027400));
    }
  }
  return output;
}
