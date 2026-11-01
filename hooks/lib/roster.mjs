import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const FAMILIES = [
  { family: 'skill', index: ['skills', 'AGENTS.md'], dir: 'skills', typed: 'SKILL.md' },
  { family: 'expert', index: ['experts', 'AGENTS.md'], dir: 'experts', typed: 'EXPERT.md' },
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
 * The `FORM seam` with no `ERR` rules of system/gates/classifier-seam.sh's
 * check.awk, followed by the routing opt-in. Its controls and checker are
 * shared by hooks.test.js. Any doubtful read leaves the primitive out.
 * @param {string} body
 * @returns {boolean}
 */
function declaresRouting(body) {
  // The gate's awk and JavaScript can read past a NUL differently. Reject it.
  if (body.includes('\0')) return false;
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
  let declaration = '';
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
      if (!inContext || !raw.startsWith('Classifier seam: ') || kraw !== 1 || ++declarations > 1) return false;
      declaration = raw.slice(17);
      if (/^[ \t]/.test(declaration) || !raw.endsWith('.')) return false;
    }
  }
  if (declarations !== 1) return false;
  const value = trim(declaration);
  if (value.slice(0, 4).toLowerCase() === 'none' || !value.endsWith('.')) return false;
  // The checker counts Else outside paired backticks, then locates it by
  // backtick parity. Preserve both checks; a doubtful delimiter is rejected.
  const outside = value.replace(/`[^`]*`/g, '');
  if (outside.split('Else: ').length !== 2) return false;
  let backticks = 0;
  let elseAt = -1;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '`') backticks++;
    if (backticks % 2 === 0 && value.startsWith('Else: ', i)) { elseAt = i; break; }
  }
  if (elseAt < 0) return false;
  const pre = value.slice(0, elseAt);
  const post = trim(value.slice(elseAt + 6)).replace(/\.$/, '');
  if (trim(post) === '') return false;
  // Both routable families must name hooks/, tools/ or gateway/ code in a
  // nonempty backtick span before Else, just as -v kind=skill|expert requires.
  const code = [...pre.matchAll(/`([^`]+)`/g)].some((span) => /^(hooks|tools|gateway)\//.test(span[1]));
  return code && /^routing\b/.test(pre);
}

/**
 * Index rows from skills/AGENTS.md, then experts/AGENTS.md. `body` is the
 * primitive's full text. Only a regular file declaring a clean routing seam
 * by the seam gate's rule, with no NUL or symlink below `root`, is kept.
 * A row outside its family is skipped. Tools are never read or offered.
 * A typed file that is missing, not regular, or unreadable throws, so the
 * hook routes nothing for that ask rather than using an incomplete roster.
 * @param {string} root
 * @returns {{ family: string, name: string, description: string, body: string }[]}
 */
export function buildRoster(root) {
  const rows = [];
  const rootReal = realpathSync(root);
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
      // Checked before reading, so a FIFO or a directory is never opened.
      if (!statSync(file).isFile()) throw new Error(`typed file is not a regular file: ${name}`);
      const body = readFileSync(file, 'utf8');
      // Only a file reached through no symlink below the root may be offered:
      // the gate reads a symlink as a link, never as the file.
      const direct = realpathSync(file) === join(rootReal, relative(root, file));
      if (!direct || !declaresRouting(body)) continue;
      // The classifier registers a primitive by its bare name, the directory,
      // and answers with that name; the index cell carries the typed file too.
      rows.push({ family: family.family, name: name.slice(0, -suffix.length), description, body });
    }
  }
  return rows;
}
