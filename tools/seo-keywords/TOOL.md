---
name: seo-keywords
type: tool
category: seo
description: Turns Search Console query rows into a keyword report of top performers, position 5 to 20 opportunities, queries growing and declining against the previous window, pages competing for the same query, and the standing of named target keywords
version: 0.1.1
---

# seo-keywords

One JSON object reading a site's search queries five ways: which ones earn the clicks, which ones sit close enough to page 1 to be worth work, which ones moved against the previous window, which ones pull two of the site's own pages against each other, and where the keywords the business named actually stand.

## Context

Use it when a caller already holds Search Console query rows and needs them ranked, compared, and grouped before anyone interprets them: after a data pull, to find the queries stuck in positions 5 to 20; to see which queries grew or fell against the previous window; to find one query drawing two of the site's own pages into the same result set; or to check a list of target keywords against what the site actually ranks for.

Do not use it to fetch anything. It holds no credential, authenticates to nothing, opens no network connection, and reaches no other primitive; the caller pulls the rows through a connector and hands them in as files. Do not use it to judge what the numbers mean either: it ranks, compares, and flags, and it recommends nothing beyond the one consolidation line each cannibalization warning carries. Interpretation, prioritization, and the report a client reads belong to the skill or expert that called it. On-page elements of a single URL and a whole-site audit that folds in Analytics traffic are separate tools, not modes of this one.

Its findings are only ever as good as the rows handed in. It cannot tell a full data pull from a truncated one, cannot verify that the earlier rows cover the window it names, and cannot detect that a site has too little traffic to draw conclusions from. A caller reporting these findings owes the reader that context.

## Inputs

Every input is a file the caller names by absolute path. Row files hold a Search Console search-analytics response, or the bare array of rows inside one: each row carries `keys`, `clicks`, `impressions`, `ctr`, and `position`, exactly as the API returns them.

| Input | Dimensions | Feeds | Required |
|-------|------------|-------|----------|
| `--queries` | `["query"]`, over the reporting window | Query count, top performers, opportunities, and the current side of every trend | Yes |
| `--query-pages` | `["query","page"]`, over the same window | Cannibalization, and the page column of target tracking | No |
| `--previous-queries` | `["query"]`, over the earlier window | Growing and declining | No |
| `--targets` | Plain text, one keyword per line | Target tracking | No |

A row file whose rows carry the wrong number of keys is refused rather than read as the other kind: query rows and query-and-page rows look alike until the second key decides an answer. The target keyword file reads as a markdown list, so blank lines, `#` headings, and `-` or `*` bullets are expected shapes; each remaining line is one keyword.

A section whose input was not supplied comes back `null`. An empty list means the input arrived and nothing in it met the thresholds. The two are different answers and the report keeps them apart.

## The Previous Window

The earlier window ends the day before the reporting window and covers the same number of days: for a reporting window of 2026-06-01 to 2026-06-28, the earlier window is 2026-05-04 to 2026-05-31. `previous-window` prints that window so a caller fetches exactly the rows the trend comparison expects, and `analyze` reports it back as `previousDateRange`. Whether the rows handed in actually cover it is the caller's to guarantee.

## Thresholds

Every cut this tool makes, in one place. The impression floor comes first: a query holding fewer than `--min-impressions` impressions, 10 by default, is dropped before anything is ranked, which shapes the query count, the top performers, the opportunities, and the trends.

| Section | Kept when | Ordered by | Capped at |
|---------|-----------|------------|-----------|
| `topPerformers` | Any query above the floor | Clicks, descending | 25 |
| `opportunities` | Position 5 to 20 inclusive, and at least 50 impressions | Impressions, descending | 20 |
| `growing` and `declining` | The query drew at least 3 clicks in the earlier window and moved at least 20 percent | Percent change, largest move first | 15 each |
| `cannibalization` | Two or more pages hold at least 10 impressions each for one query, and those pages total at least 50 impressions | Total impressions for the query, descending | 10 |
| `targetTracking` | Every keyword in the file, matched case-insensitively | The order they appear in the file | None |

Two of these are deliberate exceptions to the impression floor. Cannibalization reads the query-and-page rows unfiltered, because a query splitting its impressions across pages can leave each page below the floor while the query itself matters. Target tracking matches against the unfiltered query rows, because a named keyword sitting below the floor is an answer, not noise.

A query absent from the earlier window, or holding fewer than 3 clicks there, produces no trend: a new query has nothing to compare against, and a one-click baseline turns a second click into a 100 percent rise.

## Quick Start

```bash
node scripts/keywords.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/keywords.js previous-window --start 2026-06-01 --end 2026-06-28
```

```
{"window":{"start":"2026-06-01","end":"2026-06-28"},"previousWindow":{"start":"2026-05-04","end":"2026-05-31"}}
```

Fetch both windows, then:

```bash
node scripts/keywords.js analyze \
  --queries /path/to/a/work/directory/queries.json \
  --previous-queries /path/to/a/work/directory/queries-previous.json \
  --start 2026-06-01 --end 2026-06-28
```

One JSON object on stdout. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/keywords.js help` | Print usage and exit | No |
| `node scripts/keywords.js previous-window --start <d> --end <d>` | Print the earlier window the trend comparison expects | No |
| `node scripts/keywords.js analyze --queries <path> --start <d> --end <d>` | Build the keyword report from the row files supplied | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--queries <path>` | Query rows for the reporting window. Required by `analyze` | None; required |
| `--query-pages <path>` | Query-and-page rows for the same window | None; cannibalization and the target page column report `null` |
| `--previous-queries <path>` | Query rows for the earlier window | None; growing and declining report `null` |
| `--targets <path>` | Target keywords, one per line | None; target tracking reports `null` |
| `--start <YYYY-MM-DD>` | First day of the reporting window. Required by both commands | None; required |
| `--end <YYYY-MM-DD>` | Last day of the reporting window. Required by both commands | None; required |
| `--min-impressions <n>` | The impression floor | 10 |
| `--site <url>` | A label echoed into the report as `site`; no computation reads it | `null` |
| `--output <dir>` | Also write the result to a file in this directory, an absolute path that must sit outside this tool directory | None; stdout only |
| `--help`, `-h` | Print usage and exit | Off |

The window is the caller's assertion about the rows, never read from them: the rows carry no dates. It sets `dateRange`, and it is the only thing `previousDateRange` is derived from.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. It imports no package, so nothing installs on first run.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything else, and the stdout and stderr rules. Node built-ins cover the whole tool, so the contract's dependency-install, `--env`, and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. The sections above state what each command does; the contract states how the script behaves getting there.

Every failure here is a usage mistake or an unreadable input: it names the cause on stderr, leaves stdout empty, and exits 1. Malformed rows are not reported inside the JSON, because a report built from rows of an unknown shape would be wrong in ways a reader could not see. Row errors name the file and the row index, never the row's content, which is a customer's own search data.

## Output

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
| `file` | Present only when `--output` was given: where the result was also written |

`ctr` and `position` pass through as the API reported them, a fraction and an average rank, unrounded. The `page` in target tracking is the first page the query-and-page rows list for that keyword, which for Search Console output is its strongest page; it is `null` when no query-and-page rows were supplied or the keyword ranks nowhere.

A file is written only when `--output <dir>` is given, named `seo-keywords-YYYY-MM-DD.json`, and the directory must sit outside this tool directory.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --queries is required` | `analyze` ran with no rows to read | Pass `--queries <path>` |
| `Error: --start is required` | The reporting window was not given | Pass `--start` and `--end`; both commands need them |
| `Error: --start must be a date in YYYY-MM-DD form` | A date in another format, or a partial one | Pass it as `standards/conventions.md` sets dates everywhere |
| `Error: --end (...) falls before --start (...)` | The window was passed backwards | Swap them |
| `Error: the path for ... must be absolute` | A relative path, which resolves against the caller's directory | Pass the absolute path |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: <path> is not valid JSON` | The file is not the API response, or the pull was truncated | Re-fetch; the message does not quote the file, so inspect it directly |
| `Error: <path> holds neither an array of rows nor an object with a "rows" array` | A response envelope of a different shape, or an empty object where a pull failed | Pass the search-analytics response, or the row array inside it |
| `Error: <path> row N does not carry 1 key` | Query-and-page rows were passed to `--queries` | Send them to `--query-pages`; query rows come from a `["query"]` pull |
| `Error: <path> row N does not carry 2 keys` | Query rows were passed to `--query-pages` | Re-fetch with dimensions `["query","page"]` |
| `Error: <path> row N is missing a numeric "clicks"` | Rows were reshaped between the fetch and this call | Pass rows as the API returned them |
| `Error: <path> holds no keywords` | The target file is empty, or holds only headings and blank lines | List one keyword per line |
| `Error: --output resolves inside this tool directory` | The output path landed in the shared root | Pass a work directory in the owning root |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `cannibalization` is `null` when pages plainly compete | `--query-pages` was not supplied | Fetch the `["query","page"]` rows and pass them |
| `growing` and `declining` are both empty | No query cleared both the 3-click baseline and the 20 percent move | Expected on a low-traffic site or a short window; widen the window |
| `opportunities` is empty on a site with traffic | Nothing sat in positions 5 to 20 with 50 or more impressions | Read `topPerformers` instead; a site ranking well or ranking nowhere has no middle band |
| A target keyword reports `found: false` while the site ranks for it | The keyword is spelled differently in the data, or Search Console withheld the row as a rare query | Compare against `topPerformers`; rare queries are anonymized at the source and cannot be recovered |

## Success

- `help` prints usage to stdout and exits 0 with no file read and no network connection.
- `previous-window` prints the window ending the day before `--start` and covering the same number of days, and exits 0.
- `analyze` with query rows alone exits 0 with one parseable JSON object carrying `topPerformers` and `opportunities`, and `null` for every section whose input was absent.
- `analyze` with all four inputs fills every section, and each section holds only entries meeting its row of the Thresholds table.
- `analyze` with `--queries` omitted, naming a path that does not exist, or handed rows of the wrong dimensions, exits 1 with the cause on stderr and stdout empty.
- No message quotes a row's content, and no error repeats the JSON parser's own text.
- No run reads a credential, opens a network connection, or writes any file other than one the caller named with `--output`.
