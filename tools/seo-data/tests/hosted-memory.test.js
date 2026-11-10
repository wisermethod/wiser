import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mainCli } from '../../lib/tests/main-cli.js';
import { writeZip } from '../../lib/archive-core.js';
const scriptBase = process.env.SEO_DATA_TEST_SCRIPTS
  ? pathToFileURL(process.env.SEO_DATA_TEST_SCRIPTS + '/') : new URL('../scripts/', import.meta.url);
const { seoData } = await import(new URL('seo-core.js', scriptBase));
const { keywordReport } = await import(new URL('keywords-report-core.js', scriptBase));
const answerSize = await import(new URL('answer-size.js', scriptBase));

const MiB = 1024 * 1024;
const capError = /answer reaches 48,000 serialized characters; refused whole/;
const rowError = /keyword input exceeds 10,000 rows; refused whole/;
const window = { command: 'keywords', queries: 'q.json', start: '2026-01-01', end: '2026-01-02' };
const bundle = () => JSON.parse(readFileSync(new URL('./fixtures/audit.json', import.meta.url), 'utf8'));
const row = (query = 'a', page) => ({ keys: page === undefined ? [query] : [query, page], clicks: 10, impressions: 50, ctr: 0.2, position: 1 });
const file = (text, name = 'audit.json') => ({ name, bytes: new TextEncoder().encode(text) });

// One deflated entry, built without an intermediate stored ZIP of the full text.
function zip(text, name = 'audit.json') {
  const body = Buffer.from(text), packed = deflateRawSync(body), filename = Buffer.from(name);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30 + filename.length), central = Buffer.alloc(46 + filename.length), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(filename.length, 26); filename.copy(local, 30);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(filename.length, 28); filename.copy(central, 46);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + packed.length, 16);
  return { name: 'exports.zip', bytes: Buffer.concat([local, packed, central, end]) };
}

async function beforeParse(text, input, expected, name = 'audit.json') {
  const parse = JSON.parse;
  let parsed = false;
  JSON.parse = value => { parsed = true; throw Error('JSON.parse ran before refusal'); };
  try { await assert.rejects(seoData(input, [file(text, name)]), expected); }
  finally { JSON.parse = parse; }
  assert.equal(parsed, false);
}

test('hosted plain-file cap is 2 MiB, inclusive', async () => {
  const text = JSON.stringify(bundle());
  await seoData({ command: 'audit' }, [file(text.padEnd(2 * MiB))]);
  await assert.rejects(seoData({ command: 'audit' }, [file(text.padEnd(2 * MiB + 1))]), /input exceeds 2 MiB/);
  await assert.rejects(seoData({ command: 'previous-window', start: '2026-01-01', end: '2026-01-02', extra: 'a'.repeat(2 * MiB) }), /arguments exceed 2 MiB/);
});

test('hosted ZIP cap is 2 MiB and expanded total is 8 MiB, inclusive', async () => {
  const text = JSON.stringify(bundle());
  await seoData({ command: 'audit' }, [zip(text.padEnd(8 * MiB))]);
  await assert.rejects(seoData({ command: 'audit' }, [zip(text.padEnd(8 * MiB + 1))]), /expanded total/);
  await assert.rejects(seoData({ command: 'audit' }, [{ name: 'exports.zip', bytes: new Uint8Array(2 * MiB + 1) }]), /input exceeds 2 MiB/);
});

for (const section of ['targetKeywords', 'topQueries', 'topPages', 'organicTrend']) {
  test(`hosted audit ${section} counts before JSON.parse`, async () => {
    const input = bundle();
    if (section === 'targetKeywords') input.targetKeywords = Array(1200).fill('a');
    else if (section === 'organicTrend') input.analytics.organicTraffic.rows = Array(1200).fill({ dimensionValues: [{ value: '20260101' }], metricValues: [{ value: '1' }, { value: '2' }, { value: '3' }] });
    else input.searchConsole[section] = Array(1200).fill(row());
    await beforeParse(JSON.stringify(input), { command: 'audit' }, capError);
  });
}

for (const envelope of [false, true]) {
  test(`keyword row cap precedes JSON.parse (${envelope ? 'rows envelope' : 'bare array'})`, async () => {
    const rows = Array(10001).fill(row());
    await beforeParse(JSON.stringify(envelope ? { rows } : rows), window, rowError, 'q.json');
  });
}

test('pre-parse counts include escaped field names and ignore punctuation inside strings', async () => {
  const input = bundle(); input.targetKeywords = Array(1200).fill('quote"[,]\\');
  await beforeParse(JSON.stringify(input).replace('"targetKeywords"', '"target\\u004beywords"'), { command: 'audit' }, capError);
  input.targetKeywords = ['quote"[,]\\'];
  assert.equal((await seoData({ command: 'audit' }, [file(JSON.stringify(input))])).targetKeywords.length, 1);
});

for (const option of ['previous-queries', 'query-pages']) {
  test(`hosted ${option} row cap runs before parsing that file`, async () => {
    const oversized = JSON.stringify({ rows: Array(10001).fill(row('a', option === 'query-pages' ? '/' : undefined)) });
    const archive = { name: 'exports.zip', bytes: await writeZip([file(JSON.stringify([row()]), 'q.json'), file(oversized, 'extra.json')], { maxBytes: 2 * MiB }) };
    const parse = JSON.parse; let parsed = false;
    JSON.parse = function (text, ...args) {
      if (text === oversized) { parsed = true; throw Error('oversized optional file parsed'); }
      return Reflect.apply(parse, this, [text, ...args]);
    };
    try { await assert.rejects(seoData({ ...window, [option]: 'extra.json' }, [archive]), rowError); }
    finally { JSON.parse = parse; }
    assert.equal(parsed, false);
  });
}

test('escaped answer strings refuse before serializing a large answer', async () => {
  const input = bundle(); input.site = '\u0001'.repeat(20000);
  const bytes = file(JSON.stringify(input));
  const stringify = JSON.stringify;
  JSON.stringify = function (value, ...args) {
    if (value?.searchPerformance) throw Error('serialized oversized answer');
    return Reflect.apply(stringify, this, [value, ...args]);
  };
  try { await assert.rejects(seoData({ command: 'audit' }, [bytes]), capError); }
  finally { JSON.stringify = stringify; }
  for (const value of [null, true, 1e300, { a: '\u0001\b\t\n\f\r"\\\ud800\udc00\ud800' }, ['a', null, { z: '\udfff' }]]) {
    answerSize.checkAnswerValueSize(value);
    const item = JSON.stringify(value);
    const fits = Array(Math.floor(47998 / (item.length + 1))).fill(value);
    assert.ok(JSON.stringify(fits).length < 48000);
    answerSize.checkAnswerValueSize(fits);
    fits.push(value);
    assert.ok(JSON.stringify(fits).length >= 48000);
    assert.throws(() => answerSize.checkAnswerValueSize(fits), capError);
  }
});

test('non-output arrays and nested object populations are bounded before parsing', async () => {
  for (const section of ['sitemaps', 'analyticsPages']) {
    const input = bundle();
    if (section === 'sitemaps') input.searchConsole.sitemaps = Array(10001).fill(null);
    else input.analytics.topPages.rows = Array(10001).fill({ dimensionValues: [{ value: '/' }], metricValues: [] });
    await beforeParse(JSON.stringify(input), { command: 'audit' }, /JSON array exceeds 10,000 elements/);
  }
  await beforeParse('{"ignored":' + '['.repeat(65) + '0' + ']'.repeat(65) + '}', { command: 'audit' }, /JSON nesting exceeds 64/);
  const item = '{"a":0,"b":0,"c":0,"d":0,"e":0,"f":0,"g":0,"h":0,"i":0,"j":0}';
  await beforeParse('{"ignored":[' + Array(9500).fill(item).join(',') + ']}', { command: 'audit' }, /JSON exceeds 100,000 values/);
});

test('trends retain at most 15 objects per direction without mapping previous rows', t => {
  const current = Array.from({ length: 2000 }, (_, i) => row(`q${i}`));
  const previous = current.map(value => ({ ...value, clicks: 5 }));
  const map = Array.prototype.map, push = Array.prototype.push;
  t.after(() => { Array.prototype.map = map; Array.prototype.push = push; });
  Array.prototype.map = function (...args) {
    if (this.length > 1000 && this[0]?.keys) throw Error('mapped every previous row');
    return Reflect.apply(map, this, args);
  };
  Array.prototype.push = function (...args) {
    if (this.length >= 15 && args[0]?.previousClicks !== undefined) throw Error('unbounded trend copies');
    return Reflect.apply(push, this, args);
  };
  const inputs = { 'q.json': JSON.stringify(current), 'previous.json': JSON.stringify(previous) };
  const result = keywordReport({ ...window, 'previous-queries': 'previous.json' }, name => inputs[name]);
  assert.deepEqual(result.growing.map(value => value.query), current.slice(0, 15).map(value => value.keys[0]));
});

test('cannibalization pages refuse before copies of an oversized warning', t => {
  const pages = Array.from({ length: 2000 }, (_, i) => row('a', `/${i}`));
  const inputs = { 'q.json': JSON.stringify([row()]), 'pages.json': JSON.stringify(pages) };
  const push = Array.prototype.push, slice = Array.prototype.slice;
  t.after(() => { Array.prototype.push = push; Array.prototype.slice = slice; });
  Array.prototype.push = function (...args) {
    if (this.length > 1000 && args[0]?.page !== undefined) throw Error('copied every competing page');
    return Reflect.apply(push, this, args);
  };
  Array.prototype.slice = function (...args) {
    if (this.length > 1000 && (this[0]?.page !== undefined || this[0]?.keys?.length === 2)) throw Error('copied oversized competing list');
    return Reflect.apply(slice, this, args);
  };
  assert.throws(() => keywordReport({ ...window, 'query-pages': 'pages.json' }, name => inputs[name]), capError);
});

test('plain CLI retains main limits and bytes beyond hosted byte and row caps', t => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-local-limits-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prior = mainCli(t, 'seo-data'), cli = fileURLToPath(new URL('seo-data.js', scriptBase));
  const audit = bundle(); audit.ignored = 'a'.repeat(9 * MiB);
  const queries = Array(10001).fill(row());
  const pages = Array.from({ length: 2000 }, (_, i) => row('a', `/${i}`));
  writeFileSync(join(dir, 'audit.json'), JSON.stringify(audit));
  writeFileSync(join(dir, 'q.json'), JSON.stringify(queries));
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(pages));
  for (const args of [ ['audit', '--input', join(dir, 'audit.json')], ['keywords', '--queries', join(dir, 'q.json'), '--query-pages', join(dir, 'pages.json'), '--previous-queries', join(dir, 'q.json'), '--start', '2026-01-01', '--end', '2026-01-02'] ]) {
    const expected = spawnSync(process.execPath, [prior, ...args], { encoding: 'utf8' });
    const actual = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(expected.status, 0, expected.stderr);
    for (const key of ['status', 'stdout', 'stderr']) assert.equal(actual[key], expected[key], key);
  }
});

test('bounded sorts preserve main bytes for duplicate queries, both trend directions and warning ties', t => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-sort-ties-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const queries = [], previous = [], pages = [];
  // Earliest query sightings can be below the page impression floor. Warning
  // ties must still follow that order, rather than the first competing page.
  for (let i = 0; i < 80; i++) {
    const query = `Q${i}`;
    queries.push({ ...row(query), clicks: i % 2 ? 1 : 10 });
    previous.push({ ...row(query.toLowerCase()), clicks: 100 });
    previous.push({ ...row(query), clicks: 5 });
    pages.push({ ...row(query, '/low'), impressions: 1 });
  }
  for (let i = 79; i >= 0; i--) {
    pages.push(row(`Q${i}`, '/a')); pages.push(row(`Q${i}`, '/b'));
  }
  for (const [name, value] of Object.entries({ queries, previous, pages })) writeFileSync(join(dir, name + '.json'), JSON.stringify(value));
  const args = ['keywords', '--queries', join(dir, 'queries.json'), '--previous-queries', join(dir, 'previous.json'), '--query-pages', join(dir, 'pages.json'), '--start', '2026-01-01', '--end', '2026-01-02'];
  const old = spawnSync(process.execPath, [mainCli(t, 'seo-data'), ...args], { encoding: 'utf8' });
  const actual = spawnSync(process.execPath, [fileURLToPath(new URL('seo-data.js', scriptBase)), ...args], { encoding: 'utf8' });
  assert.equal(old.status, 0, old.stderr);
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(actual[key], old[key], key);
});

for (const scenario of ['old-32MiB-targets', '8MiB-targets', '8MiB-keywords', 'accepted-10000-rows', '8MiB-two-byte-string', 'cannibal-copy', 'trend-copies']) {
  test(`${scenario} runs in a 128 MB heap with measured memory`, t => {
    let text, input, name;
    if (scenario.endsWith('targets')) {
      const audit = bundle(); audit.targetKeywords = [];
      text = JSON.stringify(audit).replace('"targetKeywords":[]', '"targetKeywords":[' + '"a",'.repeat(scenario.startsWith('old') ? 8_000_000 : 2_000_000) + '"a"]');
      input = { command: 'audit' }; name = 'audit.json';
    } else if (scenario === '8MiB-two-byte-string') {
      const audit = bundle(); audit.ignored = 'x';
      text = JSON.stringify(audit).replace('"ignored":"x"', '"ignored":"\u0100' + 'x'.repeat(8 * MiB - Buffer.byteLength(JSON.stringify(audit)) - 1) + '"');
      input = { command: 'audit' }; name = 'audit.json';
    } else if (scenario === 'cannibal-copy') {
      text = JSON.stringify({ queries: [row()], pages: Array.from({ length: 10000 }, (_, i) => row('a', `/${i}`)) });
      input = window; name = 'q.json';
    } else if (scenario === 'trend-copies') {
      const queries = Array.from({ length: 10000 }, (_, i) => row(`q${i}`));
      text = JSON.stringify({ queries, previous: queries.map(value => ({ ...value, clicks: 5 })) });
      input = window; name = 'q.json';
    } else {
      text = '[' + (JSON.stringify(row()) + ',').repeat(scenario.startsWith('accepted') ? 9999 : 100_000) + JSON.stringify(row()) + ']';
      input = window; name = 'q.json';
    }
    const packed = zip(text, name);
    const source = `
      import { seoData } from ${JSON.stringify(new URL('seo-core.js', scriptBase).href)};
      import { keywordReport } from ${JSON.stringify(new URL('keywords-report-core.js', scriptBase).href)};
      import { readZip } from ${JSON.stringify(new URL('../../lib/archive-core.js', import.meta.url).href)};
      import { readFileSync } from 'node:fs';
      const bytes = new Uint8Array(readFileSync(0));
      const base = process.memoryUsage(); let error = null, answer;
      try {
        if (${JSON.stringify(scenario)}.includes('cop')) {
          // Isolate the copy boundary from the pre-parse row/structure cap.
          const data = JSON.parse(new TextDecoder().decode((await readZip(bytes, {maxBytes:2097152}))[0].bytes));
          answer = keywordReport({...${JSON.stringify(window)}, 'query-pages':data.pages ? 'pages' : undefined, 'previous-queries':data.previous ? 'previous' : undefined}, name => JSON.stringify(name === 'q.json' ? data.queries : data[name]));
        } else answer = await seoData(${JSON.stringify(input)}, [{name:'exports.zip', bytes}]);
      }
      catch (cause) { error = cause.message; }
      console.log(JSON.stringify({ error, totalQueries:answer?.totalQueries, memory:process.memoryUsage(), base, maxRSS:process.resourceUsage().maxRSS }));
    `;
    const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--input-type=module', '-e', source], { input: packed.bytes, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `signal=${result.signal}\n${result.stderr.slice(-1500)}`);
    const measured = JSON.parse(result.stdout);
    t.diagnostic(JSON.stringify(measured));
    if (scenario.startsWith('old')) assert.match(measured.error, /expanded total/);
    else if (scenario.endsWith('targets')) assert.match(measured.error, capError);
    else if (scenario === 'cannibal-copy') assert.match(measured.error, capError);
    else if (scenario === '8MiB-two-byte-string') assert.match(measured.error, /JSON string text exceeds 2,097,152 characters/);
    else if (scenario === 'trend-copies') assert.equal(measured.error, null);
    else if (scenario.startsWith('accepted')) { assert.equal(measured.error, null); assert.equal(measured.totalQueries, 10000); }
    else assert.match(measured.error, rowError);
    assert.ok(measured.memory.heapUsed + measured.memory.external - measured.base.heapUsed - measured.base.external < 48 * MiB, 'live workload exceeds 48 MiB');
    assert.ok(measured.maxRSS * 1024 < 128 * MiB, 'peak process RSS exceeds 128 MiB');
    assert.ok(measured.maxRSS * 1024 - measured.base.rss < 64 * MiB, 'peak workload RSS exceeds 64 MiB');
  });
}
