import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const FAMILIES = [
  { family: 'skill', index: ['skills', 'AGENTS.md'], dir: 'skills', typed: 'SKILL.md' },
  { family: 'expert', index: ['experts', 'AGENTS.md'], dir: 'experts', typed: 'EXPERT.md' },
  { family: 'tool', index: ['tools', 'AGENTS.md'], dir: 'tools', typed: 'TOOL.md' },
];

/**
 * @param {string} cell
 * @returns {string}
 */
function unquote(cell) {
  const text = cell.trim();
  if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) return text.slice(1, -1);
  return text;
}

/**
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function inside(parent, child) {
  const rel = relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Index rows from the three family AGENTS.md files. `body` is the primitive's
 * full text. A row whose file sits outside its family is skipped.
 * @param {string} root
 * @returns {{ family: string, name: string, description: string, body: string }[]}
 */
export function buildRoster(root) {
  const rows = [];
  for (const family of FAMILIES) {
    const indexPath = join(root, ...family.index);
    const text = readFileSync(indexPath, 'utf8');
    const base = resolve(root, family.dir);
    const suffix = `/${family.typed}`;
    for (const line of text.split(/\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 2) continue;
      const name = unquote(cells[0]);
      if (!name.endsWith(suffix)) continue;
      const description = cells[1];
      const file = resolve(base, name);
      if (!inside(base, file)) continue;
      const body = readFileSync(file, 'utf8');
      // The classifier registers a primitive by its bare name, the directory,
      // and answers with that name; the index cell carries the typed file too.
      rows.push({ family: family.family, name: name.slice(0, -suffix.length), description, body });
    }
  }
  return rows;
}
