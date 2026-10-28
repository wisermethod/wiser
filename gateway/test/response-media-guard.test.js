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

test('string windows cover long query values only and have a call-wide bound', (t) => {
  const guard = createResponseHeaderGuard();
  let windows = 0;
  let constructing = true;
  const slice = String.prototype.slice;
  t.mock.method(String.prototype, 'slice', function (start, end) {
    if (constructing && (end - start === 8 || end - start === 16)) windows++;
    return slice.call(this, start, end);
  });
  guard.rememberMediaUrl(`https://${HOST}/long-private-path.wav?short=abcdefghijklmno&sig=${SIGNATURE}`);
  const first = windows;
  constructing = false;
  assert.equal(first, 2 * (SIGNATURE.length - 8 + 1), 'only long raw/decoded query values get windows');
  assert.equal(guard.holds('private-'), false, 'path must not get windows');
  assert.equal(guard.holds('abcdefgh'), false, 'short query values must not get windows');
  assert.equal(guard.holds(SIGNATURE.slice(9, 17)), true);
  // Repeated inputs must not grow or silently truncate the private index.
  constructing = true;
  for (let i = 0; i < 400; i++) guard.rememberMediaUrl(`https://${HOST}/?sig=${SIGNATURE}`);
  constructing = false;
  assert.ok(windows <= 16384, 'window construction must have a finite call-wide budget');
  assert.equal(guard.holdsValue({ ordinary: 'safe' }), true, 'window exhaustion must fail closed');
  assert.equal(guard.holdsError(new Error('safe')), true);
});

test('encoded and decoded signatures retain whole needles and 8-character string slices', () => {
  const guard = createResponseHeaderGuard();
  const sig = 'invented/encoded+signature/123456789';
  const encoded = encodeURIComponent(sig);
  guard.rememberMediaUrl(`https://${HOST}/take.wav?sig=${encoded}`);
  for (const value of [sig, encoded, sig.slice(5, 13), encoded.slice(10, 18)]) assert.equal(guard.holds(value), true);
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
  // Bytes do not use partial-signature windows, but whole signatures still fail.
  const slot = (data) => ({ output_file: { media_type: 'video/mp4', data: Buffer.from(data) } });
  assert.equal(guard.holdsOutput(slot(signature.slice(20, 35))), false);
  assert.equal(guard.holdsOutput(slot(signature.slice(0, 2043))), true);
});
