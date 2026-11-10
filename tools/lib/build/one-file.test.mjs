import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, ROOT, TOOLS } from './one-file.mjs';
import { copyTree } from './test-one-file.mjs';

for (const tool of TOOLS) {
  test(`${tool}: two builds are byte-identical including notices`, async () => {
    const a = await compile(tool), b = await compile(tool);
    assert.equal(a.code, b.code); assert.equal(a.notice, b.notice);
    assert.doesNotMatch(a.code, new RegExp(ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  test(`${tool}: --check accepts fresh files and names missing, stale output, changed source and wrong package version`, t => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-build-test-')));
    t.after(() => rmSync(scratch, { recursive: true, force: true }));
    copyTree(join(ROOT, 'tools', 'lib'), join(scratch, 'tools', 'lib'));
    copyTree(join(ROOT, 'tools', tool), join(scratch, 'tools', tool));
    // Build tests deliberately use installed inputs. Isolated runtime suites do not.
    cpSync(join(ROOT, 'tools', tool, 'node_modules'), join(scratch, 'tools', tool, 'node_modules'), { recursive: true });
    const run = () => spawnSync(process.execPath, [join(scratch, 'tools', 'lib', 'build', 'one-file.mjs'), tool, '--check'], { encoding: 'utf8' });
    let out = run(); assert.equal(out.status, 0, out.stderr);
    const dist = join(scratch, 'tools', tool, 'dist', `${tool}.mjs`);
    appendFileSync(dist, ' ');
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
    cpSync(join(ROOT, 'tools', tool, 'dist', `${tool}.mjs`), dist);
    // A one-byte comment edit must be caught too, even if esbuild drops it.
    appendFileSync(join(scratch, 'tools', tool, 'scripts', `${tool}.js`), ' ');
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, new RegExp(`${tool}: missing or stale`));
    cpSync(join(ROOT, 'tools', tool, 'scripts', `${tool}.js`), join(scratch, 'tools', tool, 'scripts', `${tool}.js`));
    const manifest = join(scratch, 'tools', tool, 'node_modules', 'csv-parse', 'package.json');
    const original = readFileSync(manifest);
    writeFileSync(manifest, JSON.stringify({ ...JSON.parse(original), version: '5.5.6' }));
    out = run(); assert.equal(out.status, 1); assert.match(out.stderr, /data: csv-parse installed version 5\.5\.6 differs from lockfile version 5\.6\.0/);
    const build = spawnSync(process.execPath, [join(scratch, 'tools', 'lib', 'build', 'one-file.mjs'), tool], { encoding: 'utf8' });
    assert.equal(build.status, 1); assert.match(build.stderr, /data: csv-parse/);
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
