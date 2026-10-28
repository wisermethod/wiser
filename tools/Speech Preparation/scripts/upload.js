// The upload-only implementation. No media dependency is checked at import.
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { dependencies, measure, run, screen, strictJSON } from './speech.js';

const VERSION = '0.2.0';
const LIMIT = 256 * 1024 * 1024;
const fail = message => { throw new Error(`${message}; check the inputs and retry to a fresh bundle.`); };
const positive = text => typeof text === 'string' && /^[1-9][0-9]*$/.test(text) && Number.isSafeInteger(Number(text));
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function fraction(n, d) {
  const g = gcd(n < 0n ? -n : n, d);
  return { numerator: String(n / g), denominator: String(d / g) };
}
export function seconds(text) {
  if (typeof text !== 'string' || text.length > 128 || !/^(?:[0-9]+(?:\.[0-9]+)?|[0-9]+\/[1-9][0-9]*)$/.test(text)) fail('Seconds must be nonnegative decimals or integer fractions');
  let n, d;
  if (text.includes('/')) [n, d] = text.split('/').map(BigInt);
  else {
    const [whole, part = ''] = text.split('.'); d = 10n ** BigInt(part.length); n = BigInt(whole) * d + BigInt(part || '0');
  }
  return { requested: text, ...fraction(n, d) };
}
export function atSample(time, rate) {
  const n = BigInt(time.numerator) * BigInt(rate), d = BigInt(time.denominator);
  const rounded = (2n * n + d) / (2n * d);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) fail('Sample count exceeds the exact integer range');
  return Number(rounded);
}
const actualTime = (samples, rate) => fraction(BigInt(samples), BigInt(rate));
function reading(time, rate) {
  const samples = atSample(time, rate);
  return { ...time, samples, actual_seconds: actualTime(samples, rate), rounding_error_seconds:
    fraction(BigInt(samples) * BigInt(time.denominator) - BigInt(time.numerator) * BigInt(rate), BigInt(rate) * BigInt(time.denominator)) };
}

export function options(o) {
  if (!/^[a-fA-F0-9]{64}$/.test(o['--sha256'] ?? '')) fail('--sha256 must be 64 hexadecimal digits');
  if (!positive(o['--max-bytes'])) fail('--max-bytes must be a positive safe integer');
  if (!['mp3', 'wav'].includes(o['--recipe'])) fail('--recipe must be mp3 or wav');
  const whole = ['--lead', '--tail'], span = ['--start', '--end', '--pre-guard', '--post-guard'];
  const a = whole.some(k => k in o), b = span.some(k => k in o);
  if (a === b || !(a ? whole : span).every(k => k in o)) fail('Choose all of --lead/--tail or all of --start/--end/--pre-guard/--post-guard, without mixing them');
  const times = Object.fromEntries((a ? whole : span).map(k => [k.slice(2).replaceAll('-', '_'), seconds(o[k])]));
  if (b && BigInt(times.start.numerator) * BigInt(times.end.denominator) >= BigInt(times.end.numerator) * BigInt(times.start.denominator)) fail('Source span must be nonempty');
  return { mode: a ? 'whole' : 'span', times, recipe: o['--recipe'], ceiling: Number(o['--max-bytes']), expected: o['--sha256'].toLowerCase() };
}

// Strict RIFF lengths catch truncated/extra bytes which a tolerant demuxer may
// accept. Only uncompressed little-endian PCM16 (including extensible PCM) enters.
export function wav(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) fail('Malformed or truncated RIFF WAV');
  let fmt, data;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) fail('Truncated WAV chunk header');
    const size = bytes.readUInt32LE(at + 4), end = at + 8 + size;
    if (end + size % 2 > bytes.length) fail('Truncated WAV chunk');
    const kind = bytes.toString('ascii', at, at + 4), part = bytes.subarray(at + 8, end);
    if (kind === 'fmt ') { if (fmt) fail('Duplicate WAV format'); fmt = part; }
    if (kind === 'data') { if (data) fail('Duplicate WAV data'); data = part; }
    at = end + size % 2;
  }
  if (!fmt || fmt.length < 16 || !data?.length) fail('WAV needs one format and nonempty data chunk');
  const tag = fmt.readUInt16LE(0), channels = fmt.readUInt16LE(2), rate = fmt.readUInt32LE(4), align = fmt.readUInt16LE(12);
  const extensible = tag === 65534 && fmt.length >= 40 && fmt.readUInt16LE(16) >= 22 && fmt.readUInt16LE(18) === 16 &&
    fmt.subarray(24, 40).toString('hex') === '0100000000001000800000aa00389b71';
  if (!(tag === 1 || extensible) || fmt.readUInt16LE(14) !== 16 || !channels || !rate || align !== channels * 2 || fmt.readUInt32LE(8) !== rate * align || data.length % align) fail('Source must be valid signed 16-bit PCM on a whole sample clock');
  return { rate, channels, sample_count: data.length / align, data, format: fmt, channel_mask: extensible ? fmt.readUInt32LE(20) : null };
}
function wave(data, format) {
  // Retain the format extension and speaker mask. Inferring layout from channel
  // count can turn 3.0 center speech into a 2.1 subwoofer and lose it in mono.
  const header = Buffer.alloc(12), fmt = Buffer.alloc(8 + format.length + format.length % 2), body = Buffer.alloc(8);
  header.write('RIFF'); header.writeUInt32LE(4 + fmt.length + body.length + data.length, 4); header.write('WAVE', 8);
  fmt.write('fmt '); fmt.writeUInt32LE(format.length, 4); format.copy(fmt, 8);
  body.write('data'); body.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, fmt, body, data]);
}
const local = format => ['-protocol_whitelist', 'file,pipe', '-f', format];
function probe(path, format) {
  const p = strictJSON(run('ffprobe', ['-v', 'error', ...local(format), '-show_streams', '-show_format', '-of', 'json', path]));
  if (p.format?.format_name !== format || p.streams?.length !== 1 || p.streams[0].codec_type !== 'audio') fail('Readback requires the declared container and exactly one audio stream');
  return p.streams[0];
}
function decode(path, format, output, mono = false) {
  const args = ['-nostdin', '-n', '-v', 'error', '-xerror', ...local(format), '-i', path, '-map', '0:a:0',
    ...(mono ? ['-ac', '1'] : []), '-c:a', 'pcm_s16le', '-f', 's16le', output];
  run('ffmpeg', args, true);
  return readFileSync(output);
}
function sample(data, i) { return data.readInt16LE(i * 2) / 32768; }

// Read the encoder's Xing/LAME extension, not a guessed universal delay. The
// recipe disables ID3v2, so the first MPEG frame must start at byte zero.
function gaplessTag(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || (bytes[1] & 224) !== 224 || (bytes[1] & 6) !== 2) fail('Missing MP3 first-frame header');
  const version = (bytes[1] >> 3) & 3, mono = (bytes[3] >> 6) === 3;
  if (version === 1) fail('Reserved MP3 version');
  const side = version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  let at = 4 + ((bytes[1] & 1) ? 0 : 2) + side;
  if (!['Xing', 'Info'].includes(bytes.toString('ascii', at, at + 4)) || at + 8 > bytes.length) fail('Missing MP3 gapless Xing/Info frame');
  const flags = bytes.readUInt32BE(at + 4); at += 8;
  for (const [flag, size] of [[1, 4], [2, 4], [4, 100], [8, 4]]) if (flags & flag) at += size;
  if (at + 24 > bytes.length || !/^(?:LAME|Lavc|Lavf)/.test(bytes.toString('ascii', at, at + 9))) fail('Missing MP3 encoder delay extension');
  const packed = bytes.readUIntBE(at + 21, 3);
  return { encoder_identifier: bytes.toString('ascii', at, at + 9), encoder_priming_samples: packed >> 12, encoder_end_padding_samples: packed & 4095 };
}

// Every selected window has real samples over the entire stated lag domain.
// Divide eligible start positions into thirds so the three witnesses are distinct.
export function clock(reference, decoded, retainedStart = 0, retainedEnd = reference.length / 2) {
  const n = reference.length / 2, radius = 4096, windowSize = 4096, margin = 0.000001;
  if (decoded.length !== reference.length || !Number.isInteger(n)) fail('Decoded sample count differs from padded source');
  const firstStart = Math.max(radius, retainedStart), lastStart = Math.min(n - radius - windowSize, retainedEnd - windowSize);
  const positions = lastStart - firstStart + 1;
  if (positions < 3) fail('Decoded clock cannot be established: source too short for three distinct inset windows');
  const x = Float64Array.from({ length: n }, (_, i) => sample(reference, i));
  const y = Float64Array.from({ length: n }, (_, i) => sample(decoded, i));
  // Fixed zero-lag edges close period aliases outside the inset witness grid.
  const edgeChecks = [0, n - windowSize].map(start => {
    let xx = 0, yy = 0, dot = 0;
    for (let j = 0; j < windowSize; j++) { const a = x[start + j], b = y[start + j]; xx += a * a; yy += b * b; dot += a * b; }
    const referenceRMS = Math.sqrt(xx / windowSize) * 32768, decodedRMS = Math.sqrt(yy / windowSize) * 32768;
    const referenceSilent = referenceRMS < 16, decodedSilent = decodedRMS < 16;
    const peak = xx && yy ? dot / Math.sqrt(xx * yy) : null;
    if (referenceSilent !== decodedSilent || !referenceSilent && peak < 0.90) fail('Decoded clock cannot be established: zero-lag edge mismatch');
    return { start_sample: start, sample_count: windowSize, reference_rms_pcm16: referenceRMS, decoded_rms_pcm16: decodedRMS, peak, both_silent: referenceSilent && decodedSilent };
  });
  const windows = [];
  for (let third = 0; third < 3; third++) {
    // An early short witness must see the onset rather than letting a later
    // loud periodic block conceal missing leading samples.
    const width = third === 0 ? 512 : windowSize;
    const from = firstStart + Math.floor(third * positions / 3), until = firstStart + Math.floor((third + 1) * positions / 3);
    let start = from, energy = -1;
    for (let at = from; at < until; at += width) {
      let e = 0;
      for (let j = 0; j < width; j++) e += x[at + j] ** 2;
      if (e > energy) { start = at; energy = e; }
      if (third === 0 && e / width >= (16 / 32768) ** 2) break;
    }
    if (energy / width < (16 / 32768) ** 2) continue;
    const score = (signal, lag) => {
      let dot = 0, yy = 0;
      for (let j = 0; j < width; j++) {
        const a = x[start + j], b = signal[start + j + lag];
        dot += a * b; yy += b * b;
      }
      return yy ? dot / Math.sqrt(energy * yy) : -1;
    };
    const referenceEdges = [-radius, radius].map(lag => ({ lag, peak: score(x, lag) }));
    if (referenceEdges.some(s => 1 - s.peak <= margin)) fail('Decoded clock cannot be established: ambiguous reference autocorrelation at search edge');
    const scores = [];
    for (let lag = -radius; lag <= radius; lag++) scores.push({ lag, peak: score(y, lag) });
    const searchLags = [scores[0].lag, scores.at(-1).lag], scoredLags = scores.length;
    scores.sort((a, b) => b.peak - a.peak);
    // Adjacent samples are rivals too: a broad unresolved peak proves no clock.
    const best = scores[0], runner = scores[1];
    if (!best || best.peak < 0.90 || runner && best.peak - runner.peak < margin) fail('Decoded clock cannot be established by unambiguous cross-correlation');
    if (Math.abs(best.lag) > 0) fail(`Decoded clock lag ${best.lag} samples exceeds zero-sample tolerance`);
    windows.push({ start_sample: start, sample_count: width, ...best, search_lags: searchLags, scored_lags: scoredLags, runner_up_peak: runner?.peak ?? null, reference_edge_peaks: referenceEdges });
  }
  if (windows.length < 3) fail('Decoded clock cannot be established from silence or insufficient signal in three distinct windows');
  const measured = windows.map(w => w.lag).sort((a, b) => a - b);
  return { algorithm: 'thirds-normalized-xcorr-v2', search_radius_samples: radius, window_samples: windowSize, onset_window_samples: 512,
    retained_span: [retainedStart, retainedEnd], edge_checks: edgeChecks, minimum_rms_pcm16: 16, minimum_peak: 0.90, ambiguity_margin: margin, ambiguity_exclusion_samples: 0,
    tolerance_samples: 0, lag_samples: measured[1], peak: Math.min(...windows.map(w => w.peak)), windows };
}

function mapping(start, end, pre, lag) {
  return { rule: 'source_sample = upload_sample + source_sample_at_upload_zero',
    source_sample_at_upload_zero: start - pre - lag, source_zero_at_upload_sample: pre - start + lag,
    retained_upload_start: pre + lag, retained_upload_end: pre + lag + end - start,
    retained_source_start: start, retained_source_end: end, residual_lag_samples: lag };
}
// Recompute from measured facts, rather than trusting a receipt's own mapping
// or size. Kept callable so controls can plant bad evidence without CLI backdoors.
export function checkReceipt(receipt, facts) {
  if (!isDeepStrictEqual(receipt.mapping, mapping(facts.start, facts.end, facts.pre, facts.lag))) fail('Receipt mapping differs from measured source/padding/decoded clock');
  if (!isDeepStrictEqual(receipt.upload.identity, facts.upload)) fail('Receipt upload byte identity differs from written file');
  if (facts.upload.bytes > receipt.byte_ceiling) fail(`Upload is ${facts.upload.bytes} bytes, exceeding inclusive ceiling ${receipt.byte_ceiling}`);
}
function writeJSON(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }

export function upload(o) {
  const policy = options(o); // All value conflicts precede dependencies or reads.
  const input = screen(o['--input']), output = screen(o['--output'], true);
  if (extname(input).toLowerCase() !== '.wav') fail('upload requires a .wav source');
  if (statSync(input).size > LIMIT) fail('Source exceeds the 256 MiB operating bound');
  dependencies();
  const ffmpeg = run('ffmpeg', ['-version']), ffprobe = run('ffprobe', ['-version']);
  if (policy.recipe === 'mp3' && !/^\s*A\S*\s+libmp3lame\s/m.test(run('ffmpeg', ['-v', 'error', '-encoders']))) fail('Missing libmp3lame encoder; check: ffmpeg -encoders');
  const before = measure(input).identity;
  if (before.sha256 !== policy.expected) fail('Source SHA-256 differs from expected identity');
  const original = wav(readFileSync(input)), { rate, channels, sample_count: total } = original;
  const sourceStream = probe(input, 'wav');
  if (sourceStream.codec_name !== 'pcm_s16le' || Number(sourceStream.sample_rate) !== rate || sourceStream.channels !== channels || sourceStream.time_base !== `1/${rate}` || sourceStream.duration_ts !== total) fail('Source decoder clock differs from PCM WAV chunks');
  if (policy.recipe === 'mp3' && ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(rate)) fail('MP3 recipe cannot preserve this source rate');
  const times = Object.fromEntries(Object.entries(policy.times).map(([k, t]) => [k, reading(t, rate)]));
  if (policy.mode === 'span' && BigInt(times.end.numerator) * BigInt(rate) > BigInt(total) * BigInt(times.end.denominator)) fail('Requested span is outside source');
  const start = policy.mode === 'whole' ? 0 : times.start.samples, end = policy.mode === 'whole' ? total : times.end.samples;
  const pre = (times.lead ?? times.pre_guard).samples, post = (times.tail ?? times.post_guard).samples;
  if (end <= start || start < 0 || end > total) fail('Rounded source span must be nonempty and inside source');
  const count = pre + end - start + post, byteCount = count * channels * 2;
  if (!Number.isSafeInteger(byteCount) || byteCount + 28 + original.format.length + original.format.length % 2 > LIMIT) fail('Padded PCM exceeds the 256 MiB operating bound');
  const expectedPCM = Buffer.alloc(byteCount);
  original.data.copy(expectedPCM, pre * channels * 2, start * channels * 2, end * channels * 2);
  const stage = mkdtempSync(join(dirname(output), '.wiser-speech-upload-'));
  try {
    const padded = join(stage, 'padded.wav'), uploadName = `upload.${policy.recipe}`, encoded = join(stage, uploadName);
    writeFileSync(padded, wave(expectedPCM, original.format), { flag: 'wx' });
    const paddedStream = probe(padded, 'wav');
    if (paddedStream.channel_layout !== sourceStream.channel_layout || paddedStream.channels !== channels || Number(paddedStream.sample_rate) !== rate) fail('Padded PCM changed source channel layout or clock');
    const settings = ['-nostdin', '-n', '-v', 'error', '-xerror', ...local('wav'), '-i', padded, '-map', '0:a:0',
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
      ...(policy.recipe === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '64k', '-abr', '0', '-ac', '1', '-ar', String(rate), '-write_xing', '1', '-id3v2_version', '0'] : ['-c:a', 'pcm_s16le']), encoded];
    run('ffmpeg', settings, true);
    const back = probe(encoded, policy.recipe), outChannels = policy.recipe === 'mp3' ? 1 : channels;
    if (back.codec_name !== (policy.recipe === 'mp3' ? 'mp3' : 'pcm_s16le') || Number(back.sample_rate) !== rate || back.channels !== outChannels) fail('Upload readback changed codec, rate or channels');
    if (policy.recipe === 'wav' && back.channel_layout !== sourceStream.channel_layout) fail('WAV readback changed source channel layout');
    const decodedPath = join(stage, 'decoded.s16le'), referencePath = join(stage, 'reference.s16le');
    const decoded = decode(encoded, policy.recipe, decodedPath);
    if (decoded.length !== count * outChannels * 2) fail('Decoded sample count differs from padded source');
    const reference = decode(padded, 'wav', referencePath, policy.recipe === 'mp3');
    if (policy.recipe === 'wav' && !decoded.equals(expectedPCM)) fail('WAV readback changed retained samples or silence');
    // For multichannel lossless WAV use the highest-energy channel, avoiding a
    // phase-cancelling downmix. MP3 uses the encoder's actual mono conversion.
    let x = reference, y = decoded, analysisChannel = null;
    if (outChannels > 1) {
      const energies = Array(outChannels).fill(0);
      for (let i = 0; i < count; i++) for (let c = 0; c < outChannels; c++) energies[c] += sample(reference, i * outChannels + c) ** 2;
      analysisChannel = energies.indexOf(Math.max(...energies)); x = Buffer.alloc(count * 2); y = Buffer.alloc(count * 2);
      for (let i = 0; i < count; i++) {
        x.writeInt16LE(reference.readInt16LE((i * outChannels + analysisChannel) * 2), i * 2);
        y.writeInt16LE(decoded.readInt16LE((i * outChannels + analysisChannel) * 2), i * 2);
      }
    }
    const correlation = clock(x, y, pre, pre + end - start);
    const packets = policy.recipe === 'mp3' ? strictJSON(run('ffprobe', ['-v', 'error', ...local('mp3'), '-show_packets', '-show_entries', 'packet=pts,duration:packet_side_data', '-of', 'json', encoded])).packets : [];
    const skips = packets.flatMap(p => p.side_data_list ?? []).filter(s => s.side_data_type === 'Skip Samples');
    if (policy.recipe === 'mp3' && (!skips.length || skips.some(s => !Number.isSafeInteger(s.skip_samples) || s.skip_samples < 0 || !Number.isSafeInteger(s.discard_padding) || s.discard_padding < 0))) fail('MP3 gapless skip/end-padding metadata is missing or invalid');
    const headerSkip = skips.reduce((n, s) => n + s.skip_samples, 0);
    if (correlation.windows.some(w => -headerSkip < w.search_lags[0] || headerSkip > w.search_lags[1])) fail('MP3 header skip exceeds the searched clock radius');
    const gapless = policy.recipe === 'mp3' ? gaplessTag(readFileSync(encoded)) : null;
    if (policy.recipe === 'mp3') {
      const [tbN, tbD] = back.time_base.split('/').map(BigInt);
      const ticks = packets.reduce((n, p) => {
        if (!Number.isSafeInteger(p.duration) || p.duration <= 0) fail('Invalid MP3 packet duration');
        return n + BigInt(p.duration);
      }, 0n);
      // Count identities only. Position is witnessed by all three clock windows.
      const removed = skips.reduce((n, s) => n + s.skip_samples + s.discard_padding, 0);
      if (ticks * tbN * BigInt(rate) !== BigInt(count + removed) * tbD) fail('MP3 packet clock, skip and end padding do not explain decoded count');
      const decoderPriming = skips.reduce((n, s) => n + s.skip_samples, 0) - gapless.encoder_priming_samples;
      if (decoderPriming < 0 || gapless.encoder_end_padding_samples - decoderPriming !== skips.reduce((n, s) => n + s.discard_padding, 0)) fail('MP3 encoder priming/end padding differs from decoder header correction');
      gapless.decoder_priming_samples = decoderPriming;
      if (Number(back.bit_rate) !== 64000) fail('MP3 readback did not retain 64 kbit/s bitrate');
    }
    const identity = measure(encoded).identity, paddedIdentity = measure(padded).identity, after = measure(input).identity;
    if (!isDeepStrictEqual(before, after)) fail(`Source changed during preparation: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
    const beforeTime = times.lead ?? times.pre_guard, beforeDenominator = BigInt(beforeTime.denominator);
    const placementCeil = (BigInt(beforeTime.numerator) * 48000n + beforeDenominator - 1n) / beforeDenominator;
    const receipt = { schema: 'speech-upload', version: 1, tool_version: VERSION,
      source: { path: input, expected_sha256: policy.expected, before, after, rate, channels, channel_layout: sourceStream.channel_layout ?? null, channel_mask: original.channel_mask, sample_count: total },
      mode: policy.mode, sample_rule: 'nearest sample, ties upward; exact nonnegative rational seconds', times,
      span: { start_sample: start, end_sample: end, start_seconds: actualTime(start, rate), end_seconds: actualTime(end, rate) },
      silence: { kind: 'inserted-zero-pcm', before_samples: pre, after_samples: post },
      recipe: policy.recipe, byte_ceiling: policy.ceiling,
      encoder: { name: policy.recipe === 'mp3' ? 'libmp3lame' : 'pcm_s16le', ffmpeg_version: ffmpeg,
        settings: settings.map(a => a === padded ? 'padded.wav' : a === encoded ? uploadName : a), bitrate_bits_per_second: policy.recipe === 'mp3' ? 64000 : null,
        rate, channels: outChannels, normalization: false, resampling: false },
      padded: { file: 'padded.wav', identity: paddedIdentity, rate, channels, channel_layout: paddedStream.channel_layout ?? null, sample_count: count },
      upload: { file: uploadName, identity },
      readback: { ffprobe_version: ffprobe, ffmpeg_version: ffmpeg, container: policy.recipe, stream: back,
        codec: back.codec_name, rate, channels: outChannels, sample_count: decoded.length / (2 * outChannels), decoded_time_base: `1/${rate}`, decoded_origin_sample: 0,
        correlation: { ...correlation, channel: analysisChannel, channel_policy: policy.recipe === 'mp3' ? 'FFmpeg mono conversion matching encoder' : 'highest-energy original channel' },
        delay: { treatment: 'FFmpeg applies gapless header skip and discard once; no manual correction', packet_skip_samples: skips,
          encoder_tag: gapless, encoder_priming_samples: gapless?.encoder_priming_samples ?? 0,
          decoder_priming_samples: gapless?.decoder_priming_samples ?? 0,
          header_skip_samples: skips.reduce((n, s) => n + s.skip_samples, 0), end_padding_samples: skips.reduce((n, s) => n + s.discard_padding, 0),
          resampler_delay_samples: 0, residual_decoded_displacement_samples: correlation.lag_samples } },
      mapping: mapping(start, end, pre, correlation.lag_samples),
      placement_48000: { source_zero_at_upload_seconds: actualTime(pre - start, rate),
        // This comparison is a rational reading, never an audio conversion.
        before_at_48000_samples: fraction(BigInt(pre) * 48000n, BigInt(rate)),
        requested_before_ceil_48000_samples: String(placementCeil),
        before_minus_requested_ceil_48000_samples: fraction(BigInt(pre) * 48000n - placementCeil * BigInt(rate), BigInt(rate)) } };
    const receiptPath = join(stage, 'receipt.json'); writeJSON(receiptPath, receipt);
    checkReceipt(strictJSON(readFileSync(receiptPath, 'utf8')), { start, end, pre, lag: correlation.lag_samples, upload: measure(encoded).identity });
    if (!isDeepStrictEqual(measure(padded).identity, paddedIdentity) || !wav(readFileSync(padded)).data.equals(expectedPCM)) fail('Staged padded PCM changed');
    if (!isDeepStrictEqual(measure(input).identity, before)) fail('Source changed before publication');
    rmSync(decodedPath); rmSync(referencePath);
    const receiptIdentity = measure(receiptPath).identity;
    const completion = { schema: 'speech-upload-complete', version: 1, complete: true,
      files: { [uploadName]: identity, 'padded.wav': paddedIdentity, 'receipt.json': receiptIdentity } };
    const marker = join(stage, 'complete.json'); writeJSON(marker, completion);
    const finalSource = wav(readFileSync(input));
    if (!isDeepStrictEqual(measure(input).identity, before) || finalSource.rate !== rate || finalSource.channels !== channels ||
        finalSource.sample_count !== total || !finalSource.format.equals(original.format) ||
        !finalSource.data.subarray(start * channels * 2, end * channels * 2).equals(expectedPCM.subarray(pre * channels * 2, (pre + end - start) * channels * 2))) fail('Source PCM differs from what was cut before publication');
    for (const [file, id] of Object.entries(completion.files)) {
      if (!isDeepStrictEqual(measure(join(stage, file)).identity, id)) fail(`Staged ${file} identity changed after completion`);
    }
    if (!isDeepStrictEqual(strictJSON(readFileSync(marker, 'utf8')), completion)) fail('Completion marker readback failed');
    // mkdir is the exclusive claim; unlike POSIX directory rename it cannot
    // replace even an empty destination. Each link also has no-replace semantics.
    // The completion marker is linked last. On failure retain the claimed path
    // as incomplete; cleanup below owns only this run's staging directory.
    try { mkdirSync(output); } catch (e) { if (e.code === 'EEXIST') fail('Destination already exists'); throw e; }
    for (const file of [...Object.keys(completion.files), 'complete.json']) linkSync(join(stage, file), join(output, file));
    return { ok: true, output, receipt: join(output, 'receipt.json'), receipt_identity: receiptIdentity, completion: join(output, 'complete.json'), upload: join(output, uploadName), bytes: identity.bytes, sha256: identity.sha256 };
  } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }); }
}
