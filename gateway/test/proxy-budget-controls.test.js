// Planted source defects exist only in a child's loader, never in shipped files.
// A control passes only when the unchanged acceptance test fails on the defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeHome } from './fake-provider.js';
const ADAPTER = new URL('../providers/composio/auth-provider.js', import.meta.url).href;
const HARNESS = new URL('./agreement-harness.js', import.meta.url).href;
const CONNECTOR = new URL('../../connectors/elevenlabs/index.js', import.meta.url).href;
const WIRE_TEST = fileURLToPath(new URL('../providers/composio/proxy-budget.test.js', import.meta.url));
const CONTEXT_TEST = fileURLToPath(new URL('./proxy-budget.test.js', import.meta.url));
const AGREEMENT_TEST = fileURLToPath(new URL('./agreement.test.js', import.meta.url));

for (const [name, sourceUrl, acceptance, pattern, replacements, expected] of [
  ['off-by-one inclusive bound', ADAPTER, WIRE_TEST, 'short account JSON', [
    ["Buffer.byteLength(serializedBody, 'utf8') > proxyBodyMaxBytes", "Buffer.byteLength(serializedBody, 'utf8') >= proxyBodyMaxBytes"],
  ], /error: 'vendor_error'/],
  ['UTF-16 count instead of UTF-8', ADAPTER, WIRE_TEST, 'short account JSON', [
    ["Buffer.byteLength(serializeProxyRequest(request), 'utf8')", 'serializeProxyRequest(request).length'],
    ["Buffer.byteLength(serializedBody, 'utf8')", 'serializedBody.length'],
  ], /4100000/],
  ['second serialization after checking the bound', ADAPTER, WIRE_TEST, 'send serializes only once', [
    ["requestSerialized(apiKey, 'POST', '/tools/execute/proxy', serializedBody)", "request(apiKey, 'POST', '/tools/execute/proxy', proxyRequestBody({ providerAccountId, endpoint, method, body, parameters, binary_body }))"],
  ], /a second serialization can change the checked body/],
  ['measurement counted as transport', HARNESS, CONTEXT_TEST, 'agreement measurement is pure', [
    ['authProvider: { measureProxyBody: measureFakeProxyBody, proxy: reach },',
      'authProvider: { measureProxyBody: (request) => { reached = true; return measureFakeProxyBody(request); }, proxy: reach },'],
  ], /measurement counted as transport/],
  ['hidden schema bound', CONNECTOR, AGREEMENT_TEST, 'every connector action agrees', [
    ["if (characters > 5000) return invalid('text');", "if (characters > 0) return invalid('text');"],
  ], /A elevenlabs speech.synthesize text/],
  ['measurement-only refusal mistaken for accepted baseline', HARNESS, AGREEMENT_TEST, 'every connector action agrees', [
    ["const raw = impl.modules?.[mod]?.[act];", "let raw = impl.modules?.[mod]?.[act]; if (name === 'elevenlabs' && mod === 'speech') raw = async (_input, ctx) => { await ctx.measureProxyBody({ endpoint: '/read' }); return { status: 'vendor_error' }; };"],
  ], /F elevenlabs speech.synthesize no-accepted-baseline/],
]) test(`negative control catches ${name}`, (t) => {
  const root = makeHome(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const loader = join(root, 'proxy-mutant-loader.mjs');
  writeFileSync(loader, `export async function load(url, context, next) {
    const result = await next(url, context);
    if (url !== ${JSON.stringify(sourceUrl)}) return result;
    let source = String(result.source);
    for (const [before, after] of ${JSON.stringify(replacements)}) {
      if (!source.includes(before)) throw new Error('mutation target absent');
      source = source.replace(before, after);
    }
    return { ...result, source };
  }\n`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href,
    '--test', '--test-reporter=tap', '--test-name-pattern', pattern, acceptance], { encoding: 'utf8', timeout: 20000, env });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 1, `${name} escaped detection: ${result.stdout} ${result.stderr}`);
  assert.equal((result.stdout + result.stderr).includes('mutation target absent'), false);
  assert.match(result.stdout + result.stderr, expected);
  assert.match(result.stdout, new RegExp('not ok.*' + pattern));
  t.diagnostic(`${name}: planted child exited 1; acceptance test failed as required`);
});
