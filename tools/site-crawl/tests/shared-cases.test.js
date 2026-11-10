import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawl } from '../scripts/crawl-core.js';
import { cliArgs, fixtureNetwork, FIXED_TIME } from './fixtures/network.mjs';
import { mainCli } from '../../lib/tests/main-cli.js';
const cases = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url)));
const cli = fileURLToPath(new URL('../scripts/site-crawl.js', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/cli-network.mjs', import.meta.url));
let baseline;
const cleanup = [];
before(() => { baseline = mainCli({ after: fn => cleanup.push(fn) }, 'site-crawl'); });
after(() => cleanup.forEach(fn => fn()));
for (const c of cases) test(`shared: ${c.name}`, async t => {
  const expected = JSON.parse(readFileSync(new URL(`./fixtures/${c.expected}`, import.meta.url)));
  const scratch = mkdtempSync(join(tmpdir(), 'site-crawl-shared-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const args = cliArgs(c.input, scratch);
  const env = { ...process.env, SITE_CRAWL_CASE: c.name };
  const run = script => spawnSync(process.execPath, ['--import', preload, script, ...args], { env, encoding: 'utf8', timeout: 10000 });
  const old = run(baseline);
  const oldFile = old.status === 0 ? readFileSync(JSON.parse(old.stdout).file, 'utf8') : null;
  if (oldFile) rmSync(JSON.parse(old.stdout).file);
  const current = run(cli);
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(current[key], old[key], `main CLI ${key} bytes`);
  assert.equal(current.status, expected.error ? 1 : 0, current.stderr);
  const network = fixtureNetwork(c);
  if (expected.error) {
    assert.equal(current.stdout, '');
    assert.equal(current.stderr, `${expected.error}\n`);
    await assert.rejects(crawl(c.input, [], network.fetch, network.lookup, { now: () => new Date(FIXED_TIME) }), { message: expected.error });
  } else {
    const file = readFileSync(JSON.parse(current.stdout).file, 'utf8');
    assert.equal(file, oldFile, 'main inventory bytes');
    assert.equal(file, `${JSON.stringify(expected, null, 2)}\n`, 'golden inventory bytes');
    assert.deepEqual(await crawl(c.input, [], network.fetch, network.lookup, { now: () => new Date(FIXED_TIME) }), expected);
  }
  assert.deepEqual(network.requests, c.requests);
});

test('shared cases run in a Worker-like module graph without Node imports or globals', () => {
  const runner = fileURLToPath(new URL('./fixtures/portable-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', runner], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `portable: ${cases.length} crawl cases`);
});

test('help remains byte-identical to main', () => {
  const run = script => spawnSync(process.execPath, [script, 'help'], { encoding: 'utf8' });
  const current = run(cli), old = run(baseline);
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(current[key], old[key]);
});
