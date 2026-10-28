import { homeEnvironment } from '../../../tools/lib/tests/isolated-home.js';
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
  const root = realpathSync(mkdtempSync(join(work, 'fixture-')));
  const plugin = join(root, 'plugin'), skill = join(plugin, 'skills/Build Brand');
  mkdirSync(join(skill, 'scripts'), { recursive: true }); mkdirSync(join(plugin, 'tools/lib'), { recursive: true });
  copyFileSync(script, join(skill, 'scripts/fonts.mjs')); copyFileSync(consent, join(plugin, 'tools/lib/consent.js'));
  copyFileSync(new URL('../../../tools/lib/user-config.js', import.meta.url), join(plugin, 'tools/lib/user-config.js'));
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
  const env = { ...homeEnvironment(join(root, 'home')), WISER_ALLOW_INSTALL: '' };
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

const expectedAssetName = path => path.slice('fonts/'.length).replaceAll('/', '--').replaceAll(' ', '_');
function familyFixture() {
  const f = fixture(), assets = join(f.root, 'assets'); mkdirSync(assets);
  const bold = { name: 'Test Face/bold.woff2', data: Buffer.from('tiny bold font') };
  const other = [{ name: 'Other Face/face.woff2', data: Buffer.from('other font') }, { name: 'Other Face/OFL.txt', data: Buffer.from('other licence') }];
  f.library.fonts.Test.files.push({ path: 'fonts/' + bold.name, sha256: hash(bold.data), bytes: bold.data.length });
  f.library.fonts.Other = {
    files: [{ path: 'fonts/' + other[0].name, sha256: hash(other[0].data), bytes: other[0].data.length }],
    licenceFile: 'fonts/' + other[1].name, licenceSha256: hash(other[1].data), licenceBytes: other[1].data.length
  };
  const selected = [f.entries[0], bold, f.entries[1]], entries = [...selected, ...other];
  for (const e of entries) writeFileSync(join(assets, expectedAssetName('fonts/' + e.name)), e.data);
  f.save();
  return { ...f, assets, selected, other, entries };
}

function installedTree(directory) {
  if (!existsSync(directory)) return null;
  return readdirSync(directory, { withFileTypes: true }).map(entry => {
    const file = join(directory, entry.name), info = statSync(file);
    return { name: entry.name, ino: info.ino, mtime: info.mtimeMs,
      content: entry.isDirectory() ? installedTree(file) : readFileSync(file).toString('hex') };
  });
}

function faultedInstall(f, fault, args, later) {
  const harness = join(f.root, 'fault.mjs');
  writeFileSync(harness, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const originalWrite = fs.writeFileSync, originalRename = fs.renameSync;
    let fired = false;
    const fail = () => { fired = true; const error = new Error('injected later-member ENOSPC'); error.code = 'ENOSPC'; throw error; };
    fs.writeFileSync = function(path, data, options) {
      if (${JSON.stringify(fault)} === 'stage' && Buffer.isBuffer(data) && data.equals(Buffer.from(${JSON.stringify(later.at(-1).data.toString())}))) {
        originalWrite(path, data.subarray(0, 2), options); fail();
      }
      return originalWrite(path, data, options);
    };
    fs.renameSync = function(from, to) {
      if (${JSON.stringify(fault)} === 'publish' && !fired && [${JSON.stringify(join(f.directory, later[0].name.split('/')[0]))}, ${JSON.stringify(join(f.directory, later[1].name))}].includes(to)) fail();
      return originalRename(from, to);
    };
    syncBuiltinESMExports();
    const { main } = await import(${JSON.stringify(pathToFileURL(join(f.skill, 'scripts/fonts.mjs')).href)});
    await main(${JSON.stringify([...f.args, ...args, '--install'])});
    if (!fired) throw new Error('fault injection did not fire');
  `);
  return spawnSync(process.execPath, [harness], { encoding: 'utf8', env: f.env });
}

function faultedFamilyInstall(f, fault, extra = []) {
  return faultedInstall(f, fault, [...extra, '--family', 'Test', '--from', f.assets], f.selected);
}

for (const fault of ['stage', 'publish']) test(`pack rollback: a later ${fault} failure restores every family`, async t => {
  for (const existing of ['absent', 'empty', 'mixed', 'all']) await t.test(existing, () => {
    const f = familyFixture(); f.replace(f.entries);
    if (existing !== 'absent') mkdirSync(f.directory);
    if (existing === 'mixed' || existing === 'all') {
      for (const family of existing === 'all' ? ['Test Face', 'Other Face'] : ['Test Face']) {
        mkdirSync(join(f.directory, family));
        for (const entry of f.entries.filter(entry => entry.name.startsWith(family + '/'))) {
          writeFileSync(join(f.directory, entry.name), 'old ' + entry.name);
        }
        writeFileSync(join(f.directory, family, 'keep.txt'), 'unlisted file');
      }
    }
    const before = installedTree(f.directory);
    const child = faultedInstall(f, fault, ['--from', f.pack], f.other);
    assert.equal(child.status, 1, child.stderr); assert.equal(child.stdout, '');
    assert.match(child.stderr, /injected later-member ENOSPC/);
    assert.deepEqual(installedTree(f.directory), before, 'every family and original member must be restored, with no staging entries left');
    const retry = f.run(['--install', '--from', f.pack]);
    assert.equal(retry.status, 0, retry.stderr); assert.equal(JSON.parse(retry.stdout).installed, true);
    for (const entry of f.entries) assert.deepEqual(readFileSync(join(f.directory, entry.name)), entry.data);
    if (existing === 'mixed' || existing === 'all') {
      assert.equal(readFileSync(join(f.directory, 'Test Face/keep.txt'), 'utf8'), 'unlisted file');
      if (existing === 'all') assert.equal(readFileSync(join(f.directory, 'Other Face/keep.txt'), 'utf8'), 'unlisted file');
    }
    assert.deepEqual(readdirSync(f.directory).sort(), ['Other Face', 'Test Face']);
  });
});

test('family rollback: a partial write of the later licence restores absent and existing families', () => {
  for (const existing of [false, true]) {
    const f = familyFixture();
    if (existing) {
      mkdirSync(join(f.directory, 'Test Face'), { recursive: true });
      writeFileSync(join(f.directory, f.selected[0].name), 'old damaged font');
      writeFileSync(join(f.directory, 'Test Face/keep.txt'), 'unlisted file');
    }
    const before = installedTree(f.directory);
    const child = faultedFamilyInstall(f, 'stage');
    assert.equal(child.status, 1, child.stderr); assert.equal(child.stdout, '');
    assert.match(child.stderr, /injected later-member ENOSPC/);
    assert.deepEqual(installedTree(f.directory), before, 'no family, changed originals or staging entries survive the failed write');
  }
});

test('family rollback: a later publish restores every requested family and preserves existing extras on retry', () => {
  for (const existing of [false, true]) {
    const f = familyFixture();
    if (existing) {
      for (const family of ['Test Face', 'Other Face']) mkdirSync(join(f.directory, family), { recursive: true });
      for (const entry of f.entries) writeFileSync(join(f.directory, entry.name), 'old ' + entry.name);
      writeFileSync(join(f.directory, 'Test Face/keep.txt'), 'unlisted file');
    }
    const before = installedTree(f.directory);
    const child = faultedFamilyInstall(f, 'publish', ['--family', 'Other']);
    assert.equal(child.status, 1, child.stderr); assert.equal(child.stdout, '');
    assert.match(child.stderr, /injected later-member ENOSPC/);
    assert.deepEqual(installedTree(f.directory), before, 'published members and families must be rolled back, with no stage left');
    const retry = f.run(['--family', 'Other', '--family', 'Test', '--install', '--from', f.assets]);
    assert.equal(retry.status, 0, retry.stderr);
    for (const entry of f.entries) assert.deepEqual(readFileSync(join(f.directory, entry.name)), entry.data);
    if (existing) assert.equal(readFileSync(join(f.directory, 'Test Face/keep.txt'), 'utf8'), 'unlisted file');
    assert.deepEqual(readdirSync(f.directory).sort(), ['Other Face', 'Test Face']);
  }
});

function consentMarkers(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.name === '.wiser-consent') found.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return found;
}
test('family: --family installs only its asset-named files and leaves other families untouched', () => {
  const f = familyFixture();
  const child = f.run(['--family', 'Test', '--install', '--from', f.assets]);
  assert.equal(child.status, 0, child.stderr);
  const state = JSON.parse(child.stdout);
  assert.deepEqual(state.families, ['Test']); assert.equal(state.installed, true);
  assert.deepEqual(state.missing, []); assert.deepEqual(state.changed, []);
  assert.deepEqual(readdirSync(f.directory), ['Test Face']);
  for (const e of f.selected) assert.deepEqual(readFileSync(join(f.directory, e.name)), e.data);
  mkdirSync(join(f.directory, 'Other Face'));
  const untouched = f.other.map(e => {
    const file = join(f.directory, e.name); writeFileSync(file, 'leave this damaged file alone');
    return { file, bytes: readFileSync(file), info: statSync(file) };
  });
  writeFileSync(join(f.directory, f.selected[0].name), 'damaged');
  rmSync(join(f.directory, f.selected[1].name));
  const survey = JSON.parse(f.run(['--family', 'Test']).stdout);
  assert.deepEqual(survey.missing, ['fonts/' + f.selected[1].name]);
  assert.deepEqual(survey.changed, ['fonts/' + f.selected[0].name]);
  const unasked = f.run(['--family', 'Test', '--from', f.assets]);
  assert.equal(unasked.status, 1, 'a family fetch records no consent, so its repair asks again');
  assert.deepEqual(consentMarkers(f.root), []);
  const repaired = f.run(['--family', 'Test', '--install', '--from', f.assets]);
  assert.equal(repaired.status, 0, repaired.stderr); assert.equal(JSON.parse(repaired.stdout).installed, true);
  for (const { file, bytes, info } of untouched) {
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(statSync(file).mtimeMs, info.mtimeMs); assert.equal(statSync(file).ino, info.ino);
  }
  assert.deepEqual(readdirSync(join(f.directory, 'Test Face')).sort(), f.selected.map(e => e.name.split('/')[1]).sort(), 'no staging files remain');
});
test('family: repeatable --family installs the union and names each requested family once', () => {
  const f = familyFixture();
  const child = f.run(['--family', 'Other', '--family', 'Test', '--family', 'Other', '--from', f.assets], { WISER_ALLOW_INSTALL: '1' });
  assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout).families, ['Other', 'Test']);
  for (const e of f.entries) assert.deepEqual(readFileSync(join(f.directory, e.name)), e.data);
  // The simple path fetches families without asking, so a family fetch records no consent.
  assert.deepEqual(consentMarkers(f.root), []);
  const flagged = familyFixture(), viaFlag = flagged.run(['--install', '--family', 'Test', '--from', flagged.assets]);
  assert.equal(viaFlag.status, 0, viaFlag.stderr); assert.deepEqual(consentMarkers(flagged.root), []);
});
for (const kind of ['bytes', 'sha256']) test(`family: a fetched ${kind} mismatch is refused before any family file is written`, () => {
  const f = familyFixture(), last = f.selected.at(-1), data = Buffer.from(last.data);
  data[0] ^= 1;
  writeFileSync(join(f.assets, expectedAssetName('fonts/' + last.name)), kind === 'bytes' ? Buffer.concat([data, Buffer.from('extra')]) : data);
  refused(f.run(['--family', 'Test', '--install', '--from', f.assets]), kind === 'bytes' ? /size differs|size exceeds/ : /sha256 differs/, f);
});
test('family: a missing final licence asset leaves the entire family unwritten', () => {
  const f = familyFixture(); rmSync(join(f.assets, expectedAssetName('fonts/' + f.selected.at(-1).name)));
  refused(f.run(['--family', 'Test', '--install', '--from', f.assets]), /asset.*missing|asset.*absent|asset.*unreadable/i, f);
});
test('family: an unknown family is refused before consent or any writes', () => {
  const f = familyFixture(), before = readdirSync(f.root);
  refused(f.run(['--family', 'Typo Face', '--install', '--from', f.assets]), /unknown family.*Typo Face/i, f);
  assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false); assert.deepEqual(readdirSync(f.root), before);
});
test('family: assetName is one-to-one across every pinned member', async () => {
  const { assetName, members } = await import('../scripts/fonts.mjs');
  assert.equal(typeof assetName, 'function', 'assetName must be exported');
  assert.equal(assetName('fonts/Instrument Sans/InstrumentSans-Latin.woff2'), 'Instrument_Sans--InstrumentSans-Latin.woff2');
  const entries = [...members(JSON.parse(readFileSync(LIBRARY))).values()], assets = entries.map(e => assetName(e.path));
  assert.equal(new Set(assets).size, entries.length);
  assert.deepEqual(assets, entries.map(e => expectedAssetName(e.path)));
});
test('family: assets lists every member in library order with asset name, sha256 and bytes and writes nothing', () => {
  const f = familyFixture(), before = readdirSync(f.root);
  const child = spawnSync(process.execPath, [join(f.skill, 'scripts/fonts.mjs'), 'assets', '--library', f.libraryPath], { encoding: 'utf8', env: f.env });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  assert.deepEqual(JSON.parse(child.stdout), f.entries.map(e => ({ asset: expectedAssetName('fonts/' + e.name), path: 'fonts/' + e.name, sha256: hash(e.data), bytes: e.data.length })));
  const real = spawnSync(process.execPath, [script, 'assets'], { encoding: 'utf8' });
  assert.equal(real.status, 0, real.stderr);
  const library = JSON.parse(readFileSync(LIBRARY));
  const expected = Object.values(library.fonts).flatMap(f => [...f.files.map(({ path, sha256, bytes }) => ({ asset: expectedAssetName(path), path, sha256, bytes })), { asset: expectedAssetName(f.licenceFile), path: f.licenceFile, sha256: f.licenceSha256, bytes: f.licenceBytes }]);
  assert.deepEqual(JSON.parse(real.stdout), expected);
  assert.deepEqual(readdirSync(f.root), before); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
});
test('family: plain check --family writes nothing without authorization or with existing consent', () => {
  const f = familyFixture(), before = readdirSync(f.root);
  for (const environment of [{}, { WISER_ALLOW_INSTALL: '1' }]) {
    const child = f.run(['--family', 'Test'], environment);
    assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
    const state = JSON.parse(child.stdout);
    assert.deepEqual(state.families, ['Test']); assert.equal(state.installed, false);
    assert.deepEqual(state.missing, f.selected.map(e => 'fonts/' + e.name)); assert.deepEqual(state.changed, []);
    assert.deepEqual(readdirSync(f.root), before); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
  }
  const marker = join(f.plugin, '.wiser-consent'); writeFileSync(marker, JSON.stringify({ realpath: realpathSync(f.plugin) }));
  const info = statSync(marker), child = f.run(['--family', 'Test']);
  assert.equal(child.status, 0, child.stderr); assert.equal(existsSync(f.directory), false); assert.equal(statSync(marker).mtimeMs, info.mtimeMs);
});
test('family: --from without authorization is refused without writes', () => {
  const f = familyFixture(), before = readdirSync(f.root);
  refused(f.run(['--family', 'Test', '--from', f.assets]), /Test.*github\.com.*into .*fonts.*check --install/, f);
  assert.deepEqual(readdirSync(f.root), before); assert.equal(existsSync(join(f.plugin, '.wiser-consent')), false);
});
test('family: an existing symlink at the directory, family or member cannot redirect an install', () => {
  for (const level of ['directory', 'family', 'member']) {
    const f = familyFixture(), outside = join(f.root, 'outside'); mkdirSync(outside);
    if (level === 'directory') symlinkSync(outside, f.directory);
    else {
      mkdirSync(f.directory);
      if (level === 'family') symlinkSync(outside, join(f.directory, 'Test Face'));
      else {
        mkdirSync(join(f.directory, 'Test Face'));
        symlinkSync(join(outside, 'missing'), join(f.directory, f.selected[0].name));
      }
    }
    const child = f.run(['--family', 'Test', '--install', '--from', f.assets]);
    assert.equal(child.status, 1, child.stderr); assert.equal(child.stdout, '');
    assert.match(child.stderr, /unsafe install destination|directory link|symbolic link/);
    assert.deepEqual(readdirSync(outside), []);
    if (level !== 'directory') assert.equal(existsSync(join(f.directory, f.selected.at(-1).name)), false);
  }
});
test('family: HTTPS assets use the release directory and preserve download guards', async (t) => {
  const certificates = fixture(), key = join(certificates.root, 'key.pem'), cert = join(certificates.root, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'pipe' });
  let current, mode; const requests = [];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    requests.push(request.url);
    if (mode === 'redirect limit') { response.writeHead(302, { Location: request.url }); response.end(); return; }
    if (mode === 'downgrade') { response.writeHead(302, { Location: 'http://127.0.0.1/asset' }); response.end(); return; }
    if (request.url.startsWith('/release/')) { response.writeHead(302, { Location: request.url.replace('/release/', '/files/') }); response.end(); return; }
    const asset = request.url.slice('/files/'.length), entry = current.selected.find(e => expectedAssetName('fonts/' + e.name) === asset);
    if (!entry || (mode === 'missing' && entry === current.selected.at(-1))) { response.writeHead(404); response.end(); return; }
    let data = Buffer.from(entry.data);
    if (entry === current.selected.at(-1)) {
      if (mode === 'too large') data = Buffer.concat([data, Buffer.from('exceeds the pinned byte count')]);
      if (mode === 'truncated') data = data.subarray(0, data.length - 1);
      if (mode === 'hash') data[0] ^= 1;
    }
    response.writeHead(200); response.end(data);
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  try {
    const origin = `https://127.0.0.1:${server.address().port}`;
    for (const [scenario, pattern] of [['success', null], ['too large', /size exceeds/], ['truncated', /size differs/], ['hash', /sha256 differs/], ['missing', /HTTPS 404/], ['redirect limit', /redirect limit/], ['downgrade', /must use https/]]) {
      await t.test(scenario, async () => {
        current = familyFixture(); mode = scenario; requests.length = 0;
        current.library.fontPack.url = origin + '/release/pack.tar'; current.save();
        let child;
        try {
          child = { status: 0, ...await execute(process.execPath, [join(current.skill, 'scripts/fonts.mjs'), ...current.args, '--family', 'Test', '--install'], { env: { ...current.env, NODE_EXTRA_CA_CERTS: cert }, timeout: 10000 }) };
        } catch (error) { child = { status: error.code, stdout: error.stdout, stderr: error.stderr }; }
        if (pattern) refused(child, pattern, current);
        else {
          assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).installed, true);
          assert.deepEqual(requests, current.selected.flatMap(e => { const asset = expectedAssetName('fonts/' + e.name); return ['/release/' + asset, '/files/' + asset]; }));
          for (const e of current.selected) assert.deepEqual(readFileSync(join(current.directory, e.name)), e.data);
          assert.deepEqual(readdirSync(current.directory), ['Test Face']);
        }
        if (scenario === 'redirect limit') assert.equal(requests.length, 6);
        if (scenario === 'downgrade') assert.equal(requests.length, 1);
      });
    }
  } finally { await new Promise(accept => server.close(accept)); }
});

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
