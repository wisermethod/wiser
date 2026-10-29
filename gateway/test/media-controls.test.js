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
const GUARD = new URL('../src/response-headers.js', import.meta.url).href;
const GUARD_TEST = fileURLToPath(new URL('./response-media-guard.test.js', import.meta.url));
const OUTPUT_TEST = fileURLToPath(new URL('./media-output.test.js', import.meta.url));

for (const [name, pattern, replacements, expected, sourceUrl = SOURCE, acceptance = TEST] of [
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
  ['short component whole needle', '64 MiB short component', [
    ['if (part.length < 16) return;', 'if (!part) return;'],
  ], /short components must not refuse a 64 MiB file/, GUARD, OUTPUT_TEST],
  ['short decoded query value needle', 'short query v=%31', [
    // Replant the decoded-only whole needle in searchParams, leaving raw
    // component indexing untouched. A body of "1" must catch this regression.
    ["for (const segment of part.split('/')) {", "for (const segment of part.split('/')) { if (segment.length > 0) rememberWhole(segment);"],
  ], /short query values must not refuse a good file/, GUARD, OUTPUT_TEST],
  ['missing path string windows', 'real stdio/RPC error-path-slice', [
    ['rememberWindows(part, 16, fragments);', ''],
  ], /private path slice escaped RPC or stderr/, GUARD, OUTPUT_TEST],
  ['missing bounded invalid-address windows', 'real stdio/RPC error-invalid-slice', [
    ['rememberWindows(value, 16, fragments);', ''],
  ], /private path slice escaped RPC or stderr/, GUARD, OUTPUT_TEST],
  ['unsegmented decoded query windows', 'credential region and date publish', [
    ["part.split('/')", '[part]'],
  ], /credential region and date must not refuse publication/, GUARD, OUTPUT_TEST],
  ['per-parameter file needles', '8192-character many-parameter', [
    ['for (const [, part] of url.searchParams) {', 'for (const [, part] of url.searchParams) { rememberWhole(part);'],
  ], /many-parameter byte scan must accept ordinary media/, GUARD, GUARD_TEST],
  ['overlong address indexing', 'overlong address', [
    ['if (value.length > MEDIA_URL_VALUE_CAP) return;', ''],
  ], /oversized addresses must not build windows or parse components/, GUARD, GUARD_TEST],
  ['overlong address allowed after cancellation', 'overlong address', [
    ["if (typeof urlValue === 'string' && urlValue.length > MEDIA_URL_VALUE_CAP) return fail('invalid_url');", ''],
  ], /Missing expected rejection|inactive/, SOURCE, GUARD_TEST],
  ['unbounded private windows', 'string windows cover', [
    ['if (windows === MAX_WINDOWS)', 'if (false)'],
  ], /window construction must have a finite call-wide budget/, GUARD, GUARD_TEST],
  ['string windows scanned over file bytes', '64 MiB publish scan', [
    ["[...addresses, 'upload_id=']", "[...addresses, ...mediaFragments, 'upload_id=']"],
  ], /whole-needle publish scan must accept ordinary media/, GUARD, GUARD_TEST],
  ['short error slice disclosure', 'real stdio/RPC error-slice', [
    ['const MEDIA_WINDOW = 8;', 'const MEDIA_WINDOW = 16;'],
  ], /private signature slice escaped RPC or stderr/, GUARD, OUTPUT_TEST],
]) test(`negative control catches ${name}`, (t) => {
  const root = makeHome(); t.after(() => rmSync(root, { force: true, recursive: true }));
  const loader = join(root, 'mutant-loader.mjs');
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
    '--test', '--test-reporter=tap', '--test-name-pattern', pattern, acceptance], { encoding: 'utf8', timeout: 10000, env });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 1, `${name} survived its acceptance test: ${result.stdout} ${result.stderr}`);
  assert.equal((result.stdout + result.stderr).includes('mutation target absent'), false);
  assert.match(result.stdout + result.stderr, expected);
  assert.match(result.stdout, new RegExp('not ok.*' + pattern));
  t.diagnostic(`${name}: planted child exited 1; acceptance test failed as required`);
});
