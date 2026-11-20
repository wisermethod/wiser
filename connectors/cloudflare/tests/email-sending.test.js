import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import { createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';

const ZONE = '0123456789abcdef0123456789abcdef';
const TAG = 'abcdef0123456789abcdef0123456789';
const DOMAIN = 'example.com';
const BASE = `/zones/${ZONE}/email/sending/subdomains`;
const DNS = `${BASE}/${TAG}/dns`;
const input = { zone_id: ZONE, domain: DOMAIN };
const subdomain = { tag: TAG, name: DOMAIN, enabled: true };
const records = [
  { type: 'MX', name: 'cf-bounce.example.com', content: 'route1.mx.cloudflare.net.', priority: 99, ttl: 1 },
  { type: 'MX', name: 'cf-bounce.example.com', content: 'route2.mx.cloudflare.net.', priority: 5, ttl: 1 },
  { type: 'MX', name: 'cf-bounce.example.com', content: 'route3.mx.cloudflare.net.', priority: 100, ttl: 1 },
  { type: 'TXT', name: 'cf-bounce.example.com', content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"', ttl: 1 },
  { type: 'TXT', name: 'cf-bounce._domainkey.example.com', content: '"v=DKIM1; p=fixture"', ttl: 1 },
  { type: 'TXT', name: '_dmarc.example.com', content: '"v=DMARC1; p=reject;"', ttl: 1 },
];
const envelope = (result, info) => ({ status: 200, data: { success: true, result, ...(info ? { result_info: info } : {}) } });

async function setup(t, respond) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = await createTestGateway({ home });
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'zones' });
  const calls = [];
  env.fake.auth.proxy = async (req) => { calls.push(req); return respond(req, calls.length); };
  const request = (name) => ({ action: 'cloudflare.zones.' + name, input });
  return { ...env, calls, request, read: () => env.gw.execute(request('get_email_sending_domain')) };
}

test('Email Sending read resolves the zone domain and its DNS guidance', async (t) => {
  const env = await setup(t, (req) => {
    assert.equal(req.method, 'GET');
    if (req.endpoint === BASE) return envelope([subdomain]);
    assert.equal(req.endpoint, DNS);
    return envelope(records);
  });
  assert.deepEqual(await env.read(), { success: true, domain: DOMAIN, onboarded: true, enabled: true, dns_records: records });
  assert.equal(env.calls.length, 2);
});

test('Email Sending read follows Wrangler cursor pagination and reports a missing domain without reading DNS', async (t) => {
  const first = { ...subdomain, name: 'other.example.com' };
  const env = await setup(t, (req, n) => {
    assert.equal(req.endpoint, BASE);
    assert.equal(req.method, 'GET');
    if (n === 1) return envelope([first], { cursor: 'next-page' });
    assert.deepEqual(req.parameters, [{ name: 'cursor', type: 'query', value: 'next-page' }]);
    return envelope([]);
  });
  assert.deepEqual(await env.read(), { success: true, domain: DOMAIN, onboarded: false, enabled: false, dns_records: [] });
  assert.equal(env.calls.length, 2);
});

test('Email Sending onboarding confirmation shows the five DNS records and existing mail records stay unchanged', async (t) => {
  const env = await setup(t, (req, n) => {
    if (n === 1) {
      assert.equal(req.endpoint, BASE);
      assert.equal(req.method, 'GET');
      return envelope([]);
    }
    assert.equal(req.endpoint, BASE);
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { name: DOMAIN });
    return envelope(subdomain);
  });
  const request = env.request('onboard_email_sending_domain');
  const stop = await env.gw.execute(request);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  const disclosure = JSON.stringify(stop);
  for (const pattern of [/example\.com/, /cf-bounce\.<domain>/, /route1\.mx\.cloudflare\.net.*99/,
    /route2\.mx\.cloudflare\.net.*5/, /route3\.mx\.cloudflare\.net.*100/, /v=spf1 include:_spf\.mx\.cloudflare\.net ~all/,
    /cf-bounce\._domainkey\.<domain>/, /existing MX, SPF, DKIM and DMARC records are not changed/]) assert.match(disclosure, pattern);
  assert.deepEqual(env.calls, []);
  assert.deepEqual(await env.gw.execute({ ...request, confirm: true }),
    { success: true, domain: DOMAIN, onboarded: true, enabled: true });
  assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
  assert.equal(env.calls.length, 2);
});

test('Email Sending removal confirms deletion of five records and checks the domain is absent', async (t) => {
  const env = await setup(t, (req, n) => {
    if (n !== 2) {
      assert.equal(req.endpoint, BASE);
      assert.equal(req.method, 'GET');
      return envelope(n === 1 ? [subdomain] : []);
    }
    assert.equal(req.endpoint, `${BASE}/${TAG}`);
    assert.equal(req.method, 'DELETE');
    assert.equal(req.body, undefined);
    return envelope(null);
  });
  const request = env.request('remove_email_sending_domain');
  const stop = await env.gw.execute(request);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  assert.match(JSON.stringify(stop), /deletes.*five.*records/);
  assert.deepEqual(env.calls, []);
  assert.deepEqual(await env.gw.execute({ ...request, confirm: true }),
    { success: true, domain: DOMAIN, removed: true, read_back: 'absent' });
  assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
  assert.equal(env.calls.length, 3);
});

for (const [operation, result] of [
  ['list', [{ id: TAG, name: DOMAIN, enabled: true }]],
  ['DNS', [{ type: 'MX', name: 'cf-bounce.example.com', content: 'route1.mx.cloudflare.net.', priority: '99' }]],
  ['onboard', { ...subdomain, enabled: 'true' }],
  ['remove', { deleted: true }],
]) {
  test(`Email Sending refuses unexpected ${operation} response`, async (t) => {
    const env = await setup(t, (req) => {
      if (operation === 'list' || req.endpoint === DNS || req.method !== 'GET') return envelope(result);
      return envelope(operation === 'onboard' ? [] : [subdomain]);
    });
    let answer;
    if (operation === 'list' || operation === 'DNS') answer = await env.read();
    else {
      const request = env.request(operation === 'onboard' ? 'onboard_email_sending_domain' : 'remove_email_sending_domain');
      assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
      answer = await env.gw.execute({ ...request, confirm: true });
    }
    assert.equal(answer.status, 'vendor_error', JSON.stringify(answer));
    assert.equal(answer.endpoint, { list: BASE, DNS, onboard: BASE, remove: `${BASE}/${TAG}` }[operation]);
  });
}

test('Email Sending refuses onboarding when a listed total proves the domain listing is incomplete', async (t) => {
  const env = await setup(t, (req) => req.method === 'GET'
    ? envelope([], { total_count: 1 }) : envelope(subdomain));
  const request = env.request('onboard_email_sending_domain');
  assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
  assert.equal((await env.gw.execute({ ...request, confirm: true })).status, 'vendor_error');
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET']);
});

for (const [name, lastTotal] of [['drops', undefined], ['changes', 1]]) {
  test(`Email Sending refuses a listing whose final cursor page ${name} its advertised total`, async (t) => {
    const env = await setup(t, (req, n) => {
      assert.equal(req.method, 'GET');
      return n === 1 ? envelope([{ ...subdomain, name: 'other.example.com' }], { cursor: 'next-page', total_count: 2 })
        : envelope([], lastTotal === undefined ? undefined : { total_count: lastTotal });
    });
    assert.equal((await env.read()).status, 'vendor_error');
    assert.equal(env.calls.length, 2);
  });
}

test('Email Sending keeps numeric authentication codes and withholds the provider message', async (t) => {
  const env = await setup(t, () => ({ status: 401,
    error: { provider_codes: [10000, 'unexpected'], message: 'provider diagnostic' } }));
  const result = await env.read();
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 401);
  assert.deepEqual(result.provider_codes, [10000]);
  assert.equal(JSON.stringify(result).includes('provider diagnostic'), false);
});
