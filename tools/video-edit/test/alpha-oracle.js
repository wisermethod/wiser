// Independent test oracle, derived only from composite-alpha-policy/1's
// definitions (Kr/Kg/Kb, conversion, alpha-over and the four-pixel box).
// Deliberately uses rational pairs rather than the policy's integer form.
function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
}
export function rational(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (!d) throw new RangeError('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return [n / g, d / g];
}
const add = (a, b) => rational(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a, b) => rational(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => rational(a[0] * b[0], a[1] * b[1]);
const div = (a, b) => rational(a[0] * b[1], a[1] * b[0]);
const one = rational(1), four = rational(4);
export function roundHalfUp([n, d]) {
  if (n < 0n) throw new RangeError('policy samples must be nonnegative');
  const whole = n / d, remainder = n % d;
  return Number(whole + (remainder * 2n >= d ? 1n : 0n));
}
export function convert(r, g, b) {
  const kr = rational(2126, 10000), kg = rational(7152, 10000), kb = rational(722, 10000);
  const er = rational(r, 255), eg = rational(g, 255), eb = rational(b, 255);
  const ey = add(add(mul(kr, er), mul(kg, eg)), mul(kb, eb));
  return [add(rational(16), mul(rational(219), ey)),
    add(rational(128), mul(rational(112), div(sub(eb, ey), sub(one, kb)))),
    add(rational(128), mul(rational(112), div(sub(er, ey), sub(one, kr))))];
}
export function alphaOracle(base, width, height, rgba) {
  const pixels = width * height;
  if (width % 2 || height % 2 || base.length !== pixels * 3 / 2 || rgba.length !== pixels * 4) throw new RangeError('whole 4:2:0 frame required');
  const output = Buffer.from(base), colours = new Array(pixels), alphas = new Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const a = rgba[i * 4 + 3];
    alphas[i] = rational(a, 255);
    // In particular, do not read RGB under alpha zero into a chroma filter.
    if (!a) continue;
    colours[i] = convert(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    output[i] = roundHalfUp(add(mul(sub(one, alphas[i]), rational(base[i])), mul(alphas[i], colours[i][0])));
  }
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const indices = [y * width + x, y * width + x + 1, (y + 1) * width + x, (y + 1) * width + x + 1];
    const averageAlpha = div(indices.reduce((sum, i) => add(sum, alphas[i]), rational(0)), four);
    if (averageAlpha[0] === 0n) continue;
    for (let plane = 1; plane < 3; plane++) {
      const p = div(indices.reduce((sum, i) => colours[i] ? add(sum, mul(alphas[i], colours[i][plane])) : sum, rational(0)), four);
      const at = pixels + (plane - 1) * pixels / 4 + (y / 2) * (width / 2) + x / 2;
      output[at] = roundHalfUp(add(p, mul(sub(one, averageAlpha), rational(base[at]))));
    }
  }
  return output;
}

// Support is independently enumerated from the input alpha, never imported
// from either production implementation. 1 means the sample is protected.
export function protectedSamples(width, height, rgba) {
  const pixels = width * height, mask = new Uint8Array(pixels * 3 / 2).fill(1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!rgba[(y * width + x) * 4 + 3]) continue;
    mask[y * width + x] = 0;
    const block = Math.floor(y / 2) * (width / 2) + Math.floor(x / 2);
    mask[pixels + block] = 0; mask[pixels * 5 / 4 + block] = 0;
  }
  return mask;
}
