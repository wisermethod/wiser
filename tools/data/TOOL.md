---
name: data
type: tool
category: data
description: Parses, describes, aggregates, joins, and charts a CSV, JSON, or TSV file, and computes a percentage, difference, or rate from two numeric fields of a JSON object
version: 0.1.1
---

# data

One tool for tabular files: a column profile, descriptive statistics, a group-by aggregate, a join of two files, a self-contained HTML chart, or a percentage, difference, or rate from two numeric fields of a JSON object.

## Context

Use it whenever an answer has to come from a CSV, JSON, or TSV file rather than from a glance at the rows: to learn the columns and their types, to compute statistics over a numeric column, to group and total, to join two files on a key, to draw a bar or line chart, or to compute a percentage, difference, or rate from two numbers already in a JSON object. Reach for the matching subcommand instead of reading the file and reasoning to the figure, which is where wrong numbers come from.

Do not use it to transform, clean, or deduplicate data. It reads the files the caller names and, for `chart`, writes one HTML file; it changes nothing about the source. Do not use it for conceptual diagrams, process maps, or geometry that is not a quantitative encoding; those are `skills/Visualizer/`. A spreadsheet workbook, a PDF table, and an image of a table are not among the formats it reads.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install described in `tools/AGENTS.md` it makes no network request.

## Quick Start

```bash
node scripts/data.js help
```

Usage text listing the six subcommands, with nothing installed. `node scripts/data.js parse help` (or `--help`) prints that subcommand's usage; the same form works for `describe`, `aggregate`, `join`, `chart`, and `compute`.

```bash
node scripts/data.js parse --file /path/to/a/work/directory/regions.csv
```

The first real run reports that it would install `csv-parse` in this tool's directory, and stops. With `--install` it installs and does the work in the same run and prints one JSON object:

```
{"columns":[{"name":"region","type":"string","nonNullCount":3,"sampleValues":["West","East","North"]},{"name":"revenue","type":"number","nonNullCount":3,"sampleValues":["1200","900","1500"]}],"rowCount":3,"raggedRowCount":0,"parseErrors":[]}
```

Anything else, see Troubleshooting.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the consent-gated dependency install, closed unknown flags, and the stdout and stderr rules. `parse`, `describe`, `aggregate`, `join`, and `compute` read caller-named files and write nothing of their own; `chart` writes one caller-named HTML file outside this tool directory. Every other write a run makes is a first-run install, and `tools/AGENTS.md` is the only place this repository lists those. The contract's `--env` clause has nothing to bind here, and the tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections below state what each command does; the contract states how the script behaves getting there.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## parse

One JSON object describing the structure of a data file: its columns with their detected types, non-null counts, and sample values, its row count, how many delimited rows had a different column count than the header, and any errors found while reading it.

Use it as the first read of any CSV, JSON, or TSV file, before a caller decides what to compute or how to present it. A delimited row shorter than the header still fills its missing columns as null, and one longer still has its extra values dropped, so the file is not refused; both are counted in `raggedRowCount` and named in `parseErrors`, and a short row also shows in that column's `nonNullCount`.

Malformed data is reported, not raised. A file that cannot be parsed comes back as a profile with an empty column list and a populated `parseErrors`, and the command still exits 0, because the errors are the answer a caller asked for. A usage mistake or an unreadable file is different: it names the cause on stderr and exits 1. No message repeats the underlying parser's own text, which can quote bytes of the input.

### Column Types

Each column is assigned one type from the value it most consistently holds. A type is assigned when at least 80 percent of a column's non-null values agree; below that, the column reads as `mixed`.

| Type | Assigned when a value | Notes |
|------|-----------------------|-------|
| `number` | parses as a finite number after stripping `$`, commas, and spaces | Checked first, so `0` and `1` read as numbers, never booleans |
| `boolean` | is `true`, `false`, `yes`, or `no`, in any case | Word forms only; `0`/`1` are numbers |
| `date` | matches an ISO date (`YYYY-MM-DD`, optional time) or a common `M/D/Y` or `M-D-Y` form | Format detection only; the value is not range-checked |
| `string` | is none of the above, or the column is entirely empty | The fallback type |
| `mixed` | is reported for the column, not the value | No single type reached the 80 percent threshold |

Values that are empty, null, or whitespace are counted as null, not typed. `nonNullCount` is how many values remained after those were removed, and `sampleValues` shows up to the first five of them.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/data.js parse help` | Print usage and exit | No |
| `node scripts/data.js parse --file <path>` | Read the file and report its columns, types, and row count | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to parse, an absolute path. Required by `parse` | None; required |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--no-header` | Treat the first row as data; columns are named `column_1`, `column_2`, and so on | Header row assumed |
| `--help`, `-h` | Print usage and exit | Off |

One file per run. Format and delimiter are auto-detected from the content when not given; `--format` and `--delimiter` override that when a file's shape is known or the guess is wrong. JSON input must be an array of objects.

### Output

One JSON object on stdout, exit 0, whenever a profile was produced, including one that only reports parse errors.

| Field | Carries |
|-------|---------|
| `columns` | One entry per column: its `name`, detected `type`, `nonNullCount`, and up to five `sampleValues` |
| `rowCount` | How many data rows were read |
| `raggedRowCount` | How many delimited data rows had a field count different from the header; always 0 for JSON and for a clean delimited file |
| `parseErrors` | The problems found while reading, one per entry, empty when the file read cleanly; includes a row-count entry when `raggedRowCount` is above 0 |

An empty file, a header with no data rows, and a file whose content does not parse each come back with `rowCount` 0, `raggedRowCount` 0, no columns, and the reason in `parseErrors`. Sample values are the raw values as read: from a CSV every value is text, so a numeric column's samples are the digit strings that were in the file. The file is never refused for uneven rows: every data row still contributes, short rows fill missing columns as null, long rows drop extra values, and the count of those rows is what `raggedRowCount` and the matching `parseErrors` entry report.

## describe

One JSON object holding a row of descriptive statistics for each numeric column of a data file, the present columns it skipped with a reason for each, and anything that went wrong reading the file.

Use it whenever a number about a column has to be right: how large the values are, where their middle sits, how far they spread, how much of the column is missing. It reports statistics, not structure: it names no sample values and no column types beyond deciding which columns it can compute on, so a caller that needs the file's shape runs `parse` first. It computes over a whole column at a time; grouping is `aggregate`.

A mistake that could be known before the file was opened, a missing `--file`, a path that is not there, a format outside the three, names its cause on stderr and exits 1. Anything it took reading the file to discover, an unparseable file, a column that is not there, a column that is not numeric, a file with no numeric column at all, comes back inside the JSON with exit 0. No message repeats the underlying parser's own text.

### Which Columns Get Statistics

A column is numeric, and gets statistics, when at least 80 percent of its non-empty values parse as finite numbers once `$`, commas, and spaces are stripped, the same threshold `parse` reports a column's type by. Every other column that is present in the file is listed in `skippedColumns` as `{ name, reason }` and nothing is computed for it. The reason names the detected type and that it is not numeric.

Name columns with `--columns` to describe only those. A named column that exists but is not numeric is listed in `skippedColumns` with its reason and also named in `errors`. A named column that does not exist is reported only in `errors` (it is not a present column that was skipped); the not-found message lists what the file does hold, so a misspelling is one run to fix. The rest of the named columns are still computed either way.

The first row of a delimited file is its header. A file whose first row is already data will report those values as column names.

### The Statistics

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

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/data.js describe help` | Print usage and exit | No |
| `node scripts/data.js describe --file <path>` | Compute the statistics for the file's numeric columns | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to read, an absolute path. Required by `describe` | None; required |
| `--columns <list>` | Comma-separated column names to describe | Every numeric column |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--help`, `-h` | Print usage and exit | Off |

One file per run. Format and delimiter are auto-detected from the content when not given. JSON input must be an array of objects. A column whose name contains a comma cannot be selected through `--columns`, which splits on commas; omit the option to describe every numeric column instead.

### Output

One JSON object on stdout, exit 0, whenever the file was read, including a read that produced no statistics.

| Field | Carries |
|-------|---------|
| `columns` | One entry per described column: its `name` and the statistics above |
| `skippedColumns` | Present columns no statistic ran on, each `{ name, reason }`. Auto-skipped non-numeric columns and named-but-not-numeric columns both appear here; a name that is not in the file does not |
| `totalRows` | How many data rows were read, which is the denominator behind `count` plus `nullCount` |
| `errors` | Everything that went wrong: rows dropped while reading, columns named but absent, columns named but not numeric, a file with nothing to compute on |

`errors` and results travel together: a run can name a column it could not use and still return statistics for the columns it could, so a caller reads both. An empty file, a header with no data rows, and content that does not parse each come back with `totalRows` 0, no columns, and the reason in `errors`.

## aggregate

One JSON object holding a group per distinct value of the columns grouped on, each carrying the metrics asked for over the rows in that group, plus the group count, the rows read, and anything that stopped a metric from running.

Use it whenever an answer is a number over a subset of rows: revenue by region, orders by month, average score by cohort. It needs the column names before it can group on them; `parse` is what produces those. Spread, percentiles, and standard deviation belong to `describe`. It does not filter rows, sort by a computed metric, return the rows behind a group, compute a change between periods, or relate one column to another.

A usage mistake, a path holding no file or holding a directory, and a metric that names no function are caught before anything is installed or read: they name the cause on stderr and exit 1. Everything the file itself decides is an answer, not a failure: a column that is not in the file, a text column asked for a sum, content that does not parse, a file with no data rows. Those come back inside the JSON in `errors` with an empty group list and exit 0.

### Groups and Metrics

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

`count` counts rows, not values: it is the group's size whatever the named column holds, which is why it is the one function a text column accepts. The other five read only the values that parse as numbers after `$`, commas, and spaces are stripped; a value that does not parse is skipped rather than counted as zero, and a group with no numeric value at all comes back as `null` for `mean`, `median`, `min` and `max`, because an average of nothing does not exist and reporting it as `0` reads as "this group averaged zero". `sum` and `count` over nothing are `0`, which is the true answer for both. Results carry four decimal places.

A column qualifies as numeric when at least 80 percent of its non-null values parse as numbers, the same threshold `parse` reports a column's type by. A column below that threshold takes `count` and nothing else.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/data.js aggregate help` | Print usage and exit | No |
| `node scripts/data.js aggregate --file <path> --group-by <col> --metric <col>:<fn>` | Group the rows and compute each metric over each group | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to read, an absolute path. Required | None; required |
| `--group-by <column>` | A column whose values form the groups. Required, repeatable | None; required |
| `--metric <column>:<function>` | A column and a function over it. Required, repeatable | None; required |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--help`, `-h` | Print usage and exit | Off |

One file per run, and a header row is assumed. In a metric the function follows the last colon, so a column name may itself contain one. Format and delimiter are auto-detected from the content when not given. JSON input must be an array of objects.

### Output

One JSON object on stdout, exit 0, whenever the file was read, including a read that produced no group at all.

| Field | Carries |
|-------|---------|
| `groups` | One entry per group: `key`, the grouped column values as text, and `values`, one field per metric named `<column>_<function>` |
| `groupCount` | How many groups there are |
| `totalRows` | How many rows were read from the file |
| `errors` | What stopped a metric or a group from being computed, and what was skipped while reading, empty when nothing was |

`groupCount` 0 with `errors` populated means nothing was aggregated, and the entries say why; the same shape with `errors` empty means the file held no rows to group. A non-empty `errors` beside a full group list is the third case: the groups are complete and the entries note what was skipped on the way, such as items in a JSON array that were not objects.

## join

One JSON object holding the joined rows of two data files on a named key column, the column list, how many rows each side held, how many result rows came from a match, the join mode, the key, and anything that stopped the join from running.

Use it whenever two files share a key and the answer needs columns from both. Profile each side first with `parse` so the key's spelling and case are known. A usage mistake, a path holding no file or holding a directory, and a `--how` outside the two modes are caught before anything is installed or read. A key that is not on one side, content that does not parse, a side with no data rows come back inside the JSON in `errors` with an empty row list and exit 0.

### Join Modes

| Mode | Keeps | Unmatched left rows |
|------|-------|---------------------|
| `inner` (default) | Only keys present on both sides | Dropped |
| `left` | Every left row | Kept, with right-side columns set to null |

Keys are compared as text exactly as the files hold them, after each value is stringified; a missing key value joins the group named `null`. One left row that matches several right rows produces one result row per match. The join key appears once in the result, taken from the left side. A right column whose name collides with a left column other than the key is renamed to `<name>_right`.

### Usage

| Command | Purpose | Reads files |
|---------|---------|-------------|
| `node scripts/data.js join help` | Print usage and exit | No |
| `node scripts/data.js join --left <path> --right <path> --on <column>` | Join the two files on the key | Yes, both |

| Option | Effect | Default |
|--------|--------|---------|
| `--left <path>` | The left data file, an absolute path. Required | None; required |
| `--right <path>` | The right data file, an absolute path. Required | None; required |
| `--on <column>` | The key column present on both sides. Required | None; required |
| `--how <mode>` | `inner` or `left` | `inner` |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` on both sides | Auto-detect each side from its content |
| `--delimiter <char>` | Field delimiter for delimited text on both sides | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--help`, `-h` | Print usage and exit | Off |

Two files per run, and a header row is assumed on each delimited side. Format and delimiter apply to both sides when given; when omitted, each side is auto-detected on its own content. JSON input must be an array of objects.

### Output

One JSON object on stdout, exit 0, whenever both paths were read, including a read that produced no joined row.

| Field | Carries |
|-------|---------|
| `columns` | The result column names, left columns first, then non-key right columns (with `_right` on collisions) |
| `rows` | One object per joined row, keys matching `columns` |
| `leftRows` | How many data rows the left file held |
| `rightRows` | How many data rows the right file held |
| `matchedRows` | How many result rows came from a key match (for `left`, unmatched left rows are in `rows` but not in this count) |
| `how` | The join mode used |
| `on` | The key column name |
| `errors` | What stopped the join or what was skipped while reading, empty when nothing was |

`rows` empty with `errors` populated means nothing was joined, and the entries say why. A non-empty `errors` beside a full row list is the third case: the join is complete and the entries note what was skipped on the way.

## chart

One self-contained HTML file holding an SVG bar or line chart of two named columns from a data file, plus a JSON object naming the output path, the chart type, how many points were plotted, how many rows were skipped, any notes, and the canvas size.

Use it whenever a numeric series or comparison should be seen rather than only stated, after the columns are known, typically after `parse` has named them. It plots the values as they sit in the file; aggregation belongs to `aggregate` first when the file needs grouping. The HTML it writes loads no external script, stylesheet, or font: the chart is inline SVG and opens with no network.

A usage mistake, a path holding no file or holding a directory, a missing column, content that does not parse, a y column with no numeric values, an occupied `--output` without `--overwrite`, and an unknown option each name the cause on stderr and exit 1, with stdout empty and nothing written (or nothing new written).

### Chart Types

| Type | Draws | Best when |
|------|-------|-----------|
| `bar` (default) | One rectangle per row | Comparing categories |
| `line` | A polyline through one point per row, with dots | A sequence or trend across ordered labels |

The `--x` column supplies labels, kept as text. The `--y` column supplies heights: only values that parse as finite numbers after `$`, commas, and spaces are stripped are plotted; a row whose y value does not parse is skipped rather than plotted as zero. A run that skips every row refuses rather than writing an empty chart. The vertical axis starts at zero and tops out at a rounded maximum above the largest value.

### Usage

| Command | Purpose | Reads a file | Writes a file |
|---------|---------|--------------|---------------|
| `node scripts/data.js chart help` | Print usage and exit | No | No |
| `node scripts/data.js chart --file <path> --x <col> --y <col> --output <path.html>` | Build the chart HTML | Yes | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The data file to read, an absolute path. Required | None; required |
| `--x <column>` | The category (label) column. Required | None; required |
| `--y <column>` | The numeric value column. Required | None; required |
| `--output <path>` | The HTML file to write, absolute, ending `.html`, outside this tool directory. Required | None; required |
| `--type <kind>` | `bar` or `line` | `bar` |
| `--title <text>` | Title drawn above the plot | None |
| `--format <fmt>` | Force `csv`, `json`, or `tsv` instead of auto-detecting | Auto-detect from the content |
| `--delimiter <char>` | Field delimiter for delimited text | Auto-detect (`,`, `;`, `\t`, or `\|`) |
| `--overwrite` | Replace a file already at `--output` | Off; an occupied path is refused |
| `--help`, `-h` | Print usage and exit | Off |

One file per run, and a header row is assumed. Missing folders on the way to `--output` are created. Format and delimiter are auto-detected from the content when not given. JSON input must be an array of objects.

### Output

On success, one HTML file at `--output` and one JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `output` | The absolute path of the HTML file written |
| `type` | `bar` or `line` |
| `points` | How many rows contributed a plotted point |
| `width` | Canvas width in CSS pixels |
| `height` | Canvas height in CSS pixels |
| `skipped` | How many data rows had a non-numeric y and were not plotted |
| `notes` | Parse notes (empty array when none); discarded input is named here, never silent |

The HTML is a complete document: UTF-8, a title, minimal inline CSS, and one SVG. It references no external resource.

## compute

One JSON object holding a percentage, difference, or rate computed from two numeric fields of a JSON object.

Use it when two numbers already sit in a saved `aggregate` or `describe` object, or in an object with a top-level `rows` array, and the answer is their ratio as a percentage, their difference, or their rate. It does not read CSV or TSV; it reads one JSON object. It does not group, join, or chart.

A usage mistake, an unknown flag, a path holding no file, and a field that is missing or not a number name the cause on stderr and exit 1, with stdout empty. A zero `b` for `percentage` or `rate` is not a failure: it prints the object with `error` `b is zero` and no `value` key, exit 0.

### Operations

| Op | Computes |
|----|----------|
| `percentage` | `a / b * 100` |
| `difference` | `a - b` |
| `rate` | `a / b` |

`--a` and `--b` name numeric fields in the object, by dotted path where nested, for example `groups.0.sum` or `columns.revenue.mean`. A numeric path segment indexes an array; a non-numeric segment on an array selects the first object whose `name` equals that segment. The value is a JavaScript double, unrounded unless `--digits` is given, in which case it is rounded to that many decimals.

### Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/data.js compute help` | Print usage and exit | No |
| `node scripts/data.js compute --file <path> --op <op> --a <field> --b <field>` | Compute the operation over the two fields | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The JSON file to read, an absolute path. Required | None; required |
| `--op <op>` | `percentage`, `difference`, or `rate`. Required | None; required |
| `--a <field>` | Numeric field for a, a dotted path where nested. Required | None; required |
| `--b <field>` | Numeric field for b, a dotted path where nested. Required | None; required |
| `--digits <n>` | Round the result to this many decimal places | Unrounded JavaScript double |
| `--format <fmt>` | Force `json` | JSON |
| `--delimiter <char>` | Accepted; unused because compute reads JSON | Unused |
| `--help`, `-h` | Print usage and exit | Off |

### Output

On success, one JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `op` | The operation that ran |
| `a` | `{ field, value }` for the a field |
| `b` | `{ field, value }` for the b field |
| `value` | The computed number, omitted when `b` is zero for `percentage` or `rate` |
| `error` | `b is zero` when `percentage` or `rate` divided by zero; omitted otherwise |

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --file is required.` | A command that takes `--file` ran with no file to read | Pass `--file <path>` |
| `Error: --left is required.` / `Error: --right is required.` | A join side was not named | Pass both absolute paths |
| `Error: --on is required.` | No join key column was named | Pass `--on <column>` |
| `Error: --group-by is required.` | No grouping column was named | Name one; repeat the flag to group on a tuple |
| `Error: --metric is required` | No metric was named | Pass `--metric <column>:<function>` |
| `Error: --metric "..." is not in the form` | The spec carried no colon, or nothing after the last one | Write it as `<column>:<function>` |
| `Error: --metric "..." names function "..."` | A function outside the six | Use one from the Groups and Metrics table |
| `Error: --x is required.` / `Error: --y is required.` | A chart column was not named | Name both columns |
| `Error: --output is required.` | No chart destination was named | Pass an absolute `.html` path in a work directory |
| `Error: --output must end in .html` | The destination extension is wrong | Use a path ending `.html` |
| `Error: a file already exists at ...` | Destination occupied and `--overwrite` was not passed | Pass `--overwrite`, or name a free path |
| `Error: --op is required.` / `Error: --op must be one of` | No compute operation, or one outside the three | Use `percentage`, `difference`, or `rate` |
| `Error: --a is required.` / `Error: --b is required.` | A compute field was not named | Name both fields |
| `Error: field <name> is missing or not a number in <file>` | A compute field was absent or not a finite number | Check the dotted path against the object |
| `Error: --how must be one of inner, left` | A mode outside the two | Use `inner` or `left` |
| `Error: --type must be one of bar, line` | A type outside the two | Use `bar` or `line` |
| `Error: --format must be one of csv, json, tsv` | A `--format` value outside the three supported formats | Pass one of the three, or omit `--format` to auto-detect |
| `Error: --columns needs at least one column name` | `--columns` was given nothing but separators | Name the columns, or omit the option |
| `Error: no file at <path>` | The path given does not exist | Check the path; an absolute one cannot be misread |
| `Error: could not read <path>` | The path is a directory or is not readable | Point the flag at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| Figures read 10x or 100x too large | The column uses decimal commas (`2,50`), which the numeric rule strips as thousands separators | Convert the file to decimal points before reading it |
| `parseErrors` names a JSON or delimiter problem, `rowCount` 0 | The content did not parse in the detected or forced format | Confirm the format; pass `--format` or `--delimiter` if auto-detection guessed wrong. JSON must be an array of objects |
| `errors` names a column as not found, `groupCount` 0 | The name does not match a column the file holds | Read the available list the same entry prints; header spelling and case must match |
| `Error: No numeric values found in y column` | Every y value was empty or non-numeric | Confirm the column holds numbers; only `$`, commas, and spaces are stripped |
| A right column appears as `<name>_right` | Both sides held a non-key column of that name | Expected; the left column keeps the original name |

## Success

- `help` prints usage listing the six subcommands to stdout and exits 0 on a copy with no `node_modules/`. `parse help` and `parse --help` print that subcommand's usage; the same form works for every subcommand.
- `parse` against a file that reads cleanly exits 0 with one parseable JSON object on stdout carrying `columns`, `rowCount`, `raggedRowCount` 0, and an empty `parseErrors`.
- `describe` against a file with a numeric column exits 0 with one parseable JSON object on stdout carrying `columns`, `skippedColumns` as `{ name, reason }` entries, `totalRows`, and `errors`.
- `aggregate` over a file whose columns all check out exits 0 with one parseable JSON object on stdout carrying `groups`, `groupCount`, `totalRows`, and an empty `errors`.
- `join` over two files whose key is present on both sides exits 0 with one parseable JSON object on stdout carrying `columns`, `rows`, `leftRows`, `rightRows`, `matchedRows`, `how`, `on`, and an empty `errors`.
- `chart` over a file whose x and y columns check out exits 0, writes one HTML file at `--output`, and prints one parseable JSON object on stdout carrying `output`, `type`, `points`, `width`, `height`, `skipped`, and `notes`. The written HTML contains an inline SVG and loads no external script or stylesheet.
- `compute` over two numeric fields exits 0 with `op`, `a`, `b`, and `value`. A zero `b` for `percentage` or `rate` exits 0 with `error` `b is zero` and no `value`. A missing or non-numeric field exits 1 with the cause on stderr and stdout empty.
- A required flag omitted, a path that does not exist or is a directory, a bad `--format`, `--how`, `--type`, or `--op`, or an unknown option exits 1 with the cause on stderr and stdout empty, and triggers no dependency install when the mistake is a usage one.
- An unknown option is refused by name before any install, read, or write.
- No run reads a credential, and after the first-run install no run opens a network connection. The install itself reaches `registry.npmjs.org`. The writes are what `tools/AGENTS.md` lists a first run installing, and for `chart` the HTML at the caller-named `--output`.
