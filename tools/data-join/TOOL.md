---
name: data-join
type: tool
category: data
description: Joins two CSV, JSON, or TSV files on a shared key column with an inner or left join, returning the joined rows and match counts as JSON
version: 0.1.0
---

# data-join

One JSON object holding the joined rows of two data files on a named key column, the column list, how many rows each side held, how many result rows came from a match, the join mode, the key, and anything that stopped the join from running.

## Context

Use it whenever two files share a key and the answer needs columns from both: an order table and a customer table on customer id, a cleaned list and the source contacts on email, verification results merged back onto the source rows. Reach for it in place of reading both files and matching them by eye, which is where rows get dropped and counts go wrong.

Do not use it to learn what either file contains; profile each side first with `tools/data-parse/` so the key's spelling and case are known. Do not use it for a group-by or a whole-column statistic; those are `tools/data-aggregate/` and `tools/data-describe/`. It does not filter, sort by a computed value, or compute a change between periods, and it changes nothing about the files it reads.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the two files the caller names and writes nothing.

## Join Modes

| Mode | Keeps | Unmatched left rows |
|------|-------|---------------------|
| `inner` (default) | Only keys present on both sides | Dropped |
| `left` | Every left row | Kept, with right-side columns set to null |

Keys are compared as text exactly as the files hold them, after each value is stringified; a missing key value joins the group named `null`. One left row that matches several right rows produces one result row per match. The join key appears once in the result, taken from the left side. A right column whose name collides with a left column other than the key is renamed to `<name>_right`.

## Quick Start

```bash
node scripts/join.js help
```

Usage text, with nothing installed.

```bash
node scripts/join.js join \
  --left /path/to/a/work/directory/orders.csv \
  --right /path/to/a/work/directory/customers.csv \
  --on customer_id
```

The first real run installs `csv-parse` in this tool's directory and asks for a re-run; the second does the work and prints one JSON object:

```
{"columns":["customer_id","order_id","name"],"rows":[{"customer_id":"1","order_id":"A","name":"Ada"}],"leftRows":2,"rightRows":2,"matchedRows":1,"how":"inner","on":"customer_id","errors":[]}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads files |
|---------|---------|-------------|
| `node scripts/join.js help` | Print usage and exit | No |
| `node scripts/join.js join --left <path> --right <path> --on <column>` | Join the two files on the key | Yes, both |

Options:

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

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run dependency install, and the stdout and stderr rules. It reads two caller-named files and writes nothing but that first-run install into its own directory, so the contract's `--env` and output-path clauses have nothing to bind here, and the tool carries no Dependencies section because `csv-parse` installs by the first-run check and Node covers the rest. The sections above state what the command does; the contract states how the script behaves getting there.

Two failures are told apart. A usage mistake, a path holding no file or holding a directory, and a `--how` outside the two modes are caught before anything is installed or read: they name the cause on stderr and exit 1. Everything the files themselves decide is an answer, not a failure: a key that is not on one side, content that does not parse, a side with no data rows. Those come back inside the JSON in `errors` with an empty row list and exit 0, because a caller that asked for orders by customer needs to be told which side lacks the key. No message repeats the underlying parser's own text, which can quote bytes of the input.

## Output

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

`rows` empty with `errors` populated means nothing was joined, and the entries say why. A non-empty `errors` beside a full row list is the third case: the join is complete and the entries note what was skipped on the way, such as items in a JSON array that were not objects.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm install failed` | Node missing or older than 18, or the directory is not writable | Confirm `node --version` is 18 or newer, delete `node_modules/`, run `npm install` here by hand |
| `Error: --left is required.` / `Error: --right is required.` | A side was not named | Pass both absolute paths |
| `Error: --on is required.` | No key column was named | Pass `--on <column>` |
| `Error: --how must be one of inner, left` | A mode outside the two | Use `inner` or `left` |
| `Error: no file at <path>` | A path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --format must be one of csv, json, tsv` | A `--format` value outside the three | Pass one of the three, or omit `--format` to auto-detect |
| `Error: could not read <path>` | The path is a directory or is not readable | Point the flag at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `errors` names a key as not found | The name does not match a column that side holds | Read the available list the same entry prints; header spelling and case must match |
| `errors` names a parse or empty-file problem | A side did not parse or held no rows | Confirm the format; pass `--format` or `--delimiter` if auto-detection guessed wrong |
| Fewer matches than expected | Keys differ in case, spacing, or formatting across the two files | Normalize the key columns in the source data; this tool compares exact text |
| A right column appears as `<name>_right` | Both sides held a non-key column of that name | Expected; the left column keeps the original name |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `join` over two files whose key is present on both sides exits 0 with one parseable JSON object on stdout carrying `columns`, `rows`, `leftRows`, `rightRows`, `matchedRows`, `how`, `on`, and an empty `errors`.
- `join` with `--left`, `--right`, or `--on` omitted, with a bad `--how`, or naming a path that does not exist or is a directory, exits 1 with the cause on stderr and stdout empty, and triggers no dependency install.
- A key that is not on one side exits 0 with empty `rows` and the reason in `errors`, naming the columns that side does hold.
- An inner join drops unmatched left rows; a left join keeps them with right columns null; one-to-many keys produce one result row per match.
- An unknown option is refused by name before any install or read.
- No run reads a credential, opens a network connection, or writes any file other than the first-run dependency install in this tool's own directory.
