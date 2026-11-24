import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const ID = '01234567-89ab-cdef-0123-456789abcdef';
const POLICY = '12345678-1234-1234-1234-123456789abc';
const TOKEN_ID = 'abcdef01-2345-6789-abcd-ef0123456789';
const AUD = 'ab'.repeat(32); // Public audience tag, not a credential.
const JWT = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJmaXh0dXJlIn0', 'fixtureSignature'].join('.');
const API_TOKEN = 'T'.repeat(40);
const CLIENT_VALUE = 'cd'.repeat(32);
const secrets = [JWT, API_TOKEN, CLIENT_VALUE];
const ROOT = `/accounts/${ACCOUNT}/access`;
const inputs = {
  create_app: { account_id: ACCOUNT, hostname: 'crm.example.com', name: 'CRM', policy_ids: [POLICY] },
  create_policy: { account_id: ACCOUNT, name: 'CRM staff', decision: 'allow', emails: ['one@example.com'] },
  set_staff: { account_id: ACCOUNT, policy_id: POLICY, remove: 'one@example.com' },
  list_staff: { account_id: ACCOUNT, policy_id: POLICY },
  get_app: { account_id: ACCOUNT, app_id: ID },
};
const app = () => ({ id: ID, type: 'self_hosted', domain: 'crm.example.com', self_hosted_domains: ['crm.example.com'], destinations: [{ type: 'public', uri: 'crm.example.com' }],
  policies: [attachable()], aud: AUD, client_secret: CLIENT_VALUE, metadata: { token: JWT } });
const staff = (emails = ['one@example.com', 'two@example.com']) => ({ id: POLICY, name: 'CRM staff', decision: 'allow', reusable: true,
  include: emails.map((email) => ({ email: { email } })), exclude: [],
  require: [], session_duration: '24h', approval_required: false });
const ok = (result, info) => ({ status: 200, data: { success: true, result, ...(info ? { result_info: info } : {}), messages: [{ message: JWT }] } });
const error = (status, codes = [10000]) => ({ status, data: { success: false, errors: codes.map((code) => ({ code, message: secrets.join(' ') })) } });
const clean = (result) => {
  const text = JSON.stringify(result);
  for (const secret of secrets) assert.ok(!text.includes(secret), 'invented credential must not reach any answer or stop');
  assert.ok(!text.includes(secrets.join(' ')), 'provider message must not reach any answer or stop');
  // The public audience tag intentionally has 64 hex digits.
  const withoutPublicAudience = text.replaceAll(`"aud":"${AUD}"`, '');
  assert.ok(!/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_]{40}/.test(withoutPublicAudience),
    'token-shaped text must not reach any answer or stop');
};
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);
async function setup(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'worker-access-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = await createTestGateway({ home });
  if (!options.disconnected) await putActive(env.store, env.fake, { service: 'cloudflare', module: 'access' });
  const calls = [];
  let policy = options.policy ?? { ...staff(), exclude: [] };
  let deleted = false;
  let posted = false;
  let postedApp;
  let policyDeleted = false;
  env.fake.auth.proxy = async (req) => {
    calls.push(structuredClone(req));
    if (options.responder) return options.responder(req, calls.length);
    if (req.endpoint === ROOT + '/organizations') return options.off ? error(403, [9999]) : ok({ auth_domain: 'team.cloudflareaccess.com', secret: CLIENT_VALUE });
    if (req.endpoint.startsWith(ROOT + '/apps?')) return ok(posted ? options.recoveryApps ?? [] : options.duplicates ?? [], options.listInfo ?? { total_pages: 1, total_count: (posted ? options.recoveryApps ?? [] : options.duplicates ?? []).length });
    if (req.endpoint === ROOT + '/apps' && req.method === 'POST') { posted = true; postedApp = { ...app(), domain: req.body.domain, self_hosted_domains: [req.body.domain], destinations: req.body.destinations, read_service_tokens_from_header: req.body.read_service_tokens_from_header, policies: req.body.policies.map(({ id }) => id === TOKEN_ID ? agentPolicy() : { ...attachable(), id }) }; return ok(options.createdApp ?? postedApp); }
    if (req.endpoint === ROOT + '/apps/' + ID && req.method === 'DELETE') {
      if (options.deleteFails) return error(502);
      deleted = true; return ok({ id: ID });
    }
    if (req.endpoint === ROOT + '/apps/' + ID && req.method === 'GET') return deleted && !options.stillPresent ? error(404) : ok(options.app ?? postedApp ?? app());
    if (req.endpoint === ROOT + '/policies' && req.method === 'POST') { policy = options.createdPolicy ?? { id: POLICY, ...req.body, reusable: true }; return ok({ ...policy, secret: CLIENT_VALUE }); }
    if (req.endpoint === ROOT + '/policies/' + POLICY && req.method === 'DELETE') {
      if (options.deleteFails) return error(502);
      policyDeleted = true; return ok({ id: POLICY });
    }
    if (req.endpoint === ROOT + '/policies/' + TOKEN_ID && req.method === 'GET') return ok(agentPolicy());
    if (req.endpoint === ROOT + '/policies/' + POLICY && req.method === 'GET') return policyDeleted && !options.stillPresent ? error(404) : options.postPolicyError && posted ? error(502) : ok(posted ? options.postPolicy ?? policy : policy);
    if (req.endpoint === ROOT + '/policies/' + POLICY && req.method === 'PUT') { if (!options.noChange) policy = { id: POLICY, ...req.body, reusable: true }; return ok({ ...policy, secret: CLIENT_VALUE }); }
    assert.fail('unexpected fake request');
  };
  const execute = async (action, input = inputs[action]) => {
    const args = { action: `cloudflare.access.${action}`, input };
    const stop = await env.gw.execute(args); clean(stop);
    const result = stop.status === 'needs_confirmation' ? await env.gw.execute({ ...args, confirm: true }) : stop;
    clean(result); return result;
  };
  return { ...env, calls, execute };
}

for (const [action, input] of Object.entries(inputs)) {
  test(`${action}: needs_connect before a grant`, async (t) => {
    const env = await setup(t, { disconnected: true });
    assert.equal((await env.execute(action)).status, 'needs_connect'); assert.deepEqual(env.calls, []);
  });
  test(`${action}: schema refuses extra, wrong type, missing required, non-object and invalid identifiers before transport`, async (t) => {
    const env = await setup(t); const missing = { ...input }; delete missing.account_id;
    for (const bad of [{ ...input, extra: true }, { ...input, account_id: 3 }, missing, null, [], 'bad', { ...input, account_id: '..' }]) {
      assert.equal((await env.execute(action, bad)).status, 'invalid_arguments');
    }
    assert.deepEqual(env.calls, []);
  });
  test(`${action}: response fields are bounded and token-shaped provider strings are absent`, async (t) => {
    const env = await setup(t); const result = await env.execute(action);
    assert.equal(result.success, true); clean(result);
    const keys = { create_app: ['success', 'id', 'aud'], create_policy: ['success', 'id'],
      set_staff: ['success', 'policy_id', 'changed', 'before', 'after'], list_staff: ['success', 'policy_id', 'emails'],
      get_app: ['success', 'id', 'aud', 'hostname', 'policy_ids', 'policies', 'single_header'] };
    assert.deepEqual(Object.keys(result).sort(), keys[action].sort());
  });
  if (action !== 'get_app' && action !== 'list_staff') {
    test(`${action}: confirmation always stops before transport`, async (t) => {
      const env = await setup(t);
      const first = await env.gw.execute({ action: `cloudflare.access.${action}`, input });
      assert.equal(first.status, 'needs_confirmation'); clean(first); assert.deepEqual(env.calls, []);
    });
    test(`${action}: organization is the first read; disabled Access refuses every write`, async (t) => {
      const env = await setup(t, { off: true });
      const result = await env.execute(action); assert.equal(result.status, 'denied'); assert.equal(result.access_enabled, false);
      assert.match(result.reason, /Access is not enabled/);
      assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations']]);
    });
    for (const codes of [[10000], [9999, 10000], []]) test(`${action}: a permission 403 with codes ${JSON.stringify(codes)} is not Access off`, async (t) => {
      const env = await setup(t, { responder: () => error(403, codes) });
      const result = await env.execute(action); assert.equal(result.status, 'vendor_error'); assert.equal(result.http_status, 403);
      assert.equal(result.access_enabled, undefined); assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations']]);
    });
  }
}

test('create_app: one hostname and reusable policy links, single-header setting explicitly disabled', async (t) => {
  const env = await setup(t); const result = await env.execute('create_app');
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['GET', ROOT + '/apps?per_page=1000&page=1'], ['GET', ROOT + '/policies/' + POLICY], ['POST', ROOT + '/apps'], ['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
  assert.deepEqual(env.calls.find((req) => req.method === 'POST').body, { type: 'self_hosted', domain: 'crm.example.com', name: 'CRM',
    destinations: [{ type: 'public', uri: 'crm.example.com' }], policies: [{ id: POLICY, precedence: 1 }] });
  assert.deepEqual(result, { success: true, id: ID, aud: AUD });
});
for (const duplicate of [{ domain: 'CRM.EXAMPLE.COM' }, { domain: '*.example.com' }, { domain: 'other.example.com', destinations: [{ type: 'public', uri: 'crm.example.com/path' }] }]) {
  test('create_app: a covering hostname is refused without POST ' + JSON.stringify(duplicate), async (t) => {
    const env = await setup(t, { duplicates: [{ id: ID, ...duplicate }] });
    assert.equal((await env.execute('create_app')).status, 'invalid_arguments');
    assert.deepEqual(env.calls.map((v) => v.method), ['GET', 'GET']);
  });
}
test('create_app: duplicate hostname on the second page is refused', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/organizations') ? ok({ auth_domain: 'team.cloudflareaccess.com' })
    : req.endpoint.endsWith('page=1') ? ok([{ domain: 'elsewhere.example.com' }], { total_pages: 2, total_count: 2 }) : ok([app()], { total_pages: 2, total_count: 2 }) });
  assert.equal((await env.execute('create_app')).status, 'invalid_arguments'); assert.equal(env.calls.length, 3);
});
test('create_app: unresolved Worker destination prevents a speculative create', async (t) => {
  const env = await setup(t, { duplicates: [{ id: ID, destinations: [{ type: 'worker', worker_id: 'unknown' }] }] });
  assert.equal((await env.execute('create_app')).status, 'invalid_arguments'); assert.equal(env.calls.length, 2);
});
test('create_policy: Allow emails and Service Auth id request shapes', async (t) => {
  const env = await setup(t);
  assert.equal((await env.execute('create_policy')).success, true);
  assert.deepEqual(env.calls[1].body, { name: 'CRM staff', decision: 'allow', include: [{ email: { email: 'one@example.com' } }] });
  env.calls.length = 0;
  const result = await env.execute('create_policy', { account_id: ACCOUNT, name: 'CRM agent', decision: 'non_identity', service_token_id: TOKEN_ID });
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['POST', ROOT + '/policies'], ['GET', ROOT + '/policies/' + POLICY]]);
  assert.deepEqual(env.calls[1].body, { name: 'CRM agent', decision: 'non_identity', include: [{ service_token: { token_id: TOKEN_ID } }] });
  assert.deepEqual(result, { success: true, id: POLICY });
});
for (const fields of [{}, { emails: ['one@example.com'], service_token_id: TOKEN_ID }, { decision: 'non_identity', emails: ['one@example.com'] },
  { service_token_id: TOKEN_ID }, { decision: 'non_identity' }, { emails: [] }, { emails: Array(51).fill('one@example.com') }, { emails: [7] },
  { decision: 'non_identity', service_token_id: CLIENT_VALUE }]) {
  test('create_policy: invalid alternative refused ' + Object.keys(fields).join(','), async (t) => {
    const env = await setup(t);
    assert.equal((await env.execute('create_policy', { account_id: ACCOUNT, name: 'CRM', decision: 'allow', ...fields })).status, 'invalid_arguments');
    assert.deepEqual(env.calls, []);
  });
}
for (const fields of [{}, { add: 'three@example.com', remove: 'one@example.com' }]) test('set_staff: requires exactly one change', async (t) => {
  const env = await setup(t); assert.equal((await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, ...fields })).status, 'invalid_arguments');
  assert.deepEqual(env.calls, []);
});
for (const change of [{ add: 'three@example.com' }, { remove: 'one@example.com' }]) test('set_staff: preserves settings, reads before and after, returns actual emails', async (t) => {
  const env = await setup(t, { policy: staff() }); const result = await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, ...change });
  const after = change.add ? ['one@example.com', 'two@example.com', 'three@example.com'] : ['two@example.com'];
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['GET', ROOT + '/policies/' + POLICY], ['PUT', ROOT + '/policies/' + POLICY], ['GET', ROOT + '/policies/' + POLICY]]);
  const { id, reusable, ...body } = staff(after); assert.deepEqual(env.calls[2].body, body);
  assert.deepEqual(result, { success: true, policy_id: POLICY, changed: true, before: ['one@example.com', 'two@example.com'], after });
});
for (const emails of [['one@example.com'], ['one@example.com', 'ONE@example.com']]) test('set_staff: last distinct email can never be removed', async (t) => {
  const env = await setup(t, { policy: staff(emails) });
  const result = await env.execute('set_staff'); assert.equal(result.status, 'invalid_arguments'); assert.match(result.reason, /last staff email/);
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['GET', ROOT + '/policies/' + POLICY]]);
});
test('set_staff: read-back disagreement is a refusal', async (t) => {
  const env = await setup(t, { noChange: true }); assert.equal((await env.execute('set_staff')).status, 'vendor_error'); assert.equal(env.calls.length, 4);
});
for (const change of [{ add: 'ONE@example.com' }, { remove: 'missing@example.com' }]) test('set_staff: unchanged also reads back and returns before/after', async (t) => {
  const env = await setup(t); const result = await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, ...change });
  assert.equal(result.success, true); assert.equal(result.changed, false); assert.deepEqual(result.before, result.after);
  assert.deepEqual(env.calls.map((v) => v.method), ['GET', 'GET', 'GET']);
});
for (const policy of [{ ...staff(), decision: 'non_identity' }, { ...staff(), include: [{ everyone: {} }] }, { ...staff(), future_setting: true },
  { ...staff(), reusable: false }, { ...staff(), include: [{ email: { email: API_TOKEN + '@example.com' } }] }]) {
  test('set_staff: unsupported or unsafe policy refused without PUT', async (t) => {
    const env = await setup(t, { policy }); assert.equal((await env.execute('set_staff')).status, 'invalid_arguments'); assert.equal(env.calls.length, 2);
  });
}

const staffRead = [['GET', ROOT + '/organizations'], ['GET', ROOT + '/policies/' + POLICY]];
test('list_staff: returns only the stored emails in order and case using two GETs without confirmation', async (t) => {
  const emails = ['Zoe@example.com', 'alice@example.com', 'zOE@example.com'];
  const env = await setup(t, { policy: staff(emails) });
  const result = await env.gw.execute({ action: 'cloudflare.access.list_staff', input: inputs.list_staff });
  assert.deepEqual(result, { success: true, policy_id: POLICY, emails });
  assert.deepEqual(trace(env.calls), staffRead);
});

for (const count of [1, 50]) test(`list_staff: accepts ${count} email includes with absent exclude and require`, async (t) => {
  const emails = Array.from({ length: count }, (_, index) => `person${index}@example.com`);
  const { exclude, require, ...policy } = staff(emails);
  const env = await setup(t, { policy });
  assert.deepEqual(await env.execute('list_staff'), { success: true, policy_id: POLICY, emails });
  assert.deepEqual(trace(env.calls), staffRead);
});

test('list_staff: disabled Access refuses after only the organization GET', async (t) => {
  const env = await setup(t, { off: true });
  const answer = await env.execute('list_staff');
  assert.deepEqual(answer, await env.execute('set_staff'));
  assert.equal(answer.status, 'denied');
  assert.equal(answer.access_enabled, false);
  assert.match(answer.reason, /Access is not enabled/);
  assert.deepEqual(trace(env.calls), [staffRead[0], staffRead[0]]);
});

const staffRuleRefusal = 'Staff changes require a reusable Allow policy containing only 1 to 50 explicit email includes.';
const staffPolicyRefusal = 'The policy has unsupported settings or is not reusable; update it in Cloudflare.';
for (const [label, policy, reason] of [
  ['policy is not reusable', { ...staff(), reusable: false }, staffPolicyRefusal],
  ['non-Allow decision', { ...staff(), decision: 'deny' }, staffRuleRefusal],
  ['non-email include', { ...staff(), include: [{ everyone: {} }] }, staffRuleRefusal],
  ['zero includes', staff([]), staffRuleRefusal],
  ['51 includes', staff(Array.from({ length: 51 }, (_, index) => `person${index}@example.com`)), staffRuleRefusal],
  ['nonempty exclude', { ...staff(), exclude: staff().include }, 'exclude must be absent or an empty array.'],
  ['nonempty require', { ...staff(), require: staff().include }, 'require must be absent or an empty array.'],
  ['unfamiliar setting', { ...staff(), future_setting: true }, staffPolicyRefusal],
  ['mismatched policy id', { ...staff(), id: ID }, staffPolicyRefusal],
]) test(`list_staff: refuses ${label} with the set_staff wording`, async (t) => {
  const env = await setup(t, { policy });
  const expected = { status: 'invalid_arguments', field: 'policy_id', reason };
  assert.deepEqual(await env.execute('list_staff'), expected);
  assert.deepEqual(await env.execute('set_staff'), expected);
  assert.deepEqual(trace(env.calls), [...staffRead, ...staffRead]);
});

test('list_staff: propagates a sanitized policy vendor error and stops after two GETs', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/organizations')
    ? ok({ auth_domain: 'team.cloudflareaccess.com' }) : error(502) });
  const answer = await env.execute('list_staff');
  assert.deepEqual(answer, await env.execute('set_staff'));
  assert.equal(answer.status, 'vendor_error');
  assert.equal(answer.http_status, 502);
  assert.equal(answer.endpoint, ROOT + '/policies/' + POLICY);
  assert.deepEqual(trace(env.calls), [...staffRead, ...staffRead]);
});

test('list_staff: publishes only the staff IDs and the service token listing’s execution settings', async (t) => {
  const { list_staff, set_staff, list_service_tokens } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).modules.access.actions;
  for (const key of ['privilege', 'risk', 'confirmation', 'execution']) assert.deepEqual(list_staff[key], list_service_tokens[key]);
  assert.deepEqual(list_staff.input, {
    type: 'object',
    properties: { account_id: set_staff.input.properties.account_id, policy_id: set_staff.input.properties.policy_id },
    required: ['account_id', 'policy_id'],
    additionalProperties: false,
  });
  const env = await setup(t);
  for (const input of [{ account_id: ACCOUNT }, { ...inputs.list_staff, policy_id: ID.toUpperCase() },
    { ...inputs.list_staff, add: 'three@example.com' }, { ...inputs.list_staff, remove: 'one@example.com' }]) {
    assert.equal((await env.execute('list_staff', input)).status, 'invalid_arguments');
  }
  assert.deepEqual(env.calls, []);
});

test('get_app: only hostname, policy ids, policy decisions, public audience and single-header mode are returned', async (t) => {
  const env = await setup(t); const result = await env.execute('get_app');
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
  assert.deepEqual(result, { success: true, id: ID, hostname: 'crm.example.com', policy_ids: [POLICY], policies: [{ id: POLICY, decision: 'allow' }], aud: AUD, single_header: false });
});
const staffPolicyDecision = { id: POLICY, decision: 'allow' };
const agentPolicyDecision = { id: TOKEN_ID, decision: 'non_identity' };
for (const [label, embedded, expected] of [
  ['Allow then Service Auth', [attachable(), agentPolicy()], [staffPolicyDecision, agentPolicyDecision]],
  ['Service Auth then Allow', [agentPolicy(), attachable()], [agentPolicyDecision, staffPolicyDecision]],
  ['id-only entries', [{ id: POLICY }, { id: TOKEN_ID }], [staffPolicyDecision, agentPolicyDecision]],
  ['embedded decisions that contradict the live reads', [{ ...attachable(), id: TOKEN_ID }, { ...agentPolicy(), id: POLICY }], [agentPolicyDecision, staffPolicyDecision]],
  ['a repeated policy id', [{ id: POLICY }, { id: POLICY }], [staffPolicyDecision, staffPolicyDecision]],
]) test(`get_app: returns live decisions in policy id order for ${label}`, async (t) => {
  const env = await setup(t, { app: { ...app(), policies: embedded } });
  const result = await env.execute('get_app');
  const ids = expected.map(({ id }) => id);

  assert.equal(result.success, true);
  assert.deepEqual(result.policy_ids, ids);
  assert.deepEqual(result.policies, expected);
  assert.deepEqual(trace(env.calls), [
    ['GET', ROOT + '/apps/' + ID],
    ...ids.map((id) => ['GET', ROOT + '/policies/' + id]),
  ]);
});
for (const response of [{ ...app(), destinations: [{ type: 'public', uri: 'elsewhere.example.com' }] }, { ...app(), aud: JWT }, { ...app(), policies: [{ id: API_TOKEN }] }]) {
  test('get_app: malformed or ambiguous public fields refused without leaking', async (t) => {
    const env = await setup(t, { app: response }); assert.equal((await env.execute('get_app')).status, 'vendor_error');
  });
}
for (const action of Object.keys(inputs)) test(`${action}: thrown provider diagnostic never crosses the boundary`, async (t) => {
  const env = await setup(t, { responder: () => { const err = new Error(secrets.join(' ')); err.object = { status: 'vendor_error', http_status: 502, reason: CLIENT_VALUE }; throw err; } });
  assert.equal((await env.execute(action)).status, 'vendor_error');
});
test('organization: absent result and missing team domain both prevent writes', async (t) => {
  for (const result of [null, {}, { auth_domain: '' }]) {
    const env = await setup(t, { responder: () => ok(result) });
    const answer = await env.execute('create_policy'); assert.equal(answer.status, 'vendor_error'); assert.equal(env.calls.length, 1);
  }
});
test('all Access schemas: recursive field walk has no secret-named input or raw header-name setting', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const actions = manifest.modules.access.actions;
  assert.deepEqual(Object.keys(actions).sort(), [...Object.keys(inputs), 'list_service_tokens', 'set_single_header'].sort());
  const walk = (schema) => {
    if (!schema || typeof schema !== 'object') return;
    for (const field of Object.keys(schema.properties ?? {})) assert.doesNotMatch(field, /secret|password|credential|client_id/i);
    for (const value of Object.values(schema)) if (Array.isArray(value)) value.forEach(walk); else walk(value);
  };
  for (const [name, action] of Object.entries(actions)) {
    walk(action.input); assert.equal(action.input.additionalProperties, false);
    assert.equal(action.confirmation, ['get_app', 'list_service_tokens', 'list_staff'].includes(name) ? 'none' : 'always');
    assert.equal(Object.hasOwn(action.input.properties, 'read_service_tokens_from_header'), false);
  }
});
test('credential-shaped inputs never reach a stop, answer or transport', async (t) => {
  const env = await setup(t);
  for (const value of secrets) {
    for (const [action, field, data] of [['create_app', 'name', inputs.create_app], ['create_app', 'hostname', inputs.create_app],
      ['create_policy', 'name', inputs.create_policy], ['set_staff', 'add', { account_id: ACCOUNT, policy_id: POLICY }]]) {
      assert.equal((await env.execute(action, { ...data, [field]: value })).status, 'invalid_arguments');
    }
  }
  assert.deepEqual(env.calls, []);
});
for (const action of ['create_app', 'create_policy']) test(`${action}: declared array bounds and name length are enforced before transport`, async (t) => {
  const env = await setup(t);
  const field = action === 'create_app' ? 'policy_ids' : 'emails';
  const item = action === 'create_app' ? POLICY : 'one@example.com';
  for (const values of [[], Array(51).fill(item)]) assert.equal((await env.execute(action, { ...inputs[action], [field]: values })).status, 'invalid_arguments');
  assert.equal((await env.execute(action, { ...inputs[action], name: 'x '.repeat(51) })).status, 'invalid_arguments');
  assert.deepEqual(env.calls, []);
});
test('set_staff: adding a 51st email is refused without a PUT', async (t) => {
  const env = await setup(t, { policy: staff(Array.from({ length: 50 }, (_, i) => `staff${i}@example.com`)) });
  assert.equal((await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, add: 'new@example.com' })).status, 'invalid_arguments');
  assert.deepEqual(env.calls.map((v) => v.method), ['GET', 'GET']);
});
test('create_app: multiple policy ids preserve their supplied precedence', async (t) => {
  const env = await setup(t); await env.execute('create_app', { ...inputs.create_app, policy_ids: [POLICY, TOKEN_ID] });
  assert.deepEqual(env.calls.filter((req) => req.endpoint.startsWith(ROOT + '/policies/')).map((req) => req.endpoint), [ROOT + '/policies/' + POLICY, ROOT + '/policies/' + TOKEN_ID, ROOT + '/policies/' + POLICY, ROOT + '/policies/' + TOKEN_ID]);
  assert.deepEqual(env.calls.find((req) => req.method === 'POST').body.policies, [{ id: POLICY, precedence: 1 }, { id: TOKEN_ID, precedence: 2 }]);
});
test('create_app: incomplete pagination is refused before POST', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/organizations') ? ok({ auth_domain: 'team.cloudflareaccess.com' })
    : ok([], { total_pages: 'unknown' }) });
  assert.equal((await env.execute('create_app')).status, 'vendor_error'); assert.equal(env.calls.length, 2);
});
test('set_staff: a failed read-back omits provider messages after the write', async (t) => {
  const env = await setup(t, { responder: (req, n) => n === 1 ? ok({ auth_domain: 'team.cloudflareaccess.com' })
    : n === 2 ? ok(staff()) : n === 3 ? ok({}) : error(502) });
  assert.equal((await env.execute('set_staff')).status, 'vendor_error'); assert.equal(env.calls.length, 4);
});
test('get_app: a non-string destination is a sanitized refusal', async (t) => {
  const env = await setup(t, { app: { ...app(), destinations: [{ type: 'public', uri: 7 }] } });
  assert.equal((await env.execute('get_app')).status, 'vendor_error');
});
test('get_app: malformed error arrays are sanitized', async (t) => {
  const env = await setup(t, { responder: () => ({ status: 400, data: { success: false, errors: CLIENT_VALUE } }) });
  assert.equal((await env.execute('get_app')).status, 'vendor_error');
});

// fix2: account-owned policies are data, not proof that a hostname is protected.
function attachable() { return { ...staff(), exclude: [] }; }
function agentPolicy() { return { id: TOKEN_ID, decision: 'non_identity', include: [{ service_token: { token_id: TOKEN_ID } }] }; }
const forbiddenPolicies = [
  ['bypass decision', { ...attachable(), decision: 'bypass' }, /decision/],
  ['deny decision', { ...attachable(), decision: 'deny' }, /decision/],
  ['missing decision', { ...attachable(), decision: undefined }, /decision/],
  ...['everyone', 'email_domain', 'any_valid_service_token', 'group', 'future_rule'].map((key) =>
    [key + ' include', { ...attachable(), include: [{ [key]: {} }] }, /include/]),
  ['mixed include keys', { ...attachable(), include: [{ email: { email: 'one@example.com' }, everyone: {} }] }, /include/],
  ['nested extra email key', { ...attachable(), include: [{ email: { email: 'one@example.com', extra: true } }] }, /include/],
  ['empty emails', { ...attachable(), include: [] }, /include/],
  ['51 emails', { ...attachable(), include: Array(51).fill({ email: { email: 'one@example.com' } }) }, /include/],
  ['malformed email', { ...attachable(), include: [{ email: { email: 'invalid' } }] }, /include/],
  ['missing includes', { ...attachable(), include: undefined }, /include/],
  ['non-array includes', { ...attachable(), include: {} }, /include/],
  ['service policy with emails', { ...agentPolicy(), include: attachable().include }, /include/],
  ['two service tokens', { ...agentPolicy(), include: [...agentPolicy().include, ...agentPolicy().include] }, /include/],
  ['any service token', { ...agentPolicy(), include: [{ any_valid_service_token: {} }] }, /include/],
  ['invalid service token id', { ...agentPolicy(), include: [{ service_token: { token_id: 'invalid' } }] }, /include/],
  ['nested extra token key', { ...agentPolicy(), include: [{ service_token: { token_id: TOKEN_ID, extra: true } }] }, /include/],
  ...['exclude', 'require'].flatMap((field) => [
    [field + ' rule', { ...attachable(), [field]: [{ everyone: {} }] }, new RegExp(field)],
    [field + ' malformed', { ...attachable(), [field]: null }, new RegExp(field)],
    ['service ' + field + ' rule', { ...agentPolicy(), [field]: [{ everyone: {} }] }, new RegExp(field)],
  ]),
];
for (const [label, policy, reason] of forbiddenPolicies) {
  test('fix2 create_app: forbidden policy GET makes no POST: ' + label, async (t) => {
    const env = await setup(t, { policy: { ...policy, id: POLICY } });
    const result = await env.execute('create_app');
    assert.equal(result.status, 'vendor_error'); assert.match(result.reason, new RegExp(POLICY)); assert.match(result.reason, reason);
    assert.ok(env.calls.some((req) => req.method === 'GET' && req.endpoint === ROOT + '/policies/' + POLICY));
    assert.ok(!env.calls.some((req) => req.method === 'POST'));
  });
  test('fix2 create_app: unsafe create-response policy is refused: ' + label, async (t) => {
    const env = await setup(t, { policy: attachable(), createdApp: { ...app(), policies: [{ ...policy, id: POLICY }] } });
    const result = await env.execute('create_app');
    assert.equal(result.status, 'vendor_error'); assert.match(result.reason, new RegExp(POLICY)); assert.match(result.reason, reason);
    assert.equal(env.calls.filter((req) => req.method === 'POST').length, 1);
    assertRemoved(result, env.calls);
  });
}
for (const policies of [undefined, [], [{ id: POLICY }], [POLICY]]) {
  test('fix2 create_app: missing create-response policy detail is refused: ' + JSON.stringify(policies), async (t) => {
    const env = await setup(t, { policy: attachable(), createdApp: { ...app(), policies } });
    const result = await env.execute('create_app');
    assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /polic/i);
    assertRemoved(result, env.calls);
  });
}
test('fix2 get_app: matching hostname with public path overrides is refused', async (t) => {
  const env = await setup(t, { app: { ...app(), destinations: [{ type: 'public', uri: 'crm.example.com',
    overrides: [{ behavior: 'public', path_pattern: '/health' }] }] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /override|bypass/i);
});
for (const decision of ['bypass', 'deny', 'unknown', null]) test('fix2 get_app: embedded policy decision is refused: ' + decision, async (t) => {
  const env = await setup(t, { app: { ...app(), policies: [{ ...attachable(), decision }] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /decision/i);
});
const HYPHENATED_EMAIL = 'it-infrastructure-operations-oncall-team@company.com';
for (const local of [HYPHENATED_EMAIL.split('@')[0].slice(0, -1), HYPHENATED_EMAIL.split('@')[0] + 's']) {
test('credential filter: hyphenated email local part of length ' + local.length + ' passes create_policy', async (t) => {
  const email = local + '@company.com';
  const env = await setup(t);
  assert.equal((await env.execute('create_policy', { ...inputs.create_policy, emails: [email] })).success, true);
  assert.deepEqual(env.calls[1].body.include, [{ email: { email } }]);
});
test('credential filter: hyphenated email local part of length ' + local.length + ' passes set_staff.add', async (t) => {
  const email = local + '@company.com';
  const env = await setup(t);
  const result = await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, add: email });
  assert.equal(result.success, true); assert.ok(result.after.includes(email));
  assert.ok(env.calls.find((req) => req.method === 'PUT').body.include.some((rule) => rule.email.email === email));
});
test('credential filter: hyphenated hostname label of length ' + local.length + ' passes create_app', async (t) => {
  const hostname = local + '.example.com';
  const env = await setup(t, { policy: attachable(), createdApp: { ...app(), policies: [attachable()] } });
  assert.equal((await env.execute('create_app', { ...inputs.create_app, hostname })).success, true);
  assert.equal(env.calls.find((req) => req.method === 'POST').body.domain, hostname);
});
}
test('fix2 credential filter: bare 40-character run and JWT remain refused before transport', async (t) => {
  const env = await setup(t);
  for (const token of [API_TOKEN, JWT]) {
    assert.equal((await env.execute('create_policy', { ...inputs.create_policy, name: token })).status, 'invalid_arguments');
    assert.equal((await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, add: token + '@example.com' })).status, 'invalid_arguments');
  }
  assert.deepEqual(env.calls, []);
});

function assertRemoved(result, calls) {
  assert.equal(result.success, undefined);
  assert.equal(result.app_id, ID);
  assert.equal(result.removed, true);
  assert.match(result.reason, /app.*removed/i);
  assert.deepEqual(calls.filter((req) => req.method === 'DELETE').map((req) => req.endpoint), [ROOT + '/apps/' + ID]);
  assert.deepEqual(trace(calls).slice(-2), [['DELETE', ROOT + '/apps/' + ID], ['GET', ROOT + '/apps/' + ID]]);
}

for (const key of ['everyone', 'email_domain', 'any_valid_service_token']) test('fix3 get_app: embedded allow refuses ' + key, async (t) => {
  const include = [{ [key]: key === 'email_domain' ? { domain: 'example.com' } : {} }];
  const env = await setup(t, { app: { ...app(), policies: [{ ...attachable(), include }] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.match(result.reason, /include/);
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID]]);
});
for (const embedded of [{ id: POLICY }, { ...attachable(), decision: undefined }, { ...attachable(), include: undefined }]) {
  test('fix3 get_app: incomplete embedded policy resolves to a refused bypass: ' + Object.keys(embedded).join(','), async (t) => {
    const env = await setup(t, { app: { ...app(), policies: [embedded] }, policy: { ...attachable(), decision: 'bypass' } });
    const result = await env.execute('get_app');
    assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.match(result.reason, /decision/);
    assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
  });
}
test('fix3 get_app: a safe linked policy is read before success', async (t) => {
  const env = await setup(t, { app: { ...app(), policies: [{ id: POLICY }] } });
  assert.equal((await env.execute('get_app')).success, true);
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
});
test('fix3 get_app: failed policy GET names the policy without provider text', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/apps/' + ID) ? ok({ ...app(), policies: [{ id: POLICY }] }) : error(502) });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.match(result.reason, /read|check/i);
});
test('fix3 get_app: an application with no policies is refused', async (t) => {
  const env = await setup(t, { app: { ...app(), policies: [] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /polic/i);
});

test('fix3 create_app: safe preflight then bypass on post-POST GET removes the created app', async (t) => {
  const env = await setup(t, { postPolicy: { ...attachable(), decision: 'bypass' } });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.match(result.reason, /decision/);
  assertRemoved(result, env.calls);
  assert.deepEqual(trace(env.calls).slice(2, 6), [['GET', ROOT + '/policies/' + POLICY], ['POST', ROOT + '/apps'], ['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
});
test('fix3 create_app: a different response policy id set removes the created app', async (t) => {
  const env = await setup(t, { createdApp: { ...app(), policies: [agentPolicy()] } });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /policy id set/i);
  assertRemoved(result, env.calls);
});
test('fix3 create_app: a failed post-POST policy GET removes the created app', async (t) => {
  const env = await setup(t, { postPolicyError: true });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.match(result.reason, /read|check/i);
  assertRemoved(result, env.calls);
});
for (const option of ['deleteFails', 'stillPresent']) test('fix3 create_app: unconfirmed removal reports created id: ' + option, async (t) => {
  const env = await setup(t, { postPolicy: { ...attachable(), decision: 'bypass' }, [option]: true });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.success, undefined);
  assert.equal(result.app_id, ID); assert.equal(result.removed, false);
  assert.match(result.reason, new RegExp(ID)); assert.match(result.reason, /remov.*could not be confirmed/i);
  assert.equal(env.calls.filter((req) => req.method === 'DELETE').length, 1);
  assert.deepEqual(trace(env.calls).slice(-2), [['DELETE', ROOT + '/apps/' + ID], ['GET', ROOT + '/apps/' + ID]]);
});

const WHOLE_TOKEN = 'YQSn-xWAQiiEh9qM58wZNnyQS7FUdoqGIUAbrh7T';
const wholeTokenCases = [
  ['app name', 'create_app', { ...inputs.create_app, name: WHOLE_TOKEN }],
  ['policy name', 'create_policy', { ...inputs.create_policy, name: WHOLE_TOKEN }],
  ...[WHOLE_TOKEN, HYPHENATED_EMAIL.split('@')[0]].flatMap((local, i) => [
    ['policy email ' + i, 'create_policy', { ...inputs.create_policy, emails: [local + '@example.com'] }],
    ...['add', 'remove'].map((field) => ['staff ' + field + ' ' + i, 'set_staff', { account_id: ACCOUNT, policy_id: POLICY, [field]: local + '@example.com' }]),
    ['hostname first label ' + i, 'create_app', { ...inputs.create_app, hostname: local + '.example.com' }],
    ['hostname inner label ' + i, 'create_app', { ...inputs.create_app, hostname: 'crm.' + local + '.com' }],
  ]),
  ['exact staff address', 'create_policy', { ...inputs.create_policy, emails: [HYPHENATED_EMAIL] }],
];
for (const [label, action, input] of wholeTokenCases) {
  test('fix3 whole-field token: gateway refuses before confirmation and transport: ' + label, async (t) => {
    const env = await setup(t);
    const result = await env.gw.execute({ action: 'cloudflare.access.' + action, input });
    assert.equal(result.status, 'invalid_arguments');
    assert.deepEqual(env.calls, []);
  });
  test('fix3 whole-field token: module refuses before transport: ' + label, async () => {
    const calls = [];
    const result = await modules.access[action](input, { proxy: async (req) => { calls.push(req); return ok({ auth_domain: 'team.cloudflareaccess.com' }); } });
    assert.equal(result.status, 'invalid_arguments');
    assert.deepEqual(calls, []);
  });
}


// fix4: exercise stored state, counted lists, cleanup and live policy reads.
const storedAppCases = [
  ['missing destinations', { destinations: undefined }],
  ['two self-hosted domains', { self_hosted_domains: ['crm.example.com', 'other.example.com'] }],
  ['empty self-hosted domains', { self_hosted_domains: [] }],
  ['path override', { destinations: [{ type: 'public', uri: 'crm.example.com', overrides: [{ path: '/' }] }] }],
  ['second destination', { destinations: [{ type: 'public', uri: 'crm.example.com' }, { type: 'public', uri: 'other.example.com' }] }],
  ['another self-hosted domain', { self_hosted_domains: ['crm.example.com', 'other.example.com'] }],
  ['header enabled', { read_service_tokens_from_header: true }],
  ['wrong type', { type: 'saas' }],
  ['wrong domain', { domain: 'other.example.com', destinations: [{ type: 'public', uri: 'other.example.com' }] }],
  ['wrong audience', { aud: 'invalid' }],
  ['wrong application id', { id: TOKEN_ID }],
  ['stored policy ids changed', { policies: [agentPolicy()] }],
];
for (const [label, fields] of storedAppCases) {
  test('fix4 create_app: stored application failure is removed: ' + label, async (t) => {
    const env = await setup(t, { app: { ...app(), ...fields } });
    const result = await env.execute('create_app');
    assert.equal(result.status, 'vendor_error'); assertRemoved(result, env.calls);
    assert.equal(env.calls.filter((req) => req.method === 'GET' && req.endpoint === ROOT + '/apps/' + ID).length, 2);
  });
}
for (const [label, fields] of storedAppCases.filter(([label]) => ['path override', 'second destination', 'another self-hosted domain', 'header enabled'].includes(label))) {
  test('fix4 create_app: unsafe create answer is removed: ' + label, async (t) => {
    const env = await setup(t, { createdApp: { ...app(), ...fields }, app: { ...app(), ...fields } });
    const result = await env.execute('create_app');
    assert.equal(result.status, 'vendor_error'); assertRemoved(result, env.calls);
  });
}
test('fix4 module: create omits the single-header setting', async () => {
  const calls = [];
  await modules.access.create_app(inputs.create_app, { proxy: async (req) => {
    calls.push(req);
    if (req.endpoint.endsWith('/organizations')) return ok({ auth_domain: 'team.cloudflareaccess.com' });
    if (req.endpoint.includes('/apps?')) return ok([], { total_count: 0 });
    if (req.endpoint.includes('/policies/')) return ok(attachable());
    return ok(app());
  } });
  assert.equal(Object.hasOwn(calls.find((req) => req.method === 'POST').body, 'read_service_tokens_from_header'), false);
});
for (const id of [undefined, 'unusable']) test('fix4 create_app: missing id reconciles by hostname: ' + id, async (t) => {
  const env = await setup(t, { createdApp: { ...app(), id }, recoveryApps: [app()] });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assertRemoved(result, env.calls);
  assert.equal(env.calls.filter((req) => req.endpoint.includes('/apps?')).length, 2);
});
test('fix4 create_app: missing id names hostname when removal cannot be confirmed', async (t) => {
  const env = await setup(t, { createdApp: { ...app(), id: undefined } });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.removed, false);
  assert.equal(result.hostname, inputs.create_app.hostname); assert.match(result.reason, /crm\.example\.com.*removal could not be confirmed/i);
  assert.equal(env.calls.filter((req) => req.endpoint.includes('/apps?')).length, 2);
});
for (const info of [undefined, { total_pages: 1 }, { total_pages: 1, total_count: 250, per_page: 100 }, { total_pages: 1, total_count: '1' }, { total_pages: 1, total_count: 0 }]) {
  test('fix4 create_app: uncounted or contradictory list refuses POST: ' + JSON.stringify(info), async (t) => {
    const env = await setup(t, { responder: (req) => {
      if (req.endpoint.endsWith('/organizations')) return ok({ auth_domain: 'team.cloudflareaccess.com' });
      if (req.endpoint.includes('/apps?')) return ok([{ domain: 'other.example.com' }], info);
      if (req.endpoint.includes('/policies/')) return ok(attachable());
      return ok(app());
    } });
    assert.equal((await env.execute('create_app')).status, 'vendor_error');
    assert.ok(!env.calls.some((req) => req.method === 'POST'));
  });
}
for (const uri of ['https://crm.example.com/path', 'crm.example.com:443', 'https://CRM.EXAMPLE.COM:443/path']) {
  test('fix4 create_app: normalized duplicate URI refuses POST: ' + uri, async (t) => {
    const env = await setup(t, { duplicates: [{ destinations: [{ type: 'public', uri }] }] });
    assert.equal((await env.execute('create_app')).status, 'invalid_arguments');
    assert.ok(!env.calls.some((req) => req.method === 'POST'));
  });
}
const unsafeCreatedPolicies = [
  ['everyone', { include: [{ everyone: {} }] }],
  ['bypass', { decision: 'bypass' }],
  ['any token', { include: [{ any_valid_service_token: {} }] }],
  ['wrong emails', { include: [{ email: { email: 'other@example.com' } }] }],
  ['not reusable', { reusable: false }],
  ['reusable absent', { reusable: undefined }],
  ['exclude', { exclude: [{ everyone: {} }] }],
  ['require', { require: [{ everyone: {} }] }],
];
for (const [label, fields] of unsafeCreatedPolicies) test('fix4 create_policy: unsafe stored policy is removed: ' + label, async (t) => {
  const env = await setup(t, { createdPolicy: { ...attachable(), include: [{ email: { email: 'one@example.com' } }], ...fields } });
  const result = await env.execute('create_policy');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY); assert.equal(result.removed, true);
  assert.match(result.reason, new RegExp(POLICY)); assert.match(result.reason, /was removed/i);
  assert.deepEqual(trace(env.calls).slice(-3), [['GET', ROOT + '/policies/' + POLICY], ['DELETE', ROOT + '/policies/' + POLICY], ['GET', ROOT + '/policies/' + POLICY]]);
});
for (const fields of [{ decision: 'bypass' }, { include: [{ everyone: {} }] }]) test('fix4 get_app: safe embed cannot hide live policy: ' + JSON.stringify(fields), async (t) => {
  const env = await setup(t, { policy: { ...attachable(), ...fields } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.equal(result.policy_id, POLICY);
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID], ['GET', ROOT + '/policies/' + POLICY]]);
});
for (const fields of [{ exclude: [{ email: { email: 'excluded@example.com' } }] }, { require: [{ everyone: {} }] }, { reusable: undefined }]) {
  test('fix4 set_staff: unsupported pre-write policy refuses PUT: ' + JSON.stringify(fields), async (t) => {
    const env = await setup(t, { policy: { ...staff(), ...fields } });
    assert.equal((await env.execute('set_staff')).status, 'invalid_arguments');
    assert.deepEqual(env.calls.map((req) => req.method), ['GET', 'GET']);
  });
}
for (const fields of [{ future_grant: true }, { exclude: [{ everyone: {} }] }, { require: [{ everyone: {} }] }, { reusable: false }, { reusable: undefined }]) {
  for (const unchanged of [false, true]) test('fix4 set_staff: read-back settings mismatch refuses success: ' + JSON.stringify(fields) + ' unchanged=' + unchanged, async (t) => {
    const env = await setup(t, { responder: (req, n) => {
      if (n === 1) return ok({ auth_domain: 'team.cloudflareaccess.com' });
      if (n === 2) return ok(staff());
      if (req.method === 'PUT') return ok({});
      return ok({ ...staff(unchanged ? ['one@example.com', 'two@example.com'] : ['two@example.com']), ...fields });
    } });
    const input = unchanged ? { account_id: ACCOUNT, policy_id: POLICY, add: 'ONE@example.com' } : inputs.set_staff;
    assert.equal((await env.execute('set_staff', input)).status, 'vendor_error');
  });
}
test('fix4 docs: edge scope, workers.dev closure, counted reads and live policies are explicit', () => {
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../auth.md', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  for (const text of [guide, auth, manifest.modules.access.actions.create_app.description]) {
    for (const term of ['workers.dev', 'workers.set_workers_dev', 'proxied', 'valid Access token']) assert.ok(text.includes(term), term);
  }
  assert.match(guide, /total_count/); assert.match(guide, /any identity provider the team has/);
  assert.match(guide.replace(/\s+/g, ' '), /single_header: true.*read_service_tokens_from_header: "Authorization".*single_header: false.*leaves `read_service_tokens_from_header` out/);
  assert.match(manifest.modules.access.actions.create_policy.description, /read.back/i);
  assert.match(manifest.modules.access.actions.get_app.description, /every attached policy/i);
  assert.match(manifest.modules.access.actions.set_staff.description, /before.*after/i);
});

// Round two of the fresh review, folded back by the briefing session (2026-10-26).
test('fix5 create_app: a count met before the last page is incomplete', async (t) => {
  const others = Array.from({ length: 2 }, (_, i) => ({ ...app(), id: `0000000${i}-89ab-cdef-0123-456789abcdef`, domain: `other${i}.example.com`,
    self_hosted_domains: [`other${i}.example.com`], destinations: [{ type: 'public', uri: `other${i}.example.com` }] }));
  const env = await setup(t, { duplicates: others, listInfo: { total_pages: 2, total_count: 2 } });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error');
  assert.equal(env.calls.some((req) => req.method === 'POST'), false);
});
test('fix5 create_app: a repeated application id is incomplete', async (t) => {
  const other = { ...app(), domain: 'other.example.com', self_hosted_domains: ['other.example.com'], destinations: [{ type: 'public', uri: 'other.example.com' }] };
  const env = await setup(t, { duplicates: [other, other], listInfo: { total_pages: 1, total_count: 2 } });
  const result = await env.execute('create_app');
  assert.equal(result.status, 'vendor_error');
  assert.equal(env.calls.some((req) => req.method === 'POST'), false);
});
test('fix5 get_app: a stored application without the deprecated self_hosted_domains is read', async (t) => {
  const stored = app(); delete stored.self_hosted_domains;
  const env = await setup(t, { policy: attachable(), app: stored });
  const result = await env.execute('get_app');
  assert.equal(result.success, true);
  assert.equal(result.hostname, 'crm.example.com');
});
test('fix5 set_staff: a policy carrying account_id and uid metadata is changed', async (t) => {
  const env = await setup(t, { policy: { ...staff(), account_id: ACCOUNT, uid: POLICY } });
  const result = await env.execute('set_staff');
  assert.equal(result.success, true);
});
test('fix5 create_policy: an answer with no usable id reports the name and that nothing was removed', async (t) => {
  const env = await setup(t, { createdPolicy: { name: 'CRM staff', decision: 'bypass', include: [{ everyone: {} }], reusable: true } });
  const result = await env.execute('create_policy');
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.removed, false);
  assert.equal(result.policy_name, 'CRM staff');
});
test('fix5 docs: the upgrade sequence turns workers.dev off after each deploy, and the manifest says the header setting is omitted by default', () => {
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const step = guide.split('\n').findIndex((line) => line.startsWith('4. `workers.deploy_worker_release`'));
  assert.ok(step >= 0);
  assert.match(guide.split('\n').slice(step, step + 6).join(' '), /workers\.set_workers_dev.*enabled: false/);
  assert.doesNotMatch(manifest.modules.access.actions.create_app.description, /explicitly sends false/);
  assert.match(manifest.modules.access.actions.create_app.description, /omit/i);
});

const TOKEN_LIST_INPUT = { account_id: ACCOUNT };
const TOKEN_LIST = ROOT + '/service_tokens';
const EXPIRY = '2027-11-22T00:00:00Z';
const tokenRow = { id: TOKEN_ID, name: 'Fixture automation', client_id: '0123456789abcdef0123456789abcdef.access',
  expires_at: EXPIRY, created_at: '2026-11-22T00:00:00Z', updated_at: '2026-11-22T00:00:00Z' };

test('list_service_tokens is read-only and returns only id, name and any expiry across counted pages', async (t) => {
  const env = await setup(t, { responder: (req, call) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.endpoint, TOKEN_LIST + '?per_page=25&page=' + call);
    return ok(call === 1 ? [tokenRow] : [{ id: ID, name: 'Fixture integration', client_id: 'other-fixture-id.access' }],
      { total_count: 2, total_pages: 2 });
  } });
  const result = await env.execute('list_service_tokens', TOKEN_LIST_INPUT);
  assert.deepEqual(result, { success: true, result: [
    { id: TOKEN_ID, name: 'Fixture automation', expires_at: EXPIRY },
    { id: ID, name: 'Fixture integration' },
  ] });
  assert.equal(env.calls.length, 2);
  assert.equal(JSON.stringify(result).includes(tokenRow.client_id), false);
});

test('list_service_tokens accepts an explicitly counted empty listing', async (t) => {
  for (const total_pages of [0, 1, undefined]) {
    const env = await setup(t, { responder: () => ok([], { total_count: 0, total_pages }) });
    assert.deepEqual(await env.execute('list_service_tokens', TOKEN_LIST_INPUT), { success: true, result: [] });
    assert.equal(env.calls.length, 1);
  }
});

test('list_service_tokens continues by count when total_pages is absent', async (t) => {
  const env = await setup(t, { responder: (req, call) =>
    ok(call === 1 ? [tokenRow] : [{ id: ID, name: 'Other fixture' }], { total_count: 2 }) });
  const result = await env.execute('list_service_tokens', TOKEN_LIST_INPUT);
  assert.deepEqual(result.result?.map(({ id }) => id), [TOKEN_ID, ID]);
  assert.equal(env.calls.length, 2);
});

test('list_service_tokens refuses undeclared input fields before Cloudflare', async (t) => {
  const env = await setup(t);
  const result = await env.execute('list_service_tokens', { ...TOKEN_LIST_INPUT, client_secret: 'invented-secret-value' });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(env.calls.length, 0);
});

for (const [label, badRow] of [
  ['client_secret field even with a null value', { ...tokenRow, id: ID, client_secret: null }],
  ['JWT-shaped name', { ...tokenRow, id: ID, name: JWT }],
  ['token-shaped text in an omitted field', { ...tokenRow, id: ID, metadata: { note: API_TOKEN } }],
  ['whole 40-character token shape with hyphens', { ...tokenRow, id: ID, name: '-'.repeat(40) }],
  ['missing id', { name: tokenRow.name }],
  ['missing name', { id: ID }],
]) {
  test(`list_service_tokens refuses the whole listing with a ${label}`, async (t) => {
    const env = await setup(t, { responder: (req, call) =>
      ok(call === 1 ? [tokenRow] : [badRow], { total_count: 2, total_pages: 2 }) });
    const result = await env.execute('list_service_tokens', TOKEN_LIST_INPUT);
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.result, undefined);
    assert.equal(env.calls.length, 2);
  });
}

for (const [label, pages] of [
  ['missing total count', [ok([tokenRow], { total_pages: 1 })]],
  ['a short last page', [ok([tokenRow], { total_count: 2, total_pages: 1 })]],
  ['a count that changes during pagination', [
    ok([tokenRow], { total_count: 2, total_pages: 2 }), ok([], { total_count: 1, total_pages: 2 }),
  ]],
  ['duplicate ids across pages', [
    ok([tokenRow], { total_count: 2, total_pages: 2 }), ok([tokenRow], { total_count: 2, total_pages: 2 }),
  ]],
  ['a page count that changes during pagination', [
    ok([tokenRow], { total_count: 2, total_pages: 3 }), ok([{ id: ID, name: 'Other fixture' }], { total_count: 2, total_pages: 2 }),
  ]],
]) {
  test(`list_service_tokens refuses ${label}`, async (t) => {
    const env = await setup(t, { responder: (req, call) => pages[call - 1] });
    const result = await env.execute('list_service_tokens', TOKEN_LIST_INPUT);
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.result, undefined);
    assert.equal(env.calls.length, pages.length);
  });
}

test('M7 create_app: optional boolean controls the POST body', async (t) => {
  for (const setting of [true, false, undefined]) {
    const env = await setup(t);
    const input = setting === undefined ? inputs.create_app : { ...inputs.create_app, single_header: setting };
    const result = await env.execute('create_app', input);
    assert.equal(result.success, true, 'create accepts ' + setting);
    const { body } = env.calls.find(({ method }) => method === 'POST');
    if (setting) assert.equal(body.read_service_tokens_from_header, 'Authorization');
    else assert.equal(Object.hasOwn(body, 'read_service_tokens_from_header'), false);
  }
});

test('M7 create_app: non-boolean single_header is refused before transport', async (t) => {
  const env = await setup(t);
  const calls = [];
  for (const setting of ['true', 1, null, {}]) {
    const input = { ...inputs.create_app, single_header: setting };
    assert.equal((await env.execute('create_app', input)).status, 'invalid_arguments');
    const result = await modules.access.create_app(input, { proxy: async (req) => { calls.push(req); return error(403); } });
    clean(result);
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'single_header');
  }
  assert.deepEqual(env.calls, []);
  assert.deepEqual(calls, []);
});

test('M7 Access checker: only Authorization is accepted as a named single header', async (t) => {
  for (const [header, supported] of [['Authorization', true], ['authorization', true], [true, false], ['X-Token', false], [0, false], [{}, false]]) {
    const env = await setup(t, { app: { ...app(), read_service_tokens_from_header: header } });
    const result = await env.execute('get_app');
    assert.equal(result.success === true, supported, 'stored header ' + JSON.stringify(header));
    if (!supported) assert.equal(result.status, 'vendor_error');
  }
});

for (const asked of [true, false]) test(`M7 create_app: stored single-header mismatch removes the app (requested ${asked})`, async (t) => {
  const env = await setup(t, { app: { ...app(), read_service_tokens_from_header: asked ? false : 'Authorization' } });
  const result = await env.execute('create_app', { ...inputs.create_app, single_header: asked });
  assert.equal(result.status, 'vendor_error');
  assertRemoved(result, env.calls);
  assert.match(result.reason, /single-header.*did not match/i);
});

test('M7 get_app: reports the stored single_header boolean for on and off settings', async (t) => {
  for (const [header, enabled] of [[undefined, false], [null, false], [false, false], ['', false], ['Authorization', true], ['authorization', true]]) {
    const env = await setup(t, { app: { ...app(), read_service_tokens_from_header: header } });
    const result = await env.execute('get_app');
    assert.equal(result.success, true);
    assert.equal(result.single_header, enabled);
  }
});

const refusedRequests = [
  ['create_app', 'POST', ROOT + '/apps'],
  ['create_policy', 'POST', ROOT + '/policies'],
  ['set_staff', 'PUT', ROOT + '/policies/' + POLICY],
  ['list_staff', 'GET', ROOT + '/policies/' + POLICY],
  ['get_app', 'GET', ROOT + '/apps/' + ID],
  ['list_service_tokens', 'GET', TOKEN_LIST + '?per_page=25&page=1'],
];
for (const [action, method, endpoint] of refusedRequests) test(`M7 ${action}: 403 exposes provider codes only`, async (t) => {
  const env = await setup(t, { responder: (req) => {
    if (req.method === method && req.endpoint === endpoint) return error(403);
    if (req.endpoint.endsWith('/organizations')) return ok({ auth_domain: 'team.cloudflareaccess.com' });
    if (req.endpoint.includes('/apps?')) return ok([], { total_count: 0 });
    if (req.endpoint === ROOT + '/policies/' + POLICY) return ok(staff());
    assert.fail('unexpected fake request');
  } });
  const result = await env.execute(action, action === 'list_service_tokens' ? TOKEN_LIST_INPUT : inputs[action]);
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 403);
  assert.deepEqual(result.provider_codes, [10000]);
});

test('M7 Access diagnostics: codes are safe integers, unique and capped at ten', async (t) => {
  const codes = [10000, 10000, '10001', 1.5, null, {}, 2 ** 53, ...Array.from({ length: 12 }, (_, i) => 10001 + i)];
  const env = await setup(t, { responder: () => error(403, codes) });
  const result = await env.execute('get_app');
  assert.deepEqual(result.provider_codes, Array.from({ length: 10 }, (_, i) => 10000 + i));
});

test('M7 create_policy: refused read-back preserves codes through cleanup', async (t) => {
  const env = await setup(t, { responder: (req, count) => {
    if (count === 1) return ok({ auth_domain: 'team.cloudflareaccess.com' });
    if (req.method === 'POST' || req.method === 'DELETE') return ok({ id: POLICY });
    return error(count === 3 ? 403 : 404, count === 3 ? [10000] : [9999]);
  } });
  const result = await env.execute('create_policy');
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.removed, true);
  assert.deepEqual(result.provider_codes, [10000]);
});

test('M7 guide: a lost migration answer is read twice, never re-migrated, and cleans up only temporary databases', () => {
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const sequence = guide.split('### Upgrade and failure recovery sequence')[1].split(/\n#{2,3} /)[0].replace(/\s+/g, ' ').replaceAll('`', '');
  const rules = [
    /workers\.d1_adopt or workers\.d1_migrate returns a timeout, uncertain or no answer, do not call it again at once: the call may still be running/,
    /With pages\.d1_query, read the target database's sqlite_master for a table named d1_migrations, and when there is one, the names it holds/,
    /Read every page of pages\.d1_list_databases too/,
    /Read both again a minute later, and act only when the two reads agree\. If a read fails, stop and retry nothing/,
    /After workers\.d1_adopt: with no d1_migrations table, nothing was recorded, and workers\.d1_adopt may be called once more/,
    /It records the baseline's name only when the schema matches, and runs no baseline SQL on the target database/,
    /With the table holding the baseline's name, the adoption landed, so do not adopt again/,
    /With the table present and the name absent, neither action will repair the database: on an upgrade, recover from the bookmark as step 6 says; on a first install, migrate a new empty database instead/,
    /After workers\.d1_migrate: every release file named in d1_migrations means the migration landed/,
    /A file not named may have run in part, so do not call workers\.d1_migrate again\. Treat it as a failed migration: on an upgrade, recover from the bookmark as step 6 says; on a first install, migrate a new empty database instead/,
    /A listed database whose name starts with wiser-adopt-, and whose ID is not the target database's, is a temporary database adoption did not remove/,
    /Delete it with pages\.d1_delete_database by the ID the list gives, then list again to confirm it is gone/,
    /Never delete any other database this way: pages\.d1_delete_database deletes whatever ID it is given/,
  ];
  for (const rule of rules) assert.match(sequence, rule);
  assert.doesNotMatch(sequence, /Retry only what d1_migrations does not record/);
  assert.doesNotMatch(sequence, /With the name absent, workers\.d1_adopt may be called once more/);
});

test('M7 docs: the release, Access fields and provider diagnostics are published', () => {
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const { create_app, get_app } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).modules.access.actions;
  assert.match(guide, /^version: 0\.13\.0$/m);
  assert.match(guide, /^At 0\.13\.0, /m);
  const access = guide.split('### Access applications and staff')[1].split(/\n#{2,3} /)[0];
  for (const term of ['single_header', 'Authorization', 'provider_codes', 'case-insensitive']) assert.ok(access.includes(term), term);
  for (const { description } of [create_app, get_app]) {
    for (const term of ['single_header', 'Authorization', 'provider_codes']) assert.ok(description.includes(term), term);
  }
  assert.deepEqual(create_app.input.properties.single_header, { type: 'boolean', default: false });
  assert.ok(!create_app.input.required.includes('single_header'));
});

const APP_PATH = ROOT + '/apps/' + ID;
const HEADER = 'read_service_tokens_from_header';
const singleHeaderInput = { ...inputs.get_app, single_header: true };
const appSettings = {
  type: 'self_hosted', domain: 'crm.example.com', name: 'CRM',
  destinations: [{ type: 'public', uri: 'crm.example.com' }],
  self_hosted_domains: ['crm.example.com'], allow_iframe: false,
  cors_headers: { allow_origins: ['https://crm.example.com'], allow_credentials: true },
  allowed_idps: [], custom_deny_message: '', tags: ['crm'],
};
const singleHeaderApp = () => ({
  ...appSettings, id: ID, uid: ID, aud: AUD, created_at: 'before', updated_at: 'before',
  policies: [{ ...agentPolicy(), precedence: 3 }, { ...attachable(), precedence: 2 }],
});
const policyLinks = [{ id: POLICY, precedence: 2 }, { id: TOKEN_ID, precedence: 3 }];
const singleHeaderResult = (single_header, changed) => ({
  success: true, app_id: ID, hostname: 'crm.example.com', single_header, changed,
});

async function setupSingleHeader(t, { before = singleHeaderApp(), reads = [], writes = [], policy = ok(staff()) } = {}) {
  const remainingReads = [ok(before), ...reads];
  const remainingWrites = [...writes];
  const env = await setup(t, { responder: (req) => {
    if (req.endpoint === ROOT + '/organizations' && req.method === 'GET') return ok({ auth_domain: 'team.cloudflareaccess.com' });
    if (req.endpoint === ROOT + '/policies/' + POLICY && req.method === 'GET') return policy;
    if (req.endpoint === ROOT + '/policies/' + TOKEN_ID && req.method === 'GET') return ok(agentPolicy());
    if (req.endpoint === APP_PATH && req.method === 'GET' && remainingReads.length) return remainingReads.shift();
    if (req.endpoint === APP_PATH && req.method === 'PUT' && remainingWrites.length) {
      const reply = remainingWrites.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    }
    assert.fail('unexpected fake request');
  } });
  return {
    ...env,
    set: (input = singleHeaderInput) => env.execute('set_single_header', input),
    puts: () => env.calls.filter(({ method }) => method === 'PUT').map(({ body }) => body),
  };
}

test('set_single_header: turns on and preserves the whole application', async (t) => {
  const before = { ...singleHeaderApp(), scim_config: null };
  const after = {
    ...before, [HEADER]: 'Authorization', updated_at: 'after',
    cors_headers: { allow_credentials: true, allow_origins: before.cors_headers.allow_origins },
    policies: [{ ...attachable(), precedence: 2, updated_at: 'after' }, { id: TOKEN_ID, precedence: 3 }],
  };
  const env = await setupSingleHeader(t, { before, reads: [ok(after)], writes: [ok(null)] });
  assert.deepEqual(await env.set(), singleHeaderResult(true, true));
  assert.deepEqual(env.puts(), [{ ...appSettings, policies: policyLinks, [HEADER]: 'Authorization' }]);
  assert.deepEqual(trace(env.calls), [
    ['GET', ROOT + '/organizations'], ['GET', APP_PATH],
    ['GET', ROOT + '/policies/' + TOKEN_ID], ['GET', ROOT + '/policies/' + POLICY],
    ['PUT', APP_PATH], ['GET', APP_PATH],
  ]);
});

test('set_single_header: a null setting read back absent is unchanged', async (t) => {
  const before = { ...singleHeaderApp(), custom_deny_url: null };
  const { custom_deny_url, ...after } = { ...before, [HEADER]: 'Authorization' };
  const env = await setupSingleHeader(t, { before, reads: [ok(after)], writes: [ok(null)] });
  assert.deepEqual(await env.set(), singleHeaderResult(true, true));
  assert.equal(env.puts().length, 1);
  assert.ok(!Object.hasOwn(env.puts()[0], 'custom_deny_url'));
});

test('set_single_header: a missing or shared policy precedence is refused without a PUT', async (t) => {
  for (const policies of [
    [{ ...agentPolicy(), precedence: 3 }, attachable()],
    [{ ...agentPolicy(), precedence: 2 }, { ...attachable(), precedence: 2 }],
    [{ ...agentPolicy(), precedence: '3' }, { ...attachable(), precedence: 2 }],
  ]) {
    const env = await setupSingleHeader(t, { before: { ...singleHeaderApp(), policies } });
    const result = await env.set();
    assert.equal(result.status, 'vendor_error');
    assert.match(result.reason, /precedence/);
    assert.deepEqual(env.puts(), []);
  }
});

test('set_single_header: a read-back with renumbered policies is restored', async (t) => {
  const before = singleHeaderApp();
  const renumbered = { ...before, [HEADER]: 'Authorization',
    policies: [{ ...agentPolicy(), precedence: 4 }, { ...attachable(), precedence: 2 }] };
  const env = await setupSingleHeader(t, { before, reads: [ok(renumbered), ok(before)], writes: [ok(null), ok(null)] });
  const result = await env.set();
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.restored, true);
  assert.deepEqual(result.changed_fields, ['policies', HEADER].sort());
  assert.equal(env.puts().length, 2);
});

test('set_single_header: eager_redirect_cookie_setting is written back as read', async (t) => {
  for (const value of [true, false]) {
    const before = { ...singleHeaderApp(), eager_redirect_cookie_setting: value };
    const after = { ...before, [HEADER]: 'Authorization', updated_at: 'after' };
    const env = await setupSingleHeader(t, { before, reads: [ok(after)], writes: [ok(null)] });
    assert.deepEqual(await env.set(), singleHeaderResult(true, true));
    assert.deepEqual(env.puts(), [{ ...appSettings, eager_redirect_cookie_setting: value, policies: policyLinks, [HEADER]: 'Authorization' }]);
  }
});

test('set_single_header: turns off by omitting the header key', async (t) => {
  const after = singleHeaderApp();
  const env = await setupSingleHeader(t, {
    before: { ...after, [HEADER]: 'Authorization' }, reads: [ok(after)], writes: [ok(null)],
  });
  assert.deepEqual(await env.set({ ...singleHeaderInput, single_header: false }), singleHeaderResult(false, true));
  assert.deepEqual(env.puts(), [{ ...appSettings, policies: policyLinks }]);
});

test('set_single_header: skips PUT when already on or off', async (t) => {
  for (const [single_header, setting] of [[true, 'authorization'], [false, null]]) {
    const env = await setupSingleHeader(t, { before: { ...singleHeaderApp(), [HEADER]: setting } });
    assert.deepEqual(await env.set({ ...singleHeaderInput, single_header }), singleHeaderResult(single_header, false));
    assert.deepEqual(env.puts(), []);
  }
});

test('set_single_header: rejects non-boolean and missing input before transport', async (t) => {
  const env = await setupSingleHeader(t);
  const calls = [];
  for (const input of [inputs.get_app, ...['true', 1, null, {}].map((single_header) => ({ ...singleHeaderInput, single_header }))]) {
    assert.equal((await env.set(input)).status, 'invalid_arguments');
    const result = await modules.access.set_single_header(input, { proxy: async (req) => { calls.push(req); return error(403); } });
    clean(result);
    assert.deepEqual(result, { status: 'invalid_arguments', field: 'single_header' });
  }
  assert.deepEqual(env.calls, []);
  assert.deepEqual(calls, []);
});

for (const [key, value] of [
  ['scim_config', { authentication: { token: CLIENT_VALUE } }],
  ['oauth_configuration', { name: JWT }],
  ['unknown_setting', API_TOKEN],
]) test(`set_single_header: refuses non-null ${key}`, async (t) => {
  const env = await setupSingleHeader(t, { before: { ...singleHeaderApp(), [key]: value } });
  const result = await env.set();
  assert.deepEqual(env.puts(), []);
  assert.equal(result.status, 'vendor_error');
  assert.deepEqual(result.unsupported_fields, [key]);
});

test('set_single_header: reports only safe, sorted, bounded unsupported names', async (t) => {
  const fields = Array.from({ length: 22 }, (_, i) => `extra_${String(i).padStart(2, '0')}`);
  const before = {
    ...singleHeaderApp(), [JWT]: true, [API_TOKEN]: true,
    ...Object.fromEntries([...fields].reverse().map((key) => [key, true])),
  };
  const env = await setupSingleHeader(t, { before });
  const result = await env.set();
  assert.equal(result.status, 'vendor_error');
  assert.deepEqual(result.unsupported_fields, fields.slice(0, 20));
  assert.deepEqual(env.puts(), []);
});

test('set_single_header: refuses unsupported applications and failed live policy checks', async (t) => {
  for (const options of [
    { before: { ...singleHeaderApp(), [HEADER]: 'X-Token' } },
    { before: { ...singleHeaderApp(), destinations: [{ ...appSettings.destinations[0], overrides: [{}] }] } },
    { policy: error(403) },
  ]) {
    const env = await setupSingleHeader(t, options);
    const result = await env.set();
    assert.equal(result.status, 'vendor_error');
    assert.deepEqual(env.puts(), []);
    if (options.policy) {
      assert.deepEqual(result.provider_codes, [10000]);
      assert.equal(result.policy_id, POLICY);
    }
  }
});

test('set_single_header: refused PUT with unchanged read keeps numeric diagnostics', async (t) => {
  const before = singleHeaderApp();
  const env = await setupSingleHeader(t, { before, reads: [ok(before)], writes: [error(403)] });
  assert.deepEqual(await env.set(), {
    status: 'vendor_error', endpoint: APP_PATH, method: 'PUT', http_status: 403,
    provider_codes: [10000], restored: true,
  });
  assert.equal(env.puts().length, 1);
});

test('set_single_header: accepted PUT with unchanged read reports failure without restoring', async (t) => {
  const before = singleHeaderApp();
  const env = await setupSingleHeader(t, { before, reads: [ok(before)], writes: [ok(null)] });
  const result = await env.set();
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.restored, true);
  assert.ok(result.reason);
  assert.equal(env.puts().length, 1);
});

test('set_single_header: thrown PUT with matching read reports success', async (t) => {
  const before = singleHeaderApp();
  const env = await setupSingleHeader(t, {
    before, reads: [ok({ ...before, [HEADER]: 'Authorization' })], writes: [new Error(secrets.join(' '))],
  });
  assert.deepEqual(await env.set(), singleHeaderResult(true, true));
  assert.equal(env.puts().length, 1);
  assert.deepEqual(trace(env.calls).slice(-2), [['PUT', APP_PATH], ['GET', APP_PATH]]);
});

for (const restored of [true, false]) test(`set_single_header: verifies restoration (restored ${restored})`, async (t) => {
  const before = { ...singleHeaderApp(), [HEADER]: 'authorization' };
  const drift = { ...before, allow_iframe: true };
  for (const lastRead of restored ? [ok(before)] : [ok(drift), error(502)]) {
    const env = await setupSingleHeader(t, { before, reads: [ok(drift), lastRead], writes: [ok(null), ok(null)] });
    const result = await env.set({ ...singleHeaderInput, single_header: false });
    const body = { ...appSettings, policies: policyLinks };
    assert.deepEqual(env.puts(), [body, { ...body, [HEADER]: 'authorization' }]);
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.app_id, ID);
    assert.equal(result.restored, restored);
    assert.deepEqual(result.changed_fields, ['allow_iframe']);
    if (!restored) assert.match(result.reason, /access\.get_app/);
  }
});

test('set_single_header: failed read-back attempts one restore and verifies it', async (t) => {
  const before = { ...singleHeaderApp(), [HEADER]: null };
  const env = await setupSingleHeader(t, { before, reads: [error(502), ok(before)], writes: [ok(null), error(403)] });
  const result = await env.set();
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.restored, true);
  assert.deepEqual(result.provider_codes, [10000]);
  assert.deepEqual(result.changed_fields, []);
  assert.deepEqual(env.puts(), [
    { ...appSettings, policies: policyLinks, [HEADER]: 'Authorization' }, { ...appSettings, policies: policyLinks },
  ]);
  assert.deepEqual(trace(env.calls).slice(-4), [['PUT', APP_PATH], ['GET', APP_PATH], ['PUT', APP_PATH], ['GET', APP_PATH]]);
});

test('set_single_header: manifest publishes the confirmed proxy write and closed input', () => {
  const { get_app, set_single_header: action } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).modules.access.actions;
  assert.ok(action);
  assert.equal(action.risk, 'high');
  assert.equal(action.confirmation, 'always');
  assert.deepEqual(action.execution, { prefer: 'proxy' });
  assert.deepEqual(action.input, {
    ...get_app.input, properties: { ...get_app.input.properties, single_header: { type: 'boolean' } },
    required: [...get_app.input.required, 'single_header'],
  });
  for (const claim of [/get_app/, /refuses/, /whole application/, /reads.*back/i, /no write/i, /vendor_error.*provider_codes/]) {
    assert.match(action.description, claim);
  }
});

test('set_single_header: connector guide and auth document the write and recovery', () => {
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../auth.md', import.meta.url), 'utf8');
  assert.match(guide, /^version: 0\.13\.0$/m);
  assert.match(guide, /^At 0\.13\.0, .*access\.set_single_header.*none of it has run live/m);
  const access = guide.split('### Access applications and staff')[1].split(/\n#{2,3} /)[0].replace(/\s+/g, ' ');
  assert.match(access, /access\.set_single_header.*unsupported.*null.*reads.*back.*restored: false.*access\.get_app/);
  assert.match(auth, /^\| `access` \| .*set_single_header.*create_app.*Write.*Organizations, Identity Providers, and Groups \/ Read/m);
});
