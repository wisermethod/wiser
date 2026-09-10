import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const inputs = { search: { q: 'example' }, get_docket: { id: '1' }, get_cluster: { id: '1' }, list_courts: {} };

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
