import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, entryName, ROOT, TOOLS } from './one-file.mjs';
import { copyTree } from './test-one-file.mjs';

for (const tool of TOOLS) {
  test(`${tool}: two builds are byte-identical including notices`, async () => {
    const a = await compile(tool), b = await compile(tool);
    assert.equal(a.code, b.code); assert.equal(a.notice, b.notice);
    assert.doesNotMatch(a.code, new RegExp(ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  test(`${tool}: --check accepts fresh files and names missing, stale output, changed source and wrong package version`, async t => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-build-test-')));
    t.after(() => rmSync(scratch, { recursive: true, force: true }));
    copyTree(join(ROOT, 'tools', 'lib'), join(scratch, 'tools', 'lib'));
    copyTree(join(ROOT, 'tools', tool), join(scratch, 'tools', tool));
    // Build tests deliberately use installed inputs. Isolated runtime suites do not.
    cpSync(join(ROOT, 'tools', tool, 'node_modules'), join(scratch, 'tools', tool, 'node_modules'), { recursive: true });
    // Start from freshly built scratch outputs.
    const fresh = await compile(tool);
    writeFileSync(join(scratch, 'tools', tool, 'dist', `${entryName(tool)}.mjs`), fresh.code);
    writeFileSync(join(scratch, 'tools', tool, 'NOTICE.md'), fresh.notice);
    const run = () => spawnSync(process.execPath, [join(scratch, 'tools', 'lib', 'build', 'one-file.mjs'), tool, '--check'], { encoding: 'utf8' });
    let out = run(); assert.equal(out.status, 0, out.stderr);
    if (tool === 'Content Harvester') {
      assert.doesNotMatch(out.stderr, /licence text absent/);
      const licence = join(scratch, 'tools', tool, 'build', 'nodable-entities-3.0.0-LICENSE.txt');
      const original = readFileSync(licence);
      for (const changed of [Buffer.concat([original, Buffer.from(' ')]), Buffer.from(original)]) {
        changed[0] = original[0] ^ 1;
        writeFileSync(licence, changed);
        out = run(); assert.equal(out.status, 1);
        assert.match(out.stderr, /licence input .* differs from its pinned bytes and SHA-256/i);
      }
      rmSync(licence);
      out = run(); assert.equal(out.status, 1);
      assert.match(out.stderr, /ENOENT.*nodable-entities-3\.0\.0-LICENSE\.txt/);
      writeFileSync(licence, original);
      out = run(); assert.equal(out.status, 0, out.stderr);
    }
    const dist = join(scratch, 'tools', tool, 'dist', `${entryName(tool)}.mjs`);
    appendFileSync(dist, ' ');
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
    writeFileSync(dist, fresh.code);
    // A one-byte comment edit must be caught too, even if esbuild drops it.
    appendFileSync(join(scratch, 'tools', tool, 'scripts', `${entryName(tool)}.js`), ' ');
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
    cpSync(join(ROOT, 'tools', tool, 'scripts', `${entryName(tool)}.js`), join(scratch, 'tools', tool, 'scripts', `${entryName(tool)}.js`));
    const packageName = { data: 'csv-parse', 'Content Harvester': 'fast-xml-parser', 'keynote-render': 'yaml' }[tool];
    const manifest = join(scratch, 'tools', tool, 'node_modules', packageName, 'package.json');
    const original = readFileSync(manifest);
    writeFileSync(manifest, JSON.stringify({ ...JSON.parse(original), version: '5.5.6' }));
    out = run(); assert.equal(out.status, 1); assert.ok(out.stderr.includes(`${tool}: ${packageName} installed version 5.5.6 differs from lockfile version`), out.stderr);
    const build = spawnSync(process.execPath, [join(scratch, 'tools', 'lib', 'build', 'one-file.mjs'), tool], { encoding: 'utf8' });
    assert.equal(build.status, 1); assert.ok(build.stderr.includes(`${tool}: ${packageName}`), build.stderr);
    writeFileSync(manifest, original);
    const compilerLock = join(scratch, 'tools', 'lib', 'build', 'compiler-package-lock.json');
    const originalCompilerLock = readFileSync(compilerLock);
    appendFileSync(compilerLock, ' ');
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
    writeFileSync(compilerLock, originalCompilerLock);
    rmSync(dist);
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
  });
}

for (const tool of TOOLS) test(`${tool}: notices inventory bundled packages and supplied texts`, async () => {
  const built = await compile(tool);
  if (tool === 'Content Harvester') {
    assert.doesNotMatch(built.notice, /## undici/);
    assert.match(built.code, /import\("undici"\)/);
    assert.match(built.notice, /## fast-xml-parser 5\.10\.1/);
    assert.match(built.notice, /## @nodable\/entities 3\.0\.0\n\nLicence: MIT/);
    assert.ok(built.notice.includes('Source: https://raw.githubusercontent.com/nodable/val-parsers/main/LICENSE\n\n'));
    const licence = readFileSync(join(ROOT, 'tools', tool, 'build', 'nodable-entities-3.0.0-LICENSE.txt'), 'utf8');
    assert.ok(built.notice.includes(licence));
  } else if (tool === 'data') {
    assert.match(built.notice, /## csv-parse 5\.6\.0\n\nLicence: MIT/);
  } else {
    assert.match(built.notice, /## yaml 2\.9\.0\n\nLicence: ISC/);
  }
  assert.doesNotMatch(built.notice, /Licence text is absent/);
  assert.deepEqual(built.missingLicences, []);
});

test('a missing package licence without a supplied input is reported in NOTICE and stderr', async t => {
  const tool = 'keynote-render';
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-missing-licence-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  copyTree(join(ROOT, 'tools', 'lib'), join(scratch, 'tools', 'lib'));
  copyTree(join(ROOT, 'tools', tool), join(scratch, 'tools', tool));
  cpSync(join(ROOT, 'tools', tool, 'node_modules'), join(scratch, 'tools', tool, 'node_modules'), { recursive: true });
  rmSync(join(scratch, 'tools', tool, 'node_modules', 'yaml', 'LICENSE'));
  // A genuine licence-free archive, authenticated by a fixture lock, reaches
  // the licence gate instead of merely tripping the installed-byte check.
  const cache = join(scratch, 'cache');
  cpSync(process.env.npm_config_cache, cache, { recursive: true });
  const packed = join(scratch, 'packed'); mkdirSync(packed);
  cpSync(join(scratch, 'tools', tool, 'node_modules/yaml'), join(packed, 'package'), { recursive: true });
  const archive = join(scratch, 'yaml.tgz');
  const tar = spawnSync('tar', ['-czf', archive, '-C', packed, 'package']); assert.equal(tar.status, 0);
  const bytes = readFileSync(archive), digest = createHash('sha512').update(bytes).digest();
  const hex = digest.toString('hex');
  const cached = join(cache, '_cacache/content-v2/sha512', hex.slice(0,2), hex.slice(2,4), hex.slice(4));
  mkdirSync(join(cached, '..'), {recursive:true}); writeFileSync(cached, bytes);
  const lockPath = join(scratch,'tools',tool,'package-lock.json');
  const lock = JSON.parse(readFileSync(lockPath)); lock.packages['node_modules/yaml'].integrity = 'sha512-' + digest.toString('base64');
  writeFileSync(lockPath, JSON.stringify(lock));
  const previousCache = process.env.npm_config_cache;
  let built;
  try { process.env.npm_config_cache = cache; built = await compile(tool, { root: scratch }); }
  finally { process.env.npm_config_cache = previousCache; }
  assert.deepEqual(built.missingLicences, ['yaml 2.9.0']);
  assert.match(built.notice, /## yaml 2\.9\.0\n\nLicence: ISC\n\nLicence text is absent/);
  writeFileSync(join(scratch, 'tools', tool, 'dist', 'render.mjs'), built.code);
  writeFileSync(join(scratch, 'tools', tool, 'NOTICE.md'), built.notice);
  const out = spawnSync(process.execPath, [join(scratch, 'tools', 'lib', 'build', 'one-file.mjs'), tool, '--check'], { encoding: 'utf8', env: {...process.env,npm_config_cache:cache} });
  assert.equal(out.status, 1, 'missing licence must fail --check');
  assert.doesNotMatch(out.stdout, /keynote-render: current/);
  assert.match(out.stderr, /keynote-render: licence text absent from package archive: yaml 2\.9\.0/);
});

test('same-version edited fast-xml-parser fails a rebuild and --check', async t => {
  const tool = 'Content Harvester';
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-edited-package-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  copyTree(join(ROOT, 'tools/lib'), join(scratch, 'tools/lib'));
  copyTree(join(ROOT, 'tools', tool), join(scratch, 'tools', tool));
  cpSync(join(ROOT, 'tools', tool, 'node_modules'), join(scratch, 'tools', tool, 'node_modules'), { recursive: true });
  appendFileSync(join(scratch, 'tools', tool, 'node_modules/fast-xml-parser/src/fxp.js'), '\n// same version, changed bytes\n');
  for (const args of [[], ['--check']]) {
    const out = spawnSync(process.execPath, [join(scratch, 'tools/lib/build/one-file.mjs'), tool, ...args], { encoding: 'utf8' });
    assert.equal(out.status, 1, 'same-version changed package must fail');
    assert.match(out.stderr, /installed package differs from lockfile integrity/);
  }
});

test('a cold compiler cache fails offline even when the caller enables npm network', t => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-cold-compiler-')));
  t.after(() => rmSync(scratch, {recursive:true,force:true}));
  const guard = join(scratch, 'no-network.mjs');
  writeFileSync(guard, `import dns from 'node:dns'; import net from 'node:net'; import {syncBuiltinESMExports} from 'node:module';
const refuse = () => { throw Error('compiler network attempted'); };
for (const api of [dns,dns.promises]) for (const key of Object.keys(api)) if (/^(lookup|resolve|reverse)/.test(key)) api[key] = refuse;
net.Socket.prototype.connect = refuse; globalThis.fetch = refuse; syncBuiltinESMExports();`);
  const out = spawnSync(process.execPath, [join(ROOT,'tools/lib/build/one-file.mjs'), 'data', '--check'], {encoding:'utf8',timeout:15000,env:{...process.env,npm_config_cache:join(scratch,'empty'),npm_config_offline:'false',NPM_CONFIG_OFFLINE:'false',npm_config_fetch_retries:'0',NODE_OPTIONS:`--import=${guard}`}});
  assert.equal(out.status, 1, out.stderr);
  assert.match(out.stderr, /ENOTCACHED/);
  assert.doesNotMatch(out.stderr, /compiler network attempted/);
});
