import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

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
  get_app: { account_id: ACCOUNT, app_id: ID },
};
const app = () => ({ id: ID, type: 'self_hosted', domain: 'crm.example.com', destinations: [{ type: 'public', uri: 'crm.example.com' }],
  policies: [{ id: POLICY }], aud: AUD, client_secret: CLIENT_VALUE, metadata: { token: JWT } });
const staff = (emails = ['one@example.com', 'two@example.com']) => ({ id: POLICY, name: 'CRM staff', decision: 'allow', reusable: true,
  include: emails.map((email) => ({ email: { email } })), exclude: [{ email: { email: 'excluded@example.com' } }],
  require: [], session_duration: '24h', approval_required: false });
const ok = (result, info) => ({ status: 200, data: { success: true, result, ...(info ? { result_info: info } : {}), messages: [{ message: JWT }] } });
const error = (status, codes = [10000]) => ({ status, data: { success: false, errors: codes.map((code) => ({ code, message: secrets.join(' ') })) } });
const clean = (result) => {
  const text = JSON.stringify(result);
  for (const secret of secrets) assert.ok(!text.includes(secret), 'invented credential must not reach any answer or stop');
};
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);
async function setup(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'worker-access-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = await createTestGateway({ home });
  if (!options.disconnected) await putActive(env.store, env.fake, { service: 'cloudflare', module: 'access' });
  const calls = [];
  let policy = options.policy ?? { ...staff(), exclude: [] };
  env.fake.auth.proxy = async (req) => {
    calls.push(structuredClone(req));
    if (options.responder) return options.responder(req, calls.length);
    if (req.endpoint === ROOT + '/organizations') return options.off ? error(403, [9999]) : ok({ auth_domain: 'team.cloudflareaccess.com', secret: CLIENT_VALUE });
    if (req.endpoint.startsWith(ROOT + '/apps?')) return ok(options.duplicates ?? [], { total_pages: 1 });
    if (req.endpoint === ROOT + '/apps' && req.method === 'POST') return ok(options.createdApp ?? { ...app(), policies: req.body.policies.map(({ id }) => id === TOKEN_ID ? agentPolicy() : { ...attachable(), id }) });
    if (req.endpoint === ROOT + '/apps/' + ID) return ok(options.app ?? app());
    if (req.endpoint === ROOT + '/policies' && req.method === 'POST') return ok({ id: POLICY, ...req.body, secret: CLIENT_VALUE });
    if (req.endpoint === ROOT + '/policies/' + TOKEN_ID && req.method === 'GET') return ok(agentPolicy());
    if (req.endpoint === ROOT + '/policies/' + POLICY && req.method === 'GET') return ok(policy);
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
  });
  if (action !== 'get_app') {
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

test('create_app: one hostname and reusable policy links, no single-header setting', async (t) => {
  const env = await setup(t); const result = await env.execute('create_app');
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['GET', ROOT + '/apps?per_page=1000&page=1'], ['GET', ROOT + '/policies/' + POLICY], ['POST', ROOT + '/apps']]);
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
    : req.endpoint.endsWith('page=1') ? ok([{ domain: 'elsewhere.example.com' }], { total_pages: 2 }) : ok([app()], { total_pages: 2 }) });
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
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/organizations'], ['POST', ROOT + '/policies']]);
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
test('get_app: only hostname, policy ids and public audience are returned', async (t) => {
  const env = await setup(t); const result = await env.execute('get_app');
  assert.deepEqual(trace(env.calls), [['GET', ROOT + '/apps/' + ID]]);
  assert.deepEqual(result, { success: true, id: ID, hostname: 'crm.example.com', policy_ids: [POLICY], aud: AUD });
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
test('all four schemas: recursive field walk has no secret-named input and Q7 setting is absent', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const actions = manifest.modules.access.actions; assert.deepEqual(Object.keys(actions).sort(), Object.keys(inputs).sort());
  const walk = (schema) => {
    if (!schema || typeof schema !== 'object') return;
    for (const field of Object.keys(schema.properties ?? {})) assert.doesNotMatch(field, /secret|password|credential|client_id/i);
    for (const value of Object.values(schema)) if (Array.isArray(value)) value.forEach(walk); else walk(value);
  };
  for (const [name, action] of Object.entries(actions)) {
    walk(action.input); assert.equal(action.input.additionalProperties, false);
    assert.equal(action.confirmation, name === 'get_app' ? 'none' : 'always');
    assert.ok(!JSON.stringify(action.input).includes('read_service_tokens_from_header'));
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
  assert.deepEqual(env.calls.filter((req) => req.endpoint.startsWith(ROOT + '/policies/')).map((req) => req.endpoint), [ROOT + '/policies/' + POLICY, ROOT + '/policies/' + TOKEN_ID]);
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
const attachable = () => ({ ...staff(), exclude: [] });
const agentPolicy = () => ({ id: TOKEN_ID, decision: 'non_identity', include: [{ service_token: { token_id: TOKEN_ID } }] });
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
  });
}
for (const policies of [undefined, [], [{ id: POLICY }], [POLICY]]) {
  test('fix2 create_app: missing create-response policy detail is refused: ' + JSON.stringify(policies), async (t) => {
    const env = await setup(t, { policy: attachable(), createdApp: { ...app(), policies } });
    assert.equal((await env.execute('create_app')).status, 'vendor_error');
  });
}
test('fix2 get_app: matching hostname with public path overrides is refused', async (t) => {
  const env = await setup(t, { app: { ...app(), destinations: [{ type: 'public', uri: 'crm.example.com',
    overrides: [{ behavior: 'public', path_pattern: '/health' }] }] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /override|bypass/i);
});
for (const decision of ['bypass', 'deny', 'unknown', null]) test('fix2 get_app: embedded policy decision is refused: ' + decision, async (t) => {
  const env = await setup(t, { app: { ...app(), policies: [{ id: POLICY, decision }] } });
  const result = await env.execute('get_app');
  assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /decision/i);
});
const HYPHENATED_EMAIL = 'it-infrastructure-operations-oncall-team@company.com';
test('fix2 credential filter: hyphenated email passes create_policy', async (t) => {
  const env = await setup(t);
  assert.equal((await env.execute('create_policy', { ...inputs.create_policy, emails: [HYPHENATED_EMAIL] })).success, true);
  assert.deepEqual(env.calls[1].body.include, [{ email: { email: HYPHENATED_EMAIL } }]);
});
test('fix2 credential filter: hyphenated email passes set_staff.add', async (t) => {
  const env = await setup(t);
  const result = await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, add: HYPHENATED_EMAIL });
  assert.equal(result.success, true); assert.ok(result.after.includes(HYPHENATED_EMAIL));
  assert.ok(env.calls.find((req) => req.method === 'PUT').body.include.some((rule) => rule.email.email === HYPHENATED_EMAIL));
});
test('fix2 credential filter: 40-character hyphenated hostname label passes create_app', async (t) => {
  const hostname = HYPHENATED_EMAIL.split('@')[0] + '.example.com';
  assert.equal(hostname.split('.')[0].length, 40);
  const env = await setup(t, { policy: attachable(), createdApp: { ...app(), policies: [attachable()] } });
  assert.equal((await env.execute('create_app', { ...inputs.create_app, hostname })).success, true);
  assert.equal(env.calls.find((req) => req.method === 'POST').body.domain, hostname);
});
test('fix2 credential filter: bare 40-character run and JWT remain refused before transport', async (t) => {
  const env = await setup(t);
  for (const token of [API_TOKEN, JWT]) {
    assert.equal((await env.execute('create_policy', { ...inputs.create_policy, name: token })).status, 'invalid_arguments');
    assert.equal((await env.execute('set_staff', { account_id: ACCOUNT, policy_id: POLICY, add: token + '@example.com' })).status, 'invalid_arguments');
  }
  assert.deepEqual(env.calls, []);
});
