#!/usr/bin/env node
// Node built-ins only. Contract: system/templates/Script Contract.md.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync,
  realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const TOOL = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const HELP = `Speech Preparation 0.2.0
Usage (from this tool directory):
  node scripts/speech.js help
  node scripts/speech.js text --script /absolute/script.txt --route elevenlabs|chatterbox|heygen --output /absolute/prepared.json [--route-text /absolute/route.txt] [--words /absolute/words.json]
  node scripts/speech.js character-timings --prepared /absolute/prepared.json --alignment /absolute/alignment.json --output /absolute/timings.json
  node scripts/speech.js pcm --input /absolute/source.wav|source.mp3 --output /absolute/prepared.wav [--descriptor /absolute/pcm.json]
  node scripts/speech.js upload --input /absolute/source.wav --sha256 HEX --max-bytes INTEGER --recipe mp3|wav --output /absolute/new-bundle --lead SECONDS --tail SECONDS
  node scripts/speech.js upload --input /absolute/source.wav --sha256 HEX --max-bytes INTEGER --recipe mp3|wav --output /absolute/new-bundle --start SECONDS --end SECONDS --pre-guard SECONDS --post-guard SECONDS
Options are command-specific; each takes one value and occurs at most once.
  --script       Exact UTF-8 script; only [pause] and paired <emphasis> marks.
  --route        elevenlabs (eleven_v4), chatterbox (English alignment), heygen (instant voice).
  --output       New JSON file for text/timings, new WAV for pcm, new directory for upload.
  --route-text   Optional new file containing exactly the submitted UTF-8 text.
  --words        Optional new JSON array of original script tokens.
  --prepared     Exact text operation result, including word correspondence.
  --alignment    Original ElevenLabs alignment or HeyGen original_characters object;
                 never normalized alignment.
  --input        Existing local PCM WAV or MP3, with no other media streams.
  --descriptor   Optional new JSON file containing pcm's returned descriptor.
  --sha256       upload: expected SHA-256 of the complete 16-bit PCM WAV source.
  --max-bytes    upload: inclusive positive complete-file byte ceiling.
  --recipe       upload: mp3 (libmp3lame CBR 64k, mono) or wav (PCM16, original channels).
  --lead, --tail upload: required inserted silence for the whole source.
  --start, --end upload: required half-open source span, with --pre-guard and --post-guard silence.
  --pre-guard, --post-guard  upload: required inserted silence, never neighbouring samples.
                 Seconds are nonnegative decimals or integer fractions; nearest sample,
                 ties upward, using exact rational arithmetic. No padding defaults.
  --help, -h     Usage without dependencies or configuration; valid on every command.
All paths must be absolute. Output parents must already exist. Nothing installs;
no credentials, configuration, network, stdin, resampling or level adjustment.
Only pcm and upload need FFmpeg and ffprobe; only upload --recipe mp3 needs libmp3lame.
pcm unknown delay returns usable:false and no WAV. upload checks decoded clock and
complete bytes before publishing upload.mp3|wav, padded.wav, receipt.json and complete.json.
Its staging sibling is removed on ordinary failure; a kill can leave incomplete staging.
Existing destinations are refused. A text/timings/pcm failed or interrupted write
can leave new files incomplete: retain them and choose fresh paths to retry.
`;
const FLAGS = {
  help: [],
  text: ['--script', '--route', '--output', '--route-text', '--words'],
  'character-timings': ['--prepared', '--alignment', '--output'],
  pcm: ['--input', '--output', '--descriptor'],
  upload: ['--input', '--output', '--sha256', '--max-bytes', '--recipe', '--lead', '--tail', '--start', '--end', '--pre-guard', '--post-guard']
};
function refuse(message) { throw new Error(message); }
const hash = value => createHash('sha256').update(value).digest('hex');
const points = text => Array.from(text);
const whitespace = c => /[\s\p{White_Space}]/u.test(c);

function parse(argv) {
  const command = !argv.length || argv[0].startsWith('-') ? 'help' : argv.shift();
  if (!Object.hasOwn(FLAGS, command)) refuse(`Unknown command ${command}; run node scripts/speech.js help.`);
  const opts = {};
  let help = command === 'help';
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { help = true; continue; }
    if (!FLAGS[command].includes(flag)) refuse(`Unknown option ${flag} for ${command}; run node scripts/speech.js help.`);
    if (Object.hasOwn(opts, flag)) refuse(`${flag} occurs twice; pass it once. See node scripts/speech.js help.`);
    const value = argv[++i];
    if (!value || value.startsWith('-')) refuse(`${flag} needs a value; run node scripts/speech.js help.`);
    opts[flag] = value;
  }
  if (help) return { command: 'help', opts };
  for (const flag of { text: ['--script', '--route', '--output'],
    'character-timings': ['--prepared', '--alignment', '--output'], pcm: ['--input', '--output'],
    upload: ['--input', '--output', '--sha256', '--max-bytes', '--recipe'] }[command]) {
    if (!opts[flag]) refuse(`${flag} is required; run node scripts/speech.js help.`);
  }
  return { command, opts };
}

// Resolve existing ancestors before comparing or opening; a broken link is not
// an absent destination. Directory identity also catches case aliases.
export function canonical(raw) {
  if (typeof raw !== 'string' || !isAbsolute(raw) || raw.includes('\0')) refuse('Every path must be absolute; pass a full local path.');
  let head = raw;
  const tail = [];
  for (;;) {
    try { return join(realpathSync(head), ...tail); }
    catch (error) {
      if (error.code !== 'ENOENT') refuse('Path could not be resolved; check permissions and symbolic links.');
      try { lstatSync(head); refuse('Broken symbolic link; pass a path that resolves.'); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      const parent = dirname(head);
      if (parent === head) refuse('Path could not be resolved; pass an accessible local path.');
      tail.unshift(basename(head)); head = parent;
    }
  }
}
function inside(path, directory) {
  const root = statSync(directory);
  for (let head = path;; head = dirname(head)) {
    try {
      const s = statSync(head);
      if (s.dev === root.dev && s.ino === root.ino) return true;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (dirname(head) === head) return false;
  }
}
function protectedName(path) {
  return path.split(/[\\/]/).some(p => /^(?:memory|\.env(?:\..*)?|auth-provider\.env)$/i.test(p));
}
export function screen(raw, output = false, label = output ? '--output' : '--input') {
  try {
    if (protectedName(raw)) refuse('Protected path; choose a work file outside credential and memory paths.');
    const path = canonical(raw);
    if (protectedName(path)) refuse('Protected resolved path; choose a work file outside credential and memory paths.');
    if (output) {
      if (inside(path, TOOL)) refuse('Destination resolves inside this tool directory; choose an external work file.');
      if (existsSync(path)) refuse('Destination already exists; choose a new path.');
      if (!statSync(dirname(path)).isDirectory()) refuse('Destination parent must already be a directory; create it first.');
    } else {
      const s = statSync(path);
      if (!s.isFile() || s.nlink !== 1) refuse('Source must be a regular file with one link; supply a separate work file.');
    }
    return path;
  } catch (error) {
    refuse(`${label}: ${error.code ? `Filesystem failure (${error.code}); check the path and permissions, and ensure the parent exists.` : error.message}`);
  }
}
function destinations(raws, labels = ['--output', '--descriptor']) {
  const paths = raws.map((raw, i) => screen(raw, true, labels[i]));
  // Canonical parent identity, plus folded basename on Windows/macOS, catches
  // duplicate new names even when the directory's spelling differs in case.
  const seen = new Set();
  for (const path of paths) {
    const s = statSync(dirname(path));
    const name = process.platform === 'linux' ? basename(path) : basename(path).toLowerCase();
    const key = `${s.dev}:${s.ino}:${name}`;
    if (seen.has(key)) refuse('Destinations coincide; give each artifact a distinct new path.');
    seen.add(key);
  }
  return paths;
}
function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { refuse('Input is not valid UTF-8; supply exact UTF-8 text.'); }
}

// JSON.parse supplies syntax validation. A second lexical walk checks keys
// before duplicate spellings (including escapes) can be discarded by parsing.
export function strictJSON(text) {
  let result;
  try { result = JSON.parse(text); }
  catch { refuse('Invalid JSON; supply strict JSON without comments or trailing commas.'); }
  const lex = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
  let at = 0;
  function value() {
    const first = lex[at++];
    if (first === '{') {
      const seen = new Set();
      while (lex[at] !== '}') {
        const key = JSON.parse(lex[at++]);
        if (seen.has(key)) refuse('Duplicate JSON key; supply each key once.');
        seen.add(key); at++; value();
        if (lex[at] !== ',') break;
        at++;
      }
      at++;
    } else if (first === '[') {
      while (lex[at] !== ']') {
        value(); if (lex[at] !== ',') break; at++;
      }
      at++;
    }
  }
  value(); return result;
}
const readJSON = path => strictJSON(utf8(readFileSync(path)));
const json = value => JSON.stringify(value, null, 2) + '\n';
function writeNew(path, bytes) { writeFileSync(path, bytes, { flag: 'wx' }); }

function parseScript(script) {
  if (typeof script !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(script)) {
    refuse('Script must contain valid Unicode text; supply UTF-8.');
  }
  if (points(script).length > 5000) refuse('Script exceeds 5,000 code points; supply a shorter script.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0085]/u.test(script)) refuse('Unsupported control character in script; supply speech text.');
  const chars = [], pauses = [];
  let emphasis = false, emphasisStart = 0;
  for (let i = 0; i < script.length;) {
    if (script.startsWith('<emphasis>', i)) {
      if (emphasis) refuse('Nested emphasis; use non-nested emphasis pairs.');
      emphasis = true; emphasisStart = chars.length; i += 10;
    } else if (script.startsWith('</emphasis>', i)) {
      if (!emphasis) refuse('Stray closing emphasis; supply a matching opening tag.');
      if (!chars.slice(emphasisStart).some(x => !whitespace(x.text))) refuse('Empty emphasis; mark spoken text.');
      emphasis = false; i += 11;
    } else if (script.startsWith('[pause]', i)) {
      pauses.push(chars.length); i += 7;
    } else {
      const c = String.fromCodePoint(script.codePointAt(i));
      if ('<>[]'.includes(c)) refuse('Unknown or malformed tag; only [pause] and <emphasis> pairs are supported.');
      chars.push({ text: c, emphasis }); i += c.length;
    }
  }
  if (emphasis) refuse('Unclosed emphasis; close the emphasis pair.');
  const tokens = [];
  for (let i = 0; i < chars.length;) {
    if (whitespace(chars[i].text)) { i++; continue; }
    const start = i;
    while (i < chars.length && !whitespace(chars[i].text)) i++;
    const body = chars.slice(start, i);
    if (!body.some(c => /[\p{L}\p{N}]/u.test(c.text))) refuse('Unsupported token without letters or digits; supply spoken words.');
    tokens.push({ start, end: i, chars: body, text: body.map(c => c.text).join('') });
  }
  if (!tokens.length) refuse('Empty speech; supply at least one spoken word.');
  const after = new Set();
  for (const offset of pauses) {
    if (tokens.some(t => t.start < offset && offset < t.end)) refuse('Pause inside a token would change word identity; put it between words.');
    const before = tokens.findLastIndex ? tokens.findLastIndex(t => t.end <= offset)
      : tokens.reduce((a, t, i) => t.end <= offset ? i : a, -1);
    if (before < 0 || before === tokens.length - 1 || after.has(before)) refuse('Unsupported pause placement; put one pause between nonempty spoken passages.');
    after.add(before);
  }
  return { tokens, after };
}

function preflightEnglish(tokens) {
  for (const [i, word] of tokens.entries()) {
    const plain = word.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/^[.,!?;:"()]+|[.,!?;:"()]+$/g, '').replace(/^'+|'+$/g, '');
    if (!/^[A-Za-z]+(?:'[A-Za-z]+)*$/.test(plain)) refuse(`Unsupported English alignment token at index ${i}; supply English words with optional internal apostrophes, without rewriting this script silently.`);
  }
}
export function prepareText(script, route) {
  if (!['elevenlabs', 'chatterbox', 'heygen'].includes(route)) refuse('Unsupported route; choose elevenlabs, chatterbox or heygen.');
  const parsed = parseScript(script);
  const tokens = parsed.tokens.map(t => t.text);
  if (route === 'chatterbox') preflightEnglish(tokens);
  const output = [], correspondence = [];
  for (const [i, token] of parsed.tokens.entries()) {
    if (i) output.push(' ');
    const word = token.chars.map(c => route === 'elevenlabs' && c.emphasis ? c.text.toUpperCase() : c.text).join('');
    const routeStart = output.length;
    const wordPoints = points(word);
    output.push(...wordPoints);
    const spoken = wordPoints.map((c, n) => /[\p{L}\p{N}\p{M}]/u.test(c) ? n : -1).filter(n => n >= 0);
    if (parsed.after.has(i) && route === 'elevenlabs') output.push(...points(word.endsWith('.') ? '..' : '...'));
    correspondence.push({ script_index: i, script_token: token.text, route_word: output.slice(routeStart).join(''),
      route_start: routeStart, route_end: output.length,
      spoken_start: routeStart + spoken[0], spoken_end: routeStart + spoken.at(-1) + 1 });
    if (parsed.after.has(i) && route === 'chatterbox') output.push(...points(' <#0.5#>'));
  }
  const submitted = output.join('');
  if (output.length > 5000) refuse('Submitted text exceeds 5,000 code points; supply a shorter script.');
  const identity = text => ({ text, code_points: points(text).length, sha256: hash(Buffer.from(text, 'utf8')) });
  return { version: 1, route, script: identity(script), submitted: identity(submitted), tokens, words: [...tokens], correspondence };
}

export function characterTimings(prepared, alignment) {
  if (!prepared || !['elevenlabs', 'heygen'].includes(prepared.route)) refuse('Character timings require elevenlabs or heygen preparation; supply its exact text result.');
  const expected = prepareText(prepared.script?.text, prepared.route);
  if (!isDeepStrictEqual(expected, prepared)) refuse('Prepared text or correspondence differs from its script; regenerate with text.');
  let chars, starts, ends;
  if (prepared.route === 'heygen') {
    if (!alignment || typeof alignment !== 'object' || Array.isArray(alignment) ||
        !isDeepStrictEqual(Object.keys(alignment), ['original_characters']) ||
        !Array.isArray(alignment.original_characters) || alignment.original_characters.some(c =>
          !c || typeof c !== 'object' || Array.isArray(c) ||
          !isDeepStrictEqual(Object.keys(c).sort(), ['end_time', 'start_time', 'text']))) {
      refuse('Alignment must be an original_characters object with text, start_time and end_time on each character.');
    }
    chars = alignment.original_characters.map(c => c.text);
    starts = alignment.original_characters.map(c => c.start_time);
    ends = alignment.original_characters.map(c => c.end_time);
  } else {
    if (!alignment || typeof alignment !== 'object' || Array.isArray(alignment) ||
      !isDeepStrictEqual(Object.keys(alignment).sort(), ['characters', 'character_start_times_seconds', 'character_end_times_seconds'].sort())) {
      refuse('Alignment must be the original object with its three character arrays.');
    }
    ({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment);
  }
  const sent = points(prepared.submitted.text);
  if (![chars, starts, ends].every(Array.isArray) || !chars.length || chars.length !== starts.length || chars.length !== ends.length ||
      chars.length !== sent.length || chars.some((c, i) => c !== sent[i])) {
    refuse('Alignment characters must equal the exact submitted text with equal nonempty timing arrays; supply original alignment.');
  }
  for (let i = 0; i < chars.length; i++) {
    if (typeof starts[i] !== 'number' || typeof ends[i] !== 'number' || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) ||
        starts[i] < 0 || ends[i] < starts[i] || i > 0 && (starts[i] < starts[i - 1] || ends[i] < ends[i - 1])) {
      refuse(`Invalid character time at index ${i}; supply finite nonnegative ordered numeric bounds.`);
    }
  }
  return expected.correspondence.map(c => ({ text: c.script_token, start: starts[c.spoken_start], end: ends[c.spoken_end - 1] }));
}

// Hash the source in bounded chunks; retain only the five-byte signature tail.
export function measure(path) {
  const digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
  const fd = openSync(path, 'r');
  let bytes = 0, tail = Buffer.alloc(0), lame = false;
  try {
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      const part = buffer.subarray(0, n); digest.update(part); bytes += n;
      const scan = Buffer.concat([tail, part]);
      lame ||= /LAME[0-9]/.test(scan.toString('latin1'));
      tail = Buffer.from(scan.subarray(-4));
    }
  } finally { closeSync(fd); }
  return { identity: { bytes, sha256: digest.digest('hex') }, lame };
}
export function run(program, args, quiet = false) {
  const r = spawnSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0 || r.stderr || quiet && r.stdout) refuse(`${program} did not complete silently; inspect the new output if present and retry to a fresh path after checking the source and machine dependency.`);
  return r.stdout;
}
export function dependencies() {
  for (const program of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(program, ['-version'], { stdio: 'ignore' });
    if (r.error || r.status !== 0) refuse(`Missing ${program}; check: ${program} -version. See TOOL.md Dependencies.`);
  }
}
const integer = n => Number.isSafeInteger(n) && n >= 0;
function stream(probe) {
  if (!Array.isArray(probe.streams) || probe.streams.length !== 1 || probe.streams[0].codec_type !== 'audio') refuse('Source must have exactly one audio stream and no other streams; supply audio only.');
  const s = probe.streams[0];
  if (typeof s.sample_rate !== 'string' || !/^[1-9][0-9]*$/.test(s.sample_rate) || !integer(Number(s.sample_rate)) || !integer(s.channels) || !s.channels) refuse('Invalid audio rate or channels; supply a valid audio file.');
  return { ...s, rate: Number(s.sample_rate) };
}
function probe(path, format, packets = false) {
  return strictJSON(run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', format,
    ...(packets ? ['-select_streams', 'a:0', '-show_packets', '-read_intervals', '%+#1'] : []),
    '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels,time_base,duration_ts:format=format_name:packet_side_data', '-of', 'json', path]));
}
export function delayFor(probed, lame) {
  const data = probed.packets?.[0]?.side_data_list ?? [];
  if (!Array.isArray(data) || data.some(d => !d || typeof d !== 'object' || Array.isArray(d))) refuse('Malformed first-packet side data; supply a valid MP3.');
  const skips = data.filter(d => d.side_data_type === 'Skip Samples');
  if (skips.length) {
    if (skips.length !== 1 || !integer(skips[0].skip_samples)) refuse('Invalid Skip Samples metadata; supply a valid header-bearing MP3.');
    return { basis: 'header_skip_samples', removed: 0, stated: skips[0].skip_samples };
  }
  return lame ? { basis: 'lame_no_header', removed: 1105, stated: null }
    : { basis: 'unknown', removed: 0, stated: null };
}
export function pcm(input, output) {
  // Public entry also screens paths, so importing it never bypasses the CLI's
  // absolute-path, protected-file and no-overwrite boundaries.
  input = screen(input); output = screen(output, true);
  const format = extname(input).toLowerCase().slice(1);
  if (!['wav', 'mp3'].includes(format) || extname(output).toLowerCase() !== '.wav') refuse('pcm needs a PCM .wav or .mp3 source and a new .wav output.');
  dependencies();
  const before = measure(input);
  // Streams are read unselected, so a cover picture or second stream is seen; the MP3's first packet separately.
  const source = stream(probe(input, format));
  const sourceProbe = format === 'mp3' ? probe(input, format, true) : null;
  if (format === 'wav' && (!source.codec_name?.startsWith('pcm_') || source.time_base !== `1/${source.rate}` || !integer(source.duration_ts) || !source.duration_ts)) refuse('WAV source must be PCM with a whole positive sample count on its own clock.');
  if (format === 'mp3' && (source.codec_name !== 'mp3' || !sourceProbe.packets?.length)) refuse('MP3 source must contain an MP3 stream and first packet.');
  const delay = format === 'wav' ? { basis: 'pcm', removed: 0, stated: null } : delayFor(sourceProbe, before.lame);
  let back = null, written = null;
  if (delay.basis !== 'unknown') {
    run('ffmpeg', ['-nostdin', '-n', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', format, '-i', input,
      '-map', '0:a:0', ...(delay.removed ? ['-af', `atrim=start_sample=${delay.removed}`] : []),
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'pcm_s16le', output], true);
    if (!existsSync(output) || !statSync(output).isFile()) refuse('FFmpeg wrote no WAV; check the source and retry to a new path.');
    back = stream(probe(output, 'wav'));
    if (back.codec_name !== 'pcm_s16le' || back.rate !== source.rate || back.channels !== source.channels ||
        back.time_base !== `1/${source.rate}` || !integer(back.duration_ts) || !back.duration_ts ||
        format === 'wav' && back.duration_ts !== source.duration_ts) refuse('WAV readback changed format, rate, channels or sample count; retain the incomplete output and inspect it.');
    written = measure(output).identity;
  }
  const after = measure(input).identity;
  if (!isDeepStrictEqual(before.identity, after)) refuse(`Source changed during preparation: before ${JSON.stringify(before.identity)}, after ${JSON.stringify(after)}; retain evidence and stop.`);
  return { ok: true, usable: back !== null, ...delay, rate: source.rate, channels: source.channels,
    codec: back?.codec_name ?? null, time_base: back?.time_base ?? null, sample_count: back?.duration_ts ?? null,
    bytes: written?.bytes ?? null, sha256: written?.sha256 ?? null, output: back ? output : null,
    source: { path: input, before: before.identity, after } };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, opts: o } = parse([...argv]);
  if (command === 'help') { process.stdout.write(HELP); return; }
  let result;
  if (command === 'text') {
    const input = screen(o['--script'], false, '--script');
    const flags = ['--output', '--route-text', '--words'].filter(k => o[k]);
    const paths = destinations(flags.map(k => o[k]), flags);
    result = prepareText(utf8(readFileSync(input)), o['--route']);
    for (const [i, flag] of flags.entries()) writeNew(paths[i], flag === '--route-text' ? result.submitted.text : json(flag === '--words' ? result.words : result));
  } else if (command === 'character-timings') {
    const prepared = screen(o['--prepared'], false, '--prepared'), alignment = screen(o['--alignment'], false, '--alignment');
    const [output] = destinations([o['--output']]);
    const timings = characterTimings(readJSON(prepared), readJSON(alignment));
    writeNew(output, json(timings));
    result = { ok: true, output, words: timings.length, timings };
  } else if (command === 'upload') {
    const { upload } = await import('./upload.js');
    result = upload(o);
  } else {
    const input = screen(o['--input']);
    const paths = destinations([o['--output'], ...(o['--descriptor'] ? [o['--descriptor']] : [])]);
    result = pcm(input, paths[0]);
    if (paths[1]) writeNew(paths[1], json(result));
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Filesystem/decoder diagnostics never echo input bytes or raw program logs.
    const message = error.code ? `Filesystem failure (${error.code}); check the named paths, permissions and available space; use fresh destinations.` : error.message;
    process.stderr.write(`Speech Preparation: ${message}\n`); process.exitCode = 1;
  });
}
