#!/usr/bin/env node
/**
 * seo-keywords - turn Search Console query rows into a keyword report
 *
 * Usage:
 *   node scripts/keywords.js help
 *   node scripts/keywords.js previous-window --start <YYYY-MM-DD> --end <YYYY-MM-DD>
 *   node scripts/keywords.js analyze --queries <path> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
 *     [--query-pages <path>] [--previous-queries <path>] [--targets <path>]
 *     [--min-impressions <n>] [--site <url>] [--output <dir>]
 *
 * Node built-ins only; this script imports no package and reaches nothing outside
 * this tool directory. It opens no network connection and reads no credential.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const COMMANDS = new Set(['analyze', 'previous-window']);

const DAY_MS = 86400000;

// Every threshold the report is built from. TOOL.md's Thresholds table states
// each one in prose; this block is its single machine-readable home.
const LIMITS = {
  defaultMinImpressions: 10,
  topPerformers: 25,
  opportunityMinPosition: 5,
  opportunityMaxPosition: 20,
  opportunityMinImpressions: 50,
  opportunities: 20,
  trendMinPreviousClicks: 3,
  trendMinChangePercent: 20,
  trends: 15,
  cannibalPageMinImpressions: 10,
  cannibalQueryMinImpressions: 50,
  cannibalWarnings: 10,
};

const USAGE = `seo-keywords - turn Search Console query rows into a keyword report

Usage:
  node scripts/keywords.js help
  node scripts/keywords.js previous-window --start <YYYY-MM-DD> --end <YYYY-MM-DD>
  node scripts/keywords.js analyze --queries <path> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
    [--query-pages <path>] [--previous-queries <path>] [--targets <path>]
    [--min-impressions <n>] [--site <url>] [--output <dir>]

Commands:
  analyze           Build the keyword report from the row files supplied
  previous-window   Print the earlier window the trend comparison expects
  help              Print this message

Options:
  --queries <path>            Search Console rows for the reporting window,
                              one "query" dimension. Required by analyze.
  --query-pages <path>        Rows for the same window with the "query" and
                              "page" dimensions. Feeds cannibalization and the
                              page column of target tracking.
  --previous-queries <path>   Rows with one "query" dimension for the earlier
                              window. Feeds the growing and declining sections.
  --targets <path>            Target keywords, one per line. Feeds target tracking.
  --start <YYYY-MM-DD>        First day of the reporting window. Required.
  --end <YYYY-MM-DD>          Last day of the reporting window. Required.
  --min-impressions <n>       Drop rows below this many impressions before
                              ranking. Default ${LIMITS.defaultMinImpressions}.
  --site <url>                Label echoed into the report. Not used in any
                              computation.
  --output <dir>              Also write the result to a file in this directory,
                              an absolute path that must sit outside this tool
                              directory.
  --help, -h                  Print this message

A section whose input was not supplied comes back null, never as an empty list.

Reads only the files the caller names and writes nothing else. Needs no
credentials and no configuration file, so no command takes --env, and no run
opens a network connection. Success prints one JSON object to stdout; a usage
mistake or an unreadable file goes to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no file read, no work.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/keywords.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--queries', '--query-pages', '--previous-queries', '--targets',
  '--start', '--end', '--min-impressions', '--site', '--output'
]);
const BARE_FLAGS = new Set(['--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a report that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/keywords.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  // A SECOND OCCURRENCE IS A USAGE MISTAKE, NOT A PREFERENCE.
  //
  // First-wins silently discarded the rest. Round 12 drove two --file paths at
  // this tool and got a clean, confident, correct-looking object about ONE of
  // them, exit 0, with no signal that the other had been dropped -- which the
  // Script Contract forbids by name. Round 11 fixed this class in Browser
  // Control's switch reader; data-join, data-chart, tag-audit and video-edit
  // already refused. This is the same refusal, in the tools the fix missed.
  // Flags that are documented as repeatable are read somewhere other than here.
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/keywords.js help" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/keywords.js help" for usage.`);
  }
  return value;
}

// --- Dates ---

function toDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseDay(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`Error: ${name} must be a date in YYYY-MM-DD form; got "${value}".`);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || toDay(ms) !== value) {
    fail(`Error: ${name} is not a real calendar date; got "${value}".`);
  }
  return ms;
}

// The earlier window ends the day before the reporting window and covers the
// same number of days. This is the one definition of "previous period" here:
// previous-window prints it, and analyze reports it alongside the trends.
function previousWindow(startMs, endMs) {
  const previousEndMs = startMs - DAY_MS;
  const previousStartMs = previousEndMs - (endMs - startMs);
  return { start: toDay(previousStartMs), end: toDay(previousEndMs) };
}

function readWindow() {
  const startText = flag('--start');
  const endText = flag('--end');
  if (!startText) fail('Error: --start is required. Pass the first day of the reporting window as YYYY-MM-DD.');
  if (!endText) fail('Error: --end is required. Pass the last day of the reporting window as YYYY-MM-DD.');
  const startMs = parseDay(startText, '--start');
  const endMs = parseDay(endText, '--end');
  if (endMs < startMs) {
    fail(`Error: --end (${endText}) falls before --start (${startText}). Pass the window in calendar order.`);
  }
  return { start: startText, end: endText, startMs, endMs };
}

// --- Input files ---

function readTextFile(path, what) {
  if (!isAbsolute(path)) {
    fail(`Error: the path for ${what} must be absolute; got "${path}".`);
  }
  if (!existsSync(path)) {
    fail(`Error: no file at ${path}. Pass the absolute path to ${what}.`);
  }
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // The runtime's own message is withheld; it can echo the path or file bytes.
    fail(`Error: could not read ${path}. Confirm it is a readable file, not a directory.`);
  }
}

// Rows arrive as the Search Console search-analytics response, or as the array
// of rows inside it. Nothing here trusts the shape: the fetch that used to
// guarantee it is not part of this tool.
function readRows(path, what, keyCount) {
  const text = readTextFile(path, what);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's message can quote bytes of the file, so it is not passed on.
    fail(`Error: ${path} is not valid JSON. Pass the Search Console response, or the array of rows inside it.`);
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)
      ? parsed.rows
      : null;

  if (rows === null) {
    fail(`Error: ${path} holds neither an array of rows nor an object with a "rows" array. Pass the search-analytics response holding ${what}.`);
  }

  const dimensions = keyCount === 1 ? '["query"]' : '["query","page"]';
  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(`Error: ${path} row ${index} is not an object. Every row is one Search Console result.`);
    }
    if (!Array.isArray(row.keys) || row.keys.length !== keyCount) {
      fail(`Error: ${path} row ${index} does not carry ${keyCount} key${keyCount === 1 ? '' : 's'}. Query the API with dimensions ${dimensions} for ${what}.`);
    }
    row.keys.forEach((key, position) => {
      if (typeof key !== 'string' || key === '') {
        fail(`Error: ${path} row ${index} has an empty or non-text value at keys[${position}].`);
      }
    });
    for (const field of ['clicks', 'impressions', 'ctr', 'position']) {
      if (typeof row[field] !== 'number' || !Number.isFinite(row[field])) {
        fail(`Error: ${path} row ${index} is missing a numeric "${field}". Pass rows as the API returned them.`);
      }
    }
  });

  return rows;
}

// The source read this list from a markdown file, so a markdown bullet or a
// heading line is the expected shape, not a malformed one.
function readTargets(path) {
  const text = readTextFile(path, 'the target keywords');
  const targets = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const keyword = line.replace(/^[-*]\s+/, '').trim();
    if (keyword !== '') targets.push(keyword);
  }
  if (targets.length === 0) {
    fail(`Error: ${path} holds no keywords. List one keyword per line; blank lines, headings, and bullets are allowed.`);
  }
  return targets;
}

// --- Analysis ---

function toMetrics(row) {
  return {
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

function opportunityReason(row) {
  const position = row.position.toFixed(1);
  if (row.position <= 10) {
    return `Position ${position} with ${row.impressions} impressions: on page 1 but below the fold`;
  }
  if (row.position <= 15) {
    return `Position ${position} with ${row.impressions} impressions: close to page 1`;
  }
  return `Position ${position} with ${row.impressions} impressions: ranking already, and the content needs strengthening to climb`;
}

function findOpportunities(rows) {
  return rows
    .filter((row) => row.position >= LIMITS.opportunityMinPosition
      && row.position <= LIMITS.opportunityMaxPosition
      && row.impressions >= LIMITS.opportunityMinImpressions)
    .slice()
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, LIMITS.opportunities)
    .map((row) => ({
      query: row.keys[0],
      impressions: row.impressions,
      currentPosition: row.position,
      ctr: row.ctr,
      reason: opportunityReason(row),
    }));
}

function findTrends(current, previous) {
  const previousByQuery = new Map(previous.map((row) => [row.keys[0].toLowerCase(), row]));
  const trends = [];

  for (const row of current) {
    const prior = previousByQuery.get(row.keys[0].toLowerCase());
    // No prior row means a new query, and a tiny prior baseline turns one extra
    // click into a triple-digit swing. Neither is a trend.
    if (!prior || prior.clicks < LIMITS.trendMinPreviousClicks) continue;

    const changePercent = ((row.clicks - prior.clicks) / prior.clicks) * 100;
    if (Math.abs(changePercent) < LIMITS.trendMinChangePercent) continue;

    trends.push({
      query: row.keys[0],
      currentClicks: row.clicks,
      previousClicks: prior.clicks,
      changePercent,
      currentPosition: row.position,
    });
  }

  return {
    growing: trends
      .filter((trend) => trend.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, LIMITS.trends),
    declining: trends
      .filter((trend) => trend.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, LIMITS.trends),
  };
}

function detectCannibalization(queryPageRows) {
  const pagesByQuery = new Map();

  for (const row of queryPageRows) {
    const query = row.keys[0];
    if (!pagesByQuery.has(query)) pagesByQuery.set(query, []);
    pagesByQuery.get(query).push({
      page: row.keys[1],
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }

  const warnings = [];

  for (const [query, pages] of pagesByQuery) {
    const competing = pages.filter((page) => page.impressions >= LIMITS.cannibalPageMinImpressions);
    if (competing.length < 2) continue;

    const totalImpressions = competing.reduce((sum, page) => sum + page.impressions, 0);
    if (totalImpressions < LIMITS.cannibalQueryMinImpressions) continue;

    const ranked = competing.slice().sort((a, b) => b.impressions - a.impressions);
    const recommendation = ranked[0].position < ranked[1].position
      ? `Consolidate into ${ranked[0].page}, which draws the most impressions and holds the better position, or give each page its own target intent`
      : `The page drawing the most impressions does not hold the better position; make one the canonical target and redirect or differentiate the other`;

    warnings.push({ warning: { query, pages: ranked, recommendation }, totalImpressions });
  }

  return warnings
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, LIMITS.cannibalWarnings)
    .map((entry) => entry.warning);
}

// Targets are matched against every supplied query row, not the filtered set: a
// target sitting below the impression floor is an answer, not noise.
function trackTargets(targets, queryRows, queryPageRows) {
  const byQuery = new Map(queryRows.map((row) => [row.keys[0].toLowerCase(), row]));
  const pageByQuery = new Map();

  for (const row of queryPageRows ?? []) {
    const key = row.keys[0].toLowerCase();
    if (!pageByQuery.has(key)) pageByQuery.set(key, row.keys[1]);
  }

  return targets.map((keyword) => {
    const key = keyword.toLowerCase();
    const match = byQuery.get(key);
    return {
      keyword,
      found: Boolean(match),
      position: match ? match.position : null,
      clicks: match ? match.clicks : 0,
      impressions: match ? match.impressions : 0,
      page: pageByQuery.get(key) ?? null,
    };
  });
}

// --- Output path, checked before any file is read so a bad path fails fast ---

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output directory usually does not exist yet, so a path whose leaf is
 * absent is canonicalized through the deepest ancestor that does exist and the
 * missing components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
 */
function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * True when `candidate` names `directory` itself or something beneath it,
 * decided by identity rather than by spelling.
 *
 * A prefix comparison is not enough. `realpathSync` preserves whatever case the
 * caller wrote, so on a case-insensitive volume a variant spelling of this tool's
 * own directory canonicalizes to a string carrying none of `directory`'s prefix
 * even though it names that very directory, and the prefix test answers "not
 * inside" about a path that is. Device and inode are a directory's own identity,
 * which no spelling reaches, so every existing ancestor of `candidate` is
 * compared that way. A destination that does not exist yet has no inode of its
 * own, which is why the walk climbs to the deepest ancestor that does: that
 * ancestor is where the write lands.
 */
function descendsFrom(candidate, directory) {
  let rootId;
  try {
    rootId = statSync(directory);
  } catch {
    return false;
  }

  let head = candidate;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

const outputDir = flag('--output');
let outputTarget;

if (outputDir) {
  // Every other path this tool takes is required to be absolute, and the help
  // text says the same of this one. Accepting a relative spelling resolved it
  // against whatever directory the caller happened to be in, so one argument
  // named a different destination from one shell to the next.
  if (!isAbsolute(outputDir)) {
    fail(`Error: --output must be absolute; got "${outputDir}", which would resolve against whatever directory the caller happened to be in.`);
  }

  // The path this screen resolves is the path mkdirSync and writeFileSync below
  // are given. A screen that resolves one path and lets the write take the
  // caller's original spelling has only checked a string.
  outputTarget = canonical('--output', outputDir);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (outputTarget === toolReal || outputTarget.startsWith(`${toolReal}${sep}`) || descendsFrom(outputTarget, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
}

// --- Commands ---

const reportWindow = readWindow();
let result;

if (command === 'previous-window') {
  result = { window: { start: reportWindow.start, end: reportWindow.end }, previousWindow: previousWindow(reportWindow.startMs, reportWindow.endMs) };
} else {
  const queriesPath = flag('--queries');
  if (!queriesPath) {
    fail('Error: --queries is required. Pass the Search Console rows for the reporting window, queried with the "query" dimension.');
  }

  const minImpressionsText = flag('--min-impressions');
  let minImpressions = LIMITS.defaultMinImpressions;
  if (minImpressionsText !== undefined) {
    minImpressions = Number(minImpressionsText);
    if (!Number.isFinite(minImpressions) || minImpressions < 0) {
      fail(`Error: --min-impressions must be a number of zero or more; got "${minImpressionsText}".`);
    }
  }

  const queryPagesPath = flag('--query-pages');
  const previousQueriesPath = flag('--previous-queries');
  const targetsPath = flag('--targets');

  const queries = readRows(queriesPath, 'the reporting-window rows', 1);
  const queryPages = queryPagesPath ? readRows(queryPagesPath, 'the query and page rows', 2) : null;
  const previousQueries = previousQueriesPath ? readRows(previousQueriesPath, 'the earlier-window rows', 1) : null;
  const targets = targetsPath ? readTargets(targetsPath) : null;

  const significant = queries.filter((row) => row.impressions >= minImpressions);
  const trends = previousQueries ? findTrends(significant, previousQueries) : null;

  result = {
    site: flag('--site') ?? null,
    dateRange: { start: reportWindow.start, end: reportWindow.end },
    previousDateRange: previousQueries ? previousWindow(reportWindow.startMs, reportWindow.endMs) : null,
    minImpressions,
    totalQueries: significant.length,
    topPerformers: significant
      .slice()
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, LIMITS.topPerformers)
      .map(toMetrics),
    opportunities: findOpportunities(significant),
    growing: trends ? trends.growing : null,
    declining: trends ? trends.declining : null,
    cannibalization: queryPages ? detectCannibalization(queryPages) : null,
    targetTracking: targets ? trackTargets(targets, queries, queryPages) : null,
  };
}

// Output. A file is written only when the caller names a directory, and never
// inside this tool directory.
if (outputTarget) {
  mkdirSync(outputTarget, { recursive: true });
  const file = join(outputTarget, `seo-keywords-${toDay(Date.now())}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  result.file = file;
}

process.stdout.write(`${JSON.stringify(result)}\n`);
