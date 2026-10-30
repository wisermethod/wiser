// Opt-in index preparation. Only disposable print manuscripts receive markers.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function loadIndexTerms(path) {
  let rows;
  try { rows = parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`index.terms_file ${path}: ${error.message.split('\n')[0]}`); }
  const invalid = (message) => { throw new Error(`index.terms_file ${path}: ${message}`); };
  if (!Array.isArray(rows) || !rows.length) invalid('expected a nonempty YAML list of term mappings');
  const seen = new Set();
  const text = (value) => typeof value === 'string' && value.trim() && !/[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(value);
  // Braces and backslashes are markup in makeindex, rather than term text.
  const label = (value) => text(value) && !/[{}\\]/.test(value);
  return rows.map((row, i) => {
    const at = `entry ${i + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`${at} must be a mapping`);
    for (const key of Object.keys(row)) {
      if (!['term', 'match', 'scope', 'see'].includes(key)) invalid(`${at}: unknown key ${key}`);
    }
    if (!label(row.term)) invalid(`${at}.term must be nonempty single-line text without braces or backslashes`);
    const term = row.term.trim();
    const key = term.toLowerCase();
    if (seen.has(key)) invalid(`duplicate term: ${term}`);
    seen.add(key);
    const match = row.match ?? [term];
    if (!Array.isArray(match) || !match.length || !match.every(text)) invalid(`${at}.match must be a nonempty list of single-line phrases`);
    const scope = row.scope ?? 'chapters';
    if (!['first', 'chapters'].includes(scope)) invalid(`${at}.scope must be first or chapters`);
    if (row.see !== undefined && !label(row.see)) invalid(`${at}.see must be nonempty single-line text without braces or backslashes`);
    return { term, match: match.map((phrase) => phrase.trim()), scope, see: row.see?.trim() };
  });
}

const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function phrasePattern(phrases) {
  const alternatives = [...phrases].sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.split(/\s+/u).map(escapePattern).join('\\s+'));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
}

// Search original prose intervals, so inserted markers never become new hits.
// Offsets always refer to the unchanged input, including multiline phrases.
function eligibleSpans(text) {
  const blocked = [];
  let fence;
  const containers = [];
  let offset = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const body = line.replace(/^ {0,3}(?:>[ \t]?)+/, '').replace(/\t/g, '    ');
    const indent = /^ */.exec(body)[0].length;
    const list = /^ *(?:[-+*]|\d+[.)])[ \t]+/.exec(body);
    const footnote = /^ *\[\^[^\]]+\]:/.test(body);
    if (body.trim() && !fence) {
      while (containers.length && indent < containers.at(-1)) containers.pop();
      if (list) containers.push(list[0].length);
      else if (footnote) containers.push(indent + 4);
    }
    const margin = containers.at(-1) ?? 0;
    const content = list ? body.slice(list[0].length) : body.slice(Math.min(indent, margin));
    const token = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(content);
    if (fence) {
      blocked.push([offset, offset + line.length]);
      if (token && token[1][0] === fence[0] && token[1].length >= fence.length && !token[2].trim()) fence = undefined;
    } else if (token && (token[1][0] !== '`' || !token[2].includes('`'))) {
      fence = token[1];
      blocked.push([offset, offset + line.length]);
    } else if (!body.trim() || (!list && !footnote && indent >= margin + 4) ||
        /^(?: {0,3}#{1,6}[ \t]|\s*:::|\s*\[[^\]]+\]:)/.test(content)) {
      blocked.push([offset, offset + line.length]);
    }
    offset += line.length;
  }
  // Setext headings and their underlines.
  for (const match of text.matchAll(/^[^\n]+\r?\n {0,3}(?:=+|-+)[ \t]*\r?$/gm)) {
    blocked.push([match.index, match.index + match[0].length]);
  }
  for (const pattern of [
    /<!--[\s\S]*?-->/g, /<[^>]*>/g,
    /(?<!\\)(`+)[\s\S]*?\1(?!`)/g,
    /\b(?:https?:\/\/|www\.)[^\s<>]+/gi,
    /\{\{idx:[^{}]*(?:\{[^{}]*\}[^{}]*)?\}\}/g,
    /\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^{}]*\})*/g
  ]) {
    for (const match of text.matchAll(pattern)) blocked.push([match.index, match.index + match[0].length]);
  }
  // Link labels and destinations are excluded together. Delimiters may nest.
  // A bracket inside code or a comment cannot consume later prose as a link.
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '[' || text[i - 1] === '\\') continue;
    const protectedSpan = blocked.find(([a, b]) => a <= i && i < b);
    if (protectedSpan) { i = protectedSpan[1] - 1; continue; }
    const start = i;
    const balanced = (pos, open, close) => {
      let depth = 1;
      for (pos += 1; pos < text.length; pos += 1) {
        if (text[pos] === '\\') { pos += 1; continue; }
        if (text[pos] === open) depth += 1;
        if (text[pos] === close && --depth === 0) return pos + 1;
      }
      return text.length;
    };
    let end = balanced(i, '[', ']');
    // Also skip shortcut references; a bracketed label is not searched.
    if (text[end] === '(') end = balanced(end, '(', ')');
    else if (text[end] === '[') end = balanced(end, '[', ']');
    blocked.push([start, end]);
    i = end - 1;
  }
  const spans = [];
  let last = 0;
  for (const [a, b] of blocked.sort((a, b) => a[0] - b[0])) {
    if (last < a) spans.push([last, a]);
    last = Math.max(last, b);
  }
  if (last < text.length) spans.push([last, text.length]);
  return spans;
}

function indexLabel(text) {
  // Quote makeindex's operators, then protect TeX's printable special chars.
  return text.replace(/[!@|"]/g, '"$&').replace(/[$%&#_]/g, '\\$&')
    .replace(/\^/g, '\\textasciicircum{}').replace(/~/g, '\\textasciitilde{}');
}

function marker(row) {
  const entry = indexLabel(row.term) + (row.see ? `|see{${indexLabel(row.see)}}` : '');
  const command = `\\index{${entry}}`;
  const ticks = '`'.repeat(Math.max(0, ...[...command.matchAll(/`+/g)].map((m) => m[0].length)) + 1);
  // A Pandoc raw inline keeps smart punctuation and Markdown escapes out of the
  // index label. It prints no text and never enters the EPUB manuscript.
  return `${ticks}${command}${ticks}{=latex}`;
}

export function indexChapters(chapters, terms) {
  const seen = new Set();
  return chapters.map((chapter) => {
    const spans = eligibleSpans(chapter);
    const insertions = [];
    for (const row of terms) {
      if ((row.scope === 'first' || row.see) && seen.has(row.term)) continue;
      const pattern = phrasePattern(row.match);
      for (const [a, b] of spans) {
        const match = pattern.exec(chapter.slice(a, b));
        if (!match) continue;
        insertions.push([a + match.index + match[0].length, marker(row)]);
        seen.add(row.term);
        break;
      }
    }
    let result = chapter;
    for (const [offset, value] of insertions.sort((a, b) => b[0] - a[0])) {
      result = result.slice(0, offset) + value + result.slice(offset);
    }
    return result;
  }).join('\n\n');
}
