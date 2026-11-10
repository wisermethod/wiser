import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { writeZip } from '../../lib/archive-core.js';
import { mainCli } from '../../lib/tests/main-cli.js';
import { seoData } from '../scripts/seo-core.js';
import { auditReport } from '../scripts/audit-core.js';

const encode = value => new TextEncoder().encode(value);
const bundle = () => JSON.parse(readFileSync(new URL('./fixtures/audit.json', import.meta.url), 'utf8'));
const cli = fileURLToPath(new URL('../scripts/seo-data.js', import.meta.url));
const capError = /answer reaches 48,000 serialized characters; refused whole/;

// These sentinels turn late refusals into test failures without allocating the
// millions of output objects that would exhaust a hosted isolate.
test('ZIP targets within the hosted input cap refuse before mapping an unbounded list', async t => {
  const targets = 'a\n'.repeat(900_000);
  const files = [{ name: 'exports.zip', bytes: await writeZip([
    { name: 'queries.json', bytes: encode('[{"keys":["a"],"clicks":1,"impressions":10,"ctr":0.1,"position":1}]') },
    { name: 'targets.txt', bytes: encode(targets) },
  ], { maxBytes: 8 * 1024 * 1024 }) }];
  assert.ok(files[0].bytes.length < 8 * 1024 * 1024);
  const map = Array.prototype.map;
  t.after(() => { Array.prototype.map = map; });
  Array.prototype.map = function (...args) {
    if (this.length > 1000 && this[0] === 'a') throw Error('unbounded target tracking array allocated');
    return Reflect.apply(map, this, args);
  };
  await assert.rejects(seoData({ command: 'keywords', queries: 'queries.json', targets: 'targets.txt', start: '2026-01-01', end: '2026-01-02' }, files), capError);
});

for (const section of ['targetKeywords', 'topQueries', 'topPages', 'organicTrend']) {
  test(`audit ${section} refuses before mapping the oversized output list`, () => {
    const input = bundle();
    let rows;
    if (section === 'targetKeywords') rows = input.targetKeywords = Array(2_000_000).fill('a');
    else if (section === 'organicTrend') rows = input.analytics.organicTraffic.rows = Array(50_000).fill({ dimensionValues: [{ value: '20260101' }], metricValues: [{ value: '1' }, { value: '2' }, { value: '3' }] });
    else rows = input.searchConsole[section] = Array(50_000).fill({ keys: ['a'], clicks: 1, impressions: 10, ctr: 0.1, position: 1 });
    rows.map = () => { throw Error(`unbounded ${section} output array allocated`); };
    assert.throws(() => auditReport(input, 'audit.json'), capError);
  });
}

test('BOM audit bundle is accepted through hosted bytes and the CLI', async t => {
  const plain = encode(JSON.stringify(bundle()));
  const bom = new Uint8Array(plain.length + 3);
  bom.set([0xef, 0xbb, 0xbf]); bom.set(plain, 3);
  const expected = await seoData({ command: 'audit' }, [{ name: 'audit.json', bytes: plain }]);
  await t.test('hosted', async () => {
    assert.deepEqual(await seoData({ command: 'audit' }, [{ name: 'audit.json', bytes: bom }]), expected);
  });
  await t.test('command line matches main on the same bundle without a BOM', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-bom-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'audit.json');
    writeFileSync(path, plain);
    const old = mainCli(t, 'seo-data');
    const prior = spawnSync(process.execPath, [old, 'audit', '--input', path], { encoding: 'utf8' });
    assert.equal(prior.status, 0, prior.stderr);
    writeFileSync(path, bom);
    const run = spawnSync(process.execPath, [cli, 'audit', '--input', path], { encoding: 'utf8' });
    for (const key of ['status', 'stdout', 'stderr']) assert.equal(run[key], prior[key], key);
  });
});

test('BOM Search Console JSON is also stripped for hosted keywords', async () => {
  const bytes = readFileSync(new URL('./fixtures/queries.json', import.meta.url));
  const bom = new Uint8Array(bytes.length + 3); bom.set([0xef, 0xbb, 0xbf]); bom.set(bytes, 3);
  const input = { command: 'keywords', start: '2026-01-01', end: '2026-01-02' };
  assert.deepEqual(await seoData(input, [{ name: 'queries.json', bytes: bom }]), await seoData(input, [{ name: 'queries.json', bytes: new Uint8Array(bytes) }]));
});
