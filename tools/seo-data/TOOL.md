---
name: seo-data
type: tool
category: seo
description: Consolidates Search Console and Analytics results for one site and date range into one audit dataset, and turns Search Console query rows into a keyword report of top performers, opportunities, trends, cannibalization, and target-keyword standings
version: 0.2.0
---

# seo-data

One tool for search and traffic rows a caller already holds: an audit dataset for one site and date range, a keyword report of top performers, opportunities, trends, cannibalization, and target-keyword standings, and the earlier window that trend comparison expects.

## Context

Use it when search and analytics results for one site have already been fetched and the question is what they say together, or when Search Console query rows need ranking, comparison, and grouping before anyone interprets them. Reach for the matching subcommand instead of reading the rows and reasoning to the figure.

Do not use it to fetch anything. It authenticates to nothing, holds no credential, and makes no network request; the caller pulls the rows and hands them in as files. Do not use it to judge: it computes what the supplied rows contain and returns no findings and no priorities; a keyword report's cannibalization warnings carry one fixed heuristic sentence each, which is arithmetic over positions and not judgment, so the SEO judgment that reads this dataset lives with its caller. Do not reach for it for one page's on-page elements; that is `seo-page-analyzer`. Do not expect backlink data or competitive figures, which appear in neither of the two sources the audit dataset is built from.

`audit` needs both Search Console and Analytics; a partial bundle is refused rather than reported as zeros. `keywords` reads query rows and, optionally, query-and-page rows, earlier-window rows, and a target list. `previous-window` prints the earlier window `keywords` assumes for a trend comparison. A file is written only when `keywords` or `previous-window` is given `--output`.

## Quick Start

```bash
node scripts/seo-data.js help
```

Usage text listing the three subcommands, with nothing installed. `node scripts/seo-data.js audit help` (or `--help`) prints that subcommand's usage; the same form works for `keywords` and `previous-window`.

```bash
node scripts/seo-data.js previous-window --start 2026-06-01 --end 2026-06-28
```

```
{"window":{"start":"2026-06-01","end":"2026-06-28"},"previousWindow":{"start":"2026-05-04","end":"2026-05-31"}}
```

```bash
node scripts/seo-data.js audit --input /path/to/a/work/directory/audit-input.json
```

One JSON object on stdout holding search and traffic totals, top queries, a merged page table, sitemap status, the organic trend, and target-keyword status.

```bash
node scripts/seo-data.js keywords \
  --queries /path/to/a/work/directory/queries.json \
  --previous-queries /path/to/a/work/directory/queries-previous.json \
  --start 2026-06-01 --end 2026-06-28
```

One JSON object on stdout. Anything else, see Troubleshooting.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install, `--env`, and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. No command checks for a package or runs an install. `audit` reads one caller-named file and writes nothing. `keywords` and `previous-window` write a file only when `--output` names a directory outside this tool directory. The sections below state what each command does; the contract states how the script behaves getting there.

No command takes `--env`.

## audit

One JSON object holding a site's search and traffic picture for one date range: the totals over the queries supplied, the traffic summary with its organic share, the top pages with both sources' numbers on one row, the sitemap status, the organic trend by day, and where each target keyword stands.

Use when search and analytics results for one site have already been fetched and the question is what they say together: to open an engagement with one dataset instead of seven separate exports, to produce an identically shaped dataset each period so two runs can be compared, or to see where a named list of target keywords currently stands against what the site actually ranks for.

A bundle that does not meet the input contract is a failure, not a result: the message names the section, the metric, or the row that does not meet it and exits 1, because an audit dataset that quietly reported zeros for a report nobody fetched, or for a row reshaped on its way in, would read as a finding about the site. No message quotes the row it refused, and none repeats the JSON parser's own text, which quotes bytes of whatever file `--input` named.

### Input Bundle

One JSON file holds everything a run reads. Each reporting section is passed through as the API returned it, headers included, because that is what the fetching caller already has:

```
{
  "site": "https://example.com/",
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "searchConsole": {
    "topQueries": [ { "keys": ["<query>"], "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 } ],
    "topPages":   [ { "keys": ["<page url>"], "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 } ],
    "sitemaps":   [ { "path": "<sitemap url>", "isPending": false } ]
  },
  "analytics": {
    "trafficOverview":     { "metricHeaders": [], "rows": [] },
    "acquisitionChannels": { "dimensionHeaders": [], "metricHeaders": [], "rows": [] },
    "topPages":            { "dimensionHeaders": [], "metricHeaders": [], "rows": [] },
    "organicTraffic":      { "dimensionHeaders": [], "metricHeaders": [], "rows": [] }
  },
  "targetKeywords": ["<keyword>"]
}
```

Every section is required except `targetKeywords`. A section that returned nothing is present with an empty `rows` array, which is not the same as a section that was never fetched.

Values are addressed by header name, never by position, so a report carrying extra metrics is read correctly and one missing a named metric is named in the error rather than silently read as zero. Each analytics section must carry these:

| Section | Dimension | Metrics |
|---------|-----------|---------|
| `trafficOverview` | none | `totalUsers`, `sessions`, `screenPageViews`, `engagementRate`, `bounceRate` |
| `acquisitionChannels` | `sessionDefaultChannelGroup` | `totalUsers` |
| `topPages` | `pagePath` | `screenPageViews`, `engagementRate` |
| `organicTraffic` | `date` | `totalUsers`, `sessions`, `screenPageViews` |

Each analytics row carries its numbers in a `metricValues` array and, where the table names a dimension, its label in a `dimensionValues` array, both holding one `{ "value": "<string>" }` cell per header in header order. A row that does not carry those cells is refused rather than read as zeros.

The search sections carry the search analytics row shape: a `keys` array whose first entry is the query or the page address, plus `clicks`, `impressions`, `ctr`, and `position`.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/seo-data.js audit help` | Print usage and exit | No |
| `node scripts/seo-data.js audit --input <path>` | Read the bundle and print the audit dataset | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--input <path>` | The audit input bundle, an absolute path. Required by `audit` | None; required |
| `--help`, `-h` | Print usage and exit | Off |

One site and one date range per run. Comparing two periods means one run each, which keeps every number attributable to the bundle that produced it.

### Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `site`, `dateRange` | Echoed from the bundle, so the dataset says what it describes |
| `searchPerformance` | `queries`, then `clicks`, `impressions`, `ctr`, and `averagePosition` across those queries |
| `trafficSummary` | `users`, `sessions`, `pageViews`, `engagementRate`, `bounceRate`, `organicSearchUsers`, and `organicSearchShare` |
| `topQueries` | One entry per supplied query row: `query`, `clicks`, `impressions`, `ctr`, `position` |
| `topPages` | One entry per supplied page row, with `analyticsPageViews` and `analyticsEngagementRate` added where the join found a match |
| `sitemaps` | `count` of submitted sitemaps and how many are `pending` |
| `organicTrend` | One entry per day in the organic report: `date`, `users`, `sessions`, `pageViews` |
| `targetKeywords` | One entry per keyword supplied, or `null` when the bundle named none |
| `duplicatesDropped` | How many later rows first-wins left unused: `searchQueries` (case-insensitive query string, for target-keyword status) and `analyticsPagePaths` (analytics `pagePath`, for the page join). Each is 0 when that report listed no repeats |

`searchPerformance` describes the query rows in the bundle, not the site. A report fetched with a row limit gives totals over that slice, and `queries` is the count those totals were taken across; `averagePosition` weights each row's position by its impressions, so the figure reflects where the site is seen rather than where it is listed. Totals and `topQueries` still walk every supplied query row, including later duplicates; first-wins applies to which row describes a key for target-keyword status, and those unused later query rows are counted in `duplicatesDropped.searchQueries`.

Pages join on path: the path of each search result address is matched against the analytics page path, which drops any query string. A page address that matches no analytics row, or that does not parse as an address, keeps its search metrics and simply carries no analytics fields, so the two absences look the same in the output.

Where a report lists the same key twice, whether a repeated query or a repeated analytics page path, the first row wins for description: both sources return their rows strongest first, so the first row for a key is the one used for the analytics path join and for target-keyword status. Later rows are not applied to those lookups, and `duplicatesDropped` names how many were dropped on each axis rather than leaving the drop silent.

`targetKeywords` reports `not_ranking` for a keyword absent from the supplied queries, `low_impressions` when it appears with fewer than ten, and `ranking` otherwise. Absent from the supplied rows is not absent from search: a keyword below the row limit of the fetch reads as `not_ranking` here.

Indexing coverage is not in this dataset. How many pages are indexed and how many have errors cannot be derived from the sitemap list; that answer needs per-URL inspection results, which this tool is not given.

## keywords

One JSON object reading a site's search queries five ways: which ones earn the clicks, which ones sit close enough to page 1 to be worth work, which ones moved against the previous window, which ones pull two of the site's own pages against each other, and where the keywords the business named actually stand.

Use it when a caller already holds Search Console query rows and needs them ranked, compared, and grouped before anyone interprets them: after a data pull, to find the queries stuck in positions 5 to 20; to see which queries grew or fell against the previous window; to find one query drawing two of the site's own pages into the same result set; or to check a list of target keywords against what the site actually ranks for.

Its findings are only ever as good as the rows handed in. It cannot tell a full data pull from a truncated one, cannot verify that the earlier rows cover the window it names, and cannot detect that a site has too little traffic to draw conclusions from. A caller reporting these findings owes the reader that context.

Every failure here is a usage mistake or an unreadable input: it names the cause on stderr, leaves stdout empty, and exits 1. Malformed rows are not reported inside the JSON, because a report built from rows of an unknown shape would be wrong in ways a reader could not see. Row errors name the file and the row index, never the row's content, which is a customer's own search data.

### Inputs

Every input is a file the caller names by absolute path. Row files hold a Search Console search-analytics response, or the bare array of rows inside one: each row carries `keys`, `clicks`, `impressions`, `ctr`, and `position`, exactly as the API returns them.

| Input | Dimensions | Feeds | Required |
|-------|------------|-------|----------|
| `--queries` | `["query"]`, over the reporting window | Query count, top performers, opportunities, and the current side of every trend | Yes |
| `--query-pages` | `["query","page"]`, over the same window | Cannibalization, and the page column of target tracking | No |
| `--previous-queries` | `["query"]`, over the earlier window | Growing and declining | No |
| `--targets` | Plain text, one keyword per line | Target tracking | No |

A row file whose rows carry the wrong number of keys is refused rather than read as the other kind: query rows and query-and-page rows look alike until the second key decides an answer. The target keyword file reads as a markdown list, so blank lines, `#` headings, and `-` or `*` bullets are expected shapes; each remaining line is one keyword.

A section whose input was not supplied comes back `null`. An empty list means the input arrived and nothing in it met the thresholds. The two are different answers and the report keeps them apart.

### Thresholds

Every cut this command makes, in one place. The impression floor comes first: a query holding fewer than `--min-impressions` impressions, 10 by default, is dropped before anything is ranked, which shapes the query count, the top performers, the opportunities, and the trends.

| Section | Kept when | Ordered by | Capped at |
|---------|-----------|------------|-----------|
| `topPerformers` | Any query above the floor | Clicks, descending | 25 |
| `opportunities` | Position 5 to 20 inclusive, and at least 50 impressions | Impressions, descending | 20 |
| `growing` and `declining` | The query drew at least 3 clicks in the earlier window and moved at least 20 percent | Percent change, largest move first | 15 each |
| `cannibalization` | Two or more pages hold at least 10 impressions each for one query, and those pages total at least 50 impressions | Total impressions for the query, descending | 10 |
| `targetTracking` | Every keyword in the file, matched case-insensitively | The order they appear in the file | None |

Two of these are deliberate exceptions to the impression floor. Cannibalization reads the query-and-page rows unfiltered, because a query splitting its impressions across pages can leave each page below the floor while the query itself matters. Target tracking matches against the unfiltered query rows, because a named keyword sitting below the floor is an answer, not noise.

A query absent from the earlier window, or holding fewer than 3 clicks there, produces no trend: a new query has nothing to compare against, and a one-click baseline turns a second click into a 100 percent rise.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/seo-data.js keywords help` | Print usage and exit | No |
| `node scripts/seo-data.js keywords --queries <path> --start <d> --end <d>` | Build the keyword report from the row files supplied | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--queries <path>` | Query rows for the reporting window. Required by `keywords` | None; required |
| `--query-pages <path>` | Query-and-page rows for the same window | None; cannibalization and the target page column report `null` |
| `--previous-queries <path>` | Query rows for the earlier window | None; growing and declining report `null` |
| `--targets <path>` | Target keywords, one per line | None; target tracking reports `null` |
| `--start <YYYY-MM-DD>` | First day of the reporting window. Required | None; required |
| `--end <YYYY-MM-DD>` | Last day of the reporting window. Required | None; required |
| `--min-impressions <n>` | The impression floor | 10 |
| `--site <url>` | A label echoed into the report as `site`; no computation reads it | `null` |
| `--output <dir>` | Also write the result to a file in this directory, an absolute path that must sit outside this tool directory | None; stdout only |
| `--help`, `-h` | Print usage and exit | Off |

The window is the caller's assertion about the rows, never read from them: the rows carry no dates. It sets `dateRange`, and it is the only thing `previousDateRange` is derived from.

### Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `site` | The `--site` label, or `null` |
| `dateRange` | The reporting window, as given |
| `previousDateRange` | The earlier window the trends assume, or `null` when no earlier rows were supplied |
| `minImpressions` | The floor this run applied |
| `totalQueries` | How many query rows cleared the floor |
| `topPerformers` | Up to 25 entries, each with `query`, `clicks`, `impressions`, `ctr`, `position` |
| `opportunities` | Up to 20 entries, each with `query`, `impressions`, `currentPosition`, `ctr`, and a `reason` naming the position band it fell in |
| `growing`, `declining` | Up to 15 entries each, with `query`, `currentClicks`, `previousClicks`, `changePercent`, `currentPosition`; `null` without earlier rows |
| `cannibalization` | Up to 10 warnings, each with `query`, its competing `pages` ordered by impressions, and a `recommendation`; `null` without query-and-page rows |
| `targetTracking` | One entry per target keyword, with `found`, `position`, `clicks`, `impressions`, and the `page` ranking for it; `null` without a target file |
| `file` | Present only when `--output` was given: where the result was also written, as `seo-keywords-YYYY-MM-DD.json` in that directory, the name both subcommands have always used |

`ctr` and `position` pass through as the API reported them, a fraction and an average rank, unrounded. The `page` in target tracking is the first page the query-and-page rows list for that keyword, which for Search Console output is its strongest page; it is `null` when no query-and-page rows were supplied or the keyword ranks nowhere.

A file is written only when `--output <dir>` is given, named `seo-keywords-YYYY-MM-DD.json`, and the directory must sit outside this tool directory.

## previous-window

One JSON object naming the reporting window and the earlier window of the same length that ends the day before it.

Use it so a caller fetches exactly the rows the `keywords` trend comparison expects. For a reporting window of 2026-06-01 to 2026-06-28, the earlier window is 2026-05-04 to 2026-05-31. `keywords` reports that window back as `previousDateRange`. Whether the rows handed in actually cover it is the caller's to guarantee.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/seo-data.js previous-window help` | Print usage and exit | No |
| `node scripts/seo-data.js previous-window --start <d> --end <d>` | Print the earlier window the trend comparison expects | No |

| Option | Effect | Default |
|--------|--------|---------|
| `--start <YYYY-MM-DD>` | First day of the reporting window. Required | None; required |
| `--end <YYYY-MM-DD>` | Last day of the reporting window. Required | None; required |
| `--output <dir>` | Also write the result to a file in this directory, an absolute path that must sit outside this tool directory | None; stdout only |
| `--help`, `-h` | Print usage and exit | Off |

The same flag set as `keywords` is accepted, so a flag that `keywords` names is not refused here; only `--start`, `--end`, and `--output` change what this command prints or writes.

### Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `window` | The reporting window, as given |
| `previousWindow` | The earlier window of the same length, ending the day before `--start` |
| `file` | Present only when `--output` was given: where the result was also written, as `seo-keywords-YYYY-MM-DD.json` in that directory, the name both subcommands have always used |

## Troubleshooting

The stops every tool shares, an unknown flag and a path that is relative or inside this tool, are in `tools/RUNNING.md`; this tool installs nothing; the rows below are its own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --input is required.` | `audit` ran with no bundle to read | Pass `--input <path>` |
| `Error: --queries is required` | `keywords` ran with no rows to read | Pass `--queries <path>` |
| `Error: --start is required` | The reporting window was not given | Pass `--start` and `--end`; `keywords` and `previous-window` need them |
| `Error: --start must be a date in YYYY-MM-DD form` | A date in another format, or a partial one | Pass it as `standards/conventions.md` sets dates everywhere |
| `Error: --end (...) falls before --start (...)` | The window was passed backwards | Swap them |
| `Error: the path for ... must be absolute` | A relative path, which resolves against the caller's directory | Pass the absolute path |
| `Error: no file at <path>` | The path given does not exist | Check the path; an absolute one cannot be misread |
| `Error: <path> is not JSON.` | The audit file is not JSON, often the wrong file entirely | Point `--input` at the bundle; the file's own content is never quoted back |
| `Error: <path> is JSON but not an audit input bundle.` | The top level is an array or a bare value | Wrap the sections in one object per Input Bundle |
| `Error: <section> is missing from the input bundle.` | A required section was never fetched, or sits under a different key | Fetch it and add it; an empty result is an empty `rows` array, not an absent section |
| `Error: <section> carries no "<name>" metric.` or `carries no "<name>" dimension.` | The report was fetched without the metric this dataset reads, or built on a different dimension than the one Input Bundle names | Re-fetch that report with the metric and the dimension named in Input Bundle |
| `Error: <section> carries no metricHeaders array.` or `no dimensionHeaders array.` | The response was unwrapped before it was written to the bundle | Pass the report as the API returned it, headers included |
| `Error: <section> row N has no keys array.` | A search analytics row was reshaped, or a different report was pasted in | Pass the search rows unchanged |
| `Error: <section> row N is not a report row.`, `row N has no metricValues array.`, `no dimensionValues array.`, or `entry N carries no value field.` | A reporting row was flattened to bare values, or unwrapped a level, before it was written to the bundle | Pass the reporting rows unchanged; the row's own content is never quoted back |
| `Error: <path> is not valid JSON` | A keyword row file is not the API response, or the pull was truncated | Re-fetch; the message does not quote the file, so inspect it directly |
| `Error: <path> holds neither an array of rows nor an object with a "rows" array` | A response envelope of a different shape, or an empty object where a pull failed | Pass the search-analytics response, or the row array inside it |
| `Error: <path> row N does not carry 1 key` | Query-and-page rows were passed to `--queries` | Send them to `--query-pages`; query rows come from a `["query"]` pull |
| `Error: <path> row N does not carry 2 keys` | Query rows were passed to `--query-pages` | Re-fetch with dimensions `["query","page"]` |
| `Error: <path> row N is missing a numeric "clicks"` | Rows were reshaped between the fetch and this call | Pass rows as the API returned them |
| `Error: <path> holds no keywords` | The target file is empty, or holds only headings and blank lines | List one keyword per line |
| `topPages` entries carry no analytics fields | The page paths in the two reports do not match, or the search address does not parse | Confirm both reports cover the same property and host: the join is on path alone, so a differing host or a path prefix one report carries and the other does not matches nothing |
| `organicSearchShare` is 0 with organic traffic in the trend | No acquisition row is labeled `Organic Search` | Confirm the channel dimension is `sessionDefaultChannelGroup`; a custom channel grouping uses different labels |
| A target keyword reads `not_ranking` on a page known to rank | The query fell below the row limit of the query fetch | Re-fetch the queries with a higher row limit, then re-run |
| `cannibalization` is `null` when pages plainly compete | `--query-pages` was not supplied | Fetch the `["query","page"]` rows and pass them |
| `growing` and `declining` are both empty | No query cleared both the 3-click baseline and the 20 percent move | Expected on a low-traffic site or a short window; widen the window |
| `opportunities` is empty on a site with traffic | Nothing sat in positions 5 to 20 with 50 or more impressions | Read `topPerformers` instead; a site ranking well or ranking nowhere has no middle band |
| A target keyword reports `found: false` while the site ranks for it | The keyword is spelled differently in the data, or Search Console withheld the row as a rare query | Compare against `topPerformers`; rare queries are anonymized at the source and cannot be recovered |

## Success

- `help` prints usage listing the three subcommands to stdout and exits 0 with nothing installed and nothing configured. `audit help` and `audit --help` print that subcommand's usage; the same form works for `keywords` and `previous-window`.
- `audit` against a complete bundle exits 0 with one parseable JSON object on stdout, including `duplicatesDropped` with `searchQueries` and `analyticsPagePaths` (each 0 when the report listed no repeats).
- `audit` with `--input` omitted, or naming a path that does not exist, exits 1 with the cause on stderr and stdout empty.
- A bundle missing a section, a report missing a named metric or dimension, or a reporting row reshaped on its way in, exits 1 naming what is wrong, and no partial dataset reaches stdout.
- `previous-window` prints the window ending the day before `--start` and covering the same number of days, and exits 0.
- `keywords` with query rows alone exits 0 with one parseable JSON object carrying `topPerformers` and `opportunities`, and `null` for every section whose input was absent.
- `keywords` with all four inputs fills every section, and each section holds only entries meeting its row of the Thresholds table.
- `keywords` with `--queries` omitted, naming a path that does not exist, or handed rows of the wrong dimensions, exits 1 with the cause on stderr and stdout empty.
- A file that is not JSON, and a row that does not meet the contract, are refused without any of their content appearing in the message.
- Every number in the output is computed from rows in the files named: nothing is estimated, carried in from elsewhere, or filled in for a report that was not supplied or a row that did not carry it.
- No run reads a credential, opens a network connection, or writes any file other than one the caller named with `--output`.
