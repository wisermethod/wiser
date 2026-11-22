import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';

const page = readFileSync(new URL('../../DELIVERY.md', import.meta.url), 'utf8');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const available = command => spawnSync('sh', ['-c', 'command -v "$1"', 'check', command], { stdio: 'ignore' }).status === 0;

function commands(step, prefix) {
  const block = page.split(new RegExp('^' + step + '\\. ', 'm'))[1]?.split(/^\d+\. /m)[0];
  assert.ok(block, 'DELIVERY.md Step ' + step);
  const result = [...block.matchAll(/`([^`\r\n]+)`/g)].map(match => match[1]).filter(text => text.startsWith(prefix));
  assert.ok(result.length, 'DELIVERY.md Step ' + step + ' must carry a command starting with ' + prefix);
  return result;
}

const [makeTemp] = commands(2, 'd=$(');
const hashes = [
  { name: 'sha256sum', command: commands(3, 'sha256sum ')[0] },
  { name: 'shasum', command: commands(3, 'shasum ')[0] },
];
const [intoFolder] = commands(4, 'tar ');
const [besideFolder] = commands(4, 'mkdir ');
const [remove] = commands(6, 'rm ');

function withPaths(command, directory, folder) {
  return command.replaceAll(/'(<d>[^']*|<the folder>)'/g, (_, path) =>
    quote(path === '<the folder>' ? folder : directory + path.slice('<d>'.length)));
}

function run(shell, command) {
  const result = spawnSync(shell, ['-c', command], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  return { ...result, diagnostic: [shell + ' -c ' + command, 'exit ' + result.status, result.stdout, result.stderr].join('\n') };
}

function scratch(t) {
  const path = mkdtempSync(join(tmpdir(), "wiser delivery O'Brien "));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function archive(t) {
  const root = scratch(t);
  const source = join(root, "Wiser's source");
  const directory = join(root, "Wiser's archive");
  mkdirSync(source);
  mkdirSync(directory);
  const files = { 'AGENTS.md': 'starter fixture\n', "Owner's notes.txt": 'early archive member\n'.repeat(80) };
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(source, name), bytes);
  const path = join(directory, 'set.tar.gz');
  const result = spawnSync('tar', ['-czf', path, '--format=ustar', '-C', source, ...Object.keys(files)], {
    encoding: 'utf8',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return { root, directory, path, files };
}

function assertFiles(folder, files, diagnostic) {
  assert.deepEqual(readdirSync(folder).sort(), Object.keys(files).sort(), diagnostic);
  for (const [name, bytes] of Object.entries(files)) {
    assert.equal(readFileSync(join(folder, name), 'utf8'), bytes, diagnostic);
  }
}

for (const shell of ['sh', 'bash', 'zsh']) {
  const shellSkip = available(shell) ? false : shell + ' is unavailable';
  const tarSkip = shellSkip || (!available('tar') && 'tar is unavailable');

  test('delivery Step 2 creates a private temporary directory and Step 6 removes it under ' + shell, { skip: shellSkip }, t => {
    const created = run(shell, makeTemp);
    assert.equal(created.status, 0, created.diagnostic);
    assert.equal(created.stderr, '', created.diagnostic);
    const directory = created.stdout.trimEnd();
    assert.equal(created.stdout, directory + '\n', created.diagnostic);
    assert.ok(isAbsolute(directory), created.diagnostic);
    assert.ok(statSync(directory).isDirectory(), created.diagnostic);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    assert.equal(statSync(directory).mode & 0o077, 0);
    writeFileSync(join(directory, 'set.tar.gz'), 'cleanup marker');
    const removed = run(shell, withPaths(remove, directory));
    assert.equal(removed.status, 0, removed.diagnostic);
    assert.equal(removed.stdout, 'removed\n', removed.diagnostic);
    assert.equal(removed.stderr, '', removed.diagnostic);
    assert.equal(existsSync(directory), false, removed.diagnostic);
  });

  for (const hash of hashes) {
    const skip = tarSkip || (!available(hash.name) && hash.name + ' is unavailable');
    test('delivery Step 3 ' + hash.name + ' matches archive bytes and distinguishes a different fingerprint under ' + shell, { skip }, t => {
      const { directory, path } = archive(t);
      const original = readFileSync(path);
      const expected = createHash('sha256').update(original).digest('hex');
      const command = withPaths(hash.command, directory);
      const result = run(shell, command);
      assert.equal(result.status, 0, result.diagnostic);
      assert.equal(result.stderr, '', result.diagnostic);
      const [firstField] = result.stdout.split(/\s+/);
      assert.equal(firstField, expected, result.diagnostic);
      const changed = Buffer.from(original);
      changed[changed.length - 8] ^= 1;
      writeFileSync(path, changed);
      const mismatched = run(shell, command);
      assert.equal(mismatched.status, 0, mismatched.diagnostic);
      assert.equal(mismatched.stderr, '', mismatched.diagnostic);
      const [changedField] = mismatched.stdout.split(/\s+/);
      assert.notEqual(changedField, expected, mismatched.diagnostic);
      assert.equal(changedField, createHash('sha256').update(changed).digest('hex'), mismatched.diagnostic);
    });
  }

  test('delivery Step 4 extracts into a folder with a pre-existing hidden file under ' + shell, { skip: tarSkip }, t => {
    const { root, directory, files } = archive(t);
    const folder = join(root, "Member's folder");
    mkdirSync(folder);
    writeFileSync(join(folder, '.app'), 'keep these bytes\n');
    const result = run(shell, withPaths(intoFolder, directory, folder));
    assert.equal(result.status, 0, result.diagnostic);
    assert.equal(result.stdout, '', result.diagnostic);
    assert.equal(result.stderr, '', result.diagnostic);
    assertFiles(folder, { ...files, '.app': 'keep these bytes\n' }, result.diagnostic);
  });

  test('delivery Step 4 extracts beside the work and Step 6 removes the result under ' + shell, { skip: tarSkip }, t => {
    const { root, directory, files } = archive(t);
    const member = join(root, "Member's folder");
    mkdirSync(member);
    writeFileSync(join(member, 'keep.txt'), 'member bytes\n');
    const result = run(shell, withPaths(besideFolder, directory));
    assert.equal(result.status, 0, result.diagnostic);
    assert.equal(result.stdout, '', result.diagnostic);
    assert.equal(result.stderr, '', result.diagnostic);
    assertFiles(join(directory, 'set'), files, result.diagnostic);
    const removed = run(shell, withPaths(remove, directory));
    assert.equal(removed.status, 0, removed.diagnostic);
    assert.equal(removed.stdout, 'removed\n', removed.diagnostic);
    assert.equal(removed.stderr, '', removed.diagnostic);
    assert.equal(existsSync(directory), false, removed.diagnostic);
    assertFiles(member, { 'keep.txt': 'member bytes\n' }, removed.diagnostic);
  });

  test('delivery Step 4 rejects a corrupt archive before writing to the member folder under ' + shell, { skip: tarSkip }, t => {
    const { root, directory, path } = archive(t);
    const folder = join(root, "Member's folder");
    mkdirSync(folder);
    const before = { '.app': 'keep these bytes\n', 'AGENTS.md': 'earlier copy\n' };
    for (const [name, bytes] of Object.entries(before)) writeFileSync(join(folder, name), bytes);
    // Keep the first member and second header, but truncate the second member's data.
    const tar = gunzipSync(readFileSync(path));
    writeFileSync(path, gzipSync(tar.subarray(0, 3 * 512 + 32)));
    const result = run(shell, withPaths(intoFolder, directory, folder));
    assert.notEqual(result.status, 0, result.diagnostic);
    assert.equal(result.stdout, '', result.diagnostic);
    assert.notEqual(result.stderr, '', result.diagnostic);
    assertFiles(folder, before, result.diagnostic);
  });
}
