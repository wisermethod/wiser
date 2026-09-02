---
name: data-describe
type: tool
category: data
description: Computes count, mean, median, min, max, standard deviation, and 25th and 75th percentiles for each numeric column of a CSV, JSON, or TSV file, with the count of values that held no number and the columns it skipped
version: 0.1.1
---

# data-describe

One JSON object holding a row of descriptive statistics for each numeric column of a data file, the present columns it skipped with a reason for each, and anything that went wrong reading the file.

## Context

Use it whenever a number about a column has to be right: how large the values are, where their middle sits, how far they spread, how much of the column is missing. Every figure it returns is computed from the file, which is what makes it the answer to reach for instead of estimating from a glance at the rows.

Do not use it to learn what a file contains. It reports statistics, not structure: it names no sample values and no column types beyond deciding which columns it can compute on, so a caller that needs the file's shape profiles it first and calls this with what it found. Do not use it for a breakdown by group either, the average order value by country or revenue by region; this tool computes over a whole column at a time, and grouping is a different operation. It does not filter, sort, join, correlate, or compare one period against another, and it neither cleans nor changes the data: it reads and reports.

It reads CSV, JSON, and TSV. A spreadsheet workbook, a PDF table, and an image of a table are not among them.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install described in `tools/AGENTS.md` it makes no network request. It reads the one file the caller names and writes nothing.

## Which Columns Get Statistics

A column is numeric, and gets statistics, when at least 80 percent of its non-empty values parse as finite numbers once `$`, commas, and spaces are stripped, the same threshold `data-parse` reports a column's type by. Every other column that is present in the file is listed in `skippedColumns` as `{ name, reason }` and nothing is computed for it. The reason names the detected type and that it is not numeric.

Name columns with `--columns` to describe only those. A named column that exists but is not numeric is listed in `skippedColumns` with its reason and also named in `errors`. A named column that does not exist is reported only in `errors` (it is not a present column that was skipped); the not-found message lists what the file does hold, so a misspelling is one run to fix. The rest of the named columns are still computed either way.

The first row of a delimited file is its header. A file whose first row is already data will report those values as column names.

## The Statistics

Each row of `columns` carries these fields, computed over that column's values in every row of the file.

| Field | Is |
|-------|-----|
| `count` | How many values in the column read as numbers, which is how many the rest of the row is computed from |
| `mean` | Their arithmetic average |
| `median` | The middle value, and for an even count the point midway between the two middle ones |
| `min`, `max` | The smallest and largest |
| `stdDev` | The population standard deviation: the spread of the values in hand, not an estimate of the spread of a larger population they might have been drawn from. One value, or the same value repeated, reports 0 |
| `p25`, `p75` | The 25th and 75th percentiles. A percentile falling between two values is interpolated in a straight line between them, so the result need not be a value present in the file |
| `nullCount` | How many rows held no number here: empty cells, and values that did not read as numbers. Nothing is substituted for them, and they do not enter any figure above |

Every figure is rounded to four decimal places. A column that reaches the numeric threshold but whose values then all fail to read as numbers reports `count` 0 with zeros across the row.

## Quick Start

```bash
node scripts/describe.js help
```

Usage text, with nothing installed.

```bash
node scripts/describe.js describe --file /path/to/a/work/directory/regions.csv
```

The first real run installs `csv-parse` in this tool's directory and asks for a re-run; the second does the work and prints one JSON object:

```
{"columns":[{"name":"revenue","count":4,"mean":1175,"median":1150,"min":900,"max":1500,"stdDev":216.5064,"p25":1050,"p75":1275,"nullCount":1}],"skippedColumns":[{"name":"region","reason":"type is \"string\", not numeric"}],"totalRows":5,"errors":[]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/describe.js help` | Print usage and exit | No |
| `node scripts/describe.js describe --file <path>` | Compute the statistics for the file's numeric columns | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to read, an absolute path. Required by `describe` | None; required |
| `--columns <list>` | Comma-separated column names to describe | Every numeric column |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--help`, `-h` | Print usage and exit | Off |

One file per run. Format and delimiter are auto-detected from the content when not given; `--format` and `--delimiter` override that when a file's shape is known or the guess is wrong. JSON input must be an array of objects. A column whose name contains a comma cannot be selected through `--columns`, which splits on commas; omit the option to describe every numeric column instead.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run dependency install, and the stdout and stderr rules. It reads one caller-named file and writes nothing of its own; the writes are what `tools/AGENTS.md` lists, which is the only place this repository states them, so the contract's `--env` and output-path clauses have nothing to bind here, and the tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections above state what the command does; the contract states how the script behaves getting there.

Where the boundary between a failure and a finding sits: a mistake that could be known before the file was opened, a missing `--file`, a path that is not there, a format outside the three, names its cause on stderr and exits 1. Anything it took reading the file to discover, an unparseable file, a column that is not there, a column that is not numeric, a file with no numeric column at all, comes back inside the JSON with exit 0, because each of those is the answer a caller asked for. No message repeats the underlying parser's own text, which can quote bytes of the input.

## Output

One JSON object on stdout, exit 0, whenever the file was read, including a read that produced no statistics.

| Field | Carries |
|-------|---------|
| `columns` | One entry per described column: its `name` and the statistics above |
| `skippedColumns` | Present columns no statistic ran on, each `{ name, reason }`. Auto-skipped non-numeric columns and named-but-not-numeric columns both appear here; a name that is not in the file does not |
| `totalRows` | How many data rows were read, which is the denominator behind `count` plus `nullCount` |
| `errors` | Everything that went wrong: rows dropped while reading, columns named but absent, columns named but not numeric, a file with nothing to compute on |

`errors` and results travel together: a run can name a column it could not use and still return statistics for the columns it could, so a caller reads both. `skippedColumns` answers "which present columns were left out and why"; `errors` answers "what went wrong," including names that were never in the file. An empty file, a header with no data rows, and content that does not parse each come back with `totalRows` 0, no columns, and the reason in `errors`.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --file is required.` | `describe` ran with no file to read | Pass `--file <path>` |
| `Error: no file at <path>` | The path given to `--file` does not exist | Check the path; an absolute one cannot be misread |
| `Error: --format must be one of csv, json, tsv` | A `--format` value outside the three supported formats | Pass one of the three, or omit `--format` to auto-detect |
| `Error: --columns needs at least one column name` | `--columns` was given nothing but separators | Name the columns, or omit the option |
| `Error: could not read <path>` | The path is a directory or is not readable | Point `--file` at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `No numeric columns to analyze`, `skippedColumns` holds every column | Nothing in the file reached the numeric threshold | Profile the file to see what the columns hold; a column of numbers stored with symbols beyond `$`, commas, and spaces does not read as numeric |
| `Column "<name>" not found`, with the available names | A name in `--columns` is not in the file | Take the spelling from the list in the message |
| `Column "<name>" is type "<type>", not numeric` | A named column holds dates, words, or too few numbers to reach the threshold | Drop it from `--columns`, or clean the column at the source |
| `<n> of <m> array entries were not objects and were skipped` | A JSON array holding something other than objects | Expected when the file mixes shapes; the statistics cover the objects that remained |
| Figures read 10x or 100x too large | The column uses decimal commas (`2,50`), which the numeric rule strips as thousands separators | Convert the file to decimal points before describing it; the stripping rule is stated under the numeric definition above |
| `The content could not be parsed as JSON`, or as delimited text | The content did not parse in the detected or forced format | Confirm the format; pass `--format` or `--delimiter` if auto-detection guessed wrong. JSON must be an array of objects |
| `nullCount` is higher than the empty cells in a column | Values that are not numbers count the same as empty ones | Read the offending values in the source file; they are text inside a mostly numeric column |
| Column names look like data | The file has no header row, and the first row was read as one | This tool reads the first row as the header; add one, or profile the file headerless to confirm what is there |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `describe` against a file with a numeric column exits 0 with one parseable JSON object on stdout carrying `columns`, `skippedColumns` as `{ name, reason }` entries, `totalRows`, and `errors`.
- `describe` with `--file` omitted, naming a path that does not exist or is not a file, or carrying an unsupported `--format`, exits 1 with the cause on stderr and stdout empty, and triggers no dependency install.
- A file with no numeric column, an unparseable file, and an empty file each exit 0 with no columns and the reason in `errors`; none of them raises, and none quotes the parser's own message. A present non-numeric column is listed in `skippedColumns` with its reason; a name absent from the file appears only in `errors`.
- Every figure matches the definitions above: a population standard deviation, interpolated percentiles, four decimal places, and values that are not numbers counted in `nullCount` rather than treated as zero.
- No run reads a credential, and after the first-run install no run opens a network connection or writes any file. The install itself reaches `registry.npmjs.org` and writes what `tools/AGENTS.md` lists.
