// composite-alpha's read-back verifier. It recomputes every sample of a composed
// yuv420p frame from composite-alpha-policy/1 and composite-alpha-support/1 and
// shares no code with alpha-blend.js: luma as Y_b + alpha(Y_l - Y_b) and chroma as
// C_b + sum(alpha_i/4)(C_i - C_b), in exact integers, rounded half up by remainder.
const LUMA_DEN = 255 * 2550000;
const CB_SCALE = 255 * 9278, CB_DEN = 1020 * CB_SCALE;
const CR_SCALE = 255 * 7874, CR_DEN = 1020 * CR_SCALE;

function halfUp(num, den) {
  let q = Math.floor(num / den), r = num - q * den;
  while (r < 0) { q--; r += den; }
  while (r >= den) { q++; r -= den; }
  return 2 * r >= den ? q + 1 : q;
}

// The first sample of `actual` that differs from the policy's result, or null.
export function verifyFrame(actual, base, layer, width, height) {
  const luma = width * height, quarter = luma / 4, half = width / 2;
  if (actual.length !== luma * 3 / 2 || base.length !== luma * 3 / 2 || layer.length !== luma * 4) return { plane: 'size', x: 0, y: 0, protected: false };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, a = layer[p * 4 + 3];
      let want = base[p];
      if (a !== 0) {
        const r = layer[p * 4], g = layer[p * 4 + 1], b = layer[p * 4 + 2];
        const scaled = 16 * 2550000 + 219 * (2126 * r + 7152 * g + 722 * b);
        want = halfUp(base[p] * LUMA_DEN + a * (scaled - base[p] * 2550000), LUMA_DEN);
      }
      if (actual[p] !== want) return { plane: 'Y', x, y, protected: a === 0 };
    }
  }
  for (let cy = 0; cy < height / 2; cy++) {
    for (let cx = 0; cx < half; cx++) {
      const c = cy * half + cx, u = base[luma + c], v = base[luma + quarter + c];
      let du = 0, dv = 0, touched = false;
      for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((2 * cy + py) * width + 2 * cx + px) * 4, a = layer[i + 3];
        if (a === 0) continue;
        touched = true;
        const r = layer[i], g = layer[i + 1], b = layer[i + 2];
        du += a * (128 * CB_SCALE + 112 * (9278 * b - 2126 * r - 7152 * g) - u * CB_SCALE);
        dv += a * (128 * CR_SCALE + 112 * (7874 * r - 7152 * g - 722 * b) - v * CR_SCALE);
      }
      const wantU = touched ? halfUp(u * CB_DEN + du, CB_DEN) : u, wantV = touched ? halfUp(v * CR_DEN + dv, CR_DEN) : v;
      if (actual[luma + c] !== wantU) return { plane: 'U', x: cx, y: cy, protected: !touched };
      if (actual[luma + quarter + c] !== wantV) return { plane: 'V', x: cx, y: cy, protected: !touched };
    }
  }
  return null;
}
