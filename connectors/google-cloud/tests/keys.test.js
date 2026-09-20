import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const LIST = 'google-cloud.keys.list';
const GET = 'google-cloud.keys.get';
const CREATE = 'google-cloud.keys.create';
const PATCH = 'google-cloud.keys.patch';
const OP = 'google-cloud.keys.get_operation';
const KEYS = 'https://apikeys.googleapis.com/v2';
const PROJECT = 'my-proj';
const KEY_ID = 'key-example';
const SERVICE = 'pagespeedonline.googleapis.com';
const RESTRICTIONS = { api_targets: [{ service: SERVICE }] };
const VALID_GET = { project: PROJECT, key_id: KEY_ID };
const VALID_CREATE = { project: PROJECT, restrictions: RESTRICTIONS };
const VALID_PATCH = { project: PROJECT, key_id: KEY_ID, restrictions: RESTRICTIONS };

const KEY_ENVELOPE = {
  name: `projects/${PROJECT}/locations/global/keys/${KEY_ID}`,
  uid: 'uid-example',
  displayName: 'Example',
  createTime: '2026-01-01T00:00:00Z',
  updateTime: '2026-01-02T00:00:00Z',
  etag: 'etag',
  annotations: { k: 'v' },
  serviceAccountEmail: 'sa@example.com',
  restrictions: { apiTargets: [{ service: SERVICE }] },
};

const SECRET = 'synthetic-key-string-value';

async function activeGateway(data = KEY_ENVELOPE) {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-cloud', module: 'keys', privilege: 'write' });
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
  return modules.keys[action](input, {
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

test('get needs_connect until the keys write grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: GET, input: VALID_GET });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'keys');
  assert.equal(result.privilege, 'write');
});

test('list uses an absolute GET proxy with locations/global hardcoded', async () => {
  const { gw, calls } = await activeGateway({ keys: [KEY_ENVELOPE], nextPageToken: 't' });
  const listed = await run(gw, LIST, { project: PROJECT, page_size: 5, show_deleted: false });
  assert.equal(listed.status, undefined);
  const listUrl = new URL(calls[0].endpoint);
  assert.equal(calls[0].method, 'GET');
  assert.equal(listUrl.origin, 'https://apikeys.googleapis.com');
  assert.equal(listUrl.pathname, `/v2/projects/${PROJECT}/locations/global/keys`);
  assert.equal(listUrl.searchParams.get('pageSize'), '5');
  assert.equal(listUrl.searchParams.get('showDeleted'), 'false');
});

test('get uses an absolute GET proxy for one key under locations/global', async () => {
  const { gw, calls } = await activeGateway();
  const got = await run(gw, GET, VALID_GET);
  assert.equal(got.uid, KEY_ENVELOPE.uid);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, `${KEYS}/projects/${PROJECT}/locations/global/keys/${KEY_ID}`);
});

test('create posts camelCase restrictions and optional displayName on an absolute URL', async () => {
  const { gw, calls } = await activeGateway({ name: 'operations/abc', done: false });
  const input = {
    project: PROJECT,
    key_id: 'chosen-id',
    display_name: 'Insights key',
    restrictions: { api_targets: [{ service: SERVICE, methods: ['runPagespeed'] }] },
  };
  const result = await run(gw, CREATE, input);
  assert.equal(result.done, false);
  const url = new URL(calls[0].endpoint);
  assert.equal(calls[0].method, 'POST');
  assert.equal(url.origin, 'https://apikeys.googleapis.com');
  assert.equal(url.pathname, `/v2/projects/${PROJECT}/locations/global/keys`);
  assert.equal(url.searchParams.get('keyId'), 'chosen-id');
  assert.deepEqual(calls[0].body, {
    restrictions: { apiTargets: [{ service: SERVICE, methods: ['runPagespeed'] }] },
    displayName: 'Insights key',
  });
});

test('create with one api_target service and no methods is accepted and omits methods on the wire', async () => {
  const { gw, calls } = await activeGateway({ done: false });
  const result = await run(gw, CREATE, VALID_CREATE);
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body, {
    restrictions: { apiTargets: [{ service: SERVICE }] },
  });
  assert.equal(Object.hasOwn(calls[0].body.restrictions.apiTargets[0], 'methods'), false);
});

test('an empty methods array is accepted and sent', async () => {
  const { gw, calls } = await activeGateway({ done: false });
  const result = await run(gw, CREATE, {
    project: PROJECT,
    restrictions: { api_targets: [{ service: SERVICE, methods: [] }] },
  });
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body.restrictions.apiTargets[0].methods, []);
});

test('restrictions: {} and restrictions: { api_targets: [] } are both refused before transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('unrestricted key reached the proxy');
  const empty = await run(gw, CREATE, { project: PROJECT, restrictions: {} });
  assert.equal(empty.status, 'invalid_arguments');
  assert.equal(empty.field, 'api_targets');
  const none = await run(gw, CREATE, { project: PROJECT, restrictions: { api_targets: [] } });
  assert.equal(none.status, 'invalid_arguments');
  assert.equal(none.field, 'api_targets');
  const missing = await run(gw, CREATE, { project: PROJECT });
  assert.equal(missing.status, 'invalid_arguments');
  assert.equal(missing.field, 'restrictions');
});

test('each of the four non-apiTargets restriction kinds is refused by name', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('client restriction reached the proxy');
  const kinds = [
    'browser_key_restrictions',
    'android_key_restrictions',
    'ios_key_restrictions',
    'server_key_restrictions',
  ];
  for (const kind of kinds) {
    const result = await run(gw, CREATE, {
      project: PROJECT,
      restrictions: { api_targets: [{ service: SERVICE }], [kind]: {} },
    });
    assert.equal(result.status, 'invalid_arguments', kind);
    assert.equal(result.field, kind);
    assert.match(result.message, /server-side key/);
  }
});

test('patch fixes updateMask=restrictions and does not take it as input', async () => {
  const { gw, calls } = await activeGateway({ done: true, response: KEY_ENVELOPE });
  const result = await run(gw, PATCH, VALID_PATCH);
  assert.equal(result.status, undefined);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(
    calls[0].endpoint,
    `${KEYS}/projects/${PROJECT}/locations/global/keys/${KEY_ID}?updateMask=restrictions`,
  );
  assert.deepEqual(calls[0].body, { restrictions: { apiTargets: [{ service: SERVICE }] } });
  const extra = await run(gw, PATCH, { ...VALID_PATCH, updateMask: 'displayName' });
  assert.equal(extra.status, 'invalid_arguments');
  assert.equal(extra.field, 'updateMask');
});

test('create and patch need_confirmation always and name the project', async () => {
  const { gw, fake } = await activeGateway({ done: false });
  fake.auth.proxy = async () => assert.fail('unconfirmed action reached transport');
  for (const [action, input] of [[CREATE, VALID_CREATE], [PATCH, VALID_PATCH]]) {
    const denied = await gw.execute({ action, input });
    assert.equal(denied.status, 'needs_confirmation', action);
    assert.equal(denied.confirmation, 'always');
    assert.equal(denied.risk, 'high');
    assert.match(denied.description, /project/i);
    assert.match(denied.summary, /project/i);
  }
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.modules.keys.actions.create.confirmation, 'always');
  assert.equal(manifest.modules.keys.actions.patch.confirmation, 'always');
  assert.equal(manifest.modules.keys.actions.list.confirmation, 'none');
  assert.equal(manifest.modules.keys.actions.get.confirmation, 'none');
  assert.equal(manifest.modules.keys.actions.get_operation.confirmation, 'none');
  assert.match(manifest.modules.keys.actions.create.description, /project/);
  assert.match(manifest.modules.keys.actions.patch.description, /project/);
  assert.match(manifest.modules.keys.actions.patch.description, /key/);
});

test('key_id follows the path rule on get and patch and the RFC 1034 rule on create', async () => {
  // Two different rules deliberately. get and patch read an id Google already
  // assigned, so the bound is the path pattern, [^/]+. create PROPOSES an id,
  // and the generated parameter states its rule in the description as a regular
  // expression: [a-z]([a-z0-9-]{0,61}[a-z0-9])?, a hard "must", so a value it
  // refuses would be refused at Google anyway.
  const slashGet = await call('get', { project: PROJECT, key_id: 'a/b' }, KEY_ENVELOPE);
  assert.equal(slashGet.status, 'invalid_arguments');
  const uuidGet = await call('get', { project: PROJECT, key_id: 'B7FF1F9F-8275' }, KEY_ENVELOPE);
  assert.equal(uuidGet.status, undefined, 'get reads whatever Google named the key');

  const slashCreate = await call('create', { ...VALID_CREATE, key_id: 'Bad/ID' }, { done: true });
  assert.equal(slashCreate.status, 'invalid_arguments', 'a slash must not reach a confirmed write');
  const upperCreate = await call('create', { ...VALID_CREATE, key_id: 'NotLower' }, { done: true });
  assert.equal(upperCreate.status, 'invalid_arguments');
  const trailingDash = await call('create', { ...VALID_CREATE, key_id: 'ends-' }, { done: true });
  assert.equal(trailingDash.status, 'invalid_arguments');
  const tooLong = await call('create', { ...VALID_CREATE, key_id: 'a'.repeat(64) }, { done: true });
  assert.equal(tooLong.status, 'invalid_arguments');
  const good = await call('create', { ...VALID_CREATE, key_id: 'wiser-pagespeed-1' }, { done: true });
  assert.equal(good.status, undefined);
  const single = await call('create', { ...VALID_CREATE, key_id: 'a' }, { done: true });
  assert.equal(single.status, undefined, 'one lower-case letter is the shortest legal id');
});

test('display_name accepts 63 characters and refuses 64, before transport', async () => {
  const { gw, fake, calls } = await activeGateway({ done: false });
  const ok = 'n'.repeat(63);
  const result = await run(gw, CREATE, { project: PROJECT, display_name: ok, restrictions: RESTRICTIONS });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.displayName, ok);
  fake.auth.proxy = async () => assert.fail('oversized display_name reached the proxy');
  const refused = await run(gw, CREATE, { project: PROJECT, display_name: 'n'.repeat(64), restrictions: RESTRICTIONS });
  assert.equal(refused.status, 'invalid_arguments');
  assert.equal(refused.field, 'display_name');
});

test('readKey never emits keyString, fed a response that contains one', async () => {
  const withSecret = { ...KEY_ENVELOPE, keyString: SECRET, deleteTime: '2026-01-03T00:00:00Z' };
  const result = await call('get', VALID_GET, withSecret);
  assert.equal(result.status, undefined);
  assert.equal(Object.hasOwn(result, 'keyString'), false);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(result.name, KEY_ENVELOPE.name);
  assert.equal(result.uid, KEY_ENVELOPE.uid);
  // deleteTime IS returned. It is a timestamp, not key material, and dropping
  // it lost the deletion time on a show_deleted listing for no reason.
  assert.equal(result.deleteTime, '2026-01-03T00:00:00Z');
  const listed = await call('list', { project: PROJECT }, { keys: [withSecret] });
  assert.equal(Object.hasOwn(listed.keys[0], 'keyString'), false);
  assert.equal(JSON.stringify(listed).includes(SECRET), false);
  const created = await call('create', VALID_CREATE, {
    done: true,
    response: withSecret,
  });
  assert.equal(Object.hasOwn(created.response, 'keyString'), false);
  assert.equal(JSON.stringify(created).includes(SECRET), false);
  const op = await call('get_operation', { operation_name: 'operations/abc' }, {
    done: true,
    response: { keyString: SECRET },
  });
  assert.deepEqual(op.response, {});
  assert.equal(JSON.stringify(op).includes(SECRET), false);
});

test('every reader accepts a subset of its key set, including {}, and refuses an unknown key', async () => {
  assert.deepEqual(await call('get', VALID_GET, {}), {});
  assert.deepEqual(await call('get', VALID_GET, { name: KEY_ENVELOPE.name }), { name: KEY_ENVELOPE.name });
  assert.deepEqual(await call('list', { project: PROJECT }, {}), {});
  assert.deepEqual(await call('list', { project: PROJECT }, { keys: [] }), { keys: [] });
  assert.deepEqual(await call('create', VALID_CREATE, {}), {});
  assert.deepEqual(await call('create', VALID_CREATE, { done: false }), { done: false });
  for (const [action, input, data] of [
    ['get', VALID_GET, { extra: true }],
    ['get', VALID_GET, { name: KEY_ENVELOPE.name, undocumented: true }],
    ['list', { project: PROJECT }, { quotaNote: 'synthetic-private-response' }],
    ['create', VALID_CREATE, { extra: true }],
  ]) {
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(Object.hasOwn(result, 'data'), false);
  }
});

test('every reader type-checks present members without requiring them, non-array members included', async () => {
  const wrong = [
    ['get', VALID_GET, { name: 1 }],
    ['get', VALID_GET, { uid: 1 }],
    ['get', VALID_GET, { displayName: 1 }],
    ['get', VALID_GET, { restrictions: [] }],
    ['get', VALID_GET, { annotations: [] }],
    ['get', VALID_GET, { keyString: 42 }],
    ['get', VALID_GET, { etag: 1 }],
    ['list', { project: PROJECT }, { keys: [{ extra: true }] }],
    ['list', { project: PROJECT }, { nextPageToken: 1 }],
    ['create', VALID_CREATE, { done: 'true' }],
    ['create', VALID_CREATE, { response: 'no' }],
  ];
  for (const [action, input, data] of wrong) {
    const result = await call(action, input, data);
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
  }
  const well = [
    ['get', VALID_GET, { displayName: '', etag: '', annotations: {}, restrictions: {} }],
    ['create', VALID_CREATE, { done: true, error: {}, metadata: {}, name: 'operations/abc', response: {} }],
  ];
  for (const [action, input, data] of well) {
    const result = await call(action, input, structuredClone(data));
    assert.equal(result.status, undefined, JSON.stringify(data));
  }
});

test('an envelope a reader cannot read is a vendor_error naming the endpoint, never the body', async () => {
  const result = await call('get', VALID_GET, { extra: 'synthetic-private-response' });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.endpoint, `${KEYS}/projects/${PROJECT}/locations/global/keys/${KEY_ID}`);
  assert.equal(result.method, 'GET');
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

test('the published input schema accepts exactly what the module accepts', async () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  const create = manifest.modules.keys.actions.create.input;
  const patch = manifest.modules.keys.actions.patch.input;
  const get = manifest.modules.keys.actions.get.input;
  assert.equal(create.additionalProperties, false);
  assert.deepEqual(create.required, ['project', 'restrictions']);
  assert.equal(create.properties.restrictions.additionalProperties, false);
  assert.deepEqual(create.properties.restrictions.required, ['api_targets']);
  assert.equal(create.properties.restrictions.properties.api_targets.minItems, 1);
  assert.equal(create.properties.display_name.maxLength, 63);
  // create's key_id is the RFC 1034 rule the generated parameter states in its
  // description, published so a caller composing from describe_action meets the
  // same bound the module enforces.
  assert.equal(create.properties.key_id.pattern, '^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$');
  assert.equal(create.properties.key_id.maxLength, 63);
  assert.equal(get.properties.key_id.pattern, '^[^/]+$');
  assert.deepEqual(patch.required, ['project', 'key_id', 'restrictions']);

  const accepted = [
    [create, VALID_CREATE],
    [create, { project: PROJECT, key_id: 'wiser-pagespeed-1', restrictions: RESTRICTIONS }],
    [create, { project: PROJECT, display_name: '', restrictions: { api_targets: [{ service: 'a', methods: [] }] } }],
    [create, { project: PROJECT, display_name: 'n'.repeat(63), restrictions: RESTRICTIONS }],
    [get, VALID_GET],
    [get, { project: PROJECT, key_id: 'not a uuid' }],
    [patch, VALID_PATCH],
  ];
  for (const [schema, input] of accepted) {
    assert.equal(matchesSchema(schema, input), true, JSON.stringify(input));
  }
  const refused = [
    [create, { project: PROJECT, key_id: 'a/b', restrictions: RESTRICTIONS }],
    [create, { project: PROJECT, key_id: 'NotLower', restrictions: RESTRICTIONS }],
    [create, { project: PROJECT, key_id: '', restrictions: RESTRICTIONS }],
    [create, { project: PROJECT, restrictions: {} }],
    [create, { project: PROJECT, restrictions: { api_targets: [] } }],
    [create, { project: PROJECT, restrictions: { api_targets: [{ service: SERVICE }], browser_key_restrictions: {} } }],
    [create, { project: PROJECT, restrictions: { api_targets: [{}] } }],
    [create, { project: PROJECT, display_name: 'n'.repeat(64), restrictions: RESTRICTIONS }],
    [get, { project: PROJECT, key_id: 'a/b' }],
    [get, { project: PROJECT, key_id: '' }],
    [patch, { project: PROJECT, key_id: KEY_ID }],
  ];
  for (const [schema, input] of refused) {
    assert.equal(matchesSchema(schema, input), false, JSON.stringify(input));
  }
});

test('the module source names no credential surface and no result carries one', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const token of ['process.env', 'generic_api_key', 'X-Goog-Api-Key', 'readFileSync', 'getKeyString']) {
    assert.equal(source.includes(token), false, token);
  }
  const { gw, calls } = await activeGateway({ ...KEY_ENVELOPE, keyString: SECRET });
  const result = await run(gw, GET, VALID_GET);
  const dumped = JSON.stringify({ result, calls });
  assert.equal(dumped.includes(SECRET), false);
  assert.equal(Object.hasOwn(result, 'keyString'), false);
  assert.equal(/generic_api_key|AIza/i.test(dumped), false);
  assert.equal(Object.hasOwn(calls[0], 'headers'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('module preserves gateway status objects untouched', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error', 'denied']) {
    const result = { status };
    assert.equal(await modules.keys.create(VALID_CREATE, { proxy: async () => result }), result);
  }
});

// A keys.create or get_operation response is google.protobuf.Any, whose
// ProtoJSON form carries a type URL: the generated schema says "Contains field
// @type with type URL". A reader that refused it would turn every successful
// key creation into a vendor_error at the first live write, which is this
// build's readAudio defect arriving a fifth time. Recognised, and dropped from
// the result because a type URL is transport rather than result.
test('an Any-wrapped key in an Operation response is read, and @type is not returned', async () => {
  const anyWrapped = {
    '@type': 'type.googleapis.com/google.api.apikeys.v2.Key',
    ...KEY_ENVELOPE,
  };
  const created = await call('create', VALID_CREATE, { done: true, response: anyWrapped });
  assert.equal(created.status, undefined, 'an Any-wrapped key must not be a vendor_error');
  assert.equal(created.response.name, KEY_ENVELOPE.name);
  assert.equal(Object.hasOwn(created.response, '@type'), false);
  const op = await call('get_operation', { operation_name: 'operations/abc' }, {
    done: true,
    response: anyWrapped,
  });
  assert.equal(op.status, undefined);
  assert.equal(Object.hasOwn(op.response, '@type'), false);
});

test('a project number is accepted wherever a project id is', async () => {
  // Resource Manager's own parameter description gives a number as its example,
  // "projects/415104041262", and Project.name is an int64 prefixed by projects/.
  // Refusing it was a bound the brief invented. Nineteen digits is int64.
  const listed = await call('list', { project: '415104041262' }, { keys: [] });
  assert.equal(listed.status, undefined, 'a project number must reach transport');
  const tooLong = await call('list', { project: '1'.repeat(20) }, { keys: [] });
  assert.equal(tooLong.status, 'invalid_arguments');
  const mixed = await call('list', { project: '123abc' }, { keys: [] });
  assert.equal(mixed.status, 'invalid_arguments', 'a digit-led mixed string is neither shape');
});

// An Operation's metadata, error.details and an unprojected response are all
// google.protobuf.Any: arbitrary vendor objects. Forwarding one would cross the
// credential boundary on trust, through the very reader that exists to stop
// that. None is forwarded.
test('no Any on an operation reaches the caller, including inside error.details', async () => {
  const poisoned = {
    done: true,
    name: 'operations/abc',
    metadata: { '@type': 'type.googleapis.com/x', keyString: SECRET },
    error: {
      code: 7,
      message: 'denied',
      details: [{ '@type': 'type.googleapis.com/google.api.apikeys.v2.Key', keyString: SECRET }],
    },
  };
  for (const [action, input] of [
    ['create', VALID_CREATE],
    ['get_operation', { operation_name: 'operations/abc' }],
  ]) {
    const result = await call(action, input, poisoned);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes(SECRET), false, `${action} must not forward an Any`);
    assert.equal(Object.hasOwn(result, 'metadata'), false, `${action} drops metadata`);
    assert.equal(Object.hasOwn(result.error ?? {}, 'details'), false, `${action} drops error.details`);
    assert.equal(result.error.code, 7, 'code survives');
    assert.equal(result.error.message, 'denied', 'message survives');
  }
});

// The endpoint this connector exists to exclude must be unreachable, not merely
// unimplemented. The anchored pattern plus segment encoding is what makes that
// true; a substring check did not.
test('operation_name is anchored to one segment and cannot re-route the request', async () => {
  for (const bad of [
    'projects/p/locations/global/keys/k:getKeyString#operations/',
    'operations/a/b',
    'operations/',
    '../operations/x',
    'operations/..',
    'operations/.',
  ]) {
    const result = await call('get_operation', { operation_name: bad }, { done: true });
    assert.equal(result.status, 'invalid_arguments', `refused: ${bad}`);
  }
  const ok = await call('get_operation', { operation_name: 'operations/abc-123' }, { done: true });
  assert.equal(ok.status, undefined);
});

// A query string is not a path separator, so the anchored pattern accepts it and
// the encoding is what makes it harmless. Both halves are the guard; asserting
// only the pattern would have missed that this one gets through it.
test('a query string inside the operation id is encoded rather than refused', async () => {
  const { gw, calls } = await activeGateway({ done: true });
  const result = await run(gw, OP, { operation_name: 'operations/x?alt=media' });
  assert.equal(result.status, undefined, 'the pattern accepts it: ? is not /');
  const endpoint = calls[0].endpoint;
  assert.ok(endpoint.endsWith('/operations/x%3Falt%3Dmedia'), endpoint);
  assert.equal(endpoint.includes('?'), false, 'nothing reaches the vendor as a query');
});
