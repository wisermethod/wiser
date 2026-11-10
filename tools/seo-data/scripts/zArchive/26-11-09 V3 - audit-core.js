/** Portable audit arithmetic and validation, shared by the CLI and hosted action. */
import { checkAnswerListSize } from './answer-size.js';
const fail = message => { throw new Error(message); };
export function auditReport(bundle, inputPath) {
if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
  fail(`Error: ${inputPath} is JSON but not an audit input bundle. The top level is one object with site, dateRange, searchConsole, and analytics.`);
}

// --- Input contract ---

function requireString(value, where) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`Error: ${where} is missing from the input bundle. It is a non-empty string.`);
  }
  return value;
}

function requireObject(value, where) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`Error: ${where} is missing from the input bundle. It is an object.`);
  }
  return value;
}

function requireArray(value, where) {
  if (!Array.isArray(value)) {
    fail(`Error: ${where} is missing from the input bundle. It is an array, empty when the report returned nothing.`);
  }
  return value;
}

// Search analytics rows arrive with a keys array whose first entry is the query
// or the page. A row without one would put "undefined" in the output, so it stops
// the run instead.
function searchRows(value, where, minimumItemCharacters) {
  const rows = requireArray(value, where);
  checkAnswerListSize(rows.length, minimumItemCharacters);
  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || !Array.isArray(row.keys) || typeof row.keys[0] !== 'string') {
      fail(`Error: ${where} row ${index} has no keys array. Pass the search analytics rows as the reporting API returned them.`);
    }
  });
  return rows;
}

function metric(row) {
  return {
    clicks: finite(row.clicks),
    impressions: finite(row.impressions),
    ctr: finite(row.ctr),
    position: finite(row.position)
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Header lookup by name. The source of this behavior read metric values by their
// position in the request it had built itself; a tool handed a response it did
// not request cannot know that order, so every value is addressed by its header.
function headerIndex(section, where, kind, name) {
  const headers = section[`${kind}Headers`];
  if (!Array.isArray(headers)) {
    fail(`Error: ${where} carries no ${kind}Headers array. Pass the report as the reporting API returned it, headers included.`);
  }
  const index = headers.findIndex((header) => header !== null && typeof header === 'object' && header.name === name);
  if (index === -1) {
    fail(`Error: ${where} carries no "${name}" ${kind}. Re-fetch that report with "${name}" among its ${kind}s.`);
  }
  return index;
}

// Reporting rows carry their numbers in a metricValues array of cells, and their
// labels in dimensionValues the same way. A row shaped otherwise reads as zero
// for every metric it should have carried, and a zero that nobody fetched is the
// finding-shaped silence this tool refuses to print, so a reshaped row stops the
// run exactly as a reshaped search row does. A section that returned nothing is
// an empty rows array and still yields zeros; that is a report, not a reshaping.
function reportRows(section, where, options = {}) {
  const rows = section.rows;
  if (rows === undefined || rows === null) return [];
  requireArray(rows, `${where}.rows`);
  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(`Error: ${where} row ${index} is not a report row. Pass the report rows as the reporting API returned them.`);
    }
    requireCells(row.metricValues, `${where} row ${index}`, 'metricValues');
    if (options.dimensions === true) {
      requireCells(row.dimensionValues, `${where} row ${index}`, 'dimensionValues');
    }
  });
  return rows;
}

// The offending cell is named by its position, never quoted: a bundle can be
// assembled from anything on disk, so no row content reaches the message.
function requireCells(list, where, kind) {
  if (!Array.isArray(list)) {
    fail(`Error: ${where} has no ${kind} array. Pass the report rows as the reporting API returned them.`);
  }
  const bad = list.findIndex(
    (cell) => cell === null || typeof cell !== 'object' || Array.isArray(cell) || !('value' in cell)
  );
  if (bad !== -1) {
    fail(`Error: ${where} ${kind} entry ${bad} carries no value field. Pass the report rows as the reporting API returned them.`);
  }
}

function valueAt(list, index) {
  const cell = Array.isArray(list) ? list[index] : undefined;
  return cell !== null && typeof cell === 'object' ? cell.value : undefined;
}

function numberAt(list, index) {
  return finite(valueAt(list, index));
}

const site = requireString(bundle.site, 'site');
const dateRange = requireObject(bundle.dateRange, 'dateRange');
const start = requireString(dateRange.start, 'dateRange.start');
const end = requireString(dateRange.end, 'dateRange.end');

const searchConsole = requireObject(bundle.searchConsole, 'searchConsole');
const queryRows = searchRows(searchConsole.topQueries, 'searchConsole.topQueries', '{"query":"","clicks":0,"impressions":0,"ctr":0,"position":0}'.length);
const pageRows = searchRows(searchConsole.topPages, 'searchConsole.topPages', '{"page":"","clicks":0,"impressions":0,"ctr":0,"position":0}'.length);
const sitemapRows = requireArray(searchConsole.sitemaps, 'searchConsole.sitemaps');

const analytics = requireObject(bundle.analytics, 'analytics');
const overview = requireObject(analytics.trafficOverview, 'analytics.trafficOverview');
const channels = requireObject(analytics.acquisitionChannels, 'analytics.acquisitionChannels');
const analyticsPages = requireObject(analytics.topPages, 'analytics.topPages');
const organic = requireObject(analytics.organicTraffic, 'analytics.organicTraffic');

let targetKeywords = null;
if (bundle.targetKeywords !== undefined && bundle.targetKeywords !== null) {
  const list = requireArray(bundle.targetKeywords, 'targetKeywords');
  checkAnswerListSize(list.length, '{"keyword":"","position":0,"clicks":0,"impressions":0,"ctr":0,"status":"ranking"}'.length);
  list.forEach((keyword, index) => {
    if (typeof keyword !== 'string') {
      fail(`Error: targetKeywords entry ${index} is not a string. Pass a flat list of keywords.`);
    }
  });
  targetKeywords = list;
}

// --- Search performance, over the query rows supplied ---

let clicks = 0;
let impressions = 0;
let weightedPosition = 0;
for (const row of queryRows) {
  const values = metric(row);
  clicks += values.clicks;
  impressions += values.impressions;
  weightedPosition += values.position * values.impressions;
}

const searchPerformance = {
  queries: queryRows.length,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  averagePosition: impressions > 0 ? weightedPosition / impressions : 0
};

// --- Traffic summary ---

const overviewRows = reportRows(overview, 'analytics.trafficOverview');
const overviewValues = overviewRows.length > 0 ? overviewRows[0].metricValues : undefined;
const usersIndex = headerIndex(overview, 'analytics.trafficOverview', 'metric', 'totalUsers');
const sessionsIndex = headerIndex(overview, 'analytics.trafficOverview', 'metric', 'sessions');
const pageViewsIndex = headerIndex(overview, 'analytics.trafficOverview', 'metric', 'screenPageViews');
const engagementIndex = headerIndex(overview, 'analytics.trafficOverview', 'metric', 'engagementRate');
const bounceIndex = headerIndex(overview, 'analytics.trafficOverview', 'metric', 'bounceRate');

const users = numberAt(overviewValues, usersIndex);

const channelIndex = headerIndex(channels, 'analytics.acquisitionChannels', 'dimension', 'sessionDefaultChannelGroup');
const channelUsersIndex = headerIndex(channels, 'analytics.acquisitionChannels', 'metric', 'totalUsers');

let organicSearchUsers = 0;
for (const row of reportRows(channels, 'analytics.acquisitionChannels', { dimensions: true })) {
  if (valueAt(row.dimensionValues, channelIndex) === 'Organic Search') {
    organicSearchUsers = numberAt(row.metricValues, channelUsersIndex);
    break;
  }
}

const trafficSummary = {
  users,
  sessions: numberAt(overviewValues, sessionsIndex),
  pageViews: numberAt(overviewValues, pageViewsIndex),
  engagementRate: numberAt(overviewValues, engagementIndex),
  bounceRate: numberAt(overviewValues, bounceIndex),
  organicSearchUsers,
  organicSearchShare: users > 0 ? organicSearchUsers / users : 0
};

// --- Page table, Search Console rows joined to Analytics by path ---

const pagePathIndex = headerIndex(analyticsPages, 'analytics.topPages', 'dimension', 'pagePath');
const pageViewsMetricIndex = headerIndex(analyticsPages, 'analytics.topPages', 'metric', 'screenPageViews');
const pageEngagementIndex = headerIndex(analyticsPages, 'analytics.topPages', 'metric', 'engagementRate');

const analyticsByPath = new Map();
let analyticsPagePathDuplicatesDropped = 0;
for (const row of reportRows(analyticsPages, 'analytics.topPages', { dimensions: true })) {
  const path = valueAt(row.dimensionValues, pagePathIndex);
  if (typeof path !== 'string') continue;
  // First row wins, matching the query join below. Both reporting APIs return
  // rows strongest first, so the first row for a repeated key is the one that
  // describes it; taking the later row would quietly shrink a page's numbers.
  if (analyticsByPath.has(path)) {
    analyticsPagePathDuplicatesDropped += 1;
    continue;
  }
  analyticsByPath.set(path, {
    pageViews: numberAt(row.metricValues, pageViewsMetricIndex),
    engagementRate: numberAt(row.metricValues, pageEngagementIndex)
  });
}

// Search-query first-wins: later rows for the same query string (case-insensitive)
// are not used for target-keyword status. Totals and topQueries still include them.
let searchQueryDuplicatesDropped = 0;
const seenSearchQueries = new Set();
for (const row of queryRows) {
  const query = row.keys[0].toLowerCase();
  if (seenSearchQueries.has(query)) searchQueryDuplicatesDropped += 1;
  else seenSearchQueries.add(query);
}

const topPages = pageRows.map((row) => {
  const page = row.keys[0];
  const values = metric(row);
  const entry = { page, ...values };

  // An address that does not parse joins nothing, which is where an address with
  // no matching path lands too. The row still carries its search metrics.
  let path;
  try {
    path = new URL(page).pathname;
  } catch {
    return entry;
  }

  const analyticsRow = analyticsByPath.get(path);
  if (analyticsRow === undefined) return entry;

  return {
    ...entry,
    analyticsPageViews: analyticsRow.pageViews,
    analyticsEngagementRate: analyticsRow.engagementRate
  };
});

// --- Sitemap status ---

const sitemaps = {
  count: sitemapRows.length,
  pending: sitemapRows.filter((row) => row !== null && typeof row === 'object' && row.isPending === true).length
};

// --- Organic trend ---

const trendDateIndex = headerIndex(organic, 'analytics.organicTraffic', 'dimension', 'date');
const trendUsersIndex = headerIndex(organic, 'analytics.organicTraffic', 'metric', 'totalUsers');
const trendSessionsIndex = headerIndex(organic, 'analytics.organicTraffic', 'metric', 'sessions');
const trendPageViewsIndex = headerIndex(organic, 'analytics.organicTraffic', 'metric', 'screenPageViews');

const organicRows = reportRows(organic, 'analytics.organicTraffic', { dimensions: true });
checkAnswerListSize(organicRows.length, '{"date":0,"users":0,"sessions":0,"pageViews":0}'.length);
const organicTrend = organicRows.map((row) => ({
  date: valueAt(row.dimensionValues, trendDateIndex) ?? '',
  users: numberAt(row.metricValues, trendUsersIndex),
  sessions: numberAt(row.metricValues, trendSessionsIndex),
  pageViews: numberAt(row.metricValues, trendPageViewsIndex)
}));

// --- Target keyword status ---

let keywordStatus = null;
if (targetKeywords !== null) {
  // First row for each query string wins, same rule as the path join above.
  const byQuery = new Map();
  for (const row of queryRows) {
    const query = row.keys[0].toLowerCase();
    if (!byQuery.has(query)) byQuery.set(query, row);
  }

  keywordStatus = targetKeywords.map((keyword) => {
    const match = byQuery.get(keyword.toLowerCase());
    if (match === undefined) {
      return { keyword, position: null, clicks: 0, impressions: 0, ctr: 0, status: 'not_ranking' };
    }
    const values = metric(match);
    return {
      keyword,
      position: values.position,
      clicks: values.clicks,
      impressions: values.impressions,
      ctr: values.ctr,
      status: values.impressions < 10 ? 'low_impressions' : 'ranking'
    };
  });
}

// --- Result ---

return {
  site,
  dateRange: { start, end },
  searchPerformance,
  trafficSummary,
  topQueries: queryRows.map((row) => ({ query: row.keys[0], ...metric(row) })),
  topPages,
  sitemaps,
  organicTrend,
  targetKeywords: keywordStatus,
  duplicatesDropped: {
    searchQueries: searchQueryDuplicatesDropped,
    analyticsPagePaths: analyticsPagePathDuplicatesDropped
  }
};

}
