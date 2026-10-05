/**
 * How copy-check reads markdown. The typed file is the definition a caller
 * meets; this module is that definition in code.
 *
 * Blocks, units, sentence breaks, quotations, and reproduced titles are
 * computed here so every subcommand uses one reading. A block is the visible
 * characters of one frontmatter value, heading, list item, table cell, or
 * paragraph, each with its raw-file offset. Quotation pairing stays inside
 * one block.
 */

const LQ = String.fromCodePoint(0x201C);
const RQ = String.fromCodePoint(0x201D);
const LS = String.fromCodePoint(0x2018);
const RS = String.fromCodePoint(0x2019);

export function codePoints(text) {
  return Array.from(text).length;
}

export function straighten(text) {
  return text.split(LQ).join('"').split(RQ).join('"').split(LS).join("'").split(RS).join("'");
}

export function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Opening-word key: quote-straightened, whitespace-collapsed, one surrounding quote pair removed. */
export function matchKey(text) {
  let value = collapseWhitespace(straighten(text));
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = collapseWhitespace(value.slice(1, -1));
  }
  return value;
}

export function wordCount(text) {
  const key = matchKey(text);
  if (!key) return 0;
  return key.split(' ').length;
}

export function prefixMatch(unitText, sentenceText) {
  const unit = matchKey(unitText);
  const sentence = matchKey(sentenceText);
  if (!sentence || !unit.startsWith(sentence)) return false;
  if (unit.length === sentence.length) return true;
  const next = unit.codePointAt(sentence.length);
  return !/[\p{L}\p{N}]/u.test(String.fromCodePoint(next));
}

export function splitRow(line) {
  const spans = splitRowSpans(line);
  if (!spans) return null;
  return spans.map((cell) => cell.text);
}

export function splitRowSpans(line) {
  const lead = line.length - line.trimStart().length;
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = [];
  let current = '';
  let contentStart = null;
  let seen = false;

  for (let index = 1; index < trimmed.length; index += 1) {
    const ch = trimmed[index];
    const abs = lead + index;
    if (ch === '\\' && trimmed[index + 1] === '|') {
      if (!seen) contentStart = abs + 1;
      seen = true;
      current += '|';
      index += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(finishCell(current, contentStart, abs));
      current = '';
      contentStart = null;
      seen = false;
      continue;
    }
    if (!seen && ch !== ' ' && ch !== '\t') {
      contentStart = abs;
      seen = true;
    }
    current += ch;
  }
  if (current.trim() !== '') cells.push(finishCell(current, contentStart, lead + trimmed.length));
  return cells;
}

function finishCell(raw, contentStart, end) {
  const text = raw.trim();
  return { text, start: contentStart, end };
}

export function isDelimiterRow(line) {
  const cells = splitRow(line);
  return Boolean(cells && cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

export function tokens(text) {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
  if (!cleaned) return [];
  return cleaned.split(/\s+/);
}

export function windows(words, size) {
  const out = [];
  for (let index = 0; index + size <= words.length; index += 1) {
    out.push(words.slice(index, index + size).join(' '));
  }
  return out;
}

function pushUnits(target, raw, fileStart) {
  for (let index = 0; index < raw.length; index += 1) {
    target.push({ c: raw[index], at: fileStart + index });
  }
}

function charsToText(chars) {
  return chars.map((item) => item.c).join('');
}

function mapBreaks(chars) {
  return chars.map((item) => (item.c === '\n' || item.c === '\r' ? { c: ' ', at: item.at } : item));
}

function applyLinks(chars) {
  const text = charsToText(chars);
  const pattern = /!?\[([^\]]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g;
  const out = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    out.push(...chars.slice(last, match.index));
    const innerStart = match.index + (text[match.index] === '!' ? 2 : 1);
    out.push(...chars.slice(innerStart, innerStart + match[1].length));
    last = match.index + match[0].length;
  }
  out.push(...chars.slice(last));
  return out;
}

function applyEmphasis(chars) {
  let current = chars;
  for (let guard = 0; guard < 40; guard += 1) {
    const text = charsToText(current);
    const match = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_/.exec(text);
    if (!match) return current;
    const open = match[0].startsWith('**') || match[0].startsWith('__') ? 2 : 1;
    const close = open;
    const start = match.index;
    const end = match.index + match[0].length;
    current = current.slice(0, start).concat(current.slice(start + open, end - close), current.slice(end));
  }
  return current;
}

function trimChars(chars) {
  let start = 0;
  let end = chars.length;
  while (start < end && /\s/.test(chars[start].c)) start += 1;
  while (end > start && /\s/.test(chars[end - 1].c)) end -= 1;
  return chars.slice(start, end);
}

function normalize(chars) {
  return trimChars(applyEmphasis(applyLinks(mapBreaks(chars))));
}

function unitFrom(chars, kind) {
  const trimmed = normalize(chars);
  if (trimmed.length === 0) return null;
  return {
    text: charsToText(trimmed),
    offsets: trimmed.map((item) => item.at),
    kind
  };
}

function lineEnds(text) {
  const lines = [];
  let offset = 0;
  const parts = text.split('\n');
  for (let index = 0; index < parts.length; index += 1) {
    lines.push({ text: parts[index], start: offset, number: index + 1 });
    offset += parts[index].length + (index < parts.length - 1 ? 1 : 0);
  }
  return lines;
}

function rawOf(line) {
  return line.text.endsWith('\r') ? line.text.slice(0, -1) : line.text;
}

function fenceOpen(raw) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(raw);
  if (!match) return null;
  const mark = match[2];
  if (mark[0] === '`' && mark.slice(match[2].length).includes('`')) return null;
  if (mark[0] === '`' && match[3].includes('`')) return null;
  return { char: mark[0], length: mark.length };
}

function fenceClose(raw, open) {
  const match = new RegExp(`^ {0,3}${open.char}{${open.length},}\\s*$`).exec(raw);
  return Boolean(match);
}

function headingOf(raw) {
  const match = /^( {0,3})(#{1,6})\s+(\S.*)$/.exec(raw);
  if (!match) return null;
  const content = match[3].replace(/\s+#+\s*$/, '');
  const lead = match[1].length + match[2].length + 1;
  const spaces = raw.slice(match[1].length + match[2].length).match(/^\s*/)[0].length;
  return { content, contentAt: match[1].length + match[2].length + spaces, lead };
}

function listOf(raw) {
  const match = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(raw);
  if (!match) return null;
  return { indent: match[1].length, content: match[3], contentAt: match[1].length + match[2].length + raw.slice(match[1].length + match[2].length).match(/^\s*/)[0].length };
}

function isThematic(raw) {
  return /^( {0,3})([-*_])\2{2,}\s*$/.test(raw);
}

function isBlank(raw) {
  return raw.trim() === '';
}

const PLAIN_REFUSED_START = new Set(['|', '>', "'", '[', '{', '&', '*', '!', '%', '@', '`']);

function refuseFrontmatter(key, lineNumber) {
  throw new Error(`Error: frontmatter ${key} at line ${lineNumber} is not a single-line value, so it cannot be read as one unit. Write ${key} on one line.`);
}

function decodeQuoted(content, contentAt, key, lineNumber) {
  const chars = [];
  let index = 1;
  while (index < content.length) {
    const ch = content[index];
    if (ch === '\\') {
      const next = content[index + 1];
      if (next !== '"' && next !== '\\') refuseFrontmatter(key, lineNumber);
      chars.push({ c: next, at: contentAt + index + 1 });
      index += 2;
      continue;
    }
    if (ch === '"') {
      const rest = content.slice(index + 1);
      if (!/^ *$/.test(rest)) refuseFrontmatter(key, lineNumber);
      if (chars.length === 0 || chars.every((item) => item.c === ' ' || item.c === '\t')) refuseFrontmatter(key, lineNumber);
      return chars;
    }
    chars.push({ c: ch, at: contentAt + index });
    index += 1;
  }
  refuseFrontmatter(key, lineNumber);
}

/**
 * `title` and `description` are a plain scalar or one complete double-quoted
 * string. Anything else, including an indented line before the next top-level
 * key, is refused: a value the reading cannot take whole would go unchecked.
 * Returns the decoded characters, quote delimiters excluded.
 */
function readFrontmatterValue(raw, lineStart, lineNumber) {
  const match = /^(title|description):(.*)$/.exec(raw);
  const key = match[1];
  const after = match[2];
  const lead = /^[ \t]*/.exec(after)[0].length;
  const content = after.slice(lead);
  const contentAt = lineStart + key.length + 1 + lead;
  if (content.trim() === '') refuseFrontmatter(key, lineNumber);
  if (content.startsWith('"')) return { key, chars: decodeQuoted(content, contentAt, key, lineNumber) };
  if (PLAIN_REFUSED_START.has(content[0]) || after.includes(' #')) refuseFrontmatter(key, lineNumber);
  const value = content.trimEnd();
  const chars = [];
  pushUnits(chars, value, contentAt);
  return { key, chars };
}

function assertSingleLineValue(lines, cursor, close) {
  const raw = rawOf(lines[cursor]);
  const key = /^(title|description):/.exec(raw)[1];
  const lineNumber = lines[cursor].number;
  for (let look = cursor + 1; look < close; look += 1) {
    const next = rawOf(lines[look]);
    if (next.trim() === '') continue;
    const first = next[0];
    if (first !== ' ' && first !== '\t' && first !== '#') return;
    if (first === ' ' || first === '\t') refuseFrontmatter(key, lineNumber);
  }
}

export function positionAt(text, offset) {
  let line = 1;
  let column = 1;
  const end = Math.min(offset, text.length);
  for (let index = 0; index < end;) {
    const point = text.codePointAt(index);
    const width = point > 0xFFFF ? 2 : 1;
    if (point === 0x0A) {
      line += 1;
      column = 1;
    } else if (point !== 0x0D) {
      column += 1;
    }
    index += width;
  }
  return { line, column };
}

function sentenceUnits(chars) {
  const text = charsToText(chars);
  const pattern = /[.!?](?=\s+(?:[\p{Lu}\p{Nd}"'“”‘’(\[{]))/gu;
  const units = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const end = match.index + 1;
    const piece = chars.slice(start, end);
    const unit = unitFrom(piece, 'sentence');
    if (unit) units.push(unit);
    let next = end;
    while (next < text.length && /\s/.test(text[next])) next += 1;
    start = next;
  }
  const tail = chars.slice(start);
  const unit = unitFrom(tail, 'sentence');
  if (unit) units.push(unit);
  return units;
}

function attachPositions(units, text) {
  return units.filter(Boolean).map((unit) => {
    const at = unit.offsets[0];
    const position = positionAt(text, at);
    return { ...unit, line: position.line, column: position.column };
  });
}

function openSection(state, name) {
  const section = { name, index: state.next };
  state.next += 1;
  return section;
}

function pushBlock(blocks, units, blockKind, unitKind, rawChars, section, asSentences) {
  const visible = normalize(rawChars);
  if (visible.length === 0) return;
  blocks.push({ kind: blockKind, section: section.name, sectionIndex: section.index, chars: visible });
  const produced = asSentences ? sentenceUnits(visible) : [unitFrom(visible, unitKind)].filter(Boolean);
  for (const unit of produced) {
    units.push({ ...unit, section: section.name, sectionIndex: section.index });
  }
}

/**
 * Parse a copy file.
 * `blocks` are the visible-copy blocks, each character carrying its raw-file
 * offset. `units` are those blocks split where the reading splits them.
 * `exemptions` pairs quotations inside one block and names link text.
 */
export function parseDocument(fileText) {
  let text = fileText;
  let bomStripped = false;
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    bomStripped = true;
  }

  const characters = codePoints(text);
  const lines = lineEnds(text);
  const units = [];
  const blocks = [];
  const fenceRanges = [];
  let skippedBlocks = 0;
  let skippedCharacters = 0;
  let index = 0;
  const sections = { next: 0 };
  let current = null;

  if (lines.length > 0 && rawOf(lines[0]) === '---') {
    let close = -1;
    for (let cursor = 1; cursor < lines.length; cursor += 1) {
      if (rawOf(lines[cursor]) === '---') {
        close = cursor;
        break;
      }
    }
    if (close !== -1) {
      let frontmatter = null;
      for (let cursor = 1; cursor < close; cursor += 1) {
        const raw = rawOf(lines[cursor]);
        if (!/^(title|description):/.test(raw)) continue;
        const value = readFrontmatterValue(raw, lines[cursor].start, lines[cursor].number);
        assertSingleLineValue(lines, cursor, close);
        if (!frontmatter) frontmatter = openSection(sections, 'frontmatter');
        pushBlock(blocks, units, 'frontmatter', value.key, value.chars, frontmatter, false);
      }
      index = close + 1;
    }
  }

  function ensureBody() {
    if (!current) current = openSection(sections, 'preamble');
    return current;
  }

  while (index < lines.length) {
    const line = lines[index];
    const raw = rawOf(line);
    const open = fenceOpen(raw);
    if (open) {
      let end = index + 1;
      while (end < lines.length && !fenceClose(rawOf(lines[end]), open)) end += 1;
      const closed = end < lines.length;
      const blockEnd = closed ? lines[end].start + lines[end].text.length : text.length;
      fenceRanges.push([line.start, blockEnd]);
      skippedBlocks += 1;
      skippedCharacters += codePoints(text.slice(line.start, Math.min(blockEnd, text.length)));
      index = closed ? end + 1 : lines.length;
      continue;
    }

    if (isBlank(raw)) {
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && splitRow(raw) && isDelimiterRow(rawOf(lines[index + 1]))) {
      let cursor = index + 2;
      while (cursor < lines.length && splitRow(rawOf(lines[cursor])) && !fenceOpen(rawOf(lines[cursor]))) {
        cursor += 1;
      }
      const header = line;
      const body = [];
      for (let cursorBody = index + 2; cursorBody < cursor; cursorBody += 1) body.push(lines[cursorBody]);
      const section = ensureBody();
      for (const entry of [header, ...body]) {
        const spans = splitRowSpans(rawOf(entry)) || [];
        for (const cell of spans) {
          const base = entry.start + (cell.start ?? cell.end ?? 0);
          if (!cell.text) continue;
          const chars = [];
          pushUnits(chars, cell.text, base);
          pushBlock(blocks, units, 'cell', 'cell', chars, section, false);
        }
      }
      index = cursor;
      continue;
    }

    const heading = headingOf(raw);
    if (heading) {
      const chars = [];
      pushUnits(chars, heading.content, line.start + heading.contentAt);
      const visible = normalize(chars);
      const name = visible.length ? charsToText(visible) : heading.content.trim();
      current = openSection(sections, name);
      if (visible.length) {
        blocks.push({ kind: 'heading', section: name, sectionIndex: current.index, chars: visible });
        const unit = unitFrom(visible, 'heading');
        if (unit) units.push({ ...unit, section: name, sectionIndex: current.index });
      }
      index += 1;
      continue;
    }

    const list = listOf(raw);
    if (list) {
      const section = ensureBody();
      while (index < lines.length) {
        const itemLine = lines[index];
        const itemRaw = rawOf(itemLine);
        const item = listOf(itemRaw);
        if (!item) break;
        const chars = [];
        pushUnits(chars, item.content, itemLine.start + item.contentAt);
        index += 1;
        while (index < lines.length) {
          const next = lines[index];
          const nextRaw = rawOf(next);
          if (isBlank(nextRaw) || listOf(nextRaw) || headingOf(nextRaw) || fenceOpen(nextRaw) || isThematic(nextRaw)) break;
          if (splitRow(nextRaw) && index + 1 < lines.length && isDelimiterRow(rawOf(lines[index + 1]))) break;
          chars.push({ c: ' ', at: itemLine.start + itemLine.text.length });
          const indent = nextRaw.match(/^\s*/)[0].length;
          pushUnits(chars, nextRaw.slice(indent), next.start + indent);
          index += 1;
        }
        pushBlock(blocks, units, 'list', 'list', chars, section, false);
      }
      continue;
    }

    if (isThematic(raw)) {
      index += 1;
      continue;
    }

    const paraStart = index;
    const chars = [];
    while (index < lines.length) {
      const currentLine = lines[index];
      const currentRaw = rawOf(currentLine);
      if (index !== paraStart && (isBlank(currentRaw) || headingOf(currentRaw) || listOf(currentRaw) || fenceOpen(currentRaw) || isThematic(currentRaw))) break;
      if (index !== paraStart && splitRow(currentRaw) && index + 1 < lines.length && isDelimiterRow(rawOf(lines[index + 1]))) break;
      if (chars.length > 0) chars.push({ c: '\n', at: lines[index - 1].start + lines[index - 1].text.length });
      pushUnits(chars, currentRaw, currentLine.start);
      index += 1;
    }
    pushBlock(blocks, units, 'paragraph', 'sentence', chars, ensureBody(), true);
  }

  return {
    text,
    characters,
    bomStripped,
    blocks,
    units: attachPositions(units, text),
    exemptions: {
      quotations: blocks.flatMap((block) => pairBlock(block.chars)),
      titles: titleRanges(text, fenceRanges)
    },
    fenceRanges,
    skippedFences: { blocks: skippedBlocks, characters: skippedCharacters }
  };
}

function mergeRanges(ranges) {
  const sorted = [...ranges].filter((range) => range[1] > range[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (!last || range[0] > last[1]) out.push([range[0], range[1]]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return out;
}

function inRanges(index, ranges) {
  return ranges.some((range) => index >= range[0] && index < range[1]);
}

/** Interiors of quotations inside one block. An opener with no closer is not a quotation. */
function pairBlock(chars) {
  const quotations = [];
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index].c;
    let closer = null;
    if (ch === '"') closer = '"';
    else if (ch === LQ) closer = RQ;
    else continue;
    let end = -1;
    for (let cursor = index + 1; cursor < chars.length; cursor += 1) {
      if (chars[cursor].c === closer) {
        end = cursor;
        break;
      }
    }
    if (end === -1) continue;
    const start = chars[index].at + chars[index].c.length;
    const stop = chars[end].at;
    if (stop > start) quotations.push([start, stop]);
    index = end;
  }
  return quotations;
}

/** Link and image text. Fence interiors are not titles. The URL is not the text. */
function titleRanges(text, fenceRanges = []) {
  const titles = [];
  const fences = mergeRanges(fenceRanges);
  const linkPattern = /!?\[([^\]]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g;
  for (const match of text.matchAll(linkPattern)) {
    if (inRanges(match.index, fences)) continue;
    const innerStart = match.index + (text[match.index] === '!' ? 2 : 1);
    titles.push([innerStart, innerStart + match[1].length]);
  }
  return titles;
}

/** Blank quotation characters in one unit and count the words that blanking removes. */
export function blankQuoted(unit, ranges) {
  const chars = [];
  let excluded = 0;
  let run = '';
  function flush() {
    if (!run) return;
    excluded += tokens(run).length;
    run = '';
  }
  for (let index = 0; index < unit.text.length; index += 1) {
    if (inRanges(unit.offsets[index], ranges)) {
      chars.push(' ');
      run += unit.text[index];
    } else {
      flush();
      chars.push(unit.text[index]);
    }
  }
  flush();
  return { text: chars.join(''), excluded };
}

export function contextAt(index, ranges) {
  if (inRanges(index, ranges.quotations)) return 'quotation';
  if (inRanges(index, ranges.titles)) return 'title';
  return 'text';
}

export function blankRanges(text, ranges) {
  if (ranges.length === 0) return text;
  const chars = text.split('');
  for (const [start, end] of ranges) {
    for (let index = start; index < end && index < chars.length; index += 1) chars[index] = ' ';
  }
  return chars.join('');
}

export function excludedWordCount(text, ranges) {
  let count = 0;
  for (const [start, end] of mergeRanges(ranges)) count += tokens(text.slice(start, end)).length;
  return count;
}

export { mergeRanges };
