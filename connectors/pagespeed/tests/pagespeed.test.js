import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const ACTION = 'pagespeed.insights.run';
const VALID = { url: 'https://example.com/' };

const VENDOR = {
  id: 'https://example.com/',
  analysisUTCTimestamp: '2026-09-19T00:00:00.000Z',
  lighthouseResult: {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    categories: { performance: { id: 'performance', score: 0.9 } },
    audits: { 'first-contentful-paint': { id: 'first-contentful-paint', numericValue: 900 } },
  },
  loadingExperience: { overall_category: 'AVERAGE' },
};

async function activeGateway() {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'pagespeed', module: 'insights', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(VENDOR), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function parsed(endpoint) {
  return new URL(endpoint, 'https://pagespeedonline.googleapis.com');
}

test('run needs_connect until the insights read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'insights');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('run uses a relative GET proxy and exposes invented vendor data only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.id, VENDOR.id);
  assert.equal(result.lighthouseResult.categories.performance.score, 0.9);
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  const url = parsed(calls[0].endpoint);
  assert.equal(url.pathname, '/pagespeedonline/v5/runPagespeed');
  assert.equal(url.searchParams.get('url'), VALID.url);
  assert.equal(url.searchParams.get('strategy'), null);
  assert.deepEqual(url.searchParams.getAll('category'), []);
});

test('url accept cases reach the vendor encoded on the query string', async () => {
  const { gw, calls } = await activeGateway();
  const accepted = [
    'https://example.com/',
    'http://example.com/page',
    'https://example.com/path?q=a&b=c',
    'HTTPS://example.com',
  ];
  for (const url of accepted) {
    const result = await gw.execute({ action: ACTION, input: { url } });
    assert.equal(result.status, undefined);
    assert.equal(parsed(calls.at(-1).endpoint).searchParams.get('url'), url);
  }
  assert.equal(calls.length, accepted.length);
});

test('url reject cases are refused before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid url reached the proxy');
  const rejected = [
    {},
    { url: '' },
    { url: ' ' },
    { url: 'example.com' },
    { url: '/path' },
    { url: 'ftp://example.com/' },
    { url: 'javascript:alert(1)' },
    { url: 'data:text/html,hi' },
    { url: 'https://' },
    { url: 'file:///etc/passwd' },
    { url: 1 },
    { url: null },
    { url: {} },
  ];
  for (const input of rejected) {
    const result = await gw.execute({ action: ACTION, input });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'url');
  }
});

test('strategy and category enum rejection never reaches transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid enum reached the proxy');
  for (const strategy of ['tablet', '', 'Mobile', 1, null, true]) {
    const result = await gw.execute({ action: ACTION, input: { ...VALID, strategy } });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'strategy');
  }
  for (const category of ['performance', ['speed'], [1], {}, null, ['performance', 'other'], ['PERFORMANCE']]) {
    const result = await gw.execute({ action: ACTION, input: { ...VALID, category } });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'category');
  }
});

test('repeated category is one query parameter per value', async () => {
  const { gw, calls } = await activeGateway();
  const category = ['performance', 'seo', 'best-practices'];
  const result = await gw.execute({
    action: ACTION,
    input: { url: VALID.url, strategy: 'mobile', category, locale: 'en-US' },
  });
  assert.equal(result.lighthouseResult.categories.performance.score, 0.9);
  assert.equal(calls.length, 1);
  const url = parsed(calls[0].endpoint);
  assert.equal(url.pathname, '/pagespeedonline/v5/runPagespeed');
  assert.equal(url.searchParams.get('url'), VALID.url);
  assert.equal(url.searchParams.get('strategy'), 'mobile');
  assert.equal(url.searchParams.get('locale'), 'en-US');
  assert.deepEqual(url.searchParams.getAll('category'), category);
  const query = calls[0].endpoint.split('?')[1];
  assert.equal([...query.matchAll(/(?:^|&)category=/g)].length, 3);
  assert.match(query, /category=performance&category=seo&category=best-practices/);
});

test('audits defaults false and omits lighthouseResult.audits', async () => {
  const { gw } = await activeGateway();
  const omitted = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(Object.hasOwn(omitted.lighthouseResult, 'audits'), false);
  assert.equal(omitted.lighthouseResult.categories.performance.score, 0.9);
  const explicit = await gw.execute({ action: ACTION, input: { ...VALID, audits: false } });
  assert.equal(Object.hasOwn(explicit.lighthouseResult, 'audits'), false);
});

test('audits true leaves lighthouseResult.audits in place', async () => {
  const { gw } = await activeGateway();
  const result = await gw.execute({ action: ACTION, input: { ...VALID, audits: true } });
  assert.deepEqual(result.lighthouseResult.audits, VENDOR.lighthouseResult.audits);
});

test('module never reads, receives, logs, or returns a credential', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const token of ['process.env', 'generic_api_key', 'PAGESPEED_API_KEY', 'X-Goog-Api-Key', 'readFileSync']) {
    assert.equal(source.includes(token), false, token);
  }
  const { gw, calls } = await activeGateway();
  const result = await gw.execute({ action: ACTION, input: VALID });
  const dumped = JSON.stringify({ result, calls });
  assert.equal(/api[_-]?key|generic_api_key|AIza/i.test(dumped), false);
  assert.equal(Object.hasOwn(calls[0], 'headers'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('module preserves gateway status objects and unwraps falsy vendor data', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error']) {
    const result = { status };
    assert.equal(await modules.insights.run(VALID, { proxy: async () => result }), result);
  }
  for (const data of [null, false, 0, '']) {
    assert.equal(await modules.insights.run(VALID, { proxy: async () => ({ status: 200, data, headers: {} }) }), data);
  }
});

test('gateway preserves proxy capability and vendor failure stops without the vendor body', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => ({ supported: false });
  assert.equal((await gw.execute({ action: ACTION, input: VALID })).status, 'needs_provider_capability');
  fake.auth.proxy = async ({ endpoint, method }) => ({
    status: 429,
    data: { error: { message: 'synthetic-private-response', key: 'AIza-example' } },
    error: { code: 'vendor_error', endpoint, method },
  });
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'vendor_error');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
  assert.equal(JSON.stringify(result).includes('AIza-example'), false);
});

test('undeclared keys, bad locale, and non-boolean audits never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const input of [
    { ...VALID, purpose: 'example' },
    { ...VALID, locale: '' },
    { ...VALID, locale: 'en_US' },
    { ...VALID, locale: 1 },
    { ...VALID, audits: 'false' },
    { ...VALID, audits: 1 },
    { ...VALID, audits: null },
  ]) {
    assert.equal((await gw.execute({ action: ACTION, input })).status, 'invalid_arguments');
  }
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal((await modules.insights.run(input, { proxy: async () => assert.fail('reached proxy') })).status, 'invalid_arguments');
  }
});

test('locale accepts well-formed tags and rejects malformed ones before transport', async () => {
  const { gw, calls } = await activeGateway();
  for (const locale of ['en', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1901']) {
    const result = await gw.execute({ action: ACTION, input: { ...VALID, locale } });
    assert.equal(result.status, undefined, `${locale} should have reached the vendor`);
  }
  const before = calls.length;
  for (const locale of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US']) {
    const result = await gw.execute({ action: ACTION, input: { ...VALID, locale } });
    assert.equal(result.status, 'invalid_arguments', `${JSON.stringify(locale)} should have been refused`);
    assert.equal(result.field, 'locale');
  }
  assert.equal(calls.length, before, 'no malformed locale reached transport');
});
