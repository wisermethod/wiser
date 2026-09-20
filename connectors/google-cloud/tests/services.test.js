import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const LIST = 'google-cloud.services.list';
const GET = 'google-cloud.services.get';
const ENABLE = 'google-cloud.services.enable';
const OP = 'google-cloud.services.get_operation';
const SU = 'https://serviceusage.googleapis.com/v1';
const PROJECT = 'my-proj';
const SERVICE = 'translate.googleapis.com';
const VALID = { project: PROJECT, service: SERVICE };

const SERVICE_ENVELOPE = {
  name: 'projects/my-proj/services/translate.googleapis.com',
  parent: 'projects/my-proj',
  state: 'ENABLED',
  config: { name: 'translate.googleapis.com' },
};

const OPERATION = { name: 'operations/abc', done: false };

async function activeGateway(data = SERVICE_ENVELOPE) {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
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
  return modules.services[action](input, {
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

test('list needs_connect until the services write grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: LIST, input: { project: PROJECT } });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'services');
  assert.equal(result.privilege, 'write');
});

test('list uses an absolute GET proxy on serviceusage.googleapis.com', async () => {
  const { gw, calls } = await activeGateway({ services: [SERVICE_ENVELOPE] });
  const listed = await run(gw, LIST, { project: PROJECT, filter: 'state:ENABLED', page_size: 20 });
  assert.equal(listed.status, undefined);
  const listUrl = new URL(calls[0].endpoint);
  assert.equal(calls[0].method, 'GET');
  assert.equal(listUrl.origin, 'https://serviceusage.googleapis.com');
  assert.equal(listUrl.pathname, `/v1/projects/${PROJECT}/services`);
  assert.equal(listUrl.searchParams.get('filter'), 'state:ENABLED');
  assert.equal(listUrl.searchParams.get('pageSize'), '20');
});

test('get uses an absolute GET proxy for one service', async () => {
  const { gw, calls } = await activeGateway();
  const got = await run(gw, GET, VALID);
  assert.equal(got.state, 'ENABLED');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, `${SU}/projects/${PROJECT}/services/${SERVICE}`);
});

test('filter is not enforced: a string other than state:ENABLED reaches the vendor', async () => {
  const { gw, calls } = await activeGateway({ services: [] });
  const result = await run(gw, LIST, { project: PROJECT, filter: 'state:DISABLED' });
  assert.equal(result.status, undefined);
  assert.equal(new URL(calls[0].endpoint).searchParams.get('filter'), 'state:DISABLED');
});

test('enable sends exactly {} as its body on an absolute POST', async () => {
  const { gw, calls } = await activeGateway(OPERATION);
  const result = await run(gw, ENABLE, VALID);
  assert.equal(result.done, false);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, `${SU}/projects/${PROJECT}/services/${SERVICE}:enable`);
  assert.deepEqual(calls[0].body, {});
  assert.deepEqual(Object.keys(calls[0].body), []);
});

test('enable needs_confirmation always, names the project, and does not remember confirm', async () => {
  const { gw, fake, calls } = await activeGateway(OPERATION);
  fake.auth.proxy = async () => assert.fail('unconfirmed action reached transport');
  const denied = await gw.execute({ action: ENABLE, input: VALID });
  assert.equal(denied.status, 'needs_confirmation');
  assert.equal(denied.confirmation, 'always');
  assert.equal(denied.risk, 'high');
  assert.match(denied.description, /project/i);
  assert.match(denied.description, /service/i);
  assert.match(denied.summary, /project/i);
  assert.deepEqual(denied.input_fields, ['project', 'service']);
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(OPERATION), headers: {} };
  };
  const first = await run(gw, ENABLE, VALID);
  assert.equal(first.done, false);
  const second = await gw.execute({ action: ENABLE, input: VALID });
  assert.equal(second.status, 'needs_confirmation');
  assert.equal(calls.length, 1);
});

test('service accepts a nonempty path segment and refuses whitespace or a slash, before transport', async () => {
  const { gw, fake, calls } = await activeGateway();
  const accepted = ['translate.googleapis.com', 'a', 'service.googleapis.com'];
  for (const service of accepted) {
    const result = await run(gw, GET, { project: PROJECT, service });
    assert.equal(result.status, undefined, service);
    assert.equal(calls.at(-1).endpoint.endsWith(`/services/${service}`), true);
  }
  fake.auth.proxy = async () => assert.fail('invalid service reached the proxy');
  for (const service of ['', 'a/b', 'a b', 'a\tb', '/x', ' x', 1, null, true]) {
    const result = await run(gw, GET, { project: PROJECT, service });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(service));
    assert.equal(result.field, 'service');
  }
});

test('operation_name is the generated pattern, one segment, encoded into the path', async () => {
  // Both generated documents declare ^operations/[^/]+$ on this parameter. What this
  // manifest publishes is that, narrowed to exclude "." and ".." so it says exactly
  // what the module applies; the two admit a path the built URL does not promise.
  // An earlier version enforced only that the string contained "operations/",
  // which let a value carrying a URL fragment re-route the authenticated proxy
  // at another method entirely.
  const { gw, fake, calls } = await activeGateway(OPERATION);
  const result = await run(gw, OP, { operation_name: 'operations/abc' });
  assert.equal(result.status, undefined);
  assert.equal(calls.at(-1).endpoint, `${SU}/operations/abc`);
  assert.equal(calls.at(-1).method, 'GET');

  fake.auth.proxy = async () => assert.fail('invalid operation_name reached the proxy');
  for (const operation_name of [
    '',
    'operations/',
    'operations/a/b',
    'projects/my-proj/operations/xyz',
    'operation/abc',
    'ops/abc',
    '../operations/x',
    'operations/..',
    'operations/.',
    1,
    null,
    true,
  ]) {
    const result = await run(gw, OP, { operation_name });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(operation_name));
    assert.equal(result.field, 'operation_name');
  }
});

test('every mutating action declares confirmation always', async () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.modules.services.actions.enable.confirmation, 'always');
  assert.equal(manifest.modules.services.actions.enable.risk, 'high');
  assert.equal(manifest.modules.services.actions.list.confirmation, 'none');
  assert.equal(manifest.modules.services.actions.get.confirmation, 'none');
  assert.equal(manifest.modules.services.actions.get_operation.confirmation, 'none');
});

test('every reader accepts a subset of its key set, including {}, and refuses an unknown key', async () => {
  assert.deepEqual(await call('get', VALID, {}), {});
  assert.deepEqual(await call('get', VALID, { name: SERVICE_ENVELOPE.name }), { name: SERVICE_ENVELOPE.name });
  assert.deepEqual(await call('list', { project: PROJECT }, {}), {});
  assert.deepEqual(await call('list', { project: PROJECT }, { services: [] }), { services: [] });
  assert.deepEqual(await call('enable', VALID, {}), {});
  assert.deepEqual(await call('enable', VALID, { done: false }), { done: false });
  assert.deepEqual(await call('get_operation', { operation_name: 'operations/abc' }, { name: 'operations/abc' }), {
    name: 'operations/abc',
  });
  for (const [action, input, data] of [
    ['get', VALID, { extra: true }],
    ['list', { project: PROJECT }, { quotaNote: 'synthetic-private-response' }],
    ['enable', VALID, { undocumented: true }],
  ]) {
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(Object.hasOwn(result, 'data'), false);
  }
});

test('every reader type-checks present members without requiring them, non-array members included', async () => {
  const wrong = [
    ['get', VALID, { state: 'ACTIVE' }],
    ['get', VALID, { name: 1 }],
    ['get', VALID, { config: [] }],
    ['list', { project: PROJECT }, { nextPageToken: 1 }],
    ['list', { project: PROJECT }, { services: [{ extra: true }] }],
    ['enable', VALID, { done: 'false' }],
    ['enable', VALID, { error: 'broken' }],
    ['enable', VALID, { metadata: [] }],
    ['enable', VALID, { response: 'no' }],
    // metadata and response are still TYPE-checked on the way in, because a
    // body that misdeclares them is not a shape this reader recognises. What
    // changed is that neither is forwarded afterwards: both are Any, and an
    // Any is never passed through the credential boundary.
  ];
  for (const [action, input, data] of wrong) {
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
  }
  // A well-formed operation comes back projected: done, name and a code-and-
  // message error. metadata, error.details and an unprojected response are
  // recognised and dropped.
  const projected = await call('enable', VALID, {
    done: true,
    name: 'operations/abc',
    error: { code: 7, message: 'denied', details: [{ '@type': 'x' }] },
    metadata: { '@type': 'x' },
    response: { '@type': 'x' },
  });
  assert.equal(projected.status, undefined);
  assert.deepEqual(projected, { done: true, name: 'operations/abc', error: { code: 7, message: 'denied' } });

  const well = [
    ['get', VALID, { state: 'STATE_UNSPECIFIED' }],
    ['get', VALID, { state: 'DISABLED', config: {} }],
    // No operation case here: an operation comes back projected rather than
    // echoed, which the assertion above this list covers.
  ];
  for (const [action, input, data] of well) {
    const result = await call(action, input, structuredClone(data));
    assert.deepEqual(result, data, JSON.stringify(data));
  }
});

test('an envelope a reader cannot read is a vendor_error naming the endpoint, never the body', async () => {
  const result = await call('enable', VALID, { extra: 'synthetic-private-response' });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.endpoint, `${SU}/projects/${PROJECT}/services/${SERVICE}:enable`);
  assert.equal(result.method, 'POST');
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

test('the published input schema accepts exactly what the module accepts', async () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  const enable = manifest.modules.services.actions.enable.input;
  const list = manifest.modules.services.actions.list.input;
  const op = manifest.modules.services.actions.get_operation.input;
  assert.equal(enable.additionalProperties, false);
  assert.deepEqual(enable.required, ['project', 'service']);
  assert.equal(enable.properties.service.pattern, '^[^\\s/]+$');
  assert.equal(op.properties.operation_name.pattern, '^operations/(?!\\.{1,2}$)[^/]+$');
  assert.match(manifest.modules.services.actions.enable.description, /project/);
  assert.match(manifest.modules.services.actions.enable.description, /service/);

  const accepted = [
    [enable, VALID],
    [enable, { project: 'abcdef', service: 'a' }],
    [list, { project: PROJECT, filter: 'anything' }],
    [list, { project: PROJECT, filter: '' }],
    [op, { operation_name: 'operations/abc' }],
    [op, { operation_name: 'operations/...' }],
    [op, { operation_name: 'operations/.x' }],
  ];
  for (const [schema, input] of accepted) {
    assert.equal(matchesSchema(schema, input), true, JSON.stringify(input));
  }
  const refused = [
    [enable, { project: PROJECT }],
    [enable, { ...VALID, service: 'a/b' }],
    [enable, { ...VALID, service: 'a b' }],
    [enable, { ...VALID, extra: true }],
    [op, { operation_name: 'ops/abc' }],
    [op, { operation_name: '' }],
    // Witness item 4 of the 2026-09-20 connector audit, found by hand in this build and
    // then by machine. The published pattern admitted both and the module refused them,
    // so the schema said one thing and the code did another. It now excludes exactly the
    // two relative segments, and `operations/...` is still accepted.
    [op, { operation_name: 'operations/.' }],
    [op, { operation_name: 'operations/..' }],
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
    assert.equal(await modules.services.enable(VALID, { proxy: async () => result }), result);
  }
});
