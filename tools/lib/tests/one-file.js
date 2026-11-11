// Shared delivery cases; the same assertions run in source and isolated suites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function deliveryTests(tool, toolUrl) {
  function fixture(t, { bundle = true } = {}) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), `wiser-delivery-${tool}-`)));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const toolDir = join(root, 'tools', tool);
    const lib = fileURLToPath(new URL('../', import.meta.url));
    const filter = path => !path.split(/[\\/]/).some(part => part === 'node_modules' || part === '.env' || part.startsWith('.env.'));
    cpSync(fileURLToPath(toolUrl), toolDir, { recursive: true, filter });
    cpSync(lib, join(root, 'tools', 'lib'), { recursive: true, filter });
    if (!bundle) rmSync(join(toolDir, 'dist'), { recursive: true, force: true });
    const input = join(root, 'input.csv');
    writeFileSync(input, 'id,value\n1,10\n2,20\n');
    const args = ['parse', '--file', input];
    const home = join(root, 'home'); mkdirSync(home);
    const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, XDG_CONFIG_HOME: home, npm_config_offline: 'true' };
    for (const key of ['WISER_ALLOW_INSTALL', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete env[key];
    const entry = join(toolDir, 'scripts', `${tool}.js`), dist = join(toolDir, 'dist', `${tool}.mjs`);
    const run = (file = entry, flags = args, options = []) => spawnSync(process.execPath, [...options, file, ...flags], { encoding: 'utf8', env, timeout: 15000 });
    return { root, toolDir, args, env, entry, dist, run };
  }

  test('one-file: source without packages or dist retains the exact install question', t => {
    const f = fixture(t, { bundle: false });
    const out = f.run();
    assert.equal(out.status, 1); assert.equal(out.stdout, '');
    const what = 'a spreadsheet-file reader';
    const purpose = 'read your data files and draw charts from them';
    const size = '1.5 MB';
    assert.equal(out.stderr.split('\n')[0], `This Wiser skill needs to download and install ${what} on your machine in order to ${purpose}. It's about ${size}. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.`);
    assert.match(out.stderr, /Re-run the same command with --install/);
    assert.equal(existsSync(join(f.toolDir, 'node_modules')), false);
    assert.equal(existsSync(join(f.root, '.wiser-consent')), false);
  });

  test('one-file: help answers without packages or dist', t => {
    const f = fixture(t, { bundle: false });
    const out = f.run(f.entry, ['help']);
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, ''); assert.match(out.stdout, /Usage:/);
  });

  test('one-file: documented entry reaches dist when the source core is unusable', t => {
    const f = fixture(t);
    writeFileSync(join(f.toolDir, 'scripts', 'data-core.js'), "throw new Error('source core reached');\n");
    const out = f.run();
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, '');
    assert.equal(JSON.parse(out.stdout).rowCount, 2);
  });

  test('one-file: a loadable package gives source priority over dist', t => {
    const f = fixture(t);
    const marker = join(f.toolDir, 'node_modules', 'csv-parse');
    mkdirSync(join(marker, 'dist', 'esm'), { recursive: true });
    writeFileSync(join(marker, 'package.json'), JSON.stringify({ version: JSON.parse(readFileSync(join(f.toolDir, 'package-lock.json'))).packages['node_modules/csv-parse'].version, type: 'module', exports: { './browser/esm/sync': './dist/esm/sync.js' } }));
    writeFileSync(join(marker, 'dist', 'esm', 'sync.js'), 'export function parse() {}\n');
    writeFileSync(f.dist, "throw new Error('dist reached with packages installed');\n");
    writeFileSync(join(f.toolDir, 'scripts', 'data-core.js'), "export async function runData() { return { route: 'source' }; }\n");
    const out = f.run();
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, ''); assert.deepEqual(JSON.parse(out.stdout), { route: 'source' });
  });

  test('one-file: compiled switch never probes package markers, consent or npm', t => {
    const f = fixture(t);
    const preload = join(f.root, 'no-install.mjs');
    writeFileSync(preload, `import fs from 'node:fs';\nimport cp from 'node:child_process';\nimport { syncBuiltinESMExports } from 'node:module';\nconst exists = fs.existsSync;\nfs.existsSync = path => { if (/node_modules|wiser-consent/.test(String(path))) throw new Error('package or consent probe'); return exists(path); };\nconst open = fs.openSync;\nfs.openSync = (path, ...args) => { if (String(path).includes('wiser-consent')) throw new Error('consent opened'); return open(path, ...args); };\ncp.execFileSync = () => { throw new Error('npm attempted'); };\nsyncBuiltinESMExports();\n`);
    const out = f.run(f.dist, [...f.args, '--install'], ['--import', preload]);
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, ''); assert.ok(JSON.parse(out.stdout));
    assert.equal(existsSync(join(f.toolDir, 'node_modules')), false);
  });

  test('one-file: source and dist can be imported under node --test without executing main', t => {
    const f = fixture(t);
    const check = join(f.root, 'imports.test.mjs');
    writeFileSync(check, `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('safe imports', async () => {\n  for (const url of ${JSON.stringify([pathToFileURL(f.entry).href, pathToFileURL(f.dist).href])}) assert.equal(typeof (await import(url)).main, 'function');\n});\n`);
    delete f.env.NODE_TEST_CONTEXT;
    const out = f.run(check, [], ['--test']);
    assert.equal(out.status, 0, out.stderr); assert.match(out.stdout, /safe imports/); assert.doesNotMatch(out.stdout, /Usage:/);
  });

  test('one-file: documented entry and direct compiled command have identical output and exit', t => {
    const f = fixture(t);
    const entry = f.run(), direct = f.run(f.dist);
    for (const key of ['status', 'stdout', 'stderr']) assert.equal(entry[key], direct[key], key);
    assert.equal(direct.status, 0, direct.stderr);
  });

  for (const command of ['parse', 'join']) for (const mode of ['plain', '--install', 'WISER_ALLOW_INSTALL']) {
    test(`one-file: ${command} uses dist with a marker but missing package body (${mode})`, t => {
      const f = fixture(t);
      const marker = join(f.toolDir, 'node_modules', 'csv-parse');
      mkdirSync(marker, { recursive: true });
      writeFileSync(join(marker, 'package.json'), JSON.stringify({ type: 'module', exports: {
        './browser/esm/sync': './dist/esm/sync.js', './sync': './lib/sync.js'
      } }));
      const input = f.args[f.args.indexOf('--file') + 1];
      const args = command === 'parse' ? f.args : ['join', '--left', input, '--right', input, '--on', 'id'];
      if (mode === '--install') args.push('--install');
      if (mode === 'WISER_ALLOW_INSTALL') f.env.WISER_ALLOW_INSTALL = '1';
      const preload = join(f.root, 'no-npm.mjs');
      writeFileSync(preload, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
cp.execFileSync = () => { throw new Error('npm attempted'); };
syncBuiltinESMExports();
`);
      const direct = f.run(f.dist, args, ['--import', preload]);
      const entry = f.run(f.entry, args, ['--import', preload]);
      assert.equal(entry.status, 0, entry.stderr); assert.equal(entry.stderr, '');
      assert.equal(JSON.parse(entry.stdout)[command === 'parse' ? 'rowCount' : 'matchedRows'], 2);
      for (const key of ['status', 'stdout', 'stderr']) assert.equal(entry[key], direct[key], key);
      assert.equal(existsSync(join(f.root, '.wiser-consent')), false);
    });
  }

  test('one-file: preserved main symlink outside the tool finds the real compiled file', t => {
    const f = fixture(t);
    const link = join(f.root, 'linked data.mjs');
    symlinkSync(f.entry, link);
    const out = f.run(link, f.args, ['--preserve-symlinks-main']);
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, '');
    assert.equal(JSON.parse(out.stdout).rowCount, 2);
  });

  test('one-file: one file spelled two ways is still the program', t => {
    // A Windows drive letter in another case, or a hard link, leaves two real paths for one file.
    const f = fixture(t);
    const a = join(f.root, 'spelling-a.mjs'), b = join(f.root, 'spelling-b.mjs'), probe = join(f.root, 'probe.mjs');
    writeFileSync(a, '// one file\n'); linkSync(a, b);
    writeFileSync(probe, `import { pathToFileURL } from 'node:url';\nprocess.argv[1] = ${JSON.stringify(b)};\nconst { isMain } = await import(${JSON.stringify(pathToFileURL(join(f.toolDir, '..', 'lib', 'one-file.js')).href)});\nprocess.stdout.write(String(isMain(pathToFileURL(${JSON.stringify(a)}))));\n`);
    const out = spawnSync(process.execPath, [probe], { encoding: 'utf8', env: f.env });
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, ''); assert.equal(out.stdout, 'true');
  });

  test('one-file: eval imports and preloads fail loudly when the program path is unknown', t => {
    const f = fixture(t);
    for (const file of [f.entry, f.dist]) for (const flags of [
      ['-e', `import(${JSON.stringify(pathToFileURL(file).href)})`],
      ['--import', pathToFileURL(file).href, '-e', '0'],
    ]) {
      const out = spawnSync(process.execPath, flags, { encoding: 'utf8', env: f.env });
      assert.equal(out.status, 1); assert.equal(out.stdout, '');
      assert.match(out.stderr, /Cannot determine whether .* is the program: process.argv\[1\] is missing/);
      assert.equal(out.stderr.trim().split('\n').length, 1);
    }
  });

  test('one-file: failed realpath falls back only for equal plain resolved paths', t => {
    const f = fixture(t);
    const check = join(f.root, 'realpath-fallback.mjs');
    writeFileSync(check, `import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
const { isMain } = await import(${JSON.stringify(pathToFileURL(join(f.root, 'tools', 'lib', 'one-file.js')).href)});
fs.realpathSync = () => { const e = new Error('synthetic ELOOP'); e.code = 'ELOOP'; throw e; };
syncBuiltinESMExports();
const url = new URL('./entry.js', import.meta.url);
process.argv[1] = fileURLToPath(new URL(process.argv[2] === 'same' ? './entry.js' : './other.js', import.meta.url));
console.log(isMain(url.href));
`);
    const same = f.run(check, ['same']);
    assert.equal(same.status, 0, same.stderr); assert.equal(same.stdout, 'true\n'); assert.equal(same.stderr, '');
    const other = f.run(check, ['different']);
    assert.equal(other.status, 1); assert.equal(other.stdout, 'false\n');
    assert.match(other.stderr, /synthetic ELOOP/); assert.equal(other.stderr.trim().split('\n').length, 1);
  });
}
