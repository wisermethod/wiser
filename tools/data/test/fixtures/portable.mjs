// Resolve only this installed browser bundle, never a Node fallback.
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';
export async function loadPortable(entry) {
  const context = createContext({ TextEncoder, TextDecoder, Uint8Array, ArrayBuffer });
  const cache = new Map();
  const resolve = (specifier, parent) => {
    if (specifier === 'csv-parse/browser/esm/sync') return new URL('../../node_modules/csv-parse/dist/esm/sync.js', import.meta.url);
    if (!/^\.\.?\//.test(specifier)) throw new Error(`Non-portable import: ${specifier}`);
    return new URL(specifier, parent);
  };
  async function load(url) {
    if (!cache.has(url.href)) {
      const module = new SourceTextModule(readFileSync(url, 'utf8'), {
        context, identifier: url.href,
        importModuleDynamically: async (specifier, parent) => {
          const child = await load(resolve(specifier, parent.identifier));
          if (child.status === 'linked') await child.evaluate();
          return child;
        }
      });
      cache.set(url.href, module);
      await module.link((specifier, parent) => load(resolve(specifier, parent.identifier)));
    }
    return cache.get(url.href);
  }
  const module = await load(entry);
  await module.evaluate();
  return module.namespace;
}
