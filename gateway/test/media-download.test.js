import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaDownload, isCanonicalMediaHost, isPublicMediaAddress } from '../src/media-download.js';
import { transport, HOST, PUBLIC, PUBLIC6, URL_VALUE, SIGNATURE } from './media-transport.js';

function download(options = {}) {
  return createMediaDownload({ hosts: [HOST], mediaTypes: ['audio/wav'], maxBytes: 4, ...options });
}
const input = (url = URL_VALUE) => ({ url, media_type: 'audio/wav' });
async function refuses(promise, detail, http_status) {
  await assert.rejects(promise, (err) => {
    const evidence = JSON.stringify(err) + String(err.message) + String(err.cause?.message ?? err.cause ?? '');
    for (const forbidden of [URL_VALUE, SIGNATURE, 'cause']) assert.equal(evidence.includes(forbidden), false, 'private error value escaped');
    assert.deepEqual(err.object, { status: 'vendor_error', reason: 'media_download_failed', detail, ...(http_status ? { http_status } : {}) });
    return true;
  });
}

test('canonical host permission rejects URL and DNS ambiguities', () => {
  for (const host of [HOST, 'xn--bcher-kva.example']) assert.equal(isCanonicalMediaHost(host), true);
  for (const host of ['', 'localhost', '*.example.test', '.example.test', 'a..test', 'HOST.test', 'a.test.', 'https://a.test',
    'a.test:443', 'a.test/path', 'a.test?x', 'a.test#x', '127.1', '0x7f000001', '127.0.0.1', '2130706433', '::1', '[::1]',
    '-a.test', 'a-.test', 'a_b.test', 'é.test', 'a'.repeat(64) + '.test', null, 3]) assert.equal(isCanonicalMediaHost(host), false, String(host));
});

test('public predicate covers IANA special-purpose allocations in both families', () => {
  for (const ip of [PUBLIC, PUBLIC6, '8.7.6.5', '2003:1234::1']) assert.equal(isPublicMediaAddress(ip), true, ip);
  for (const ip of ['0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.169.254', '172.16.1.1', '172.31.255.255',
    '192.0.0.9', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.88.99.1', '192.168.0.1', '192.175.48.1', '198.18.0.1', '198.19.255.255',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '::ffff:808:808', '64:ff9b::808:808', '64:ff9b:1::1', '100::1', 'fc00::1', 'fd00::1', 'fe80::1', 'ff02::1',
    '2001::1', '2001:2::1', '2001:20::1', '2001:db8::1', '2002::1', '2620:4f:8000::1', '3fff::1', '4000::1', 'fe80::1%en0', '', 'bad']) {
    assert.equal(isPublicMediaAddress(ip), false, ip);
  }
});

test('real connection boundary is pinned, hostname-verified, uncredentialed and byte safe at cap', async (t) => {
  const state = transport(t, { headers: { 'content-length': '4' }, chunks: [Buffer.from([0, 255]), Buffer.from([128, 17])] });
  assert.deepEqual(await download()(input()), Buffer.from([0, 255, 128, 17]));
  assert.equal(state.options.length, 1);
  const o = state.options[0];
  assert.equal(o.hostname, PUBLIC); assert.equal(o.family, 4); assert.equal(o.port, 443); assert.equal(o.method, 'GET');
  assert.equal(o.servername, HOST); assert.equal(o.rejectUnauthorized, true);
  assert.equal(o.checkServerIdentity('ignored numeric peer', { subjectaltname: `DNS:${HOST}` }), undefined);
  assert.ok(o.checkServerIdentity(HOST, { subjectaltname: 'DNS:wrong.invented.test' }) instanceof Error);
  assert.deepEqual(o.headers, { Host: HOST, 'Accept-Encoding': 'identity' });
  assert.equal(o.agent.options.keepAlive, false); assert.equal(o.agent.options.maxCachedSessions, 0);
  for (const key of ['cert', 'key', 'pfx', 'auth', 'lookup', 'ca']) assert.equal(o[key], undefined);
  assert.equal(state.deadlines[0].ms, 120000);
  assert.ok(state.requests.every((r) => r.destroyed)); assert.ok(state.responses.every((r) => r.destroyed));
  assert.ok(state.resolvers.every((r) => r.cancelled));
});

test('IPv6-only answer uses the vetted numeric address and original TLS name', async (t) => {
  const state = transport(t, { v4: [], v6: [PUBLIC6] });
  await download()(input());
  assert.equal(state.options[0].hostname, PUBLIC6); assert.equal(state.options[0].family, 6); assert.equal(state.options[0].servername, HOST);
});

for (const [index, [url, detail]] of [
  ['http://' + HOST, 'invalid_url'], ['https://' + HOST + ':444/a', 'invalid_url'], ['https://user:pass@' + HOST, 'invalid_url'],
  ['https://@' + HOST, 'invalid_url'], [URL_VALUE + '#', 'invalid_url'], [URL_VALUE + '#private', 'invalid_url'],
  ['https://127.1/', 'invalid_url'], ['https://0x7f000001/', 'invalid_url'], ['https://2130706433/', 'invalid_url'], ['https://[::1]/', 'invalid_url'],
  ['https://[::ffff:808:808]/', 'invalid_url'], ['https://' + HOST + '.evil.test/a', 'host_refused'], ['https://child.' + HOST, 'host_refused'],
  ['https://' + HOST + '.', 'invalid_url'], ['not a URL', 'invalid_url'], [7, 'invalid_url'],
].entries()) test(`refuses URL form ${index}`, async (t) => {
  const state = transport(t);
  await refuses(download()(input(url)), detail);
  assert.equal(state.options.length, 0); assert.equal(state.resolvers.length, 0);
});

for (const extra of [{ headers: { Cookie: 'invented' } }, { max_bytes: 99 }, { timeout: 999 }, { hosts: ['other.test'] }, { method: 'POST' }, { agent: {} }]) {
  test(`helper refuses widening option ${Object.keys(extra)[0]}`, async (t) => {
    const state = transport(t); await refuses(download()({ ...input(), ...extra }), 'invalid_request'); assert.equal(state.options.length, 0);
  });
}

test('undeclared MIME and missing fields never reach DNS', async (t) => {
  const state = transport(t);
  await refuses(download()({ ...input(), media_type: 'video/mp4' }), 'media_type_refused');
  await refuses(download()({ url: URL_VALUE }), 'invalid_request');
  assert.equal(state.resolvers.length, 0);
});

for (const [name, config, detail] of [
  ['mixed v4', { v4: [PUBLIC, '10.0.0.1'] }, 'address_refused'], ['mixed families', { v6: ['fd00::1'] }, 'address_refused'],
  ['all empty', { v4: [], v6: [] }, 'address_refused'], ['malformed', { v4: ['bogus'] }, 'address_refused'],
  ['wrong family', { v4: [PUBLIC6] }, 'address_refused'], ['wrong list type', { v4: PUBLIC }, 'address_refused'],
  ['DNS error', { dnsError: true }, 'dns_failed'], ['TLS error', { tlsError: true }, 'transport_failed'],
  ['thrown transport error', { requestError: true }, 'transport_failed'], ['stream error', { streamError: true }, 'transport_failed'],
  ['rebinding peer', { remoteAddress: '127.0.0.1' }, 'transport_failed'], ['unauthorized peer', { authorized: false }, 'transport_failed'],
]) test(`refuses ${name} without raw failure text`, async (t) => {
  const state = transport(t, config); await refuses(download()(input()), detail);
  if (name.includes('mixed') || ['all empty', 'malformed', 'wrong family', 'wrong list type', 'DNS error'].includes(name)) assert.equal(state.options.length, 0);
  assert.ok(state.requests.every((r) => r.destroyed));
});

for (const status of [301, 302, 307, 308, 401, 403, 404, 500]) test(`refuses HTTP ${status} without Location or body`, async (t) => {
  const state = transport(t, { status, headers: { location: URL_VALUE, 'set-cookie': SIGNATURE } });
  await refuses(download()(input()), status < 400 ? 'redirect_refused' : 'http_refused', status);
  assert.equal(state.options.length, 1); assert.equal(state.chunksEmitted, 0);
});

for (const [name, config, detail] of [
  ['absent length over cap', { chunks: [Buffer.alloc(3), Buffer.alloc(2), Buffer.alloc(1)] }, 'over_cap'],
  ['lying length over cap', { headers: { 'content-length': '1' }, chunks: [Buffer.alloc(5)] }, 'over_cap'],
  ['announced oversize', { headers: { 'content-length': '5' } }, 'over_cap'],
  ['malformed length', { headers: { 'content-length': '3x' } }, 'length_refused'],
  ['unsafe length', { headers: { 'content-length': '9007199254740992' } }, 'length_refused'],
  ['array length', { headers: { 'content-length': ['4'] } }, 'length_refused'],
  ['gzip', { headers: { 'content-encoding': 'gzip' } }, 'encoding_refused'],
  ['br', { headers: { 'content-encoding': 'br' } }, 'encoding_refused'],
  ['empty', { chunks: [] }, 'empty'], ['truncated', { complete: false }, 'truncated'],
  ['lying length short', { headers: { 'content-length': '4' }, chunks: [Buffer.alloc(3)] }, 'truncated'],
  ['text conversion', { chunks: ['bad'] }, 'transport_failed'],
]) test(`stream control: ${name}`, async (t) => {
  const state = transport(t, config); await refuses(download()(input()), detail);
  assert.ok(state.responses.every((r) => r.destroyed)); assert.ok(state.requests.every((r) => r.destroyed));
  if (name === 'absent length over cap') assert.equal(state.chunksEmitted, 2, 'must stop before the third chunk');
});

for (const phase of ['dns', 'connect', 'headers', 'body']) test(`wall deadline cancels slow ${phase}`, async (t) => {
  const state = transport(t, { slow: phase });
  const pending = download()(input());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  state.expire();
  assert.ok(state.resolvers.every((r) => r.cancelled), 'deadline did not cancel resolution');
  assert.ok(state.requests.every((r) => r.destroyed), 'deadline did not destroy transport');
  await refuses(pending, 'deadline');
  assert.ok(state.resolvers.every((r) => r.cancelled)); assert.ok(state.requests.every((r) => r.destroyed));
  assert.ok(state.responses.every((r) => r.destroyed));
});

test('cap counts before copying or retaining a chunk; concat/allocation failures are closed', async (t) => {
  transport(t, { chunks: [Buffer.alloc(3), Buffer.alloc(2)] });
  const alloc = Buffer.allocUnsafe;
  const allocated = [];
  t.mock.method(Buffer, 'allocUnsafe', (size) => { allocated.push(size); return alloc(size); });
  await refuses(download()(input()), 'over_cap');
  assert.deepEqual(allocated, [4]);
});

test('allocation error is sanitized inside the capability', async (t) => {
  transport(t);
  t.mock.method(Buffer, 'concat', () => { throw new Error(SIGNATURE); });
  await refuses(download()(input()), 'allocation_failed');
});

test('concurrent large streams each retain at most their cap before a bounded concat', async (t) => {
  const chunk = Buffer.alloc(1024 * 1024, 71);
  transport(t, { chunks: [chunk, chunk, chunk, chunk] });
  const concat = Buffer.concat;
  const sizes = [];
  t.mock.method(Buffer, 'concat', (chunks, total) => { sizes.push(chunks.reduce((n, b) => n + b.length, 0)); return concat(chunks, total); });
  const fetchMedia = download({ maxBytes: 4 * chunk.length });
  const results = await Promise.all([fetchMedia(input()), fetchMedia(input()), fetchMedia(input())]);
  assert.deepEqual(sizes, [4 * chunk.length, 4 * chunk.length, 4 * chunk.length]);
  for (const result of results) assert.equal(result.length, 4 * chunk.length);
});

test('empty and one-byte chunks cannot create unbounded retained objects', async (t) => {
  const chunks = Array.from({ length: 10000 }, (_, i) => i % 2 ? Buffer.alloc(0) : Buffer.from([71]));
  transport(t, { chunks });
  const alloc = Buffer.allocUnsafe; const allocations = [];
  t.mock.method(Buffer, 'allocUnsafe', (size) => { allocations.push(size); return alloc(size); });
  const result = await download({ maxBytes: 5000 })(input());
  assert.equal(result.length, 5000); assert.equal(result.every((n) => n === 71), true);
  // One coalesced slab and one exact concatenation, not 10,000 retained objects.
  assert.deepEqual(allocations, [5000, 5000]);
});

test('an execution ending cancels a pending helper and never starts another request', async (t) => {
  const state = transport(t, { slow: 'body' }); const execution = new AbortController();
  const helper = download({ signal: execution.signal }); const pending = helper(input());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  execution.abort(); await refuses(pending, 'inactive');
  await refuses(helper(input()), 'inactive');
  assert.equal(state.options.length, 1); assert.ok(state.requests.every((r) => r.destroyed)); assert.ok(state.responses.every((r) => r.destroyed));
});

test('slab allocation failure discards the stream without a raw exception', async (t) => {
  transport(t, { chunks: [Buffer.alloc(4)] });
  t.mock.method(Buffer, 'allocUnsafe', () => { throw new Error(SIGNATURE); });
  await refuses(download()(input()), 'allocation_failed');
});
