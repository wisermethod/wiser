---
name: data-chart
type: tool
category: data
description: Builds a self-contained HTML file with an SVG bar or line chart from a CSV, JSON, or TSV file's named x and y columns
version: 0.1.0
---

# data-chart

One self-contained HTML file holding an SVG bar or line chart of two named columns from a data file, plus a JSON object naming the output path, the chart type, how many points were plotted, how many rows were skipped, any notes, and the canvas size.

## Context

Use it whenever a numeric series or comparison should be seen rather than only stated: revenue by region as bars, a monthly total as a line, a short ranking that needs a visual shape. Reach for it after the columns are known, typically after `tools/data-parse/` has named them, and when the answer is a file that opens offline in a browser.

Do not use it for conceptual diagrams, process maps, or geometry that is not a quantitative encoding; those are `skills/Visualizer/`. Do not use it to compute statistics or group rows; it plots the values as they sit in the file, and aggregation belongs to `tools/data-aggregate/` first when the file needs grouping. It does not join files, filter rows, or invent scales beyond a simple zero-based axis, and it changes nothing about the file it reads.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install described in `tools/AGENTS.md` it makes no network request. The HTML it writes loads no external script, stylesheet, or font: the chart is inline SVG and opens with no network.

## Chart Types

| Type | Draws | Best when |
|------|-------|-----------|
| `bar` (default) | One rectangle per row | Comparing categories |
| `line` | A polyline through one point per row, with dots | A sequence or trend across ordered labels |

The `--x` column supplies labels, kept as text. The `--y` column supplies heights: only values that parse as finite numbers after `$`, commas, and spaces are stripped are plotted; a row whose y value does not parse is skipped rather than plotted as zero. A run that skips every row refuses rather than writing an empty chart. The vertical axis starts at zero and tops out at a rounded maximum above the largest value.

## Quick Start

```bash
node scripts/chart.js help
```

Usage text, with nothing installed.

```bash
node scripts/chart.js chart \
  --file /path/to/a/work/directory/sales.csv \
  --x region --y revenue \
  --output /path/to/a/work/directory/sales-by-region.html \
  --title "Revenue by region"
```

The first real run reports that it would install `csv-parse` in this tool's directory, and stops. With `--install` it installs and does the work in the same run, writes the HTML, and prints one JSON object:

```
{"output":"/path/to/a/work/directory/sales-by-region.html","type":"bar","points":3,"width":720,"height":400,"skipped":0,"notes":[]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file | Writes a file |
|---------|---------|--------------|---------------|
| `node scripts/chart.js help` | Print usage and exit | No | No |
| `node scripts/chart.js chart --file <path> --x <col> --y <col> --output <path.html>` | Build the chart HTML | Yes | Yes |

Options:

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

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the consent-gated dependency install, closed unknown flags, and the stdout and stderr rules. It reads one caller-named file and writes one caller-named HTML file outside this tool directory; every other write a run makes is a first-run install, and `tools/AGENTS.md` is the only place this repository lists those. The tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections above state what the command does; the contract states how the script behaves getting there.

A usage mistake, a path holding no file or holding a directory, a missing column, content that does not parse, a y column with no numeric values, an occupied `--output` without `--overwrite`, and an unknown option each name the cause on stderr and exit 1, with stdout empty and nothing written (or nothing new written). No message repeats the underlying parser's own text, which can quote bytes of the input.

## Output

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

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --file is required.` | No data file was named | Pass `--file <path>` |
| `Error: --x is required.` / `Error: --y is required.` | A column was not named | Name both columns |
| `Error: --output is required.` | No destination was named | Pass an absolute `.html` path in a work directory |
| `Error: --output must end in .html` | The destination extension is wrong | Use a path ending `.html` |
| `Error: a file already exists at ...` | Destination occupied and `--overwrite` was not passed | Pass `--overwrite`, or name a free path |
| `Error: no file at <path>` | The data path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --type must be one of bar, line` | A type outside the two | Use `bar` or `line` |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: ... column "..." not found` | The name does not match a column the file holds | Profile the file; header spelling and case must match |
| `Error: No numeric values found in y column` | Every y value was empty or non-numeric | Confirm the column holds numbers; only `$`, commas, and spaces are stripped |
| `Error: could not write <path>` | The destination is not writable | Confirm the parent folder is writable by this account |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `chart` over a file whose x and y columns check out exits 0, writes one HTML file at `--output`, and prints one parseable JSON object on stdout carrying `output`, `type`, `points`, `width`, `height`, `skipped`, and `notes`.
- `chart` with a required flag omitted, a bad `--type`, a path that does not exist or is a directory, an occupied `--output` without `--overwrite`, a missing column, or no numeric y values exits 1 with the cause on stderr and stdout empty, and triggers no dependency install when the mistake is a usage one.
- The written HTML contains an inline SVG, loads no external script or stylesheet, and opens with no network.
- An unknown option is refused by name before any install, read, or write.
- No run reads a credential, and after the first-run install no run opens a network connection. The install itself reaches `registry.npmjs.org`. The writes are what `tools/AGENTS.md` lists a first run installing, and the chart at `--output`; the install itself is in this tool's own directory and the single HTML file at the caller-named `--output`.
