/** Portable keyword arithmetic, dates and row validation. */
import { checkAnswerListSize } from './answer-size.js';
const fail = message => { throw new Error(message); };
const DAY_MS = 86400000;
// Empty strings, true and zero give a lower bound for every tracking object.
const TARGET_MIN_CHARACTERS = '{"keyword":"","found":true,"position":0,"clicks":0,"impressions":0,"page":""}'.length;

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

export function keywordReport(input, readTextFile, { validateOnly = false } = {}) {
const command = input.command;
const flag = name => input[name.slice(2)];
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
// previous-window prints it, and keywords reports it alongside the trends.
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
  // Iterate lines lazily: a small export can contain millions of targets.
  for (const match of text.matchAll(/[^\n]+/g)) {
    const line = match[0].trim();
    if (line === '' || line.startsWith('#')) continue;
    const keyword = line.replace(/^[-*]\s+/, '').trim();
    if (keyword !== '') {
      checkAnswerListSize(targets.length + 1, TARGET_MIN_CHARACTERS);
      targets.push(keyword);
    }
  }
  if (targets.length === 0) {
    fail(`Error: ${path} holds no keywords. List one keyword per line; blank lines, headings, and bullets are allowed.`);
  }
  return targets;
}

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
  checkAnswerListSize(targets.length, TARGET_MIN_CHARACTERS);
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

  if (validateOnly) return null;
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

return result;
}
