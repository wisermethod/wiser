import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
export async function portable(url, overrides = {}) {
  const context = createContext({ URL, Uint8Array, TextEncoder, TextDecoder, DataView, Map, Set, AbortController, ReadableStream, DecompressionStream, setTimeout, clearTimeout, ...overrides });
  const modules = new Map();
  const evaluations = new Map();
  function read(url) {
    if (!modules.has(url.href)) {
      modules.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), {
        context, identifier: url.href, importModuleDynamically: (specifier, parent) => evaluate(relative(specifier, parent))
      }));
    }
    return modules.get(url.href);
  }
  function relative(specifier, parent) {
    if (!specifier.startsWith('.')) throw new Error(`Non-portable import: ${specifier}`);
    return read(new URL(specifier, parent.identifier));
  }
  function evaluate(module) {
    if (!evaluations.has(module)) evaluations.set(module, (async () => {
      if (module.status === 'unlinked') await module.link(relative);
      if (module.status !== 'evaluated') await module.evaluate();
      return module;
    })());
    return evaluations.get(module);
  }
  const entry = await evaluate(read(url));
  return entry.namespace;
}
