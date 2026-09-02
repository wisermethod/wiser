---
name: seo-audit
type: tool
category: seo
description: Consolidates the Search Console and Analytics results a caller supplies for one site and date range into one audit dataset of search and traffic totals, top queries, a merged page table, sitemap status, the organic trend, and target-keyword status
version: 0.1.1
---

# seo-audit

One JSON object holding a site's search and traffic picture for one date range: the totals over the queries supplied, the traffic summary with its organic share, the top pages with both sources' numbers on one row, the sitemap status, the organic trend by day, and where each target keyword stands.

## Context

Use when search and analytics results for one site have already been fetched and the question is what they say together: to open an engagement with one dataset instead of seven separate exports, to produce an identically shaped dataset each period so two runs can be compared, or to see where a named list of target keywords currently stands against what the site actually ranks for.

Do not use it to fetch anything. It authenticates to nothing, holds no credential, and makes no network request; fetching belongs to the skill that holds the platform connector, and this tool reads only the file that skill hands it. Do not use it to judge: it computes what the supplied rows contain and returns no findings, no priorities, and no recommendations, so the SEO judgment that reads this dataset lives with its caller. Do not reach for it for one page's on-page elements or for keyword opportunity analysis; those are `seo-page-analyzer` and `seo-keywords`. Do not expect backlink data or competitive figures, which appear in neither of the two sources this dataset is built from, and do not run it for a site that has search data but no analytics data: the page join, the organic share, and the trend all need both, and a partial bundle is refused rather than reported as zeros.

## Input Bundle

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

## Quick Start

```bash
node scripts/audit.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/audit.js build --input /path/to/a/work/directory/audit-input.json
```

One JSON object on stdout:

```
{"site":"https://example.com/","dateRange":{"start":"2026-06-01","end":"2026-06-28"},"searchPerformance":{"queries":100,"clicks":412,"impressions":38400,"ctr":0.0107,"averagePosition":14.2},"trafficSummary":{"users":2100,"sessions":2680,"pageViews":5100,"engagementRate":0.61,"bounceRate":0.39,"organicSearchUsers":980,"organicSearchShare":0.4667},"topQueries":[{"query":"<query>","clicks":41,"impressions":2400,"ctr":0.017,"position":8.1}],"topPages":[{"page":"https://example.com/pricing","clicks":88,"impressions":5200,"ctr":0.0169,"position":6.4,"analyticsPageViews":740,"analyticsEngagementRate":0.58}],"sitemaps":{"count":2,"pending":0},"organicTrend":[{"date":"20260601","users":31,"sessions":38,"pageViews":74}],"targetKeywords":[{"keyword":"<keyword>","position":8.1,"clicks":41,"impressions":2400,"ctr":0.017,"status":"ranking"}]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Needs configuration |
|---------|---------|---------------------|
| `node scripts/audit.js help` | Print usage and exit | No |
| `node scripts/audit.js build --input <path>` | Read the bundle and print the audit dataset | No |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--input <path>` | The audit input bundle, an absolute path. Required by `build` | None; required |
| `--help`, `-h` | Print usage and exit | Off |

One site and one date range per run. Comparing two periods means one run each, which keeps every number attributable to the bundle that produced it.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything else, and the stdout and stderr rules. It imports no package and reads no configuration file, so that contract's dependency check and `--env` clauses have nothing to bind here, and the tool carries no Dependencies section because Node is all it needs. The sections above state what the command does; the contract states how the script behaves getting there.

A bundle that does not meet the input contract is a failure, not a result: the message names the section, the metric, or the row that does not meet it and exits 1, because an audit dataset that quietly reported zeros for a report nobody fetched, or for a row reshaped on its way in, would read as a finding about the site. No message quotes the row it refused, and none repeats the JSON parser's own text, which quotes bytes of whatever file `--input` named.

## Output

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

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --input is required.` | `build` ran with no bundle to read | Pass `--input <path>` |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: no file at <path>` | The path given to `--input` does not exist | Check the path; an absolute one cannot be misread |
| `Error: <path> is not JSON.` | The file is not JSON, often the wrong file entirely | Point `--input` at the bundle; the file's own content is never quoted back |
| `Error: <path> is JSON but not an audit input bundle.` | The top level is an array or a bare value | Wrap the sections in one object per Input Bundle |
| `Error: <section> is missing from the input bundle.` | A required section was never fetched, or sits under a different key | Fetch it and add it; an empty result is an empty `rows` array, not an absent section |
| `Error: <section> carries no "<name>" metric.` or `carries no "<name>" dimension.` | The report was fetched without the metric this dataset reads, or built on a different dimension than the one Input Bundle names | Re-fetch that report with the metric and the dimension named in Input Bundle |
| `Error: <section> carries no metricHeaders array.` or `no dimensionHeaders array.` | The response was unwrapped before it was written to the bundle | Pass the report as the API returned it, headers included |
| `Error: <section> row N has no keys array.` | A search analytics row was reshaped, or a different report was pasted in | Pass the search rows unchanged |
| `Error: <section> row N is not a report row.`, `row N has no metricValues array.`, `no dimensionValues array.`, or `entry N carries no value field.` | A reporting row was flattened to bare values, or unwrapped a level, before it was written to the bundle | Pass the reporting rows unchanged; the row's own content is never quoted back |
| `topPages` entries carry no analytics fields | The page paths in the two reports do not match, or the search address does not parse | Confirm both reports cover the same property and host: the join is on path alone, so a differing host or a path prefix one report carries and the other does not matches nothing |
| `organicSearchShare` is 0 with organic traffic in the trend | No acquisition row is labeled `Organic Search` | Confirm the channel dimension is `sessionDefaultChannelGroup`; a custom channel grouping uses different labels |
| A target keyword reads `not_ranking` on a page known to rank | The query fell below the row limit of the query fetch | Re-fetch the queries with a higher row limit, then re-run |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `build` against a complete bundle exits 0 with one parseable JSON object on stdout, including `duplicatesDropped` with `searchQueries` and `analyticsPagePaths` (each 0 when the report listed no repeats).
- `build` with `--input` omitted, or naming a path that does not exist, exits 1 with the cause on stderr and stdout empty.
- A bundle missing a section, a report missing a named metric or dimension, or a reporting row reshaped on its way in, exits 1 naming what is wrong, and no partial dataset reaches stdout.
- A file that is not JSON, and a row that does not meet the contract, are refused without any of their content appearing in the message.
- Every number in the output is computed from rows in the bundle: nothing is estimated, carried in from elsewhere, or filled in for a report that was not supplied or a row that did not carry it.
- No run reads a credential, opens a network connection, or writes a file.
