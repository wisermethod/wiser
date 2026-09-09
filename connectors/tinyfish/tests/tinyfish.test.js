import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const inputs = { search: { query: 'example' }, fetch: { urls: ['https://example.com/'] } };

async function activeGateway() {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'tinyfish', module: 'web', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  const proxy = fixture.fake.auth.proxy;
  fixture.fake.auth.proxy = async (request) => { calls.push(request); return proxy(request); };
  return { ...fixture, calls };
}

test('both actions need the web read grant before any transport', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  for (const [action, input] of Object.entries(inputs)) {
    const result = await gw.execute({ action: `tinyfish.web.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, 'web');
    assert.equal(result.privilege, 'read');
  }
  assert.equal(fake.accounts.size, 0);
});

test('search uses the absolute GET endpoint and exposes invented vendor data only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await gw.execute({ action: 'tinyfish.web.search', input: inputs.search });
  assert.deepEqual(result, {
    query: 'example',
    results: [{ position: 1, site_name: 'Example', title: 'Example', snippet: 'Example content', url: 'https://example.com/' }],
    total_results: 1, page: 0,
  });
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, 'https://api.search.tinyfish.ai?query=example');
  assert.equal(calls[0].body, undefined);
});

test('fetch uses the absolute POST endpoint with urls and exposes invented vendor data only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await gw.execute({ action: 'tinyfish.web.fetch', input: inputs.fetch });
  assert.deepEqual(result, { results: [{ url: 'https://example.com/', content: 'Example content' }], errors: [] });
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, 'https://api.fetch.tinyfish.ai');
  assert.deepEqual(calls[0].body, inputs.fetch);
});

test('search encodes optional strings and accepts all domain types and page boundaries', async () => {
  const { gw, calls } = await activeGateway();
  for (const domain_type of ['web', 'news', 'research_paper']) {
    for (const page of [0, 10]) {
      const input = { query: 'example & page=9', location: 'Example City & region', language: 'en', include_domains: 'example.com,example.org', exclude_domains: 'example.net', domain_type, page };
      await gw.execute({ action: 'tinyfish.web.search', input });
      const url = new URL(calls.at(-1).endpoint);
      assert.equal(url.origin, 'https://api.search.tinyfish.ai');
      assert.equal([...url.searchParams].length, Object.keys(input).length);
      for (const [key, value] of Object.entries(input)) assert.equal(url.searchParams.get(key), String(value));
    }
  }
  assert.equal(calls.length, 6);
});

test('fetch accepts all formats and ten HTTPS URLs without adding options', async () => {
  const { gw, calls } = await activeGateway();
  for (const format of ['markdown', 'html', 'json']) {
    const input = { urls: Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`), format };
    await gw.execute({ action: 'tinyfish.web.fetch', input });
    assert.deepEqual(calls.at(-1).body, input);
  }
  assert.equal(calls.length, 3);
});

test('invalid search arguments never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid search reached proxy');
  const invalid = [{}, { query: '' }, { query: ' \t' }, { query: 1 }, { query: null }, { query: 'example', purpose: 'example' }];
  for (const field of ['location', 'language', 'include_domains', 'exclude_domains']) {
    for (const value of [1, null, [], {}]) invalid.push({ query: 'example', [field]: value });
  }
  for (const domain_type of ['', 'other', null, 1]) invalid.push({ query: 'example', domain_type });
  for (const page of [-1, 11, 1.5, '0', null, true]) invalid.push({ query: 'example', page });
  for (const input of invalid) {
    assert.equal((await gw.execute({ action: 'tinyfish.web.search', input })).status, 'invalid_arguments');
  }
});

test('invalid fetch arguments never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid fetch reached proxy');
  const invalid = [{}, { urls: [] }, { urls: 'https://example.com/' }, { urls: null }, { urls: Array(11).fill('https://example.com/') }];
  for (const url of ['http://example.com/', 'ftp://example.com/', '/example', 'https://', 'https:example.com', '', 1, null, {}]) {
    invalid.push({ urls: [url] }, { urls: ['https://example.com/', url] });
  }
  for (const format of ['', 'text', null, 1]) invalid.push({ ...inputs.fetch, format });
  for (const field of ['purpose', 'highlights', 'selectors', 'etag', 'ttl']) invalid.push({ ...inputs.fetch, [field]: 'example' });
  for (const input of invalid) {
    assert.equal((await gw.execute({ action: 'tinyfish.web.fetch', input })).status, 'invalid_arguments');
  }
});

test('module refuses malformed inputs, sparse URL arrays and nonfinite pages', async () => {
  const ctx = { proxy: async () => assert.fail('invalid input reached proxy') };
  for (const action of ['search', 'fetch']) {
    for (const input of [undefined, null, [], 'example', 1]) {
      assert.equal((await modules.web[action](input, ctx)).status, 'invalid_arguments');
    }
  }
  assert.equal((await modules.web.fetch({ urls: Array(1) }, ctx)).status, 'invalid_arguments');
  for (const page of [NaN, Infinity]) {
    assert.equal((await modules.web.search({ query: 'example', page }, ctx)).status, 'invalid_arguments');
  }
});

test('module preserves gateway status objects and unwraps falsy vendor data', async () => {
  for (const [action, input] of Object.entries(inputs)) {
    for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error']) {
      const result = { status };
      assert.equal(await modules.web[action](input, { proxy: async () => result }), result);
    }
    for (const data of [null, false, 0, '']) {
      assert.equal(await modules.web[action](input, { proxy: async () => ({ status: 200, data, headers: {} }) }), data);
    }
  }
});

test('gateway preserves proxy capability and vendor failure stops', async () => {
  const { gw, fake } = await activeGateway();
  for (const [action, input] of Object.entries(inputs)) {
    fake.auth.proxy = async () => ({ supported: false });
    assert.equal((await gw.execute({ action: `tinyfish.web.${action}`, input })).status, 'needs_provider_capability');
    fake.auth.proxy = async ({ endpoint, method }) => ({ status: 429, error: { code: 'vendor_error', endpoint, method } });
    const result = await gw.execute({ action: `tinyfish.web.${action}`, input });
    assert.equal(result.status, 'vendor_error');
    assert.equal(Object.hasOwn(result, 'headers'), false);
  }
});
