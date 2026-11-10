import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import { readZip } from '../../lib/archive-core.js';
import { harvest } from '../scripts/harvest-core.js';
import { fixtureNetwork, fixedTime } from './fixtures/network.mjs';
const fixture = fileURLToPath(new URL('./fixtures/', import.meta.url));
const cli = fileURLToPath(new URL('../scripts/harvest.js', import.meta.url));
const preload = join(fixture, 'cli-network.mjs');
const legacy = join(fixture, 'node18-globals.mjs');
const hashId = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const cases = Array.from({ length: 4 }, (_, i) => JSON.parse(readFileSync(join(fixture, `case-${i}.json`))));
const cleanup = []; let old;
before(() => { old = join(dirname(mainCli({ after: f => cleanup.push(f) }, 'Content Harvester')), 'harvest.js'); });
after(() => cleanup.forEach(f => f()));
for (const [i, c] of cases.entries()) test(c.name + ': main bytes, CLI and core ZIP', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'harvest-case-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'request.json'); writeFileSync(path, JSON.stringify(c.request));
  const env = offlineEnv({ HARVEST_CASE: join(fixture, `case-${i}.json`) });
  const runs = [[], ['--import', legacy]].flatMap(flags => [old, cli].map(script => spawnSync(process.execPath, [...flags, '--import', preload, script, 'run', '--request', path, '--output', dir], { encoding: 'utf8', env })));
  for (const run of runs) assert.equal(run.status, 0, run.stderr);
  for (const run of runs.slice(1)) for (const key of ['status', 'stdout', 'stderr']) assert.equal(run[key], runs[0][key], key);
  const output = JSON.parse(runs[1].stdout).output_directory;
  const actual = Object.fromEntries(readdirSync(output).sort().map(name => [name, readFileSync(join(output, name), 'utf8').replaceAll(output, 'OUTPUT')]));
  assert.deepEqual(actual, c.expected.files);
  const network = fixtureNetwork(c);
  const result = await harvest({ command: 'run', outputDirectory: 'OUTPUT' }, [{ name: 'request.json', bytes: new Uint8Array(readFileSync(path)) }], network.fetch, network.lookup, { now: () => new Date(fixedTime), hashId });
  assert.deepEqual(result.answer, c.expected.answer);
  const unpacked = await readZip(result.files[0].bytes, { maxBytes: 4 * 1024 * 1024 });
  assert.deepEqual(Object.fromEntries(unpacked.map(file => [file.name, new TextDecoder().decode(file.bytes)])), c.expected.files);
  if (i === 2) assert.deepEqual(network.requests, ['https://news.test/redirect']);
});
test('limits refuse whole, including answer, output ZIP, sources, arguments and fetched bodies', async () => {
  const c = cases[1], request = c.request, network = fixtureNetwork(c);
  const run = (input, files = [], fetch = network.fetch) => harvest(input, files, fetch, network.lookup, {hashId});
  await assert.rejects(run({ command: 'run', request }, [{}, {}]), /at most one/);
  await assert.rejects(run({ command: 'run', request }, [{ bytes: new Uint8Array(1048577) }]), /1 MiB/);
  await assert.rejects(run({ command: 'run', request: { ...request, sources: Array(26).fill(request.sources[0]) } }), /25 active/);
  await assert.rejects(run({ command: 'run', request, outputDirectory: 'x'.repeat(48000) }), /48,000/);
  await assert.rejects(run({ command: 'run', request }, [], async () => new Response('x'.repeat(1048577))), /fetched body/);
  // Repeated source text makes a large output without exceeding each body cap.
  const huge = '<rss><channel><item><title>Solar</title><link>https://news.test/big</link><description>' + 'x'.repeat(800000) + '</description></item></channel></rss>';
  await assert.rejects(run({ command: 'run', request: { ...request, sources: Array.from({ length: 5 }, (_, i) => ({ ...request.sources[0], url: `https://news.test/${i}`, source: 'same' })) } }, [], async url => new Response(huge.replace('Solar</title>', `Solar ${url}</title>`).replace('https://news.test/big', String(url)))), /output exceeds/);
});
for (const stage of ['DNS', 'fetch', 'body']) test(`deadline refuses a stalled ${stage} whole`, async () => {
  const c = cases[1], hang = () => new Promise(() => {}), network = fixtureNetwork(c);
  const fetch = stage === 'fetch' ? hang : stage === 'body' ? async () => new Response(new ReadableStream({ start() {} })) : network.fetch;
  await assert.rejects(harvest({ command: 'run', request: c.request }, [], fetch, stage === 'DNS' ? hang : network.lookup, { timeoutMs: 20, hashId }), /15-second deadline/);
});
test('all shared cases run in a Worker-like import graph without Node APIs', () => {
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--experimental-import-meta-resolve', fileURLToPath(new URL('./portable-runner.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
