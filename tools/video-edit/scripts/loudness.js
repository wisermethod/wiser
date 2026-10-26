import { closeSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

// Both commands use this meter and correction loop. The bound includes encoded
// read-back retries; no run can silently continue correcting indefinitely.
export const MAX_PASSES = 12;
export const PEAK_MARGIN_DB = 0.35;
export const AUDIO_FLAGS = ['-threads:a', '1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1'];
export const BASE = ['-hide_banner', '-nostdin', '-y', '-filter_threads', '1', '-filter_complex_threads', '1'];

export function rateFilter(rate) {
  // swresample flushes its zero-centred FIR and compensates its own delay.
  // first_pts also removes a container's timestamp offset. Never insert a
  // resampler into the already-48 kHz linear path.
  return Number(rate) === 48000 ? [] : ['aresample=48000:first_pts=0'];
}

export function measure(path, run, filters = []) {
  const { stderr } = run([...BASE, '-loglevel', 'info', '-i', path, '-map', '0:a:0', '-vn',
    '-af', [...filters, 'ebur128=peak=true:framelog=verbose'].join(','), '-f', 'null', '-'], 'measure loudness');
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = /Integrated loudness:\s*I:\s*([+-]?[\d.]+) LUFS/i.exec(summary);
  const range = /Loudness range:\s*LRA:\s*([+-]?[\d.]+) LU/i.exec(summary);
  const peak = /True peak:\s*Peak:\s*([+-]?(?:[\d.]+|inf)) dBFS/i.exec(summary);
  if (!integrated || !range || !peak) throw new Error('Loudness measurement failed: no ebur128 true-peak summary; check the audio stream.');
  return { integrated: Number(integrated[1]), truePeak: Number(peak[1]), loudnessRange: Number(range[1]) };
}

export function gated(reading) {
  if (reading.integrated <= -70) throw new Error('Audio has no gated block (integrated loudness is at the -70 LUFS gate floor); supply audible audio.');
}

function maxReduction(before, after) {
  const a = openSync(before, 'r'), b = openSync(after, 'r');
  const left = Buffer.alloc(65536), right = Buffer.alloc(65536);
  let minimum = 1;
  try {
    for (;;) {
      const count = readSync(a, left, 0, left.length, null);
      if (!count) break;
      if (readSync(b, right, 0, count, null) !== count) throw new Error('Limiter sample count changed; no output published.');
      for (let i = 0; i < count; i += 8) {
        const input = Math.abs(left.readDoubleLE(i));
        if (input > 1e-9) minimum = Math.min(minimum, Math.abs(right.readDoubleLE(i)) / input);
      }
    }
    if (readSync(b, right, 0, 8, null)) throw new Error('Limiter sample count changed; no output published.');
  } finally { closeSync(a); closeSync(b); }
  return Math.max(0, -20 * Math.log10(Math.max(minimum, 1e-15)));
}

export function normalize(source, directory, target, truePeak, run) {
  const before = measure(source, run);
  gated(before);
  let gainDB = target - before.integrated;
  let limiterEngaged = before.truePeak + gainDB > truePeak;
  let ceiling = truePeak - PEAK_MARGIN_DB;
  let passes = 0, maximumGainReductionDB = 0;
  const output = join(directory, 'normalized.wav');
  const channelsArgs = ['-f', 'f64le', '-ar', '192000'];
  // Read the original's channel count from the prepared floating WAV header via
  // ffprobe supplied by the same caller, rather than guessing a stereo upmix.
  const channels = JSON.parse(run(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels',
    '-of', 'json', source], 'read prepared audio channels', 'ffprobe').stdout).streams[0].channels;
  channelsArgs.push('-ac', String(channels));

  function render() {
    if (++passes > MAX_PASSES) throw new Error(`Loudness did not converge in ${MAX_PASSES} passes; choose a lower --target or a higher --true-peak.`);
    const gain = `volume=${gainDB.toFixed(10)}dB:precision=double`;
    if (!limiterEngaged) {
      run([...BASE, '-loglevel', 'error', '-i', source, '-af', gain, '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, output], 'apply linear loudness gain');
      maximumGainReductionDB = 0;
    } else {
      const gained = join(directory, 'gained.f64'), limited = join(directory, 'limited.f64');
      run([...BASE, '-loglevel', 'error', '-i', source, '-af', `${gain},aresample=192000`,
        '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, '-f', 'f64le', gained], 'oversample gained audio');
      // level=false disables alimiter's automatic makeup gain; latency=true
      // removes its lookahead delay. Fixed attack/release make repeats identical.
      run([...BASE, '-loglevel', 'error', ...channelsArgs, '-i', gained,
        '-af', `alimiter=limit=${(10 ** (ceiling / 20)).toFixed(12)}:attack=5:release=50:level=false:latency=true`,
        '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, '-f', 'f64le', limited], 'limit oversampled true peaks');
      maximumGainReductionDB = maxReduction(gained, limited);
      run([...BASE, '-loglevel', 'error', ...channelsArgs, '-i', limited, '-af', 'aresample=48000:first_pts=0',
        '-c:a', 'pcm_f64le', ...AUDIO_FLAGS, output], 'return limited audio to 48 kHz');
    }
    const after = measure(output, run);
    if (after.truePeak > truePeak) {
      limiterEngaged = true;
      ceiling -= after.truePeak - truePeak + 0.1;
      return false;
    }
    const correction = target - after.integrated;
    if (Math.abs(correction) > 0.3) {
      gainDB += correction;
      if (before.truePeak + gainDB > truePeak) limiterEngaged = true;
      return false;
    }
    return true;
  }
  function converge() { while (!render()) { /* bounded by render */ } }
  converge();
  return {
    output,
    // A lossy encoder can overshoot a PCM ceiling. Re-run this same core with a
    // lower ceiling; its original gain, original audio and total pass bound stay.
    lowerCeiling(excess) { limiterEngaged = true; ceiling -= Math.max(0.2, excess + 0.15); converge(); },
    report(after) { return { before, after, gainDB, limiterEngaged, maximumGainReductionDB,
      passes, maxPasses: MAX_PASSES, target, truePeakLimit: truePeak, ceilingDBTP: limiterEngaged ? ceiling : null }; }
  };
}
