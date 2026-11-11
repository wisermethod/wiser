import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { harvest } from '../scripts/harvest-core.js';
import { collectUrl } from '../scripts/adapters/urls.js';
import { fetchText } from '../scripts/lib/fetch.js';

const hashId = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const lookup = async () => ['93.184.216.34'];
const request = {name:'review-b1r2', consumer:'tests', timebox:{from:'2026-01-01',to:'2026-12-31'}, topics:[], sources:[{type:'rss',url:'https://feed.test/rss'}]};
const feed = (count, description = '') => '<rss><channel>' + Array.from({length:count}, (_, i) => `<item><title>Item ${i}</title><link>https://feed.test/${i}</link><description>${description}</description></item>`).join('') + '</channel></rss>';
const run = (r, fetch = async () => new Response(feed(1))) => harvest({command:'run',request:r}, [], fetch, lookup, {hashId});
const isOutputCap = error => error.fatal === true && /output exceeds.*projected/.test(error.message);

// Poison only the complete candidate bundle, leaving request and answer JSON
// untouched. A failing baseline cannot allocate the review's 900 MB string.
async function withoutBundleStringify(fn) {
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = function(value, ...args) {
    if (value?.schema_version === 1 && Array.isArray(value.candidates)) {
      calls++;
      throw new Error('complete bundle stringify reached before projected refusal');
    }
    return original.call(this, value, ...args);
  };
  try { await fn(); assert.equal(calls, 0); }
  finally { JSON.stringify = original; }
}

for (const field of ['topics','sourceTopics','exclude_terms','include_terms']) test(`UTF-8 byte cap: ${field} refuses before fetching or bundle stringify`, async () => {
  const r = structuredClone(request);
  const terms = field === 'topics' ? Array.from({length:100}, (_, i) => `${i}:` + '_'.repeat(8990)) : ['😀'.repeat(4097)];
  if (field === 'topics') r.topics = terms;
  else if (field === 'sourceTopics') r.sources[0].topics = terms;
  else r.filters = {[field]:terms};
  assert.ok(new TextEncoder().encode(JSON.stringify(r)).length < 1048576);
  let fetches = 0;
  await withoutBundleStringify(async () => {
    await assert.rejects(run(r, async () => { fetches++; return new Response(feed(1000)); }), error => error.fatal && /16 KiB.*topics|16 KiB.*terms/.test(error.message));
    assert.equal(fetches, 0);
  });
});

test('topic bytes combine request and active sources, ignoring disabled sources', async () => {
  const r = structuredClone(request);
  r.topics = ['é'.repeat(4096)];
  r.sources[0].topics = ['😀'.repeat(2048)];
  r.sources.push({enabled:false,topics:['_'.repeat(900000)]});
  r.filters = {exclude_terms:['é'.repeat(8192)],include_terms:['Item', '_'.repeat(16380)]};
  assert.equal((await run(r)).answer.candidate_count, 1);
  r.sources[0].topics[0] += 'a';
  await assert.rejects(run(r), /16 KiB.*topics/);
});

for (const field of ['exclude_terms','include_terms']) test(`term bytes: ${field} counts the whole list`, async () => {
  const r = {...request,filters:{[field]:['é'.repeat(4096), '😀'.repeat(2048), 'a']}};
  let fetched = false;
  await assert.rejects(run(r, async () => {fetched=true; return new Response(feed(1));}), /16 KiB.*terms/);
  assert.equal(fetched,false);
});

test('1,000 candidates repeating in-budget topics refuse before bundle stringify', async () => {
  await withoutBundleStringify(() => assert.rejects(run({...request,topics:['_'.repeat(16384)]}, async () => new Response(feed(1000))), isOutputCap));
});

test('two full-text feeds under the fetch caps refuse on projected bytes before bundle stringify', async () => {
  const xml = feed(1, 'x'.repeat(1024 * 1024 - 1024));
  assert.ok(new TextEncoder().encode(xml).length < 1048576);
  const r = {...request,sources:[request.sources[0],{...request.sources[0],url:'https://feed.test/second'}]};
  let fetched = 0;
  await withoutBundleStringify(async () => {
    await assert.rejects(run(r, async () => new Response(xml.replace('Item 0', `Item ${fetched++}`).replace('https://feed.test/0', `https://feed.test/${fetched}`))), isOutputCap);
    assert.equal(fetched, 2);
  });
});

test('unselected candidate JSON is not charged to a Markdown-only harvest', async () => {
  const result = await run({...request,topics:['_'.repeat(16384)],output:{json:false}}, async () => new Response(feed(1000)));
  assert.equal(result.answer.candidate_count,1000);
});

for (const complete of [false,true]) test(`repeated metadata hits the run deadline inside a bounded Worker (${complete ? 'attributes' : 'unfinished tag'})`, async () => {
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fixtures/review-b1r2-meta.mjs', import.meta.url), {workerData:{complete},resourceLimits:{maxOldGenerationSizeMb:64}});
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('metadata scan did not return its deadline refusal within 1,500 ms')); }, 1500);
    worker.once('message', message => {clearTimeout(timer); resolve(message);});
    worker.once('error', error => {clearTimeout(timer); reject(error);});
    worker.once('exit', code => {if (code) {clearTimeout(timer); reject(new Error(`metadata Worker exited ${code}`));}});
  });
  assert.equal(result.fatal,true);
  assert.match(result.message,/15-second deadline/);
  const threshold = complete ? 750 : 75;
  assert.ok(result.ticks >= threshold && result.ticks < threshold + 15, JSON.stringify(result));
});

test('metadata retains property/name priority, both attribute orders, entities and title fallback', async () => {
  const source = {type:'url',url:'https://feed.test/article'};
  const ctx = html => ({fetch:async () => new Response(html),lookup,hashId,timeoutMs:1000,maxBodyBytes:1048576});
  const html = '<meta name="og:title" content="name title">' +
    '<META content="reverse property" property="og:title">' +
    '<meta property="og:title" content="forward &amp; title">' +
    '<meta content="Description &quot;quoted&quot;" name="description">' +
    '<meta name="author" content="A &amp; B"><meta content="2026-07-01" property="article:published_time">';
  const [item] = await collectUrl(source,ctx(html));
  assert.equal(item.title,'forward & title');
  assert.equal(item.summary,'Description "quoted"');
  assert.equal(item.author,'A & B');
  assert.equal(item.published_at,'2026-07-01T00:00:00.000Z');
  assert.equal((await collectUrl(source,ctx('<title> Plain &amp; title </title>')))[0].title,'Plain & title');
});

for (const status of [500,302]) for (const [length, received] of [[2097153,0],[23,4194290]]) test(`HTTP ${status} charges over-cap Content-Length and still cancels (${length}, ${received})`, async () => {
  let cancelled = false;
  const body = new ReadableStream({start(c) {c.enqueue(new Uint8Array(1)); c.enqueue(new Uint8Array(length - 1));},cancel() {cancelled=true;}});
  const ctx = {fetch:async () => new Response(body,{status,headers:{'Content-Length':String(length)}}), lookup, timeoutMs:1000, maxBodyBytes:1048576, receivedBytes:received};
  await assert.rejects(fetchText('https://feed.test/a','*/*',ctx), error => error.fatal && /fetched body/.test(error.message));
  assert.equal(cancelled,true);
  assert.equal(ctx.receivedBytes,received + length);
});

test('fetchText without an explicit body cap still uses the 1 MiB bound', async () => {
  await assert.rejects(fetchText('https://feed.test/a','*/*',{fetch:async () => new Response('x'.repeat(1048577)),lookup,timeoutMs:1000}), error => error.fatal && /fetched body/.test(error.message));
});

test('the unused filesystem renderer is removed with its last committed text archived', () => {
  assert.equal(existsSync(new URL('../scripts/lib/render.js',import.meta.url)),false);
  const expected = execFileSync('git',['show','c88b4613:tools/Content Harvester/scripts/lib/render.js'],{cwd:process.env.WISER_TEST_SOURCE_ROOT || new URL('../../../',import.meta.url)});
  assert.deepEqual(readFileSync(new URL('../scripts/lib/zArchive/26-11-09 V2 - render.js',import.meta.url)), expected);
});
