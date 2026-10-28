import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildContext } from '../src/context.js';
import { loadConnector, loadConnectors } from '../src/manifest.js';
import { createFakeProviders, createTestGateway, makeHome, putActive, confirmCall } from './fake-provider.js';
import { makeCtx } from './agreement-harness.js';
import { createAuthProvider as localProvider } from '../providers/local-file/auth-provider.js';
import { createAuthProvider as stubProvider } from '../providers/nango/auth-provider.js';

const CAP = 4100000;
const OVER = { status: 'vendor_error', reason: 'proxy_body_too_large' };
const UNSUPPORTED = { status: 'needs_provider_capability' };
const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
function home(t) { const root = makeHome(); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }
function fixture(root, cap = CAP) {
  const dir = join(root, 'budget-fixture'); mkdirSync(dir);
  const base = { risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' }, input: { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: false } };
  const manifest = { id: 'budget-fixture', service: 'budget-fixture', modules: { items: {
    auth: { provider: 'catalog', toolkit: 'INVENTED_KIT', scheme: 'API_KEY', privilege: 'write' },
    actions: { run: { ...base, proxy_body_max_bytes: cap }, plain: { ...base }, confirmed: { ...base, confirmation: 'always', proxy_body_max_bytes: cap } },
  } } };
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'index.js'), `const run = async (input, ctx) => ctx.proxy({ endpoint: '/invented', body: input });\nexport const modules = { items: { run, plain: run, confirmed: run } };\n`);
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify(manifest));
  return { dir, path, manifest };
}
async function gateway(t, cap = CAP, options = {}) {
  const root = home(t); const f = fixture(root, cap); const connector = await loadConnector(f.dir);
  const state = await createTestGateway({ home: root, connectors: [connector], session: false, ...options });
  if (options.active !== false) await putActive(state.store, state.fake, { service: 'budget-fixture', module: 'items' });
  return { ...state, ...f, connector };
}
function context(authProvider, ...budgets) {
  const cap = budgets.length ? budgets[0] : CAP;
  return buildContext({ service: 'invented', module: 'items', action: 'run', auth: { toolkit: 'INVENTED_KIT' },
    record: { provider_account_id: 'bound-account' }, authProvider, proxyBodyMaxBytes: cap });
}
const unsupported = (err) => { assert.deepEqual(err.object, UNSUPPORTED); return true; };

test('manifest load and --check validate action-level positive safe-integer budgets', async (t) => {
  const f = fixture(home(t));
  for (const cap of [1, CAP, Number.MAX_SAFE_INTEGER, 0, -1, 1.5, null, true, '4100000', {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    f.manifest.modules.items.actions.run.proxy_body_max_bytes = cap;
    writeFileSync(f.path, JSON.stringify(f.manifest));
    const valid = Number.isSafeInteger(cap) && cap > 0;
    if (valid) await loadConnector(f.dir);
    else await assert.rejects(loadConnector(f.dir), /proxy_body_max_bytes: must be a positive safe integer/);
    const result = spawnSync(process.execPath, [SERVER, '--check', '--connectors', join(f.dir, '..')], { encoding: 'utf8' });
    assert.equal(result.status, valid ? 0 : 1, result.stdout + result.stderr);
    if (!valid) assert.match(result.stdout + result.stderr, /proxy_body_max_bytes/);
  }
  // JSON cannot contain NaN/Infinity. Direct values have the same failed predicate.
  for (const cap of [NaN, Infinity, -Infinity]) await assert.rejects(context(createFakeProviders().auth, cap).proxy({}), unsupported);
});

test('no shipped connector opts in and all declarations continue loading', async () => {
  const connectors = await loadConnectors([fileURLToPath(new URL('../../connectors', import.meta.url))]);
  let actions = 0;
  for (const connector of connectors) for (const module of Object.values(connector.manifest.modules)) for (const action of Object.values(module.actions)) {
    actions++; assert.equal(Object.hasOwn(action, 'proxy_body_max_bytes'), false);
  }
  assert.equal(connectors.length, 30); assert.equal(actions, 245);
});

test('context privately binds account, toolkit, default method and budget on every proxy call', async () => {
  const measured = []; const sent = [];
  const fake = createFakeProviders();
  const ctx = context({
    measureProxyBody(req) { measured.push(req); return fake.auth.measureProxyBody(req); },
    async proxy(...args) { sent.push(args); return { status: 200, data: {} }; },
  });
  const request = { endpoint: '/read', providerAccountId: 'override', toolkit: 'override', proxy_body_max_bytes: Infinity, proxyBodyMaxBytes: Infinity, body: { text: '雪𐐀' } };
  const count = await ctx.measureProxyBody(request);
  assert.ok(Number.isSafeInteger(count)); assert.equal(sent.length, 0);
  await ctx.proxy(request); await ctx.proxy({ ...request, method: 'POST' });
  assert.equal(measured.length, 3); assert.equal(sent.length, 2);
  for (const [req, options] of sent) {
    assert.equal(req.providerAccountId, 'bound-account'); assert.equal(req.toolkit, 'INVENTED_KIT');
    assert.equal(Object.hasOwn(req, 'proxy_body_max_bytes'), false); assert.equal(Object.hasOwn(req, 'proxyBodyMaxBytes'), false);
    assert.deepEqual(options, { proxyBodyMaxBytes: CAP });
  }
  assert.equal(sent[0][0].method, 'GET');
});

test('missing, unsupported, throwing and malformed measurements stop budgeted proxy without transport', async () => {
  let sent = 0; let ordinaryCalls = 0;
  for (const measurement of [undefined, () => ({ supported: false }), () => { throw new Error('invented-private-error'); },
    () => { throw { status: 'vendor_error', cause: 'invented-private-cause' }; },
    ...[-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined, { bytes: 1 }, { supported: true, bytes: 1 }].map((value) => () => value)]) {
    const auth = { proxy: async () => { sent++; return { status: 200 }; }, measureProxyBody: measurement };
    await assert.rejects(context(auth).proxy({ endpoint: '/internal-read' }), unsupported);
    await assert.rejects(context(auth).measureProxyBody({ endpoint: '/internal-read' }), unsupported);
    // Existing actions have no mandatory measurement dependency.
    await context(auth, undefined).proxy({ endpoint: '/ordinary' }); ordinaryCalls++;
  }
  assert.equal(sent, ordinaryCalls);
});

test('measurement accepts zero but a getter or unserializable request is a safe capability refusal', async () => {
  const ctx = context({ measureProxyBody() { return 0; }, proxy: async () => ({ status: 200 }) });
  assert.equal(await ctx.measureProxyBody({}), 0);
  const request = { get endpoint() { throw new Error('invented-private-field'); } };
  await assert.rejects(ctx.measureProxyBody(request), unsupported);
  await assert.rejects(ctx.proxy(request), unsupported);
  const cycle = {}; cycle.self = cycle;
  await assert.rejects(context(createFakeProviders().auth).proxy({ body: cycle }), unsupported);
});

test('fake provider enforces the passed inclusive budget; pure measurement is not fake transport', async () => {
  let sent = 0;
  const fake = createFakeProviders({ proxyRules: [{ match: () => true, result: () => { sent++; return { status: 200, data: {} }; } }] });
  const request = { providerAccountId: 'invented', endpoint: '/read', body: '雪𐐀' };
  const count = fake.auth.measureProxyBody(request);
  assert.equal(sent, 0);
  await fake.auth.proxy(request, { proxyBodyMaxBytes: count }); assert.equal(sent, 1);
  await assert.rejects(fake.auth.proxy(request, { proxyBodyMaxBytes: count - 1 }), (err) => { assert.deepEqual(err.object, OVER); return true; });
  assert.equal(sent, 1);
});

test('gateway snapshots action budget; internal GET and module overrides cannot widen it; next action stays ordinary', async (t) => {
  const f = await gateway(t, 200);
  let sent = 0; let measured = 0;
  const measure = f.fake.auth.measureProxyBody;
  f.fake.auth.measureProxyBody = (request) => { measured++; return measure(request); };
  f.fake.auth.proxy = async () => { sent++; return { status: 200, data: {} }; };
  f.connector.impl.modules.items.run = async (_input, ctx) => {
    f.connector.manifest.modules.items.actions.run.proxy_body_max_bytes = Number.MAX_SAFE_INTEGER;
    return ctx.proxy({ endpoint: '/internal-read', body: 'x'.repeat(201), proxyBodyMaxBytes: Infinity, proxy_body_max_bytes: Infinity });
  };
  assert.deepEqual(await f.gw.execute({ action: 'budget-fixture.items.run' }), OVER);
  assert.equal(sent, 0); assert.equal(measured, 1);
  delete f.fake.auth.measureProxyBody;
  const plain = await f.gw.execute({ action: 'budget-fixture.items.plain', input: { text: 'x'.repeat(500) } });
  assert.equal(plain.status, 200); assert.equal(sent, 1);
});

test('gateway capability refusal is sanitized and preserves policy, grant, input and confirmation ordering', async (t) => {
  const f = await gateway(t, CAP, { active: false });
  let measurements = 0; let sent = 0;
  f.fake.auth.measureProxyBody = () => { measurements++; throw new Error('invented-private-canary'); };
  f.fake.auth.proxy = async () => { sent++; return { status: 200 }; };
  assert.equal((await f.gw.execute({ action: 'budget-fixture.items.run' })).status, 'needs_connect');
  await putActive(f.store, f.fake, { service: 'budget-fixture', module: 'items' });
  assert.equal((await f.gw.execute({ action: 'budget-fixture.items.run', input: { unknown: true } })).status, 'invalid_arguments');
  assert.equal((await f.gw.execute({ action: 'budget-fixture.items.confirmed' })).status, 'needs_confirmation');
  assert.equal(measurements, 0); assert.equal(sent, 0);
  assert.deepEqual(await confirmCall(f.gw, { action: 'budget-fixture.items.confirmed' }), UNSUPPORTED);
  assert.equal(measurements, 1); assert.equal(sent, 0);
  assert.deepEqual(await f.gw.callTool('execute', { action: 'budget-fixture.items.run' }), UNSUPPORTED);
  f.gw.policy = { decide: () => ({ effect: 'deny', rule: { effect: 'deny' } }) };
  assert.equal((await f.gw.execute({ action: 'budget-fixture.items.run' })).status, 'denied');
  assert.equal(measurements, 2); assert.equal(sent, 0);
});

test('unsupported adapters retain their existing proxy contracts and omit optional measurement', async () => {
  const local = localProvider(); const stub = stubProvider();
  assert.equal(local.measureProxyBody, undefined); assert.equal(stub.measureProxyBody, undefined);
  assert.deepEqual(await local.proxy({}), { supported: false });
  assert.throws(() => stub.proxy({}), (err) => err.code === 'not_implemented');
  for (const auth of [local, stub]) await assert.rejects(context(auth).proxy({}), unsupported);
});

test('agreement measurement is pure; only proxy or declared download marks transport', async () => {
  const probe = makeCtx('invented', 'items', 'run', {});
  const n = await probe.ctx.measureProxyBody({ endpoint: '/read', body: '雪𐐀' });
  assert.ok(Number.isSafeInteger(n) && n > 0);
  assert.equal(probe.reached(), false, 'measurement counted as transport');
  assert.equal(probe.ctx.downloadMedia, undefined);
  await assert.rejects(probe.ctx.proxy({ endpoint: '/read' }));
  assert.equal(probe.reached(), true);
  const download = makeCtx('invented', 'items', 'run', {}, { download_media: { hosts: ['media.example'] }, output_file: { media_types: ['video/mp4'], max_bytes: 1 } });
  assert.throws(() => download.ctx.downloadMedia({ url: 'https://media.example/invented', media_type: 'video/mp4' }));
  assert.equal(download.reached(), true);
});
