---
name: copy-check
type: tool
category: documents
description: Count and match page copy against a ledger, a fact map, patterns, and a corpus, and return one JSON object
version: 0.1.0
---

# copy-check

One JSON object that counts and matches. It judges nothing: a caller decides which Use codes are allowed, which overlaps are identifiers, and what a pattern means.

## Context

Use it when a draft has to be checked, mechanically, against a claims ledger, a fact map, a list of prohibited phrases, a published corpus, or the two dash characters. Each subcommand reads the files it is given and reports what matched.

Do not use it to decide whether a claim is true, whether a match is allowed, or whether a page should ship. It does not know what a Use code means. It does not know which overlaps are a person's name, title, a book's full title, or a co-author credit. A `pass` of false is a count, not a verdict, and a `pass` of true is an empty count, not an approval.

Classifier seam: none.

## Quick Start

```bash
node scripts/copy-check.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/copy-check.js facts --copy /path/to/copy.md --ledger /path/to/ledger.md --fact-map /path/to/map.md --allow usable
node scripts/copy-check.js prohibited --copy /path/to/copy.md --patterns /path/to/patterns.json
node scripts/copy-check.js overlap --copy /path/to/copy.md --corpus /path/to/corpus --n 5
node scripts/copy-check.js dashes --copy /path/to/copy.md
```

One JSON object on stdout. Nothing is written. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/copy-check.js help` | Print usage and exit | No |
| `node scripts/copy-check.js facts --copy <file> --ledger <file> --fact-map <file> --allow <codes>` | Map each copy unit to the fact map and the ledger | No |
| `node scripts/copy-check.js prohibited --copy <file> --patterns <file>` | Report every pattern match | No |
| `node scripts/copy-check.js overlap --copy <file> --corpus <dir> [--n <words>]` | Report shared word sequences | No |
| `node scripts/copy-check.js dashes --copy <file>` | Count U+2014 and U+2013 by code point | No |

`facts` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--copy <file>` | Markdown copy. Absolute path | None; required |
| `--ledger <file>` | Claims ledger, in the ledger format below. Absolute path | None; required |
| `--fact-map <file>` | Fact map, in the fact-map format below. Absolute path | None; required |
| `--allow <codes>` | Comma-separated Use codes the caller counts as usable. Empty entries and duplicates are refused | None; required |
| `--help`, `-h` | Print this command's usage and exit | Off |

`prohibited` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--copy <file>` | Markdown copy. Absolute path | None; required |
| `--patterns <file>` | Patterns JSON, in the patterns format below. Absolute path | None; required |
| `--help`, `-h` | Print this command's usage and exit | Off |

`overlap` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--copy <file>` | Markdown copy. Absolute path | None; required |
| `--corpus <dir>` | Directory of `.md` and `.txt` files, read recursively. Absolute path. A symlink at this path is read at its target; links inside it are not followed | None; required |
| `--n <words>` | Sequence length. A whole number from 3 to 12. `--n=5` is an unknown option; pass `--n 5` | 5 |
| `--help`, `-h` | Print this command's usage and exit | Off |

`dashes` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--copy <file>` | Markdown copy. Absolute path | None; required |
| `--help`, `-h` | Print this command's usage and exit | Off |

No command takes `--env`. This tool installs nothing, and `--install` is refused by name like any other unknown flag. An unknown flag is refused by name before any file is read, including when it sits beside `help`. A repeated flag is refused. A flag that needs a value, given none or given a value that starts with `-`, is refused. An argument that belongs to no flag is refused. An unknown command is refused by name.

Every path is absolute. A relative path is refused, because it would resolve against whatever directory the caller happened to be in. The path is canonicalized by walking to the deepest existing ancestor, resolving that ancestor, and rejoining the missing tail. A path that cannot be canonicalized is refused and is never compared as spelled. The resolved path is the one opened. `--copy`, `--ledger`, `--fact-map`, and `--patterns` must be files. `--corpus` must be a directory. A missing path, or the wrong kind, is refused by name. There is no credential file to refuse, because no command takes `--env`, and there is no destination to refuse, because nothing is written. A source that happens to sit inside this tool directory is read; the tool still writes nothing there.

## How the copy is read

The copy is markdown. The same reading feeds every subcommand. `units` is how many units that reading produced. `characters` is the number of code points in the file after a leading U+FEFF, if one was present, is removed. `bomStripped` says whether that mark was removed.

A YAML frontmatter block is present only when the file starts with a line that is only `---` and a later line is only `---`. Of its keys, only `title` and `description` are copy. Each is one unit and is not split into sentences. Other keys are not read. An unclosed frontmatter is not frontmatter, and the opening line is read as a paragraph.

On the key's own line the value is one of two forms: a plain scalar, or one complete double-quoted string with nothing after the closing quote but optional spaces. A double-quoted string decodes `\"` and `\\`. The quotes that delimit it are not part of the value. The value is refused, exit 1, and the message names the key and the line, when it is empty; when a plain scalar begins with `|`, `>`, `'`, `[`, `{`, `&`, `*`, `!`, `%`, `@`, or a backquote; when ` #` appears outside a double-quoted string, which is a YAML comment; when a double-quoted string is not closed on that line, has anything other than spaces after its closing quote, or contains a backslash escape other than `\"` and `\\`; or when any later line, before the next top-level key or the closing `---`, is non-blank and indented. A top-level key is a line that starts with a character other than a space, a tab, or `#`. Blank lines between the key and that later line stay inside the check. A value the reading cannot take whole would otherwise go unchecked.

The reading records one block for each frontmatter value, heading, list item, table cell, and paragraph. A block holds the raw-file offsets of its visible characters: the decoded frontmatter value without its YAML quote delimiters, the heading text, the list item with its continuation lines, the table cell, or the paragraph. Fence interiors, fence lines, thematic breaks, and blank lines belong to no block.

A fenced code block, three or more backticks or three or more tildes, indented by at most three spaces, is skipped. `skippedFences` names how many blocks were skipped and how many characters they held. A fence belongs to no block, so a quote inside a code sample is not paired. A dash inside a fence is still counted, and its context is `text`. A dash inside a frontmatter value is counted, and it is exempt only when it sits inside a quotation in that value.

Each ATX heading is one block and one unit. Each list item is one block and one unit, continuation lines joined to it, and a blank line ends the list; a list item is not split into sentences. Each table cell, header and body, is one block and one unit; an empty cell is not a unit. The delimiter row is not a unit. Cells may contain an escaped pipe, written `\|`.

A paragraph is one block. It is split into sentence units at `.`, `?`, or `!` followed by whitespace and then an uppercase letter, a digit, a straight or curly quotation mark, or an opening bracket `(`, `[`, or `{`, or at the end of the paragraph. The split is made after links and emphasis have been reduced, so a URL does not become a sentence break. The last remainder of a paragraph is a unit even when it has no terminal punctuation. Known limit: an abbreviation such as `e.g.` or `Dr.` followed by a capital letter splits a sentence. Reference-style links are left as written. A match is sought inside one unit, never across two. Quotation pairing uses the paragraph block, so a quotation can cross a sentence boundary inside that paragraph and cannot cross into another block.

A markdown link `[text](url)` and an image `![alt](url)` are read as their text; the URL is removed. Paired emphasis markers `**`, `__`, `*`, and `_` are removed. Visible copy is what remains: no link URL, no emphasis marker, and no YAML key or delimiter.

A fact-map sentence of four words or more matches as a prefix of a unit. A sentence of fewer than four words matches only a unit whose whole text it is, so a short heading, a name used as a title, or a link reading one word is mapped by writing that whole unit.

## Exemptions

One exemption, the quotation, applied only where a subcommand says so. A quotation is a matching pair of straight double quotes, or of U+201C then U+201D, both inside the same block. Pairing never crosses from one block to another, so a stray inch mark cannot reach across a heading, a list item, a table cell, a fence, or a blank line. An opener with no closer in its block is not a quotation. Link text, an image's alt text included, is reported with the context `title` and is not exempt: a link may hold a title reproduced as written or new prose, and only the caller can tell which, so the tool counts it and names its context. Italics are not exempt either. A position inside a quotation and a link is reported as `quotation`. Fence interiors are not paired, as the reading section says; a dash inside a fence stays `text`. `dashes` uses these block quotations: a dash inside a quotation is exempt, and every other dash is counted, a dash in a fence and a dash in a frontmatter value included.

`prohibited` does not apply it: a prohibited phrase inside a quotation still appears on the page, so it is reported with its context and it counts. `overlap` applies it on the copy side only, and reports how many words that exclusion removed. `dashes` applies it, and reports exempt occurrences separately from counted ones. `facts` does not apply it.

## Ledger format

A markdown file holding one or more tables. A table whose header row has a cell exactly `ID` is a ledger table, and its columns are exactly these five, in this order: `ID`, `Claim`, `Source`, `Register / label`, `Use`. Every other table is ignored and named in `ignoredTables`. A file with no ledger table is refused.

An `ID` is a non-empty token with no whitespace, unique across the file. The Use code is the run of letters, digits, and hyphens that opens the `Use` cell once asterisks and underscores, the emphasis marks, are removed, so `**usable**, as worded` reads as `usable`. The tool does not know what any code means. A row with the wrong cell count, an empty or duplicate ID, an ID that contains whitespace, or a Use cell that does not open with a code is refused, and the message names the line. Cells may contain an escaped pipe, `\|`. A separator row is not data. A ledger table with a header and no body rows is still a ledger table. Several ledger tables are read as one ledger, and IDs stay unique across the file. A ledger row that no fact-map row cites is not an error.

## Fact-map format

A markdown file with one map table. The header row is exactly `#`, `Sentence`, `Rows`, `Note`, in that order. A second table with that header is refused. A table whose header contains any of those four cells but is not exactly those four, in that order, is refused, and the message names the line. Any other table is ignored and named in `ignoredTables`. A file with no map table is refused.

`Sentence` is the verbatim opening words of one unit of the copy, at least four words, or the whole of a unit shorter than that, optionally wrapped in one pair of straight double quotes or of curly double quotes. Words are counted after that pair is removed and whitespace is collapsed. An empty `Sentence` is refused. `Rows` is a comma-separated list of ledger IDs, or the single word `none` for a sentence that states no fact. The Note says what a `none` sentence states instead. An empty `Rows` cell, an empty token in the list, or a row with the wrong cell count is refused, and the message names the line. `none` is exact and case-sensitive. The `#` cell is a mark so two rows can be told apart; it does not have to be unique.

## Patterns format

A JSON file:

```json
{"patterns":[{"id":"p1","from":"about","phrase":"thought leader"},{"id":"p2","from":"default","regex":"highest-scoring"}]}
```

Each entry has a unique non-empty string `id`, a `from` of `about`, `voice`, or `default`, and exactly one of `phrase` or `regex`. A phrase matches case-insensitively at word boundaries. The boundary is JavaScript's `\b`, an ASCII boundary at `[A-Za-z0-9_]`. Whitespace inside a phrase matches any whitespace. A phrase with nothing in it, with leading or trailing whitespace, or that does not match itself at a word boundary, is refused. A regex is a JavaScript source compiled with the `i` and `u` flags. One that does not compile, or is empty, is refused. The search also sets `g`, and a zero-length match is skipped.

Refused, with nothing read as a result: invalid JSON, a value that is not an object with a `patterns` array, an empty list, a duplicate id, a `from` outside the three values, an entry with both `phrase` and `regex`, an entry with neither. A key other than `patterns`, and a key on an entry other than `id`, `from`, `phrase`, and `regex`, is not applied. `ignoredKeys` and `ignoredPatternKeys` name what was set aside.

## facts

Reports every copy unit with no fact-map row (`unmapped`), every fact-map row whose `Sentence` matches no unit (`stale`) or matches more than one unit whose texts differ (`ambiguous`), every cited ID that is not in the ledger (`missingRows`), and every cited row whose code is not in `--allow` (`disallowed`, with its code). A row that matches several units of identical text, the same sentence in the short and the longer bio, maps them all. A `none` row maps a unit and cites no IDs. A missing ID is not also disallowed. Each missing or disallowed ID is reported once per fact-map row.

The match is a case-sensitive prefix of the unit after the copy reading above, then whitespace collapsed and curly quotes straightened to straight quotes. One surrounding pair of straight double quotes on the sentence is removed before the comparison. The prefix has to end at a word boundary: the next character is not a letter or a number, or the unit ends there.

`pass` is true only when `unmapped`, `stale`, `ambiguous`, `missingRows`, and `disallowed` are all empty.

Before that object is reported, the command appends one sentence that no fact-map row names to an in-memory copy of the file and confirms that sentence comes back unmapped. The planted sentence is not in the reported `unmapped` list. `control` carries `planted` (that sentence) and `fired` (true). A control that does not fire exits 1 with stdout empty.

## prohibited

Every match carries the pattern `id`, its `from`, the matched `text`, the 1-based `line` and code-point `column` in the file, the `unit` it sits in, and `context`: `text`, `quotation`, or `title`. Nothing is exempt. `pass` is true only when `matches` is empty.

The search runs on the unit after links and emphasis are reduced. The line and column are the match's position in the raw file. A column counts code points, and a carriage return is not a column.

The control plants the first pattern's own text, or a sample the regex matches, as its own paragraph in an in-memory copy, and confirms that pattern matches once more than it did on the real file. `control.planted` is that sample. The plant is not in the reported `matches`.

## overlap

The copy and every `.md` and `.txt` file under `--corpus` are lowercased, punctuation is stripped (any character that is not a Unicode letter, a number, or whitespace becomes a space, so `don't` becomes `don t`), and the words are cut into sequences of `--n` words. The walk is recursive. Symbolic links are not followed. Files are sorted by relative path.

The report is per copy section. Each unit carries the name of its section. Frontmatter units belong to `frontmatter`. Units before the first heading belong to `preamble`. A heading unit opens its own section, and later units belong to it until the next heading. A section's words are the tokens of its units' visible text, in source order, joined with a space, after every character inside a quotation has been blanked. Those tokens never include a link URL, an emphasis marker, or a YAML key or delimiter. Each section reports `sequences` (every window, duplicates included) and `matches` (each distinct matched sequence once, with the corpus files it appears in, paths relative to the corpus directory).

Quotations are excluded from the copy side only, not from the corpus; link text is not excluded, so a linked title of the person's own work shows as a match the caller judges. `excludedWords` is the word count blanked as quotation. `filesRead` lists the relative paths that were read. `filesSkipped` lists the rest, each with a reason: `extension`, `unreadable`, `not-utf8`, `symlink`, or `not-a-file`. A directory with no readable `.md` or `.txt` file is refused. `pass` is true only when every section has zero matches. The caller judges which matches are factual identifiers. This command has no allowlist for them.

The control walks the readable corpus files in that path order until one has at least `--n` words, copies its first sequence into an in-memory paragraph of the copy, and confirms that sequence comes back as a match. If no file has enough words, the control cannot fire. The plant is not in the reported matches.

## dashes

Counts U+2014 and U+2013 by code point, never by a typed glyph. Each hit carries `line`, `column`, `character` (`U+2014` or `U+2013`), `context` (`text`, `quotation`, or `title`), and a short `excerpt`. `counted` is the hits outside a quotation, link text included. `exempt` is the hits inside one. `charactersScanned` is the code points scanned, the same population as `characters`. `pass` is true only when `counted` is zero. A dash in italics is counted. A dash in a fence is counted, as `text`.

The control appends one U+2014, outside any quotation or title, to an in-memory copy and confirms `counted` rose by one. `control.planted` is `U+2014`. The plant is not in the reported `hits`.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install, `--env`, and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. No command checks for a package or runs an install. No command takes `--env`, and `--install` is refused by name. Nothing is written, anywhere. The sections above state what each command does; the contract states how the script behaves getting there.

## Output

One JSON object on stdout, exit 0, whether or not `pass` is true. A refusal, an unknown flag, or a control that does not fire prints to stderr, leaves stdout empty, and exits 1. The object never implies input it discarded: ignored tables, skipped files, skipped fences, excluded words, and ignored pattern keys are fields on it, and a leading byte-order mark is named by `bomStripped`.

Every object carries:

| Field | Carries |
|-------|---------|
| `command` | `facts`, `prohibited`, `overlap`, or `dashes` |
| `pass` | True only on the empty count that command defines |
| `units` | How many copy units were read |
| `characters` | Code points read, after a leading U+FEFF is removed |
| `bomStripped` | True when that mark was removed |
| `skippedFences` | `{ blocks, characters }` for fences the reading skipped |
| `control` | `{ planted, fired }`. `fired` is true on every object that exits 0. The plant is not one of the reported findings |

`facts` also carries:

| Field | Carries |
|-------|---------|
| `allow` | The Use codes from `--allow`, in order |
| `ledgerRows` | Ledger rows read |
| `factMapRows` | Fact-map rows read |
| `ignoredTables` | `{ file, line, header }` for every table that was not a ledger or the map. `file` is `ledger` or `fact-map` |
| `unmapped` | `{ line, column, unit }` for each copy unit no fact-map row matched |
| `stale` | `{ line, mark, sentence }` for a fact-map row that matched no unit |
| `ambiguous` | `{ line, mark, sentence, unitCount }` for a fact-map row that matched more than one unit, those units' texts differing |
| `missingRows` | `{ line, id }` for a cited ID that is not in the ledger |
| `disallowed` | `{ line, id, code }` for a cited row whose code is not in `--allow` |

`prohibited` also carries:

| Field | Carries |
|-------|---------|
| `ignoredKeys` | Top-level JSON keys other than `patterns` |
| `ignoredPatternKeys` | `{ id, keys }` for entry keys that were not applied |
| `matches` | `{ id, from, text, line, column, unit, context }` for each match. `context` is `text`, `quotation`, or `title` |

`overlap` also carries:

| Field | Carries |
|-------|---------|
| `n` | The sequence length used |
| `excludedWords` | Words removed from the copy side because they sat in a quotation |
| `filesRead` | Relative paths read, in path order |
| `filesSkipped` | `{ path, reason }` for everything else under the corpus |
| `sections` | `{ section, sequences, matches }`. Each match is `{ sequence, files }` |

`dashes` also carries:

| Field | Carries |
|-------|---------|
| `counted` | Hits outside a quotation, link text included |
| `exempt` | Hits inside a quotation |
| `charactersScanned` | Code points scanned. Same population as `characters` |
| `hits` | `{ line, column, character, context, excerpt }` for every hit, counted and exempt |

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| `unknown option "--install"` or `unknown option "--env"` | Drop the flag. No command takes `--env`, and the tool installs nothing |
| `must be an absolute path` | Pass an absolute path. A relative one is refused on purpose |
| `is not a file` or `is not a directory` | `--copy`, `--ledger`, `--fact-map`, and `--patterns` are files. `--corpus` is a directory |
| `no ledger table` or a ledger line number | The header is exactly `ID`, `Claim`, `Source`, `Register / label`, `Use`. IDs are unique tokens. The Use cell opens with its code |
| `no map table`, `malformed`, or `second map table` | One table, header exactly `#`, `Sentence`, `Rows`, `Note` |
| `sentence ... is empty` | A fact-map sentence is the opening words of a unit, at least four, or the whole of a shorter unit |
| `has no readable .md or .txt file` | Put at least one readable UTF-8 `.md` or `.txt` file under `--corpus` |
| `--n must be a whole number` | Pass a whole number from 3 to 12 as the next argument, not `--n=5` |
| `control did not fire` | The check could not show that a zero was a real zero, so it reported nothing. The message names the subcommand |
| `pass` is false and the process exited 0 | That is a successful run. Read the lists. Exit 1 means the run could not check |

## Success

- `node scripts/copy-check.js help`, and each subcommand's `--help`, exits 0 and names that command's flags.
- A check that can run exits 0 with one JSON object, `control.fired` true, and the plant absent from the reported findings.
- `pass` is true only when that command's lists are empty, and a false `pass` still exits 0.
- A malformed ledger, fact map, or patterns file, an unknown flag, a bad path, an empty corpus, or a control that does not fire exits 1 with stdout empty, and the message names the cause and the fix.
- Nothing is written.
