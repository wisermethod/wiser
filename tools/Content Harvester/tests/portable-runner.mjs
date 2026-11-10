// Test-only host. Packages are resolved outside the context, then their actual
// ESM sources are linked there. Any Node import in the transitive graph fails.
import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readZip } from '../../lib/archive-core.js';
import { fixtureNetwork, fixedTime } from './fixtures/network.mjs';
const context = createContext({ URL, TextEncoder, TextDecoder, Uint8Array, performance, AbortController, AbortSignal:{timeout:AbortSignal.timeout}, setTimeout, clearTimeout, ReadableStream, DecompressionStream });
const hashId = async value => [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2,'0')).join('').slice(0,16);
const modules = new Map();
function load(url) {
  if (!url.startsWith('file:')) throw Error('Nonportable import: ' + url);
  if (!modules.has(url)) modules.set(url, new SourceTextModule(readFileSync(new URL(url), 'utf8'), {
    context, identifier: url,
    importModuleDynamically: async (specifier, parent) => {
      const mod = load(import.meta.resolve(specifier, parent.identifier));
      if (mod.status === 'unlinked') await mod.link(link);
      if (mod.status === 'linked') await mod.evaluate();
      return mod;
    }
  }));
  return modules.get(url);
}
function link(specifier, parent) { return load(import.meta.resolve(specifier, parent.identifier)); }
const core = load(new URL('../scripts/harvest-core.js', import.meta.url).href);
await core.link(link); await core.evaluate();
for (let i = 0; i < 4; i++) {
  const c = JSON.parse(readFileSync(new URL(`./fixtures/case-${i}.json`, import.meta.url))), network = fixtureNetwork(c);
  const result = await core.namespace.harvest({ command: 'run', request: c.request, outputDirectory: 'OUTPUT' }, [], network.fetch, network.lookup, { now: () => new Date(fixedTime), hashId });
  assert.equal(JSON.stringify(result.answer), JSON.stringify(c.expected.answer));
  const files = await readZip(result.files[0].bytes, { maxBytes: 4194304 });
  assert.deepEqual(Object.fromEntries(files.map(file => [file.name, new TextDecoder().decode(file.bytes)])), c.expected.files);
}
