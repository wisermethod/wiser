import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { loadConnectors } from '../../../gateway/src/manifest.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));

const RESEARCH_BILLED = {
  serp: { keyword: 'example', location_code: 2840, language_code: 'en' },
  keyword_ideas: { keywords: ['example'], location_code: 2840, language_code: 'en' },
  related_keywords: { keyword: 'example', location_code: 2840, language_code: 'en' },
  search_volume: { keywords: ['example'] },
  keyword_difficulty: { keywords: ['example'], location_code: 2840, language_code: 'en' },
  search_intent: { keywords: ['example'], language_code: 'en' },
  ranked_keywords: { target: 'example.com', location_code: 2840, language_code: 'en' },
  competitors: { target: 'example.com', location_code: 2840, language_code: 'en' },
};

const RESEARCH_ENDPOINTS = {
  serp: '/v3/serp/google/organic/live/advanced',
  keyword_ideas: '/v3/dataforseo_labs/google/keyword_ideas/live',
  related_keywords: '/v3/dataforseo_labs/google/related_keywords/live',
  search_volume: '/v3/keywords_data/google_ads/search_volume/live',
  keyword_difficulty: '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live',
  search_intent: '/v3/dataforseo_labs/google/search_intent/live',
  ranked_keywords: '/v3/dataforseo_labs/google/ranked_keywords/live',
  competitors: '/v3/dataforseo_labs/google/competitors_domain/live',
};

const BACKLINKS = {
  summary: { target: 'example.com' },
  referring_domains: { target: 'example.com' },
  anchors: { target: 'example.com' },
};

const BACKLINKS_ENDPOINTS = {
  summary: '/v3/backlinks/summary/live',
  referring_domains: '/v3/backlinks/referring_domains/live',
  anchors: '/v3/backlinks/anchors/live',
};

function wrapProxy(fake) {
  const calls = [];
  const proxy = fake.auth.proxy;
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return proxy(request);
  };
  fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  return calls;
}

test('every research action needs_connect until the research grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  for (const [action, input] of Object.entries({ ...RESEARCH_BILLED, locations: {} })) {
    const result = await gw.execute({ action: `dataforseo.research.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, 'research');
  }
  assert.equal(fake.accounts.size, 0);
});

test('every backlinks action needs_connect until the backlinks grant is active', async () => {
  const { gw } = await createTestGateway();
  for (const [action, input] of Object.entries(BACKLINKS)) {
    const result = await gw.execute({ action: `dataforseo.backlinks.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, 'backlinks');
  }
});

test('a research grant does not unlock backlinks, and the reverse', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  for (const [action, input] of Object.entries(BACKLINKS)) {
    assert.equal((await gw.execute({ action: `dataforseo.backlinks.${action}`, input, confirm: true })).status, 'needs_connect');
  }
  const { gw: gw2, store: store2, fake: fake2 } = await createTestGateway();
  await putActive(store2, fake2, { service: 'dataforseo', module: 'backlinks', privilege: 'write' });
  for (const [action, input] of Object.entries({ ...RESEARCH_BILLED, locations: {} })) {
    assert.equal((await gw2.execute({ action: `dataforseo.research.${action}`, input, confirm: true })).status, 'needs_connect');
  }
});

test('every billed research action needs_confirmation after the grant without confirm', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  for (const [action, input] of Object.entries(RESEARCH_BILLED)) {
    const result = await gw.execute({ action: `dataforseo.research.${action}`, input });
    assert.equal(result.status, 'needs_confirmation', action);
  }
});

test('every billed backlinks action needs_confirmation after the grant without confirm', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'backlinks', privilege: 'write' });
  for (const [action, input] of Object.entries(BACKLINKS)) {
    const result = await gw.execute({ action: `dataforseo.backlinks.${action}`, input });
    assert.equal(result.status, 'needs_confirmation', action);
  }
});

for (const [action, input] of Object.entries(RESEARCH_BILLED)) {
  test(`research.${action} with confirm posts one task to ${RESEARCH_ENDPOINTS[action]}`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
    const calls = wrapProxy(fake);
    const result = await gw.execute({ action: `dataforseo.research.${action}`, input, confirm: true });
    assert.equal(Object.hasOwn(result, 'cost'), true);
    assert.equal(Object.hasOwn(result, 'tasks'), true);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].endpoint, RESEARCH_ENDPOINTS[action]);
    assert.equal(Array.isArray(calls[0].body), true);
    assert.equal(calls[0].body.length, 1);
    assert.equal(typeof calls[0].body[0], 'object');
  });
}

for (const [action, input] of Object.entries(BACKLINKS)) {
  test(`backlinks.${action} with confirm posts one task to ${BACKLINKS_ENDPOINTS[action]}`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service: 'dataforseo', module: 'backlinks', privilege: 'write' });
    const calls = wrapProxy(fake);
    const result = await gw.execute({ action: `dataforseo.backlinks.${action}`, input, confirm: true });
    assert.equal(Object.hasOwn(result, 'cost'), true);
    assert.equal(Object.hasOwn(result, 'tasks'), true);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].endpoint, BACKLINKS_ENDPOINTS[action]);
    assert.equal(Array.isArray(calls[0].body), true);
    assert.equal(calls[0].body.length, 1);
  });
}

test('locations calls GET with no body, no confirmation, and filters by country', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  const calls = wrapProxy(fake);
  const all = await gw.execute({ action: 'dataforseo.research.locations', input: {} });
  assert.notEqual(all.status, 'needs_confirmation');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, '/v3/dataforseo_labs/locations_and_languages');
  assert.equal(calls[0].body, undefined);
  assert.equal(all.tasks[0].result.length, 2);

  const filtered = await gw.execute({ action: 'dataforseo.research.locations', input: { country: 'us' } });
  assert.equal(filtered.tasks[0].result.length, 1);
  assert.equal(filtered.tasks[0].result[0].country_iso_code, 'US');
  assert.equal(Object.hasOwn(filtered, 'cost'), true);
  assert.equal(Object.hasOwn(filtered, 'tasks'), true);
  assert.equal(Object.hasOwn(filtered, 'headers'), false);
});

test('invalid input with confirm true produces zero proxy calls', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  await putActive(store, fake, { service: 'dataforseo', module: 'backlinks', privilege: 'write' });
  const calls = wrapProxy(fake);
  const cases = [
    ['dataforseo.research.serp', { keyword: '', location_code: 2840, language_code: 'en' }, 'keyword'],
    ['dataforseo.research.keyword_ideas', { keywords: Array.from({ length: 201 }, (_, i) => `k${i}`), location_code: 2840, language_code: 'en' }, 'keywords'],
    ['dataforseo.research.keyword_ideas', { keywords: ['example'], location_code: 2840, language_code: 'en', limit: 0 }, 'limit'],
    ['dataforseo.research.keyword_ideas', { keywords: ['example'], location_code: 2840, language_code: 'en', limit: 1001 }, 'limit'],
    ['dataforseo.research.related_keywords', { keyword: 'example', location_code: 2840, language_code: 'en', depth: 5 }, 'depth'],
    ['dataforseo.research.ranked_keywords', { target: 'https://example.com', location_code: 2840, language_code: 'en' }, 'target'],
    ['dataforseo.research.serp', { keyword: 'example', location_code: 2840, language_code: 'en', extra: true }, 'extra'],
    ['dataforseo.research.serp', { keyword: 'example', location_code: 2840, language_code: 'en', device: 'tablet' }, 'device'],
    ['dataforseo.research.serp', { keyword: 'example', location_code: 2840, language_code: 'en', include_clickstream_data: true }, 'include_clickstream_data'],
  ];
  for (const [action, input, field] of cases) {
    const result = await gw.execute({ action, input, confirm: true });
    assert.equal(result.status, 'invalid_arguments', `${action} ${field}`);
    assert.equal(result.field, field, `${action} ${field}`);
  }
  assert.equal(calls.length, 0);
});

test('HTTP 200 with a charged failed task is returned as data', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  fake.auth.proxy = async () => ({
    status: 200,
    data: {
      version: '0.1.20260919',
      status_code: 20000,
      status_message: 'Ok.',
      time: '0.12 sec.',
      cost: 0.012,
      tasks_count: 1,
      tasks_error: 1,
      tasks: [{
        id: 'example-task',
        status_code: 40501,
        status_message: 'Invalid Field.',
        time: '0.01 sec.',
        cost: 0.012,
        result_count: 0,
        result: null,
      }],
    },
    headers: { 'x-example': 'secret' },
  });
  const result = await gw.execute({
    action: 'dataforseo.research.keyword_ideas',
    input: { keywords: ['example'], location_code: 2840, language_code: 'en' },
    confirm: true,
  });
  assert.equal(result.cost, 0.012);
  assert.equal(result.tasks[0].status_code, 40501);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.notEqual(result.status, 'vendor_error');
});

for (const httpStatus of [401, 403, 429, 500]) {
  test(`proxy vendor_error ${httpStatus} is sanitized with no body`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
    fake.auth.proxy = async (request) => ({
      status: httpStatus,
      error: { code: 'vendor_error', endpoint: request.endpoint, method: request.method },
      data: { secret: 'should-not-leak' },
    });
    const result = await gw.execute({
      action: 'dataforseo.research.serp',
      input: { keyword: 'example', location_code: 2840, language_code: 'en' },
      confirm: true,
    });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.http_status, httpStatus);
    assert.equal(JSON.stringify(result).includes('should-not-leak'), false);
    assert.equal(Object.hasOwn(result, 'data'), false);
  });
}

test('connector loads under loadConnectors with manifest/export parity and no placeholders', async () => {
  const loaded = await loadConnectors([CONNECTORS]);
  const connector = loaded.find((row) => row.id === 'dataforseo');
  assert.ok(connector);
  for (const [modName, modDef] of Object.entries(MANIFEST.modules)) {
    for (const actName of Object.keys(modDef.actions)) {
      assert.equal(typeof modules[modName][actName], 'function', `${modName}.${actName}`);
    }
    for (const actName of Object.keys(modules[modName])) {
      if (typeof modules[modName][actName] !== 'function') continue;
      assert.ok(modDef.actions[actName], `extra export ${modName}.${actName}`);
    }
  }
  const leftover = ['{', '{'].join('');
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else assert.equal(readFileSync(path, 'utf8').includes(leftover), false, path);
    }
  };
  walk(DIR);
});
