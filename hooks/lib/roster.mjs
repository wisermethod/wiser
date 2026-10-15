import { lstatSync, readFileSync } from 'node:fs';
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
 * The `FORM none` with no `ERR` subset of system/gates/classifier-seam.sh's
 * check.awk. Its controls and checker are shared by hooks.test.js. Any other
 * form or any error keeps the primitive offered; this decides nothing else.
 * @param {string} body
 * @returns {boolean}
 */
function declaresNoClassifierSeam(body) {
  const keywords = (text) => (text.match(/classifier seam:/gi) || []).length;
  const trim = (text) => text.replace(/^[ \t]+|[ \t]+$/g, '');
  const runLength = (text, char) => {
    let n = 0;
    while (text[n] === char) n++;
    return n;
  };
  let comment = false;
  let fenceChar = '';
  let fenceLength = 0;
  let inContext = false;
  let declarations = 0;
  for (const line of body.split('\n')) {
    const raw = line.replace(/\r$/, '');
    const kraw = keywords(raw);
    const text = raw.replace(/^ {0,3}/, '');
    if (fenceChar) {
      if (kraw > 0) return false;
      const n = runLength(text, fenceChar);
      if (n >= fenceLength && trim(text.slice(n)) === '') fenceChar = '';
      continue;
    }
    const startedInComment = comment;
    if (!startedInComment && (text[0] === '`' || text[0] === '~')) {
      const n = runLength(text, text[0]);
      if (n >= 3 && !(text[0] === '`' && text.slice(n).includes('`'))) {
        if (kraw > 0) return false;
        fenceChar = text[0];
        fenceLength = n;
        continue;
      }
    }
    // As in the gate, comment state is read before headings, while fence
    // openers above and heading names below use the raw line.
    let commented = '';
    let hasComment = startedInComment;
    let rest = raw;
    while (rest.length > 0) {
      if (comment) {
        const i = rest.indexOf('-->');
        if (i < 0) { commented += ` ${rest}`; break; }
        commented += ` ${rest.slice(0, i)}`;
        rest = rest.slice(i + 3);
        comment = false;
        hasComment = true;
        continue;
      }
      const i = rest.indexOf('<!--');
      if (i < 0) break;
      hasComment = true;
      rest = rest.slice(i + 4);
      comment = true;
    }
    const kcm = keywords(commented);
    if (kcm > 0) return false;
    if (!startedInComment && raw.startsWith('## ')) {
      const i = raw.indexOf('<!--');
      const heading = (i < 0 ? raw : raw.slice(0, i)).replace(/[ #\t]*$/, '');
      inContext = heading === '## Context';
      if (kraw > kcm) return false;
      continue;
    }
    if (hasComment) {
      if (kraw > kcm) return false;
      continue;
    }
    if (kraw > 0) {
      if (!inContext || raw !== 'Classifier seam: none.' || ++declarations > 1) return false;
    }
  }
  return declarations === 1;
}

/**
 * Index rows from the three family AGENTS.md files. `body` is the primitive's
 * full text, or empty when unreadable. A row whose file sits outside its family
 * is skipped, as is a regular file declaring none by the seam gate's rule.
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
      let body = '';
      let regular = false;
      try {
        regular = lstatSync(file).isFile();
        body = readFileSync(file, 'utf8');
      } catch {
        // An unreadable file is no basis for excluding its index row.
      }
      if (regular && declaresNoClassifierSeam(body)) continue;
      // The classifier registers a primitive by its bare name, the directory,
      // and answers with that name; the index cell carries the typed file too.
      rows.push({ family: family.family, name: name.slice(0, -suffix.length), description, body });
    }
  }
  return rows;
}
