#!/usr/bin/env node
/**
 * video-edit - apply FFmpeg edits to a video file
 *
 * Usage:
 *   node scripts/edit.js help
 *   node scripts/edit.js edit   --input <path> --output <path> [operations]
 *   node scripts/edit.js concat --input <path> --input <path> [...] --output <path>
 *   node scripts/edit.js frames --input <path> --output <dir> [--fps N]
 *   node scripts/edit.js gif    --input <path> --output <path> [--fps N]
 *
 * Node built-ins only; this tool imports no package, so there is no first-run
 * install to guard. Nothing here imports from outside this tool directory. The
 * rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const COMMANDS = new Set(['edit', 'concat', 'frames', 'gif']);
const TEXT_POSITIONS = new Set(['top', 'center', 'bottom']);

// atempo follows the video only inside this range; outside it the audio track
// is dropped rather than left out of sync.
const ATEMPO_MIN = 0.5;
const ATEMPO_MAX = 2.0;

// Fixed in the source this converts from, and kept so a caller gets the same
// overlay every run.
const TEXT_FONT_SIZE = 50;
const TEXT_TOP_MARGIN = 50;
const TEXT_BOTTOM_MARGIN = 100;
const GIF_WIDTH = 480;
const DEFAULT_FPS = 10;

const USAGE = `video-edit - apply FFmpeg edits to a video file

Usage:
  node scripts/edit.js help
  node scripts/edit.js edit   --input <path> --output <path.mp4> [operations]
  node scripts/edit.js concat --input <path> --input <path> [...] --output <path.mp4>
  node scripts/edit.js frames --input <path> --output <dir> [--fps N]
  node scripts/edit.js gif    --input <path> --output <path.gif> [--fps N]

Commands:
  edit             Apply one or more operations to a single video
  concat           Join two or more videos into one, in the order given
  frames           Write a PNG sequence sampled from a video
  gif              Convert a video to an animated GIF
  help             Print this message

Options:
  --input <path>   Video to read, absolute. Required. Repeat it for concat.
  --output <path>  File to write, absolute, or the directory for frames.
                   Required, and it may not sit inside this tool directory.
  --trim-start <s> Start of the range to keep, in seconds. Needs --trim-end.
  --trim-end <s>   End of the range to keep, in seconds. Needs --trim-start.
  --width <px>     Resize width. Needs --height.
  --height <px>    Resize height. Needs --width.
  --speed <factor> Playback multiplier, above 0. Below 0.5 or above 2.0 the
                   audio track is dropped, since atempo cannot follow.
  --text <text>    Draw this text over the video.
  --text-position  top, center, or bottom. Default center.
  --remove-audio   Drop the audio track.
  --fps <n>        Sample rate for frames and gif. Default ${DEFAULT_FPS}.
  --help           Print this message

Reads the local files the caller names and writes the file or directory the
caller names. Needs no credentials and no configuration file, so no command
takes --env, and no command opens a network connection. Success prints one JSON
object to stdout; a usage mistake or a pass FFmpeg cannot complete goes to
stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no file read, no FFmpeg.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/edit.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--input', '--output', '--trim-start', '--trim-end', '--width', '--height',
  '--speed', '--text', '--text-position', '--fps'
]);
const BARE_FLAGS = new Set(['--remove-audio']);

// Every token is accounted for. A token the parser does not recognize is a
// mistake worth naming, never something to absorb silently as another input.
const values = new Map();
const inputsRaw = [];
for (let i = 1; i < argv.length; i += 1) {
  const token = argv[i];
  if (BARE_FLAGS.has(token)) {
    values.set(token, true);
    continue;
  }
  if (!VALUE_FLAGS.has(token)) {
    if (token.startsWith('-')) {
      fail(`Error: unknown option "${token}". Run "node scripts/edit.js help" for usage.`);
    }
    fail(`Error: unexpected argument "${token}". Every value follows its own flag. Run "node scripts/edit.js help" for usage.`);
  }
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${token} needs a value. Run "node scripts/edit.js help" for usage.`);
  }
  i += 1;
  if (token === '--input') {
    inputsRaw.push(value);
  } else if (values.has(token)) {
    fail(`Error: ${token} was given twice. Only --input repeats.`);
  } else {
    values.set(token, value);
  }
}

function flag(name) {
  return values.get(name);
}

function wholeNumber(name, raw, min) {
  if (!/^[0-9]+$/.test(raw) || Number(raw) < min) {
    fail(`Error: ${name} must be a whole number of ${min} or more; got "${raw}".`);
  }
  return Number(raw);
}

function seconds(name, raw) {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) {
    fail(`Error: ${name} must be a number of seconds, 0 or more; got "${raw}".`);
  }
  return Number(raw);
}

// Inputs. Every one is an existing local file, which is also what keeps a URL
// out of FFmpeg: nothing this tool passes as an input was ever a network address.
if (inputsRaw.length === 0) {
  fail('Error: --input is required. Pass the absolute path of the video to read. Run "node scripts/edit.js help" for usage.');
}
if (command === 'concat' && inputsRaw.length < 2) {
  fail(`Error: concat needs two or more --input paths; got ${inputsRaw.length}. One video has nothing to join.`);
}
if (command !== 'concat' && inputsRaw.length > 1) {
  fail(`Error: ${command} takes one --input; got ${inputsRaw.length}. Only concat reads more than one video.`);
}

const inputs = inputsRaw.map((raw) => {
  if (!isAbsolute(raw)) {
    fail(`Error: --input must be absolute; got "${raw}". A relative path resolves against whichever directory the caller was in, which is not this tool's directory.`);
  }
  const path = resolve(raw);
  if (!existsSync(path)) {
    fail(`Error: no file at ${path}. Check the path; an absolute one cannot be misread.`);
  }
  if (!statSync(path).isFile()) {
    fail(`Error: ${path} is not a file. Point --input at the video file itself, not at a directory.`);
  }
  return path;
});

// Output.
const outputRaw = flag('--output');
if (!outputRaw) {
  fail('Error: --output is required. This tool never picks a location: pass the absolute path to write, in a work directory in the owning root.');
}
if (!isAbsolute(outputRaw)) {
  fail(`Error: --output must be absolute; got "${outputRaw}". Pass a resolved path in a work directory in the owning root.`);
}
/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read and before FFmpeg is handed a destination.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
 */
function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * True when `candidate` names `directory` itself or something beneath it,
 * decided by identity rather than by spelling.
 *
 * A prefix comparison is not enough. `realpathSync` preserves whatever case the
 * caller wrote, so on a case-insensitive volume a variant spelling of this tool's
 * own directory canonicalizes to a string carrying none of `directory`'s prefix
 * even though it names that very directory, and the prefix test answers "not
 * inside" about a path that is. Device and inode are a directory's own identity,
 * which no spelling reaches, so every existing ancestor of `candidate` is
 * compared that way. A destination that does not exist yet has no inode of its
 * own, which is why the walk climbs to the deepest ancestor that does: that
 * ancestor is where the write lands.
 */
function descendsFrom(candidate, directory) {
  let rootId;
  try {
    rootId = statSync(directory);
  } catch {
    return false;
  }

  let head = candidate;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

// The path this screen resolves is the path mkdirSync creates and the path
// FFmpeg is given on its command line. A screen that resolves one path and lets
// the write take the caller's original spelling has only checked a string.
const outputPath = canonical('--output', outputRaw);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
}

const REQUIRED_EXTENSION = { edit: '.mp4', concat: '.mp4', gif: '.gif' };
const wanted = REQUIRED_EXTENSION[command];
if (wanted && extname(outputPath).toLowerCase() !== wanted) {
  fail(`Error: --output must end ${wanted} for ${command}; got "${outputPath}".`);
}
if (command === 'frames' && extname(outputPath) !== '') {
  fail(`Error: --output must be a directory for frames; got "${outputPath}". The frame files are named inside it.`);
}
if (existsSync(outputPath) && statSync(outputPath).isDirectory() !== (command === 'frames')) {
  fail(`Error: ${outputPath} already exists as ${command === 'frames' ? 'a file' : 'a directory'}. Pass a different --output.`);
}

// Options that belong to one command only.
function refuse(name, allowed) {
  if (values.has(name) && !allowed.includes(command)) {
    fail(`Error: ${name} does not apply to ${command}; it belongs to ${allowed.join(' and ')}.`);
  }
}
for (const name of ['--trim-start', '--trim-end', '--width', '--height', '--speed', '--text', '--text-position', '--remove-audio']) {
  refuse(name, ['edit']);
}
refuse('--fps', ['frames', 'gif']);

const fps = values.has('--fps') ? wholeNumber('--fps', flag('--fps'), 1) : DEFAULT_FPS;

let trim = null;
if (values.has('--trim-start') !== values.has('--trim-end')) {
  fail('Error: --trim-start and --trim-end go together. Pass both to name the range to keep.');
}
if (values.has('--trim-start')) {
  const start = seconds('--trim-start', flag('--trim-start'));
  const end = seconds('--trim-end', flag('--trim-end'));
  if (end <= start) {
    fail(`Error: --trim-end must be greater than --trim-start; got ${start} to ${end}.`);
  }
  trim = { start, end };
}

let resize = null;
if (values.has('--width') !== values.has('--height')) {
  fail('Error: --width and --height go together. Pass both to name the size to resize to.');
}
if (values.has('--width')) {
  resize = {
    width: wholeNumber('--width', flag('--width'), 1),
    height: wholeNumber('--height', flag('--height'), 1)
  };
}

let speed = null;
if (values.has('--speed')) {
  const raw = flag('--speed');
  if (!/^[0-9]+(\.[0-9]+)?$/.test(raw) || Number(raw) <= 0) {
    fail(`Error: --speed must be a number above 0; got "${raw}". Below 1 slows the video down, above 1 speeds it up.`);
  }
  speed = Number(raw);
}

let text = null;
if (values.has('--text')) {
  text = flag('--text');
  if (text.length === 0) {
    fail('Error: --text is empty. Pass the words to draw over the video.');
  }
  if (/[\u0000-\u001F\u007F]/.test(text)) {
    fail('Error: --text may not contain newlines, tabs, or control characters. Pass a single line.');
  }
}

const textPosition = flag('--text-position') ?? 'center';
if (!TEXT_POSITIONS.has(textPosition)) {
  fail(`Error: --text-position must be top, center, or bottom; got "${textPosition}".`);
}
if (values.has('--text-position') && text === null) {
  fail('Error: --text-position was given with no --text to place.');
}

const removeAudio = values.has('--remove-audio');

if (command === 'edit' && !trim && !resize && speed === null && text === null && !removeAudio) {
  fail('Error: edit needs at least one operation. Pass --trim-start with --trim-end, --width with --height, --speed, --text, or --remove-audio.');
}

// System dependencies, per the Script Contract. Checked after help and after
// every usage mistake is caught, and only on a command that reaches FFmpeg.
function probe(args) {
  const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
  return !result.error && result.status === 0;
}

if (!probe(['-version'])) {
  fail('Error: missing FFmpeg; check: ffmpeg -version. See the Dependencies section of TOOL.md.');
}

if (text !== null && !probe([
  '-hide_banner', '-loglevel', 'error', '-nostdin',
  '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=1',
  '-vf', 'drawtext=text=x', '-frames:v', '1', '-f', 'null', '-'
])) {
  fail('Error: missing a drawtext-capable FFmpeg build with a resolvable font; check: ffmpeg -f lavfi -i color=c=black:s=32x32:d=1 -vf drawtext=text=x -frames:v 1 -f null -. See the Dependencies section of TOOL.md.');
}

/**
 * Two parsers read a filter option value: the filtergraph parser strips one
 * level of quoting and backslashes, then the filter's own option parser strips
 * another. A single level of escaping survives the first pass and is eaten by
 * the second, which is how a colon or an apostrophe in a caller's text silently
 * swallows every option written after it.
 */
function escapeFilterText(value) {
  const body = value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\\\\\''");
  return `'${body}'`;
}

function textFilter() {
  const x = '(w-text_w)/2';
  const y = textPosition === 'top'
    ? String(TEXT_TOP_MARGIN)
    : textPosition === 'bottom'
      ? `h-${TEXT_BOTTOM_MARGIN}`
      : '(h-text_h)/2';
  // expansion=none comes first so that a percent sign in the caller's text is
  // drawn rather than read as the start of an expression.
  return `drawtext=expansion=none:text=${escapeFilterText(text)}:fontsize=${TEXT_FONT_SIZE}:fontcolor=white:borderw=2:bordercolor=black:x=${x}:y=${y}`;
}

function removePartialOutput() {
  // FFmpeg opens the container before filtergraph binding can fail, so a failed
  // concat (and other file writes) can leave a zero-byte or partial file at the
  // caller-named path. Removing it keeps a failure from looking like a product.
  // frames writes into a directory of many files; that path is left alone.
  if (command === 'frames') return;
  try {
    if (existsSync(outputPath) && statSync(outputPath).isFile()) {
      unlinkSync(outputPath);
    }
  } catch {
    // Best effort: the failure message below still names the operation.
  }
}

function run(args, whatFailed) {
  // stdin is closed to the child and never read here, so a run with nobody
  // watching fails rather than waiting. FFmpeg's own output is captured and
  // discarded: it quotes full paths and whatever the container's metadata says.
  const result = spawnSync('ffmpeg', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    removePartialOutput();
    fail(`Error: FFmpeg could not ${whatFailed}. Its own message is withheld because it quotes file paths and container metadata; open the input in a player, or run the equivalent FFmpeg command by hand, to see what it says.`);
  }
}

mkdirSync(command === 'frames' ? outputPath : dirname(outputPath), { recursive: true });

const operations = [];
let result;

if (command === 'edit') {
  const args = ['-y', '-loglevel', 'error', '-nostdin'];

  // Trim selects the input window, so every filter below sees only the kept
  // range. As an output option it would instead cap the finished result, which
  // is a different answer as soon as --speed is in play.
  if (trim) {
    args.push('-ss', String(trim.start), '-t', String(trim.end - trim.start));
    operations.push('trim');
  }
  args.push('-i', inputs[0]);

  const videoFilters = [];
  const audioFilters = [];
  let audioKept = !removeAudio;

  if (resize) {
    videoFilters.push(`scale=${resize.width}:${resize.height}`);
    operations.push('resize');
  }
  if (speed !== null) {
    videoFilters.push(`setpts=${(1 / speed).toFixed(3)}*PTS`);
    if (speed >= ATEMPO_MIN && speed <= ATEMPO_MAX) {
      audioFilters.push(`atempo=${speed}`);
    } else {
      audioKept = false;
    }
    operations.push('speed');
  }
  if (text !== null) {
    videoFilters.push(textFilter());
    operations.push('text');
  }
  if (removeAudio) {
    operations.push('remove-audio');
  }

  if (videoFilters.length > 0) {
    args.push('-vf', videoFilters.join(','));
  }
  if (!audioKept) {
    args.push('-an');
  } else if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','));
  }

  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (audioKept) {
    args.push('-c:a', 'aac');
  }
  args.push(outputPath);

  run(args, `apply ${operations.join(', ')} to ${inputs[0]}`);
  result = {
    output: outputPath,
    operations,
    audio: audioKept ? 'kept' : 'removed',
    bytes: statSync(outputPath).size
  };
} else if (command === 'concat') {
  operations.push('concat');
  const args = ['-y', '-loglevel', 'error', '-nostdin'];
  inputs.forEach((path) => args.push('-i', path));
  const pairs = inputs.map((_, index) => `[${index}:v][${index}:a]`).join('');
  args.push(
    '-filter_complex', `${pairs}concat=n=${inputs.length}:v=1:a=1[outv][outa]`,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    outputPath
  );

  run(args, `join ${inputs.length} videos. Every input needs a video and an audio stream, and they must share a frame size`);
  result = {
    output: outputPath,
    operations,
    inputs: inputs.length,
    audio: 'kept',
    bytes: statSync(outputPath).size
  };
} else if (command === 'frames') {
  operations.push('frames');
  run([
    '-y', '-loglevel', 'error', '-nostdin',
    '-i', inputs[0],
    '-vf', `fps=${fps}`,
    join(outputPath, 'frame_%04d.png')
  ], `sample frames from ${inputs[0]}`);
  const written = readdirSync(outputPath).filter((name) => /^frame_[0-9]{4,}\.png$/.test(name));
  result = { output: outputPath, operations, fps, frames: written.length };
} else {
  operations.push('gif');
  run([
    '-y', '-loglevel', 'error', '-nostdin',
    '-i', inputs[0],
    '-vf', `fps=${fps},scale=${GIF_WIDTH}:-1:flags=lanczos`,
    '-loop', '0',
    outputPath
  ], `convert ${inputs[0]} to a GIF`);
  result = { output: outputPath, operations, fps, width: GIF_WIDTH, bytes: statSync(outputPath).size };
}

process.stdout.write(`${JSON.stringify(result)}\n`);
