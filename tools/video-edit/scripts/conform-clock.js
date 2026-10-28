// Bounded linear FFT correlation; floating point is used only for signal
// analysis. Timestamp arithmetic and every time-policy comparison stay rational.
import { abs, add, cmp, neg, rat, text } from './conform.js';
const RATE = 48000, RADIUS = RATE, MIN = RATE / 4, RMS = 16 / 32768;
const fail = s => { throw new Error(`Error: conform: ${s}; supply unambiguous audio or correct the explicit policy.`); };
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let width = 2; width <= n; width *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / width, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += width) {
      let ar = 1, ai = 0;
      for (let j = 0; j < width / 2; j++) {
        const i = start + j, k = i + width / 2, br = re[k] * ar - im[k] * ai, bi = re[k] * ai + im[k] * ar;
        re[k] = re[i] - br; im[k] = im[i] - bi; re[i] += br; im[i] += bi;
        const next = ar * wr - ai * wi; ai = ar * wi + ai * wr; ar = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function dots(x, y, start, end, lo, hi) {
  const result = new Float64Array(hi - lo + 1);
  // Partition only the arithmetic, never the search or normalization. Linear
  // (zero-padded) convolution prevents circular aliases at a file/window edge.
  for (let s = start; s < end; s += 65536) {
    const e = Math.min(end, s + 65536), length = e - s;
    let n = 1; while (n < 2 * length + hi - lo - 1) n *= 2;
    const xr = new Float64Array(n), xi = new Float64Array(n), yr = new Float64Array(n), yi = new Float64Array(n);
    for (let j = 0; j < length; j++) xr[length - 1 - j] = x[s + j];
    for (let j = 0; j < length + hi - lo; j++) { const at = s + lo + j; if (at >= 0 && at < y.length) yr[j] = y[at]; }
    fft(xr, xi); fft(yr, yi);
    for (let i = 0; i < n; i++) { const re = xr[i] * yr[i] - xi[i] * yi[i]; xi[i] = xr[i] * yi[i] + xi[i] * yr[i]; xr[i] = re; }
    fft(xr, xi, true);
    for (let lag = lo; lag <= hi; lag++) result[lag - lo] += xr[length - 1 + lag - lo];
  }
  return result;
}
function energy(x) { const p = new Float64Array(x.length + 1); for (let i = 0; i < x.length; i++) p[i + 1] = p[i] + x[i] ** 2; return p; }
// Inclusive boundaries are exported for direct equality/one-unit-outside tests.
export function acceptMeasurement(peak, lag, floor, maximum) {
  if (!Number.isFinite(peak) || peak < Number(floor.n) / Number(floor.d)) fail('correlation peak below floor');
  if (cmp(abs(lag), maximum) > 0) fail('measured lag exceeds maximum offset');
  return { floor: { actual: peak, limit: text(floor), comparison: '>=', passed: true }, offset: { actual: text(abs(lag)), limit: text(maximum), comparison: '<=', passed: true } };
}
export function acceptDrift(lags, tolerance) {
  const ordered = [...lags].sort(cmp), spread = add(ordered.at(-1), neg(ordered[0]));
  if (cmp(spread, tolerance) > 0) fail('window lags spread beyond drift tolerance');
  return { actual: text(spread), limit: text(tolerance), comparison: '<=', passed: true };
}
export function correlate(x, y, policy, originDelta) {
  if (Math.min(x.length, y.length) < MIN) fail('too little audio overlap (minimum 0.25 seconds)');
  const xe = energy(x), ye = energy(y), width = Number(policy.window.n * BigInt(RATE) / policy.window.d);
  // Candidate integer sample shifts whose timestamp-corrected lag is in +/-1s.
  const floorDivide = (n, d) => n / d - (n < 0n && n % d ? 1n : 0n);
  const low = -BigInt(RADIUS) * originDelta.d - originDelta.n * BigInt(RATE);
  const high = BigInt(RADIUS) * originDelta.d - originDelta.n * BigInt(RATE);
  let lo = Number(-floorDivide(-low, originDelta.d)), hi = Number(floorDivide(high, originDelta.d));
  // Only the absolute overlap minimum can prune the search before checking
  // reference silence at the candidate's uncovered edges.
  lo = Math.max(lo, MIN - x.length);
  hi = Math.min(hi, y.length - MIN);
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi) fail('too little audio overlap within bounded lag search');
  const total = new Float64Array(hi - lo + 1), windows = [], candidates = [];
  for (let s = 0; s < x.length; s += width) {
    const e = Math.min(s + width, x.length), dot = dots(x, y, s, e, lo, hi);
    for (let j = 0; j < dot.length; j++) total[j] += dot[j];
    candidates.push({ s, e, dot });
  }
  function peak(s, e, dot) {
    const ranked = [];
    for (let shift = lo; shift <= hi; shift++) {
      const from = Math.max(s, -shift), until = Math.min(e, y.length - shift), count = until - from;
      if (count < MIN) continue;
      // Uncovered silence is not missing clock evidence. Test each uncovered
      // edge separately, so a loud missing fragment cannot hide in the other.
      const silent = (a, b) => a === b || (xe[b] - xe[a]) / (b - a) < RMS ** 2;
      const silentUncovered = silent(s, from) && silent(until, e);
      if (count * 100 < (e - s) * 95 && !silentUncovered) continue;
      const xx = xe[until] - xe[from], yy = ye[until + shift] - ye[from + shift];
      if (xx / count < RMS ** 2 || yy / count < RMS ** 2) continue;
      // Cauchy-Schwarz bounds the exact result to [-1,1]. Clamp FFT roundoff.
      const score = Math.min(1, Math.max(-1, dot[shift - lo] / Math.sqrt(xx * yy)));
      ranked.push({ lag_samples: shift, peak: score, overlap_samples: count, silent_uncovered_samples: silentUncovered ? e - s - count : 0 });
    }
    ranked.sort((a, b) => b.peak - a.peak);
    const best = ranked[0]; if (!best) fail('insufficient useful signal or overlap in analysis window');
    const runner = ranked.find(r => Math.abs(r.lag_samples - best.lag_samples) > 1), margin = runner ? best.peak - runner.peak : null;
    if (runner && margin < 0.000001) fail('ambiguous tie or near-tie between correlation peaks');
    const lag = add(originDelta, rat(BigInt(best.lag_samples), BigInt(RATE)));
    return { start_sample: s, end_sample: e, ...best, lag_seconds: text(lag), runner_up_peak: runner?.peak ?? null, peak_margin: margin,
      comparisons: acceptMeasurement(best.peak, lag, policy.floor, policy.offset) };
  }
  const whole = peak(0, x.length, total), lags = [];
  for (const { s, e, dot } of candidates) {
    // A short terminal remainder and genuinely silent windows are retained as
    // excluded evidence, never represented as a successful lag measurement.
    if (e - s < MIN || (xe[e] - xe[s]) / (e - s) < RMS ** 2) { windows.push({ start_sample: s, end_sample: e, excluded: e - s < MIN ? 'short-terminal' : 'silence' }); continue; }
    const measured = peak(s, e, dot); windows.push(measured);
    const [n, d] = measured.lag_seconds.split('/').map(BigInt); lags.push(rat(n, d));
  }
  if (!lags.length || x.length > width && lags.length < 2) fail('insufficient consecutive useful windows to establish drift');
  // Include whole-file lag in the spread: every useful window supports the same
  // constant-offset model, rather than a set of mutually shifted local fits.
  const [n, d] = whole.lag_seconds.split('/').map(BigInt);
  const drift = acceptDrift([...lags, rat(n, d)], policy.drift);
  return { algorithm: 'bounded-linear-fft-normalized-v2', rate: RATE, channel_policy: 'arithmetic mean of mono/stereo; refuse mean energy below 1% of strongest channel',
    normalization: 'dot / sqrt(overlapping signal energies); no gain, DC removal or time warp', minimum_rms: RMS, minimum_overlap_samples: MIN, minimum_overlap_fraction: '95/100',
    overlap_rule: 'at least 0.25 seconds; at least 95% of reference interval unless each uncovered edge has RMS below minimum_rms',
    search_seconds: ['-1/1', '1/1'], search_sample_shifts: [lo, hi], ambiguity_margin: 0.000001, ambiguity_exclusion_samples: 1,
    requested_window: text(policy.window), actual_window_samples: width, whole, windows, lag_samples: whole.lag_samples, lag_seconds: whole.lag_seconds, drift_seconds: drift.actual, drift_comparison: drift };
}
