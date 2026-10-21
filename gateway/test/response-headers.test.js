import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAuthProvider } from '../providers/composio/auth-provider.js';
import { buildContext } from '../src/context.js';
import { StatusSignal, sanitizeError } from '../src/errors.js';
import { loadConnector } from '../src/manifest.js';
import { createResponseHeaderGuard, pickResponseHeaders, RESPONSE_HEADER_NAMES, RESPONSE_HEADER_VALUE_CAP } from '../src/response-headers.js';
import { createFakeProviders, createTestGateway, makeHome, putActive } from './fake-provider.js';

const UPLOAD_ID = 'syntheticUploadId0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
const ADDRESS = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=' + UPLOAD_ID;
const HEADERS = { Location: ADDRESS, Range: 'bytes=0-65535', 'Set-Cookie': 'private', Authorization: 'private' };
const REFUSED = { status: 'vendor_error', reason: 'output_refused', detail: 'response_header' };
const AUTH = { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'OAUTH2', privilege: 'read' };

function action(response_headers) {
  return { risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' }, input: { type: 'object', properties: {}, additionalProperties: false },
    ...(response_headers === undefined ? {} : { response_headers }) };
}

function homeFor(t) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

for (const [label, declaration] of [
  ['null', null], ['object', {}], ['string', 'location'], ['empty', []],
  ['non-string', [5]], ['upper-case', ['Location']], ['cookie', ['set-cookie']],
  ['unknown', ['authorization']], ['duplicate', ['location', 'location']],
  ['mixed invalid', ['range', null]],
]) {
  test(`response header declaration refuses ${label}`, async (t) => {
    await assert.rejects(loadConnector(writeFixture(t, declaration)), (err) => {
      assert.match(err.message, /manifest.json modules.upload.actions.start.response_headers: must list distinct/);
      return true;
    });
  });
}

function writeFixture(t, declaration) {
  const dir = join(homeFor(t), 'header-fixture');
  mkdirSync(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: 'header-fixture', service: 'header-fixture', modules: {
    upload: { auth: AUTH, actions: { start: action(declaration) } },
  } }));
  writeFileSync(join(dir, 'index.js'), 'export const modules = { upload: { start: async () => ({ ok: true }) } };\n');
  return dir;
}

for (const declaration of [undefined, ['location'], ['range'], ['location', 'range']]) {
  test(`response header declaration accepts ${JSON.stringify(declaration)}`, async (t) => {
    const connector = await loadConnector(writeFixture(t, declaration));
    assert.deepEqual(connector.manifest.modules.upload.actions.start.response_headers, declaration);
  });
}

test('picker uses the closed set, lower-case keys, first list member and string values', () => {
  assert.deepEqual(RESPONSE_HEADER_NAMES, ['location', 'range']);
  assert.equal(RESPONSE_HEADER_VALUE_CAP, 8192);
  assert.deepEqual(pickResponseHeaders(HEADERS, ['location', 'range', 'authorization']), { location: ADDRESS, range: HEADERS.Range });
  assert.deepEqual(pickResponseHeaders({ LOCATION: [ADDRESS, 'second'], rAnGe: [123, 456] }, ['location', 'range']), { location: ADDRESS, range: '123' });
  assert.deepEqual(pickResponseHeaders(HEADERS, ['range']), { range: HEADERS.Range });
  for (const raw of [undefined, null, [], 5, 'headers']) assert.deepEqual(pickResponseHeaders(raw, ['location']), {});
  assert.deepEqual(pickResponseHeaders(HEADERS, undefined), {});
  assert.deepEqual(pickResponseHeaders({ Location: [] }, ['location']), {});
});

test('picker omits an over-cap or control-containing value whole and keeps the exact cap', () => {
  const boundary = 'https://example.test/' + 'a'.repeat(RESPONSE_HEADER_VALUE_CAP - 21);
  assert.equal(boundary.length, RESPONSE_HEADER_VALUE_CAP);
  assert.deepEqual(pickResponseHeaders({ Location: boundary }, ['location']), { location: boundary });
  assert.deepEqual(pickResponseHeaders({ Location: boundary + 'a', Range: HEADERS.Range }, ['location', 'range']), { range: HEADERS.Range });
  for (const code of [...Array(32).keys(), 127]) {
    assert.deepEqual(pickResponseHeaders({ Location: ADDRESS + String.fromCharCode(code) }, ['location']), {});
  }
});

function stubAdapter(t, envelope, outerStatus = 200) {
  const envPath = join(homeFor(t), 'synthetic-project-key');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { status: outerStatus, text: async () => JSON.stringify(envelope) };
  });
  return { provider: createAuthProvider({ envPath }), requests };
}

test('adapter reads only top-level headers for a declared success; undeclared shape stays unchanged', async (t) => {
  const { provider, requests } = stubAdapter(t, { status: 200, headers: HEADERS, data: { ok: true, headers: { Location: 'payload' }, 'set-cookie': ['private'] } });
  const req = { providerAccountId: 'fake-account', endpoint: '/start', method: 'POST' };
  assert.deepEqual(await provider.proxy({ ...req, response_headers: ['location', 'range'] }), {
    status: 200, data: { ok: true }, headers: { location: ADDRESS, range: HEADERS.Range },
  });
  for (const declaration of [undefined, []]) {
    assert.deepEqual(await provider.proxy({ ...req, response_headers: declaration }), { status: 200, data: { ok: true } });
  }
  assert.ok(requests.every(({ url, body }) => url.endsWith('/tools/execute/proxy') && !Object.hasOwn(body, 'response_headers')));
});

for (const [label, envelope, outerStatus, status] of [
  ['inner 400', { status: 400, data: { private: ADDRESS }, headers: HEADERS }, 200, 400],
  ['outer 413', { status: 200, headers: HEADERS }, 413, 413],
  ['error flag', { status: 200, error: 'private', headers: HEADERS }, 200, 400],
  ['unsuccessful', { successful: false, headers: HEADERS }, 200, 400],
  ['failed payload', { data: { success: false }, headers: HEADERS }, 200, 400],
  ['null envelope', null, 200, 502],
]) {
  test(`adapter ${label} refusal carries no headers or body`, async (t) => {
    const { provider } = stubAdapter(t, envelope, outerStatus);
    assert.deepEqual(await provider.proxy({ endpoint: '/start', method: 'POST', response_headers: ['location', 'range'] }), {
      status, error: { code: 'vendor_error', endpoint: '/start', method: 'POST' },
    });
  });
}

test('adapter keeps 308 and first Range value', async (t) => {
  const { provider } = stubAdapter(t, { status: 308, headers: { Range: [HEADERS.Range, 'second'] }, data: '' });
  assert.deepEqual(await provider.proxy({ endpoint: ADDRESS, method: 'PUT', response_headers: ['range'] }), {
    status: 308, data: '', headers: { range: HEADERS.Range },
  });
});

test('fake filters rule headers on declared success only, without changing its rule', async () => {
  const rule = { match: () => true, result: { status: 200, data: { ok: true }, headers: HEADERS } };
  const fake = createFakeProviders({ proxyRules: [rule] });
  assert.deepEqual(await fake.auth.proxy({ endpoint: '/start' }), { status: 200, data: { ok: true } });
  assert.deepEqual(await fake.auth.proxy({ endpoint: '/start', response_headers: [] }), { status: 200, data: { ok: true } });
  assert.deepEqual(await fake.auth.proxy({ endpoint: '/start', response_headers: ['location'] }), { status: 200, data: { ok: true }, headers: { location: ADDRESS } });
  assert.equal(rule.result.headers, HEADERS);
  rule.result = { status: 308, data: '', headers: HEADERS };
  assert.deepEqual((await fake.auth.proxy({ response_headers: ['range'] })).headers, { range: HEADERS.Range });
  rule.result = { status: 413, error: { code: 'vendor_error', endpoint: '/start', method: 'POST' }, headers: HEADERS };
  const { headers: _headers, ...expected } = rule.result;
  assert.deepEqual(await fake.auth.proxy({ response_headers: ['location'] }), expected);
  assert.deepEqual(await createFakeProviders().auth.proxy({ endpoint: '/unmatched' }), { status: 200, data: {} });
});

async function gatewayFor(t, fn, declaration = ['location']) {
  const home = homeFor(t);
  const fake = createFakeProviders({ proxyRules: [{ match: () => true, result: ({ endpoint }) => endpoint === '/start'
    ? { status: 200, data: {}, headers: HEADERS }
    : { status: 413, error: { code: 'vendor_error', endpoint, method: 'PUT' }, headers: HEADERS } }] });
  const actions = { start: action(declaration) };
  const state = await createTestGateway({ home, fake, session: false, connectors: [{
    id: 'header-fixture', service: 'header-fixture',
    manifest: { modules: { upload: { auth: AUTH, actions } } },
    impl: { modules: { upload: { start: fn } } },
  }] });
  await putActive(state.store, fake, { service: 'header-fixture', module: 'upload', privilege: 'read' });
  return state;
}

test('context forwards only the action manifest declaration and hides its private tracker', async () => {
  for (const declaration of [undefined, ['location']]) {
    let forwarded;
    const ctx = buildContext({ auth: AUTH, responseHeaders: declaration, authProvider: { proxy: async (req) => { forwarded = req; return { status: 200, data: {} }; } } });
    await ctx.proxy({ endpoint: '/start', response_headers: ['range', 'set-cookie'] });
    assert.equal(Object.hasOwn(forwarded, 'response_headers'), declaration !== undefined);
    assert.deepEqual(forwarded.response_headers, declaration);
    assert.equal(Object.hasOwn(ctx, 'responseHeaderGuard'), false);
  }
});

test('gateway declaration reaches context without widening by a module request', async (t) => {
  for (const declaration of [undefined, ['range'], ['location']]) {
    const state = await gatewayFor(t, async (_input, ctx) => {
      const result = await ctx.proxy({ endpoint: '/start', response_headers: ['location', 'range'] });
      assert.deepEqual(result, { status: 200, data: {}, ...(declaration ? { headers: declaration[0] === 'location' ? { location: ADDRESS } : { range: HEADERS.Range } } : {}) });
      return { ok: true };
    }, declaration);
    // Undefined explicitly means an undeclared action here.
    if (declaration === undefined) delete state.connectors[0].manifest.modules.upload.actions.start.response_headers;
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), { ok: true });
  }
});

for (const [label, project] of [
  ['address', (s) => s], ['canonical URL', (s) => new URL(s).href],
  ['upload id', () => UPLOAD_ID], ['prefix', (s) => s.slice(0, 120)],
  ['interior 16 characters', () => UPLOAD_ID.slice(20, 36)],
  ['literal upload marker', () => 'upload_id='],
]) {
  test(`gateway refuses output containing the delivered ${label}`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => ({ nested: { address: project((await ctx.proxy({ endpoint: '/start' })).headers.location) } }));
    const result = await state.gw.execute({ action: 'header-fixture.upload.start' });
    assert.deepEqual(result, REFUSED);
    const rendered = JSON.stringify(result) + readFileSync(state.audit.file, 'utf8');
    for (let i = 0; i <= UPLOAD_ID.length - 16; i += 1) assert.equal(rendered.includes(UPLOAD_ID.slice(i, i + 16)), false);
  });
}

for (const thrown of [false, true]) {
  test(`gateway refuses a ${thrown ? 'thrown' : 'returned'} status containing the address`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      const result = { status: 'vendor_error', reason: (await ctx.proxy({ endpoint: '/start' })).headers.location };
      if (thrown) throw new StatusSignal(result);
      return result;
    });
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
  });
}

for (const project of [(s) => s, (s) => s.slice(0, 120), () => UPLOAD_ID.slice(20, 36)]) {
  test('gateway replaces a thrown address-bearing error with a plain internal error', async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      throw new TypeError(project((await ctx.proxy({ endpoint: '/start' })).headers.location));
    });
    await assert.rejects(state.gw.execute({ action: 'header-fixture.upload.start' }), (err) => {
      assert.equal(err.constructor, Error);
      assert.equal(err.message, 'internal error');
      assert.equal(sanitizeError(err), 'internal error');
      assert.equal(err.stack.includes(UPLOAD_ID.slice(0, 16)), false);
      return true;
    });
  });
}

test('gateway strips the upload query before constructing a proxy refusal', async (t) => {
  const state = await gatewayFor(t, async (_input, ctx) => {
    const address = (await ctx.proxy({ endpoint: '/start' })).headers.location;
    try { await ctx.proxy({ endpoint: address, method: 'PUT' }); } catch (err) {
      assert.deepEqual(err.object, { status: 'vendor_error', endpoint: '/upload/youtube/v3/videos', method: 'PUT', http_status: 413 });
      throw err;
    }
  });
  assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), {
    status: 'vendor_error', endpoint: '/upload/youtube/v3/videos', method: 'PUT', http_status: 413,
  });
});

test('range and resumable are not treated as secrets and tracking ends with the call', async (t) => {
  let first = true;
  const state = await gatewayFor(t, async (_input, ctx) => {
    if (!first) return { text: ADDRESS };
    first = false;
    return { range: (await ctx.proxy({ endpoint: '/start' })).headers.range, text: 'resumable' };
  }, ['location', 'range']);
  assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), { range: HEADERS.Range, text: 'resumable' });
  assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), { text: ADDRESS });
});

test('address tracker remembers canonical URLs and upload ids of any length', () => {
  for (const id of ['tiny', UPLOAD_ID]) {
    const guard = createResponseHeaderGuard();
    assert.equal(guard.holds('upload_id='), false);
    const address = `https://EXAMPLE.test:443/upload?upload_id=${id}`;
    guard.remember({ location: address, range: 'bytes=0-12345' });
    assert.equal(guard.holds(new URL(address).href), true);
    assert.equal(guard.holds(id), true);
    assert.equal(guard.holds('bytes=0-12345'), false);
    assert.equal(guard.holds('resumable'), false);
  }
});
