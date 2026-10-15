/**
 * voice-lexicon: find a person's style markers in their writing samples
 * (profile) and check a short draft against them (check). Node built-ins
 * only. The data it reads ships in ../data, located from this file, never
 * from the working directory.
 *
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fail, sameFile, screenDestination, screenSource, writeDestination } from './lib/paths.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, '..', 'data');

const HELP_HINT = 'Run "node scripts/voice-lexicon.js help" for usage.';

const MAX_BYTES = 20000000;
const MAX_WORDS = 2000000;

const USAGE = `voice-lexicon: find a person's style markers in their writing samples, and check a short draft against them. It counts; it judges nothing.

Usage:
  node scripts/voice-lexicon.js help
  node scripts/voice-lexicon.js profile --samples <file> [--baseline <file>] [--output <file>]
  node scripts/voice-lexicon.js check --draft <file> --profile <file> [--avoid <file>]

Commands:
  profile      Report the markers that recur across the samples: signature words and phrases, variant choices, punctuation habits, altered sayings; and the ranges of rhythm and stance the samples keep over 500-word chunks
  check        Report a draft's avoided terms, contradicted markers and dose of signature markers and sayings; and, as advice, rhythm and stance outside the profile's ranges and whether any marker is missing
  help         Print this message

Options for profile:
  --samples <file>     JSON array of { "id", "path", "register", "origin" }. register is governing or other; origin is own or model-assisted; path is absolute. Absolute path. Required.
  --baseline <file>    Word frequency file, one "word<TAB>count" per line. Replaces the built-in common-word set for signature words. Absolute path. Optional.
  --output <file>      Write the profile JSON here and print { "written": "<path>" }. Absolute path, never inside this tool's directory, never a symbolic link, a non-regular file or a file with more than one hard link. Optional; stdout otherwise.

Options for check:
  --draft <file>       The draft text. Absolute path. Required.
  --profile <file>     A profile JSON this tool wrote, or a copy holding only the confirmed markers. Absolute path. Required.
  --avoid <file>       Terms to avoid, one per line. Absolute path. Optional.

  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name. An option given an empty value is refused. Input over 2,000,000 words or 20 MB is refused.

A command that runs prints one JSON object to stdout and exits 0; check exits 0 whether or not pass is true. pass reads avoided terms, contradicted markers and the dose; ranges and missing are advice and never set it. A refusal or an unknown flag prints to stderr, leaves stdout empty, and exits 1.`;

const HELP = {
  profile: `voice-lexicon profile: report the markers that recur across a person's writing samples, and the ranges of rhythm and stance they keep over 500-word chunks.

Usage:
  node scripts/voice-lexicon.js profile --samples <file> [--baseline <file>] [--output <file>]

Options:
  --samples <file>     JSON array of { "id", "path", "register", "origin" }. register is governing or other; origin is own or model-assisted; path is absolute. Absolute path. Required.
  --baseline <file>    Word frequency file, one "word<TAB>count" per line. Replaces the built-in common-word set for signature words. Absolute path. Optional.
  --output <file>      Write the profile JSON here and print { "written": "<path>" }. Absolute path, never inside this tool's directory, never a symbolic link, a non-regular file or a file with more than one hard link. Optional; stdout otherwise.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name. An option given an empty value is refused. Input over 2,000,000 words or 20 MB is refused.`,
  check: `voice-lexicon check: check a draft against a profile. pass reads avoided terms, contradicted variants and the dose: signature markers and altered sayings, about one use per 500 words, each marker once below 2,000 words. Rhythm and stance outside the profile's ranges (drafts of 250 words or more) and missing markers (500 words or more) are advice and never set pass.

Usage:
  node scripts/voice-lexicon.js check --draft <file> --profile <file> [--avoid <file>]

Options:
  --draft <file>       The draft text. Absolute path. Required.
  --profile <file>     A profile JSON this tool wrote, or a copy holding only the confirmed markers. Absolute path. Required.
  --avoid <file>       Terms to avoid, one per line. Absolute path. Optional.
  --help, -h           Print this message

No command takes --env. This tool installs nothing, and --install is refused by name. An option given an empty value is refused. Input over 2,000,000 words or 20 MB is refused.`
};

const VALUE_FLAGS = {
  profile: ['--samples', '--baseline', '--output'],
  check: ['--draft', '--profile', '--avoid']
};

// ---------------------------------------------------------------- arguments

function refuseFlag(token) {
  if (token === '--install') {
    fail(`Error: --install is refused: voice-lexicon installs nothing, so there is nothing to authorize. Drop --install and run the same command. ${HELP_HINT}`);
  }
  fail(`Error: unknown option "${token}". ${HELP_HINT}`);
}

function scan(argv, bare, valueFlags) {
  const valueSet = new Set(valueFlags);
  const positions = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    if (valueSet.has(argv[index])) positions.add(index + 1);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    const token = argv[index];
    if (token.startsWith('-') && !valueSet.has(token) && !bare.has(token)) refuseFlag(token);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    const token = argv[index];
    if (!token.startsWith('-')) {
      fail(`Error: unexpected argument "${token}". Every value belongs to an option here. ${HELP_HINT}`);
    }
  }
  const values = {};
  for (const flag of valueFlags) {
    const indexes = [];
    for (let index = 0; index < argv.length; index += 1) {
      if (argv[index] === flag) indexes.push(index);
    }
    if (indexes.length > 1) fail(`Error: ${flag} was given more than once and takes one value. ${HELP_HINT}`);
    if (indexes.length === 0) continue;
    const value = argv[indexes[0] + 1];
    if (value === undefined || value.startsWith('-')) fail(`Error: ${flag} needs a value. ${HELP_HINT}`);
    if (value.trim() === '') fail(`Error: ${flag} was given an empty value; it takes an absolute path. ${HELP_HINT}`);
    values[flag] = value;
  }
  return values;
}

function parseArgs(argv) {
  const first = argv[0];
  if (argv.length === 0 || first === 'help' || first === '--help' || first === '-h') {
    scan(argv.slice(1), new Set(['--help', '-h']), []);
    return { help: 'all' };
  }
  if (first.startsWith('-')) {
    scan(argv, new Set(['--help', '-h']), []);
    return { help: 'all' };
  }
  if (!Object.hasOwn(VALUE_FLAGS, first)) fail(`Error: unknown command "${first}". The commands are profile, check and help. ${HELP_HINT}`);
  const rest = argv.slice(1);
  if (rest.includes('help') || rest.includes('--help') || rest.includes('-h')) {
    scan(rest.filter((token) => token !== 'help'), new Set(['--help', '-h']), VALUE_FLAGS[first]);
    return { help: first };
  }
  return { help: null, command: first, values: scan(rest, new Set(), VALUE_FLAGS[first]) };
}

function requireFlag(values, flag) {
  if (values[flag] === undefined) fail(`Error: ${flag} is required. ${HELP_HINT}`);
  return values[flag];
}

// ---------------------------------------------------------------- files

/**
 * Refuse, before anything is read, input whose files total over 20 MB.
 */
function capBytes(entries) {
  let total = 0;
  for (const [, path] of entries) {
    try {
      total += statSync(path).size;
    } catch {
      // A file that cannot be stated fails at its own read, by name.
    }
  }
  if (total > MAX_BYTES) {
    const names = entries.map(([label]) => label).join(', ');
    fail(`Error: the input (${names}) totals ${total} bytes, over the 20 MB (${MAX_BYTES} bytes) this tool reads. Pass fewer or shorter files.`);
  }
}

function capWords(texts, label) {
  let total = 0;
  for (const text of texts) {
    WORD.lastIndex = 0;
    while (WORD.exec(text) !== null) {
      total += 1;
      if (total > MAX_WORDS) {
        fail(`Error: ${label} hold over 2,000,000 words, more than this tool reads. Pass fewer or shorter files.`);
      }
    }
  }
}

function readUtf8(filePath, label) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    fail(`Error: ${label} at ${filePath} could not be read. Pass an absolute path to a file this account can read.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '').normalize('NFC');
  } catch {
    fail(`Error: ${label} at ${filePath} is not valid UTF-8. Save it as UTF-8 text and run again.`);
  }
}

function readJson(filePath, label) {
  const text = readUtf8(filePath, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Error: ${label} at ${filePath} is not valid JSON (${error.message}). Fix the file and run again.`);
  }
}

const LINE_BREAK = /\r\n?|\n/;

// ---------------------------------------------------------------- data

let DATA = null;

function dataFailure(file, why) {
  fail(`Error: the tool's own data file ${join(DATA_DIR, file)} ${why}. This copy of the plugin is damaged: report the file named here and stop; do not edit files under the plugin.`);
}

function readData(file) {
  let text;
  try {
    text = readFileSync(join(DATA_DIR, file), 'utf8');
  } catch {
    dataFailure(file, 'could not be read');
  }
  return text.normalize('NFC');
}

function readDataJson(file) {
  try {
    return JSON.parse(readData(file));
  } catch (error) {
    if (error && error.name === 'UsageError') throw error;
    return dataFailure(file, 'is not valid JSON');
  }
}

function keywordIn(token, keywords) {
  if (keywords.has(token)) return token;
  if (token.endsWith("'s") && keywords.has(token.slice(0, -2))) return token.slice(0, -2);
  return null;
}

function sayingForm(text, keywords, file, primary) {
  const tokens = words(normalize(text));
  const positions = [];
  for (const keyword of keywords) {
    const position = tokens.findIndex((token) => keywordIn(token, new Set([keyword])) !== null);
    positions.push(position);
  }
  if (positions.some((position) => position < 0)) {
    if (primary) dataFailure(file, `has a keyword that is not a word of "${text}"`);
    return { tokens, start: 0, end: tokens.length - 1, segment: tokens };
  }
  const start = Math.min(...positions);
  const end = Math.max(...positions);
  return { tokens, start, end, segment: tokens.slice(start, end + 1) };
}

function loadData() {
  if (DATA) return DATA;

  const common = new Set(readData('common-words.txt').split(LINE_BREAK).map((line) => normalize(line.trim())).filter(Boolean));
  if (common.size === 0) dataFailure('common-words.txt', 'holds no words');

  const variantsRaw = readDataJson('variants.json');
  if (!Array.isArray(variantsRaw)) dataFailure('variants.json', 'is not an array');
  const variants = variantsRaw.map((pair) => {
    if (!pair || typeof pair.a !== 'string' || typeof pair.b !== 'string'
      || !['spelling', 'dated', 'contraction'].includes(pair.kind)) {
      dataFailure('variants.json', 'holds an entry without a, b and a known kind');
    }
    const a = words(normalize(pair.a));
    const b = words(normalize(pair.b));
    if (a.length === 0 || b.length === 0) dataFailure('variants.json', `holds a pair with no words (${pair.a}/${pair.b})`);
    return { a: a.join(' '), b: b.join(' '), aTokens: a, bTokens: b, kind: pair.kind };
  });
  const variantKeys = new Set();
  const variantSingles = new Set();
  let variantLongest = 1;
  for (const pair of variants) {
    for (const form of [pair.aTokens, pair.bTokens]) {
      variantKeys.add(form.join(' '));
      if (form.length === 1) variantSingles.add(form[0]);
      variantLongest = Math.max(variantLongest, form.length);
    }
  }

  const idiomsRaw = readDataJson('idioms.json');
  if (!Array.isArray(idiomsRaw)) dataFailure('idioms.json', 'is not an array');
  const idioms = idiomsRaw.map((entry) => {
    if (!entry || typeof entry.usual !== 'string' || !Array.isArray(entry.keywords) || entry.keywords.length < 2) {
      dataFailure('idioms.json', 'holds an entry without usual and at least 2 keywords');
    }
    if (entry.also !== undefined && (!Array.isArray(entry.also) || entry.also.some((form) => typeof form !== 'string' || form.trim() === ''))) {
      dataFailure('idioms.json', `has an "also" for "${entry.usual}" that is not an array of forms`);
    }
    const keywords = [...new Set(entry.keywords.map((keyword) => words(normalize(String(keyword))).join(' ')))];
    const keywordSet = new Set(keywords);
    const forms = [sayingForm(entry.usual, keywords, 'idioms.json', true)];
    for (const form of entry.also || []) forms.push(sayingForm(form, keywords, 'idioms.json', false));
    return { usualText: normalize(entry.usual), keywords: keywordSet, forms };
  });

  const reference = readDataJson('punctuation-reference.json');
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) dataFailure('punctuation-reference.json', 'is not an object');
  for (const key of PUNCTUATION_KEYS) {
    if (typeof reference[key] !== 'number' || !(reference[key] > 0)) dataFailure('punctuation-reference.json', `has no positive rate for ${key}`);
  }

  const stance = loadStance(readDataJson('stance.json'));

  DATA = { common, variants, variantKeys, variantSingles, variantLongest, idioms, reference, stance };
  return DATA;
}

const STANCE_KINDS = ['hedges', 'boosters'];

/**
 * The hedge and booster entries, indexed by first word, longest entry first,
 * so a scan takes the longest entry of either list that starts at a word.
 */
function loadStance(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) dataFailure('stance.json', 'is not an object');
  const index = new Map();
  const seen = new Set();
  for (const kind of STANCE_KINDS) {
    const list = raw[kind];
    if (!Array.isArray(list) || list.length === 0) dataFailure('stance.json', `has no ${kind} list`);
    for (const entry of list) {
      if (typeof entry !== 'string') dataFailure('stance.json', `holds a ${kind} entry that is not a string`);
      const tokens = words(normalize(entry));
      if (tokens.length === 0) dataFailure('stance.json', `holds a ${kind} entry with no words ("${entry}")`);
      const key = tokens.join(' ');
      if (seen.has(key)) dataFailure('stance.json', `lists "${key}" more than once`);
      seen.add(key);
      if (!index.has(tokens[0])) index.set(tokens[0], []);
      index.get(tokens[0]).push({ tokens, kind });
    }
  }
  for (const entries of index.values()) entries.sort((left, right) => right.tokens.length - left.tokens.length);
  return index;
}

// ---------------------------------------------------------------- text

const WORD = /\p{L}[\p{L}\p{M}]*(?:['-]\p{L}[\p{L}\p{M}]*)*/gu;
const APOSTROPHES = /[‘’‛′]/g;

function normalize(text) {
  return text.normalize('NFC').replace(APOSTROPHES, "'").toLowerCase();
}

function words(text) {
  return text.match(WORD) || [];
}

function countWords(text) {
  return (text.match(WORD) || []).length;
}

/** Fenced code blocks dropped line by line; an unclosed fence runs to the end. */
function dropFences(text) {
  const out = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      out.push('');
      continue;
    }
    if (opener) {
      fence = opener[1];
      out.push('');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

const TRIM_LEAD = /^[<([{"']+/;
const TRIM_TRAIL = /[>)\]}"'.,;:!?]+$/;

/** An email address, judged by string tests rather than a backtracking pattern. */
function stripEmail(token) {
  if (!token.includes('@')) return token;
  const lead = (TRIM_LEAD.exec(token) || [''])[0].length;
  const trail = (TRIM_TRAIL.exec(token) || [''])[0].length;
  const core = token.slice(lead, token.length - trail);
  const at = core.indexOf('@');
  if (at <= 0 || core.lastIndexOf('@') !== at) return token;
  const dot = core.indexOf('.', at + 2);
  if (dot < 0 || dot >= core.length - 1) return token;
  return `${token.slice(0, lead)} ${token.slice(token.length - trail)}`;
}

/**
 * Prepare a text as the spec's Text handling says. NFC; curly apostrophes
 * folded; fenced code, inline code and quoted-mail lines dropped; Markdown
 * links read as their text; quotations longer than 8 words, URLs and emails
 * dropped. `literal` is that text, lowercased, before numbers are removed
 * (the avoid list's literal terms match it); `text` has numbers removed. Case
 * is kept in `text` (name detection needs it) and folded per token.
 */
function clean(raw) {
  let text = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(APOSTROPHES, "'");
  text = dropFences(text);
  text = text.split('\n').map((line) => (line.trimStart().startsWith('>') ? '' : line)).join('\n');
  text = text.replace(/``[^\n]*?``|`[^`\n]*`/g, ' ');
  text = text.replace(/!?\[([^[\]\n]{0,1000})\]\([^()\s]{0,2000}(?:\s+"[^"\n]{0,500}")?\)/g, '$1');
  text = text.split(/(\n[ \t]*\n)/).map((paragraph) => paragraph
    .replace(/(?<![\p{L}\p{N}])"([^"]*)"/gu, (whole, inner) => (countWords(inner) > 8 ? ' ' : whole))
    .replace(/“([^”]*)”/g, (whole, inner) => (countWords(inner) > 8 ? ' ' : whole))).join('');
  text = text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, (url) => ` ${(/[.,;:!?)\]'"]*$/.exec(url) || [''])[0]}`);
  text = text.replace(/\S+/g, stripEmail);
  const literal = normalize(text);
  text = text.replace(/\d(?:\w|[.,:/](?=\d))*(?:\s*[\u2013-]\s*\d(?:\w|[.,:/](?=\d))*)?/g, ' ');
  return { text, literal };
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])["'”)\]]*(?=\s|$)|\n[ \t]*\n|\n(?=[ \t]*(?:[-*+#]|•)\s)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Tokens for variant matching: a hyphenated token counts by its parts. */
function variantStream(tokens, data) {
  const out = [];
  for (const token of tokens) {
    if (token.includes('-') && !data.variantSingles.has(token)) {
      for (const part of token.split('-')) if (part) out.push(part);
    } else {
      out.push(token);
    }
  }
  return out;
}

function analyse(raw, data) {
  const { text, literal } = clean(raw);
  const named = [];
  for (const line of text.split('\n')) {
    const found = line.match(WORD) || [];
    if (found.length === 1 && /^\p{Lu}/u.test(found[0])) named.push(found[0].toLowerCase().replace(/'s$/, ''));
  }
  const sentences = splitSentences(text).map((sentence) => {
    const original = sentence.match(WORD) || [];
    const tokens = original.map((token) => token.toLowerCase());
    if (original.length === 1 && /^\p{Lu}/u.test(original[0])) named.push(tokens[0].replace(/'s$/, ''));
    return { text: sentence, original, tokens, vtokens: variantStream(tokens, data) };
  });
  const total = sentences.reduce((sum, sentence) => sum + sentence.tokens.length, 0);
  return { text, literal, sentences, named, words: total };
}

function countSequence(sentences, sequence, field = 'tokens') {
  let count = 0;
  const length = sequence.length;
  if (length === 0) return 0;
  for (const sentence of sentences) {
    const tokens = sentence[field];
    for (let index = 0; index + length <= tokens.length; index += 1) {
      let match = true;
      for (let offset = 0; offset < length; offset += 1) {
        if (tokens[index + offset] !== sequence[offset]) {
          match = false;
          break;
        }
      }
      if (match) count += 1;
    }
  }
  return count;
}

function countLiteral(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------- class 3

const PUNCTUATION_KEYS = ['em_dash', 'en_dash', 'double_hyphen', 'semicolon', 'ellipsis', 'exclamation', 'parenthesis', 'serial_comma', 'initial_and', 'initial_but', 'initial_so'];

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

// A middle part that opens on a subject pronoun or is one of these asides is
// a clause set off by commas ("The fence, we hope, and the shed"), not an
// item of a list, so it breaks the run.
const SUBJECT_PRONOUNS = new Set('i we you they he she it one'.split(' '));
const ASIDES = new Set([
  'of course', 'as usual', 'as always', 'frankly', 'in fact', 'to be fair', 'to be honest',
  'bless her', 'bless him', 'bless them', 'to its credit', 'to their credit', 'to her credit', 'to his credit',
  'however', 'therefore', 'though', 'moreover', 'meanwhile', 'nonetheless', 'nevertheless',
  'for example', 'for instance', 'in short', 'in turn', 'in theory', 'in practice', 'in effect', 'in particular',
  'naturally', 'honestly', 'admittedly', 'apparently', 'perhaps', 'surely', 'indeed', 'say',
  'alas', 'sadly', 'luckily', 'fortunately', 'unfortunately', 'incidentally', 'after all', 'at least', 'mind you'
]);

// A contracted subject pronoun opens an aside too ("I'm told", "it's said").
const CONTRACTED_SUBJECTS = new Set('i we you they he she it'.split(' '));

function opensOnSubject(first) {
  if (SUBJECT_PRONOUNS.has(first)) return true;
  const apostrophe = first.indexOf("'");
  return apostrophe > 0 && CONTRACTED_SUBJECTS.has(first.slice(0, apostrophe));
}

function isAside(part) {
  const spoken = normalize(part).trim().replace(/\s+/g, ' ');
  return opensOnSubject(words(spoken)[0] || '') || ASIDES.has(spoken);
}

/**
 * A serial comma: ", and" or ", or" closing a run of at least three items,
 * each of one to four words, separated by commas, in one sentence. The first
 * item is read from the last semicolon, colon or parenthesis before it; the
 * last item runs to the next one or the sentence end.
 */
function serialCommas(sentence) {
  const parts = sentence.split(',');
  let count = 0;
  for (let index = 2; index < parts.length; index += 1) {
    const closing = /^\s+(?:and|or)\s+([\s\S]*)$/i.exec(parts[index]);
    if (!closing) continue;
    const inRange = (text) => {
      const size = countWords(text);
      return size >= 1 && size <= 4;
    };
    const last = closing[1].split(/[;:.!?()\u2014]/)[0];
    const middle = parts[index - 1];
    const first = parts[index - 2].split(/[;:()\u2014]/).pop();
    if (inRange(last) && inRange(middle) && inRange(first) && !isAside(middle)) count += 1;
  }
  return count;
}

function punctuation(analysed) {
  const { text, sentences } = analysed;
  const counts = {
    em_dash: countMatches(text, /\u2014/g),
    en_dash: countMatches(text, /\u2013/g),
    double_hyphen: countMatches(text, /(?<!-)--(?!-)/g),
    semicolon: countMatches(text, /;/g),
    ellipsis: countMatches(text, /\.{3,}|…/g),
    exclamation: countMatches(text, /!+/g),
    parenthesis: countMatches(text, /\(/g),
    serial_comma: 0,
    initial_and: 0,
    initial_but: 0,
    initial_so: 0
  };
  for (const sentence of sentences) {
    counts.serial_comma += serialCommas(sentence.text);
    const first = sentence.tokens[0];
    if (first === 'and') counts.initial_and += 1;
    if (first === 'but') counts.initial_but += 1;
    if (first === 'so') counts.initial_so += 1;
  }
  return counts;
}

// ---------------------------------------------------------------- class 1

// Function words written for this tool: articles, pronouns, prepositions,
// conjunctions and auxiliaries. No class 1 phrase is made only of these or
// ends in one.
const FUNCTION_WORDS = new Set(`
a an the
i me my mine myself we us our ours ourselves you your yours yourself yourselves
he him his himself she her hers herself it its itself they them their theirs themselves
this that these those who whom whose which what
about above across after against along among around at before behind below beneath beside between beyond by
down during for from in inside into near of off on onto out outside over past since through to toward towards
under until up upon with within without
and but or nor so yet if then than because although though while whereas unless whether as
am is are was were be been being have has had having do does did doing
will would shall should can could may might must
not no just only also too very
there here when where why how all any both each either neither some such
i'm i've i'd i'll you're you've you'd you'll he's she's it's we're we've we'd we'll they're they've they'd they'll
that's there's what's who's let's
isn't aren't wasn't weren't don't doesn't didn't won't wouldn't can't couldn't shouldn't hasn't haven't hadn't
`.split(/\s+/).filter(Boolean));

// No class 1 phrase starts with one of these.
const DETERMINERS = new Set('the a an this that these those my our your his her their its'.split(' '));

// Light words, written for this tool: everyday verbs, adjectives, adverbs,
// quantifiers and filler nouns that carry no voice on their own. A habit
// phrase needs at least one word that is neither a function word nor one of
// these.
const LIGHT_WORDS = new Set(`
want wants wanted wanting get gets got gotten getting make makes made making
take takes took taken taking keep keeps kept keeping go goes went gone going
come comes came coming see sees saw seen seeing know knows knew known knowing
think thinks thought thinking say says said saying tell tells told telling
give gives gave given giving put puts putting let lets letting
seem seems seemed seeming feel feels felt feeling look looks looked looking
find finds found finding need needs needed needing try tries tried trying
use uses used using ask asks asked asking like likes liked liking
leave leaves left leaving call calls called calling start starts started starting
help helps helped helping turn turns turned turning mean means meant meaning
bring brings brought bringing begin begins began begun becomes become became
happen happens happened happening done set sets
hope hoped hopes guess guessed wish wished
first last next other another same different
small big large little long short high low good bad better best worse worst
new old great right wrong sure able whole real true full easy hard early late
certain clear simple possible likely main major nice fine
well really quite rather pretty actually probably maybe perhaps
always never often sometimes usually still already even again ever
now soon later once twice almost enough far away back
together instead else anyway
lot lots few many much more most less least several every
plenty bit bits couple half number amount none
one two three four five six seven eight nine ten hundred thousand
second third
thing things stuff way ways time times kind kinds sort sorts part parts
point points fact case cases place places
something anything everything nothing someone anyone everyone
somebody anybody everybody nobody
yes yeah
`.split(/\s+/).filter(Boolean));

function makeCommonTest(common, baseline) {
  const isCommonWord = (word) => {
    if (word.length < 2) return true;
    if (baseline) return (baseline.counts.get(word) || 0) * 10000 >= baseline.total;
    return common.has(word);
  };
  return (token) => {
    if (isCommonWord(token)) return true;
    if (token.endsWith("'s") && isCommonWord(token.slice(0, -2))) return true;
    if (token.includes('-') && token.split(/[-']/).every((part) => isCommonWord(part))) return true;
    return false;
  };
}

/**
 * Names. A word is a name when it is written with a capital in every
 * mid-sentence use and has at least one piece of capital evidence: a
 * mid-sentence use, or standing alone, capitalized, on its own line or as a
 * whole sentence (a sign-off).
 */
function properNames(analysedSamples) {
  const seen = new Map();
  const note = (key, capital) => {
    const state = seen.get(key) || { capital: 0, lower: 0 };
    if (capital) state.capital += 1; else state.lower += 1;
    seen.set(key, state);
  };
  for (const analysed of analysedSamples) {
    for (const key of analysed.named) note(key, true);
    for (const sentence of analysed.sentences) {
      for (let index = 1; index < sentence.original.length; index += 1) {
        note(sentence.tokens[index].replace(/'s$/, ''), /^\p{Lu}/u.test(sentence.original[index]));
      }
    }
  }
  const names = new Set();
  for (const [key, state] of seen) {
    if (state.capital > 0 && state.lower === 0 && key !== 'i') names.add(key);
  }
  return names;
}

function subsequenceKeys(tokens, maxLength = tokens.length) {
  const keys = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = 1; length <= maxLength && start + length <= tokens.length; length += 1) {
      keys.push(tokens.slice(start, start + length).join(' '));
    }
  }
  return keys;
}

// Words ending in s that are not the plural of a singular the samples hold.
const FOLD_EXCEPTIONS = new Set('news goods means series species clothes'.split(' '));

function foldable(token, data) {
  return !FUNCTION_WORDS.has(token)
    && (token.match(/\p{L}/gu) || []).length >= 4
    && !/(?:ss|us|ics)$/.test(token)
    && !data.variantSingles.has(token)
    && !FOLD_EXCEPTIONS.has(token);
}

// "s" dropped is tried before "es" dropped, so "notes" finds "note" before
// "not" and "uses" finds "use" before "us".
function singularCandidates(token) {
  const candidates = [];
  if (token.endsWith('ies')) candidates.push(`${token.slice(0, -3)}y`);
  if (token.endsWith('s')) candidates.push(token.slice(0, -1));
  if (token.endsWith('es')) candidates.push(token.slice(0, -2));
  return candidates;
}

/**
 * Plural folding for class 1: each token that folds, mapped to the first of
 * its singular candidates that occurs as a token in the samples and is not
 * a function word.
 */
function pluralFolds(analysed, data) {
  const seen = new Set();
  for (const sample of analysed) {
    for (const { tokens } of sample.sentences) for (const token of tokens) seen.add(token);
  }
  const folds = new Map();
  for (const token of seen) {
    if (!foldable(token, data)) continue;
    const singular = singularCandidates(token).find((candidate) => seen.has(candidate) && !FUNCTION_WORDS.has(candidate));
    if (singular) folds.set(token, singular);
  }
  return folds;
}

/** A gram's surface phrases, most frequent first, then alphabetical. */
function surfaceForms(entry) {
  const counts = new Map(entry.surfaces || []);
  let folded = 0;
  for (const count of counts.values()) folded += count;
  if (entry.total > folded) counts.set(entry.key, entry.total - folded);
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([phrase]) => phrase);
}

function signatureMarkers(samples, analysed, isCommon, names, data) {
  const n = samples.length;
  const folds = pluralFolds(analysed, data);
  const grams = new Map();
  const extensions = new Map();
  analysed.forEach((sample, sampleIndex) => {
    for (const sentence of sample.sentences) {
      const surface = sentence.tokens;
      const tokens = surface.map((token) => folds.get(token) || token);
      for (let start = 0; start < tokens.length; start += 1) {
        let folded = false;
        for (let length = 1; length <= 4 && start + length <= tokens.length; length += 1) {
          if (tokens[start + length - 1] !== surface[start + length - 1]) folded = true;
          const key = tokens.slice(start, start + length).join(' ');
          let entry = grams.get(key);
          if (!entry) {
            entry = { key, tokens: tokens.slice(start, start + length), perSample: new Array(n).fill(0), total: 0, surfaces: null };
            grams.set(key, entry);
            if (length >= 3) {
              const prefix = tokens.slice(start, start + length - 1).join(' ');
              if (!extensions.has(prefix)) extensions.set(prefix, []);
              extensions.get(prefix).push(key);
            }
          }
          entry.perSample[sampleIndex] += 1;
          entry.total += 1;
          if (folded) {
            const phrase = surface.slice(start, start + length).join(' ');
            if (!entry.surfaces) entry.surfaces = new Map();
            entry.surfaces.set(phrase, (entry.surfaces.get(phrase) || 0) + 1);
          }
        }
      }
    }
  });

  // A folded word is common when any of its surface forms is common, and is
  // a light or a function word only when every one of them is ("big numbers"
  // stays a habit phrase although "number" is light).
  const surfaceCache = new Map();
  const surfacesOf = (token) => {
    if (!surfaceCache.has(token)) surfaceCache.set(token, surfaceForms(grams.get(token)));
    return surfaceCache.get(token);
  };
  const commonWord = (token) => surfacesOf(token).some(isCommon);
  const isFunction = (token) => surfacesOf(token).every((surface) => FUNCTION_WORDS.has(surface));
  const isLight = (token) => surfacesOf(token).every((surface) => LIGHT_WORDS.has(surface));
  const isName = (token) => names.has(token.replace(/'s$/, ''));
  const uncommon = (token) => !commonWord(token) && !isName(token);
  const common = (token) => commonWord(token) && !isName(token);
  const holdsVariant = (tokens) => subsequenceKeys(variantStream(tokens, data), data.variantLongest)
    .some((key) => data.variantKeys.has(key));
  const outsideCount = (token) => grams.get(token).total;

  // Pass 1: every gram's basis, or null where a rule excludes it.
  const basis = new Map();
  for (const [key, entry] of grams) {
    const { tokens, total } = entry;
    const last = tokens.length - 1;
    let verdict = null;
    if (tokens.every(isFunction)) verdict = null;
    else if (last > 0 && (DETERMINERS.has(tokens[0]) || isFunction(tokens[last]))) verdict = null;
    else if (holdsVariant(tokens)) verdict = null;
    else if (tokens.some(uncommon)) {
      const rare = tokens.filter(uncommon);
      if (!consistent(entry.perSample, total, 3, n)) verdict = null;
      // Its one uncommon word alone stands for a phrase otherwise made of
      // function words ("brouhaha", never "of the brouhaha").
      else if (last > 0 && rare.length === 1 && tokens.every((token) => uncommon(token) || isFunction(token))) verdict = null;
      // (d) Each uncommon word in a phrase never appears outside it.
      else if (last > 0 && rare.some((token) => outsideCount(token) !== total)) verdict = null;
      else verdict = 'uncommon-word';
    } else if (last > 0 && tokens.every(common)
      && tokens.some((token) => !isFunction(token) && !isLight(token))) {
      const present = entry.perSample.filter((count) => count > 0).length;
      const spread = present >= Math.min(3, n) && present >= 2 && present * 2 >= n && total >= 4;
      // A two-word habit phrase opening on a function word counts only when
      // its other word never appears outside it ("in practice", not "to build").
      const opener = tokens.length === 2 && isFunction(tokens[0]) && outsideCount(tokens[1]) !== total;
      if (spread && !opener) verdict = 'habit-phrase';
    }
    basis.set(key, verdict);
  }

  // Pass 2: a habit phrase that is always the start of a longer excluded
  // phrase (same count) is dropped ("in order" inside "in order to").
  const candidates = [];
  for (const [key, verdict] of basis) {
    if (!verdict) continue;
    const entry = grams.get(key);
    if (verdict === 'habit-phrase') {
      const longer = extensions.get(key) || [];
      if (longer.some((other) => grams.get(other).total === entry.total && !basis.get(other))) continue;
    }
    candidates.push({ ...entry, basis: verdict });
  }

  // Pass 3: a phrase contained in a longer reported phrase with the same
  // count is dropped in its favour. Longest first, indexed by key.
  candidates.sort((left, right) => right.tokens.length - left.tokens.length || left.key.localeCompare(right.key));
  const coveredBy = new Map();
  const kept = [];
  for (const candidate of candidates) {
    const totals = coveredBy.get(candidate.key);
    if (totals && totals.has(candidate.total)) continue;
    kept.push(candidate);
    for (const sub of subsequenceKeys(candidate.tokens, candidate.tokens.length - 1)) {
      if (!coveredBy.has(sub)) coveredBy.set(sub, new Set());
      coveredBy.get(sub).add(candidate.total);
    }
  }

  return kept
    .map((entry) => {
      const facts = describe(samples, entry.perSample);
      const forms = surfaceForms(entry);
      const marker = { class: 'signature', marker: forms[0], basis: entry.basis, count: entry.total, ...facts };
      if (forms.length >= 2) marker.forms = forms;
      return { ...marker, score: (facts.samples.length / n) * facts.weight * entry.total };
    })
    .sort((left, right) => right.score - left.score || right.count - left.count || left.marker.localeCompare(right.marker))
    .slice(0, 15)
    .map(({ score, ...marker }) => marker);
}

// ---------------------------------------------------------------- class 4

// Possessive and personal pronouns fill one slot when a use is compared with
// a usual form.
const PRONOUNS = new Set('my your his her its our their me you him us them'.split(' '));
const slot = (tokens) => tokens.map((token) => (PRONOUNS.has(token) ? '\u0001' : token));

function editDistance(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let row = 1; row < rows; row += 1) {
    const current = [row];
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      current[col] = Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

function sameWords(left, right) {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((word, index) => word === b[index]);
}

function sameSequence(left, right) {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

/**
 * Every use of a saying in one sentence: the shortest span, at most 12
 * words, from a keyword to the keyword that completes the set. A use that
 * matches the usual form or any "also" form (pronouns as one slot) is not
 * altered. An altered use differs from one of them by order or one word; it
 * is returned with its core words (first keyword to last) and the words
 * reported (the core, widened over the neighbouring words that match that
 * form).
 */
function alteredUses(tokens, idiom) {
  const found = [];
  const { keywords, forms } = idiom;
  const keyAt = (index) => keywordIn(tokens[index], keywords);
  let start = 0;
  while (start < tokens.length) {
    if (keyAt(start) === null) {
      start += 1;
      continue;
    }
    const seen = new Set([keyAt(start)]);
    let end = -1;
    for (let index = start + 1; index < Math.min(tokens.length, start + 12); index += 1) {
      const keyword = keyAt(index);
      if (keyword === null) continue;
      seen.add(keyword);
      if (seen.size === keywords.size) {
        end = index;
        break;
      }
    }
    if (end < 0) {
      start += 1;
      continue;
    }
    let first = start;
    for (;;) {
      let next = first + 1;
      while (next < end && keyAt(next) === null) next += 1;
      if (next >= end) break;
      const covered = new Set();
      for (let index = next; index <= end; index += 1) if (keyAt(index) !== null) covered.add(keyAt(index));
      if (covered.size !== keywords.size) break;
      first = next;
    }
    const core = tokens.slice(first, end + 1);
    const coreSlots = slot(core);
    const usual = forms.some((form) => sameSequence(coreSlots, slot(form.segment)));
    const match = usual ? null : forms.find((form) => {
      const formSlots = slot(form.segment);
      return sameWords(coreSlots, formSlots) || editDistance(coreSlots, formSlots) <= 1;
    });
    if (match) {
      let left = 0;
      while (first - left - 1 >= 0 && match.start - left - 1 >= 0
        && tokens[first - left - 1] === match.tokens[match.start - left - 1]) left += 1;
      let right = 0;
      while (end + right + 1 < tokens.length && match.end + right + 1 < match.tokens.length
        && tokens[end + right + 1] === match.tokens[match.end + right + 1]) right += 1;
      // Grouped by the core with pronouns as one slot, so "eat your cake"
      // and "eat their cake" are one altered form.
      found.push({ core: coreSlots.join(' '), words: tokens.slice(first - left, end + right + 1).join(' ') });
    }
    start = end + 1;
  }
  return found;
}

// ---------------------------------------------------------------- ranges

const CHUNK_WORDS = 500;
const CHUNK_KEPT = 250;
const MIN_CHUNKS = 3;
const QUARTILE_CHUNKS = 8;
const LONG_SENTENCE = 30;

const RANGE_FEATURES = ['sentence_mean', 'sentence_cv', 'long_sentences', 'first_singular', 'first_plural', 'second_person', 'hedges', 'boosters'];
const RANGE_NAMES = new Set([...RANGE_FEATURES, ...PUNCTUATION_KEYS]);

const PERSON_FORMS = {
  first_singular: new Set("i me my mine myself i'm i've i'd i'll".split(' ')),
  first_plural: new Set("we us our ours ourselves we're we've we'd we'll".split(' ')),
  second_person: new Set("you your yours yourself yourselves you're you've you'd you'll".split(' '))
};

function stanceAt(tokens, index, stance) {
  return (stance.get(tokens[index]) || []).find((entry) => entry.tokens.every((token, offset) => tokens[index + offset] === token));
}

/**
 * Hedges and boosters in one scan per sentence: the longest entry of either
 * list starting at a word is taken, and the words it covers are not matched
 * again, so "it seems to" counts once.
 */
function stanceCounts(sentences, stance) {
  const counts = { hedges: 0, boosters: 0 };
  for (const { tokens } of sentences) {
    let index = 0;
    while (index < tokens.length) {
      const entry = stanceAt(tokens, index, stance);
      if (entry) {
        counts[entry.kind] += 1;
        index += entry.tokens.length;
      } else {
        index += 1;
      }
    }
  }
  return counts;
}

/**
 * The counts every range feature is computed from. A sentence with no words
 * is not a sentence of the rhythm.
 */
function measure(sentences, data) {
  const lengths = sentences.map((sentence) => sentence.tokens.length).filter((length) => length > 0);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const mean = lengths.length > 0 ? total / lengths.length : 0;
  const variance = lengths.length > 0 ? lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length : 0;
  const counts = { long_sentences: lengths.filter((length) => length >= LONG_SENTENCE).length, ...stanceCounts(sentences, data.stance) };
  for (const [feature, forms] of Object.entries(PERSON_FORMS)) {
    counts[feature] = 0;
    for (const { tokens } of sentences) for (const token of tokens) if (forms.has(token)) counts[feature] += 1;
  }
  const sd = Math.sqrt(variance);
  return { words: total, sentences: lengths.length, mean, sd, cv: mean > 0 ? sd / mean : 0, counts };
}

/** Long sentences are per 100 sentences; every other count is per 1,000 words. */
function perUnit(feature, measured) {
  return feature === 'long_sentences' ? measured.sentences / 100 : measured.words / 1000;
}

function featureValue(feature, measured) {
  if (feature === 'sentence_mean') return measured.mean;
  if (feature === 'sentence_cv') return measured.cv;
  const unit = perUnit(feature, measured);
  return unit > 0 ? measured.counts[feature] / unit : 0;
}

/**
 * Each sample's sentences, in order, into chunks that close at 500 words. A
 * trailing chunk of 250 words or more is kept; chunks never cross samples.
 */
function chunkSentences(sentences) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const sentence of sentences) {
    current.push(sentence);
    size += sentence.tokens.length;
    if (size >= CHUNK_WORDS) {
      chunks.push(current);
      current = [];
      size = 0;
    }
  }
  if (size >= CHUNK_KEPT) chunks.push(current);
  return chunks;
}

/** Linear interpolation at (n - 1) * p of the sorted values. */
function percentile(sorted, p) {
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

function band(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const quartiles = sorted.length >= QUARTILE_CHUNKS;
  return {
    low: round(sorted[0]),
    q1: quartiles ? round(percentile(sorted, 0.25)) : null,
    median: round(percentile(sorted, 0.5)),
    q3: quartiles ? round(percentile(sorted, 0.75)) : null,
    high: round(sorted[sorted.length - 1])
  };
}

/**
 * The band of each feature over the samples' 500-word chunks, and a band for
 * each punctuation habit the profile reports, as its rate per 1,000 words.
 */
function profileRanges(analysed, punctuationKeys, data) {
  const chunks = analysed.flatMap((sample) => chunkSentences(sample.sentences));
  if (chunks.length < MIN_CHUNKS) return null;
  const rows = chunks.map((sentences) => {
    const measured = measure(sentences, data);
    const row = {};
    for (const feature of RANGE_FEATURES) row[feature] = featureValue(feature, measured);
    if (punctuationKeys.length > 0) {
      const counts = punctuation({ text: sentences.map((sentence) => sentence.text).join('\n'), sentences });
      for (const key of punctuationKeys) row[key] = measured.words > 0 ? (counts[key] / measured.words) * 1000 : 0;
    }
    return row;
  });
  const features = {};
  for (const key of [...RANGE_FEATURES, ...punctuationKeys]) features[key] = band(rows.map((row) => row[key]));
  return { chunk_words: CHUNK_WORDS, chunks: chunks.length, features };
}

/**
 * A count outside its band beyond Poisson noise: L and H are the band's
 * rates scaled to the draft. Below needs L - 2 sqrt(L) to be above zero, so a
 * band near zero is never undershot by a short draft.
 */
function countSide(count, low, high, unit) {
  const lowCount = low * unit;
  const highCount = high * unit;
  const floor = lowCount - 2 * Math.sqrt(lowCount);
  if (floor > 0 && count < floor) return 'below';
  if (count > highCount + 2 * Math.sqrt(Math.max(highCount, 1))) return 'above';
  return null;
}

function measureSide(value, low, high, margin) {
  if (value < low - margin) return 'below';
  if (value > high + margin) return 'above';
  return null;
}

/**
 * Advisory: each feature of the draft outside the profile's band, beyond the
 * noise a draft of this length carries. Punctuation is judged only for a
 * habit the profile still holds as a marker.
 */
function judgeRanges(ranges, markers, draft, data) {
  const features = ranges.features;
  const held = new Set(markers.filter((marker) => marker.class === 'punctuation').map((marker) => marker.marker));
  const punctuationKeys = PUNCTUATION_KEYS.filter((key) => held.has(key) && Object.hasOwn(features, key));
  const measured = measure(draft.sentences, data);
  const counts = { ...measured.counts, ...(punctuationKeys.length > 0 ? punctuation(draft) : {}) };
  const out = [];
  for (const feature of [...RANGE_FEATURES, ...punctuationKeys]) {
    if (!Object.hasOwn(features, feature)) continue;
    const { low, high } = features[feature];
    let side;
    let value;
    if (feature === 'sentence_mean') {
      value = measured.mean;
      side = measureSide(value, low, high, (2 * measured.sd) / Math.sqrt(measured.sentences));
    } else if (feature === 'sentence_cv') {
      value = measured.cv;
      side = measureSide(value, low, high, (2 * measured.cv) / Math.sqrt(2 * measured.sentences));
    } else {
      const unit = perUnit(feature, measured);
      value = counts[feature] / unit;
      side = countSide(counts[feature], low, high, unit);
    }
    if (side) out.push({ feature, value: round(value), low, high, side });
  }
  return out;
}

// ---------------------------------------------------------------- profile

const REGISTER_WEIGHT = { governing: 1, other: 0.5 };
const ORIGIN_WEIGHT = { own: 1, 'model-assisted': 0.5 };
const SAMPLE_KEYS = new Set(['id', 'path', 'register', 'origin']);

function loadSamples(samplesPath) {
  const parsed = readJson(samplesPath, '--samples');
  if (!Array.isArray(parsed)) {
    fail(`Error: --samples ${samplesPath} is not a JSON array. Pass an array of { "id", "path", "register", "origin" }.`);
  }
  const ids = new Set();
  const samples = parsed.map((entry, index) => {
    const where = `--samples entry ${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`Error: ${where} is not an object. Each entry is { "id", "path", "register", "origin" }.`);
    }
    for (const key of Object.keys(entry)) {
      if (!SAMPLE_KEYS.has(key)) fail(`Error: ${where} has the key "${key}", which this tool does not read. Remove it; each entry holds only id, path, register and origin.`);
    }
    if (typeof entry.id !== 'string' || entry.id.trim() === '') fail(`Error: ${where} is missing its id. Give every sample a non-empty string id, such as "E1".`);
    if (typeof entry.path !== 'string' || entry.path.trim() === '') fail(`Error: ${where} (${entry.id}) is missing its path. Give the absolute path to the sample's text file.`);
    if (!Object.hasOwn(REGISTER_WEIGHT, entry.register)) {
      fail(`Error: ${where} (${entry.id}) has register ${JSON.stringify(entry.register)}; it must be "governing" or "other".`);
    }
    if (!Object.hasOwn(ORIGIN_WEIGHT, entry.origin)) {
      fail(`Error: ${where} (${entry.id}) has origin ${JSON.stringify(entry.origin)}; it must be "own" or "model-assisted".`);
    }
    if (ids.has(entry.id)) fail(`Error: the sample id "${entry.id}" appears more than once in --samples. Give every sample its own id.`);
    ids.add(entry.id);
    return { id: entry.id, rawPath: entry.path, register: entry.register, origin: entry.origin };
  });
  for (const sample of samples) {
    sample.path = screenSource(`--samples path for ${sample.id}`, sample.rawPath);
  }
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      if (sameFile(samples[left].path, samples[right].path)) {
        fail(`Error: samples ${samples[left].id} and ${samples[right].id} are the same file (${samples[left].path}); counting it twice would fake consistency. List each file once.`);
      }
    }
  }
  return samples;
}

function loadBaseline(baselinePath) {
  const text = readUtf8(baselinePath, '--baseline');
  const counts = new Map();
  let total = 0;
  text.split(LINE_BREAK).forEach((line, index) => {
    if (line.trim() === '') return;
    const parts = line.split('\t');
    const word = parts.length === 2 ? normalize(parts[0].trim()) : '';
    const count = parts.length === 2 ? parts[1].trim() : '';
    if (!word || /\s/.test(word) || !/^\d+$/.test(count)) {
      fail(`Error: --baseline ${baselinePath} line ${index + 1} is not "word<TAB>count". Each line holds one word, a tab, and a whole-number count.`);
    }
    if (counts.has(word)) fail(`Error: --baseline ${baselinePath} lists "${word}" more than once (line ${index + 1}). List each word once.`);
    counts.set(word, Number(count));
    total += Number(count);
  });
  if (total === 0) fail(`Error: --baseline ${baselinePath} holds no counts. Pass a file of "word<TAB>count" lines whose counts are not all zero.`);
  return { counts, total };
}

function consistent(sampleCounts, total, minimum, sampleTotal) {
  const present = sampleCounts.filter((count) => count > 0).length;
  return present >= 2 && present * 2 >= sampleTotal && total >= minimum;
}

function describe(samples, perSample) {
  const present = samples.filter((_, index) => perSample[index] > 0);
  const weight = present.reduce((sum, sample) => sum + sample.weight, 0) / present.length;
  return {
    samples: present.map((sample) => sample.id),
    spread: round(present.length / samples.length),
    weight: round(weight)
  };
}

const FULL_FORMS = 'full forms';
const CONTRACTIONS = 'contractions';

function variantMarkers(samples, analysed, data) {
  const n = samples.length;
  const markers = [];
  const contractionPairs = [];
  for (const pair of data.variants) {
    const aCounts = analysed.map((sample) => countSequence(sample.sentences, pair.aTokens, 'vtokens'));
    const bCounts = analysed.map((sample) => countSequence(sample.sentences, pair.bTokens, 'vtokens'));
    if (pair.kind === 'contraction') {
      contractionPairs.push({ pair, aCounts, bCounts });
      continue;
    }
    const a = aCounts.reduce((sum, count) => sum + count, 0);
    const b = bCounts.reduce((sum, count) => sum + count, 0);
    const uses = a + b;
    if (uses < 3 || a / uses < 0.8 || !consistent(aCounts, a, 3, n)) continue;
    markers.push({ class: 'variant', marker: pair.a, over: pair.b, share: round(a / uses), count: a, ...describe(samples, aCounts) });
  }

  // Contraction pairs fold into one marker: full forms over contractions, or
  // the reverse, at 80% or more of at least 5 uses across every pair.
  const contracted = new Array(n).fill(0);
  const full = new Array(n).fill(0);
  const pairs = [];
  for (const { pair, aCounts, bCounts } of contractionPairs) {
    aCounts.forEach((count, index) => { contracted[index] += count; });
    bCounts.forEach((count, index) => { full[index] += count; });
    const contractionCount = aCounts.reduce((sum, count) => sum + count, 0);
    const fullCount = bCounts.reduce((sum, count) => sum + count, 0);
    if (contractionCount + fullCount > 0) pairs.push({ contraction: pair.a, full: pair.b, contraction_count: contractionCount, full_count: fullCount });
  }
  const contractedTotal = contracted.reduce((sum, count) => sum + count, 0);
  const fullTotal = full.reduce((sum, count) => sum + count, 0);
  const uses = contractedTotal + fullTotal;
  if (uses >= 5) {
    let preferred = null;
    if (fullTotal / uses >= 0.8) preferred = { marker: FULL_FORMS, over: CONTRACTIONS, count: fullTotal, perSample: full };
    else if (contractedTotal / uses >= 0.8) preferred = { marker: CONTRACTIONS, over: FULL_FORMS, count: contractedTotal, perSample: contracted };
    if (preferred && consistent(preferred.perSample, preferred.count, 3, n)) {
      markers.push({
        class: 'variant',
        marker: preferred.marker,
        over: preferred.over,
        share: round(preferred.count / uses),
        count: preferred.count,
        ...describe(samples, preferred.perSample),
        pairs
      });
    }
  }
  return markers.sort((left, right) => right.count - left.count || left.marker.localeCompare(right.marker));
}

function punctuationMarkers(samples, analysed, reference, totalWords) {
  const n = samples.length;
  const perSampleCounts = analysed.map(punctuation);
  const markers = [];
  for (const key of PUNCTUATION_KEYS) {
    const perSample = perSampleCounts.map((counts) => counts[key]);
    const count = perSample.reduce((sum, value) => sum + value, 0);
    if (!consistent(perSample, count, 2, n)) continue;
    const rate = totalWords > 0 ? (count / totalWords) * 1000 : 0;
    const ref = reference[key];
    if (!(rate >= 2 * ref || rate <= 0.5 * ref)) continue;
    markers.push({ class: 'punctuation', marker: key, rate: round(rate), reference: round(ref), count, ...describe(samples, perSample) });
  }
  return markers;
}

function idiomMarkers(samples, analysed, idioms) {
  const n = samples.length;
  const groups = new Map();
  analysed.forEach((sample, sampleIndex) => {
    for (const { tokens } of sample.sentences) {
      for (const idiom of idioms) {
        for (const use of alteredUses(tokens, idiom)) {
          const key = `${idiom.usualText}\u0000${use.core}`;
          let group = groups.get(key);
          if (!group) {
            group = { usual: idiom.usualText, perSample: new Array(n).fill(0), total: 0, forms: new Map() };
            groups.set(key, group);
          }
          group.perSample[sampleIndex] += 1;
          group.total += 1;
          group.forms.set(use.words, (group.forms.get(use.words) || 0) + 1);
        }
      }
    }
  });
  const markers = [];
  for (const group of groups.values()) {
    if (!consistent(group.perSample, group.total, 2, n)) continue;
    const marker = [...group.forms.entries()]
      .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))[0][0];
    markers.push({ class: 'idiom', marker, usual: group.usual, count: group.total, ...describe(samples, group.perSample) });
  }
  return markers.sort((left, right) => right.count - left.count || left.marker.localeCompare(right.marker));
}

function runProfile(values) {
  const samplesPath = screenSource('--samples', requireFlag(values, '--samples'));
  const baselinePath = values['--baseline'] !== undefined ? screenSource('--baseline', values['--baseline']) : null;
  const outputPath = values['--output'] !== undefined ? screenDestination('--output', values['--output']) : null;

  capBytes([['--samples', samplesPath], ...(baselinePath ? [['--baseline', baselinePath]] : [])]);
  const samples = loadSamples(samplesPath);
  capBytes([['--samples', samplesPath], ...(baselinePath ? [['--baseline', baselinePath]] : []), ...samples.map((sample) => [`sample ${sample.id}`, sample.path])]);
  const baseline = baselinePath ? loadBaseline(baselinePath) : null;

  if (outputPath) {
    const inputs = [['--samples', samplesPath], ...(baselinePath ? [['--baseline', baselinePath]] : []), ...samples.map((sample) => [`sample ${sample.id}`, sample.path])];
    for (const [label, path] of inputs) {
      if (sameFile(outputPath, path)) fail(`Error: --output ${outputPath} is the ${label} input; writing there would destroy it. Pass a new path for the profile.`);
    }
  }

  const texts = samples.map((sample) => readUtf8(sample.path, `sample ${sample.id}`));
  capWords(texts, 'the samples');

  const data = loadData();
  for (const sample of samples) {
    sample.weight = REGISTER_WEIGHT[sample.register] * ORIGIN_WEIGHT[sample.origin];
  }
  const analysed = texts.map((text) => analyse(text, data));
  const totalWords = analysed.reduce((sum, sample) => sum + sample.words, 0);

  let status = 'enough';
  if (samples.length < 2 || totalWords < 1500) status = 'too-little-text';
  else if (totalWords < 3000) status = 'thin';

  let markers = [];
  let ranges = null;
  if (status !== 'too-little-text') {
    const isCommon = makeCommonTest(data.common, baseline);
    const names = properNames(analysed);
    markers = [
      ...signatureMarkers(samples, analysed, isCommon, names, data),
      ...variantMarkers(samples, analysed, data),
      ...punctuationMarkers(samples, analysed, data.reference, totalWords),
      ...idiomMarkers(samples, analysed, data.idioms)
    ];
    const punctuationKeys = markers.filter((marker) => marker.class === 'punctuation').map((marker) => marker.marker);
    ranges = profileRanges(analysed, punctuationKeys, data);
  }

  const profile = {
    status,
    words: totalWords,
    samples: samples.length,
    registers: new Set(samples.map((sample) => sample.register)).size,
    origins: new Set(samples.map((sample) => sample.origin)).size,
    markers,
    ranges
  };

  if (!outputPath) return profile;
  writeDestination('--output', outputPath, `${JSON.stringify(profile, null, 2)}\n`);
  return { written: outputPath };
}

// ---------------------------------------------------------------- check

const MARKER_CLASSES = new Set(['signature', 'variant', 'punctuation', 'idiom']);

function loadProfile(profilePath) {
  const profile = readJson(profilePath, '--profile');
  const refuse = (why) => fail(`Error: --profile ${profilePath} is not a voice-lexicon profile: ${why}. Pass the JSON that "profile" wrote, or a copy of it holding only confirmed markers.`);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) refuse('it is not a JSON object');
  if (typeof profile.words !== 'number' || profile.words < 0) refuse('it has no words count');
  if (!Array.isArray(profile.markers)) refuse('it has no markers array');
  profile.markers.forEach((marker, index) => {
    if (!marker || typeof marker !== 'object') refuse(`marker ${index} is not an object`);
    if (!MARKER_CLASSES.has(marker.class)) refuse(`marker ${index} has class ${JSON.stringify(marker.class)}`);
    if (typeof marker.marker !== 'string' || marker.marker.trim() === '') refuse(`marker ${index} has no marker text`);
    if (marker.class === 'signature' && typeof marker.count !== 'number') refuse(`signature marker "${marker.marker}" has no count`);
    if (marker.class === 'signature' && marker.forms !== undefined
      && (!Array.isArray(marker.forms) || marker.forms.length === 0 || marker.forms.some((form) => typeof form !== 'string' || form.trim() === ''))) {
      refuse(`signature marker "${marker.marker}" has forms that are not a non-empty list of phrases`);
    }
    if (marker.class === 'variant' && (typeof marker.over !== 'string' || marker.over.trim() === '')) refuse(`variant marker "${marker.marker}" has no over form`);
  });
  checkRanges(profile.ranges, refuse);
  return profile;
}

// A band's keys: the five profile writes, and the three a confirmed copy adds
// to a range the person answered (check judges by low and high alone).
const BAND_KEYS = new Set(['low', 'q1', 'median', 'q3', 'high', 'decision', 'polish', 'measured']);

/** A profile's ranges: absent or null, or features each holding a band of numbers. */
function checkRanges(ranges, refuse) {
  if (ranges === undefined || ranges === null) return;
  if (typeof ranges !== 'object' || Array.isArray(ranges)) refuse('its ranges is not an object');
  const { features } = ranges;
  if (!features || typeof features !== 'object' || Array.isArray(features)) refuse('its ranges has no features object');
  for (const [name, held] of Object.entries(features)) {
    if (!RANGE_NAMES.has(name)) refuse(`its ranges names the feature "${name}", which is not one of ${[...RANGE_NAMES].join(', ')}`);
    if (!held || typeof held !== 'object' || Array.isArray(held)) refuse(`its ranges feature "${name}" is not an object of low, q1, median, q3 and high`);
    for (const key of Object.keys(held)) {
      if (!BAND_KEYS.has(key)) refuse(`its ranges feature "${name}" has the key "${key}", which is not one of ${[...BAND_KEYS].join(', ')}`);
    }
    for (const key of ['low', 'median', 'high']) {
      if (!Number.isFinite(held[key])) refuse(`its ranges feature "${name}" has no numeric ${key}`);
    }
    for (const key of ['q1', 'q3']) {
      if (held[key] !== null && !Number.isFinite(held[key])) refuse(`its ranges feature "${name}" has a ${key} that is neither a number nor null`);
    }
    // Every feature is a rate, a ratio or a mean, never below zero.
    for (const key of ['low', 'q1', 'median', 'q3', 'high']) {
      if (held[key] !== null && held[key] < 0) refuse(`its ranges feature "${name}" has a negative ${key} (${held[key]})`);
    }
    // Only low against high: a narrowed copy holds a high below its median
    // and q3 on purpose, so no other order is checked.
    if (held.low > held.high) refuse(`its ranges feature "${name}" has low ${held.low} above high ${held.high}`);
    checkDecision(name, held, refuse);
  }
}

function checkDecision(name, held, refuse) {
  if (held.decision !== undefined && held.decision !== 'keep' && held.decision !== 'polish') {
    refuse(`its ranges feature "${name}" has decision ${JSON.stringify(held.decision)}; it must be "keep" or "polish"`);
  }
  if (held.polish !== undefined && held.polish !== 'high' && held.polish !== 'low') {
    refuse(`its ranges feature "${name}" has polish ${JSON.stringify(held.polish)}; it must be "high" or "low"`);
  }
  if (held.measured === undefined) return;
  const { measured } = held;
  if (!measured || typeof measured !== 'object' || Array.isArray(measured)) refuse(`its ranges feature "${name}" has a measured that is not an object of low and high`);
  for (const key of Object.keys(measured)) {
    if (key !== 'low' && key !== 'high') refuse(`its ranges feature "${name}" has measured key "${key}"; measured holds only low and high`);
  }
  for (const key of ['low', 'high']) {
    if (!Number.isFinite(measured[key])) refuse(`its ranges feature "${name}" has a measured with no numeric ${key}`);
    if (measured[key] < 0) refuse(`its ranges feature "${name}" has a negative measured ${key} (${measured[key]})`);
  }
}

// A term made only of letters, combining marks, apostrophes, hyphens and the
// spaces between words matches as words; anything else matches as a literal,
// case-insensitive string.
const WORD_TERM = /^[\p{L}\p{M}'’\-\s]+$/u;

function loadAvoid(avoidPath) {
  const terms = [];
  const seen = new Set();
  for (const line of readUtf8(avoidPath, '--avoid').split(LINE_BREAK)) {
    const term = line.normalize('NFC').trim();
    if (term === '') continue;
    const key = normalize(term);
    if (seen.has(key)) continue;
    seen.add(key);
    const literal = !WORD_TERM.test(term) || words(key).length === 0;
    terms.push({ term, key, literal, tokens: literal ? [] : words(key) });
  }
  return terms;
}

function sumForms(sentences, forms) {
  return forms.reduce((sum, form) => sum + countSequence(sentences, form, 'vtokens'), 0);
}

const SHORT_WORDS = 250;
const MISSING_WORDS = 500;

/**
 * A signature marker's uses are the sum over its forms when the profile
 * lists them, so a folded plural counts; any other marker, its own words.
 */
function markerUses(sentences, marker) {
  const phrases = marker.class === 'signature' && Array.isArray(marker.forms) ? marker.forms : [marker.marker];
  const keys = new Set(phrases.map((phrase) => words(normalize(phrase)).join(' ')));
  let count = 0;
  for (const key of keys) if (key) count += countSequence(sentences, key.split(' '));
  return count;
}

/**
 * The dose: signature markers and altered sayings together, about one use
 * per 500 words, and each marker once until the draft reaches 2,000 words.
 * Identity rests on a marker being there at all; repeats only caricature it.
 */
function dosage(draft, markers) {
  const budget = Math.max(1, Math.floor(draft.words / 500));
  const cap = Math.max(1, Math.floor(draft.words / 1000));
  const uses = markers
    .filter((marker) => marker.class === 'signature' || marker.class === 'idiom')
    .map((marker) => ({ marker: marker.marker, count: markerUses(draft.sentences, marker) }))
    .filter((use) => use.count > 0)
    .sort((left, right) => right.count - left.count || left.marker.localeCompare(right.marker));
  const used = uses.reduce((sum, use) => sum + use.count, 0);
  return {
    budget,
    used,
    over: used > budget,
    uses,
    repeated: uses.filter((use) => use.count > cap).map((use) => ({ ...use, cap }))
  };
}

function runCheck(values) {
  const draftPath = screenSource('--draft', requireFlag(values, '--draft'));
  const profilePath = screenSource('--profile', requireFlag(values, '--profile'));
  const avoidPath = values['--avoid'] !== undefined ? screenSource('--avoid', values['--avoid']) : null;

  capBytes([['--draft', draftPath], ['--profile', profilePath], ...(avoidPath ? [['--avoid', avoidPath]] : [])]);
  const profile = loadProfile(profilePath);
  const terms = avoidPath ? loadAvoid(avoidPath) : [];
  const draftText = readUtf8(draftPath, '--draft');
  capWords([draftText], 'the draft and its inputs');

  const data = loadData();
  const draft = analyse(draftText, data);

  const avoided = [];
  for (const { term, key, literal, tokens } of terms) {
    const count = literal ? countLiteral(draft.literal, key) : countSequence(draft.sentences, tokens);
    if (count > 0) avoided.push({ term, count });
  }

  const short = draft.words < SHORT_WORDS;
  if (draft.words < 50) {
    return { status: 'too-little-text', words: draft.words, short, avoided, dosage: null, contradicted: null, ranges: null, missing: null, pass: false };
  }

  const contractionPairs = data.variants.filter((pair) => pair.kind === 'contraction');
  const contractionForms = contractionPairs.map((pair) => pair.aTokens);
  const fullForms = contractionPairs.map((pair) => pair.bTokens);
  // A pair the profile records the writer using the other way is their own habit, not a
  // contradiction of the folded preference: "can't" every time beside "do not" every time.
  // Pairs the profile never saw, and profiles without `pairs`, fall under the folded preference.
  const exemptForms = (marker, usedSide) => {
    const rows = (Array.isArray(marker.pairs) ? marker.pairs : []).filter((p) => p && typeof p === 'object' && typeof p.contraction === 'string');
    const record = new Map(rows.map((p) => [normalize(p.contraction), p]));
    return contractionPairs
      .filter((pair) => {
        const seen = record.get(normalize(pair.a));
        if (!seen) return true;
        const used = usedSide === 'contraction' ? seen.contraction_count : seen.full_count;
        const other = usedSide === 'contraction' ? seen.full_count : seen.contraction_count;
        return !(Number(used) >= Number(other) && Number(used) > 0);
      })
      .map((pair) => (usedSide === 'contraction' ? pair.aTokens : pair.bTokens));
  };

  const contradicted = [];
  let present = 0;
  let eligible = 0;
  for (const marker of profile.markers) {
    if (marker.class === 'signature') {
      eligible += 1;
      if (markerUses(draft.sentences, marker) > 0) present += 1;
    } else if (marker.class === 'variant') {
      eligible += 1;
      const name = normalize(marker.marker);
      const over = normalize(marker.over);
      let usedCount;
      if (name === FULL_FORMS && over === CONTRACTIONS) {
        if (sumForms(draft.sentences, fullForms) > 0) present += 1;
        usedCount = sumForms(draft.sentences, exemptForms(marker, 'contraction'));
      } else if (name === CONTRACTIONS && over === FULL_FORMS) {
        if (sumForms(draft.sentences, contractionForms) > 0) present += 1;
        usedCount = sumForms(draft.sentences, exemptForms(marker, 'full'));
      } else {
        if (countSequence(draft.sentences, words(name), 'vtokens') > 0) present += 1;
        usedCount = countSequence(draft.sentences, words(over), 'vtokens');
      }
      if (usedCount > 0) contradicted.push({ marker: marker.marker, used: marker.over, count: usedCount });
    }
  }
  // Information only: judged from 500 words, and never read by pass.
  const missing = draft.words >= MISSING_WORDS ? eligible >= 3 && present === 0 : null;
  const dose = dosage(draft, profile.markers);
  const ranges = !short && profile.ranges ? judgeRanges(profile.ranges, profile.markers, draft, data) : null;

  return {
    status: 'checked',
    words: draft.words,
    short,
    avoided,
    dosage: dose,
    contradicted,
    ranges,
    missing,
    pass: avoided.length === 0 && contradicted.length === 0 && dose.repeated.length === 0 && !dose.over
  };
}

// ---------------------------------------------------------------- entry

export function runVoiceLexicon(argv) {
  const args = parseArgs(argv);
  if (args.help === 'all') return USAGE;
  if (args.help) return HELP[args.help];
  if (args.command === 'profile') return runProfile(args.values);
  if (args.command === 'check') return runCheck(args.values);
  return fail(`Error: unknown command "${args.command}". ${HELP_HINT}`);
}

export { USAGE };
