import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AUDIO_FLAGS, BASE, measure, normalize, rateFilter } from './loudness.js';

// The priming probe and every final encode must use the same Opus settings.
const OPUS_FLAGS = ['-c:a', 'libopus', '-b:a', '384k', '-vbr', 'off', '-ac', '2', '-ar', '48000', ...AUDIO_FLAGS];

export function fraction(raw) {
  const match = /^(\d+)\/(\d+)$/.exec(raw ?? '');
  if (!match || !BigInt(match[1]) || !BigInt(match[2])) throw new Error('Video frame rate is unavailable; supply a constant-frame-rate video.');
  let p = BigInt(match[1]), q = BigInt(match[2]);
  let a = p, b = q;
  while (b) [a, b] = [b, a % b];
  p /= a; q /= a;
  return { p, q, text: `${p}/${q}` };
}

export function integer(value, label) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} exceeds the supported exact integer range; supply a shorter video.`);
  return result;
}

export function samplesAt(frames, fps) { return integer(BigInt(frames) * 48000n * fps.q / fps.p, 'Sample position'); }
export function groupSize(fps) { return integer((fps.p + fps.q) / (2n * fps.q), 'Group size'); }
export function offsetsFor(counts, fps) {
  let frames = 0;
  return counts.map(count => {
    const offset = { firstFrame: frames, firstSample: samplesAt(frames, fps), frames: count, samples: samplesAt(count, fps) };
    frames = integer(BigInt(frames) + BigInt(count), 'Frame count');
    return offset;
  });
}

export function probe(path, run, extra = []) {
  return JSON.parse(run(['-v', 'error', ...extra, '-of', 'json', path], 'inspect media streams', 'ffprobe').stdout);
}

export function audioSamples(path, run) {
  const frames = probe(path, run, ['-select_streams', 'a:0', '-show_frames', '-show_entries', 'frame=nb_samples']).frames ?? [];
  return frames.reduce((sum, f) => integer(BigInt(sum) + BigInt(f.nb_samples), 'Audio sample count'), 0);
}

function floorDivide(n, d) { return n / d - (n < 0n && n % d ? 1n : 0n); }

export function timestampSamples(timestamp, timeBase) {
  if (!/^-?\d+$/.test(String(timestamp)) || !Number.isSafeInteger(Number(timestamp))) throw new Error('Media timestamp is unavailable or outside the exact integer range.');
  const clock = fraction(timeBase);
  const sample = Number(floorDivide(BigInt(timestamp) * clock.p * 48000n, clock.q));
  if (!Number.isSafeInteger(sample)) throw new Error('Media timestamp exceeds the supported exact integer range.');
  return sample;
}

export function firstFrameSample(path, video, run) {
  const first = probe(path, run, ['-select_streams', 'v:0', '-read_intervals', '%+#1', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp']).frames?.[0];
  if (!first) throw new Error(`Input ${path} has no first shown video frame.`);
  return timestampSamples(first.best_effort_timestamp, video.time_base);
}

export function audioStartSample(path, audio, run) {
  const timestamp = audio.start_pts ?? probe(path, run, ['-select_streams', 'a:0', '-read_intervals', '%+#1',
    '-show_frames', '-show_entries', 'frame=best_effort_timestamp']).frames?.[0]?.best_effort_timestamp;
  return timestampSamples(timestamp, audio.time_base);
}

export function convertedSamples(count, rate) {
  const r = BigInt(rate);
  return integer((BigInt(count) * 48000n + r - 1n) / r, 'Resampled audio count');
}

function tagged(v) {
  return v.pix_fmt === 'yuv420p' && v.color_primaries === 'bt709' && v.color_transfer === 'bt709'
    && v.color_space === 'bt709' && v.color_range === 'tv';
}

function inspect(inputs, command, run) {
  const sources = inputs.map(path => {
    const info = probe(path, run, ['-count_frames', '-show_streams']);
    const videos = info.streams.filter(s => s.codec_type === 'video');
    const audios = info.streams.filter(s => s.codec_type === 'audio');
    if (videos.length !== 1) throw new Error(`${command}: input ${path} must have exactly one video stream; audio-only files are refused.`);
    if (audios.length > 1 || (command === 'loudness' && audios.length !== 1)) {
      throw new Error(`${command}: input ${path} must have ${command === 'loudness' ? 'exactly' : 'at most'} one audio stream.`);
    }
    const video = videos[0], audio = audios[0];
    const source = { path, video, audio, firstFrameSample: firstFrameSample(path, video, run),
      audioStartSample: audio ? audioStartSample(path, audio, run) : 0 };
    if (command === 'loudness') return source;
    if (!tagged(video)) throw new Error(`finish: input ${path} must be yuv420p tagged BT.709 primaries, transfer and matrix at TV range; untagged video is refused.`);
    if (video.side_data_list?.some(s => /display matrix/i.test(s.side_data_type))) throw new Error(`finish: input ${path} carries a display matrix; remove it explicitly before finishing.`);
    if (audio && audio.channels > 2) throw new Error(`finish: input ${path} has more than two audio channels; provide mono or stereo.`);
    const fps = fraction(video.r_frame_rate);
    const frames = integer(video.nb_read_frames, 'Decoded frame count');
    if (!frames || !groupSize(fps)) throw new Error(`finish: input ${path} has no frames or an unsupported frame rate.`);
    if (audio) {
      const count = audioSamples(path, run);
      // A flushed swresample output contains ceil(sourceSamples * 48000 /
      // sourceRate) samples. Frame-derived positions still always use floor.
      const converted = BigInt(convertedSamples(count, audio.sample_rate));
      // Compare as rational integers; a whole frame of excess is allowed, not
      // an extra sample admitted by rounded container duration fields.
      const start = BigInt(source.audioStartSample) - BigInt(source.firstFrameSample);
      if ((converted + start - BigInt(samplesAt(frames, fps))) * fps.p > 48000n * fps.q) {
        throw new Error(`finish: input ${path} audio is longer than its picture by more than one frame; shorten the track explicitly.`);
      }
    }
    return { ...source, fps, frames };
  });
  if (command === 'finish') {
    const first = sources[0];
    for (const s of sources.slice(1)) {
      if (s.video.width !== first.video.width || s.video.height !== first.video.height) throw new Error(`finish: input ${s.path} differs in width or height; every input must have the same dimensions.`);
      if (s.fps.p * first.fps.q !== first.fps.p * s.fps.q) throw new Error(`finish: input ${s.path} differs in frame rate; every input must have the same fps.`);
    }
  }
  return sources;
}

export function prepare(source, output, run, { stereo = false, samples = null, origin = 0, start = source.audioStartSample } = {}) {
  // One clock for mux, loudness and finish: written audio starts at sample 0,
  // with no edit list; time t is floor(t * 48000), using integer timestamps and
  // their own time bases. Source sample n is at audioStart + n/rate. Reset PTS
  // only for resampling, then place those samples back on that clock, dropping
  // samples before origin or filling a later start with silence. Loudness uses
  // origin 0; finish uses each input's first shown frame, before offsetsFor's
  // running-total placement and the encoded picture's measured adelay. Mux
  // explicitly places its first source sample at floor(f*48000)+ceil(t*48000).
  const shift = start - origin;
  if (!Number.isSafeInteger(shift)) throw new Error('Audio placement exceeds the supported exact integer range.');
  // Reset BEFORE rateFilter: first_pts=0 must see source sample 0, not a
  // container offset. swresample flushes its centred FIR and removes its delay,
  // so the first output sample is the first source sample. At 48 kHz it is absent.
  const filters = ['asetpts=N/SR/TB', ...rateFilter(source.audio.sample_rate)];
  if (shift < 0) filters.push(`atrim=start_sample=${-shift}`);
  filters.push('asetpts=N/SR/TB');
  if (shift > 0) filters.push(`adelay=${shift}S:all=1`);
  if (stereo && source.audio.channels === 1) filters.push('pan=stereo|c0=c0|c1=c0');
  if (samples !== null) filters.push(`apad=whole_len=${samples}`, `atrim=end_sample=${samples}`);
  run([...BASE, '-loglevel', 'error', '-i', source.path, '-map', `0:${source.audio.index}`, '-vn',
    '-af', filters.join(','), '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, output], 'prepare 48 kHz audio');
}

function joinAudio(sources, offsets, fps, output, directory, run) {
  const destination = openSync(output, 'wx');
  const zeros = Buffer.alloc(65536), buffer = Buffer.alloc(65536);
  function silence(bytes) { while (bytes) { const size = Math.min(bytes, zeros.length); writeSync(destination, zeros, 0, size); bytes -= size; } }
  try {
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i], o = offsets[i];
      if (s.audio) {
        const track = join(directory, `track-${i}.wav`), raw = join(directory, `track-${i}.f64`);
        prepare(s, track, run, { stereo: true, samples: o.samples, origin: s.firstFrameSample });
        run([...BASE, '-loglevel', 'error', '-i', track, '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, '-f', 'f64le', raw], 'read prepared stereo samples');
        if (statSync(raw).size !== o.samples * 16) throw new Error('Prepared audio sample count failed; no output published.');
        const fd = openSync(raw, 'r');
        try { for (;;) { const count = readSync(fd, buffer, 0, buffer.length, null); if (!count) break; writeSync(destination, buffer, 0, count); } }
        finally { closeSync(fd); }
      } else silence(o.samples * 16);
      // At fractional rates a scene's own floor may end one sample before the
      // next running-total floor. That sample is silence, never accumulated drift.
      const end = samplesAt(o.firstFrame + o.frames, fps);
      silence((end - o.firstSample - o.samples) * 16);
    }
  } finally { closeSync(destination); }
}

function requireCheck(checks, name, passed) {
  if (!passed) throw new Error(`finish read-back check ${name} failed; no output published. Correct the input or encoder settings.`);
  checks.push(name);
}

// Box walking checks structure, not strings that can also occur in metadata or
// compressed picture data. Read headers and access units without buffering MP4s.
export function mp4Structure(path) {
  const file = openSync(path, 'r'), size = statSync(path).size;
  let editList = false;
  const top = [];
  function walk(start, end, depth) {
    for (let offset = start; offset < end;) {
      const header = Buffer.alloc(16);
      if (end - offset < 8 || readSync(file, header, 0, 8, offset) !== 8) throw new Error('Invalid MP4 box header.');
      let length = header.readUInt32BE(0), head = 8;
      const type = header.toString('ascii', 4, 8);
      if (length === 1) { if (readSync(file, header, 8, 8, offset + 8) !== 8) throw new Error('Invalid MP4 extended header.'); length = Number(header.readBigUInt64BE(8)); head = 16; }
      if (length === 0) length = end - offset;
      if (!Number.isSafeInteger(length) || length < head || offset + length > end) throw new Error('Invalid MP4 box size.');
      if (!depth) top.push(type);
      if (type === 'elst') editList = true;
      if (['moov', 'trak', 'edts'].includes(type)) walk(offset + head, offset + length, depth + 1);
      offset += length;
    }
  }
  try { walk(0, size, 0); } finally { closeSync(file); }
  return { editList, faststart: top.indexOf('moov') >= 0 && top.indexOf('moov') < top.indexOf('mdat') };
}

export function verifyAudioClock(path, run) {
  const streams = probe(path, run, ['-show_streams']).streams;
  const audios = streams.filter(s => s.codec_type === 'audio');
  if (streams.length !== 2 || streams.filter(s => s.codec_type === 'video').length !== 1 || audios.length !== 1
    || BigInt(audios[0].start_pts) !== 0n || audios[0].sample_rate !== '48000' || mp4Structure(path).editList) {
    throw new Error('Audio clock read-back failed: expected one video and one 48 kHz audio stream starting at 0, with no edit list; no output published.');
  }
  return audios[0];
}

export function verifyCopiedPicture(input, output, run, timestamps = ['pts', 'dts', 'duration']) {
  function packets(path) {
    return probe(path, run, ['-select_streams', 'v:0', '-show_streams', '-show_packets', '-show_data_hash', 'sha256',
      '-show_entries', 'stream=time_base:packet=pts,dts,duration,data_hash']);
  }
  const before = packets(input), after = packets(output);
  const a = before.packets ?? [], b = after.packets ?? [];
  const x = fraction(before.streams[0].time_base), y = fraction(after.streams[0].time_base);
  if (!a.length || a.length !== b.length || a.some((packet, i) => packet.data_hash !== b[i].data_hash
    || timestamps.some(key => {
      if (packet[key] === undefined || b[i][key] === undefined) return packet[key] !== b[i][key];
      if (!Number.isSafeInteger(Number(packet[key])) || !Number.isSafeInteger(Number(b[i][key]))) return true;
      return BigInt(packet[key]) * x.p * y.q !== BigInt(b[i][key]) * y.p * x.q;
    }))) throw new Error('Copied video packet hashes or timestamps differ from the input; no output published.');
}

export function verifyPicture(path, expected, run) {
  const info = probe(path, run, ['-select_streams', 'v:0', '-count_frames', '-show_streams', '-show_frames',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,color_primaries,color_transfer,color_space,color_range,sample_aspect_ratio,nb_read_frames,nal_length_size,time_base:frame=key_frame,pkt_pos,best_effort_timestamp']);
  const v = info.streams[0], frames = info.frames ?? [], checks = [];
  requireCheck(checks, 'frameCount', Number(v.nb_read_frames) === expected.frames && frames.length === expected.frames);
  requireCheck(checks, 'h264', v.codec_name === 'h264');
  requireCheck(checks, 'dimensions', v.width === expected.width && v.height === expected.height);
  requireCheck(checks, 'bt709TV', tagged(v));
  requireCheck(checks, 'squarePixels', v.sample_aspect_ratio === '1:1');
  const keys = frames.flatMap((f, index) => f.key_frame ? [index] : []);
  requireCheck(checks, 'keyframeSpacing', keys[0] === 0 && keys.every((key, i) => key === i * expected.gop));
  requireCheck(checks, 'lastGroup', frames.length - keys.at(-1) <= expected.gop);
  const packets = probe(path, run, ['-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pos,size,flags']).packets ?? [];
  const positions = new Map(packets.map(p => [p.pos, p]));
  const file = openSync(path, 'r');
  let idrs = packets.length === frames.length;
  try {
    for (const frame of frames) {
      const packet = positions.get(frame.pkt_pos), lengthSize = Number(v.nal_length_size);
      if (!packet || ![1, 2, 3, 4].includes(lengthSize)) { idrs = false; break; }
      const data = Buffer.alloc(Number(packet.size));
      if (readSync(file, data, 0, data.length, Number(packet.pos)) !== data.length) { idrs = false; break; }
      let idr = false;
      for (let offset = 0; offset < data.length;) {
        if (offset + lengthSize > data.length) { idrs = false; break; }
        const count = data.readUIntBE(offset, lengthSize); offset += lengthSize;
        if (!count || offset + count > data.length) { idrs = false; break; }
        if ((data[offset] & 31) === 5) idr = true;
        offset += count;
      }
      if (idr !== Boolean(frame.key_frame) || idr !== packet.flags.includes('K')) idrs = false;
    }
  } finally { closeSync(file); }
  requireCheck(checks, 'keyframesIDR', idrs);
  const structure = mp4Structure(path);
  requireCheck(checks, 'faststart', structure.faststart);
  requireCheck(checks, 'noEditList', !structure.editList);
  const delay = integer(timestampSamples(frames[0].best_effort_timestamp, v.time_base), 'First-frame audio delay');
  return { checks, delay };
}

export function hash(path) {
  const file = openSync(path, 'r'), buffer = Buffer.alloc(1024 * 1024), digest = createHash('sha256');
  try { for (;;) { const count = readSync(file, buffer, 0, buffer.length, null); if (!count) break; digest.update(buffer.subarray(0, count)); } }
  finally { closeSync(file); }
  return digest.digest('hex');
}

export function writeOutput({ output, setPending, removePartialOutput }, build) {
  let directory;
  const pending = join(dirname(output), `.wiser-video-edit-${randomUUID()}.mp4`);
  setPending(pending);
  try {
    directory = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-video-edit-')));
    const result = { ...build({ directory, pending }), bytes: statSync(pending).size, sha256: hash(pending) };
    renameSync(pending, output);
    return result;
  } finally {
    removePartialOutput();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

export function finishCommand({ command, inputs, output, target, truePeak, run, setPending, removePartialOutput }) {
  // All stream, colour, matrix, duration and compatibility refusals precede even
  // creation of the temporary directory or destination parent.
  const sources = inspect(inputs, command, run);
  return writeOutput({ output, setPending, removePartialOutput }, ({ directory, pending }) => {
    const program = join(directory, 'program.wav');
    let details = {}, expected, picture, delay = 0, preSkip = 0;
    if (command === 'loudness') {
      prepare(sources[0], program, run);
    } else {
      const first = sources[0], fps = first.fps;
      const offsets = offsetsFor(sources.map(s => s.frames), fps);
      const frames = sources.reduce((sum, s) => sum + s.frames, 0);
      expected = { frames, width: first.video.width, height: first.video.height, gop: groupSize(fps) };
      details = { inputs: inputs.length, frames, fps: fps.text, width: expected.width, height: expected.height, offsets };
      const raw = join(directory, 'program.f64');
      joinAudio(sources, offsets, fps, raw, directory, run);
      run([...BASE, '-loglevel', 'error', '-f', 'f64le', '-ar', '48000', '-ac', '2', '-i', raw,
        '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, program], 'wrap joined audio');
    }
    const core = normalize(program, directory, target, truePeak, run);
    mkdirSync(dirname(output), { recursive: true });
    if (command === 'finish') {
      picture = join(directory, 'picture.mp4');
      const args = [...BASE, '-loglevel', 'error'];
      inputs.forEach(path => args.push('-noautorotate', '-i', path));
      const graph = sources.map((s, i) => `[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`).join(';')
        + ';' + sources.map((_, i) => `[v${i}]`).join('') + `concat=n=${sources.length}:v=1:a=0,`
        + `settb=${sources[0].fps.q}/${sources[0].fps.p},setpts=N,`
        + 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,format=yuv420p,setsar=1[outv]';
      run([...args, '-filter_complex', graph, '-map', '[outv]', '-an', '-r', sources[0].fps.text, '-fps_mode', 'cfr',
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '16', '-threads', '4',
        '-g', String(expected.gop), '-keyint_min', String(expected.gop), '-sc_threshold', '0', '-flags', '+cgop', '-bf', '2',
        '-x264-params', 'open-gop=0:b-adapt=0:cabac=1:colorprim=bt709:transfer=bt709:colormatrix=bt709',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-video_track_timescale', String(sources[0].fps.p), '-movflags', '+faststart', '-use_editlist', '0',
        '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', picture], 'encode the joined picture');
      delay = verifyPicture(picture, expected, run).delay;
      const priming = join(directory, 'opus-priming.mp4');
      run([...BASE, '-loglevel', 'error', '-i', core.output, '-t', '0.1', '-vn', ...OPUS_FLAGS,
        '-use_editlist', '0', priming], 'probe the Opus pre-skip');
      preSkip = integer(probe(priming, run, ['-select_streams', 'a:0', '-show_streams']).streams?.[0]?.initial_padding, 'Opus pre-skip');
      // With two B-frames this cannot happen below 307 fps: the picture delay
      // exceeds Opus's 312-sample pre-skip. Never trim program audio to fit it.
      if (delay < preSkip) throw new Error(`finish: first-frame audio delay ${delay} samples is smaller than Opus pre-skip ${preSkip} samples; no output published.`);
    }
    let after, checks;
    // A copied B-frame track with negative decode timestamps needs signed CTS
    // offsets to retain its presentation origin without an edit list. Decode
    // timestamps may be rebased by MP4; the shown frames must keep their times.
    const signedCTS = command === 'loudness' && Number(probe(inputs[0], run,
      ['-select_streams', 'v:0', '-read_intervals', '%+#1', '-show_packets', '-show_entries', 'packet=dts']).packets?.[0]?.dts) < 0;
    for (;;) {
      if (command === 'loudness') {
        run([...BASE, '-loglevel', 'error', '-copyts', '-noautorotate', '-i', inputs[0], '-i', core.output,
          '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'pcm_s24le', '-ar', '48000',
          '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
          ...(signedCTS ? ['-movflags', '+negative_cts_offsets'] : []),
          '-avoid_negative_ts', 'disabled', '-use_editlist', '0', pending], 'write lossless normalized audio with the copied picture');
        verifyAudioClock(pending, run);
        verifyCopiedPicture(inputs[0], pending, run, ['pts', 'duration']);
      } else {
        // No edit list: decoded sample 0 is presented at preSkip / 48000, so
        // subtract that timestamp from the program's leading sample count.
        run([...BASE, '-loglevel', 'error', '-noautorotate', '-i', picture, '-i', core.output,
          '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', `adelay=${delay - preSkip}S:all=1`,
          ...OPUS_FLAGS, '-flags:v', '+bitexact', '-video_track_timescale', String(sources[0].fps.p),
          '-movflags', '+faststart', '-use_editlist', '0', pending], 'encode finished Opus audio');
        verifyCopiedPicture(picture, pending, run, ['pts', 'duration']);
        const verified = verifyPicture(pending, expected, run);
        verifyAudioClock(pending, run);
        checks = verified.checks;
        requireCheck(checks, 'audioDelay', verified.delay === delay);
        const decoded = probe(pending, run, ['-select_streams', 'a:0', '-read_intervals', '%+#1', '-show_streams', '-show_frames',
          '-show_entries', 'stream=codec_name,channels,sample_rate,time_base,initial_padding:frame=best_effort_timestamp']);
        const audio = decoded.streams;
        requireCheck(checks, 'opusStereo48k', audio.length === 1 && audio[0].codec_name === 'opus' && audio[0].channels === 2 && audio[0].sample_rate === '48000');
        requireCheck(checks, 'opusPreSkip', audio[0].initial_padding === preSkip && audio[0].time_base === '1/48000'
          && Number(decoded.frames?.[0]?.best_effort_timestamp) === preSkip);
        const count = audioSamples(pending, run);
        requireCheck(checks, 'audioDuration', Math.abs(count - (samplesAt(details.frames, sources[0].fps) + delay - preSkip)) <= 960);
      }
      after = measure(pending, run);
      if (Math.abs(after.integrated - target) > (command === 'loudness' ? 0.5 : 1)) throw new Error('Written loudness is outside the target tolerance; choose a lower --target.');
      if (after.truePeak <= truePeak) break;
      core.lowerCeiling(after.truePeak - truePeak);
    }
    if (checks) { checks.push('integratedLoudness', 'truePeak'); details.audioDelaySeconds = delay / 48000; details.checks = checks; }
    return { output, operations: [command], ...details, ...core.report(after) };
  });
}
