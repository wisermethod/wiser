/**
 * voice-report-html core: extract a root's bound voice.md, its confirmed
 * voice-lexicon profile, and the voice key's state line in the root's
 * AGENTS.md into one data object, and render that object as one static HTML
 * page. Node built-ins only. It counts nothing and judges nothing: every value
 * on the page is copied from those files, or is a rated position the caller
 * supplies with the trait line it rests on.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonical, fail, screenDestination, screenSource, writeDestination } from './lib/paths.js';

export const VERSION = '0.4.1';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CSS = join(SCRIPT_DIR, '..', 'template', 'report.css');
const HELP_HINT = 'Run "node scripts/voice-report-html.js help" for usage.';

const VOICE_CAP = 2_000_000;
const PROFILE_CAP = 20_000_000;
const DATA_CAP = 20_000_000;

const KEY_LINES = {
  'voice-authority-name': 'name',
  'voice-authority-basis': 'basis',
  'voice-confirmation-date': 'confirmed',
  'voice-authority-fallback-signoff': 'fallbackSignoff',
  'voice-profile': 'profile'
};

const SECTIONS = {
  identity: 'Identity',
  routing: 'Routing Table',
  audience: 'Audience',
  tone: 'Tone',
  vocabulary: 'Vocabulary',
  structure: 'Structural Habits',
  prohibitions: 'Prohibitions'
};

export const RANGE_FEATURES = ['sentence_mean', 'sentence_cv', 'long_sentences', 'first_singular', 'first_plural', 'second_person', 'hedges', 'boosters'];
export const PUNCTUATION_FEATURES = ['em_dash', 'en_dash', 'double_hyphen', 'semicolon', 'ellipsis', 'exclamation', 'parenthesis', 'serial_comma', 'initial_and', 'initial_but', 'initial_so'];
const FEATURE_KEYS = ['low', 'median', 'high', 'q1', 'q3', 'decision', 'polish', 'measured'];
export const RATED_KEYS = ['involved', 'explicit', 'abstract', 'formality'];
const RATED_ENTRY_KEYS = ['key', 'step', 'trait', 'evidence'];

const NA_LABEL = /\[Not available:[^\]]*\]/g;
const PROMPT_LINE = /^\*[^*\s].*\*$/;

// ---------------------------------------------------------------- arguments

const COMMANDS = {
  extract: { flags: ['--voice', '--root', '--output'], required: ['--voice', '--root'] },
  render: { flags: ['--data', '--output', '--date'], required: ['--data', '--output'] },
  fresh: { flags: ['--page', '--voice', '--root'], required: ['--page', '--voice', '--root'] },
  inline: { flags: ['--data'], required: ['--data'] }
};

export const USAGE = `voice-report-html ${VERSION}: one static HTML page showing a root's bound voice.

Usage:
  node scripts/voice-report-html.js help
  node scripts/voice-report-html.js extract --voice <file> --root <dir> [--output <file>]
  node scripts/voice-report-html.js render --data <file> --output <file> [--date YYYY-MM-DD]
  node scripts/voice-report-html.js fresh --page <file> --voice <file> --root <dir>
  node scripts/voice-report-html.js inline --data <file>

extract  Read the bound voice.md, the confirmed profile its voice-profile: line
         names, and the voice key's state line under ## Onboarding in the root's
         AGENTS.md, and print (or write to --output) one data object.
render   Validate a data object, rated dials included, and write the page to --output.
fresh    Say whether a page still shows the voice as it is set now: the voice.md and
         profile it read are the same files, unchanged, and the voice key's state
         line reads as it did. Writes nothing.
inline   Validate a data object and print the dials as one HTML fragment for a host
         that draws HTML in the conversation. Writes nothing.

Every path is absolute. --output never overwrites: an existing file is refused.
Nothing is written but the --output file. No command takes --env, and this tool
installs nothing, so --install is refused by name.`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    for (const arg of rest) if (arg !== '--help' && arg !== '-h') fail(`Error: unknown argument "${arg}" beside help. ${HELP_HINT}`);
    return { command: 'help' };
  }
  const spec = COMMANDS[command];
  if (!spec) fail(`Error: unknown command "${command}". ${HELP_HINT}`);
  const options = {};
  let help = false;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (arg === '--install') fail(`Error: --install is refused; this tool installs nothing. ${HELP_HINT}`);
    if (!arg.startsWith('--')) fail(`Error: argument "${arg}" belongs to no flag. ${HELP_HINT}`);
    if (!spec.flags.includes(arg)) fail(`Error: unknown flag ${arg} for ${command}. ${HELP_HINT}`);
    if (Object.hasOwn(options, arg)) fail(`Error: ${arg} is given twice. ${HELP_HINT}`);
    const value = rest[i + 1];
    if (value === undefined || value.trim() === '' || value.startsWith('-')) fail(`Error: ${arg} needs a value. ${HELP_HINT}`);
    options[arg] = value;
    i += 1;
  }
  if (help) return { command: 'help' };
  for (const flag of spec.required) if (!options[flag]) fail(`Error: ${command} needs ${flag}. ${HELP_HINT}`);
  return { command, options };
}

// ------------------------------------------------------------------ reading

function readText(name, path, cap) {
  const size = statSync(path).size;
  if (size > cap) fail(`Error: ${name} ${path} is ${size} bytes, over this tool's cap of ${cap}. Pass the bound file itself.`);
  const buffer = readFileSync(path);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    fail(`Error: ${name} ${path} is not valid UTF-8. Save it as UTF-8 and run again.`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text: text.normalize('NFC').replace(/\r\n?/g, '\n'), sha256: createHash('sha256').update(buffer).digest('hex') };
}

function screenDirectory(name, value) {
  if (!isAbsolute(value)) fail(`Error: ${name} must be an absolute path; got "${value}". Pass the full path.`);
  const resolved = canonical(name, value);
  let info;
  try { info = statSync(resolved); } catch { fail(`Error: ${name} names nothing at ${resolved}. Pass the owning root's folder.`); }
  if (!info.isDirectory()) fail(`Error: ${name} ${resolved} is not a folder. Pass the owning root's folder.`);
  return resolved;
}

function inside(root, path) {
  return path === root || path.startsWith(root + sep);
}

// ---------------------------------------------------------------- voice.md

function labelsIn(text) {
  return text.match(NA_LABEL) || [];
}

function onlyLabels(text) {
  return text.replace(NA_LABEL, '').replace(/[\s.;:,-]/g, '') === '';
}

function parseRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function readSection(lines) {
  const items = [];
  const rows = [];
  let prompt = false;
  let paragraph = [];
  let tableLine = 0;
  const flush = () => {
    if (paragraph.length) items.push(paragraph.join(' '));
    paragraph = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { flush(); tableLine = 0; continue; }
    if (PROMPT_LINE.test(line)) { flush(); prompt = true; continue; }
    if (line.startsWith('|')) {
      flush();
      tableLine += 1;
      if (tableLine === 1) continue;
      if (/^\|?[\s:|-]+\|?$/.test(line)) continue;
      rows.push(parseRow(line));
      continue;
    }
    tableLine = 0;
    const bullet = /^(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) { flush(); items.push(bullet[1]); continue; }
    paragraph.push(line);
  }
  flush();
  const content = items.filter((item) => !onlyLabels(item));
  let state = 'answered';
  if (content.length === 0 && rows.length === 0) state = items.length ? 'not-available' : (prompt ? 'prompt' : 'empty');
  return { state, items, rows };
}

export function parseVoice(text) {
  const lines = text.split('\n');
  let subject = null;
  const authority = { name: null, basis: null, confirmed: null, fallbackSignoff: null };
  let profile = null;
  const sections = {};
  const other = [];
  let current = null;
  let buffer = [];
  let inPreamble = false;

  const close = () => {
    if (current === null) return;
    const parsed = readSection(buffer);
    const key = Object.keys(SECTIONS).find((k) => SECTIONS[k].toLowerCase() === current.toLowerCase());
    if (key) sections[key] = parsed;
    else other.push({ heading: current, ...parsed });
    buffer = [];
  };

  for (const line of lines) {
    if (/<!--\s*provenance-preamble\s*-->/.test(line)) { inPreamble = true; continue; }
    if (/<!--\s*\/provenance-preamble\s*-->/.test(line)) { inPreamble = false; continue; }
    if (inPreamble) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { close(); current = heading[1]; continue; }
    if (current === null) {
      const title = /^#\s+Voice of\s+(.+?)\s*$/.exec(line);
      if (title && subject === null) { subject = title[1]; continue; }
      const key = /^([a-z-]+):\s*(.*?)\s*$/.exec(line);
      if (key && Object.hasOwn(KEY_LINES, key[1])) {
        const value = key[2] === '' ? null : key[2];
        // A key line holding a digit carries a verification anchor on the full path, such as ' [V7]'.
        if (key[1] === 'voice-profile') profile = value === null ? null : (value.replace(/\s*\[V\d+\]\s*$/, '') || null);
        else authority[KEY_LINES[key[1]]] = value;
      }
      continue;
    }
    buffer.push(line);
  }
  close();

  for (const key of Object.keys(SECTIONS)) {
    if (!sections[key]) sections[key] = { state: 'missing', items: [], rows: [] };
  }
  const notAvailable = [];
  for (const [key, section] of Object.entries(sections)) {
    for (const item of section.items) for (const label of labelsIn(item)) notAvailable.push({ section: SECTIONS[key], label });
  }
  for (const section of other) {
    for (const item of section.items) for (const label of labelsIn(item)) notAvailable.push({ section: section.heading, label });
  }
  if (authority.confirmed && labelsIn(authority.confirmed).length) {
    notAvailable.push({ section: 'voice-confirmation-date', label: labelsIn(authority.confirmed)[0] });
  }

  const built = Object.values(sections).some((section) => section.state === 'answered');
  return { subject: subject && !/^\[.*\]$/.test(subject) ? subject : null, authority, profile, sections, other, notAvailable, built };
}

// --------------------------------------------------------------- AGENTS.md

const KEY_STATES = ['complete', 'provisional', 'blocked'];
// A key is open in any state but complete; absent and unreadable say nothing about it.
const OPEN_STATES = ['provisional', 'blocked', 'unrecognized'];
const ONBOARDING_STATES = [...KEY_STATES, 'unrecognized', 'absent', 'unreadable'];

/**
 * The voice key's state line under the root's ## Onboarding heading, as
 * skills/Onboard Root/ writes it: `- voice: provisional (...; owner: ...)`.
 * The state is the line's first word where that is complete, provisional or
 * blocked, unrecognized where it is anything else, and absent where the
 * heading or the line is not there. The line is kept as written. A heading
 * may be indented up to three spaces and carry closing hashes, as Markdown
 * allows. A line edited by hand is still the voice line: the key in any case,
 * wrapped in emphasis or code, after a dash, star, plus or number. Trailing
 * .,;: leave the state word, as Onboard Root's own gate reads it.
 */
export function parseOnboarding(text) {
  let inSection = false;
  for (const line of text.split('\n')) {
    const heading = /^ {0,3}##\s+(.+?)\s*$/.exec(line);
    if (heading) { inSection = heading[1].replace(/\s+#+$/, '').toLowerCase() === 'onboarding'; continue; }
    if (!inSection) continue;
    const entry = /^\s*(?:[-*+]|\d+[.)])\s+[*_`]*voice[*_`]*\s*:[*_`]*\s*(.+?)\s*$/i.exec(line);
    if (entry) {
      const word = entry[1].replace(/^[*_`]+/, '').split(/\s/)[0].replace(/[.,;:*_`]+$/, '').toLowerCase();
      return { state: KEY_STATES.includes(word) ? word : 'unrecognized', line: entry[1] };
    }
  }
  return { state: 'absent', line: null };
}

// ----------------------------------------------------------------- profile

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readProfile(object, shown) {
  if (object === null || typeof object !== 'object' || Array.isArray(object)) {
    fail(`Error: the profile ${shown} is not a JSON object. voice-profile: should name the confirmed copy Build Voice wrote.`);
  }
  const features = {};
  const ranges = object.ranges;
  let chunks = null;
  let chunkWords = null;
  if (ranges !== undefined && ranges !== null) {
    if (typeof ranges !== 'object' || Array.isArray(ranges) || typeof ranges.features !== 'object' || ranges.features === null || Array.isArray(ranges.features)) {
      fail(`Error: the profile ${shown} has a ranges value whose features is not an object. Pass the confirmed copy voice-lexicon validates.`);
    }
    chunks = isNumber(ranges.chunks) ? ranges.chunks : null;
    chunkWords = isNumber(ranges.chunk_words) ? ranges.chunk_words : null;
    for (const [name, feature] of Object.entries(ranges.features)) {
      if (!RANGE_FEATURES.includes(name) && !PUNCTUATION_FEATURES.includes(name)) {
        fail(`Error: the profile ${shown} has an unknown range feature "${name}". This tool reads only the features voice-lexicon defines.`);
      }
      if (feature === null || typeof feature !== 'object' || Array.isArray(feature)) fail(`Error: range feature "${name}" in ${shown} is not an object.`);
      for (const key of Object.keys(feature)) {
        if (!FEATURE_KEYS.includes(key)) fail(`Error: range feature "${name}" in ${shown} has an unknown key "${key}". This tool reads only ${FEATURE_KEYS.join(', ')}.`);
      }
      for (const key of ['low', 'median', 'high']) {
        if (!isNumber(feature[key])) fail(`Error: range feature "${name}" in ${shown} has no numeric ${key}.`);
      }
      for (const key of ['q1', 'q3']) {
        if (feature[key] !== undefined && feature[key] !== null && !isNumber(feature[key])) fail(`Error: range feature "${name}" in ${shown} has a ${key} that is neither a number nor null.`);
      }
      if (feature.decision !== undefined && feature.decision !== 'keep' && feature.decision !== 'polish') {
        fail(`Error: range feature "${name}" in ${shown} has decision "${feature.decision}"; it must be keep or polish.`);
      }
      if (feature.polish !== undefined && feature.polish !== 'high' && feature.polish !== 'low') {
        fail(`Error: range feature "${name}" in ${shown} has polish "${feature.polish}"; it must be high or low.`);
      }
      if (feature.measured !== undefined && (feature.measured === null || typeof feature.measured !== 'object' || !isNumber(feature.measured.low) || !isNumber(feature.measured.high) || Object.keys(feature.measured).length !== 2)) {
        fail(`Error: range feature "${name}" in ${shown} has a measured value that is not { low, high } numbers.`);
      }
      features[name] = {
        low: feature.low,
        median: feature.median,
        high: feature.high,
        q1: isNumber(feature.q1) ? feature.q1 : null,
        q3: isNumber(feature.q3) ? feature.q3 : null,
        decision: feature.decision ?? null,
        polish: feature.decision === 'polish' ? (feature.polish ?? null) : null,
        measured: feature.decision === 'polish' && feature.measured ? { low: feature.measured.low, high: feature.measured.high } : null
      };
    }
  }
  const markers = [];
  if (Array.isArray(object.markers)) {
    for (const marker of object.markers) {
      if (!marker || typeof marker !== 'object' || typeof marker.marker !== 'string') continue;
      const kept = { class: typeof marker.class === 'string' ? marker.class : null, marker: marker.marker };
      for (const key of ['over', 'usual', 'basis']) if (typeof marker[key] === 'string') kept[key] = marker[key];
      for (const key of ['count', 'rate', 'reference', 'share']) if (isNumber(marker[key])) kept[key] = marker[key];
      if (Array.isArray(marker.samples)) kept.samples = marker.samples.filter((s) => typeof s === 'string');
      markers.push(kept);
    }
  }
  return {
    words: isNumber(object.words) ? object.words : null,
    samples: isNumber(object.samples) ? object.samples : null,
    chunks,
    chunkWords,
    features,
    markers
  };
}

// ------------------------------------------------------------------ extract

/** A date as YYYY-MM-DD in local time, so every date on the page reads on one clock. */
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function today() {
  return localDate(new Date());
}

/**
 * The files a report reads, screened and fingerprinted: the bound voice.md,
 * the profile its voice-profile: line names, and the root's own AGENTS.md for
 * the voice key's state line. extract and fresh both start here.
 * The profile's state is absent (no line), outside (an absolute path or one
 * leaving the root), missing-file, or read, with its text when read.
 */
function readInputs(rootOption, voiceOption) {
  const root = screenDirectory('--root', rootOption);
  const voicePath = screenSource('--voice', voiceOption);
  if (!inside(root, voicePath)) fail(`Error: --voice ${voicePath} is not inside --root ${root}. Pass the file the owning root's Provides block binds as voice.`);
  const voice = readText('--voice', voicePath, VOICE_CAP);
  const parsed = parseVoice(voice.text);
  const voiceRel = relative(root, voicePath).split(sep).join('/');
  const profile = { path: parsed.profile, state: 'absent', candidate: null, text: null, sha256: null };
  if (parsed.profile) {
    const candidate = isAbsolute(parsed.profile) ? null : canonical('voice-profile', resolve(root, parsed.profile));
    if (candidate === null || !inside(root, candidate)) {
      Object.assign(profile, { state: 'outside', candidate });
    } else {
      let exists = true;
      try { exists = statSync(candidate).isFile(); } catch { exists = false; }
      if (!exists) Object.assign(profile, { state: 'missing-file', candidate });
      else Object.assign(profile, { state: 'read', candidate, ...readText('voice-profile', candidate, PROFILE_CAP) });
    }
  }
  // Where the voice key stands is the root's Onboarding state line, not voice.md:
  // a key reopened after its confirmation date is provisional again there.
  // A file there that cannot be read (not a regular file, a broken link, unreadable,
  // over the cap, or not UTF-8) leaves the voice's standing unknown: the report still
  // runs, and the page never calls the voice confirmed on it.
  const agentsPath = join(root, 'AGENTS.md');
  let onboarding = { path: 'AGENTS.md', state: 'absent', line: null };
  let present = false;
  try { lstatSync(agentsPath); present = true; } catch { present = false; }
  if (present) {
    try {
      if (!statSync(agentsPath).isFile()) throw new Error('not a regular file');
      onboarding = { path: 'AGENTS.md', ...parseOnboarding(readText('AGENTS.md', agentsPath, VOICE_CAP).text) };
    } catch {
      onboarding = { path: 'AGENTS.md', state: 'unreadable', line: null };
    }
  }
  return { root, voicePath, voiceRel, voice, parsed, profile, onboarding };
}

export function extract(options) {
  const { root, voicePath, voiceRel, voice, parsed, profile: input, onboarding } = readInputs(options['--root'], options['--voice']);

  let profile = { path: parsed.profile, state: 'absent', sha256: null };
  let measures = { words: null, samples: null, chunks: null, chunkWords: null, features: {}, markers: [] };
  if (input.state === 'outside') {
    if (input.candidate === null) fail(`Error: voice-profile: in ${voicePath} is an absolute path; Build Voice writes it as a path from the owning root.`);
    fail(`Error: voice-profile: in ${voicePath} names ${input.candidate}, outside the owning root ${root}. Build Voice writes the confirmed copy inside the root.`);
  }
  if (input.state === 'missing-file') {
    profile = { path: parsed.profile, state: 'missing-file', sha256: null };
  } else if (input.state === 'read') {
    let object;
    try { object = JSON.parse(input.text); } catch { fail(`Error: the profile ${input.candidate} is not valid JSON.`); }
    measures = readProfile(object, input.candidate);
    profile = { path: parsed.profile, state: 'read', sha256: input.sha256 };
  }

  const modified = statSync(voicePath).mtime;
  const data = {
    tool: 'voice-report-html',
    version: VERSION,
    extracted: today(),
    state: parsed.built ? 'built' : 'unbuilt',
    subject: parsed.subject,
    voice: { path: voiceRel, sha256: voice.sha256, modified: localDate(modified) },
    authority: parsed.authority,
    onboarding,
    profile: { ...profile, words: measures.words, samples: measures.samples, chunks: measures.chunks, chunkWords: measures.chunkWords },
    features: measures.features,
    markers: measures.markers,
    sections: parsed.sections,
    other: parsed.other,
    notAvailable: parsed.notAvailable,
    rated: []
  };

  if (options['--output']) {
    const destination = screenDestination('--output', options['--output']);
    writeDestination('--output', destination, `${JSON.stringify(data, null, 2)}\n`);
    return { written: destination, state: data.state, profile: profile.state };
  }
  return data;
}

// ------------------------------------------------------------------ validate

function normal(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** Evidence ids a line cites: each E<n>, and every id inside a range written E1 to E5, E1-E5 or E1–E5. */
export function citedIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/\bE(\d+)\s*(?:to|-|\u2013)\s*E(\d+)\b/g)) {
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (to >= from && to - from <= 200) for (let n = from; n <= to; n += 1) ids.add(`E${n}`);
  }
  for (const match of text.matchAll(/\bE(\d+)\b/g)) ids.add(`E${Number(match[1])}`);
  return ids;
}

export function validateData(data, shown) {
  if (!data || typeof data !== 'object' || data.tool !== 'voice-report-html') {
    fail(`Error: ${shown} is not a data object this tool's extract wrote. Run extract first.`);
  }
  if (data.state !== 'built') {
    fail(`Error: ${shown} describes a voice that has not been built: every section of voice.md is still a prompt line or a Not available label. Run skills/Build Voice/ first; no report is written for an unbuilt voice.`);
  }
  for (const key of ['sections', 'features', 'authority', 'onboarding', 'voice', 'profile']) {
    if (!data[key] || typeof data[key] !== 'object') fail(`Error: ${shown} has no ${key} object. Run extract again rather than editing it by hand.`);
  }
  if (!ONBOARDING_STATES.includes(data.onboarding.state)) {
    fail(`Error: ${shown} has an onboarding state of ${JSON.stringify(data.onboarding.state)}. Run extract again rather than editing it by hand.`);
  }
  if (!Array.isArray(data.rated)) fail(`Error: ${shown} has a rated value that is not an array.`);
  const seen = new Set();
  const sectionItems = [];
  for (const [key, section] of Object.entries(data.sections)) {
    for (const item of section.items || []) sectionItems.push({ section: key, text: normal(item) });
  }
  // A Routing Table row's Register cell is a trait line too: it states the
  // register an output takes. The ids it rests on are the ones its whole row
  // cites, Why cell included; the cells are joined with their bar, so no range
  // runs across two cells.
  const rowItems = [];
  for (const row of (data.sections.routing && data.sections.routing.rows) || []) {
    if (typeof row[1] === 'string' && row[1].trim()) rowItems.push({ text: normal(row[1]), cites: normal(row.join(' | ')) });
  }
  for (const entry of data.rated) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`Error: a rated entry in ${shown} is not an object.`);
    for (const key of Object.keys(entry)) {
      if (!RATED_ENTRY_KEYS.includes(key)) fail(`Error: rated entry "${entry.key}" in ${shown} has an unknown key "${key}"; a rated entry holds ${RATED_ENTRY_KEYS.join(', ')}.`);
    }
    if (!RATED_KEYS.includes(entry.key)) fail(`Error: rated entry "${entry.key}" in ${shown} is not one of ${RATED_KEYS.join(', ')}.`);
    if (seen.has(entry.key)) fail(`Error: rated dial "${entry.key}" appears twice in ${shown}.`);
    seen.add(entry.key);
    if (!Number.isInteger(entry.step) || entry.step < 1 || entry.step > 5) fail(`Error: rated dial "${entry.key}" in ${shown} has step ${JSON.stringify(entry.step)}; a step is a whole number from 1 to 5.`);
    if (typeof entry.trait !== 'string' || normal(entry.trait).length < 12) fail(`Error: rated dial "${entry.key}" in ${shown} quotes no trait line. A rated dial rests on a trait line copied from voice.md.`);
    const quote = normal(entry.trait);
    // A quote rests on the first section item that holds it, as it always has. A
    // Register cell that holds it is a home too, so a short cell that also sits
    // inside a longer item, such as one in Identity, is still checked against its row.
    const first = sectionItems.find((item) => item.text.includes(quote));
    const rows = rowItems.filter((item) => item.text.includes(quote));
    const homes = first ? [first, ...rows] : rows;
    if (!homes.length) fail(`Error: rated dial "${entry.key}" quotes "${quote.slice(0, 80)}", which is not in voice.md as extracted. Copy the trait line exactly.`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) fail(`Error: rated dial "${entry.key}" in ${shown} cites no evidence id.`);
    for (const id of entry.evidence) {
      if (typeof id !== 'string' || !/^E\d+$/.test(id)) fail(`Error: rated dial "${entry.key}" cites "${id}", which is not an evidence id such as E1.`);
    }
    const cited = homes.map((home) => citedIds(home.cites || home.text));
    if (!cited.some((ids) => entry.evidence.every((id) => ids.has(id)))) {
      const missing = entry.evidence.find((id) => !cited.some((ids) => ids.has(id)));
      const where = rows.length ? (first ? ', nor does the Routing Table row of any Register cell holding it' : ' anywhere in its Routing Table row') : '';
      if (missing) fail(`Error: rated dial "${entry.key}" cites ${missing}, which the quoted trait line does not cite${where}.`);
      fail(`Error: rated dial "${entry.key}" cites ${entry.evidence.join(', ')}, and no one line holding the quoted trait cites them all. Cite only ids from the line you quote.`);
    }
  }
}

// ------------------------------------------------------------------- render

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Escaped text with inline code kept and emphasis markers dropped, the
 * innermost first, a bold pair then an italic pair holding no other star, until
 * none is left, so bold inside italic, italic inside bold, and a span closing on
 * three stars all lose every marker. A star with a letter or digit on its outer
 * side, or a space on its inner side, is not emphasis and stays.
 */
const BOLD_PAIR = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g;
const ITALIC_PAIR = /(^|[^\p{L}\p{N}])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\p{L}\p{N}])/gu;

function inline(text) {
  let out = esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = out.replace(BOLD_PAIR, '$1').replace(ITALIC_PAIR, '$1$2');
    if (next === out) break;
    out = next;
  }
  return out.replace(/\[Not available:([^\]]*)\]/g, '<span class="na">[Not available:$1]</span>');
}

const COUNTED = {
  stance: [
    ['hedges', 'Hedges (maybe, perhaps)', 'rare', 'frequent', 'per 1,000 words', 20],
    ['boosters', 'Boosters (clearly, certainly)', 'rare', 'frequent', 'per 1,000 words', 15],
    ['first_singular', 'I, me, my', 'rare', 'frequent', 'per 1,000 words', 60],
    ['first_plural', 'We, us, our', 'rare', 'frequent', 'per 1,000 words', 40],
    ['second_person', 'You, your', 'rare', 'frequent', 'per 1,000 words', 50]
  ],
  rhythm: [
    ['sentence_mean', 'Sentence length', 'short', 'long', 'words', 40],
    ['sentence_cv', 'Sentence variety', 'even', 'varied', '', 1.2],
    ['long_sentences', 'Long sentences', 'few', 'many', 'in every 100 sentences run 30+ words', 40]
  ]
};
const PUNCTUATION_NAMES = {
  em_dash: 'Em dashes', en_dash: 'En dashes', double_hyphen: 'Double hyphens', semicolon: 'Semicolons', ellipsis: 'Ellipses',
  exclamation: 'Exclamation marks', parenthesis: 'Parentheses', serial_comma: 'Serial commas', initial_and: 'Sentences opening on And',
  initial_but: 'Sentences opening on But', initial_so: 'Sentences opening on So'
};
const RATED = [
  ['involved', 'Personal or informational', 'personal', 'informational'],
  ['explicit', 'Naming specifics', 'leaves it to the reader', 'names everything'],
  ['abstract', 'Who does the action', 'named doer', 'doer left out'],
  ['formality', 'Formality', 'everyday', 'formal']
];

function fmt(n) {
  if (!isNumber(n)) return '';
  return Math.abs(n) >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100);
}

function pct(v, max) {
  return Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2);
}

/** The reading and decision note a measured dial carries, on the page and in the fragment alike. */
function featureReading(name, feature, unit) {
  const what = (n) => (name === 'sentence_cv' ? `${fmt(n)} (higher means more mixed lengths)` : `${fmt(n)} ${unit}`);
  let reading = name === 'sentence_mean'
    ? `${fmt(feature.median)} words on average; averages range ${fmt(feature.low)} to ${fmt(feature.high)} across 500-word stretches`
    : `${what(feature.median)}; range ${fmt(feature.low)} to ${fmt(feature.high)}`;
  let note = '';
  if (feature.decision === 'polish') {
    const measured = feature.measured ? `${fmt(feature.measured.low)} to ${fmt(feature.measured.high)}` : 'not recorded';
    reading = `set to ${fmt(feature.low)} to ${fmt(feature.high)}${unit && name !== 'sentence_cv' ? ` ${unit}` : ''}; measured ${measured}`;
    note = `polish: ${feature.polish === 'high' ? 'less of this than the samples show' : feature.polish === 'low' ? 'more of this than the samples show' : 'side not recorded'}`;
  } else if (feature.decision === 'keep') {
    note = 'keep: as the samples show';
  }
  return { reading, note };
}

function scaleMax(feature, defaultMax) {
  const top = Math.max(feature.high, feature.measured ? feature.measured.high : 0, feature.median);
  return Math.max(defaultMax, Math.ceil(top * 1.15 * 10) / 10);
}

// One drawing for each kind of dial, used by the page and the fragment alike.
const NA_SVG = '<line class="na-line" x1="0" x2="100%" y1="11" y2="11"/>';

function measuredSvg(feature, max) {
  let svg = '';
  if (feature.measured) {
    const a = pct(feature.measured.low, max); const b = pct(feature.measured.high, max);
    svg += `<rect class="measured" x="${a}%" y="5" width="${(b - a).toFixed(2)}%" height="12"/>`;
  }
  const a = pct(feature.low, max); const b = pct(feature.high, max);
  svg += `<rect class="band" x="${a}%" y="6" width="${(b - a).toFixed(2)}%" height="10"/>`;
  svg += '<line class="axis" x1="0" x2="100%" y1="11" y2="11"/>';
  svg += '<line class="tick" x1="0.5" x2="0.5" y1="7" y2="15"/><line class="tick" x1="100%" x2="100%" y1="7" y2="15" transform="translate(-0.5,0)"/>';
  return `${svg}<circle class="mark" cx="${pct(feature.median, max)}%" cy="11" r="5"/>`;
}

function ratedSvg(entry) {
  let svg = '<line class="axis" x1="0" x2="100%" y1="11" y2="11"/>';
  for (let s = 0; s < 5; s += 1) svg += `<line class="tick" x1="${(s * 25).toFixed(2)}%" x2="${(s * 25).toFixed(2)}%" y1="8" y2="14"${s === 4 ? ' transform="translate(-0.5,0)"' : ''}/>`;
  return `${svg}<circle class="open" cx="${((entry.step - 1) * 25).toFixed(2)}%" cy="11" r="4.5"/>`;
}

/**
 * The facts both headers state: who, where the voice key stands and when it was
 * confirmed, and the register the rated dials were placed for. An open key is
 * shown by its state line as written, and an unreadable AGENTS.md as not known;
 * either way the confirmation date is then only the last one. A confirmation
 * line holding no date, an anchor alone, is not a confirmation.
 */
function headerFacts(data) {
  const a = data.authority;
  const o = data.onboarding || { state: 'absent', line: null };
  // Only a line holding a YYYY-MM-DD date, the form Build Voice writes, is a
  // confirmation; an anchor alone or a placeholder such as "pending" is not.
  const isConfirmed = Boolean(a.confirmed && !labelsIn(a.confirmed).length && /\b\d{4}-\d{2}-\d{2}\b/.test(a.confirmed));
  const date = isConfirmed ? esc(a.confirmed.replace(/\s*\[[^\]]*\]\s*$/, '')) : null;
  const last = date ? `; last confirmed ${date}` : '; not yet confirmed';
  let confirmed;
  if (OPEN_STATES.includes(o.state)) confirmed = `voice: ${o.line ? inline(o.line) : esc(o.state)}${last}`;
  else if (o.state === 'unreadable') confirmed = `voice state not known: <code>${esc(o.path)}</code> could not be read${last}`;
  else confirmed = date ? `confirmed ${date}` : 'not yet confirmed';
  const by = a.name ? (date ? ` by ${esc(a.name)}` : `; confirming authority ${esc(a.name)}`) : '';
  const rows = data.sections.routing && data.sections.routing.rows;
  const governing = rows && rows.length && rows[0][0] ? rows[0][0] : null;
  return { subject: data.subject, confirmed, by, governing };
}

function countedDial(name, label, left, right, unit, defaultMax, feature) {
  if (!feature) return dialShell(label, null, left, right, NA_SVG, 'not known', true);
  const max = scaleMax(feature, defaultMax);
  const svg = measuredSvg(feature, max);
  const { reading, note: noteText } = featureReading(name, feature, unit);
  const note = noteText ? `<span class="decision">${esc(noteText)}</span>` : '';
  const aria = `${label}: ${reading}${feature.decision ? `, decision ${feature.decision}` : ''}`;
  return dialShell(label, aria, `${esc(left)}`, `${esc(right)}, scale to ${fmt(max)}`, svg, reading, false, note);
}

function dialShell(label, aria, left, right, svg, reading, na, note = '') {
  return `<div class="dial${na ? ' na' : ''}"><div class="dial-row"><span class="dial-name">${esc(label)}<span class="dial-reading">${esc(reading)}</span>${note}</span>`
    + `<div class="dial-scale"><svg role="img" aria-label="${esc(aria || `${label}: not known`)}">${svg}</svg>`
    + `<div class="dial-ends"><span>${left}</span><span>${right}</span></div></div></div></div>`;
}

function ratedDial(spec, entry, index) {
  const [, label, left, right] = spec;
  if (!entry) return dialShell(label, null, esc(left), esc(right), NA_SVG, 'not rated', true);
  const svg = ratedSvg(entry);
  const id = `sn-${index}`;
  const aria = `${label}: step ${entry.step} of 5, from ${left} to ${right}, placed by a line in the voice`;
  return `<div class="dial"><div class="dial-row"><span class="dial-name">${esc(label)}<label for="${id}" class="margin-toggle sidenote-number"></label></span>`
    + `<div class="dial-scale"><svg role="img" aria-label="${esc(aria)}">${svg}</svg><div class="dial-ends"><span>${esc(left)}</span><span>${esc(right)}</span></div></div></div>`
    + `<input type="checkbox" id="${id}" class="margin-toggle"><span class="sidenote">${inline(entry.trait)} <span class="src">(${esc(entry.evidence.join(', '))})</span></span></div>`;
}

function list(items, cls = '') {
  if (!items || items.length === 0) return '<p class="na">Not available: this section of voice.md holds nothing yet.</p>';
  return `<ul class="plain${cls ? ` ${cls}` : ''}">${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`;
}

function sectionBlock(title, section, cls = '') {
  if (!section || section.state === 'missing') return `<h2>${esc(title)}</h2><p class="na">Not available: voice.md has no ${esc(title)} section.</p>`;
  if (section.state === 'prompt' || section.state === 'empty') return `<h2>${esc(title)}</h2><p class="na">Not available: this section of voice.md is not filled in yet.</p>`;
  return `<h2>${esc(title)}</h2>${list(section.items, cls)}`;
}

function markerLine(marker) {
  const where = marker.samples && marker.samples.length ? ` <span class="src">(${esc(marker.samples.join(', '))})</span>` : '';
  if (marker.class === 'variant' && marker.over) return `${esc(marker.marker)} over ${esc(marker.over)}${isNumber(marker.count) ? `, ${fmt(marker.count)} uses` : ''}${where}`;
  if (marker.class === 'punctuation') return `${esc(marker.marker)}${isNumber(marker.rate) ? `, ${fmt(marker.rate)} per 1,000 words overall` : ''}${isNumber(marker.reference) ? ` (usual ${fmt(marker.reference)})` : ''}${where}`;
  if (marker.class === 'idiom') return `“${esc(marker.marker)}”${marker.usual ? `, for “${esc(marker.usual)}”` : ''}${where}`;
  return `“${esc(marker.marker)}”${isNumber(marker.count) ? `, ${fmt(marker.count)} uses` : ''}${where}`;
}

export function renderPage(data, generated, css) {
  const facts = headerFacts(data);
  const subject = facts.subject || '[name not set in voice.md]';
  const a = data.authority;
  const sections = data.sections;
  const features = data.features || {};
  const profile = data.profile;
  const onboarding = data.onboarding;

  let profileNote;
  if (profile.state === 'read') {
    profileNote = `Measured from the confirmed profile <code>${esc(profile.path)}</code>${isNumber(profile.words) ? `, ${fmt(profile.words)} words` : ''}${isNumber(profile.samples) ? ` from ${fmt(profile.samples)} samples` : ''}${isNumber(profile.chunks) ? ` in ${fmt(profile.chunks)} stretches of ${fmt(profile.chunkWords || 500)} words` : ''}`;
  } else if (profile.state === 'missing-file') {
    profileNote = `The voice names the profile <code>${esc(profile.path)}</code>, which is not there, so nothing measured is shown`;
  } else {
    profileNote = 'The voice names no confirmed profile, so nothing measured is shown';
  }

  let h = '';
  h += '<header>';
  h += `<h1>The voice of ${esc(subject)}</h1>`;
  h += `<p class="meta">${facts.confirmed}${facts.by}</p>`;
  h += `<p class="meta">This page shows the voice as it is set now: <code>${esc(data.voice.path)}</code> as saved ${esc(data.voice.modified)}. ${profileNote}.</p>`;
  h += '</header>';

  const identity = sections.identity;
  if (identity && identity.state === 'answered') {
    h += `<section class="lede">${identity.items.map((item) => `<p>${inline(item)}</p>`).join('')}</section>`;
  } else {
    h += '<section class="lede"><p class="na">Not available: the Identity section of voice.md is not filled in yet.</p></section>';
  }

  h += '<section><div class="dials">';
  const rated = new Map((data.rated || []).map((entry) => [entry.key, entry]));
  // A group with nothing behind any of its dials is one line, not a column of empty scales.
  const empty = (title, names, why) => `<div class="dial-group">${title}</div><p class="na group-na">${esc(names)}: ${esc(why)}</p>`;
  if (rated.size) {
    h += `<div class="dial-group">How it reads</div>${facts.governing ? `<p class="group-for">Placed for: ${inline(facts.governing)}</p>` : ''}`;
    RATED.forEach((spec, i) => { h += ratedDial(spec, rated.get(spec[0]), i + 1); });
  } else {
    h += empty('How it reads', RATED.map((spec) => spec[1]).join(', '), 'not rated; no line in the voice places them on these scales');
  }
  for (const [group, title] of [['stance', 'How sure, and who is in it'], ['rhythm', 'Rhythm']]) {
    const specs = COUNTED[group];
    if (specs.some((spec) => features[spec[0]])) {
      h += `<div class="dial-group">${title}</div>`;
      for (const spec of specs) h += countedDial(spec[0], spec[1], spec[2], spec[3], spec[4], spec[5], features[spec[0]]);
    } else {
      h += empty(title, specs.map((spec) => spec[1]).join(', '), 'not known; nothing measured');
    }
  }
  const punctuation = PUNCTUATION_FEATURES.filter((name) => features[name]);
  if (punctuation.length) {
    h += '<div class="dial-group">Punctuation</div>';
    for (const name of punctuation) h += countedDial(name, PUNCTUATION_NAMES[name], 'rare', 'frequent', 'per 1,000 words', 20, features[name]);
  }
  h += '</div>';
  if (rated.size || Object.keys(features).length) h += '<p class="key"><svg viewBox="-6 -6 12 12" aria-hidden="true"><circle class="mark" r="5"/></svg>typical, measured'
    + '<svg viewBox="-6 -6 12 12" aria-hidden="true"><circle class="open" r="4.5"/></svg>placed by a line in your voice'
    + '<svg viewBox="0 0 14 10" aria-hidden="true"><rect class="band" width="14" height="10"/></svg>the range across the samples, or what it is set to where polished'
    + '<svg viewBox="0 0 14 10" aria-hidden="true"><rect class="measured" x="0.5" y="0.5" width="13" height="9"/></svg>measured before polishing'
    + `${RATED.some((spec) => !rated.has(spec[0])) && rated.size || [...COUNTED.stance, ...COUNTED.rhythm].some((spec) => !features[spec[0]]) && Object.keys(features).length ? ' · dotted: not known' : ''}</p>`;
  h += '</section>';

  h += '<section class="secondary">';
  h += '<h2>Which voice for which piece</h2>';
  const routing = sections.routing;
  if (routing && routing.rows.length) {
    h += '<table><thead><tr><th>Output</th><th>Register</th><th>Why</th></tr></thead><tbody>';
    for (const row of routing.rows) h += `<tr>${[0, 1, 2].map((i) => `<td>${inline(row[i] ?? '')}</td>`).join('')}</tr>`;
    h += '</tbody></table>';
    if (routing.items.length) h += list(routing.items, 'notes');
  } else {
    h += '<p class="na">Not available: the Routing Table in voice.md has no rows yet.</p>';
  }

  if (data.markers && data.markers.length) {
    h += '<h2>Words and marks you use often</h2>';
    h += `<ul class="plain">${data.markers.map((m) => `<li>${markerLine(m)}</li>`).join('')}</ul>`;
  }
  h += sectionBlock('Tone', sections.tone);
  h += sectionBlock('Vocabulary', sections.vocabulary);
  h += sectionBlock('Structural Habits', sections.structure);
  h += sectionBlock('Who reads it', sections.audience);
  h += sectionBlock('Never', sections.prohibitions, 'never');
  for (const section of data.other || []) {
    if (section.state === 'answered') h += `<h2>${esc(section.heading)}</h2>${list(section.items)}`;
  }
  if (data.notAvailable && data.notAvailable.length) {
    h += '<h2>Not yet known</h2><ul class="plain">';
    for (const item of data.notAvailable) h += `<li><span class="src">${esc(item.section)}:</span> ${esc(item.label)}</li>`;
    h += '</ul>';
  }
  h += `<p class="meta foot">Generated ${esc(generated)} by voice-report-html ${esc(VERSION)} from <code>${esc(data.voice.path)}</code> (file fingerprint ${esc(String(data.voice.sha256).slice(0, 12))})`
    + `${profile.state === 'read' ? ` and <code>${esc(profile.path)}</code> (file fingerprint ${esc(String(profile.sha256).slice(0, 12))})` : ''}`
    + `${onboarding.line ? `, with the voice state line in <code>${esc(onboarding.path)}</code>` : ''}. `
    + 'Run it again after the voice changes; this page does not update itself.</p>';
  if (a.basis) h += `<p class="meta foot">Confirming authority's basis: ${inline(a.basis)}${a.fallbackSignoff ? `. Still needs sign-off from ${inline(a.fallbackSignoff)}.` : ''}</p>`;
  h += '</section>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="voice-report-html ${esc(VERSION)}">
<meta name="voice-report:voice" content="${esc(data.voice.path)}">
<meta name="voice-report:voice-sha256" content="${esc(data.voice.sha256)}">
<meta name="voice-report:profile" content="${esc(profile.state === 'read' ? profile.path : '')}">
<meta name="voice-report:profile-sha256" content="${esc(profile.state === 'read' ? profile.sha256 : '')}">
<meta name="voice-report:onboarding-state" content="${esc(onboarding.state)}">
<meta name="voice-report:onboarding" content="${esc(onboarding.line || '')}">
<title>Voice of ${esc(subject)}</title>
<style>
${css}
</style>
</head>
<body>
<article>
${h}
</article>
</body>
</html>
`;
}

/** Read, parse and validate a data object extract wrote; render and inline both start here. */
function loadData(option) {
  const dataPath = screenSource('--data', option);
  const file = readText('--data', dataPath, DATA_CAP);
  let data;
  try { data = JSON.parse(file.text); } catch { fail(`Error: --data ${dataPath} is not valid JSON.`); }
  validateData(data, dataPath);
  return { data, dataPath };
}

export function render(options) {
  const { data, dataPath } = loadData(options['--data']);
  let generated = today();
  if (options['--date'] !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options['--date'])) fail(`Error: --date must be YYYY-MM-DD; got "${options['--date']}". ${HELP_HINT}`);
    generated = options['--date'];
  }
  const destination = screenDestination('--output', options['--output']);
  if (destination === dataPath) fail(`Error: --output is the --data file; writing there would destroy the input.`);
  const css = readFileSync(TEMPLATE_CSS, 'utf8');
  writeDestination('--output', destination, renderPage(data, generated, css));
  return {
    written: destination,
    rated: data.rated.length,
    measured: Object.keys(data.features).length,
    profile: data.profile.state
  };
}

// ------------------------------------------------------------------- inline

// The fragment's colours and dial marks come from the page's own stylesheet:
// its :root tokens become fallbacks behind the host's variables, and its mark
// rules are scoped under .vr. Only the fragment's layout is its own.
const HOST_VARIABLES = {
  ink: '--text-primary', 'ink-2': '--text-secondary', 'ink-3': '--text-muted', na: '--text-muted',
  mark: '--text-accent', rule: '--border-strong', band: '--border-stronger', bg: '--surface-2'
};
const MARK_RULE = /^\.(axis|band|measured|mark|open|na-line)\b[^{]*\{[^}]*\}$/;

function tokens(block) {
  const out = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

function fragmentCss(css) {
  const light = tokens(/:root\s*\{([^}]*)\}/.exec(css)[1]);
  const dark = tokens(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1]);
  const vars = (values) => Object.entries(HOST_VARIABLES).map(([name, host]) => `--${name}:var(${host},${values[name]})`).join(';');
  const marks = css.split('\n').map((line) => line.trim()).filter((line) => MARK_RULE.test(line))
    .map((line) => line.replace(/^([^{]+)\{\s*(.*?)\s*\}$/, (all, selectors, body) => `${selectors.split(',').map((sel) => `.vr ${sel.trim()}`).join(',')}{${body.replace(/:\s+/g, ':').replace(/;\s+/g, ';')}}`));
  return `<style>
.vr{${vars(light)}}
@media (prefers-color-scheme:dark){.vr{${vars(dark)}}}
.vr{padding:.5rem 0;color:var(--ink);font-family:var(--font-sans,system-ui,sans-serif)}
.vr .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.vr .who{font-size:13px;color:var(--ink-2);margin:0 0 .75rem}.vr .g{font-size:12px;color:var(--ink-3);margin:.9rem 0 .2rem}
.vr .d{display:grid;grid-template-columns:minmax(0,9.5rem) minmax(0,1fr);gap:0 14px;align-items:center;padding:3px 0}
.vr .n{font-size:14px;line-height:1.3}.vr .r{display:block;font-size:12px;color:var(--ink-2)}
.vr svg{display:block;width:100%;height:22px;overflow:visible}
.vr .e{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-3)}
.vr .q{grid-column:2;font-size:12px;color:var(--ink-3);margin:1px 0 4px}
${marks.join('\n')}
.vr .k{font-size:12px;color:var(--ink-3);margin:.8rem 0 0}
@media (max-width:520px){.vr .d{grid-template-columns:minmax(0,1fr)}.vr .q{grid-column:1}}
</style>`;
}

function inlineScale(svg, left, right, aria) {
  return `<div><svg role="img" aria-label="${esc(aria)}">${svg}</svg><div class="e"><span>${left}</span><span>${right}</span></div></div>`;
}

export function renderFragment(data, css) {
  const features = data.features || {};
  const rated = new Map((data.rated || []).map((entry) => [entry.key, entry]));
  const facts = headerFacts(data);
  const subject = facts.subject || 'this voice';
  const counted = Object.keys(features).length;
  let h = fragmentCss(css) + '<div class="vr">';
  h += `<h2 class="sr">Voice dials for ${esc(subject)}: ${rated.size} placed by lines in the voice and ${counted} measured.</h2>`;
  h += `<p class="who">${esc(subject)} · ${facts.confirmed}</p>`;

  h += `<p class="g">How it reads${rated.size && facts.governing ? `, placed for: ${inline(facts.governing)}` : ''}</p>`;
  if (rated.size) {
    for (const [key, label, left, right] of RATED) {
      const entry = rated.get(key);
      const svg = entry ? ratedSvg(entry) : NA_SVG;
      const aria = entry ? `${label}: step ${entry.step} of 5, from ${left} to ${right}` : `${label}: not rated`;
      h += `<div class="d"><span class="n">${esc(label)}${entry ? '' : '<span class="r">not rated</span>'}</span>${inlineScale(svg, esc(left), esc(right), aria)}`;
      if (entry) h += `<p class="q">“${inline(entry.trait)}” (${esc(entry.evidence.join(', '))})</p>`;
      h += '</div>';
    }
  } else {
    h += `<p class="r">${esc(RATED.map((spec) => spec[1]).join(', '))}: not rated; no line in the voice places them on these scales</p>`;
  }

  const groups = [['How sure, and who is in it', COUNTED.stance], ['Rhythm', COUNTED.rhythm],
    ['Punctuation', PUNCTUATION_FEATURES.filter((name) => features[name]).map((name) => [name, PUNCTUATION_NAMES[name], 'rare', 'frequent', 'per 1,000 words', 20])]];
  for (const [title, specs] of groups) {
    if (!specs.length) continue;
    h += `<p class="g">${title}</p>`;
    if (!specs.some((spec) => features[spec[0]])) {
      h += `<p class="r">${esc(specs.map((spec) => spec[1]).join(', '))}: not known; nothing measured</p>`;
      continue;
    }
    for (const [name, label, left, right, unit, defaultMax] of specs) {
      const f = features[name];
      if (!f) {
        h += `<div class="d"><span class="n">${esc(label)}<span class="r">not known</span></span>${inlineScale(NA_SVG, esc(left), esc(right), `${label}: not known`)}</div>`;
        continue;
      }
      const max = scaleMax(f, defaultMax);
      const svg = measuredSvg(f, max);
      const { reading, note } = featureReading(name, f, unit);
      h += `<div class="d"><span class="n">${esc(label)}<span class="r">${esc(reading)}</span>${note ? `<span class="r">${esc(note)}</span>` : ''}</span>${inlineScale(svg, esc(left), `${esc(right)}, scale to ${fmt(max)}`, `${label}: ${reading}${note ? `; ${note}` : ''}`)}</div>`;
    }
  }
  if (rated.size || Object.keys(features).length) {
    const anyDotted = (rated.size && rated.size < RATED.length)
      || (Object.keys(features).length && [...COUNTED.stance, ...COUNTED.rhythm].some((spec) => !features[spec[0]]));
    h += `<p class="k">Filled dot: typical, measured. Open dot: placed by the quoted line. Shaded: the range across the samples, or what it is set to where polished. Dashed: measured before polishing.${anyDotted ? ' Dotted: not known.' : ''}</p>`;
  }
  return `${h}</div>`;
}

export function inlineReport(options) {
  const { data } = loadData(options['--data']);
  const fragment = renderFragment(data, readFileSync(TEMPLATE_CSS, 'utf8'));
  return { fragment, rated: data.rated.length, measured: Object.keys(data.features).length, profile: data.profile.state };
}

function metaValue(html, name) {
  const match = new RegExp(`<meta name="voice-report:${name}" content="([^"]*)">`).exec(html);
  if (!match) return null;
  return match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Whether a page still shows the voice as set now. It compares the fingerprints
 * the page recorded with the files on disk, by re-reading what extract would read.
 */
export function fresh(options) {
  const { voiceRel, voice, profile, onboarding } = readInputs(options['--root'], options['--voice']);
  const pagePath = screenSource('--page', options['--page']);
  const page = readText('--page', pagePath, DATA_CAP).text;
  const changed = [];
  const recorded = {
    voice: metaValue(page, 'voice'),
    voiceSha: metaValue(page, 'voice-sha256'),
    profile: metaValue(page, 'profile'),
    profileSha: metaValue(page, 'profile-sha256'),
    onboarding: metaValue(page, 'onboarding'),
    onboardingState: metaValue(page, 'onboarding-state')
  };
  if (recorded.voiceSha === null) {
    return { fresh: false, changed: ['the page records no fingerprints; it was made by an earlier version of this tool'] };
  }
  const line = onboarding.line || '';
  if (recorded.onboarding === null) {
    changed.push('the page records no voice state line; it was made by an earlier version of this tool');
  } else if (recorded.onboardingState === null) {
    changed.push('the page records no voice state; it was made by an earlier build of this tool');
  } else if (onboarding.state === 'unreadable' && recorded.onboardingState !== 'unreadable') {
    // Checked before the line, which an unreadable file never yields.
    changed.push('AGENTS.md can no longer be read');
  } else if (recorded.onboarding !== line) {
    changed.push(line ? `the voice state line in AGENTS.md now reads "voice: ${line}"` : 'AGENTS.md no longer carries a voice state line');
  } else if (recorded.onboardingState !== onboarding.state) {
    changed.push(onboarding.state === 'unreadable' ? 'AGENTS.md can no longer be read' : `the voice state in AGENTS.md is now ${onboarding.state}`);
  }
  if (recorded.voice !== voiceRel) changed.push(`the page read ${recorded.voice}, and the bound voice is ${voiceRel}`);
  if (recorded.voiceSha !== voice.sha256) changed.push(`${voiceRel} has changed since the page was made`);
  const now = profile.path || '';
  if ((recorded.profile || '') !== now) {
    changed.push(now ? `the voice now names the profile ${now}` : 'the voice no longer names a profile');
  } else if (now) {
    if (profile.state !== 'read') changed.push(`the profile ${now} is no longer there`);
    else if (profile.sha256 !== recorded.profileSha) changed.push(`the profile ${now} has changed since the page was made`);
  }
  return { fresh: changed.length === 0, changed };
}

export function runVoiceReport(argv) {
  const parsed = parseArgs(argv);
  if (parsed.command === 'help') return USAGE;
  if (parsed.command === 'extract') return extract(parsed.options);
  if (parsed.command === 'fresh') return fresh(parsed.options);
  if (parsed.command === 'inline') return inlineReport(parsed.options);
  return render(parsed.options);
}
