import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { harvest } from '../scripts/harvest-core.js';
import { normalizeCandidate } from '../scripts/lib/normalize.js';
import { collectFeed } from '../scripts/adapters/rss.js';
import { rankCandidates } from '../scripts/lib/rank.js';
import { filterCandidates } from '../scripts/lib/filter.js';
import { fetchText } from '../scripts/lib/fetch.js';
const hashId = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const lookup = async () => ['93.184.216.34'];
const request = { name:'regression', consumer:'tests', timebox:{from:'2026-01-01',to:'2026-12-31'}, topics:[], sources:[{type:'rss',url:'https://feed.test/rss'}] };
const feed = count => '<rss><channel>' + Array.from({length:count}, (_, i) => `<item><title>Item ${i}</title><link>https://feed.test/${i}</link></item>`).join('') + '</channel></rss>';
const context = extra => ({fetch:async () => new Response(feed(2)), lookup, hashId, timeoutMs:1000, maxBodyBytes:1048576, receivedBytes:0, ...extra});
const run = (r=request, fetch=async () => new Response(feed(1)), options={}) => harvest({command:'run',request:r}, [], fetch, lookup, {hashId, ...options});
for (const field of ['topics','sourceTopics','exclude_terms','include_terms']) test(`refuses more than 100 ${field} before fetching`, async () => {
  const r = structuredClone(request), terms = Array.from({length:15000}, (_, i) => `term${i}`);
  if (field === 'topics') r.topics = terms;
  else if (field === 'sourceTopics') r.sources[0].topics = terms;
  else r.filters = {[field]:terms};
  let calls = 0;
  const largeFeed = feed(20).replaceAll('</item>', '<description>' + 'x'.repeat(40000) + '</description></item>');
  assert.ok(new TextEncoder().encode(JSON.stringify(r)).length < 1048576);
  assert.ok(new TextEncoder().encode(largeFeed).length < 1048576);
  const start = performance.now();
  await assert.rejects(run(r, async () => { calls++; return new Response(largeFeed); }), /100.*topics|100.*terms/);
  assert.equal(calls, 0); assert.ok(performance.now() - start < 500);
});
test('refuses the whole run above 1,000 items, including across sources', async () => {
  await assert.rejects(run(request, async () => new Response(feed(1001))), /1,000.*items/);
  const r = {...request, sources:[...request.sources, {...request.sources[0],url:'https://feed.test/second'}]};
  await assert.rejects(run(r, async () => new Response(feed(501))), /1,000.*items/);
});
test('accepts exactly 100 topics/terms and 1,000 items without trimming', async () => {
  const r = {...request, topics:Array.from({length:50}, (_, i) => `topic${i}`),
    sources:[{...request.sources[0],topics:Array.from({length:50}, (_, i) => `source${i}`)}],
    filters:{exclude_terms:Array.from({length:100}, (_, i) => `excluded${i}`),include_terms:Array(100).fill('item')}
  };
  const result = await run(r,async () => new Response(feed(1000)));
  assert.equal(result.answer.candidate_count,1000);
  await assert.rejects(run({...r,topics:[...r.topics,'one-too-many']}), /100 topics/);
});
const expired = () => { throw Object.assign(new Error('deadline checked inside loop'), {fatal:true}); };
test('synchronous XML parsing checks the deadline inside parser callbacks', async () => {
  let checkedInside = false;
  await assert.rejects(collectFeed(request.sources[0], context({check() {
    if (/OrderedObjParser|node2json/.test(new Error().stack)) { checkedInside = true; expired(); }
  }})), /deadline checked inside loop/);
  assert.equal(checkedInside, true);
});
test('topic matching checks the deadline within its term loop', async () => {
  await assert.rejects(normalizeCandidate({url:'https://feed.test/a',title:'solar'}, context({requestTopics:['solar','energy'], check() {
    if (/matchTopics/.test(new Error().stack)) expired();
  }})), /deadline checked inside loop/);
});
test('ranking checks the deadline within mapping and sorting', () => {
  const candidates = Array.from({length:3}, (_, i) => ({source_role:'primary',matched_topics:[],summary:'',content:'',score:i}));
  for (const loop of ['map','sort']) {
    assert.throws(() => rankCandidates(candidates, request, () => {
      if (new RegExp(`Array\\.${loop}`).test(new Error().stack)) expired();
    }), /deadline checked inside loop/);
  }
});
test('filtering checks the deadline within both exclude and include loops', () => {
  for (const field of ['exclude_terms','include_terms']) {
    assert.throws(() => filterCandidates([{url:'https://feed.test/a',title:'solar'}], {...request,filters:{[field]:['a','b']}}, () => {
      if (/Array\.(find|some)/.test(new Error().stack)) expired();
    }), /deadline checked inside loop/);
  }
});
test('the monotonic deadline refuses synchronous work before the timer can fire', async () => {
  let time = 0;
  await assert.rejects(run(request, async () => {time=15001; return new Response(feed(1));}, {clock:() => time}), /15-second deadline/);
});
test('a timer winner leaves no unhandled rejection from later aborted work', async () => {
  const unhandled = [], onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(run(request, (_url, {signal}) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('aborted later','AbortError')), 5), {once:true});
    }), {timeoutMs:10}), /15-second deadline/);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.deepEqual(unhandled, []);
  } finally { process.removeListener('unhandledRejection', onUnhandled); }
});
test('host hash injection works without global crypto and preserves ids', async () => {
  let calls = 0;
  const candidate = await normalizeCandidate({url:'https://feed.test/a',title:'solar'}, context({hashId:value => {calls++; return hashId(value);}}));
  assert.equal(candidate.id, hashId('https://feed.test/a|')); assert.equal(calls, 1);
});
test('a missing host hash is a fatal refusal rather than an empty successful run', async () => {
  await assert.rejects(harvest({command:'run',request},[],context().fetch,lookup), error => error.fatal && /host must supply.*hashId/.test(error.message));
});
test('non-2xx buffered bytes are counted and the body is cancelled before status failure', async () => {
  for (const status of [500,302]) {
    let cancelled = false;
    const body = new ReadableStream({start(c) {c.enqueue(new Uint8Array(23));},cancel() {cancelled=true;}});
    const ctx = context({fetch:async () => new Response(body,{status})});
    await assert.rejects(fetchText('https://feed.test/a','*/*',ctx), /HTTP/);
    assert.equal(cancelled,true); assert.equal(ctx.receivedBytes,23);
  }
});
test('non-2xx bytes cross the same fatal per-body and cumulative caps', async () => {
  for (const [size,received] of [[1048577,0],[5,4194302]]) {
    let cancelled = false;
    const body = new ReadableStream({start(c) {c.enqueue(new Uint8Array(size));},cancel() {cancelled=true;}});
    const ctx = context({receivedBytes:received,fetch:async () => new Response(body,{status:500})});
    await assert.rejects(fetchText('https://feed.test/a','*/*',ctx), error => error.fatal && /fetched body/.test(error.message));
    assert.equal(cancelled,true); assert.equal(ctx.receivedBytes,received+size);
  }
});
test('a non-2xx body that sends nothing is cancelled without waiting for data', async () => {
  let cancelled = false;
  const body = new ReadableStream({cancel() {cancelled=true;}});
  await assert.rejects(fetchText('https://feed.test/a','*/*',context({fetch:async () => new Response(body,{status:500})})), /HTTP 500/);
  assert.equal(cancelled,true);
});
test('only run is supported by the core; CLI-only preparation branches are removed', async () => {
  for (const input of [{command:'sample'},{command:'validate',request},{command:'run',request,dryRun:true}]) {
    await assert.rejects(harvest(input,[],context().fetch,lookup,{hashId}), /hosted command must be run|dryRun/);
  }
  assert.equal(existsSync(new URL('../scripts/lib/destination.js',import.meta.url)),false);
  // The retired screen's last committed text is kept beside it; the test no longer reads git, which a release's detached tree does not have at that path.
  assert.match(readFileSync(new URL('../scripts/lib/zArchive/26-11-09 V1 - destination.js',import.meta.url),'utf8'), /export async function destinationReason/);
});
test('hosted documentation states caps, synchronous deadline coverage and the DNS reconnect residual', () => {
  const doc = readFileSync(new URL('../TOOL.md',import.meta.url),'utf8');
  for (const pattern of [/100.*topics/,/100.*exclude/,/1,000.*items/,/pars.*match.*rank.*filter/is,/resolves.*again/i,/own transport/i,/Wiser.s domains/,/public addresses/]) assert.match(doc,pattern);
  assert.doesNotMatch(doc,/No run opens a connection to a loopback/);
});
