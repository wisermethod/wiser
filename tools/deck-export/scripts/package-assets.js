/** Local disk adapter. The hosted service supplies these same pinned bytes. */
import { readFileSync } from 'node:fs';
export function revealAssets() {
  const names = { 'reveal.js': 'dist/reveal.js', 'reset.css': 'dist/reset.css', 'reveal.css': 'dist/reveal.css', 'highlight.js': 'plugin/highlight/highlight.js', 'notes.js': 'plugin/notes/notes.js' };
  return Object.fromEntries(Object.entries(names).map(([name,path]) => [name,new Uint8Array(readFileSync(new URL('../node_modules/reveal.js/'+path, import.meta.url)))]));
}
