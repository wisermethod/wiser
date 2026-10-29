import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { VERSION, builds, decode, dependencies, digest, expectedIdentity, fail, ff, identity, inspect, integer, local, options, publish, readFrame, run, sameSources, screen, strictJSON, text, withFrames } from './evidence-media.js';

export const EXACT_HELP = `Exact decoded frames (every flag required, once):
  node scripts/edit.js exact-frames --input <local.mp4> --sha256 <HEX>
    --requests <JSON-array> --output <new-directory>
  Requests: [{"ordinal":0},{"ordinal":0,"crop":[left,top,right,bottom]}]
  1..60 requests; zero-based decoded presentation ordinals; integer stored pixels,
  exclusive right/bottom; no clipping. Same ordinal/crop served once, all rows kept.
  Full frame and crop of one ordinal are distinct images. No --fps or rotation.
  Tagged progressive H.264 yuv420p BT.709 TV, square pixels, local MP4 only.
  PNGs + manifest.json + complete.json publish only after independent RGB decode.`;

// Explicit matrix/range conversion, no autorotation; crops operate AFTER RGB.
export const RGB_FILTER = 'scale=iw:ih:flags=bilinear+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24';
function requests(raw) {
  if (raw.length > 16384) fail('request JSON exceeds 16384 characters');
  const r = strictJSON(raw);
  if (!Array.isArray(r) || !r.length || r.length > 60) fail('request list must contain 1..60 requests');
  return r.map(v => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['ordinal', 'crop'].includes(k)) || typeof v.ordinal !== 'number') fail('each request has only numeric ordinal and optional crop');
    const ordinal = integer(v.ordinal, 'ordinal');
    let crop = null;
    if (Object.hasOwn(v, 'crop')) {
      if (!Array.isArray(v.crop) || v.crop.length !== 4 || v.crop.some(x => typeof x !== 'number')) fail('crop needs four integer stored-pixel edges');
      crop = v.crop.map(x => integer(x, 'crop edge', 0, 8192));
      if (crop[0] >= crop[2] || crop[1] >= crop[3]) fail('crop must have positive width and height');
    }
    return { ordinal, crop };
  });
}
function cropRGB(frame, width, crop) {
  const [l, t, r, b] = crop, out = Buffer.alloc((r - l) * (b - t) * 3);
  for (let y = t; y < b; y++) frame.copy(out, (y - t) * (r - l) * 3, (y * width + l) * 3, (y * width + r) * 3);
  return out;
}
export function exactFrames(argv) {
  const o = options(argv, ['input', 'sha256', 'requests', 'output']), wanted = requests(o.requests);
  const input = screen(o.input), output = screen(o.output, true);
  if (extname(input).toLowerCase() !== '.mp4') fail('exact-frames requires a local .mp4');
  dependencies();
  const before = expectedIdentity(input, o.sha256), info = inspect(input), size = info.width * info.height * 3;
  if (size * info.count > 64 * 1024 ** 3) fail('decoded RGB scratch exceeds 64 GiB');
  for (const r of wanted) {
    if (r.ordinal >= info.count) fail('requested ordinal is outside decoded frame count');
    if (r.crop && (r.crop[2] > info.width || r.crop[3] > info.height)) fail('crop is outside stored frame; clipping is refused');
  }
  const stage = mkdtempSync(join(dirname(output), '.wiser-video-exact-'));
  try {
    // This decode has no select/crop filter and is independent of PNG extraction.
    const raw = join(stage, 'reference.rgb'); decode(input, raw, 'rgb24', RGB_FILTER);
    if (statSync(raw).size !== size * info.count) fail('independent decoded source count changed');
    const unique = new Map(), files = {}, rows = [];
    withFrames([raw], fd => {
      wanted.forEach((r, index) => {
        const applied = r.crop ?? [0, 0, info.width, info.height], key = JSON.stringify([r.ordinal, r.crop]);
        let image = unique.get(key);
        if (!image) {
          const name = `image_${String(unique.size).padStart(6, '0')}_frame_${String(r.ordinal).padStart(6, '0')}.png`, p = join(stage, name);
          const filter = `${RGB_FILTER},select=eq(n\\,${r.ordinal}),crop=${applied[2] - applied[0]}:${applied[3] - applied[1]}:${applied[0]}:${applied[1]}:exact=1`;
          ff(['-noautorotate', ...local, '-i', input, '-map', '0:v:0', '-an', '-vf', filter, '-frames:v', '1', '-fps_mode', 'passthrough', '-c:v', 'png', '-threads:v', '1', '-f', 'image2', '-update', '1', p]);
          const png = readFileSync(p), width = applied[2] - applied[0], height = applied[3] - applied[1];
          if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) fail('PNG dimensions readback failed');
          const actual = run('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-f', 'png_pipe', '-i', p, '-frames:v', '1', '-pix_fmt', 'rgb24', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', '-'], true);
          const expected = cropRGB(readFrame(fd, size, r.ordinal), info.width, applied);
          if (!actual.equals(expected)) fail('independent decoded ordinal/crop pixel check failed');
          image = { path: name, ...identity(p), width, height, rgb_sha256: digest(actual), independent_decode_equal: true };
          unique.set(key, image); files[name] = { bytes: image.bytes, sha256: image.sha256 };
        }
        const frame = info.rows[r.ordinal];
        rows.push({ request_index: index, requested_ordinal: r.ordinal, actual_ordinal: frame.ordinal, pts: frame.pts, presentation_time: frame.time,
          requested_crop: r.crop, applied_crop: applied, image });
      });
    });
    const after = sameSources([input], [before])[0], record = { schema: 'video-exact-frames', version: 1, tool_version: VERSION,
      source: { path: input, expected_sha256: o.sha256, before, after },
      video: { stream: info.stream, decoded_frame_count: info.count, width: info.width, height: info.height, time_base: info.stream.time_base,
        first_displayed_pts: info.rows[0].pts, first_displayed_seconds: text(info.first), origin: 'first displayed picture', ordinal: 'zero-based decoded presentation order' },
      decoder: { ...builds(), autorotation: false, input_arguments: ['-noautorotate', ...local, '-i', input], rgb_filter: RGB_FILTER,
        verification: 'separate whole-source RGB decode without select/crop; byte compare every decoded PNG against integer RGB region' },
      duplicate_policy: 'same ordinal and crop served once; every request retained in input order', requests: rows,
      readback: { images: unique.size, requests: rows.length, every_image_independently_verified: true } };
    const result = publish(stage, output, record.schema, 'manifest.json', record, files, [input], [before], ['reference.rgb']);
    return { ok: true, output, operations: ['exact-frames'], ...result, frames: unique.size, requests: rows };
  } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }); }
}
