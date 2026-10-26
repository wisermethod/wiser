import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AUDIO_FLAGS, BASE } from './loudness.js';
import { audioSamples, convertedSamples, firstFrameSample, fraction, integer, prepare, probe,
  requireConstantFrameRate, samplesAt, verifyAudioClock, verifyCopiedPicture, writeOutput } from './finish.js';

export function startSamples(raw) {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw new Error(`Error: --audio-start must be a decimal of 0 or more; got "${raw}".`);
  const [whole, digits = ''] = raw.split('.');
  const scale = 10n ** BigInt(digits.length);
  const numerator = BigInt(whole || '0') * scale + BigInt(digits || '0');
  return integer((numerator * 48000n + scale - 1n) / scale, '--audio-start sample position');
}

export function muxCommand({ inputs, audio: path, audioStart, output, run, setPending, removePartialOutput }) {
  const input = inputs[0];
  const picture = probe(input, run, ['-count_frames', '-show_streams']).streams;
  const videos = picture.filter(s => s.codec_type === 'video');
  if (videos.length !== 1) throw new Error(`Error: mux: video ${input} must have exactly one video stream.`);
  if (picture.some(s => s.codec_type === 'audio')) throw new Error(`Error: mux: video ${input} already carries audio; provide a video with no audio stream. Mixing is not supported.`);
  const sound = probe(path, run, ['-show_streams']).streams;
  if (sound.some(s => s.codec_type === 'video')) throw new Error(`Error: mux: --audio ${path} holds a video stream; provide an audio-only file.`);
  const audios = sound.filter(s => s.codec_type === 'audio');
  if (audios.length !== 1) throw new Error(`Error: mux: --audio ${path} must have exactly one audio stream.`);
  const audio = audios[0], video = videos[0];
  if (audio.channels > 2) throw new Error(`Error: mux: --audio ${path} has more than two channels; provide mono or stereo.`);
  const fps = fraction(video.r_frame_rate), frames = integer(video.nb_read_frames, 'Decoded frame count');
  if (!frames) throw new Error(`Error: mux: video ${input} has no frames.`);
  requireConstantFrameRate(input, video, fps, frames, 'mux', run);
  const first = integer(firstFrameSample(input, video, run), 'First-frame sample');
  const samples = integer(BigInt(first) + BigInt(samplesAt(frames, fps)), 'Track length');
  const start = integer(BigInt(first) + BigInt(audioStart), '--audio-start sample position');
  const narrationSamples = convertedSamples(audioSamples(path, run), audio.sample_rate);
  // Refusals run before even creating the scratch directory or output parent.
  if (start >= samples || BigInt(start) + BigInt(narrationSamples) > BigInt(samples)) {
    throw new Error(`Error: mux: narration ${path} with --audio-start would run past the video's end (or start at or past it); shorten the narration or use an earlier start. Narration is never cut.`);
  }
  return writeOutput({ output, setPending, removePartialOutput }, ({ directory, pending }) => {
    const track = join(directory, 'narration.wav');
    prepare({ path, audio }, track, run, { start, samples });
    mkdirSync(dirname(output), { recursive: true });
    run([...BASE, '-loglevel', 'error', '-copyts', '-noautorotate', '-i', input, '-i', track,
      '-map', `0:${video.index}`, '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'pcm_s24le', '-ar', '48000',
      ...AUDIO_FLAGS, '-flags:v', '+bitexact', '-video_track_timescale', String(fraction(video.time_base).q),
      '-avoid_negative_ts', 'disabled', '-use_editlist', '0', pending], 'mux narration with the copied picture');
    verifyCopiedPicture(input, pending, run);
    const written = verifyAudioClock(pending, run);
    if (written.codec_name !== 'pcm_s24le' || written.channels !== audio.channels || audioSamples(pending, run) !== samples) {
      throw new Error('Error: mux read-back audio format, channels or sample count failed; no output published.');
    }
    return { output, operations: ['mux'], frames, fps: fps.text, firstFrameSample: first,
      audioStartSample: start, narrationSamples, samples, resampled: audio.sample_rate !== '48000',
      channels: audio.channels };
  });
}
