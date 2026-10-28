import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createResponseHeaderGuard } from '../src/response-headers.js';
import { createMediaDownload } from '../src/media-download.js';
import { transport, HOST, SIGNATURE } from './media-transport.js';

for (const aborted of [false, true]) test(`overlong address is invalid_url without windows; aborted=${aborted}`, async (t) => {
  const net = transport(t);
  const guard = createResponseHeaderGuard();
  const execution = new AbortController();
  if (aborted) execution.abort();
  const prefix = `https://${HOST}/private/take.wav?sig=${SIGNATURE}&pad=`;
  const url = prefix + 'x'.repeat(8193 - prefix.length);
  let slices = 0;
  const slice = String.prototype.slice;
  t.mock.method(String.prototype, 'slice', function (...args) { slices++; return slice.apply(this, args); });
  const helper = createMediaDownload({ hosts: [HOST], mediaTypes: ['audio/wav'], maxBytes: 4,
    signal: execution.signal, remember: (value) => {
      assert.equal(net.deadlines.length, 1, 'deadline must start before address indexing');
      guard.rememberMediaUrl(value);
    } });
  await assert.rejects(helper({ url, media_type: 'audio/wav' }), (err) => {
    assert.deepEqual(err.object, { status: 'vendor_error', reason: 'media_download_failed', detail: 'invalid_url' });
    return true;
  });
  assert.equal(slices, 0, 'oversized addresses must not build windows or parse components');
  assert.equal(guard.holds(url), true, 'complete oversized address echo must stay guarded');
  assert.equal(guard.holds(SIGNATURE), false, 'only the complete oversized string is remembered');
  assert.equal(net.resolvers.length, 0); assert.equal(net.options.length, 0);
});

test('address at the character cap is still accepted', async (t) => {
  transport(t);
  const prefix = `https://${HOST}/take.wav?sig=`;
  const url = prefix + 'x'.repeat(8192 - prefix.length);
  const guard = createResponseHeaderGuard();
  const helper = createMediaDownload({ hosts: [HOST], mediaTypes: ['audio/wav'], maxBytes: 4,
    remember: (value) => guard.rememberMediaUrl(value) });
  assert.equal((await helper({ url, media_type: 'audio/wav' })).length, 4);
});

test('string windows cover components and decoded segments with a call-wide bound', (t) => {
  const guard = createResponseHeaderGuard();
  let windows = 0;
  let constructing = true;
  const slice = String.prototype.slice;
  t.mock.method(String.prototype, 'slice', function (start, end) {
    if (constructing && (end - start === 8 || end - start === 16)) windows++;
    return slice.call(this, start, end);
  });
  const url = new URL(`https://${HOST}/long-private-path.wav?short=abcdefghijklmno&sig=${SIGNATURE}`);
  guard.rememberMediaUrl(url.href);
  const first = windows;
  constructing = false;
  assert.equal(first, (url.pathname.length - 16 + 1) + (url.search.length - 16 + 1) +
    (SIGNATURE.length - 8 + 1), 'distinct components get 16-character windows; decoded segments get 8');
  assert.equal(guard.holds('/long-private-path'), true, 'path slices must be guarded');
  assert.equal(guard.holds('private-'), false, 'path windows must stay at 16 characters');
  assert.equal(guard.holds('abcdefgh'), false, 'short query values must not get windows');
  assert.equal(guard.holds(SIGNATURE.slice(9, 17)), true);
  // Repeated inputs must not grow or silently truncate the private index.
  constructing = true;
  for (let i = 0; i < 400; i++) guard.rememberMediaUrl(`https://${HOST}/?sig=${SIGNATURE}`);
  constructing = false;
  assert.ok(windows <= 16384, 'window construction must have a finite call-wide budget');
  assert.equal(guard.holdsValue({ ordinary: 'safe' }), true, 'window exhaustion must fail closed');
  assert.equal(guard.holds('safe'), true);
  assert.equal(guard.holdsOutput({ output_file: { data: Buffer.from('safe') } }), true);
  assert.equal(guard.holdsError(new Error('safe')), true);
});

test('raw and decoded components get whole needles and 16-character string windows', () => {
  for (const component of ['path', 'query', 'hash']) {
    const value = 'private-component+user-18392-take';
    const encoded = encodeURIComponent(value);
    const url = new URL(`https://${HOST}`);
    if (component === 'path') url.pathname = '/' + encoded;
    if (component === 'query') url.search = '?v=' + encoded;
    if (component === 'hash') url.hash = '#' + encoded;
    const guard = createResponseHeaderGuard();
    guard.rememberMediaUrl(url.href);
    for (const part of [url.pathname, url.search, url.hash].filter((part) => part.length >= 16)) {
      for (const form of [part, decodeURIComponent(part)]) {
        assert.equal(guard.holds(form.slice(1, 17)), true, `${component} slice must be guarded`);
        assert.equal(guard.holdsOutput({ output_file: { data: Buffer.from(form) } }), true, `${component} whole bytes must be guarded`);
      }
    }
  }
});

test('short raw and decoded components never become whole needles', () => {
  const guard = createResponseHeaderGuard();
  guard.rememberMediaUrl(`https://${HOST}/a?v=%31#x`);
  // A long raw spelling can decode to a short component too.
  guard.rememberMediaUrl(`https://${HOST}/%61%62%63%64%65%66?v=%31%32%33%34%35%36#%61%62%63%64%65%66`);
  for (const part of ['/a', '?v=%31', '?v=1', '#x', '/abcdef', '?v=123456', '#abcdef', 'n/a']) {
    assert.equal(guard.holds(part), false, 'short component must not become a whole needle');
    assert.equal(guard.holdsOutput({ output_file: { data: Buffer.from(part) } }), false);
  }
});

test('encoded components retain 16-character slices; decoded signature segments retain 8', () => {
  const guard = createResponseHeaderGuard();
  const sig = 'invented_encoded+signature_123456789';
  const encoded = encodeURIComponent(sig);
  guard.rememberMediaUrl(`https://${HOST}/take.wav?sig=${encoded}`);
  for (const value of [sig, encoded, sig.slice(5, 13), encoded.slice(10, 26)]) assert.equal(guard.holds(value), true);
  assert.equal(guard.holds(encoded.slice(10, 18)), false, 'encoded-only slices require 16 characters');
});

test('decoded credential segments exclude short public fields while protecting signatures', () => {
  const guard = createResponseHeaderGuard();
  const credential = 'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request';
  guard.rememberMediaUrl(`https://${HOST}/take.wav?credential=${encodeURIComponent(credential)}&sig=${SIGNATURE}`);
  for (const value of ['us-east-1', '20130524', 'aws4_request']) assert.equal(guard.holds(value), false, 'short credential segment must publish');
  assert.equal(guard.holds(SIGNATURE.slice(20, 28)), true);
});

test('bounded invalid URL still guards raw 16-character slices before refusal', async (t) => {
  const net = transport(t);
  const guard = createResponseHeaderGuard();
  const url = 'https://[invalid]/private/user-18392/take.wav';
  const helper = createMediaDownload({ hosts: [HOST], mediaTypes: ['audio/wav'], maxBytes: 4,
    remember: (value) => guard.rememberMediaUrl(value) });
  await assert.rejects(helper({ url, media_type: 'audio/wav' }), (err) => err.object.detail === 'invalid_url');
  assert.equal(guard.holdsError(new Error('/private/user-18392')), true, 'bounded invalid address slice must be guarded');
  assert.equal(net.resolvers.length, 0); assert.equal(net.options.length, 0);
});

test('64 MiB publish scan with a 2 KiB query uses whole needles within 1500 ms', (t) => {
  const guard = createResponseHeaderGuard();
  const signature = Array.from({ length: 32 }, (_, i) => createHash('sha256').update(`invented-${i}`).digest('hex')).join('');
  const query = '?sig=' + signature.slice(0, 2048 - 5);
  assert.equal(query.length, 2048);
  guard.rememberMediaUrl(`https://${HOST}/private/take.mp4${query}`);
  const bytes = Buffer.alloc(64 * 1024 * 1024, 71);
  const includes = Buffer.prototype.includes;
  const scanned = [];
  t.mock.method(Buffer.prototype, 'includes', function (needle, ...args) {
    if (this === bytes || this.buffer === bytes.buffer) {
      scanned.push(needle);
      // Fail immediately on a planted window scan; do not spend seconds
      // walking the same large file thousands of times in a negative control.
      assert.notEqual(needle.length, 8, 'string window entered the file scan');
    }
    return includes.call(this, needle, ...args);
  });
  const started = performance.now();
  assert.equal(guard.holdsOutput({ output_file: { media_type: 'video/mp4', data: bytes }, duration: '1 second' }), false, 'whole-needle publish scan must accept ordinary media');
  const elapsed = performance.now() - started;
  assert.ok(scanned.length <= 16, `whole-needle byte scan count must stay <=16, got ${scanned.length}`);
  assert.ok(elapsed < 1500, `publish scan exceeded 1500 ms: ${elapsed.toFixed(1)} ms`);
  t.diagnostic(`64 MiB / 2048-character query: ${scanned.length} whole-needle scans, ${elapsed.toFixed(1)} ms (bound 1500 ms)`);
  // Bytes use whole components, not per-parameter values or string windows.
  const slot = (data) => ({ output_file: { media_type: 'video/mp4', data: Buffer.from(data) } });
  assert.equal(guard.holdsOutput(slot(signature.slice(20, 35))), false);
  assert.equal(guard.holdsOutput(slot(signature.slice(0, 2043))), false);
  assert.equal(guard.holdsOutput(slot(query)), true);
});

test('8192-character many-parameter address has a fixed small byte scan count', (t) => {
  let url = `https://${HOST}/private/take.mp4?`;
  let parameters = 0;
  for (;;) {
    const pair = `p${parameters}=${createHash('sha256').update(`parameter-${parameters}`).digest('hex').slice(0, 16)}&`;
    if (url.length + pair.length + 5 > 8192) break;
    url += pair;
    parameters++;
  }
  url += 'pad=' + 'z'.repeat(8192 - url.length - 4);
  assert.equal(url.length, 8192); assert.ok(parameters > 300);
  const parsed = new URL(url);
  const whole = new Set([url, parsed.href, parsed.pathname, parsed.search, 'upload_id=']);
  const guard = createResponseHeaderGuard(); guard.rememberMediaUrl(url);
  const bytes = Buffer.alloc(8 * 1024 * 1024, 71);
  const includes = Buffer.prototype.includes; let scans = 0;
  t.mock.method(Buffer.prototype, 'includes', function (needle, ...args) {
    if (this.buffer === bytes.buffer) {
      scans++;
      assert.ok(scans <= 18, 'file scan count must be independent of parameter count');
      assert.ok(whole.has(needle), 'per-parameter needle entered the file scan');
    }
    return includes.call(this, needle, ...args);
  });
  assert.equal(guard.holdsOutput({ output_file: { media_type: 'video/mp4', data: bytes } }), false,
    'many-parameter byte scan must accept ordinary media');
  assert.ok(scans > 0 && scans <= 18);
  t.diagnostic(`8192 characters / ${parameters} 16-character parameters / 8 MiB: ${scans} scans (bound 18)`);
});
