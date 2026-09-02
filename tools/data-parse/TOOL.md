---
name: data-parse
type: tool
category: data
description: Parses a CSV, JSON, or TSV file into a column profile with each column's detected type, non-null count, and sample values, plus the row count, the count of uneven delimited rows, and any parse errors
version: 0.1.1
---

# data-parse

One JSON object describing the structure of a data file: its columns with their detected types, non-null counts, and sample values, its row count, how many delimited rows had a different column count than the header, and any errors found while reading it.

## Context

Use it as the first read of any CSV, JSON, or TSV file, before a caller decides what to compute or how to present it: to learn a file's columns and their names, to detect which columns are numeric before running statistics on them, to confirm a file parses at all, or to surface mixed-type columns, ragged delimited rows, and malformed JSON entries as an explicit list rather than a silent guess. A delimited row shorter than the header still fills its missing columns as null, and one longer still has its extra values dropped, so the file is not refused; both are counted in `raggedRowCount` and named in `parseErrors`, and a short row also shows in that column's `nonNullCount`.

Do not use it to compute anything. It reports structure, not statistics: it does not sum, average, group, or correlate, and it returns no analysis. A caller that needs descriptive statistics or group-by breakdowns runs those tools on the columns this one identifies. Do not reach for it to transform, clean, or deduplicate data either; it reads a file and reports what is there, and changes nothing.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the one file the caller names and writes nothing.

## Column Types

Each column is assigned one type from the value it most consistently holds. A type is assigned when at least 80 percent of a column's non-null values agree; below that, the column reads as `mixed`.

| Type | Assigned when a value | Notes |
|------|-----------------------|-------|
| `number` | parses as a finite number after stripping `$`, commas, and spaces | Checked first, so `0` and `1` read as numbers, never booleans |
| `boolean` | is `true`, `false`, `yes`, or `no`, in any case | Word forms only; `0`/`1` are numbers |
| `date` | matches an ISO date (`YYYY-MM-DD`, optional time) or a common `M/D/Y` or `M-D-Y` form | Format detection only; the value is not range-checked |
| `string` | is none of the above, or the column is entirely empty | The fallback type |
| `mixed` | is reported for the column, not the value | No single type reached the 80 percent threshold |

Values that are empty, null, or whitespace are counted as null, not typed. `nonNullCount` is how many values remained after those were removed, and `sampleValues` shows up to the first five of them.

## Quick Start

```bash
node scripts/parse.js help
```

Usage text, with nothing installed.

```bash
node scripts/parse.js parse --file /path/to/a/work/directory/regions.csv
```

The first real run installs `csv-parse` in this tool's directory and asks for a re-run; the second does the work and prints one JSON object:

```
{"columns":[{"name":"region","type":"string","nonNullCount":3,"sampleValues":["West","East","North"]},{"name":"revenue","type":"number","nonNullCount":3,"sampleValues":["1200","900","1500"]}],"rowCount":3,"raggedRowCount":0,"parseErrors":[]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/parse.js help` | Print usage and exit | No |
| `node scripts/parse.js parse --file <path>` | Read the file and report its columns, types, and row count | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to parse, an absolute path. Required by `parse` | None; required |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--no-header` | Treat the first row as data; columns are named `column_1`, `column_2`, and so on | Header row assumed |
| `--help`, `-h` | Print usage and exit | Off |

One file per run. Format and delimiter are auto-detected from the content when not given; `--format` and `--delimiter` override that when a file's shape is known or the guess is wrong. JSON input must be an array of objects.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run dependency install, and the stdout and stderr rules. It reads one caller-named file and writes nothing but that first-run install into its own directory, so the contract's `--env` and output-path clauses have nothing to bind here, and the tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections above state what the command does; the contract states how the script behaves getting there.

Malformed data is reported, not raised. A file that cannot be parsed comes back as a profile with an empty column list and a populated `parseErrors`, and the command still exits 0, because the errors are the answer a caller asked for. A usage mistake or an unreadable file is different: it names the cause on stderr and exits 1. No message repeats the underlying parser's own text, which can quote bytes of the input.

## Output

One JSON object on stdout, exit 0, whenever a profile was produced, including one that only reports parse errors.

| Field | Carries |
|-------|---------|
| `columns` | One entry per column: its `name`, detected `type`, `nonNullCount`, and up to five `sampleValues` |
| `rowCount` | How many data rows were read |
| `raggedRowCount` | How many delimited data rows had a field count different from the header; always 0 for JSON and for a clean delimited file |
| `parseErrors` | The problems found while reading, one per entry, empty when the file read cleanly; includes a row-count entry when `raggedRowCount` is above 0 |

An empty file, a header with no data rows, and a file whose content does not parse each come back with `rowCount` 0, `raggedRowCount` 0, no columns, and the reason in `parseErrors`. Sample values are the raw values as read: from a CSV every value is text, so a numeric column's samples are the digit strings that were in the file. The file is never refused for uneven rows: every data row still contributes, short rows fill missing columns as null, long rows drop extra values, and the count of those rows is what `raggedRowCount` and the matching `parseErrors` entry report.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm ci failed` | Node missing or older than 18, or the directory is not writable | Confirm `node --version` is 18 or newer, delete `node_modules/`, run `npm ci` here by hand |
| `Error: --file is required.` | `parse` ran with no file to read | Pass `--file <path>` |
| `Error: no file at <path>` | The path given to `--file` does not exist | Check the path; an absolute one cannot be misread |
| `Error: --format must be one of csv, json, tsv` | A `--format` value outside the three supported formats | Pass one of the three, or omit `--format` to auto-detect |
| `Error: could not read <path>` | The path is a directory or is not readable | Point `--file` at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| Figures read 10x or 100x too large | The column uses decimal commas (`2,50`), which the numeric rule strips as thousands separators | Convert the file to decimal points before parsing it |
| `parseErrors` names a JSON or delimiter problem, `rowCount` 0 | The content did not parse in the detected or forced format | Confirm the format; pass `--format` or `--delimiter` if auto-detection guessed wrong. JSON must be an array of objects |
| A column reads as `mixed` when it looks uniform | Fewer than 80 percent of its non-null values share one type | Read `sampleValues` to see the outliers; clean the source if the column should be uniform |
| A column reads as `string` when it holds numbers | The numbers carry symbols the parser does not strip, or under a fifth of them are non-numeric | Only `$`, commas, and spaces are stripped; other symbols leave a value non-numeric |
| Every value shows as text in `sampleValues` for a CSV | Expected: CSV fields are read as text | The `type` is still detected; `sampleValues` shows the raw form |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `parse` against a file that reads cleanly exits 0 with one parseable JSON object on stdout carrying `columns`, `rowCount`, `raggedRowCount` 0, and an empty `parseErrors`.
- `parse` with `--file` omitted, or naming a path that does not exist, exits 1 with the cause on stderr and stdout empty, and triggers no dependency install.
- A malformed or empty file exits 0 with `rowCount` 0, `raggedRowCount` 0, no columns, and the reason in `parseErrors`; it does not raise and does not quote the parser's own message.
- A delimited file with uneven rows exits 0 with those rows still present, `raggedRowCount` equal to how many differed from the header, and a matching entry in `parseErrors`.
- Numeric, date, word-form boolean, and mixed columns are each detected per the Column Types table, and a headerless file read with `--no-header` names its columns `column_1` onward.
- No run reads a credential, opens a network connection, or writes any file other than the first-run dependency install in this tool's own directory.
