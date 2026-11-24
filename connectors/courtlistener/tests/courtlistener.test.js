import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const lookupAction = 'courtlistener.caselaw.lookup_citation';
const lookupEndpoint = '/api/rest/v4/citation-lookup/';
const citationInput = { volume: '576', reporter: 'U.S.', page: '644' };
const citationText = 'Obergefell v. Hodges, 576 U.S. 644 (2015)';
const inputs = {
  search: { q: 'example' },
  get_docket: { id: '1' },
  get_cluster: { id: '1' },
  list_courts: {},
  lookup_citation: citationInput,
};

test('every action needs_connect until the caselaw read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  for (const [action, input] of Object.entries(inputs)) {
    const result = await gw.execute({ action: `courtlistener.caselaw.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, 'caselaw');
  }
  assert.equal(fake.accounts.size, 0);
});

for (const [action, input] of Object.entries(inputs)) {
  if (action === 'lookup_citation') continue;
  test(`${action} uses a relative GET proxy and exposes fake data only`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service: 'courtlistener', module: 'caselaw', privilege: 'read' });
    const calls = [];
    const proxy = fake.auth.proxy;
    fake.auth.proxy = async (request) => { calls.push(request); return proxy(request); };
    fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
    const result = await gw.execute({ action: `courtlistener.caselaw.${action}`, input });
    if (action === 'get_docket' || action === 'get_cluster') assert.equal(result.id, 1);
    else { assert.equal(result.count, 1); assert.equal(result.results.length, 1); }
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    const paths = { search: '/api/rest/v4/search/?q=example', get_docket: '/api/rest/v4/dockets/1/', get_cluster: '/api/rest/v4/clusters/1/', list_courts: '/api/rest/v4/courts/' };
    assert.equal(calls[0].endpoint, paths[action]);
  });
}

test('search encodes query text and accepts each supported type', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'courtlistener', module: 'caselaw', privilege: 'read' });
  const proxy = fake.auth.proxy;
  fake.auth.proxy = async (request) => {
    const url = new URL(request.endpoint, 'https://www.courtlistener.com');
    assert.equal(url.pathname, '/api/rest/v4/search/');
    assert.equal(url.searchParams.get('q'), 'example & type=p');
    assert.equal([...url.searchParams].length, 2);
    return proxy(request);
  };
  for (const type of ['o', 'r', 'oa', 'p']) {
    assert.equal((await gw.execute({ action: 'courtlistener.caselaw.search', input: { q: 'example & type=p', type } })).count, 1);
  }
});

test('invalid ids and search arguments are refused before the proxy', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'courtlistener', module: 'caselaw', privilege: 'read' });
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const action of ['get_docket', 'get_cluster']) {
    for (const input of [{}, { id: 'example' }, { id: '../1' }, { id: '1?example' }, { id: 1 }, { id: '' }]) {
      assert.equal((await gw.execute({ action: `courtlistener.caselaw.${action}`, input })).status, 'invalid_arguments');
    }
  }
  for (const input of [{}, { q: '' }, { q: ' ' }, { q: 1 }, { q: 'example', type: 'example' }]) {
    assert.equal((await gw.execute({ action: 'courtlistener.caselaw.search', input })).status, 'invalid_arguments');
  }
});

async function setupLookup() {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'courtlistener', module: 'caselaw', privilege: 'read' });
  fake.catalog.execute = async () => assert.fail('lookup used catalog execute');
  return { lookup: (input) => gw.execute({ action: lookupAction, input }), fake };
}

function citationEntry(citation, fields) {
  return {
    citation,
    normalized_citations: [citation],
    start_index: 0,
    end_index: citation.length,
    status: 200,
    error_message: '',
    clusters: [{ id: 1 }],
    ...fields,
  };
}

test('lookup_citation posts the citation fields and unwraps the matched entry', async () => {
  const { lookup, fake } = await setupLookup();
  const calls = [];
  const entry = citationEntry('576 U.S. 644');
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: [entry], headers: { 'content-type': 'application/json' } };
  };
  assert.deepEqual(await lookup(citationInput), { results: [entry] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, lookupEndpoint);
  assert.deepEqual(calls[0].body, citationInput);
});

test('lookup_citation posts text exactly as supplied', async () => {
  const { lookup, fake } = await setupLookup();
  const citation = '576 U.S. 644';
  const startIndex = citationText.indexOf(citation);
  const entry = citationEntry(citation, { start_index: startIndex, end_index: startIndex + citation.length });
  fake.auth.proxy = async (request) => {
    assert.deepEqual(request.body, { text: citationText });
    return { status: 200, data: [entry] };
  };
  assert.deepEqual(await lookup({ text: citationText }), { results: [entry] });
});

for (const [label, entry] of [
  ['no match', citationEntry('1 U.S. 200', {
    status: 404, error_message: "Citation not found: '1 U.S. 200'", clusters: [],
  })],
  ['ambiguous match', citationEntry('1 H. 150', {
    status: 300, normalized_citations: ['1 H. 150', '1 Handy 150', '1 Hill 150'], clusters: [{ id: 2 }, { id: 3 }],
  })],
  ['unknown reporter', citationEntry('33 Umbrella 422', {
    status: 400, error_message: "Unable to find reporter with abbreviation of 'Umbrella'", normalized_citations: [], clusters: [],
  })],
  ['citation over the request cap', citationEntry('1 U.S. 200', {
    status: 429, error_message: 'Too many citations requested.', clusters: [],
  })],
]) {
  test(`lookup_citation preserves a per-entry ${label}`, async () => {
    const { lookup, fake } = await setupLookup();
    fake.auth.proxy = async () => ({ status: 200, data: [entry] });
    assert.deepEqual(await lookup({ text: entry.citation }), { results: [entry] });
  });
}

test('lookup_citation returns an empty results array when no citation is recognized', async () => {
  const { lookup, fake } = await setupLookup();
  fake.auth.proxy = async () => ({ status: 200, data: [] });
  assert.deepEqual(await lookup({ text: 'No citation in this passage.' }), { results: [] });
});

test('lookup_citation refuses a non-array vendor response', async () => {
  const { lookup, fake } = await setupLookup();
  fake.auth.proxy = async () => ({ status: 200, data: { results: [] } });
  assert.deepEqual(await lookup(citationInput), { status: 'vendor_error', reason: 'unexpected_response' });
});

test('lookup_citation returns the gateway vendor error on a throttled request', async () => {
  const { lookup, fake } = await setupLookup();
  fake.auth.proxy = async () => ({
    status: 429,
    error: { code: 'vendor_error', endpoint: lookupEndpoint, method: 'POST' },
  });
  assert.deepEqual(await lookup(citationInput), {
    status: 'vendor_error', http_status: 429, endpoint: lookupEndpoint, method: 'POST',
  });
});

test('lookup_citation refuses invalid arguments before the proxy', async () => {
  const { lookup, fake } = await setupLookup();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  const { volume, reporter, page } = citationInput;
  for (const [label, input, field] of [
    ['neither form', {}, 'volume'],
    ['text and volume', { text: citationText, volume }, 'volume'],
    ['text and reporter', { text: citationText, reporter }, 'reporter'],
    ['text and page', { text: citationText, page }, 'page'],
    ['both forms', { text: citationText, ...citationInput }, 'volume'],
    ['volume only', { volume }, 'reporter'],
    ['reporter only', { reporter }, 'volume'],
    ['page only', { page }, 'volume'],
    ['missing volume', { reporter, page }, 'volume'],
    ['missing reporter', { volume, page }, 'reporter'],
    ['missing page', { volume, reporter }, 'page'],
    ['empty text', { text: '' }, 'text'],
    ['blank text', { text: '  ' }, 'text'],
    ['numeric text', { text: 1 }, 'text'],
    ['overlong text', { text: '😀'.repeat(64001) }, 'text'],
    ['nondigit volume', { ...citationInput, volume: 'v1' }, 'volume'],
    ['numeric volume', { ...citationInput, volume: 576 }, 'volume'],
    ['nondigit page', { ...citationInput, page: '64a' }, 'page'],
    ['numeric page', { ...citationInput, page: 644 }, 'page'],
    ['empty reporter', { ...citationInput, reporter: '' }, 'reporter'],
    ['blank reporter', { ...citationInput, reporter: ' ' }, 'reporter'],
    ['numeric reporter', { ...citationInput, reporter: 1 }, 'reporter'],
    ['overlong reporter', { ...citationInput, reporter: '😀'.repeat(101) }, 'reporter'],
    ['extra key', { ...citationInput, extra: true }, 'extra'],
  ]) {
    assert.deepEqual(await lookup(input), { status: 'invalid_arguments', field }, label);
  }
});

test('lookup_citation accepts the inclusive code-point limits without trimming', async () => {
  const { lookup, fake } = await setupLookup();
  const bodies = [];
  fake.auth.proxy = async (request) => {
    bodies.push(request.body);
    return { status: 200, data: [] };
  };
  const text = ` ${'😀'.repeat(63998)} `;
  const reporter = ` ${'😀'.repeat(98)} `;
  const triad = { ...citationInput, reporter };
  assert.deepEqual(await lookup({ text }), { results: [] });
  assert.deepEqual(await lookup(triad), { results: [] });
  assert.deepEqual(bodies, [{ text }, triad]);
});
