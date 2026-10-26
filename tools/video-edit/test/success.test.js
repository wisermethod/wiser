import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../scripts/edit.js', import.meta.url));
const tool = resolve(dirname(entry), '..');
const commands = ['edit', 'concat', 'frames', 'gif'];

function temp(fn) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'video-edit-success-test-')));
  try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function run(binary, args, options = {}) {
  return spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}

function ff(args, options) {
  const result = run('ffmpeg', ['-y', '-v', 'error', '-nostdin', '-filter_threads', '1', ...args], options);
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}

function fixture(directory, { duration = 1, size = '128x96' } = {}) {
  const input = join(directory, 'input.mp4');
  ff(['-f', 'lavfi', '-i', `color=c=black:s=${size}:r=30:d=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=48000:duration=${duration}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads:v', '1', '-c:a', 'aac', input]);
  return input;
}

function invoke(args, directory, options = {}) {
  return run(process.execPath, [entry, ...args], { env: { ...process.env, TMPDIR: directory }, ...options });
}

function argsFor(command, input, output, flags = command === 'edit' ? ['--remove-audio'] : []) {
  return [command, '--input', input, ...(command === 'concat' ? ['--input', input] : []), '--output', output, ...flags];
}

function outputFor(command, directory) {
  return join(directory, command === 'frames' ? 'frames' : command === 'gif' ? 'out.gif' : 'out.mp4');
}

function success(args, directory) {
  const result = invoke(args, directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const json = JSON.parse(result.stdout);
  assert.ok(existsSync(json.output));
  return json;
}

function snapshot(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(item => [
    item.name, item.isDirectory() ? snapshot(join(directory, item.name)) : readFileSync(join(directory, item.name))
  ]);
}

function blockedRuntime(directory) {
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  for (const binary of ['ffmpeg', 'ffprobe']) {
    writeFileSync(join(bin, binary), '#!/bin/sh\nprintf reached > "$0.reached"\nexit 1\n', { mode: 0o755 });
  }
  return { env: { ...process.env, PATH: bin + delimiter + process.env.PATH, TMPDIR: directory } };
}

test('`help` prints usage to stdout and exits 0 on a copy with no `node_modules/` and with nothing configured.', () => temp(directory => {
  const copy = join(directory, 'copy');
  mkdirSync(copy);
  cpSync(join(tool, 'scripts'), join(copy, 'scripts'), { recursive: true });
  cpSync(join(tool, 'package.json'), join(copy, 'package.json'));
  assert.ok(!existsSync(join(copy, 'node_modules')));
  const options = blockedRuntime(directory), before = snapshot(directory);
  for (const args of [['help'], ...commands.map(command => [command, '--help'])]) {
    const result = run(process.execPath, [join(copy, 'scripts', 'edit.js'), ...args], { ...options, cwd: copy });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /Usage:/);
    assert.deepEqual(snapshot(directory), before);
  }
}));

test('`edit`, `concat`, `frames`, and `gif` each exit 0 with one parseable JSON object on stdout, and the file or directory named in `output` exists.', () => temp(directory => {
  const input = fixture(directory);
  for (const command of commands) {
    const output = outputFor(command, directory);
    const json = success(argsFor(command, input, output), directory);
    assert.equal(json.output, output);
    assert.deepEqual(json.operations, [command === 'edit' ? 'remove-audio' : command]);
    if (command === 'frames') {
      assert.ok(statSync(output).isDirectory());
      const frames = readdirSync(output);
      assert.equal(frames.length, json.frames);
      assert.ok(frames.length > 0);
      for (const frame of frames) assert.deepEqual(readFileSync(join(output, frame)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    } else {
      assert.ok(statSync(output).isFile());
      assert.ok(json.bytes > 0);
      assert.equal(statSync(output).size, json.bytes);
      if (command === 'gif') assert.match(readFileSync(output).toString('ascii', 0, 6), /^GIF8[79]a$/);
    }
  }
}));

test('`--input` or `--output` omitted, relative, non-existent, or carrying an extension the command does not write exits 1 with the cause on stderr and stdout empty, before FFmpeg is reached.', () => temp(directory => {
  // A missing input is a usage error; a new output and missing output parents
  // are allowed by the tool's contract and are covered by successful writes.
  const input = join(directory, 'input.mp4');
  writeFileSync(input, 'not opened by a path screen');
  const options = blockedRuntime(directory);
  for (const command of commands) {
    const output = outputFor(command, directory), flags = command === 'edit' ? ['--remove-audio'] : [];
    const cases = [
      [[command, '--output', output, ...flags], /--input is required/],
      [[command, '--input', input, ...(command === 'concat' ? ['--input', input] : []), ...flags], /--output is required/],
      [argsFor(command, 'relative.mp4', output), /--input must be absolute/],
      [argsFor(command, input, 'relative'), /--output must be absolute/],
      [argsFor(command, join(directory, 'missing.mp4'), output), /no file at/],
      [argsFor(command, directory, output), /not a file/],
      [argsFor(command, input, join(directory, 'wrong.mkv')), command === 'frames' ? /must be a directory/ : /must end/]
    ];
    const wrongType = join(directory, `${command}-wrong-type`);
    if (command === 'frames') writeFileSync(wrongType, 'keep this file');
    else mkdirSync(wrongType + (command === 'gif' ? '.gif' : '.mp4'));
    cases.push([argsFor(command, input, command === 'frames' ? wrongType : wrongType + (command === 'gif' ? '.gif' : '.mp4')), /already exists as/]);
    for (const [args, pattern] of cases) {
      const before = snapshot(directory), result = invoke(args, directory, options);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Error: /);
      assert.match(result.stderr, pattern);
      assert.deepEqual(snapshot(directory), before);
    }
  }
}));

test('An `--output` resolving inside this tool directory is refused rather than written.', () => temp(directory => {
  const input = join(directory, 'input.mp4');
  writeFileSync(input, 'unused input');
  const link = join(directory, 'tool-link');
  symlinkSync(tool, link);
  const options = blockedRuntime(directory);
  for (const command of commands) for (const parent of [tool, link]) {
    const output = outputFor(command, parent), result = invoke(argsFor(command, input, output), directory, options);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error: --output resolves inside this tool directory/);
    assert.ok(!existsSync(output));
    assert.ok(!existsSync(join(directory, 'bin', 'ffmpeg.reached')));
    assert.ok(!existsSync(join(directory, 'bin', 'ffprobe.reached')));
  }
}));

test('`--trim-start 0 --trim-end 10 --speed 2` yields about five seconds rather than ten, proving the trim bounded the input rather than the result.', () => temp(directory => {
  const input = fixture(directory, { duration: 12 });
  const result = success(argsFor('edit', input, join(directory, 'out.mp4'), ['--trim-start', '0', '--trim-end', '10', '--speed', '2']), directory);
  assert.deepEqual(result.operations, ['trim', 'speed']);
  assert.equal(result.audio, 'kept');
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', result.output]);
  assert.equal(probe.status, 0, probe.stderr);
  const info = JSON.parse(probe.stdout);
  assert.ok(Math.abs(Number(info.format.duration) - 5) < 0.15, probe.stdout);
  assert.equal(info.streams.length, 2);
  for (const stream of info.streams) assert.ok(Math.abs(Number(stream.duration) - 5) < 0.15, probe.stdout);
}));

test("A `--text` carrying a colon, an apostrophe, a comma, a percent sign, or a bracket is drawn in full, and no part of the filter appears in the frame.", () => temp(directory => {
  const input = fixture(directory, { size: '1280x160' }), text = "A: B's, 50% [x]";
  const output = success(argsFor('edit', input, join(directory, 'out.mp4'), ['--text', text, '--remove-audio']), directory).output;
  const textfile = join(directory, 'caption.txt'), reference = join(directory, 'reference.mp4');
  writeFileSync(textfile, text);
  // textfile bypasses both filter parsers for the caption itself, providing an
  // independent rendering of the complete literal text, including punctuation.
  ff(['-i', input, '-vf', `drawtext=expansion=none:textfile=${textfile}:fontsize=50:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', reference]);
  const pixels = path => ff(['-i', path, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: null });
  const actual = pixels(output);
  assert.ok(actual.some(value => value > 128), 'the black source must have visible white lettering');
  assert.deepEqual(actual, pixels(reference));
}));

test('A `--speed` outside 0.5 to 2.0 reports `audio` as `removed` rather than shipping a track out of sync.', () => temp(directory => {
  const input = fixture(directory);
  for (const speed of ['0.25', '3']) {
    const result = success(argsFor('edit', input, join(directory, `speed-${speed}.mp4`), ['--speed', speed]), directory);
    assert.equal(result.audio, 'removed');
    assert.deepEqual(result.operations, ['speed']);
    const probe = run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.output]);
    assert.equal(probe.status, 0, probe.stderr);
    assert.deepEqual(JSON.parse(probe.stdout).streams.map(stream => stream.codec_type), ['video']);
  }
}));

test('A failed FFmpeg pass for `edit`, `concat`, or `gif` leaves no partial or zero-byte file at `--output`.', () => temp(directory => {
  const input = join(directory, 'input.mp4'), sentinel = join(directory, 'keep.txt'), bin = join(directory, 'bin');
  writeFileSync(input, 'unused input');
  writeFileSync(sentinel, 'unrelated file');
  mkdirSync(bin);
  writeFileSync(join(bin, 'ffmpeg'), `#!/bin/sh
if [ "$*" = '-version' ]; then exit 0; fi
for destination do :; done
printf 'partial output' > "$destination"
printf 'private decoder metadata' >&2
exit 1
`, { mode: 0o755 });
  const options = { env: { ...process.env, PATH: bin + delimiter + process.env.PATH, TMPDIR: directory } };
  const before = snapshot(directory);
  for (const command of ['edit', 'concat', 'gif']) {
    const output = outputFor(command, directory), result = invoke(argsFor(command, input, output), directory, options);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error: FFmpeg could not/);
    assert.doesNotMatch(result.stderr, /private decoder metadata/);
    assert.ok(!existsSync(output));
    assert.deepEqual(snapshot(directory), before);
  }
}));
