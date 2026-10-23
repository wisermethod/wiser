import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { assemble, LIBRARY } from '../scripts/assemble.mjs';
import { board, selection } from './selections.mjs';

const script = fileURLToPath(new URL('../scripts/fonts.mjs', import.meta.url));
const consent = fileURLToPath(new URL('../../../tools/lib/consent.js', import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const work = mkdtempSync(join(tmpdir(), 'brand-fonts-test-'));
const execute = promisify(execFile);
test.after(() => rmSync(work, { recursive: true, force: true }));

// Make our own tiny ustar, including hostile names; no tar executable or network.
function tar(entries) {
  const blocks = [];
  for (const { name, data = Buffer.from('font bytes'), type = '0' } of entries) {
    const header = Buffer.alloc(512), bytes = Buffer.from(data);
    const field = (start, size, text) => header.write(text, start, size, 'ascii');
    const octal = (start, size, n) => field(start, size, n.toString(8).padStart(size - 1, '0') + '\0');
    field(0, 100, name); octal(100, 8, 0o644); octal(108, 8, 0); octal(116, 8, 0);
    octal(124, 12, bytes.length); octal(136, 12, 0);
    header.fill(32, 148, 156); field(156, 1, type); field(257, 6, 'ustar\0'); field(263, 2, '00');
    field(148, 8, header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ');
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
function fixture() {
  const root = mkdtempSync(join(work, 'fixture-'));
  const plugin = join(root, 'plugin'), skill = join(plugin, 'skills/Build Brand');
  mkdirSync(join(skill, 'scripts'), { recursive: true }); mkdirSync(join(plugin, 'tools/lib'), { recursive: true });
  copyFileSync(script, join(skill, 'scripts/fonts.mjs')); copyFileSync(consent, join(plugin, 'tools/lib/consent.js'));
  writeFileSync(join(plugin, 'tools/AGENTS.md'), '# Test plugin install boundary\n');
  const entries = [{ name: 'Test Face/face.woff2', data: Buffer.from('tiny test font') }, { name: 'Test Face/OFL.txt', data: Buffer.from('test licence') }];
  const data = tar(entries), pack = join(root, 'pack.tar'), libraryPath = join(root, 'parts.json'), directory = join(root, 'fonts');
  writeFileSync(pack, data);
  const library = {
    fontPack: { name: 'test-fonts-1', url: 'https://github.com/example/test-fonts-1.tar', sha256: hash(data), bytes: data.length },
    fonts: { Test: {
      files: [{ path: 'fonts/' + entries[0].name, sha256: hash(entries[0].data), bytes: entries[0].data.length }],
      licenceFile: 'fonts/' + entries[1].name, licenceSha256: hash(entries[1].data), licenceBytes: entries[1].data.length
    } }
  };
  const save = () => writeFileSync(libraryPath, JSON.stringify(library)); save();
  const env = { ...process.env, WISER_ALLOW_INSTALL: '' };
  const args = ['check', '--library', libraryPath, '--directory', directory];
  const run = (extra = [], environment = {}) => spawnSync(process.execPath, [join(skill, 'scripts/fonts.mjs'), ...args, ...extra], { encoding: 'utf8', env: { ...env, ...environment } });
  const replace = entries => {
    const data = tar(entries); writeFileSync(pack, data);
    library.fontPack.sha256 = hash(data); library.fontPack.bytes = data.length; save();
  };
  return { root, plugin, skill, pack, library, libraryPath, directory, entries, run, replace, save, args, env };
}
function refused(child, pattern, f) {
  assert.equal(child.status, 1, child.stderr); assert.equal(child.stdout, ''); assert.match(child.stderr, pattern);
  assert.equal(existsSync(f.directory), false, 'a refused archive must write no font files or directories');
}

test('help forms need no library, install or consent; import has no output', () => {
  for (const args of [[], ['help'], ['--help'], ['-h'], ['check', 'help'], ['check', '--help'], ['check', '-h']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0); assert.match(result.stdout, /Usage:/); assert.equal(result.stderr, '');
  }
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('unknown, repeated, relative and misplaced flags fail before any install', () => {
  const f = fixture();
  for (const args of [['--typo'], ['--install', '--install'], ['--from', 'relative.tar'], ['--library', '/other.json'], ['--env', '/secret'], ['--help', '--install'], ['unexpected']]) {
    const child = f.run(args); refused(child, /help/, f); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
  }
});
test('check on an empty directory reports every member missing and writes nothing, even with environment consent', () => {
  const f = fixture(), before = readdirSync(f.root);
  for (const environment of [{}, { WISER_ALLOW_INSTALL: '1' }]) {
    const child = f.run([], environment); assert.equal(child.status, 0); assert.equal(child.stderr, '');
    const state = JSON.parse(child.stdout); assert.equal(state.installed, false); assert.deepEqual(state.changed, []);
    assert.deepEqual(state.missing, f.entries.map(e => 'fonts/' + e.name));
    assert.deepEqual(readdirSync(f.root), before); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
  }
});
test('--from installs the complete small pack, writes API consent, then check passes; damaged files are reported and repaired', () => {
  const f = fixture(), child = f.run(['--install', '--from', f.pack]);
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).installed, true);
  for (const e of f.entries) assert.deepEqual(readFileSync(join(f.directory, e.name)), e.data);
  const marker = join(f.plugin, '.wiser-consent'), written = JSON.parse(readFileSync(marker));
  assert.equal(written.realpath, realpathSync(f.plugin)); assert.equal(written.tool, 'Build Brand fonts');
  assert.match(written.date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(statSync(marker).mode & 0o777, 0o600);
  const mtime = statSync(marker).mtimeMs;
  const checked = f.run(); assert.equal(checked.status, 0); assert.equal(checked.stderr, '');
  assert.deepEqual(JSON.parse(checked.stdout).missing, []); assert.deepEqual(JSON.parse(checked.stdout).changed, []);
  assert.equal(statSync(marker).mtimeMs, mtime);
  writeFileSync(join(f.directory, f.entries[0].name), 'changed');
  const state = JSON.parse(f.run().stdout); assert.equal(state.installed, false); assert.deepEqual(state.changed, ['fonts/' + f.entries[0].name]);
  const repaired = f.run(['--from', f.pack]); assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(JSON.parse(repaired.stdout).installed, true);
});
test('a plain check surveys with a matching marker too', () => {
  const f = fixture(); writeFileSync(join(f.plugin, '.wiser-consent'), JSON.stringify({ realpath: realpathSync(f.plugin) }));
  const child = f.run(); assert.equal(child.status, 0); assert.equal(JSON.parse(child.stdout).installed, false); assert.equal(child.stderr, '');
  assert.equal(existsSync(f.directory), false);
});
test('without consent an install reports package, host, directory and size and exits 1 without writes', () => {
  const f = fixture(), before = readdirSync(f.root);
  refused(f.run(['--from', f.pack]), /test-fonts-1.*github\.com.*into .*fonts.*check --install/, f);
  const child = f.run(['--from', f.pack]); assert.ok(child.stderr.includes(String(f.library.fontPack.bytes)));
  assert.deepEqual(readdirSync(f.root), before); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
});
test('environment consent authorizes and records an offline install', () => {
  const f = fixture(), child = f.run(['--from', f.pack], { WISER_ALLOW_INSTALL: '1' });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).installed, true);
  assert.equal(JSON.parse(readFileSync(join(f.plugin, '.wiser-consent'))).realpath, realpathSync(f.plugin));
});
test('a marker copied from another plugin is not consent', () => {
  const f = fixture(); writeFileSync(join(f.plugin, '.wiser-consent'), JSON.stringify({ realpath: '/another/plugin' }));
  refused(f.run(['--from', f.pack]), /authorize/, f);
});
test('a pack whose sha256 differs is refused with nothing installed', () => {
  const f = fixture(), data = readFileSync(f.pack); data[512] ^= 1; writeFileSync(f.pack, data);
  refused(f.run(['--install', '--from', f.pack]), /pack sha256 differs/, f);
});
test('a pack whose size differs is refused with nothing installed', () => {
  const f = fixture(); writeFileSync(f.pack, Buffer.from('truncated'));
  refused(f.run(['--install', '--from', f.pack]), /pack size differs/, f);
});
for (const [label, change, pattern] of [
  ['climbing path', e => [...e, { name: '../escaped', data: Buffer.from('bad') }], /unsafe pack member path/],
  ['absolute path', e => [...e, { name: '/escaped', data: Buffer.from('bad') }], /unsafe pack member path/],
  ['unnamed member', e => [...e, { name: 'Test Face/extra', data: Buffer.from('bad') }], /not named/],
  ['member hash mismatch', e => [e[0], { ...e[1], data: Buffer.from('TEST LICENCE') }], /member .*sha256 differs/],
  ['member size mismatch', e => [e[0], { ...e[1], data: Buffer.from('short') }], /member .*size differs/],
  ['directory member', e => [e[0], { ...e[1], type: '5' }], /not a regular file/],
  ['symlink member', e => [e[0], { ...e[1], type: '2' }], /not a regular file/],
  ['hardlink member', e => [e[0], { ...e[1], type: '1' }], /not a regular file/],
  ['missing member', e => [e[0]], /missing members/],
  ['duplicate member', e => [...e, e[0]], /duplicate pack member/]
]) test(`a ${label} is refused after the archive hash passes, before any font is written`, () => {
  const f = fixture(); f.replace(change(f.entries)); refused(f.run(['--install', '--from', f.pack]), pattern, f);
  assert.equal(existsSync(join(f.root, 'escaped')), false);
});
test('tar header corruption is refused even when the pack hash matches', () => {
  const f = fixture(), data = readFileSync(f.pack); data[100] ^= 1;
  writeFileSync(f.pack, data); f.library.fontPack.sha256 = hash(data); f.save();
  refused(f.run(['--install', '--from', f.pack]), /tar header checksum/, f);
});
test('an existing family symlink cannot redirect writes outside fonts', () => {
  const f = fixture(), outside = join(f.root, 'outside'); mkdirSync(outside); mkdirSync(f.directory);
  symlinkSync(outside, join(f.directory, 'Test Face'));
  const child = f.run(['--install', '--from', f.pack]); assert.equal(child.status, 1); assert.equal(child.stdout, '');
  assert.match(child.stderr, /unsafe install destination/); assert.deepEqual(readdirSync(outside), []);
});
test('an uninstalled library face fails with the install command before producing a spec', () => {
  const f = fixture(), library = JSON.parse(readFileSync(LIBRARY));
  assert.throws(() => assemble(selection([board(library)], library), library, { partsDir: f.root }), /node scripts\/fonts\.mjs check --install.*skill's directory/);
  writeFileSync(f.libraryPath, JSON.stringify(library));
  const input = join(f.root, 'selection.json'), output = join(f.root, 'spec.json');
  writeFileSync(input, JSON.stringify(selection([board(library)], library)));
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/assemble.mjs', import.meta.url)), '--selection', input, '--library', f.libraryPath, '--output', output], { encoding: 'utf8' });
  assert.equal(child.status, 1); assert.equal(child.stdout, ''); assert.match(child.stderr, /node scripts\/fonts\.mjs check --install/);
  assert.equal(existsSync(output), false);
});

test('HTTPS from a local server follows one redirect, verifies and installs; redirect limits and downgrade are refused', async () => {
  const f = fixture(), key = join(f.root, 'key.pem'), cert = join(f.root, 'cert.pem');
  // Only the test certificate needs openssl; the installer uses Node built-ins.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'pipe' });
  const requests = [], data = readFileSync(f.pack);
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    requests.push(request.url);
    if (request.url === '/pack') { response.writeHead(200); response.end(data); }
    else { response.writeHead(302, { Location: request.url === '/loop' ? '/loop' : request.url === '/downgrade' ? 'http://127.0.0.1/pack' : '/pack' }); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  try {
    const origin = `https://127.0.0.1:${server.address().port}`;
    const run = async extra => {
      try {
        const result = await execute(process.execPath, [join(f.skill, 'scripts/fonts.mjs'), ...f.args, '--install', ...extra], { env: { ...f.env, NODE_EXTRA_CA_CERTS: cert }, timeout: 10000 });
        return { status: 0, ...result };
      } catch (error) { return { status: error.code, stdout: error.stdout, stderr: error.stderr }; }
    };
    f.library.fontPack.url = origin + '/redirect'; f.save();
    const child = await run([]); assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).installed, true);
    assert.deepEqual(requests, ['/redirect', '/pack']); assert.equal(JSON.parse(f.run().stdout).installed, true);
    rmSync(f.directory, { recursive: true }); requests.length = 0;
    f.library.fontPack.url = origin + '/loop'; f.save();
    refused(await run([]), /redirect limit/, f); assert.equal(requests.length, 6);
    requests.length = 0; f.library.fontPack.url = origin + '/downgrade'; f.save();
    refused(await run([]), /must use https/, f); assert.deepEqual(requests, ['/downgrade']);
  } finally { await new Promise(accept => server.close(accept)); }
});
