import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const ZONE = 'abcdef0123456789abcdef0123456789';
const ID = '12345678-1234-1234-1234-123456789abc';
const DOMAIN_ID = 'abcdefabcdefabcdefabcdefabcdefab';
const ROOT = `/accounts/${ACCOUNT}/workers`;
const SCRIPT = `${ROOT}/scripts/proof-worker`;
const BASE = 'https://releases.example.test/';
const VALUE = 'fixture-plain-value-never-returned';
const PROVIDER_TOKEN = 'fixture-provider-token-never-returned';
const read = { account_id: ACCOUNT, script_name: 'proof-worker' };
const vars = { ...read, app: 'wiser-crm', version: '1.0.0', vars: { ACCESS_AUD: VALUE } };
const domain = { ...read, hostname: 'app.example.test' };
const inputs = {
  set_vars: vars, add_custom_domain: { ...domain, zone_id: ZONE }, remove_custom_domain: domain,
  set_workers_dev: { ...read, enabled: true, previews_enabled: false }, list_versions: read,
};
const envelope = (result) => ({ status: 200, data: { success: true, result } });
const error = (status) => ({ status, data: { success: false, errors: [{ message: PROVIDER_TOKEN }] } });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/worker-release-format2/manifest.json', import.meta.url)));
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const otherKey = generateKeyPairSync('ed25519').privateKey;
const keyBytes = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const currentBindings = [
  { name: 'DB', type: 'd1', database_id: ID }, { name: 'ASSETS', type: 'assets' },
  { name: 'ACCESS_AUD', type: 'plain_text', text: 'previous-plain-value' },
  { name: 'UNCHANGED', type: 'plain_text', text: 'unchanged-plain-value' },
  { name: 'EXISTING_SECRET', type: 'secret_text' },
  { name: 'UNFAMILIAR', type: 'future_binding', internal: { token: PROVIDER_TOKEN } },
];
async function setup(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'worker-settings-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'connectors', 'cloudflare');
  mkdirSync(dir, { recursive: true });
  for (const name of ['index.js', 'worker-release.js', 'manifest.json']) cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(dir, 'release.json'), JSON.stringify({ format: 1, base: BASE,
    apps: { 'wiser-crm': { keys: [{ id: sha(keyBytes).slice(0, 16), ed25519: keyBytes.toString('base64') }] } } }));
  const manifest = structuredClone(fixture);
  if (options.change) options.change(manifest);
  const raw = options.raw ?? Buffer.from(JSON.stringify(manifest));
  const signature = options.unsigned ? Buffer.alloc(0) : sign(null, raw, options.otherKey ? otherKey : privateKey);
  const fetches = [];
  const env = await createTestGateway({ home, connectorDirs: [join(home, 'connectors')], fetchImpl: async (url) => {
    fetches.push(url);
    if (url === BASE + 'wiser-crm/1.0.0/manifest.json') return new Response(raw);
    if (url === BASE + 'wiser-crm/1.0.0/manifest.sig') return new Response(signature);
    assert.fail('set_vars fetched a content file or a non-pinned address');
  } });
  if (!options.disconnected) await putActive(env.store, env.fake, { service: 'cloudflare', module: 'workers' });
  const calls = [];
  let attached = options.absentDomain ? null : { id: DOMAIN_ID, hostname: domain.hostname, service: options.foreign ? 'other-worker' : read.script_name, zone_id: ZONE, environment: 'production' };
  env.fake.auth.proxy = async (req) => {
    calls.push(req);
    if (options.responder) return options.responder(req, calls.length);
    if (req.endpoint === SCRIPT + '/settings' && req.method === 'GET') return envelope({ bindings: options.bindings ?? currentBindings });
    if (req.endpoint === SCRIPT + '/settings' && req.method === 'PATCH') return envelope({ bindings: [{ name: 'ACCESS_AUD', text: VALUE, type: 'plain_text' }], token: PROVIDER_TOKEN });
    if (req.endpoint === SCRIPT + '/deployments') return envelope({ deployments: [{ versions: [{ version_id: ID, percentage: 100 }] }] });
    if (req.endpoint === ROOT + '/domains' && req.method === 'GET') return envelope(attached ? [attached] : []);
    if (req.endpoint === ROOT + '/domains' && req.method === 'PUT') { attached = { id: DOMAIN_ID, ...req.body }; return envelope(attached); }
    if (req.endpoint === ROOT + '/domains/' + DOMAIN_ID && req.method === 'GET') return attached ? envelope({ ...attached, ...(options.foreignDetail ? { service: 'other-worker' } : {}) }) : error(404);
    if (req.endpoint === ROOT + '/domains/' + DOMAIN_ID && req.method === 'DELETE') { if (!options.keepDomain) attached = null; return envelope(null); }
    if (req.endpoint === ROOT + '/subdomain' && req.method === 'GET') return options.noSubdomain ? error(404) : envelope({ subdomain: 'fixture-account' });
    if (req.endpoint === SCRIPT + '/subdomain' && req.method === 'POST') return envelope({ ...req.body, token: PROVIDER_TOKEN });
    if (req.endpoint === SCRIPT + '/versions') return envelope({ items: [{ id: ID, metadata: { created_on: '2026-10-25T00:00:00.123456Z', author_email: PROVIDER_TOKEN }, bindings: [{ name: 'HIDDEN', text: PROVIDER_TOKEN }] }] });
    assert.fail(`unexpected request ${req.method} ${req.endpoint}`);
  };
  const execute = async (action, input = inputs[action]) => {
    const args = { action: `cloudflare.workers.${action}`, input };
    const first = await env.gw.execute(args);
    return first.status === 'needs_confirmation' ? env.gw.execute({ ...args, confirm: true }) : first;
  };
  return { ...env, calls, fetches, execute };
}
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);
const noValues = (result) => {
  const text = JSON.stringify(result);
  for (const value of [VALUE, PROVIDER_TOKEN, 'previous-plain-value', 'unchanged-plain-value']) assert.ok(!text.includes(value), 'response must omit binding values and provider tokens');
};

for (const [action, input] of Object.entries(inputs)) {
  test(`${action}: needs_connect before a grant`, async (t) => {
    const env = await setup(t, { disconnected: true });
    assert.equal((await env.execute(action)).status, 'needs_connect');
    assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
  });
  test(`${action}: closed schema rejects extra, wrong type, missing field and non-object before transport`, async (t) => {
    const env = await setup(t);
    const missing = { ...input }; delete missing.account_id;
    for (const bad of [{ ...input, extra: true }, { ...input, account_id: 7 }, missing, null, [], 'bad', { ...input, script_name: '..' }]) {
      assert.equal((await env.execute(action, bad)).status, 'invalid_arguments');
      assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
    }
  });
  if (action !== 'list_versions') test(`${action}: confirmation always precedes transport`, async (t) => {
    const env = await setup(t);
    const result = await env.gw.execute({ action: `cloudflare.workers.${action}`, input });
    assert.equal(result.status, 'needs_confirmation');
    assert.ok(!JSON.stringify(result).includes(PROVIDER_TOKEN));
    assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
  });
  test(`${action}: provider refusal returns no raw diagnostic`, async (t) => {
    const env = await setup(t, { responder: () => error(403) });
    const result = await env.execute(action);
    assert.equal(result.status, 'vendor_error'); noValues(result);
  });
}

test('set_vars: verified manifest then read settings, preserve all other bindings, PATCH multipart, report active id only', async (t) => {
  const env = await setup(t);
  const result = await env.execute('set_vars');
  assert.deepEqual(result, { keys_set: ['ACCESS_AUD'], version_id: ID }); noValues(result);
  assert.deepEqual(env.fetches, ['manifest.json', 'manifest.sig'].map((n) => BASE + 'wiser-crm/1.0.0/' + n));
  assert.deepEqual(trace(env.calls), [['GET', SCRIPT + '/settings'], ['PATCH', SCRIPT + '/settings'], ['GET', SCRIPT + '/deployments'], ['GET', SCRIPT + '/settings']]);
  const req = env.calls[1];
  assert.equal(req.body, undefined);
  const form = await new Response(Buffer.from(req.binary_body.base64, 'base64'), { headers: { 'Content-Type': req.binary_body.content_type } }).formData();
  assert.deepEqual([...form.keys()], ['settings']);
  const part = form.get('settings');
  const sent = JSON.parse(typeof part === 'string' ? part : await part.text());
  assert.deepEqual(sent, { bindings: [
    ...currentBindings.filter((b) => b.name !== 'ACCESS_AUD').map((b) => ({ name: b.name, type: 'inherit' })),
    { name: 'ACCESS_AUD', text: VALUE, type: 'plain_text' },
  ] });
});
test('set_vars: allowed-names refusal is before any Cloudflare call and echoes neither key nor value', async (t) => {
  const env = await setup(t);
  const result = await env.execute('set_vars', { ...vars, vars: { UNLISTED_PRIVATE_NAME: VALUE } });
  assert.equal(result.status, 'invalid_arguments'); assert.deepEqual(env.calls, []);
  assert.equal(env.fetches.length, 2); noValues(result);
  assert.ok(!JSON.stringify(result).includes('UNLISTED_PRIVATE_NAME'));
});
for (const [label, options] of [['unsigned', { unsigned: true }], ['other key', { otherKey: true }], ['signature before JSON shape', { raw: Buffer.from('not json'), otherKey: true }], ['signed wrong shape', { change: (m) => { m.extra = true; } }], ['signed wrong version', { change: (m) => { m.version = '2.0.0'; } }]]) {
  test(`set_vars: ${label} refused before Cloudflare`, async (t) => {
    const env = await setup(t, options); const result = await env.execute('set_vars');
    assert.equal(result.status, 'invalid_arguments'); assert.deepEqual(env.calls, []); noValues(result);
    if (label === 'signature before JSON shape') assert.match(result.reason, /signature invalid/);
  });
}
for (const badVars of [{ ACCESS_TOKEN: VALUE }, { 'BAD-NAME': VALUE }, { ACCESS_AUD: 3 }, { ACCESS_AUD: 'x'.repeat(513) }, [], null]) {
  test('set_vars: invalid nested vars refused without key or value before fetch', async (t) => {
    const env = await setup(t); const result = await env.execute('set_vars', { ...vars, vars: badVars });
    assert.equal(result.status, 'invalid_arguments'); assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []); noValues(result);
    assert.ok(!JSON.stringify(result).includes('ACCESS_TOKEN'));
  });
}
test('set_vars: Unicode bound counts 512 code points and permits partial updates', async (t) => {
  // ACCESS_AUD is documented as an optional property, not a required update key.
  const env = await setup(t, { bindings: [...currentBindings, { name: 'ACCESS_TEAM_DOMAIN', type: 'plain_text' }] });
  assert.deepEqual(await env.execute('set_vars', { ...vars, vars: { ACCESS_TEAM_DOMAIN: '\u{1f600}'.repeat(512) } }), { keys_set: ['ACCESS_TEAM_DOMAIN'], version_id: ID });
});
test('set_vars: an allowed name cannot overwrite a resource or secret binding', async (t) => {
  const env = await setup(t, { bindings: [{ name: 'ACCESS_AUD', type: 'secret_text' }] });
  const result = await env.execute('set_vars'); assert.equal(result.status, 'invalid_arguments');
  assert.equal(env.calls.length, 1); noValues(result);
});
test('set_vars: missing or malformed settings never cause an overwrite', async (t) => {
  for (const response of [error(404), envelope({}), envelope({ bindings: [{ name: 'DB' }] }), envelope({ bindings: [currentBindings[0], currentBindings[0]] })]) {
    const env = await setup(t, { responder: () => response });
    assert.equal((await env.execute('set_vars')).status, 'vendor_error'); assert.equal(env.calls.length, 1);
  }
});
test('add_custom_domain: request has hostname, service and zone id', async (t) => {
  const env = await setup(t, { absentDomain: true });
  assert.equal((await env.execute('add_custom_domain')).attached, true);
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/domains'], ['PUT', ROOT + '/domains']]);
  assert.deepEqual(env.calls[0].parameters, [{ name: 'hostname', value: domain.hostname, type: 'query' }]);
  assert.deepEqual(env.calls[1].body, { hostname: domain.hostname, service: read.script_name, zone_id: ZONE });
});
for (const action of ['add_custom_domain', 'remove_custom_domain']) test(`${action}: other-Worker check prevents any write`, async (t) => {
  const env = await setup(t, { foreign: true }); const result = await env.execute(action);
  assert.equal(result.status, 'invalid_arguments'); assert.deepEqual(trace(env.calls), [['GET', ROOT + '/domains']]); noValues(result);
});
test('remove_custom_domain: reads ownership by id, deletes and reads id and hostname back absent', async (t) => {
  const env = await setup(t); const result = await env.execute('remove_custom_domain');
  assert.deepEqual(result, { hostname: domain.hostname, removed: true, read_back: 'absent' });
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/domains'], ['GET', ROOT + '/domains/' + DOMAIN_ID], ['DELETE', ROOT + '/domains/' + DOMAIN_ID], ['GET', ROOT + '/domains/' + DOMAIN_ID], ['GET', ROOT + '/domains']]);
});
test('remove_custom_domain: changed owner on the id read is refused', async (t) => {
  const env = await setup(t, { foreignDetail: true }); assert.equal((await env.execute('remove_custom_domain')).status, 'invalid_arguments');
  assert.equal(env.calls.length, 2);
});
test('remove_custom_domain: present read-back is not success', async (t) => {
  const env = await setup(t, { keepDomain: true }); assert.deepEqual(await env.execute('remove_custom_domain'), { hostname: domain.hostname, removed: false, read_back: 'present' });
});
test('remove_custom_domain: absent hostname is refused without deleting anything', async (t) => {
  const env = await setup(t, { absentDomain: true }); assert.equal((await env.execute('remove_custom_domain')).status, 'invalid_arguments'); assert.equal(env.calls.length, 1);
});
for (const enabled of [false, true]) for (const previews_enabled of [false, true]) test('set_workers_dev: sends both flags as given, never creates account subdomain', async (t) => {
  const env = await setup(t); const input = { ...read, enabled, previews_enabled };
  assert.deepEqual(await env.execute('set_workers_dev', input), { enabled, previews_enabled });
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/subdomain'], ['POST', SCRIPT + '/subdomain']]);
  assert.deepEqual(env.calls[1].body, { enabled, previews_enabled });
  assert.ok(!env.calls.some((r) => r.endpoint === ROOT + '/subdomain' && r.method !== 'GET'));
});
test('set_workers_dev: subdomain guard refuses enabling absent account address', async (t) => {
  for (const flags of [{ enabled: true, previews_enabled: false }, { enabled: false, previews_enabled: true }]) {
    const env = await setup(t, { noSubdomain: true }); assert.equal((await env.execute('set_workers_dev', { ...read, ...flags })).status, 'invalid_arguments');
    assert.deepEqual(trace(env.calls), [['GET', ROOT + '/subdomain']]);
  }
});
test('list_versions: request pages and returns id and creation time only, never bindings', async (t) => {
  const env = await setup(t); const result = await env.execute('list_versions');
  assert.deepEqual(result, { versions: [{ id: ID, created_on: '2026-10-25T00:00:00.123456Z' }] }); noValues(result);
  assert.deepEqual(trace(env.calls), [['GET', SCRIPT + '/versions']]);
  assert.deepEqual(env.calls[0].parameters, [{ name: 'page', value: '1', type: 'query' }, { name: 'per_page', value: '100', type: 'query' }]);
  assert.ok(!JSON.stringify(result).includes('bindings'));
});
test('list_versions: reads a second page after a full first page', async (t) => {
  const env = await setup(t, { responder: (req, n) => envelope({ items: n === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: `${i.toString(16).padStart(8, '0')}-1234-1234-1234-123456789abc`, metadata: { created_on: '2026-10-25T00:00:00Z' } })) : [] }) });
  assert.equal((await env.execute('list_versions')).versions.length, 100); assert.equal(env.calls.length, 2);
  assert.equal(env.calls[1].parameters[0].value, '2');
});

for (const versions of [[{ version_id: ID, percentage: 0 }], [{ version_id: ID }], [{ version_id: ID, percentage: 99 }],
  [{ version_id: ID, percentage: 50 }, { version_id: '23456789-2345-2345-2345-23456789abcd', percentage: 50 }]]) {
  test(`set_vars: unconfirmed traffic ${JSON.stringify(versions)} reports settings updated`, async (t) => {
    const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/deployments')
      ? envelope({ deployments: [{ versions }] }) : envelope({ bindings: currentBindings }) });
    const answer = await env.execute('set_vars');
    assert.equal(answer.status, 'vendor_error'); assert.match(answer.reason, /settings updated/);
    assert.ok(!Object.hasOwn(answer, 'version_id')); noValues(answer);
    assert.equal(env.calls.filter((req) => req.method === 'PATCH').length, 1);
  });
}
test('set_vars: empty vars refused before any call or release fetch', async (t) => {
  const env = await setup(t), answer = await env.execute('set_vars', { ...vars, vars: {} });
  assert.equal(answer.status, 'invalid_arguments'); assert.equal(answer.field, 'vars');
  assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []); noValues(answer);
});
for (const bindings of [[], [{ name: 'ACCESS_AUD', type: 'secret_text' }], [{ name: 'ACCESS_AUD' }],
  [{ name: 'ACCESS_AUD', type: 'plain_text' }, { name: 'ACCESS_AUD', type: 'plain_text' }]]) {
  test('set_vars: read-back must contain each set key once as plain_text', async (t) => {
    let reads = 0;
    const env = await setup(t, { responder: (req) => {
      if (req.endpoint.endsWith('/deployments')) return envelope({ deployments: [{ versions: [{ version_id: ID, percentage: 100 }] }] });
      if (req.method === 'GET') return envelope({ bindings: ++reads === 1 ? currentBindings : bindings });
      return envelope({});
    } });
    const answer = await env.execute('set_vars');
    assert.equal(answer.status, 'vendor_error'); assert.match(answer.reason, /settings updated/);
    assert.ok(!Object.hasOwn(answer, 'version_id')); noValues(answer);
    assert.equal(reads, 2);
  });
}
test('set_vars: read-back confirms every set key using names/types without reading values', async (t) => {
  let reads = 0;
  const after = ['ACCESS_AUD', 'ACCESS_TEAM_DOMAIN'].map((name) => ({ name, type: 'plain_text',
    get text() { assert.fail('read-back must never inspect binding values'); } }));
  const env = await setup(t, { responder: (req) => {
    if (req.endpoint.endsWith('/deployments')) return envelope({ deployments: [{ versions: [{ version_id: ID, percentage: 100 }] }] });
    if (req.method === 'GET') return envelope({ bindings: ++reads === 1 ? currentBindings : after });
    return envelope({});
  } });
  const answer = await env.execute('set_vars', { ...vars, vars: { ACCESS_AUD: VALUE, ACCESS_TEAM_DOMAIN: 'example.test' } });
  assert.deepEqual(answer, { keys_set: ['ACCESS_AUD', 'ACCESS_TEAM_DOMAIN'], version_id: ID });
  assert.equal(reads, 2); noValues(answer);
});
test('set_vars: failed settings read-back reports update without leaking diagnostic', async (t) => {
  let reads = 0;
  const env = await setup(t, { responder: (req) => {
    if (req.endpoint.endsWith('/deployments')) return envelope({ deployments: [{ versions: [{ version_id: ID, percentage: 100 }] }] });
    if (req.method === 'GET') return ++reads === 1 ? envelope({ bindings: currentBindings }) : error(500);
    return envelope({});
  } });
  const answer = await env.execute('set_vars');
  assert.equal(answer.status, 'vendor_error'); assert.match(answer.reason, /settings updated/); noValues(answer);
});
