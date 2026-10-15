/**
 * voice-report-html core: extract a root's bound voice.md and its confirmed
 * voice-lexicon profile into one data object, and render that object as one
 * static HTML page. Node built-ins only. It counts nothing and judges
 * nothing: every value on the page is copied from those two files, or is a
 * rated position the caller supplies with the trait line it rests on.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonical, fail, screenDestination, screenSource, writeDestination } from './lib/paths.js';

export const VERSION = '0.1.0';
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
  render: { flags: ['--data', '--output', '--date'], required: ['--data', '--output'] }
};

export const USAGE = `voice-report-html ${VERSION}: one static HTML page showing a root's bound voice.

Usage:
  node scripts/voice-report-html.js help
  node scripts/voice-report-html.js extract --voice <file> --root <dir> [--output <file>]
  node scripts/voice-report-html.js render --data <file> --output <file> [--date YYYY-MM-DD]

extract  Read the bound voice.md and the confirmed profile its voice-profile: line
         names, and print (or write to --output) one data object.
render   Validate a data object, rated dials included, and write the page to --output.

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

function rootType(root) {
  try {
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n?/g, '\n'));
    if (!front) return null;
    const line = /^type:\s*(.+)$/m.exec(front[1]);
    return line ? line[1].trim().replace(/^"(.*)"$/, '$1') : null;
  } catch {
    return null;
  }
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
        if (key[1] === 'voice-profile') profile = value;
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

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function extract(options) {
  const root = screenDirectory('--root', options['--root']);
  const voicePath = screenSource('--voice', options['--voice']);
  if (!inside(root, voicePath)) fail(`Error: --voice ${voicePath} is not inside --root ${root}. Pass the file the owning root's Provides block binds as voice.`);
  const voice = readText('--voice', voicePath, VOICE_CAP);
  const parsed = parseVoice(voice.text);

  let profile = { path: parsed.profile, state: 'absent', sha256: null };
  let measures = { words: null, samples: null, chunks: null, chunkWords: null, features: {}, markers: [] };
  if (parsed.profile) {
    if (isAbsolute(parsed.profile)) fail(`Error: voice-profile: in ${voicePath} is an absolute path; Build Voice writes it as a path from the owning root.`);
    const candidate = canonical('voice-profile', resolve(root, parsed.profile));
    if (!inside(root, candidate)) fail(`Error: voice-profile: in ${voicePath} names ${candidate}, outside the owning root ${root}. Build Voice writes the confirmed copy inside the root.`);
    let exists = true;
    try { exists = statSync(candidate).isFile(); } catch { exists = false; }
    if (!exists) {
      profile = { path: parsed.profile, state: 'missing-file', sha256: null };
    } else {
      const file = readText('voice-profile', candidate, PROFILE_CAP);
      let object;
      try { object = JSON.parse(file.text); } catch { fail(`Error: the profile ${candidate} is not valid JSON.`); }
      measures = readProfile(object, candidate);
      profile = { path: parsed.profile, state: 'read', sha256: file.sha256 };
    }
  }

  const modified = statSync(voicePath).mtime;
  const data = {
    tool: 'voice-report-html',
    version: VERSION,
    extracted: today(),
    state: parsed.built ? 'built' : 'unbuilt',
    subject: parsed.subject,
    rootType: rootType(root),
    voice: { path: relative(root, voicePath).split(sep).join('/'), sha256: voice.sha256, modified: modified.toISOString().slice(0, 10) },
    authority: parsed.authority,
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

export function validateData(data, shown) {
  if (!data || typeof data !== 'object' || data.tool !== 'voice-report-html') {
    fail(`Error: ${shown} is not a data object this tool's extract wrote. Run extract first.`);
  }
  if (data.state !== 'built') {
    fail(`Error: ${shown} describes a voice that has not been built: every section of voice.md is still a prompt line or a Not available label. Run skills/Build Voice/ first; no report is written for an unbuilt voice.`);
  }
  for (const key of ['sections', 'features', 'authority', 'voice', 'profile']) {
    if (!data[key] || typeof data[key] !== 'object') fail(`Error: ${shown} has no ${key} object. Run extract again rather than editing it by hand.`);
  }
  if (!Array.isArray(data.rated)) fail(`Error: ${shown} has a rated value that is not an array.`);
  const seen = new Set();
  const sectionItems = [];
  for (const [key, section] of Object.entries(data.sections)) {
    for (const item of section.items || []) sectionItems.push({ section: key, text: normal(item) });
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
    const home = sectionItems.find((item) => item.text.includes(quote));
    if (!home) fail(`Error: rated dial "${entry.key}" quotes "${quote.slice(0, 80)}", which is not in voice.md as extracted. Copy the trait line exactly.`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) fail(`Error: rated dial "${entry.key}" in ${shown} cites no evidence id.`);
    for (const id of entry.evidence) {
      if (typeof id !== 'string' || !/^E\d+$/.test(id)) fail(`Error: rated dial "${entry.key}" cites "${id}", which is not an evidence id such as E1.`);
      if (!new RegExp(`\\b${id}\\b`).test(home.text)) fail(`Error: rated dial "${entry.key}" cites ${id}, which the quoted trait line does not cite.`);
    }
  }
}

// ------------------------------------------------------------------- render

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Escaped text with inline code kept and emphasis markers dropped. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, '$1$2')
    .replace(/\[Not available:([^\]]*)\]/g, '<span class="na">[Not available:$1]</span>');
}

const COUNTED = {
  stance: [
    ['hedges', 'Hedges', 'rare', 'frequent', 'per 1,000 words', 20],
    ['boosters', 'Boosters', 'rare', 'frequent', 'per 1,000 words', 15],
    ['first_singular', 'I, me, my', 'rare', 'frequent', 'per 1,000 words', 60],
    ['first_plural', 'We, us, our', 'rare', 'frequent', 'per 1,000 words', 40],
    ['second_person', 'You, your', 'rare', 'frequent', 'per 1,000 words', 50]
  ],
  rhythm: [
    ['sentence_mean', 'Sentence length', 'short', 'long', 'words', 40],
    ['sentence_cv', 'Sentence variety', 'even', 'varied', 'spread over mean', 1.2],
    ['long_sentences', 'Long sentences', 'few', 'many', 'of 30+ words per 100', 40]
  ]
};
const PUNCTUATION_NAMES = {
  em_dash: 'Em dashes', en_dash: 'En dashes', double_hyphen: 'Double hyphens', semicolon: 'Semicolons', ellipsis: 'Ellipses',
  exclamation: 'Exclamation marks', parenthesis: 'Parentheses', serial_comma: 'Serial commas', initial_and: 'Sentences opening on And',
  initial_but: 'Sentences opening on But', initial_so: 'Sentences opening on So'
};
const RATED = [
  ['involved', 'Involved or informational', 'involved', 'informational'],
  ['explicit', 'Reference', 'situation-dependent', 'explicit'],
  ['abstract', 'Abstract style', 'concrete, agent named', 'abstract, impersonal'],
  ['formality', 'Formality', 'contextual', 'formal']
];

function fmt(n) {
  if (!isNumber(n)) return '';
  return Math.abs(n) >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100);
}

function pct(v, max) {
  return Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2);
}

function countedDial(name, label, left, right, unit, defaultMax, feature) {
  if (!feature) return dialShell(label, null, left, right, '<line class="na-line" x1="0" x2="100%" y1="11" y2="11"/>', 'not known', true);
  const top = Math.max(feature.high, feature.measured ? feature.measured.high : 0, feature.median);
  const max = Math.max(defaultMax, Math.ceil(top * 1.15 * 10) / 10);
  let svg = '';
  if (feature.measured) {
    const a = pct(feature.measured.low, max); const b = pct(feature.measured.high, max);
    svg += `<rect class="measured" x="${a}%" y="5" width="${(b - a).toFixed(2)}%" height="12"/>`;
  }
  const a = pct(feature.low, max); const b = pct(feature.high, max);
  svg += `<rect class="band" x="${a}%" y="6" width="${(b - a).toFixed(2)}%" height="10"/>`;
  svg += '<line class="axis" x1="0" x2="100%" y1="11" y2="11"/>';
  svg += '<line class="tick" x1="0.5" x2="0.5" y1="7" y2="15"/><line class="tick" x1="100%" x2="100%" y1="7" y2="15" transform="translate(-0.5,0)"/>';
  svg += `<circle class="mark" cx="${pct(feature.median, max)}%" cy="11" r="5"/>`;
  let reading = `${fmt(feature.median)} ${unit}; range ${fmt(feature.low)} to ${fmt(feature.high)}`;
  let note = '';
  if (feature.decision === 'polish') {
    const measured = feature.measured ? `${fmt(feature.measured.low)} to ${fmt(feature.measured.high)}` : 'not recorded';
    reading = `set to ${fmt(feature.low)} to ${fmt(feature.high)}; measured ${measured} ${unit}`;
    note = `<span class="decision">polish: ${feature.polish === 'high' ? 'less of this than the samples show' : feature.polish === 'low' ? 'more of this than the samples show' : 'side not recorded'}</span>`;
  } else if (feature.decision === 'keep') {
    note = '<span class="decision">keep: as the samples show</span>';
  }
  const aria = `${label}: ${reading}${feature.decision ? `, decision ${feature.decision}` : ''}`;
  return dialShell(label, aria, `${esc(left)}`, `${esc(right)} · ${fmt(max)}`, svg, reading, false, note);
}

function dialShell(label, aria, left, right, svg, reading, na, note = '') {
  return `<div class="dial${na ? ' na' : ''}"><div class="dial-row"><span class="dial-name">${esc(label)}<span class="dial-reading">${esc(reading)}</span>${note}</span>`
    + `<div class="dial-scale"><svg role="img" aria-label="${esc(aria || `${label}: not known`)}">${svg}</svg>`
    + `<div class="dial-ends"><span>${left}</span><span>${right}</span></div></div></div></div>`;
}

function ratedDial(spec, entry, index) {
  const [, label, left, right] = spec;
  if (!entry) return dialShell(label, null, esc(left), esc(right), '<line class="na-line" x1="0" x2="100%" y1="11" y2="11"/>', 'not rated', true);
  let svg = '<line class="axis" x1="0" x2="100%" y1="11" y2="11"/>';
  for (let s = 0; s < 5; s += 1) svg += `<line class="tick" x1="${(s * 25).toFixed(2)}%" x2="${(s * 25).toFixed(2)}%" y1="8" y2="14"${s === 4 ? ' transform="translate(-0.5,0)"' : ''}/>`;
  svg += `<circle class="open" cx="${((entry.step - 1) * 25).toFixed(2)}%" cy="11" r="4.5"/>`;
  const id = `sn-${index}`;
  const aria = `${label}: step ${entry.step} of 5 toward ${right}, rated from a trait line`;
  return `<div class="dial"><div class="dial-row"><span class="dial-name">${esc(label)}<label for="${id}" class="margin-toggle sidenote-number"></label><span class="dial-reading">rated from a trait line</span></span>`
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
  if (marker.class === 'punctuation') return `${esc(marker.marker)}${isNumber(marker.rate) ? `, ${fmt(marker.rate)} per 1,000 words` : ''}${isNumber(marker.reference) ? ` (usual ${fmt(marker.reference)})` : ''}${where}`;
  if (marker.class === 'idiom') return `“${esc(marker.marker)}”${marker.usual ? `, for “${esc(marker.usual)}”` : ''}${where}`;
  return `“${esc(marker.marker)}”${isNumber(marker.count) ? `, ${fmt(marker.count)} uses` : ''}${where}`;
}

export function renderPage(data, generated, css) {
  const subject = data.subject || '[name not set in voice.md]';
  const a = data.authority;
  const confirmed = a.confirmed && !labelsIn(a.confirmed).length ? `confirmed ${esc(a.confirmed)}` : 'not yet confirmed';
  const sections = data.sections;
  const features = data.features || {};
  const profile = data.profile;

  let profileNote;
  if (profile.state === 'read') {
    profileNote = `profile <code>${esc(profile.path)}</code>${isNumber(profile.words) ? `, ${fmt(profile.words)} words` : ''}${isNumber(profile.samples) ? ` from ${fmt(profile.samples)} samples` : ''}${isNumber(profile.chunks) ? ` in ${fmt(profile.chunks)} chunks` : ''}`;
  } else if (profile.state === 'missing-file') {
    profileNote = `voice.md names the profile <code>${esc(profile.path)}</code>, which is not there, so no measured dial is shown`;
  } else {
    profileNote = 'voice.md names no confirmed profile, so no measured dial is shown';
  }

  let h = '';
  h += '<header>';
  h += `<h1>The voice of ${esc(subject)}</h1>`;
  h += `<p class="meta">${esc(data.rootType || 'root type not declared')} root · ${confirmed}${a.name ? ` by ${esc(a.name)}` : ''}</p>`;
  h += `<p class="meta">This page shows the voice as it is set now: <code>${esc(data.voice.path)}</code> as saved ${esc(data.voice.modified)}, and the ${profileNote}.</p>`;
  h += '</header>';

  const identity = sections.identity;
  if (identity && identity.state === 'answered') {
    h += `<section class="lede">${identity.items.map((item) => `<p>${inline(item)}</p>`).join('')}</section>`;
  } else {
    h += '<section class="lede"><p class="na">Not available: the Identity section of voice.md is not filled in yet.</p></section>';
  }

  h += '<section><div class="dials">';
  h += '<div class="dial-group">Register</div>';
  const rated = new Map((data.rated || []).map((entry) => [entry.key, entry]));
  RATED.forEach((spec, i) => { h += ratedDial(spec, rated.get(spec[0]), i + 1); });
  h += '<div class="dial-group">Stance</div>';
  for (const spec of COUNTED.stance) h += countedDial(spec[0], spec[1], spec[2], spec[3], spec[4], spec[5], features[spec[0]]);
  h += '<div class="dial-group">Rhythm</div>';
  for (const spec of COUNTED.rhythm) h += countedDial(spec[0], spec[1], spec[2], spec[3], spec[4], spec[5], features[spec[0]]);
  const punctuation = PUNCTUATION_FEATURES.filter((name) => features[name]);
  if (punctuation.length) {
    h += '<div class="dial-group">Punctuation</div>';
    for (const name of punctuation) h += countedDial(name, PUNCTUATION_NAMES[name], 'rare', 'frequent', 'per 1,000 words', 20, features[name]);
  }
  h += '</div>';
  h += '<p class="key"><svg viewBox="-6 -6 12 12" aria-hidden="true"><circle class="mark" r="5"/></svg>typical, measured'
    + '<svg viewBox="-6 -6 12 12" aria-hidden="true"><circle class="open" r="4.5"/></svg>rated from a trait line'
    + '<svg viewBox="0 0 14 10" aria-hidden="true"><rect class="band" width="14" height="10"/></svg>the range the voice is set to'
    + '<svg viewBox="0 0 14 10" aria-hidden="true"><rect class="measured" x="0.5" y="0.5" width="13" height="9"/></svg>measured before polishing'
    + ' · dotted: not known</p>';
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
    h += '<h2>Markers kept</h2>';
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
  h += `<p class="meta foot">Generated ${esc(generated)} by voice-report-html ${esc(VERSION)} from <code>${esc(data.voice.path)}</code> (sha256 ${esc(String(data.voice.sha256).slice(0, 12))})`
    + `${profile.state === 'read' ? ` and <code>${esc(profile.path)}</code> (sha256 ${esc(String(profile.sha256).slice(0, 12))})` : ''}. `
    + 'Run it again after the voice changes; this page does not update itself.</p>';
  if (a.basis) h += `<p class="meta foot">Confirming authority's basis: ${inline(a.basis)}${a.fallbackSignoff ? `. Still needs sign-off from ${inline(a.fallbackSignoff)}.` : ''}</p>`;
  h += '</section>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="voice-report-html ${esc(VERSION)}">
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

export function render(options) {
  const dataPath = screenSource('--data', options['--data']);
  const file = readText('--data', dataPath, DATA_CAP);
  let data;
  try { data = JSON.parse(file.text); } catch { fail(`Error: --data ${dataPath} is not valid JSON.`); }
  validateData(data, dataPath);
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

export function runVoiceReport(argv) {
  const parsed = parseArgs(argv);
  if (parsed.command === 'help') return USAGE;
  if (parsed.command === 'extract') return extract(parsed.options);
  return render(parsed.options);
}
