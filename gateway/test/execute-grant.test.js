import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContext } from '../src/context.js';
import { createAuthProvider } from '../providers/local-file/auth-provider.js';
import { createTestGateway, createFakeProviders, putActive, makeHome } from './fake-provider.js';

const action = 'github.repos.get';
const key = { service: 'github', module: 'repos' };
const input = { owner: 'example', repo: 'example' };
const refusal = (status) => ({ status, error: { code: 'vendor_error', endpoint: '/example', method: 'POST' } });

function connector(auth, fn, unwrapToken = false) {
  return {
    id: 'github',
    manifest: { modules: { repos: {
      auth,
      unwrap_token: unwrapToken,
      actions: { get: { risk: 'low', confirmation: 'none' } },
    } } },
    impl: { modules: { repos: fn ? { get: fn } : {} } },
  };
}

async function hosted(t, path = 'ctx.catalog') {
  const fake = createFakeProviders();
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const options = { home, fake };
  if (path !== 'ctx.catalog') {
    options.connectors = [connector(
      { provider: 'catalog', privilege: 'read', file: 'fixture.txt', variables: ['VALUE'] },
      path === 'ctx.proxy' ? (_input, ctx) => ctx.proxy({ endpoint: '/example', method: 'POST' }) : null,
    )];
  }
  const setup = await createTestGateway(options);
  const record = await putActive(setup.store, fake, key);
  const status = t.mock.method(fake.auth, 'status', async () => 'EXPIRED');
  fake.catalog.setResult('FAKE_REPOS_GET', refusal(401));
  fake.auth.proxy = async () => refusal(401);
  return { ...setup, record, status };
}

function assertUnchanged(store, record) {
  assert.deepEqual(store.getConnection(key), record);
}

for (const path of ['ctx.catalog', 'catalog', 'ctx.proxy']) {
  test(`${path}: ACTIVE plus auth refusal and EXPIRED becomes needs_connect`, async (t) => {
    const { gw, store, record, status, home } = await hosted(t, path);
    const result = await gw.execute({ action, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.provider_status, 'EXPIRED');
    const saved = store.getConnection(key);
    assert.equal(saved.status, 'EXPIRED');
    assert.equal(saved.id, record.id);
    assert.equal(saved.provider_account_id, record.provider_account_id);
    assert.equal(store.listConnections().length, 1);
    const auth = gw.lookupModule(key.service, key.module).auth;
    assert.deepEqual(status.mock.calls.map((c) => c.arguments), [[{
      providerAccountId: record.provider_account_id, service: key.service,
      file: auth.file, variables: auth.variables,
    }]]);
    const audit = readFileSync(join(home, 'audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(audit.at(-1).status, 'needs_connect');
  });
}

for (const word of ['EXPIRED', 'FAILED', 'INACTIVE', 'INITIATED']) {
  test(`403 plus object status ${word} updates the existing grant`, async (t) => {
    const { gw, store, fake } = await hosted(t, 'ctx.proxy');
    fake.auth.proxy = async () => refusal(403);
    fake.auth.status = async () => ({ status: word });
    const result = await gw.execute({ action, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.provider_status, word);
    assert.equal(store.getConnection(key).status, word);
  });
}

for (const httpStatus of [0, 400, 404, 500, 503]) {
  test(`vendor ${httpStatus} does not refresh or change an ACTIVE grant`, async (t) => {
    const { gw, store, fake, record, status } = await hosted(t);
    fake.catalog.setResult('FAKE_REPOS_GET', refusal(httpStatus));
    const result = await gw.execute({ action, input });
    assert.deepEqual(result, { status: 'vendor_error', http_status: httpStatus, endpoint: '/example', method: 'POST' });
    assert.equal(status.mock.callCount(), 0);
    assertUnchanged(store, record);
  });
}

for (const [label, raw] of [
  ['ACTIVE', 'ACTIVE'], ['object ACTIVE', { status: 'ACTIVE' }],
  ['unknown', 'UNKNOWN'], ['unmapped', null],
  ['transport 503', refusal(503)], ['transport 0', refusal(0)],
  ['error with grant word', { status: 'EXPIRED', error: { code: 'vendor_error' } }],
]) {
  test(`auth refusal plus status ${label} preserves vendor_error and ACTIVE`, async (t) => {
    const { gw, store, fake, record } = await hosted(t);
    const status = t.mock.method(fake.auth, 'status', async () => raw);
    const result = await gw.execute({ action, input });
    assert.deepEqual(result, { status: 'vendor_error', http_status: 401, endpoint: '/example', method: 'POST' });
    assert.equal(status.mock.callCount(), 1);
    assertUnchanged(store, record);
  });
}

test('auth refusal plus thrown status transport failure preserves vendor_error and ACTIVE', async (t) => {
  const { gw, store, fake, record } = await hosted(t);
  fake.auth.status = async () => { throw new Error('offline'); };
  const result = await gw.execute({ action, input });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 401);
  assertUnchanged(store, record);
});

async function local(t) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = 'credential.txt';
  const auth = { provider: 'local-file', privilege: 'read', file, variables: ['VALUE'], hosts: ['example.invalid'] };
  const provider = createAuthProvider({ secretsDir: home });
  const setup = await createTestGateway({
    home, localFileProvider: provider,
    connectors: [connector(auth, (_input, ctx) => ctx.http({ url: 'https://example.invalid/items' }), true)],
  });
  const record = await putActive(setup.store, setup.fake, { ...key, provider: 'local-file' });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected HTTP call'); });
  const status = t.mock.method(provider, 'status');
  const unwrap = t.mock.method(provider, 'unwrap');
  return { ...setup, provider, record, fetch, status, unwrap, path: join(home, file) };
}

for (const state of ['missing', 'empty', 'missing variable']) {
  test(`local-file ACTIVE plus ${state} file stops before unwrap and HTTP`, async (t) => {
    const { gw, store, path, fetch, status, unwrap } = await local(t);
    if (state === 'empty') writeFileSync(path, '');
    if (state === 'missing variable') writeFileSync(path, 'OTHER=fixture\n');
    const result = await gw.execute({ action, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.provider_status, 'INACTIVE');
    assert.equal(store.getConnection(key).status, 'INACTIVE');
    assert.equal(status.mock.callCount(), 1);
    assert.equal(unwrap.mock.callCount(), 0);
    assert.equal(fetch.mock.callCount(), 0);
  });
}

test('local-file status throw marks the grant INACTIVE', async (t) => {
  const { gw, store, status, unwrap, fetch } = await local(t);
  status.mock.mockImplementation(async () => { throw new Error('unreadable'); });
  const result = await gw.execute({ action, input });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.provider_status, 'INACTIVE');
  assert.equal(store.getConnection(key).status, 'INACTIVE');
  assert.equal(unwrap.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test('local-file unwrap miss after ACTIVE status marks the grant INACTIVE', async (t) => {
  const { gw, store, path, provider, unwrap, fetch } = await local(t);
  writeFileSync(path, `VALUE=${randomUUID()}\n`);
  provider.unwrap = async (args) => {
    rmSync(path);
    return unwrap(args);
  };
  const result = await gw.execute({ action, input });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.provider_status, 'INACTIVE');
  assert.equal(store.getConnection(key).status, 'INACTIVE');
  assert.equal(fetch.mock.callCount(), 0);
});

test('local-file unwrap throw after ACTIVE status marks the grant INACTIVE', async (t) => {
  const { gw, store, path, provider, fetch } = await local(t);
  writeFileSync(path, `VALUE=${randomUUID()}\n`);
  provider.unwrap = async () => { throw new Error('unreadable'); };
  const result = await gw.execute({ action, input });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.provider_status, 'INACTIVE');
  assert.equal(store.getConnection(key).status, 'INACTIVE');
  assert.equal(fetch.mock.callCount(), 0);
});

for (const httpStatus of [401, 403]) {
  test(`local-file present plus vendor ${httpStatus} stays vendor_error without refresh`, async (t) => {
    const { gw, store, record, path, status, fetch } = await local(t);
    writeFileSync(path, `VALUE=${randomUUID()}\n`);
    fetch.mock.mockImplementation(async () => ({ ok: false, status: httpStatus }));
    const result = await gw.execute({ action, input });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.http_status, httpStatus);
    assert.equal(status.mock.callCount(), 1);
    assert.equal(fetch.mock.callCount(), 1);
    assertUnchanged(store, record);
  });
}

for (const [provider, expected] of [['local-file', 'needs_connect'], ['catalog', 'needs_provider_capability']]) {
  test(`context unwrap miss for ${provider} throws ${expected}`, async () => {
    const ctx = buildContext({ auth: { provider }, unwrap: { supported: false } });
    await assert.rejects(ctx.http(), (err) => err.object?.status === expected);
  });
}
