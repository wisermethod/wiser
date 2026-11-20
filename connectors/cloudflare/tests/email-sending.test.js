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
    if (n === 3) {
      assert.equal(req.method, 'GET');
      return envelope([subdomain]);
    }
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { name: DOMAIN });
    return envelope(subdomain);
  });
  const request = env.request('onboard_email_sending_domain');
  const stop = await env.gw.execute(request);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  const disclosure = JSON.stringify(stop);
  assert.equal(disclosure.includes('<domain>'), false);
  for (const pattern of [/example\.com/, /host cf-bounce under the named domain/, /route1\.mx\.cloudflare\.net.*99/,
    /route2\.mx\.cloudflare\.net.*5/, /route3\.mx\.cloudflare\.net.*100/, /v=spf1 include:_spf\.mx\.cloudflare\.net ~all/,
    /host cf-bounce\._domainkey under the named domain/, /existing MX, SPF, DKIM and DMARC records are not changed/]) assert.match(disclosure, pattern);
  assert.deepEqual(env.calls, []);
  assert.deepEqual(await env.gw.execute({ ...request, confirm: true }),
    { success: true, domain: DOMAIN, onboarded: true, enabled: true });
  assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'POST', 'GET']);
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
  for (const pattern of [/deletes the five Email Sending DNS records/, /three MX and one SPF TXT on the host cf-bounce under the named domain/,
    /one DKIM TXT on the host cf-bounce\._domainkey under the named domain/, /example\.com/]) assert.match(JSON.stringify(stop), pattern);
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

// Shapes read live on 2026-11-20: a listed row carries `tag`, `name` and a
// boolean `enabled` among other fields, and no `result_info`. What a write
// returns is not relied on; the listing read after it is.
async function confirmed(env, name) {
  const request = env.request(name);
  assert.equal((await env.gw.execute(request)).status, 'needs_confirmation');
  return env.gw.execute({ ...request, confirm: true });
}

for (const [label, created] of [['a body with no tag', { name: DOMAIN, enabled: true }], ['an empty body', null]]) {
  test(`Email Sending onboarding is proved by the listing, not the POST reply: ${label}`, async (t) => {
    const env = await setup(t, (req, n) => req.method === 'POST' ? envelope(created) : envelope(n === 1 ? [] : [subdomain]));
    assert.deepEqual(await confirmed(env, 'onboard_email_sending_domain'),
      { success: true, domain: DOMAIN, onboarded: true, enabled: true });
    assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'POST', 'GET']);
  });
}

test('Email Sending onboarding that the listing does not confirm is a vendor error', async (t) => {
  const env = await setup(t, (req) => req.method === 'POST' ? envelope(subdomain) : envelope([]));
  const answer = await confirmed(env, 'onboard_email_sending_domain');
  assert.equal(answer.status, 'vendor_error', JSON.stringify(answer));
  assert.equal(answer.reason, 'onboarding submitted; domain not confirmed enabled');
});

test('Email Sending onboarding enables a listed but disabled domain with the same POST', async (t) => {
  const env = await setup(t, (req, n) => req.method === 'POST' ? envelope(subdomain)
    : envelope([{ ...subdomain, enabled: n !== 1 }]));
  assert.deepEqual(await confirmed(env, 'onboard_email_sending_domain'),
    { success: true, domain: DOMAIN, onboarded: true, enabled: true });
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'POST', 'GET']);
  assert.deepEqual(env.calls[1].body, { name: DOMAIN });
});

test('Email Sending onboarding of an already enabled domain sends no POST', async (t) => {
  const env = await setup(t, () => envelope([subdomain]));
  assert.deepEqual(await confirmed(env, 'onboard_email_sending_domain'),
    { success: true, domain: DOMAIN, onboarded: true, enabled: true });
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET']);
});

for (const [label, deleted] of [['the deleted object', { ...subdomain, enabled: false }], ['an empty object', {}], ['null', null]]) {
  test(`Email Sending removal is proved by the listing, not the DELETE reply: ${label}`, async (t) => {
    const env = await setup(t, (req, n) => req.method === 'DELETE' ? envelope(deleted) : envelope(n === 1 ? [subdomain] : []));
    assert.deepEqual(await confirmed(env, 'remove_email_sending_domain'),
      { success: true, domain: DOMAIN, removed: true, read_back: 'absent' });
    assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'DELETE', 'GET']);
  });
}

test('Email Sending removal that leaves the domain listed is a vendor error', async (t) => {
  const env = await setup(t, (req) => req.method === 'DELETE' ? envelope(null) : envelope([subdomain]));
  const answer = await confirmed(env, 'remove_email_sending_domain');
  assert.equal(answer.status, 'vendor_error', JSON.stringify(answer));
  assert.equal(answer.reason, 'removal submitted; domain still listed');
});

test('Email Sending reads the listing and DNS shapes Cloudflare returned live', async (t) => {
  const live = { id: TAG, tag: TAG, name: DOMAIN, enabled: true, preview_enabled: true,
    return_path_domain: 'cf-bounce.example.com', dkim_selector: 'cf-bounce', drop_suppressed_recipients: false,
    created: '2026-11-20T10:54:28.240842Z', modified: '2026-11-20T10:54:28.240842Z' };
  const env = await setup(t, (req) => envelope(req.endpoint === DNS ? records : [live]));
  const answer = await env.read();
  assert.equal(answer.success, true, JSON.stringify(answer));
  assert.equal(answer.enabled, true);
  assert.equal(answer.dns_records.length, 6);
});
