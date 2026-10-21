// Named response headers through the provider's proxy, held to System Expert Job 1's
// conditions 1 to 4 for the YouTube connector (zBuilds playbooks/gates/production-studio/
// 2026-10-21-m3-youtube-job1.md): a closed set an action declares, returned on success
// only, and a delivered upload address that never leaves the call. Written apart from the
// implementation, against its specification. Invented data only.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createAudit } from '../src/audit.js';
import { ConnectionGateway } from '../src/gateway.js';
import { loadConnectors } from '../src/manifest.js';
import { loadPolicy } from '../src/policy.js';
import { createRpcHandler } from '../src/rpc.js';
import { JsonFileStore } from '../src/store.js';
import { createAuthProvider } from '../providers/composio/auth-provider.js';

const DEFAULT_POLICY = fileURLToPath(new URL('../policy.default.json', import.meta.url));
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UPLOAD_ID = Array.from(randomBytes(64), (b) => ALPHABET[b % 64]).join('');
const START = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
// Spelled so that its parsed form differs from it: upper-case host and the default port.
const LOCATION = `https://WWW.GoogleAPIs.com:443/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=${UPLOAD_ID}`;
const HREF = new URL(LOCATION).href;
const RANGE = 'bytes=0-3145727';

function holdsRun(text, id = UPLOAD_ID, run = 16) {
  for (let i = 0; i + run <= id.length; i += 1) if (text.includes(id.slice(i, i + run))) return true;
  return false;
}

function fixtureConnectors() {
  const root = mkdtempSync(join(tmpdir(), 'rh-withheld-connectors-'));
  const dir = join(root, 'tube');
  mkdirSync(dir);
  const action = (extra = {}) => ({
    description: 'invented', risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' },
    input: { type: 'object', properties: {}, additionalProperties: false }, ...extra,
  });
  const loc = { response_headers: ['location'] };
  const both = { response_headers: ['location', 'range'] };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'tube',
    service: 'tube',
    modules: {
      up: {
        auth: { provider: 'catalog', toolkit: 'FAKE_TUBE', scheme: 'OAUTH2', privilege: 'write' },
        actions: {
          nodecl: action(),
          nodecl_asks: action(),
          decl_loc: action(loc),
          leak_full: action(loc),
          leak_href: action(loc),
          leak_id: action(loc),
          leak_prefix: action(loc),
          throw_full: action(loc),
          throw_prefix: action(loc),
          status_ret: action(loc),
          status_throw: action(loc),
          chunk_propagate: action(loc),
          chunk_seen: action(loc),
          range_repeat: action(both),
        },
        unwrap_token: false,
        fallback: 'none',
      },
    },
  }));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tube-fixture', private: true, type: 'module' }));
  const errorsUrl = new URL('../src/errors.js', import.meta.url).href;
  writeFileSync(join(dir, 'index.js'), `
import { StatusSignal } from '${errorsUrl}';
const START = ${JSON.stringify(START)};
async function start(ctx, extra = {}) {
  return ctx.proxy({ endpoint: START, method: 'POST', body: { snippet: { title: 'invented' } }, ...extra });
}
function loc(res) { return res && res.headers ? res.headers.location : undefined; }
export const modules = {
  up: {
    async nodecl(_i, ctx) { const res = await start(ctx); return { has_headers_key: Object.hasOwn(res, 'headers') }; },
    async nodecl_asks(_i, ctx) {
      const res = await start(ctx, { response_headers: ['location', 'range', 'set-cookie'] });
      return { has_headers_key: Object.hasOwn(res, 'headers') };
    },
    async decl_loc(_i, ctx) {
      const res = await start(ctx, { response_headers: ['location', 'range', 'set-cookie', 'authorization'] });
      return { keys: Object.keys(res.headers || {}).sort(), has_location: typeof loc(res) === 'string' };
    },
    async leak_full(_i, ctx) { return { addr: loc(await start(ctx)) }; },
    async leak_href(_i, ctx) { return { addr: new URL(loc(await start(ctx))).href }; },
    async leak_id(_i, ctx) { return { id: new URL(loc(await start(ctx))).searchParams.get('upload_id') }; },
    async leak_prefix(_i, ctx) { return { cut: loc(await start(ctx)).slice(0, 120) }; },
    async throw_full(_i, ctx) { throw new Error(loc(await start(ctx))); },
    async throw_prefix(_i, ctx) { throw new Error(loc(await start(ctx)).slice(0, 120)); },
    async status_ret(_i, ctx) { const l = loc(await start(ctx)); return { status: 'vendor_error', endpoint: '/x', method: 'PUT', note: l }; },
    async status_throw(_i, ctx) { const l = loc(await start(ctx)); throw new StatusSignal({ status: 'vendor_error', endpoint: '/x', method: 'PUT', note: l }); },
    async chunk_propagate(_i, ctx) {
      const l = loc(await start(ctx));
      await ctx.proxy({ endpoint: l, method: 'PUT', parameters: [{ name: 'X-Fake', value: 'refuse', type: 'header' }] });
      return { reached: true };
    },
    async chunk_seen(_i, ctx) {
      const l = loc(await start(ctx));
      try {
        await ctx.proxy({ endpoint: l, method: 'PUT', parameters: [{ name: 'X-Fake', value: 'refuse', type: 'header' }] });
        return { refused: false };
      } catch (err) {
        const o = err && err.object ? err.object : {};
        return { refused: true, has_query: String(o.endpoint || '').includes('?'), mentions_id: String(o.endpoint || '').includes('upload_id'), http_status: o.http_status ?? null };
      }
    },
    async range_repeat(_i, ctx) {
      const l = loc(await start(ctx));
      const res = await ctx.proxy({ endpoint: l, method: 'PUT', binary_body: { base64: 'AAAA', content_type: 'video/mp4' } });
      return { status: res.status, range: res.headers ? res.headers.range : null, word: 'resumable', echo: ${JSON.stringify(RANGE)} };
    },
  },
};
`);
  return root;
}

// A fake provider that keeps the adapter's contract: it returns a headers key only for
// the names it is asked for, so what reaches the module shows what the gateway asked for.
function fakeProvider() {
  const calls = [];
  const raw = { Location: LOCATION, Range: 'bytes=0-1', 'Set-Cookie': 'sid=invented-cookie', Authorization: 'Bearer invented' };
  const pick = (source, names) => {
    if (!Array.isArray(names) || names.length === 0) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(source)) if (names.includes(k.toLowerCase())) out[k.toLowerCase()] = v;
    return out;
  };
  const auth = {
    isConfigured: () => true,
    async proxy(req) {
      calls.push({ endpoint: req.endpoint, method: req.method, response_headers: req.response_headers });
      if (req.endpoint === START && req.method === 'POST') {
        const h = pick(raw, req.response_headers);
        return h ? { status: 200, data: {}, headers: h } : { status: 200, data: {} };
      }
      if (req.method === 'PUT' && Array.isArray(req.parameters) && req.parameters.some((p) => p.value === 'refuse')) {
        return { status: 413, error: { code: 'vendor_error', endpoint: req.endpoint, method: 'PUT' } };
      }
      if (req.method === 'PUT') {
        const h = pick({ Range: RANGE, Location: LOCATION }, req.response_headers);
        return h ? { status: 308, data: '', headers: h } : { status: 308, data: '' };
      }
      return { status: 404, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method } };
    },
    async status() { return 'ACTIVE'; },
    async listAccounts() { return []; },
    async initiate() { return { status: 'link', url: 'https://example.invalid/link' }; },
    async unwrap() { return { supported: false }; },
  };
  const catalog = { async execute() { return { data: {} }; } };
  return { auth, catalog, calls };
}

async function build() {
  const home = mkdtempSync(join(tmpdir(), 'rh-withheld-home-'));
  const connectors = await loadConnectors([fixtureConnectors()]);
  const fake = fakeProvider();
  const store = new JsonFileStore(home);
  store.putConnection({
    id: 'conn-tube-up', service: 'tube', module: 'up', privilege: 'write', provider: 'catalog',
    provider_account_id: 'fake-acct-tube', scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const gw = new ConnectionGateway({
    home, role: 'runtime', harness: 'rh-withheld', store,
    policy: loadPolicy({ home, defaultPath: DEFAULT_POLICY }),
    audit: createAudit(home),
    authProvider: fake.auth, catalogProvider: fake.catalog, localFileProvider: null,
    authConfigured: true, connectors, envPath: null, classifier: null,
  });
  const rpc = createRpcHandler({ gateway: gw, version: 'withheld' });
  return { gw, home, fake, rpc };
}

async function callText(rpc, action) {
  const line = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'execute', arguments: { action, input: {} } } });
  const response = await rpc(line);
  return response.result.content[0].text;
}

function auditText(home) {
  const p = join(home, 'audit.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function clean(text, label) {
  assert.equal(text.includes(LOCATION), false, `${label}: the address leaked`);
  assert.equal(text.includes(HREF), false, `${label}: the parsed address leaked`);
  assert.equal(holdsRun(text), false, `${label}: a run of the upload_id leaked`);
}

test('A7: an action that declares nothing gets no headers key, even when the module asks', async () => {
  const { gw, fake } = await build();
  for (const action of ['nodecl', 'nodecl_asks']) {
    const result = await gw.execute({ action: `tube.up.${action}`, input: {} });
    assert.deepEqual(result, { has_headers_key: false }, action);
  }
  for (const c of fake.calls) assert.ok(!Array.isArray(c.response_headers) || c.response_headers.length === 0, 'an undeclared call asked for headers');
});

test('A7: a declaring action gets only its declared names, whatever the module asks for', async () => {
  const { gw, fake } = await build();
  const result = await gw.execute({ action: 'tube.up.decl_loc', input: {} });
  assert.deepEqual(result, { keys: ['location'], has_location: true });
  assert.deepEqual(fake.calls.at(-1).response_headers, ['location']);
});

for (const action of ['leak_full', 'leak_href', 'leak_id', 'leak_prefix', 'status_ret', 'status_throw']) {
  test(`A8 and A10: ${action} is refused, and no form of the address reaches the result or the audit`, async () => {
    const { gw, home, rpc } = await build();
    const direct = await gw.execute({ action: `tube.up.${action}`, input: {} });
    assert.equal(direct.status, 'vendor_error', `${action}: ${JSON.stringify(direct).slice(0, 200)}`);
    assert.equal(direct.reason, 'output_refused');
    assert.equal(direct.detail, 'response_header');
    clean(JSON.stringify(direct), `${action} direct`);
    clean(await callText(rpc, `tube.up.${action}`), `${action} tool result`);
    clean(auditText(home), `${action} audit`);
  });
}

for (const action of ['throw_full', 'throw_prefix']) {
  test(`A9: ${action}'s message reaches the tool result as internal error`, async () => {
    const { gw, home, rpc } = await build();
    await assert.rejects(gw.execute({ action: `tube.up.${action}`, input: {} }), (err) => {
      assert.equal(err.message, 'internal error');
      return true;
    });
    const text = await callText(rpc, `tube.up.${action}`);
    clean(text, `${action} tool result`);
    assert.match(text, /internal error/);
    clean(auditText(home), `${action} audit`);
  });
}

test('A11: a refused chunk carries the path without its query, and its http status', async () => {
  const { gw, home, rpc } = await build();
  const direct = await gw.execute({ action: 'tube.up.chunk_propagate', input: {} });
  assert.equal(direct.status, 'vendor_error');
  assert.equal(direct.http_status, 413);
  assert.equal(String(direct.endpoint).includes('?'), false, `endpoint kept its query: ${direct.endpoint}`);
  assert.equal(direct.endpoint, '/upload/youtube/v3/videos');
  clean(JSON.stringify(direct), 'chunk direct');
  clean(await callText(rpc, 'tube.up.chunk_propagate'), 'chunk tool result');
  clean(auditText(home), 'chunk audit');
  const seen = await gw.execute({ action: 'tube.up.chunk_seen', input: {} });
  assert.deepEqual(seen, { refused: true, has_query: false, mentions_id: false, http_status: 413 });
});

test('A12: a repeated range value and the word resumable are left intact', async () => {
  const { gw } = await build();
  const result = await gw.execute({ action: 'tube.up.range_repeat', input: {} });
  assert.deepEqual(result, { status: 308, range: RANGE, word: 'resumable', echo: RANGE });
});

// A5, through the real adapter with fetch stubbed.
function adapterWith(headers) {
  const dir = mkdtempSync(join(tmpdir(), 'rh-withheld-env-'));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=invented-key\n');
  const provider = createAuthProvider({ envPath });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 200, data: {}, successful: true, headers }), { status: 200, headers: { 'content-type': 'application/json' } });
  return { provider, restore: () => { globalThis.fetch = realFetch; } };
}

test('A5: a value over 8,192 characters, or holding a control character, is left out whole', async () => {
  const cases = [
    ['x'.repeat(8193), false],
    ['x'.repeat(8192), true],
    ['https://example.invalid/a\nb', false],
    ['https://example.invalid/a\rb', false],
    ['https://example.invalid/a\u0000b', false],
    ['https://example.invalid/a\u007fb', false],
    ['https://example.invalid/fine', true],
  ];
  for (const [value, kept] of cases) {
    const { provider, restore } = adapterWith({ Location: value });
    try {
      const res = await provider.proxy({ providerAccountId: 'acct', endpoint: '/x', method: 'GET', response_headers: ['location'] });
      const got = res.headers ? res.headers.location : undefined;
      if (kept) assert.equal(got, value, `kept ${JSON.stringify(value.slice(0, 30))}`);
      else assert.equal(got, undefined, `left out ${JSON.stringify(value.slice(0, 30))}`);
      if (!kept && res.headers && res.headers.location !== undefined) assert.fail('a cut value was returned');
    } finally {
      restore();
    }
  }
});
