// A Worker-like module loader: the graph may use relative files only. Node's
// module loader, process, Buffer and filesystem are absent from the context.
import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
export async function portableModule(path) {
  const context = createContext({ URL, TextDecoder, TextEncoder, Uint8Array });
  const modules = new Map();
  function read(url) {
    if (!modules.has(url.href)) modules.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
    return modules.get(url.href);
  }
  const entry = read(pathToFileURL(path));
  await entry.link((specifier, parent) => {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) throw new Error(`Non-portable import: ${specifier}`);
    return read(new URL(specifier, parent.identifier));
  });
  await entry.evaluate();
  const probe = new SourceTextModule('export const absent = typeof process === "undefined" && typeof Buffer === "undefined" && typeof require === "undefined";', { context });
  await probe.link(() => { throw new Error('Unexpected import'); });
  await probe.evaluate();
  if (!probe.namespace.absent) throw new Error('Node globals leaked into portable context');
  return entry.namespace;
}
