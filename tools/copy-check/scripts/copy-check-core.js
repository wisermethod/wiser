/**
 * copy-check: count and match page copy against a ledger, a fact map,
 * a patterns file, and a corpus. Node built-ins only. Nothing is written.
 *
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { fail } from './lib/paths.js';
import { screenSource } from './lib/paths.js';
import {
  blankQuoted,
  collapseWhitespace,
  codePoints,
  contextAt,
  isDelimiterRow,
  matchKey,
  parseDocument,
  positionAt,
  prefixMatch,
  splitRow,
  tokens,
  windows,
  wordCount
} from './lib/document.js';

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const PLANT_SENTENCE = 'Copycheckcontrol plant sentence one.';

const USAGE = `copy-check: count and match page copy. It judges nothing.

Usage:
  node scripts/copy-check.js help
  node scripts/copy-check.js facts --copy <file> --ledger <file> --fact-map <file> --allow <codes>
  node scripts/copy-check.js prohibited --copy <file> --patterns <file>
  node scripts/copy-check.js overlap --copy <file> --corpus <dir> [--n <words>]
  node scripts/copy-check.js dashes --copy <file>

Commands:
  facts        Map each copy unit to the fact map and the ledger
  prohibited   Report every pattern match, including inside a quotation or a title
  overlap      Report shared word sequences between the copy and a corpus
  dashes       Count U+2014 and U+2013 by code point
  help         Print this message

Options:
  --copy <file>        Markdown copy. Absolute path. Required for every check.
  --ledger <file>      Claims ledger. Absolute path. facts.
  --fact-map <file>    Fact map. Absolute path. facts.
  --allow <codes>      Comma-separated Use codes counted as usable. Required for facts.
  --patterns <file>    Patterns JSON. Absolute path. prohibited.
  --corpus <dir>       Directory of .md and .txt files. Absolute path. overlap.
  --n <words>          Sequence length for overlap. Whole number, 3 to 12. Default 5.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name like any other unknown flag.

A check that runs prints one JSON object to stdout and exits 0, whether or not pass is true. A refusal, an unknown flag, or a control that does not fire prints to stderr, leaves stdout empty, and exits 1. Nothing is written.`;

const HELP = {
  facts: `copy-check facts: map each copy unit to the fact map and the ledger.

Usage:
  node scripts/copy-check.js facts --copy <file> --ledger <file> --fact-map <file> --allow <codes>

Options:
  --copy <file>        Markdown copy. Absolute path. Required.
  --ledger <file>      Claims ledger. Absolute path. Required.
  --fact-map <file>    Fact map. Absolute path. Required.
  --allow <codes>      Comma-separated Use codes counted as usable. Required.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name like any other unknown flag.`,
  prohibited: `copy-check prohibited: report every pattern match. Nothing is exempt.

Usage:
  node scripts/copy-check.js prohibited --copy <file> --patterns <file>

Options:
  --copy <file>        Markdown copy. Absolute path. Required.
  --patterns <file>    Patterns JSON. Absolute path. Required.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name like any other unknown flag.`,
  overlap: `copy-check overlap: report shared word sequences. The caller judges which are identifiers.

Usage:
  node scripts/copy-check.js overlap --copy <file> --corpus <dir> [--n <words>]

Options:
  --copy <file>        Markdown copy. Absolute path. Required.
  --corpus <dir>       Directory of .md and .txt files, read recursively. Absolute path. Required.
  --n <words>          Sequence length. Whole number, 3 to 12. Default 5.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name like any other unknown flag.`,
  dashes: `copy-check dashes: count U+2014 and U+2013 by code point.

Usage:
  node scripts/copy-check.js dashes --copy <file>

Options:
  --copy <file>        Markdown copy. Absolute path. Required.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name like any other unknown flag.`
};

const VALUE_FLAGS = {
  facts: ['--copy', '--ledger', '--fact-map', '--allow'],
  prohibited: ['--copy', '--patterns'],
  overlap: ['--copy', '--corpus', '--n'],
  dashes: ['--copy']
};

function scan(argv, bare, valueFlags) {
  const valueSet = new Set(valueFlags);
  const positions = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    if (valueSet.has(argv[index])) positions.add(index + 1);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    const token = argv[index];
    if (token.startsWith('-') && !valueSet.has(token) && !bare.has(token)) {
      fail(`Error: unknown option "${token}". Run "node scripts/copy-check.js help" for usage.`);
    }
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    const token = argv[index];
    if (!token.startsWith('-')) {
      fail(`Error: unexpected argument "${token}". Every value belongs to an option here. Run "node scripts/copy-check.js help" for usage.`);
    }
  }
  const values = {};
  for (const flag of valueFlags) {
    const indexes = [];
    for (let index = 0; index < argv.length; index += 1) {
      if (argv[index] === flag) indexes.push(index);
    }
    if (indexes.length > 1) {
      fail(`Error: ${flag} was given more than once and takes one value. Run "node scripts/copy-check.js help" for usage.`);
    }
    if (indexes.length === 0) continue;
    const value = argv[indexes[0] + 1];
    if (value === undefined || value.startsWith('-')) {
      fail(`Error: ${flag} needs a value. Run "node scripts/copy-check.js help" for usage.`);
    }
    values[flag] = value;
  }
  return values;
}

function parseArgs(argv) {
  const first = argv[0];
  if (argv.length === 0 || first === 'help' || first === '--help' || first === '-h') {
    const rest = argv.length === 0 ? [] : argv.slice(1);
    scan(rest, new Set(['--help', '-h']), []);
    return { help: 'all' };
  }
  if (typeof first === 'string' && first.startsWith('-')) {
    scan(argv, new Set(['--help', '-h']), []);
    return { help: 'all' };
  }
  if (!VALUE_FLAGS[first]) {
    fail(`Error: unknown command "${first}". Run "node scripts/copy-check.js help" for usage.`);
  }
  const rest = argv.slice(1);
  if (rest.includes('help') || rest.includes('--help') || rest.includes('-h')) {
    scan(rest.filter((token) => token !== 'help'), new Set(['--help', '-h', ...VALUE_FLAGS[first]]), VALUE_FLAGS[first]);
    return { help: first };
  }
  return { help: null, command: first, values: scan(rest, new Set(), VALUE_FLAGS[first]) };
}

function requireFlag(values, flag) {
  if (!values[flag]) fail(`Error: ${flag} is required. Run "node scripts/copy-check.js help" for usage.`);
  return values[flag];
}

function readUtf8(filePath, label) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    fail(`Error: ${label} at ${filePath} could not be read. Pass an absolute path to a readable file.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    fail(`Error: ${label} at ${filePath} is not valid UTF-8. Pass a UTF-8 file.`);
  }
}

function parseTables(text) {
  const lines = text.split('\n');
  const tables = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].endsWith('\r') ? lines[index].slice(0, -1) : lines[index];
    const next = lines[index + 1];
    if (next === undefined) continue;
    const nextRaw = next.endsWith('\r') ? next.slice(0, -1) : next;
    if (!splitRow(line) || !isDelimiterRow(nextRaw)) continue;
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const raw = lines[cursor].endsWith('\r') ? lines[cursor].slice(0, -1) : lines[cursor];
      if (!splitRow(raw) || isDelimiterRow(raw)) break;
      rows.push({ line: cursor + 1, cells: splitRow(raw) });
      cursor += 1;
    }
    tables.push({ line: index + 1, header: splitRow(line), rows });
    index = cursor - 1;
  }
  return tables;
}

function useCode(cell) {
  const stripped = cell.replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const match = /^[\p{L}\p{N}-]+/u.exec(stripped);
  return match ? match[0] : '';
}

const LEDGER_COLUMNS = ['ID', 'Claim', 'Source', 'Register / label', 'Use'];

function loadLedger(text, label) {
  const tables = parseTables(text);
  const ignoredTables = [];
  const rows = [];
  const seen = new Map();
  let ledgerTables = 0;
  for (const table of tables) {
    if (!table.header.some((cell) => cell === 'ID')) {
      ignoredTables.push({ file: 'ledger', line: table.line, header: table.header });
      continue;
    }
    ledgerTables += 1;
    const ordered = table.header.length === LEDGER_COLUMNS.length
      && LEDGER_COLUMNS.every((name, index) => table.header[index] === name);
    if (!ordered) {
      fail(`Error: ledger table at line ${table.line} must have columns ID, Claim, Source, Register / label, Use, in that order. Fix the header or remove the table.`);
    }
    for (const row of table.rows) {
      if (row.cells.length !== LEDGER_COLUMNS.length) {
        fail(`Error: ledger row at line ${row.line} has ${row.cells.length} cells; the table has ${LEDGER_COLUMNS.length}. Give the row one cell per column.`);
      }
      const id = row.cells[0].trim();
      if (!id) fail(`Error: ledger row at line ${row.line} has an empty ID. Give the row a token with no spaces.`);
      if (/\s/.test(id)) fail(`Error: ledger ID at line ${row.line} is not a single token: "${id}". Use a token with no spaces.`);
      if (seen.has(id)) {
        fail(`Error: ledger ID "${id}" is duplicated at line ${row.line} (first at line ${seen.get(id)}). Make every ID unique.`);
      }
      seen.set(id, row.line);
      const code = useCode(row.cells[4]);
      if (!code) fail(`Error: ledger row at line ${row.line} has no Use code at the start of its Use cell. Start the cell with the code.`);
      rows.push({ id, code, line: row.line });
    }
  }
  if (ledgerTables === 0) {
    fail(`Error: ${label} has no ledger table. A ledger table's header has a cell exactly ID and the five columns in order.`);
  }
  return { rows, ignoredTables };
}

const MAP_COLUMNS = ['#', 'Sentence', 'Rows', 'Note'];

function loadFactMap(text, label) {
  const tables = parseTables(text);
  const ignoredTables = [];
  let map = null;
  for (const table of tables) {
    const exact = table.header.length === MAP_COLUMNS.length
      && MAP_COLUMNS.every((name, index) => table.header[index] === name);
    const candidate = table.header.some((cell) => MAP_COLUMNS.includes(cell));
    if (exact) {
      if (map) fail(`Error: ${label} has a second map table at line ${table.line}. Keep one map table.`);
      map = table;
      continue;
    }
    if (candidate) {
      fail(`Error: fact-map header at line ${table.line} is malformed. The header row must be exactly #, Sentence, Rows, Note, in that order.`);
    }
    ignoredTables.push({ file: 'fact-map', line: table.line, header: table.header });
  }
  if (!map) {
    fail(`Error: ${label} has no map table. The header row must be exactly #, Sentence, Rows, Note.`);
  }
  const entries = [];
  for (const row of map.rows) {
    if (row.cells.length !== MAP_COLUMNS.length) {
      fail(`Error: fact-map row at line ${row.line} has ${row.cells.length} cells; the table has 4. Give the row one cell per column.`);
    }
    if (wordCount(row.cells[1]) === 0) {
      fail(`Error: fact-map sentence at line ${row.line} is empty. Give the opening words of the sentence, at least four, or the whole of a shorter unit.`);
    }
    const rowsCell = row.cells[2];
    if (rowsCell.trim() === '') {
      fail(`Error: fact-map row at line ${row.line} has an empty Rows cell. Cite ledger IDs, or none.`);
    }
    let ids = [];
    const none = rowsCell.trim() === 'none';
    if (!none) {
      ids = rowsCell.split(',').map((part) => part.trim());
      if (ids.some((id) => id === '')) {
        fail(`Error: fact-map row at line ${row.line} has an empty ID in Rows. List ledger IDs separated by commas, or none.`);
      }
    }
    entries.push({
      line: row.line,
      mark: row.cells[0],
      sentence: row.cells[1],
      ids,
      none,
      note: row.cells[3]
    });
  }
  return { entries, ignoredTables };
}

function compilePhrase(phrase) {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const source = `\\b(?:${body})\\b`;
  return { search: new RegExp(source, 'giu'), test: new RegExp(source, 'iu') };
}

function loadPatterns(text, label) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`Error: ${label} is not valid JSON. Pass a JSON object with a patterns array.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.patterns)) {
    fail(`Error: ${label} must be a JSON object with a patterns array.`);
  }
  if (data.patterns.length === 0) fail(`Error: ${label} lists no patterns. Add at least one.`);
  const ignoredKeys = Object.keys(data).filter((key) => key !== 'patterns');
  const ignoredPatternKeys = [];
  const seen = new Set();
  const patterns = [];
  for (let index = 0; index < data.patterns.length; index += 1) {
    const entry = data.patterns[index];
    const where = `patterns[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`Error: ${where} is not an object.`);
    if (typeof entry.id !== 'string' || entry.id.length === 0) fail(`Error: ${where} needs a non-empty string id.`);
    if (seen.has(entry.id)) fail(`Error: pattern id "${entry.id}" is duplicated. Make every id unique.`);
    seen.add(entry.id);
    if (entry.from !== 'about' && entry.from !== 'voice' && entry.from !== 'default') {
      fail(`Error: pattern "${entry.id}" from is ${JSON.stringify(entry.from)}, which is not about, voice, or default.`);
    }
    const hasPhrase = Object.prototype.hasOwnProperty.call(entry, 'phrase');
    const hasRegex = Object.prototype.hasOwnProperty.call(entry, 'regex');
    if (hasPhrase === hasRegex) {
      fail(hasPhrase
        ? `Error: pattern "${entry.id}" has both phrase and regex. Give it one.`
        : `Error: pattern "${entry.id}" has neither phrase nor regex. Give it one.`);
    }
    const extra = Object.keys(entry).filter((key) => !['id', 'from', 'phrase', 'regex'].includes(key));
    if (extra.length > 0) ignoredPatternKeys.push({ id: entry.id, keys: extra });
    if (hasPhrase) {
      if (typeof entry.phrase !== 'string' || entry.phrase.trim() === '') {
        fail(`Error: pattern "${entry.id}" phrase is empty. Give the words to match.`);
      }
      if (entry.phrase !== entry.phrase.trim()) {
        fail(`Error: pattern "${entry.id}" phrase has leading or trailing whitespace. Word-boundary matching uses the words themselves.`);
      }
      const compiled = compilePhrase(entry.phrase);
      if (!compiled.test.test(entry.phrase)) {
        fail(`Error: pattern "${entry.id}" phrase does not match itself at a word boundary. Reword it so the words can be found.`);
      }
      patterns.push({ id: entry.id, from: entry.from, phrase: entry.phrase, search: compiled.search, test: compiled.test });
    } else {
      if (typeof entry.regex !== 'string' || entry.regex.length === 0) {
        fail(`Error: pattern "${entry.id}" regex is empty. Give a JavaScript source that compiles.`);
      }
      try {
        const test = new RegExp(entry.regex, 'iu');
        const search = new RegExp(entry.regex, 'giu');
        patterns.push({ id: entry.id, from: entry.from, regex: entry.regex, search, test });
      } catch {
        fail(`Error: pattern "${entry.id}" regex does not compile. Fix the JavaScript source.`);
      }
    }
  }
  return { patterns, ignoredKeys, ignoredPatternKeys };
}

function parseAllow(raw) {
  if (raw === undefined) fail('Error: --allow is required. Pass a comma-separated list of Use codes.');
  const parts = raw.split(',');
  if (parts.some((part) => part.trim() === '')) {
    fail('Error: --allow has an empty code. Pass comma-separated Use codes with no empty entry.');
  }
  const codes = parts.map((part) => part.trim());
  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) fail(`Error: --allow lists "${code}" more than once. Pass each Use code once.`);
    seen.add(code);
  }
  return codes;
}

function parseN(raw) {
  if (raw === undefined) return 5;
  if (!/^[0-9]+$/.test(raw)) fail(`Error: --n must be a whole number from 3 to 12; got "${raw}".`);
  const value = Number.parseInt(raw, 10);
  if (value < 3 || value > 12) fail(`Error: --n must be a whole number from 3 to 12; got ${value}.`);
  return value;
}

function baseFields(command, parsed, pass) {
  return {
    command,
    pass,
    units: parsed.units.length,
    characters: parsed.characters,
    bomStripped: parsed.bomStripped,
    skippedFences: parsed.skippedFences
  };
}

function evaluateFacts(parsed, ledger, factMap, allow) {
  const byId = new Map(ledger.rows.map((row) => [row.id, row]));
  const matchedUnits = new Set();
  const stale = [];
  const ambiguous = [];
  const missingRows = [];
  const disallowed = [];

  for (const entry of factMap.entries) {
    const whole = wordCount(entry.sentence) < 4;
    const hits = parsed.units.filter((unit) => (whole
      ? matchKey(unit.text) === matchKey(entry.sentence)
      : prefixMatch(unit.text, entry.sentence)));
    for (const unit of hits) matchedUnits.add(unit);
    if (hits.length === 0) stale.push({ line: entry.line, mark: entry.mark, sentence: entry.sentence });
    else if (hits.length > 1 && new Set(hits.map((unit) => matchKey(unit.text))).size > 1) {
      ambiguous.push({ line: entry.line, mark: entry.mark, sentence: entry.sentence, unitCount: hits.length });
    }
    if (entry.none) continue;
    const seenMissing = new Set();
    const seenDisallowed = new Set();
    for (const id of entry.ids) {
      const row = byId.get(id);
      if (!row) {
        if (!seenMissing.has(id)) {
          seenMissing.add(id);
          missingRows.push({ line: entry.line, id });
        }
        continue;
      }
      if (!allow.includes(row.code) && !seenDisallowed.has(id)) {
        seenDisallowed.add(id);
        disallowed.push({ line: entry.line, id, code: row.code });
      }
    }
  }

  const unmapped = parsed.units
    .filter((unit) => !matchedUnits.has(unit))
    .map((unit) => ({ line: unit.line, column: unit.column, unit: collapseWhitespace(unit.text) }));

  const pass = unmapped.length === 0 && stale.length === 0 && ambiguous.length === 0
    && missingRows.length === 0 && disallowed.length === 0;

  return {
    ...baseFields('facts', parsed, pass),
    allow,
    ledgerRows: ledger.rows.length,
    factMapRows: factMap.entries.length,
    ignoredTables: [...ledger.ignoredTables, ...factMap.ignoredTables],
    unmapped,
    stale,
    ambiguous,
    missingRows,
    disallowed
  };
}

function allMatches(pattern, text) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const expression = new RegExp(pattern.source, flags);
  const found = [];
  for (const match of text.matchAll(expression)) {
    if (match[0].length === 0) continue;
    found.push({ text: match[0], index: match.index });
  }
  return found;
}

function evaluateProhibited(parsed, loaded) {
  const ranges = parsed.exemptions;
  const matches = [];
  for (const unit of parsed.units) {
    for (const pattern of loaded.patterns) {
      for (const match of allMatches(pattern.search, unit.text)) {
        const at = unit.offsets[match.index] ?? unit.offsets[0];
        const position = positionAt(parsed.text, at);
        matches.push({
          id: pattern.id,
          from: pattern.from,
          text: match.text,
          line: position.line,
          column: position.column,
          unit: collapseWhitespace(unit.text),
          context: contextAt(at, ranges)
        });
      }
    }
  }
  return {
    ...baseFields('prohibited', parsed, matches.length === 0),
    ignoredKeys: loaded.ignoredKeys,
    ignoredPatternKeys: loaded.ignoredPatternKeys,
    matches
  };
}

function walkCorpus(dir) {
  const read = [];
  const skipped = [];

  function visit(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      skipped.push({ path: relative(dir, current) || '.', reason: 'unreadable' });
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const full = join(current, entry.name);
      const path = relative(dir, full);
      if (entry.isSymbolicLink()) {
        skipped.push({ path, reason: 'symlink' });
        continue;
      }
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile()) {
        skipped.push({ path, reason: 'not-a-file' });
        continue;
      }
      const extension = extname(entry.name).toLowerCase();
      if (extension !== '.md' && extension !== '.txt') {
        skipped.push({ path, reason: 'extension' });
        continue;
      }
      let buffer;
      try {
        buffer = readFileSync(full);
      } catch {
        skipped.push({ path, reason: 'unreadable' });
        continue;
      }
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        read.push({ path, text });
      } catch {
        skipped.push({ path, reason: 'not-utf8' });
      }
    }
  }

  visit(dir);
  read.sort((left, right) => left.path.localeCompare(right.path));
  skipped.sort((left, right) => left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason));
  return { read, skipped };
}

function corpusIndex(files, size) {
  const index = new Map();
  for (const file of files) {
    const seen = new Set();
    for (const sequence of windows(tokens(file.text), size)) {
      if (seen.has(sequence)) continue;
      seen.add(sequence);
      if (!index.has(sequence)) index.set(sequence, []);
      index.get(sequence).push(file.path);
    }
  }
  return index;
}

function evaluateOverlap(parsed, files, skipped, size) {
  const index = corpusIndex(files, size);
  const ranges = parsed.exemptions.quotations;
  let excludedWords = 0;
  const groups = [];
  for (const unit of parsed.units) {
    const last = groups[groups.length - 1];
    if (!last || last.index !== unit.sectionIndex) {
      groups.push({ index: unit.sectionIndex, section: unit.section, units: [unit] });
    } else last.units.push(unit);
  }
  const sections = [];
  for (const group of groups) {
    const pieces = [];
    for (const unit of group.units) {
      const blanked = blankQuoted(unit, ranges);
      excludedWords += blanked.excluded;
      pieces.push(blanked.text);
    }
    const words = tokens(pieces.join(' '));
    const sequences = windows(words, size);
    const seen = new Set();
    const matches = [];
    for (const sequence of sequences) {
      if (!index.has(sequence) || seen.has(sequence)) continue;
      seen.add(sequence);
      matches.push({ sequence, files: index.get(sequence) });
    }
    sections.push({ section: group.section, sequences: sequences.length, matches });
  }
  const pass = sections.every((section) => section.matches.length === 0);
  return {
    ...baseFields('overlap', parsed, pass),
    n: size,
    excludedWords,
    filesRead: files.map((file) => file.path),
    filesSkipped: skipped,
    sections
  };
}

function excerptAt(text, index) {
  const chars = Array.from(text);
  let pointIndex = 0;
  for (let cursor = 0; cursor < index;) {
    const point = text.codePointAt(cursor);
    cursor += point > 0xFFFF ? 2 : 1;
    pointIndex += 1;
  }
  const start = Math.max(0, pointIndex - 20);
  const end = Math.min(chars.length, pointIndex + 21);
  return chars.slice(start, end).join('').replace(/\s+/g, ' ');
}

function evaluateDashes(parsed) {
  const ranges = parsed.exemptions;
  const hits = [];
  let counted = 0;
  let exempt = 0;
  for (let index = 0; index < parsed.text.length;) {
    const point = parsed.text.codePointAt(index);
    const width = point > 0xFFFF ? 2 : 1;
    if (point === EM_DASH.codePointAt(0) || point === EN_DASH.codePointAt(0)) {
      const context = contextAt(index, ranges);
      if (context === 'quotation') exempt += 1;
      else counted += 1;
      const position = positionAt(parsed.text, index);
      hits.push({
        line: position.line,
        column: position.column,
        character: point === EM_DASH.codePointAt(0) ? 'U+2014' : 'U+2013',
        context,
        excerpt: excerptAt(parsed.text, index)
      });
    }
    index += width;
  }
  return {
    ...baseFields('dashes', parsed, counted === 0),
    counted,
    exempt,
    charactersScanned: codePoints(parsed.text),
    hits
  };
}

function controlFailure(command) {
  fail(`Error: ${command} control did not fire. A zero that cannot be shown to be a real zero is not reported.`);
}

function sampleFor(pattern) {
  if (pattern.phrase) return pattern.phrase;
  const simplified = pattern.regex
    .replace(/\\s\+/g, ' ')
    .replace(/\\s\*/g, ' ')
    .replace(/\\s/g, ' ')
    .replace(/\\d\+/g, '1')
    .replace(/\\d/g, '1')
    .replace(/\\w\+/g, 'a')
    .replace(/\\w/g, 'a')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\(\?:/g, '')
    .replace(/[()[\]{}|+*?^$]/g, '')
    .replace(/\\./g, 'a');
  const guesses = [pattern.regex, simplified, 'a', '1', 'test', 'thought leader'];
  for (const guess of guesses) {
    if (!guess || !guess.trim()) continue;
    if (pattern.test.test(guess)) return guess.trim();
  }
  return null;
}

function runFacts(values) {
  const copyPath = screenSource('--copy', requireFlag(values, '--copy'), 'file');
  const ledgerPath = screenSource('--ledger', requireFlag(values, '--ledger'), 'file');
  const mapPath = screenSource('--fact-map', requireFlag(values, '--fact-map'), 'file');
  const allow = parseAllow(values['--allow']);
  const ledger = loadLedger(readUtf8(ledgerPath, '--ledger'), '--ledger');
  const factMap = loadFactMap(readUtf8(mapPath, '--fact-map'), '--fact-map');
  const copyText = readUtf8(copyPath, '--copy');
  const result = evaluateFacts(parseDocument(copyText), ledger, factMap, allow);
  const planted = `${copyText}\n\n${PLANT_SENTENCE}\n`;
  const control = evaluateFacts(parseDocument(planted), ledger, factMap, allow);
  const fired = control.unmapped.some((item) => item.unit.startsWith(PLANT_SENTENCE.replace(/\.$/, '')));
  if (!fired) controlFailure('facts');
  return { ...result, control: { planted: PLANT_SENTENCE, fired: true } };
}

function runProhibited(values) {
  const copyPath = screenSource('--copy', requireFlag(values, '--copy'), 'file');
  const patternsPath = screenSource('--patterns', requireFlag(values, '--patterns'), 'file');
  const loaded = loadPatterns(readUtf8(patternsPath, '--patterns'), '--patterns');
  const copyText = readUtf8(copyPath, '--copy');
  const result = evaluateProhibited(parseDocument(copyText), loaded);
  const pattern = loaded.patterns[0];
  const sample = sampleFor(pattern);
  if (!sample) controlFailure('prohibited');
  const planted = `${copyText}\n\n${sample}\n`;
  const control = evaluateProhibited(parseDocument(planted), loaded);
  const before = result.matches.filter((match) => match.id === pattern.id).length;
  const after = control.matches.filter((match) => match.id === pattern.id).length;
  if (after <= before) controlFailure('prohibited');
  return { ...result, control: { planted: sample, fired: true } };
}

function runOverlap(values) {
  const copyPath = screenSource('--copy', requireFlag(values, '--copy'), 'file');
  const corpusPath = screenSource('--corpus', requireFlag(values, '--corpus'), 'directory');
  const size = parseN(values['--n']);
  const corpus = walkCorpus(corpusPath);
  if (corpus.read.length === 0) {
    fail(`Error: --corpus ${corpusPath} has no readable .md or .txt file. Pass a directory that contains one.`);
  }
  const copyText = readUtf8(copyPath, '--copy');
  const result = evaluateOverlap(parseDocument(copyText), corpus.read, corpus.skipped, size);
  let plantedSeq = null;
  for (const file of corpus.read) {
    const words = tokens(file.text);
    if (words.length < size) continue;
    plantedSeq = words.slice(0, size).join(' ');
    break;
  }
  if (!plantedSeq) controlFailure('overlap');
  const planted = `${copyText}\n\n${plantedSeq}\n`;
  const control = evaluateOverlap(parseDocument(planted), corpus.read, corpus.skipped, size);
  const fired = control.sections.some((section) => section.matches.some((match) => match.sequence === plantedSeq));
  if (!fired) controlFailure('overlap');
  return { ...result, control: { planted: plantedSeq, fired: true } };
}

function runDashes(values) {
  const copyPath = screenSource('--copy', requireFlag(values, '--copy'), 'file');
  const copyText = readUtf8(copyPath, '--copy');
  const result = evaluateDashes(parseDocument(copyText));
  const planted = `${copyText}\n\nPlanted ${EM_DASH} marker.\n`;
  const control = evaluateDashes(parseDocument(planted));
  if (control.counted !== result.counted + 1) controlFailure('dashes');
  return { ...result, control: { planted: 'U+2014', fired: true } };
}

export function runCopyCheck(argv) {
  const args = parseArgs(argv);
  if (args.help === 'all') return USAGE;
  if (args.help) return HELP[args.help];
  if (args.command === 'facts') return runFacts(args.values);
  if (args.command === 'prohibited') return runProhibited(args.values);
  if (args.command === 'overlap') return runOverlap(args.values);
  if (args.command === 'dashes') return runDashes(args.values);
  fail(`Error: unknown command "${args.command}". Run "node scripts/copy-check.js help" for usage.`);
}

export { USAGE, matchKey };
