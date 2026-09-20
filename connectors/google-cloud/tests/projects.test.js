import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const GET = 'google-cloud.projects.get';
const SEARCH = 'google-cloud.projects.search';
const POLICY = 'google-cloud.projects.get_iam_policy';
const CRM = 'https://cloudresourcemanager.googleapis.com/v3';
const PROJECT = 'my-proj';
const VALID = { project: PROJECT };

const PROJECT_ENVELOPE = {
  name: 'projects/my-proj',
  projectId: 'my-proj',
  state: 'ACTIVE',
  displayName: 'Example',
  createTime: '2026-01-01T00:00:00Z',
  updateTime: '2026-01-02T00:00:00Z',
  parent: 'folders/1',
  etag: 'etag',
  labels: { env: 'test' },
  tags: { k: 'v' },
  configuredCapabilities: ['capability'],
  isManagementProject: false,
  deleteTime: '2026-01-03T00:00:00Z',
};

const POLICY_ENVELOPE = {
  version: 3,
  etag: 'etag',
  bindings: [{ role: 'roles/viewer', members: ['user:example@example.com'] }],
  auditConfigs: [],
};

async function activeGateway(data = PROJECT_ENVELOPE) {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-cloud', module: 'projects', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(data), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function run(gw, action, input, extra = {}) {
  return gw.execute({ action, input, confirm: true, ...extra });
}

function call(action, input, data) {
  return modules.projects[action](input, {
    proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesSchema(schema, value) {
  if (schema.type === 'object') {
    if (!isPlainObject(value)) return false;
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !Object.hasOwn(schema.properties, key)) return false;
      }
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) return false;
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key) && !matchesSchema(child, value[key])) return false;
    }
    return true;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.items) {
      for (const item of value) {
        if (!matchesSchema(schema.items, item)) return false;
      }
    }
    return true;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (schema.enum && !schema.enum.includes(value)) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    return true;
  }
  if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) return false;
    if (schema.enum && !schema.enum.includes(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
    return true;
  }
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return false;
}

test('get needs_connect until the projects read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: GET, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'projects');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('get uses an absolute GET proxy and exposes invented vendor data only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, GET, VALID);
  assert.equal(result.projectId, PROJECT);
  assert.equal(result.state, 'ACTIVE');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, `${CRM}/projects/${PROJECT}`);
  assert.equal(calls[0].body, undefined);
});

test('search uses an absolute GET and sends only supplied query parameters', async () => {
  const { gw, calls } = await activeGateway({ projects: [PROJECT_ENVELOPE], nextPageToken: 'token' });
  const empty = await run(gw, SEARCH, {});
  assert.equal(empty.status, undefined);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, `${CRM}/projects:search`);
  const full = await run(gw, SEARCH, { query: 'id:my-proj', page_size: 10, page_token: 'token' });
  assert.equal(full.nextPageToken, 'token');
  const url = new URL(calls[1].endpoint);
  assert.equal(url.origin, 'https://cloudresourcemanager.googleapis.com');
  assert.equal(url.pathname, '/v3/projects:search');
  assert.equal(url.searchParams.get('query'), 'id:my-proj');
  assert.equal(url.searchParams.get('pageSize'), '10');
  assert.equal(url.searchParams.get('pageToken'), 'token');
});

test('get_iam_policy is a POST that reads and sends {} when no version is supplied', async () => {
  const { gw, calls } = await activeGateway(POLICY_ENVELOPE);
  const result = await run(gw, POLICY, VALID);
  assert.equal(result.version, 3);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, `${CRM}/projects/${PROJECT}:getIamPolicy`);
  assert.deepEqual(calls[0].body, {});
});

test('get_iam_policy does not ask for confirmation', async () => {
  const { gw, fake, calls } = await activeGateway(POLICY_ENVELOPE);
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(POLICY_ENVELOPE), headers: {} };
  };
  const result = await gw.execute({ action: POLICY, input: VALID });
  assert.equal(result.status, undefined);
  assert.equal(result.version, 3);
  assert.equal(calls.length, 1);
});

test('requested_policy_version accepts 0, 1 and 3 and refuses 2', async () => {
  const { gw, fake, calls } = await activeGateway(POLICY_ENVELOPE);
  for (const n of [0, 1, 3]) {
    const result = await run(gw, POLICY, { ...VALID, requested_policy_version: n });
    assert.equal(result.status, undefined, String(n));
    assert.deepEqual(calls.at(-1).body, { options: { requestedPolicyVersion: n } });
  }
  fake.auth.proxy = async () => assert.fail('invalid requested_policy_version reached the proxy');
  for (const n of [2, -1, 4, 1.5, '1', null, true]) {
    const result = await run(gw, POLICY, { ...VALID, requested_policy_version: n });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(n));
    assert.equal(result.field, 'requested_policy_version');
  }
  assert.equal(calls.length, 3);
});

test('project accepts the vendor rule and refuses what it does not, before transport', async () => {
  const { gw, fake, calls } = await activeGateway();
  const accepted = ['abcdef', 'my-proj', 'a23456', 'abc-ef', `a${'b'.repeat(28)}c`];
  for (const project of accepted) {
    const result = await run(gw, GET, { project });
    assert.equal(result.status, undefined, project);
    assert.equal(calls.at(-1).endpoint, `${CRM}/projects/${project}`);
  }
  fake.auth.proxy = async () => assert.fail('invalid project reached the proxy');
  const refused = ['abcde', `a${'b'.repeat(29)}c`, 'Abcdef', '1bcdef', 'abcdef-', 'abc_def', '', 1, null, true];
  for (const project of refused) {
    const result = await run(gw, GET, { project });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(project));
    assert.equal(result.field, 'project');
  }
  assert.equal(calls.length, accepted.length);
});

test('page_size accepts every int32 and refuses what is not one, before transport', async () => {
  const { gw, fake, calls } = await activeGateway({ projects: [] });
  for (const page_size of [0, -1, 1, -2147483648, 2147483647]) {
    const result = await run(gw, SEARCH, { page_size });
    assert.equal(result.status, undefined, String(page_size));
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('pageSize'), String(page_size));
  }
  fake.auth.proxy = async () => assert.fail('invalid page_size reached the proxy');
  for (const page_size of [2147483648, -2147483649, 1.5, '1', true, null]) {
    const result = await run(gw, SEARCH, { page_size });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(page_size));
    assert.equal(result.field, 'page_size');
  }
});

test('query and page_token accept any string, including empty, and refuse a non-string', async () => {
  const { gw, fake, calls } = await activeGateway({ projects: [] });
  for (const query of ['', 'id:my-proj', 'state:ACTIVE']) {
    const result = await run(gw, SEARCH, { query });
    assert.equal(result.status, undefined, JSON.stringify(query));
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('query'), query);
  }
  const token = await run(gw, SEARCH, { page_token: '' });
  assert.equal(token.status, undefined);
  fake.auth.proxy = async () => assert.fail('invalid string reached the proxy');
  for (const query of [1, null, true, {}]) {
    const result = await run(gw, SEARCH, { query });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(query));
    assert.equal(result.field, 'query');
  }
});

test('required fields missing are refused by name before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid input reached the proxy');
  const missing = await run(gw, GET, {});
  assert.equal(missing.status, 'invalid_arguments');
  assert.equal(missing.field, 'project');
});

test('undeclared keys and non-object input never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  const extra = await run(gw, GET, { ...VALID, extra: true });
  assert.equal(extra.status, 'invalid_arguments');
  assert.equal(extra.field, 'extra');
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal(
      (await modules.projects.get(input, { proxy: async () => assert.fail('reached proxy') })).status,
      'invalid_arguments',
    );
  }
});

test('every reader accepts a subset of its key set, including {}, and refuses an unknown key', async () => {
  const emptyProject = await call('get', VALID, {});
  assert.deepEqual(emptyProject, {});
  const named = await call('get', VALID, { name: 'projects/my-proj' });
  assert.deepEqual(named, { name: 'projects/my-proj' });
  const full = await call('get', VALID, PROJECT_ENVELOPE);
  assert.deepEqual(full, PROJECT_ENVELOPE);
  const emptySearch = await call('search', {}, {});
  assert.deepEqual(emptySearch, {});
  const emptyList = await call('search', {}, { projects: [] });
  assert.deepEqual(emptyList, { projects: [] });
  const emptyPolicy = await call('get_iam_policy', VALID, {});
  assert.deepEqual(emptyPolicy, {});
  for (const [action, input, data] of [
    ['get', VALID, { undocumented: true }],
    ['get', VALID, { name: 'projects/my-proj', extra: true }],
    ['search', {}, { quotaNote: 'synthetic-private-response' }],
    ['get_iam_policy', VALID, { extra: true }],
  ]) {
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(Object.hasOwn(result, 'data'), false);
  }
});

test('every reader type-checks present members without requiring them, non-array members included', async () => {
  const wrong = [
    ['get', { name: 42 }],
    ['get', { state: 'RUNNING' }],
    ['get', { isManagementProject: 'yes' }],
    ['get', { labels: [] }],
    ['get', { configuredCapabilities: {} }],
    ['search', { nextPageToken: 1 }],
    ['search', { projects: 'no' }],
    ['search', { projects: [{ extra: true }] }],
    ['search', { projects: [null] }],
    ['get_iam_policy', { version: 1.5 }],
    ['get_iam_policy', { etag: 1 }],
    ['get_iam_policy', { bindings: {} }],
  ];
  for (const [action, data] of wrong) {
    const input = action === 'search' ? {} : VALID;
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
  }
  const well = [
    ['get', { state: 'STATE_UNSPECIFIED' }],
    ['get', { state: 'DELETE_REQUESTED', isManagementProject: true }],
    ['search', { nextPageToken: '', projects: [{}] }],
    ['get_iam_policy', { version: 0 }],
    ['get_iam_policy', { version: 3, bindings: [], auditConfigs: [], etag: '' }],
  ];
  for (const [action, data] of well) {
    const input = action === 'search' ? {} : VALID;
    const result = await call(action, input, structuredClone(data));
    assert.deepEqual(result, data, JSON.stringify(data));
  }
});

test('an envelope a reader cannot read is a vendor_error, never the body', async () => {
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ name: 'projects/my-proj' }],
  ];
  for (const data of unreadable) {
    const result = await call('get', VALID, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, `${CRM}/projects/${PROJECT}`);
    assert.equal(result.method, 'GET');
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false);
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

test('the published input schema accepts exactly what the module accepts', async () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  const getSchema = manifest.modules.projects.actions.get.input;
  const searchSchema = manifest.modules.projects.actions.search.input;
  const policySchema = manifest.modules.projects.actions.get_iam_policy.input;
  assert.equal(getSchema.additionalProperties, false);
  assert.deepEqual(getSchema.required, ['project']);
  assert.equal(
    getSchema.properties.project.pattern,
    '^([a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,19})$',
  );
  assert.deepEqual(policySchema.properties.requested_policy_version.enum, [0, 1, 3]);
  assert.equal(searchSchema.properties.page_size.minimum, -2147483648);
  assert.equal(searchSchema.properties.page_size.maximum, 2147483647);

  const accepted = [
    [getSchema, VALID],
    [getSchema, { project: 'abcdef' }],
    [searchSchema, {}],
    [searchSchema, { query: '', page_size: 0, page_token: '' }],
    [searchSchema, { page_size: -2147483648 }],
    [policySchema, VALID],
    [policySchema, { ...VALID, requested_policy_version: 0 }],
    [policySchema, { ...VALID, requested_policy_version: 1 }],
    [policySchema, { ...VALID, requested_policy_version: 3 }],
  ];
  for (const [schema, input] of accepted) {
    assert.equal(matchesSchema(schema, input), true, JSON.stringify(input));
  }
  const refused = [
    [getSchema, {}],
    [getSchema, { project: 'Abcdef' }],
    [getSchema, { project: 'abcdef-' }],
    [getSchema, { ...VALID, extra: true }],
    [searchSchema, { page_size: 2147483648 }],
    [searchSchema, { query: 1 }],
    [policySchema, { ...VALID, requested_policy_version: 2 }],
  ];
  for (const [schema, input] of refused) {
    assert.equal(matchesSchema(schema, input), false, JSON.stringify(input));
  }
});

test('the module source names no credential surface and a call returns none', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const token of ['process.env', 'generic_api_key', 'X-Goog-Api-Key', 'readFileSync', 'getKeyString']) {
    assert.equal(source.includes(token), false, token);
  }
  const { gw, calls } = await activeGateway();
  const result = await run(gw, GET, VALID);
  const dumped = JSON.stringify({ result, calls });
  assert.equal(/generic_api_key|AIza/i.test(dumped), false);
  assert.equal(Object.hasOwn(calls[0], 'headers'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('module preserves gateway status objects untouched', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error', 'denied']) {
    const result = { status };
    assert.equal(await modules.projects.get(VALID, { proxy: async () => result }), result);
  }
});
