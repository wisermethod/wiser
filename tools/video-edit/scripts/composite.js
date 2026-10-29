import { closeSync, existsSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { VERSION, builds, clock, cmp, decode, dependencies, digest, expectedIdentity, fail, ff, identity, inspect, integer, options, publish, readFrame, sameSources, screen, text, withFrames, writeAll } from './evidence-media.js';

export const COMPOSITE_HELP = `Timed silent video composite (required flags, once):
  node scripts/edit.js composite --base <local.mp4> --base-sha256 <HEX>
    --inset <local.mp4> --inset-sha256 <HEX> --output <new-directory>
    --start <s> --end <e> --inset-start <ordinal> --rect <left,top,right,bottom>
    --fit contain --border-colour <Y,U,V> [--border-width <even-pixels>]
  Active base interval [s,e); inset-start is shown at s. No position default.
  Chroma-aligned even edges/border, exclusive right/bottom, rectangle includes border.
  Fit keeps exact aspect on an even pixel grid; bars use declared TV-range YUV colour.
  Border width defaults to 0. No shadow, rounded corners, crop, audio or time stretch.
  Both inputs: progressive H.264 yuv420p BT.709 TV, square pixels, same exact CFR
  rate, zero first displayed PTS, no edit list. See TOOL.md for bounds.
  Lossless segment.mp4 + receipt.json + complete.json, independently sample-checked.`;

function tuple(raw, n, label, max) {
  const v = raw.split(','); if (v.length !== n) fail(`${label} needs ${n} comma-separated integers`);
  return v.map(x => integer(x, label, 0, max));
}
function geometry(rect, border, width, height, iw, ih) {
  const [l, t, r, b] = rect;
  if (rect.some(x => x % 2) || border % 2 || l >= r || t >= b || r > width || b > height) fail('rectangle/border must be on the chroma grid and inside base');
  const w = r - l - 2 * border, h = b - t - 2 * border;
  const gcd = (a, b) => b ? gcd(b, a % b) : a, divisor = gcd(iw, ih), a = iw / divisor, c = ih / divisor;
  // A multiple of the reduced aspect fits exactly, and an even multiplier keeps
  // both dimensions on 4:2:0's sample grid without distorting the aspect.
  const k = Math.floor(Math.min(w / a, h / c) / 2) * 2;
  if (w < 2 || h < 2 || k < 2) fail('unsupported geometry: no exact-aspect even inset fits inside border');
  const fw = a * k, fh = c * k;
  const x = l + border + 2 * Math.floor((w - fw) / 4), y = t + border + 2 * Math.floor((h - fh) / 4);
  return { rectangle: rect, border_width: border, fit: 'contain', fitted: [x, y, x + fw, y + fh], width: fw, height: fh,
    aspect_rule: 'largest even multiple of reduced inset aspect fitting interior; center down to even coordinates; surplus on right/bottom' };
}
function planes(w, h) { return [{ w, h, offset: 0, factor: 1 }, { w: w / 2, h: h / 2, offset: w * h, factor: 2 }, { w: w / 2, h: h / 2, offset: w * h * 5 / 4, factor: 2 }]; }
function paint(base, inset, width, height, g, colour) {
  const target = planes(width, height), source = planes(g.width, g.height);
  target.forEach((p, i) => {
    const f = p.factor, [l, t, r, b] = g.rectangle.map(x => x / f), [x, y] = g.fitted.map(x => x / f), s = source[i];
    for (let row = t; row < b; row++) base.fill(colour[i], p.offset + row * p.w + l, p.offset + row * p.w + r);
    for (let row = 0; row < s.h; row++) inset.copy(base, p.offset + (y + row) * p.w + x, s.offset + row * s.w, s.offset + (row + 1) * s.w);
  });
  return base;
}
// Independent per-sample oracle: no painting or copying code is reused here.
function verifyPixels(actual, base, inset, width, height, g, colour, active) {
  if (!active) { if (!actual.equals(base)) fail('readback equality outside active interval failed'); return; }
  const src = planes(g.width, g.height);
  for (const [i, p] of planes(width, height).entries()) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const bx = x * p.factor, by = y * p.factor, at = p.offset + y * p.w + x;
      const inRect = bx >= g.rectangle[0] && bx < g.rectangle[2] && by >= g.rectangle[1] && by < g.rectangle[3];
      const inFit = bx >= g.fitted[0] && bx < g.fitted[2] && by >= g.fitted[1] && by < g.fitted[3];
      const expected = !inRect ? base[at] : inFit ? inset[src[i].offset + (y - g.fitted[1] / p.factor) * src[i].w + x - g.fitted[0] / p.factor] : colour[i];
      if (actual[at] !== expected) fail(`readback decoded sample equality failed in plane ${i} at ${x},${y}`);
    }
  }
}
export function composite(argv) {
  const o = options(argv, ['base', 'base-sha256', 'inset', 'inset-sha256', 'output', 'start', 'end', 'inset-start', 'rect', 'fit', 'border-colour'], ['border-width']);
  const start = integer(o.start, '--start'), end = integer(o.end, '--end', 1), insetStart = integer(o['inset-start'], '--inset-start');
  if (start >= end) fail('active interval must be nonempty [start,end)');
  const rect = tuple(o.rect, 4, '--rect', 8192), border = integer(o['border-width'] ?? '0', '--border-width', 0, 8192), colour = tuple(o['border-colour'], 3, '--border-colour', 240);
  if (rect.some(x => x % 2) || border % 2) fail('rectangle/border must be on the chroma grid');
  if (colour[0] < 16 || colour[0] > 235 || colour[1] < 16 || colour[2] < 16) fail('border colour needs TV-range Y 16..235, U/V 16..240');
  if (o.fit !== 'contain') fail('only --fit contain is supported');
  const base = screen(o.base), inset = screen(o.inset), output = screen(o.output, true);
  if ([base, inset].some(p => extname(p).toLowerCase() !== '.mp4') || base === inset) fail('base/inset must be distinct local .mp4 files');
  dependencies(true);
  const paths = [base, inset], before = [expectedIdentity(base, o['base-sha256']), expectedIdentity(inset, o['inset-sha256'])];
  const b = inspect(base, true), i = inspect(inset, true), rate = clock(b, base), insetRate = clock(i, inset);
  if (cmp(rate, insetRate)) fail('base/inset rates differ');
  if (end > b.count || insetStart + end - start > i.count) fail('active interval outside base or inset too short');
  const g = geometry(rect, border, b.width, b.height, i.width, i.height), size = b.width * b.height * 3 / 2, insetSize = g.width * g.height * 3 / 2;
  if (4 * size * b.count + 2 * insetSize * i.count > 64 * 1024 ** 3) fail('composite planar scratch exceeds 64 GiB');
  const stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-'));
  const scratch = ['base.yuv', 'inset.yuv', 'composite.yuv', 'verify-base.yuv', 'verify-inset.yuv', 'verify-output.yuv'];
  try {
    const scale = `scale=${g.width}:${g.height}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv`;
    decode(base, join(stage, 'base.yuv'), 'yuv420p'); decode(inset, join(stage, 'inset.yuv'), 'yuv420p', scale);
    if (statSync(join(stage, 'base.yuv')).size !== size * b.count || statSync(join(stage, 'inset.yuv')).size !== insetSize * i.count) fail('decoded source count changed');
    const composed = join(stage, 'composite.yuv'), dest = openSync(composed, 'wx');
    try { withFrames([join(stage, 'base.yuv'), join(stage, 'inset.yuv')], (bf, inf) => {
      for (let n = 0; n < b.count; n++) {
        const frame = readFrame(bf, size, n);
        writeAll(dest, n >= start && n < end ? paint(frame, readFrame(inf, insetSize, insetStart + n - start), b.width, b.height, g, colour) : frame);
      }
    }); } finally { closeSync(dest); }
    const video = join(stage, 'segment.mp4');
    const settings = ['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${b.width}x${b.height}`, '-framerate', text(rate), '-i', composed,
      '-map', '0:v:0', '-an', '-frames:v', String(b.count), '-c:v', 'libx264', '-preset', 'medium', '-crf', '0', '-pix_fmt', 'yuv420p', '-threads:v', '1', '-bf', '0',
      '-vf', 'setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-video_track_timescale', String(b.tb.d),
      '-movflags', '+faststart', '-use_editlist', '0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', video];
    ff(settings);
    const v = inspect(video, true), vr = clock(v, video);
    if (v.width !== b.width || v.height !== b.height || v.count !== b.count || cmp(vr, rate) || cmp(v.tb, b.tb)) fail('output intermediate geometry/count/clock changed');
    decode(base, join(stage, 'verify-base.yuv'), 'yuv420p'); decode(inset, join(stage, 'verify-inset.yuv'), 'yuv420p', scale); decode(video, join(stage, 'verify-output.yuv'), 'yuv420p');
    for (const [name, expected] of [['verify-base.yuv', size * b.count], ['verify-inset.yuv', insetSize * i.count], ['verify-output.yuv', size * b.count]]) if (statSync(join(stage, name)).size !== expected) fail('independent decoded frame count differs');
    const frameHashes = [];
    withFrames(['verify-base.yuv', 'verify-inset.yuv', 'verify-output.yuv'].map(p => join(stage, p)), (bf, inf, out) => {
      for (let n = 0; n < b.count; n++) {
        const active = n >= start && n < end, actual = readFrame(out, size, n);
        verifyPixels(actual, readFrame(bf, size, n), active ? readFrame(inf, insetSize, insetStart + n - start) : null, b.width, b.height, g, colour, active);
        frameHashes.push(digest(actual));
      }
    });
    const after = sameSources(paths, before), outId = identity(video), record = { schema: 'video-composite', version: 1, tool_version: VERSION,
      inputs: Object.fromEntries(['base', 'inset'].map((name, n) => [name, { path: paths[n], expected_sha256: o[`${name}-sha256`], before: before[n], after: after[n] }])),
      clocks: { base: { stream: b.stream, frames: b.count, first_pts: b.rows[0].pts }, inset: { stream: i.stream, frames: i.count, first_pts: i.rows[0].pts }, rate: text(rate), time_base: b.stream.time_base },
      mapping: { active_interval: [start, end], inset_start: insetStart, rule: 'base n shows inset inset_start+n-start iff start<=n<end' },
      geometry: g, footprint: { rectangle: rect, pixel_format: 'yuv420p', chroma_grid: [2, 2], border_included: true },
      treatment: { scale, border_colour_yuv: colour, autorotation: false, shadow: false, rounded_corners: false, audio: 'refused', colour_conversion: 'none; scale in BT.709 TV planar YUV' },
      encoder: { ...builds(), settings: settings.map(a => a === composed ? 'composite.yuv' : a === video ? 'segment.mp4' : a) },
      decoder: { input_arguments: ['-noautorotate', 'forced mov, file/pipe only, external data references disabled'], pixel_format: 'yuv420p',
        verification: 'separate base/inset/output decodes; every planar sample compared against interval/footprint/scaled-inset oracle' },
      output: { file: 'segment.mp4', identity: outId }, readback: { checks: ['silent-intermediate', 'base-size-rate-clock-count', 'outside-interval-equal', 'outside-footprint-equal', 'scaled-inset-and-border-equal', 'sources-unchanged'], frames: b.count, frame_sha256: frameHashes } };
    const result = publish(stage, output, record.schema, 'receipt.json', record, { 'segment.mp4': outId }, paths, before, scratch);
    return { ok: true, output, operations: ['composite'], segment: join(output, 'segment.mp4'), ...result, ...outId, frames: b.count, fps: text(rate), active_interval: [start, end], footprint: rect };
  } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }); }
}
