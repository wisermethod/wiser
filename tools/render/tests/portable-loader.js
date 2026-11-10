import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
export async function portable(url, overrides = {}) {
  const context = createContext({ URL, Uint8Array, TextEncoder, TextDecoder, DataView, Map, Set, AbortController, ReadableStream, DecompressionStream, setTimeout, clearTimeout, ...overrides });
  const modules = new Map();
  function read(url) {
    if (!modules.has(url.href)) modules.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
    return modules.get(url.href);
  }
  const entry = read(url);
  await entry.link((specifier, parent) => {
    if (!specifier.startsWith('.')) throw new Error(`Non-portable import: ${specifier}`);
    return read(new URL(specifier, parent.identifier));
  });
  await entry.evaluate();
  return entry.namespace;
}
