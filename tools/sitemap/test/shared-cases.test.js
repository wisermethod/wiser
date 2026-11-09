import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliCase } from './fixtures/cli-case.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSnapshot } from '../scripts/snapshot-core.js';
import { fixtureNetwork } from './fixtures/network.mjs';
import { mainCli } from '../../lib/tests/main-cli.js';
import { gunzipSync } from 'node:zlib';
import cases from './fixtures/cases.json' with { type: 'json' };
const cli = fileURLToPath(new URL('../scripts/sitemap.js', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/cli-network.mjs', import.meta.url));
const cleanup = [];
let baseline;
before(() => { baseline = mainCli({ after: fn => cleanup.push(fn) }, 'sitemap'); });
after(() => cleanup.forEach(fn => fn()));
for (const c of cases) test(c.name, async (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sitemap-case-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const { args, expected } = cliCase(c, scratch);
  const env = { ...process.env, SITEMAP_CASE: c.name };
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete env[name];
  const run = spawnSync(process.execPath, ['--import', preload, cli, 'fetch', ...args], { env, encoding: 'utf8' });
  const old = spawnSync(process.execPath, ['--import', preload, baseline, 'fetch', ...args], { env, encoding: 'utf8' });
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(run[key], old[key], `main CLI ${key} bytes`);
  if (!c.offline) {
    const network = fixtureNetwork(c);
    const options = { gunzip: bytes => gunzipSync(bytes).toString('utf8') };
    if (expected.error) await assert.rejects(createSnapshot(c.input, network.fetch, network.lookup, options), { message: expected.error });
    else assert.deepEqual(await createSnapshot(c.input, network.fetch, network.lookup, options), expected);
    assert.deepEqual(network.requests, c.requests);
  }
  assert.equal(run.status, expected.error ? 1 : 0, run.stderr);
  if (expected.error) {
    assert.equal(run.stdout, '');
    assert.equal(run.stderr.trim(), expected.error);
  } else {
    assert.equal(run.stderr, '');
    assert.deepEqual(JSON.parse(run.stdout), expected);
  }
});
