import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runSiteCrawl } from '../scripts/site-crawl-core.js';
import { crawl } from '../scripts/crawl-core.js';
const cli = fileURLToPath(new URL('../scripts/site-crawl.js', import.meta.url));

test('local default bounds, delay, disk inventory and stdout summary stay unchanged', async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'site-crawl-local-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const delays = [];
  const summary = await runSiteCrawl(['crawl', '--start', 'https://example.com/', '--output', scratch], {
    fetch: async url => url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response('<title>Home</title>', { headers: { 'content-type': 'text/html' } }),
    lookup: async () => ['93.184.216.34'], sleep: async ms => { delays.push(ms); },
    now: () => new Date('2026-09-19T12:00:00.000Z')
  });
  assert.deepEqual(summary.bounds, { maxPages: 200, maxDepth: 5 });
  assert.deepEqual(delays, [250]);
  assert.equal(summary.pages, undefined);
  const inventory = JSON.parse(readFileSync(summary.file, 'utf8'));
  assert.equal(inventory.pages.length, 1);
  const expected = { ...inventory, file: summary.file };
  delete expected.pages;
  assert.deepEqual(summary, expected);
});

test('the named local NAT64 refusal is applied before network and also holds hosted', async () => {
  const start = 'http://[64:ff9b:1::1]/';
  const result = spawnSync(process.execPath, [cli, 'crawl', '--start', start, '--output', tmpdir()], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not routable on the public internet/);
  await assert.rejects(crawl({ start, delayMs: 0 }, [], () => assert.fail('fetch'), () => assert.fail('DNS')), /not routable on the public internet/);
});
