/** Local disk adapter. The hosted service supplies these same pinned bytes. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const restore = 'Error: the carried reveal.js runtime is missing or altered. Restore this plugin copy; see TOOL.md Dependencies.';

// Return the checked bytes, so callers copy or serve precisely what was hashed.
export function carriedReveal(paths = null, includeFonts = false) {
  try {
    const manifest = JSON.parse(readFileSync(new URL('../vendor/manifest.json', import.meta.url)));
    if (manifest.package !== 'reveal.js' || !manifest.files?.length) throw new Error('invalid manifest');
    const rows = new Map();
    for (const row of manifest.files) {
      if (!/^reveal\.js\//.test(row.path) || row.path.split('/').some(part => !part || part === '.' || part === '..') || row.path.includes('\\') || rows.has(row.path.slice(10))) throw new Error('invalid path');
      rows.set(row.path.slice(10), row);
    }
    if (!rows.has('dist/reveal.js')) throw new Error('missing runtime');
    const selected = new Set(paths ?? rows.keys());
    if (includeFonts) for (const path of rows.keys()) {
      if (path.startsWith('dist/theme/fonts/')) selected.add(path);
    }
    const files = new Map();
    for (const path of selected) {
      const row = rows.get(path);
      if (!row) throw new Error('missing manifest row');
      const bytes = readFileSync(new URL('../vendor/' + row.path, import.meta.url));
      if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('altered carried file');
      files.set(path, bytes);
    }
    return files;
  } catch { throw new Error(restore); }
}
export function revealComplete() {
  try { carriedReveal(); return true; } catch { return false; }
}
export function revealAssets() {
  const names = { 'reveal.js': 'dist/reveal.js', 'reset.css': 'dist/reset.css', 'reveal.css': 'dist/reveal.css', 'highlight.js': 'plugin/highlight/highlight.js', 'notes.js': 'plugin/notes/notes.js' };
  const files = carriedReveal(Object.values(names));
  return Object.fromEntries(Object.entries(names).map(([name,path]) => {
    if (!files.has(path)) throw new Error(restore);
    return [name, new Uint8Array(files.get(path))];
  }));
}
