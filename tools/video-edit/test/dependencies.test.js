import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../scripts/edit.js', import.meta.url));
const commands = ['loudness', 'finish', 'mux'];
const encoders = [' V....D libx264 H.264 encoder', ' A..... libopus Opus encoder'];

function temp(fn) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'video-edit-dependencies-test-')));
  try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function standIns(directory, missing) {
  // Only presence probes are allowed. A media pass leaves a marker, so the
  // unchanged directory assertion also proves no input was handed to a decoder.
  writeFileSync(join(directory, 'ffmpeg'), `#!/bin/sh
case "$*" in
  '-version') exit ${missing === 'ffmpeg' ? 1 : 0} ;;
  '-hide_banner -encoders')
    printf '%s\\n' '${encoders.filter(line => !line.includes(missing)).join("' '")}'
    exit 0 ;;
esac
printf 'unexpected media pass' > "$0.unexpected"
exit 97
`, { mode: 0o755 });
  writeFileSync(join(directory, 'ffprobe'), `#!/bin/sh
if [ "$*" = '-version' ]; then exit ${missing === 'ffprobe' ? 1 : 0}; fi
printf 'unexpected media read' > "$0.unexpected"
exit 97
`, { mode: 0o755 });
}

function argsFor(command, directory) {
  return [command, '--input', join(directory, 'input.mp4'), '--output', join(directory, 'absent', 'out.mp4'),
    ...(command === 'mux' ? ['--audio', join(directory, 'audio.wav')] : ['--target', '-24', '--true-peak', '-1'])];
}

function invoke(directory, args) {
  return spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: directory + delimiter + process.env.PATH, TMPDIR: directory }
  });
}

function snapshot(directory) {
  return readdirSync(directory).sort().map(name => [name, readFileSync(join(directory, name))]);
}

for (const [command, missing] of [
  ['finish', 'libx264'], ['finish', 'libopus'],
  ...commands.map(command => [command, 'ffprobe']),
  ...commands.map(command => [command, 'ffmpeg'])
]) {
  test(`${command}: missing ${missing} fails its presence check before reads or writes`, () => temp(directory => {
    standIns(directory, missing);
    writeFileSync(join(directory, 'input.mp4'), 'not decoded during a presence check');
    writeFileSync(join(directory, 'audio.wav'), 'not decoded during a presence check');
    const before = snapshot(directory);
    const result = invoke(directory, argsFor(command, directory));
    const message = missing.startsWith('lib')
      ? `Error: missing FFmpeg's ${missing} encoder; check: ffmpeg -hide_banner -encoders | grep ${missing}`
      : missing === 'ffprobe' ? 'Error: missing ffprobe; check: ffprobe -version.'
        : 'Error: missing FFmpeg; check: ffmpeg -version. See the Dependencies section of TOOL.md.';
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, message + '\n');
    assert.deepEqual(snapshot(directory), before);
  }));
}

for (const command of commands) {
  test(`${command}: help and usage refusals precede every presence check`, () => temp(directory => {
    // Even a version probe would leave a marker here.
    for (const binary of ['ffmpeg', 'ffprobe']) {
      writeFileSync(join(directory, binary), '#!/bin/sh\nprintf checked > "$0.unexpected"\nexit 1\n', { mode: 0o755 });
    }
    writeFileSync(join(directory, 'input.mp4'), 'unused input');
    writeFileSync(join(directory, 'audio.wav'), 'unused audio');
    const before = snapshot(directory);
    const help = invoke(directory, [command, '--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    assert.equal(help.stderr, '');
    const valid = argsFor(command, directory);
    const invalid = [
      [command], [...valid, '--bogus'], [...valid, '--output', join(directory, 'twice.mp4')],
      [...valid.slice(0, 3), '--output', 'relative.mp4', ...valid.slice(5)],
      [...valid.slice(0, 3), '--output', join(directory, 'wrong.gif'), ...valid.slice(5)],
      [...valid.slice(0, 5), ...(command === 'mux' ? ['--audio', join(directory, 'audio.wav'), '--audio-start', '-1'] : ['--target', 'NaN', '--true-peak', '-1'])],
      valid.slice(0, 5), [...valid, '--speed', '1']
    ];
    for (const args of invalid) {
      const result = invoke(directory, args);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Error: /);
      assert.doesNotMatch(result.stderr, /missing (?:FFmpeg|ffprobe)/);
      assert.deepEqual(snapshot(directory), before);
    }
  }));
}

test('finish requires encoder names in the encoder list, rather than a description mentioning them', () => temp(directory => {
  standIns(directory, 'libopus');
  const path = join(directory, 'ffmpeg');
  writeFileSync(path, readFileSync(path, 'utf8').replace('H.264 encoder', 'H.264 encoder (libopus compatible)'));
  writeFileSync(join(directory, 'input.mp4'), 'unused input');
  const before = snapshot(directory);
  const result = invoke(directory, argsFor('finish', directory));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, "Error: missing FFmpeg's libopus encoder; check: ffmpeg -hide_banner -encoders | grep libopus\n");
  assert.deepEqual(snapshot(directory), before);
}));
