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
  serp: '/serp/google/organic/live/advanced',
  keyword_ideas: '/dataforseo_labs/google/keyword_ideas/live',
  related_keywords: '/dataforseo_labs/google/related_keywords/live',
  search_volume: '/keywords_data/google_ads/search_volume/live',
  keyword_difficulty: '/dataforseo_labs/google/bulk_keyword_difficulty/live',
  search_intent: '/dataforseo_labs/google/search_intent/live',
  ranked_keywords: '/dataforseo_labs/google/ranked_keywords/live',
  competitors: '/dataforseo_labs/google/competitors_domain/live',
};

const BACKLINKS = {
  summary: { target: 'example.com' },
  referring_domains: { target: 'example.com' },
  anchors: { target: 'example.com' },
};

const BACKLINKS_ENDPOINTS = {
  summary: '/backlinks/summary/live',
  referring_domains: '/backlinks/referring_domains/live',
  anchors: '/backlinks/anchors/live',
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
  assert.equal(calls[0].endpoint, '/dataforseo_labs/locations_and_languages');
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
    ['dataforseo.research.serp', { keyword: 'example', location_code: 2840, language_code: 'en', depth: 700 }, 'depth'],
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

test('serp refuses vendor operator tokens in keyword, including after one URL decode', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  const calls = wrapProxy(fake);
  const cases = [
    'site:example.com',
    'SITE:example.com',
    'intitle:example',
    'site%3Aexample.com',
    'cache:example.com',
  ];
  for (const keyword of cases) {
    const result = await gw.execute({
      action: 'dataforseo.research.serp',
      input: { keyword, location_code: 2840, language_code: 'en' },
      confirm: true,
    });
    assert.equal(result.status, 'invalid_arguments', keyword);
    assert.equal(result.field, 'keyword', keyword);
  }
  assert.equal(calls.length, 0);
});

test('serp depth 200 is accepted and 210 is refused', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  const calls = wrapProxy(fake);
  const ok = await gw.execute({
    action: 'dataforseo.research.serp',
    input: { keyword: 'example', location_code: 2840, language_code: 'en', depth: 200 },
    confirm: true,
  });
  assert.equal(Object.hasOwn(ok, 'cost'), true);
  assert.equal(calls.length, 1);
  const refused = await gw.execute({
    action: 'dataforseo.research.serp',
    input: { keyword: 'example', location_code: 2840, language_code: 'en', depth: 210 },
    confirm: true,
  });
  assert.equal(refused.status, 'invalid_arguments');
  assert.equal(refused.field, 'depth');
  assert.equal(calls.length, 1);
});

test('filters accept a flat triple and a nested group, and refuse the vendor grammar violations', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  const calls = wrapProxy(fake);
  const base = { keywords: ['example'], location_code: 2840, language_code: 'en' };

  const flat = await gw.execute({
    action: 'dataforseo.research.keyword_ideas',
    input: { ...base, filters: ['keyword_info.search_volume', '>', 0] },
    confirm: true,
  });
  assert.equal(Object.hasOwn(flat, 'cost'), true);

  const nested = await gw.execute({
    action: 'dataforseo.research.keyword_ideas',
    input: {
      ...base,
      filters: [
        ['keyword_info.search_volume', '>', 100],
        'and',
        [
          ['keyword_info.cpc', '<', 0.5],
          'or',
          ['keyword_info.high_top_of_page_bid', '<=', 0.5],
        ],
      ],
    },
    confirm: true,
  });
  assert.equal(Object.hasOwn(nested, 'cost'), true);

  const five = await gw.execute({
    action: 'dataforseo.research.keyword_ideas',
    input: {
      ...base,
      filters: [
        ['keyword_info.search_volume', '>', 0],
        'and',
        [
          ['keyword_info.cpc', '<', 1],
          'or',
          ['keyword_info.competition', '>=', 0],
          'or',
          [
            ['keyword_info.low_top_of_page_bid', '<=', 2],
            'and',
            ['keyword_info.high_top_of_page_bid', '>', 0],
          ],
        ],
      ],
    },
    confirm: true,
  });
  assert.equal(Object.hasOwn(five, 'cost'), true);
  assert.equal(calls.length, 3);

  const refusals = [
    ['and'],
    [['keyword_info.search_volume', 'nonsense', 0]],
    [
      ['a', '>', 0], 'and', ['b', '>', 0], 'and', ['c', '>', 0], 'and',
      ['d', '>', 0], 'and', ['e', '>', 0], 'and', ['f', '>', 0], 'and',
      ['g', '>', 0], 'and', ['h', '>', 0], 'and', ['i', '>', 0],
    ],
  ];
  for (const filters of refusals) {
    const result = await gw.execute({
      action: 'dataforseo.research.keyword_ideas',
      input: { ...base, filters },
      confirm: true,
    });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(filters));
    assert.equal(result.field, 'filters', JSON.stringify(filters));
  }
  assert.equal(calls.length, 3);
});

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

test('filter operands are checked per operator before transport', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  fake.auth.proxy = async () => assert.fail('an invalid operand reached the proxy');
  const base = { keywords: ['example'], location_code: 2840, language_code: 'en' };
  for (const filters of [
    ['keyword_info.search_volume', 'in', 100],
    ['keyword_info.search_volume', 'regex', 12],
    ['keyword_info.search_volume', 'regex', 'x'.repeat(1001)],
    ['keyword_info.search_volume', 'in', []],
  ]) {
    const result = await gw.execute({ action: 'dataforseo.research.keyword_ideas', input: { ...base, filters }, confirm: true });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'filters');
  }
});

test('valid operands per operator still reach the confirmation gate', async () => {
  const { gw: gw2, store: store2, fake } = await createTestGateway();
  await putActive(store2, fake, { service: 'dataforseo', module: 'research', privilege: 'write' });
  const base = { keywords: ['example'], location_code: 2840, language_code: 'en' };
  for (const filters of [
    ['keyword_info.search_volume', 'in', [100, 200]],
    ['keyword_info.search_volume', 'regex', 'ex.*'],
    ['keyword_info.search_volume', '>', 0],
  ]) {
    const result = await gw2.execute({ action: 'dataforseo.research.keyword_ideas', input: { ...base, filters } });
    assert.equal(result.status, 'needs_confirmation');
  }
});
