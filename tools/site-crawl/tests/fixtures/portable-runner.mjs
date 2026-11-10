import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
import assert from 'node:assert/strict';
import { fixtureNetwork, FIXED_TIME } from './network.mjs';
// Only the harness uses Node. The actual crawl module graph receives the same
// Web APIs a Worker has, and rejects every non-relative import transitively.
const context = createContext({ URL, TextEncoder, TextDecoder, Uint8Array, AbortController, AbortSignal, setTimeout, clearTimeout, performance });
const modules = new Map();
function read(url) {
  if (!modules.has(url.href)) modules.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
  return modules.get(url.href);
}
const entry = read(new URL('../../scripts/crawl-core.js', import.meta.url));
await entry.link((specifier, parent) => {
  assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `Non-portable import: ${specifier}`);
  return read(new URL(specifier, parent.identifier));
});
await entry.evaluate();
const probe = new SourceTextModule('export const absent = typeof process === "undefined" && typeof Buffer === "undefined" && typeof require === "undefined";', { context });
await probe.link(() => assert.fail('Unexpected import'));
await probe.evaluate();
assert.ok(probe.namespace.absent);
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url)));
for (const c of cases) {
  const expected = JSON.parse(readFileSync(new URL(c.expected, import.meta.url)));
  const network = fixtureNetwork(c);
  const run = () => entry.namespace.crawl(c.input, [], network.fetch, network.lookup, { now: () => new Date(FIXED_TIME) });
  if (expected.error) await assert.rejects(run(), { message: expected.error });
  else assert.equal(JSON.stringify(await run()), JSON.stringify(expected));
  assert.deepEqual(network.requests, c.requests);
}
console.log(`portable: ${cases.length} crawl cases`);
