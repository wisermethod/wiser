// Plant defects in a child loader's in-memory source only. A passing control
// means the unchanged acceptance test rejected the defective implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeHome } from './fake-provider.js';
const SOURCE = new URL('../src/media-download.js', import.meta.url).href;
const TEST = fileURLToPath(new URL('./media-download.test.js', import.meta.url));

for (const [name, pattern, replacements, expected] of [
  ['rebinding transport', 'refuses rebinding peer', [
    ['!sameAddress(res.socket?.remoteAddress, selected.address) || ', ''],
    ['!sameAddress(socket.remoteAddress, selected.address) || ', ''],
  ], /Missing expected rejection/],
  ['second DNS resolution', 'real connection boundary is pinned', [
    ['hostname: selected.address', 'hostname: url.hostname'],
  ], /not ok/],
  ['ignored streamed cap', 'stream control: absent length over cap', [
    ['if (chunk.byteLength > maxBytes - total)', 'if (false)'],
    ['Math.min(SLAB_BYTES, maxBytes - allocated)', 'SLAB_BYTES'],
  ], /Missing expected rejection/],
  ['ignored wall deadline', 'wall deadline cancels slow body', [
    ["setTimeout(() => fail('deadline'), DEADLINE_MS)", 'setTimeout(() => {}, DEADLINE_MS)'],
  ], /deadline did not cancel resolution|deadline did not destroy transport/],
  ['leaking transport error', 'refuses TLS error without raw failure text', [
    ["req.on('error', () => fail('transport_failed'));", "req.on('error', (err) => { done = true; cleanup(); reject(err); });"],
  ], /private error value escaped/],
]) test(`negative control catches ${name}`, (t) => {
  const root = makeHome(); t.after(() => rmSync(root, { force: true, recursive: true }));
  const loader = join(root, 'mutant-loader.mjs');
  writeFileSync(loader, `export async function load(url, context, next) {
    const result = await next(url, context);
    if (url !== ${JSON.stringify(SOURCE)}) return result;
    let source = String(result.source);
    for (const [before, after] of ${JSON.stringify(replacements)}) {
      if (!source.includes(before)) throw new Error('mutation target absent');
      source = source.replace(before, after);
    }
    return { ...result, source };
  }\n`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href,
    '--test', '--test-reporter=tap', '--test-name-pattern', pattern, TEST], { encoding: 'utf8', timeout: 10000, env });
  assert.equal(result.signal, null, result.stderr);
  assert.notEqual(result.status, 0, `${name} survived its acceptance test: ${result.stdout} ${result.stderr}`);
  assert.equal((result.stdout + result.stderr).includes('mutation target absent'), false);
  assert.match(result.stdout + result.stderr, expected);
  assert.match(result.stdout, new RegExp('not ok.*' + pattern));
});
