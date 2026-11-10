import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mainCli } from '../../lib/tests/main-cli.js';
import { writeZip } from '../../lib/archive-core.js';
import { seoData } from '../scripts/seo-core.js';
import cases from './fixtures/cases.json' with { type: 'json' };
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const cli = fileURLToPath(new URL('../scripts/seo-data.js', import.meta.url));
let old; const cleanup = [];
before(() => { old = mainCli({ after: f => cleanup.push(f) }, 'seo-data'); });
after(() => cleanup.forEach(f => f()));
for (const c of cases) test(c.name + ': CLI, main bytes and portable core', async t => {
  const work = mkdtempSync(join(tmpdir(), 'seo-case-')); t.after(() => rmSync(work, { recursive: true, force: true }));
  for (const name of c.zip || (c.file ? [c.file] : [])) writeFileSync(join(work, name), readFileSync(join(fixtures, name)));
  const files = c.zip ? [{ name: 'exports.zip', mediaType: 'application/zip', bytes: await writeZip(c.zip.map(name => ({ name, bytes: new Uint8Array(readFileSync(join(fixtures, name))) })), { maxBytes: 8 * 1024 * 1024 }) }]
    : c.file ? [{ name: c.file, mediaType: 'application/json', bytes: new Uint8Array(readFileSync(join(fixtures, c.file))) }] : [];
  if (c.expected.error) await assert.rejects(seoData(c.input, files), { message: c.expected.error });
  else assert.deepEqual(await seoData(c.input, files), c.expected);
  const args = [c.input.command];
  for (const [key, value] of Object.entries(c.input)) {
    if (key === 'command') continue;
    args.push('--' + key, ['input', 'queries', 'query-pages', 'previous-queries', 'targets'].includes(key) ? join(work, value) : value);
  }
  const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const prior = spawnSync(process.execPath, [old, ...args], { encoding: 'utf8' });
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(run[key], prior[key], key);
  if (!c.expected.error) assert.deepEqual(JSON.parse(run.stdout), c.expected);
  if (c.zip) {
    const dir = mkdtempSync(join(tmpdir(), 'seo-zip-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'exports.zip'), files[0].bytes);
    const args = Object.entries(c.input).filter(([key]) => key !== 'command').flatMap(([key, value]) => ['--' + key, value]);
    const zipped = spawnSync(process.execPath, [cli, c.input.command, '--archive', join(dir, 'exports.zip'), ...args], { encoding: 'utf8' });
    assert.equal(zipped.status, 0, zipped.stderr); assert.equal(zipped.stdout, run.stdout);
  }
});
test('refuses multiple files, oversized input and oversized answer whole; returns JSON output bytes', async () => {
  await assert.rejects(seoData({ command: 'audit' }, [{}, {}]), /one export/);
  await assert.rejects(seoData({ command: 'audit' }, [{ bytes: new Uint8Array(8 * 1024 * 1024 + 1) }]), /8 MiB/);
  const bundle = JSON.parse(readFileSync(join(fixtures, 'audit.json'))); bundle.site = 'x'.repeat(48000);
  await assert.rejects(seoData({ command: 'audit' }, [{ name: 'audit.json', bytes: new TextEncoder().encode(JSON.stringify(bundle)) }]), /48,000/);
  const result = await seoData({ command: 'previous-window', start: '2026-01-01', end: '2026-01-02', output: true });
  assert.equal(new TextDecoder().decode(result.files[0].bytes), JSON.stringify(result.answer, null, 2) + '\n');
});
test('shared cases run without Node modules or globals in their import graph', () => {
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
    import { portableModule } from ${JSON.stringify(new URL('../../lib/tests/portable-module.js', import.meta.url).href)};
    import { writeZip } from ${JSON.stringify(new URL('../../lib/archive-core.js', import.meta.url).href)};
    const core = await portableModule(${JSON.stringify(fileURLToPath(new URL('../scripts/seo-core.js', import.meta.url)))});
    const cases = JSON.parse(readFileSync(${JSON.stringify(join(fixtures, 'cases.json'))}, 'utf8'));
    for (const c of cases) {
      const entry = name => ({name, bytes:new Uint8Array(readFileSync(${JSON.stringify(fixtures)} + name))});
      const files = c.zip ? [{name:'exports.zip', bytes:await writeZip(c.zip.map(entry), {maxBytes:8388608})}] : c.file ? [entry(c.file)] : [];
      if (c.expected.error) await assert.rejects(core.seoData(c.input, files), {message:c.expected.error});
      else assert.equal(JSON.stringify(await core.seoData(c.input, files)), JSON.stringify(c.expected));
    }
  `], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
