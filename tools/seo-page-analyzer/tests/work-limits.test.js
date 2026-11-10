import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { offlineEnv } from '../../lib/tests/main-cli.js';
import { analyzeHtml } from '../scripts/analyze-core.js';

const input = { url: 'https://example.com/', analyzedAt: '2026-11-09T00:00:00.000Z' };
const files = html => [{ name: 'page.html', mediaType: 'text/html', bytes: new TextEncoder().encode(html) }];
const cli = fileURLToPath(new URL('../scripts/analyze.js', import.meta.url));
const jsonLd = text => '<script type="application/ld+json">' + text + '</script>';
const objects = count => '[' + Array(count).fill('{}').join(',') + ']';

function cliRefuses(t, html, reason) {
  const dir = mkdtempSync(join(tmpdir(), 'seo-work-limit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'page.html');
  writeFileSync(path, html);
  const run = spawnSync(process.execPath, [cli, 'analyze', '--html', path, '--page-url', input.url], { encoding: 'utf8', env: offlineEnv(), timeout: 15000 });
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, reason);
}

test('200,000 empty JSON-LD objects refuse whole within 15 seconds', t => {
  // Isolate the formerly quadratic walk so a regression cannot hang the suite.
  const script = `
    import assert from 'node:assert/strict';
    import { analyzeHtml } from ${JSON.stringify(new URL('../scripts/analyze-core.js', import.meta.url).href)};
    const html = '<script type="application/ld+json">[' + Array(200000).fill('{}').join(',') + ']</script>';
    const bytes = new TextEncoder().encode(html);
    assert.ok(bytes.byteLength < 1024 * 1024);
    await assert.rejects(analyzeHtml({ url: 'https://example.com/' }, [{ name: 'page.html', mediaType: 'text/html', bytes }]), /JSON-LD exceeds 10,000 values across the page/);
  `;
  const start = performance.now();
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  assert.ok(performance.now() - start < 15000);
  cliRefuses(t, jsonLd(objects(200000)), /JSON-LD exceeds 10,000 values across the page/);
});

test('JSON-LD values share one page budget, including graphs and unreported properties', async t => {
  const reason = /JSON-LD exceeds 10,000 values across the page/;
  for (const html of [
    jsonLd(objects(6000)) + jsonLd(objects(6000)),
    jsonLd('{"@graph":' + objects(10000) + '}'),
    jsonLd('{"unreported":' + objects(10000) + '}'),
    jsonLd('[' + Array(10000).fill('null').join(',') + ']')
  ]) await assert.rejects(analyzeHtml(input, files(html)), reason);
  cliRefuses(t, jsonLd(objects(6000)) + jsonLd(objects(6000)), reason);
  const boundary = await analyzeHtml(input, files(jsonLd(objects(9999))));
  assert.equal(boundary.structuredData.hasSchema, false);
  const graph = await analyzeHtml(input, files(jsonLd('{"@graph":[{"@type":"WebPage","name":"Page"},{"@graph":[{"@type":"Thing"}]},{"@type":"Organization"}]}')));
  assert.deepEqual(graph.structuredData.schemas.map(schema => schema.type), ['WebPage', 'Organization', 'Thing']);
});

test('one late heading closer refuses before copying the page thousands of times', async t => {
  // Keep the pre-fix failure safe to run; the CLI checks the larger attack too.
  const html = '<h1>'.repeat(4095) + 'a'.repeat(2048) + '</h1>';
  const reason = /heading text exceeds 4,194,304 source characters in total/;
  const start = performance.now();
  await assert.rejects(analyzeHtml(input, files(html)), reason);
  assert.ok(performance.now() - start < 15000);
  cliRefuses(t, '<h1>'.repeat(4095) + 'a'.repeat(256 * 1024) + '</h1>', reason);
});

test('the heading copy budget is shared by H1, H2 and H3 and accepts its boundary', async () => {
  const budget = 4 * 1024 * 1024;
  // Sixteen overlapping whitespace-only headings sum to exactly the budget,
  // without the independent serialized-answer cap masking this boundary.
  const padding = (budget - 4 * (15 * 16 / 2)) / 16;
  const exact = '<h1>'.repeat(16) + ' '.repeat(padding) + '</h1>';
  assert.equal((await analyzeHtml(input, files(exact))).headings.h1Count, 0);
  await assert.rejects(analyzeHtml(input, files(exact.replace('</h1>', ' </h1>'))), /heading text exceeds 4,194,304/);
  const mixed = '<h1>'.repeat(8) + '<h2>'.repeat(8) + '<h3>'.repeat(8) + ' '.repeat(200000) + '</h1></h2></h3>';
  await assert.rejects(analyzeHtml(input, files(mixed)), /heading text exceeds 4,194,304/);
});
