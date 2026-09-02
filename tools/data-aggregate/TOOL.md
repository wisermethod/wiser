---
name: data-aggregate
type: tool
category: data
description: Groups a CSV, JSON, or TSV file's rows by one or more columns and computes sum, mean, median, min, max, or count over named metric columns, one result row per group
version: 0.1.1
---

# data-aggregate

One JSON object holding a group per distinct value of the columns grouped on, each carrying the metrics asked for over the rows in that group, plus the group count, the rows read, and anything that stopped a metric from running.

## Context

Use it whenever an answer is a number over a subset of rows: revenue by region, orders by month, average score by cohort, how many rows carry each status. Reach for it in place of reading the rows and reasoning to the total, which is where wrong numbers come from; a number this tool returns was computed, and a caller can name the field it came from.

Do not use it to learn what a file contains. It needs the column names before it can group on them, and `data-parse` is what produces those, along with each column's detected type. Do not use it for a whole-column summary either: spread, percentiles, and standard deviation belong to the descriptive-statistics tool, not here, and this one groups rather than describes. It does not filter rows, sort by a computed metric, return the rows behind a group, compute a change between periods, or relate one column to another; it also changes nothing about the file it reads.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the one file the caller names and writes nothing.

## Groups and Metrics

A group is one distinct combination of the values in the columns given to `--group-by`, compared as text exactly as the file holds them. Repeating `--group-by` groups on a tuple. Results sort by the first column given, and groups tied on it stay in the order their first row was read. A row whose group value is missing joins the group named `null`; a row whose value is empty joins the group named by the empty string, which is a different group.

Each `--metric` names a column and a function over it.

| Function | Computes | Column it accepts |
|----------|----------|-------------------|
| `sum` | The total of the group's values | Numeric |
| `mean` | The total divided by how many values there were | Numeric |
| `median` | The middle value, or the average of the middle two | Numeric |
| `min` | The smallest value | Numeric |
| `max` | The largest value | Numeric |
| `count` | How many rows the group holds | Any, including text and mixed |

`count` counts rows, not values: it is the group's size whatever the named column holds, which is why it is the one function a text column accepts. The other five read only the values that parse as numbers after `$`, commas, and spaces are stripped; a value that does not parse is skipped rather than counted as zero, and a group with no numeric value at all comes back as 0. Results carry four decimal places.

A column qualifies as numeric when at least 80 percent of its non-null values parse as numbers, the same threshold `data-parse` reports a column's type by. A column below that threshold takes `count` and nothing else.

## Quick Start

```bash
node scripts/aggregate.js help
```

Usage text, with nothing installed.

```bash
node scripts/aggregate.js aggregate --file /path/to/a/work/directory/sales.csv \
  --group-by region --metric revenue:sum --metric revenue:mean
```

The first real run installs `csv-parse` in this tool's directory and asks for a re-run; the second does the work and prints one JSON object:

```
{"groups":[{"key":{"region":"East"},"values":{"revenue_sum":450,"revenue_mean":150}},{"key":{"region":"West"},"values":{"revenue_sum":520,"revenue_mean":173.3333}}],"groupCount":2,"totalRows":6,"errors":[]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/aggregate.js help` | Print usage and exit | No |
| `node scripts/aggregate.js aggregate --file <path> --group-by <col> --metric <col>:<fn>` | Group the rows and compute each metric over each group | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to read, an absolute path. Required | None; required |
| `--group-by <column>` | A column whose values form the groups. Required, repeatable | None; required |
| `--metric <column>:<function>` | A column and a function over it. Required, repeatable | None; required |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--help`, `-h` | Print usage and exit | Off |

One file per run, and a header row is assumed. In a metric the function follows the last colon, so a column name may itself contain one. Format and delimiter are auto-detected from the content when not given; the two overrides are for a file whose shape is known or whose guess came out wrong. JSON input must be an array of objects.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run dependency install, and the stdout and stderr rules. It reads one caller-named file and writes nothing of its own; the writes are what `tools/AGENTS.md` lists, which is the only place this repository states them, so the contract's `--env` and output-path clauses have nothing to bind here, and the tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections above state what the command does; the contract states how the script behaves getting there.

Two failures are told apart. A usage mistake, a path holding no file or holding a directory, and a metric that names no function are caught before anything is installed or read: they name the cause on stderr and exit 1. Everything the file itself decides is an answer, not a failure: a column that is not in the file, a text column asked for a sum, content that does not parse, a file with no data rows. Those come back inside the JSON in `errors` with an empty group list and exit 0, because a caller that asked for revenue by region needs to be told which of its two column names the file does not have. No message repeats the underlying parser's own text, which can quote bytes of the input.

## Output

One JSON object on stdout, exit 0, whenever the file was read, including a read that produced no group at all.

| Field | Carries |
|-------|---------|
| `groups` | One entry per group: `key`, the grouped column values as text, and `values`, one field per metric named `<column>_<function>` |
| `groupCount` | How many groups there are |
| `totalRows` | How many rows were read from the file |
| `errors` | What stopped a metric or a group from being computed, and what was skipped while reading, empty when nothing was |

`groupCount` 0 with `errors` populated means nothing was aggregated, and the entries say why; the same shape with `errors` empty means the file held no rows to group. A non-empty `errors` beside a full group list is the third case: the groups are complete and the entries note what was skipped on the way, such as items in a JSON array that were not objects.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --file is required.` | `aggregate` ran with no file to read | Pass `--file <path>` |
| `Error: no file at <path>` | The path given to `--file` does not exist | Check the path; an absolute one cannot be misread |
| `Error: --group-by is required.` | No grouping column was named | Name one; repeat the flag to group on a tuple |
| `Error: --metric is required` | No metric was named | Pass `--metric <column>:<function>` |
| `Error: --metric "..." is not in the form` | The spec carried no colon, or nothing after the last one | Write it as `<column>:<function>` |
| `Error: --metric "..." names function "..."` | A function outside the six | Use one from the Groups and Metrics table |
| `Error: --format must be one of csv, json, tsv` | A `--format` value outside the three supported formats | Pass one of the three, or omit `--format` to auto-detect |
| `Error: could not read <path>` | The path is a directory or is not readable | Point `--file` at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| Figures read 10x or 100x too large | The column uses decimal commas (`2,50`), which the numeric rule strips as thousands separators | Convert the file to decimal points before aggregating it |
| `errors` names a column as not found, `groupCount` 0 | The name does not match a column the file holds | Read the available list the same entry prints; header spelling and case must match |
| `errors` names a column as not numeric, `groupCount` 0 | A function other than `count` was asked of a text, date, boolean, or mixed column | Use `count` on it, or clean the column so its values parse as numbers |
| `errors` names a parse or delimiter problem, `groupCount` 0 | The content did not parse in the detected or forced format | Confirm the format; pass `--format` or `--delimiter` if auto-detection guessed wrong. JSON must be an array of objects |
| A sum is lower than expected | Values that do not parse as numbers were skipped, not zeroed | Only `$`, commas, and spaces are stripped; profile the column to see what is in it |
| A group appears twice with what looks like one value | The values differ in case or in surrounding punctuation, and grouping is exact text | Normalize the column in the source data; this tool changes nothing it reads |
| More groups than expected, one per row | The grouping column holds a near-unique value such as an id or a timestamp | Group on a column with few distinct values |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `aggregate` over a file whose columns all check out exits 0 with one parseable JSON object on stdout carrying `groups`, `groupCount`, `totalRows`, and an empty `errors`.
- `aggregate` with `--file`, `--group-by`, or `--metric` omitted, with a malformed metric spec, or naming a path that does not exist or is a directory, exits 1 with the cause on stderr and stdout empty, and triggers no dependency install.
- A column that is not in the file, and a non-numeric column asked for anything but `count`, each exit 0 with `groupCount` 0 and the reason in `errors`, naming the columns the file does hold.
- Grouping on a tuple yields one entry per distinct combination, whatever characters the values carry, and the entries sort by the first grouping column.
- `count` returns a group's row count on any column; the other five read only values that parse as numbers and skip the rest.
- No run reads a credential, opens a network connection, or writes any file other than what `tools/AGENTS.md` lists a first run installing.
