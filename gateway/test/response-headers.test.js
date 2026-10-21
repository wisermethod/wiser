import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createAuthProvider } from '../providers/composio/auth-provider.js';
import { buildContext } from '../src/context.js';
import { StatusSignal, sanitizeError } from '../src/errors.js';
import { loadConnector } from '../src/manifest.js';
import { runStdio } from '../src/rpc.js';
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
  assert.deepEqual(pickResponseHeaders({ LOCATION: [ADDRESS, 'second'], rAnGe: [123, 456] }, ['location', 'range']), { location: ADDRESS });
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

async function gatewayFor(t, fn, declaration = ['location'], headers = HEADERS) {
  const home = homeFor(t);
  const fake = createFakeProviders({ proxyRules: [{ match: () => true, result: ({ endpoint }) => endpoint === '/start'
    ? { status: 200, data: {}, headers }
    : { status: 413, error: { code: 'vendor_error', endpoint, method: 'PUT' }, headers } }] });
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

async function toolAnswer(gateway) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let errors = '';
  stderr.on('data', (chunk) => { errors += chunk.toString(); });
  const output = new Promise((resolve) => stdout.once('data', (chunk) => resolve(JSON.parse(chunk.toString()))));
  const rl = runStdio({ gateway, version: 'test', stdin, stdout, stderr });
  stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'execute', arguments: { action: 'header-fixture.upload.start' },
  } }) + '\n');
  try { return { answer: await output, stderr: errors }; } finally { rl.close(); }
}

for (const [label, message] of [
  ['array', () => [ADDRESS]], ['object', () => ({ url: ADDRESS })],
  ['boxed string', () => new String(ADDRESS)], ['missing', () => undefined],
]) {
  test(`non-string thrown message (${label}) becomes an internal error at stdio`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      await ctx.proxy({ endpoint: '/start' });
      throw Object.assign(new Error('failed'), { message: message() });
    });
    const { answer, stderr } = await toolAnswer(state.gw);
    assert.equal(answer.result.isError, true);
    assert.deepEqual(JSON.parse(answer.result.content[0].text), { error: 'internal error' });
    assert.equal(stderr, '');
    assert.equal(readFileSync(state.audit.file, 'utf8').includes(UPLOAD_ID.slice(0, 16)), false);
  });
}

for (const [label, decorate] of [
  ['own field', (err) => { err.endpoint = ADDRESS; }],
  ['non-enumerable field', (err) => { Object.defineProperty(err, 'endpoint', { value: ADDRESS }); }],
  ['cause string', (err) => { err.cause = ADDRESS; }],
  ['cause error', (err) => { err.cause = new Error(ADDRESS); }],
  ['cause field', (err) => { err.cause = { endpoint: ADDRESS }; }],
]) {
  test(`thrown error with an address in its ${label} is replaced`, async (t) => {
    const original = new TypeError('safe failure');
    decorate(original);
    const state = await gatewayFor(t, async (_input, ctx) => {
      await ctx.proxy({ endpoint: '/start' });
      throw original;
    });
    await assert.rejects(state.gw.execute({ action: 'header-fixture.upload.start' }), (err) => {
      assert.notEqual(err, original);
      assert.equal(err.constructor, Error);
      assert.equal(err.message, 'internal error');
      return true;
    });
  });
}

test('clean thrown string fields and one clean cause preserve the original error', async (t) => {
  const original = Object.assign(new TypeError('safe failure'), { code: 'safe', cause: new Error('safe cause') });
  const state = await gatewayFor(t, async (_input, ctx) => {
    await ctx.proxy({ endpoint: '/start' });
    throw original;
  });
  await assert.rejects(state.gw.execute({ action: 'header-fixture.upload.start' }), (err) => err === original);
});

for (const [label, project] of [
  ['raw quoted location', (s) => s],
  ['escaped upload id', (s) => new URL(s).searchParams.get('upload_id')],
]) {
  test(`the result scan refuses a ${label} before JSON escaping`, async (t) => {
    const id = ('quoted"\\\u2028\u2029').repeat(8);
    const address = `https://example.test/upload/"session?upload_id=${encodeURIComponent(id)}`;
    const state = await gatewayFor(t, async (_input, ctx) => {
      const location = (await ctx.proxy({ endpoint: '/start' })).headers.location;
      return { value: project(location) };
    }, ['location'], { Location: address });
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
  });
}

test('a quoted HTTPS location without an upload id is scanned before escaping', async (t) => {
  const address = 'https://example.test/upload/"session"';
  const state = await gatewayFor(t, async (_input, ctx) => ({
    address: (await ctx.proxy({ endpoint: '/start' })).headers.location,
  }), ['location'], { Location: address });
  assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
});

for (const [label, project] of [
  ['Buffer', (s) => Buffer.from(s)],
  ['Uint8Array view', (s) => {
    const bytes = Buffer.from('prefix' + s + 'suffix');
    return new Uint8Array(bytes.buffer, bytes.byteOffset + 6, Buffer.byteLength(s));
  }],
  ['ArrayBuffer', (s) => Uint8Array.from(Buffer.from(s)).buffer],
  ['object key', (s) => ({ [s]: 'safe' })],
  ['BigInt beside address', (s) => ({ number: 1n, value: s })],
  ['cycle before address', (s) => {
    const value = {};
    value.self = value;
    value.value = s;
    return value;
  }],
]) {
  test(`the result scan refuses an address held in a ${label}`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => project((await ctx.proxy({ endpoint: '/start' })).headers.location));
    const { answer, stderr } = await toolAnswer(state.gw);
    assert.deepEqual(JSON.parse(answer.result.content[0].text), REFUSED);
    assert.equal(answer.result.isError, false);
    assert.equal(stderr, '');
  });
}

for (const encoding of ['utf8', 'latin1']) {
  test(`byte values are decoded as ${encoding}`, async (t) => {
    const id = 'latinÉUpload012345'.repeat(4);
    const address = `https://example.test/upload?upload_id=${encodeURIComponent(id)}`;
    const state = await gatewayFor(t, async (_input, ctx) => {
      const location = (await ctx.proxy({ endpoint: '/start' })).headers.location;
      return { bytes: Buffer.from(new URL(location).searchParams.get('upload_id'), encoding) };
    }, ['location'], { Location: address });
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
  });
}

for (const [label, build] of [
  ['throwing getter', () => ({ get value() { throw new Error('unreadable'); } })],
  ['Proxy', () => new Proxy({ value: 'safe' }, {})],
  ['throwing Proxy', () => new Proxy({}, { ownKeys() { throw new Error('unreadable'); } })],
  ['depth past 64', () => {
    let value = 'safe';
    for (let i = 0; i < 65; i += 1) value = { value };
    return value;
  }],
]) {
  test(`the result scan fails closed on ${label}`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      await ctx.proxy({ endpoint: '/start' });
      return build();
    });
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
  });
}

test('the value walk terminates on clean cycles, skips BigInt and accepts depth 64', () => {
  const guard = createResponseHeaderGuard();
  guard.remember({ location: ADDRESS });
  const value = { number: 1n };
  value.self = value;
  assert.equal(guard.holdsValue(value), false);
  let nested = 'safe';
  for (let i = 0; i < 64; i += 1) nested = { value: nested };
  assert.equal(guard.holdsValue(nested), false);
  assert.equal(guard.holdsValue({ nested }), true);
});

for (const thrown of [false, true]) {
  for (const [label, build] of [
    ['bytes', () => Buffer.from(ADDRESS)],
    ['BigInt and address', () => ({ number: 1n, value: ADDRESS })],
    ['cycle and address', () => {
      const value = {};
      value.self = value;
      value.address = ADDRESS;
      return value;
    }],
    ['throwing getter', () => ({ get value() { throw new Error('unreadable'); } })],
  ]) {
    test(`a ${thrown ? 'thrown' : 'returned'} status is walked for ${label}`, async (t) => {
      const state = await gatewayFor(t, async (_input, ctx) => {
        await ctx.proxy({ endpoint: '/start' });
        const status = { status: 'vendor_error', value: build() };
        if (thrown) throw new StatusSignal(status);
        return status;
      });
      assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
    });
  }
}

test('picker drops empty and non-string values without coercing them', () => {
  const object = { toString() { throw new Error('must not coerce'); } };
  for (const value of ['', null, undefined, 12, false, object, new String(ADDRESS), [], [null, ADDRESS], ['', ADDRESS]]) {
    assert.deepEqual(pickResponseHeaders({ Location: value }, ['location']), {});
  }
  assert.deepEqual(pickResponseHeaders({ Location: [ADDRESS, null] }, ['location']), { location: ADDRESS });
});

test('remember activates only for a non-empty HTTPS URL and never stores an empty id', () => {
  for (const value of ['', null, undefined, 12, new String(ADDRESS), 'not a URL', '/relative', 'http://example.test/upload', 'ftp://example.test/upload']) {
    const guard = createResponseHeaderGuard();
    guard.remember({ location: value });
    assert.equal(guard.active, false);
    assert.equal(guard.holds('null upload_id= safe'), false);
  }
  const guard = createResponseHeaderGuard();
  guard.remember({ location: 'https://example.test/upload?upload_id=' });
  assert.equal(guard.active, true);
  assert.equal(guard.holds('safe'), false);
  assert.equal(guard.holds(''), false);
});

for (const location of ['', null, 12, 'not a URL', 'http://example.test/upload']) {
  test(`invalid location ${JSON.stringify(location)} does not poison a legitimate answer`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      await ctx.proxy({ endpoint: '/start' });
      return { id: 'video', description: null };
    }, ['location'], { Location: location });
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), { id: 'video', description: null });
  });
}

for (const [label, call] of [
  ['id', (ctx, address) => ctx.catalog(address, {})],
  ['arguments', (ctx, address) => ctx.catalog('fake.echo.run', { nested: [address] })],
  ['argument keys', (ctx, address) => ctx.catalog('fake.echo.run', { [address]: true })],
  ['argument bytes', (ctx, address) => ctx.catalog('fake.echo.run', { bytes: Buffer.from(address) })],
]) {
  test(`gateway catalog override refuses address-bearing ${label} before the provider`, async (t) => {
    const state = await gatewayFor(t, async (_input, ctx) => {
      const address = (await ctx.proxy({ endpoint: '/start' })).headers.location;
      return call(ctx, address);
    });
    let calls = 0;
    state.gw.catalogProvider.execute = async () => { calls += 1; return { ok: true }; };
    assert.deepEqual(await state.gw.execute({ action: 'header-fixture.upload.start' }), REFUSED);
    assert.equal(calls, 0);
  });
}

test('standalone context catalog checks id, explicit arguments and input fallback', async () => {
  let calls = 0;
  const guard = createResponseHeaderGuard();
  guard.remember({ location: ADDRESS });
  const ctx = buildContext({ auth: AUTH, input: { address: ADDRESS }, responseHeaderGuard: guard,
    catalogProvider: { execute: async () => { calls += 1; return { ok: true }; } } });
  for (const [id, args] of [[ADDRESS, {}], ['fake.echo.run', { address: ADDRESS }], ['fake.echo.run', undefined]]) {
    await assert.rejects(ctx.catalog(id, args), (err) => err instanceof StatusSignal && assert.deepEqual(err.object, REFUSED) === undefined);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await ctx.catalog('fake.echo.run', { safe: true }), { ok: true });
  assert.equal(calls, 1);
});

for (const [label, request] of [
  ['URL', { url: ADDRESS }],
  ['headers', { url: 'https://www.googleapis.com/safe', headers: { 'x-upload': ADDRESS } }],
  ['header key', { url: 'https://www.googleapis.com/safe', headers: { [ADDRESS]: 'value' } }],
  ['body', { url: 'https://www.googleapis.com/safe', body: { nested: ADDRESS } }],
  ['byte body', { url: 'https://www.googleapis.com/safe', body: Buffer.from(ADDRESS) }],
]) {
  test(`direct HTTP refuses an address-bearing ${label} before fetch`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls += 1; return { status: 200, ok: true, text: async () => '{}' }; });
    const guard = createResponseHeaderGuard();
    const ctx = buildContext({ auth: { ...AUTH, hosts: ['www.googleapis.com'] }, responseHeaderGuard: guard,
      responseHeaders: ['location'], authProvider: { proxy: async () => ({ status: 200, data: {}, headers: HEADERS }) },
      unwrap: { supported: true, header: 'Authorization', value: 'synthetic' } });
    await ctx.proxy({ endpoint: '/start' });
    await assert.rejects(ctx.http(request), (err) => err instanceof StatusSignal && assert.deepEqual(err.object, REFUSED) === undefined);
    assert.equal(calls, 0);
    assert.deepEqual(await ctx.http({ url: 'https://www.googleapis.com/safe', body: { safe: true } }), { status: 200, data: {} });
    assert.equal(calls, 1);
  });
}

test('an action cannot declare file output alongside response headers', async (t) => {
  const dir = writeFixture(t, ['location']);
  const path = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.modules.upload.actions.start.output_file = { media_types: ['audio/mpeg'], max_bytes: 100 };
  writeFileSync(path, JSON.stringify(manifest));
  await assert.rejects(loadConnector(dir), /output_file: must not be combined with response_headers/);
});

test('context copies the declaration for every call and filters an over-returning provider', async () => {
  const declaration = ['location'];
  const guard = createResponseHeaderGuard();
  const requests = [];
  const ctx = buildContext({ auth: AUTH, responseHeaders: declaration, responseHeaderGuard: guard,
    authProvider: { proxy: async (req) => {
      requests.push(req.response_headers);
      req.response_headers.push('range', 'set-cookie');
      return { status: 200, data: {}, headers: HEADERS };
    } } });
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(await ctx.proxy({ endpoint: '/start', response_headers: ['range'] }), {
      status: 200, data: {}, headers: { location: ADDRESS },
    });
  }
  assert.deepEqual(declaration, ['location']);
  assert.notEqual(requests[0], declaration);
  assert.notEqual(requests[0], requests[1]);
  assert.equal(guard.holds(ADDRESS), true);
});

test('context strips undeclared headers and filters the cap, controls and value types before remembering', async () => {
  for (const declaration of [undefined, ['location']]) {
    for (const location of [ADDRESS, 'x'.repeat(8193), ADDRESS + '\n', '', null]) {
      const guard = createResponseHeaderGuard();
      const ctx = buildContext({ auth: AUTH, responseHeaders: declaration, responseHeaderGuard: guard,
        authProvider: { proxy: async () => ({ status: 200, data: {}, headers: { ...HEADERS, Location: location } }) } });
      const res = await ctx.proxy({ endpoint: '/start' });
      const kept = declaration !== undefined && location === ADDRESS;
      assert.deepEqual(res, { status: 200, data: {}, ...(declaration ? { headers: kept ? { location: ADDRESS } : {} } : {}) });
      assert.equal(guard.active, kept);
    }
  }
  const boundary = 'https://example.test/' + 'a'.repeat(RESPONSE_HEADER_VALUE_CAP - 21);
  const ctx = buildContext({ auth: AUTH, responseHeaders: ['location'],
    authProvider: { proxy: async () => ({ status: 200, headers: { Location: boundary } }) } });
  assert.deepEqual((await ctx.proxy()).headers, { location: boundary });
});

test('header refusal documentation names its fields and the context filter in the provider contract', () => {
  const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8');
  const providers = readFileSync(new URL('../providers/AGENTS.md', import.meta.url), 'utf8');
  assert.match(setup, /An `output_refused` refusal carries `reason` and `detail` and may carry no status code or endpoint/);
  assert.match(providers, /The gateway's context applies the same filter, so an adapter that returns more delivers nothing more/);
});
