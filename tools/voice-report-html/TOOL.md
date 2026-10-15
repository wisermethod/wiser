---
name: voice-report-html
type: tool
category: documents
description: Read a root's bound voice.md and the confirmed voice-lexicon profile it names into one data object, and render that object as one static HTML page with dials for register, stance and rhythm
version: 0.1.0
---

# voice-report-html

One static page that shows a voice as it is set now. It copies; it does not judge. Every value on the page comes from one of three places:
- the bound `voice.md`;
- the confirmed profile copy that file names on its `voice-profile:` line;
- a rated position the caller supplies, together with the trait line from `voice.md` that it rests on.

## Context

Use it when a person asks to see their voice. `skills/Voice Report/` is its caller, and its steps say when each command runs.

Do not use it to decide what a voice is, to measure writing, or to place a rated dial. Measuring is `tools/voice-lexicon/`, and building the voice is `skills/Build Voice/`. A rated dial's position is the caller's judgment; this tool only checks that the judgment quotes a trait line `voice.md` carries and the evidence ids that line cites.

**The page reflects the current setting.** For a range feature the person answered keep or polish on, the solid band is the range the voice is set to. A polished feature also shows the band as measured, as a dashed outline, so a habit the person chose to drop is never shown as their voice. The page records the sha256 of the files it read and the date `voice.md` was saved. It does not update itself, so a changed voice needs a new page.

Classifier seam: none.

## Quick Start

```bash
node scripts/voice-report-html.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/voice-report-html.js extract --voice "/path/to/root/memory/voice.md" --root /path/to/root --output "/path/to/root/work/onboarding/2026-10-15 voice report.json"
node scripts/voice-report-html.js render --data "/path/to/root/work/onboarding/2026-10-15 voice report.json" --output "/path/to/root/work/onboarding/2026-10-15 voice report.html"
```

Between the two commands, the caller may add rated dials to the data file's `rated` array:

```json
{ "key": "involved", "step": 2, "trait": "Emails and posts use I, you and contractions; the published narrative drops all three and carries figures with sources (E1, E2, E3, E4).", "evidence": ["E1", "E2"] }
```

The run over `tests/fixtures/complete-root` with that one rated dial printed:

```json
{"written":"/path/to/root/work/onboarding/2026-10-15 voice report.html","rated":1,"measured":9,"profile":"read"}
```

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/voice-report-html.js help` | Print usage and exit | No |
| `node scripts/voice-report-html.js extract --voice <file> --root <dir> [--output <file>]` | Read `voice.md` and the profile it names into one data object | Only the `--output` file, when one is given |
| `node scripts/voice-report-html.js render --data <file> --output <file> [--date YYYY-MM-DD]` | Validate a data object, rated dials included, and write the page | The `--output` file |

`extract` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--voice <file>` | The file the owning root's Provides block binds as `voice`. Absolute path, inside `--root` | None; required |
| `--root <dir>` | The owning root's folder. Its `AGENTS.md` frontmatter supplies the root type, and the `voice-profile:` path resolves against it | None; required |
| `--output <file>` | Write the data object here and print `{ "written", "state", "profile" }`. Absolute path, held to the destination rules below | The data object goes to stdout |
| `--help`, `-h` | Print usage and exit | Off |

`render` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--data <file>` | A data object `extract` wrote, with any rated dials added. Absolute path | None; required |
| `--output <file>` | The page to write. Absolute path, held to the destination rules below | None; required |
| `--date <YYYY-MM-DD>` | The generation date printed on the page | Today, local time |
| `--help`, `-h` | Print usage and exit | Off |

No command takes `--env`. This tool installs nothing, and `--install` is refused by name. The following are refused before any file is read:
- an unknown flag or an unknown command, named;
- a repeated flag;
- a flag given no value, an empty or all-space value, or a value starting with `-`;
- an argument that belongs to no flag.

**Paths.** Every path is absolute. A path is canonicalized by walking up to the deepest folder that exists, resolving it, and rejoining the missing part below. Sources must be regular files. The `voice-profile:` line is read as a path from the owning root, and it is refused when it is absolute or resolves outside the root.

**Destination rules.** `--output` is refused in each of these cases:
- it resolves inside this tool's directory (compared by path, and by device and inode on every ancestor);
- it is a symbolic link;
- anything already exists at the path;
- its folder does not exist.

**This tool never overwrites.** The caller archives an earlier page first, per `standards/conventions.md` Archives. The file is created exclusively, without following a link.

**Size caps:** `voice.md` 2 MB; the profile and the data file 20 MB each.

## What extract reads

From `voice.md`, only its fixed points:
- the `# Voice of <name>` title;
- the key lines above the first section: `voice-authority-name:`, `voice-authority-basis:`, `voice-confirmation-date:`, `voice-authority-fallback-signoff:` and `voice-profile:`;
- each `## ` section's bullets and paragraphs, as written;
- the `## Routing Table` rows;
- every `[Not available: …]` label.

The provenance preamble between its markers is skipped. A whole line in `*` is a prompt line. A section holding only prompt lines is `prompt`, and one holding only labels is `not-available`. Free sentences are never parsed for numbers.

From the profile, only the keys `tools/voice-lexicon/` defines:
- **`words`, `samples`, and `markers`:** each marker's `class`, `marker`, `count`, `samples`, `over`, `rate`, `reference`, `usual`, `basis` and `share`.
- **`ranges.chunks`, `ranges.chunk_words`, and `ranges.features`:** the eight range features and the eleven punctuation keys. Each feature holds `low`, `median`, `high`, `q1`, `q3`, `decision`, `polish` and `measured`.
- **Refusals by name:** a feature outside those names, a key outside those, a non-numeric `low`, `median` or `high`, a `decision` other than `keep` or `polish`, a `polish` other than `high` or `low`, and a `measured` that is not `{ low, high }` numbers.

A voice is `built` when at least one known section is answered; otherwise it is `unbuilt`.

## Data object

| Field | Carries |
|-------|---------|
| `state` | `built` or `unbuilt` |
| `subject`, `rootType` | From the title line and the root's `AGENTS.md`; `null` when absent |
| `voice` | `path` from the root, `sha256`, and `modified` (the date the file was last saved) |
| `authority` | `name`, `basis`, `confirmed`, `fallbackSignoff`, each as written or `null` |
| `profile` | `path`, `state` (`read`, `absent`: no `voice-profile:` line, or `missing-file`), `sha256`, `words`, `samples`, `chunks`, `chunkWords` |
| `features` | Per range feature: `low`, `median`, `high`, `q1`, `q3`, `decision`, `polish`, `measured`. Empty when the profile was not read |
| `markers` | The kept markers, as listed above |
| `sections` | `identity`, `routing`, `audience`, `tone`, `vocabulary`, `structure`, `prohibitions`; each `{ state, items, rows }` |
| `other` | Any other `## ` section, `{ heading, state, items, rows }` |
| `notAvailable` | `{ section, label }` for every label found |
| `rated` | `[]` from extract; the caller adds rated dials here |

## Rated dials

A rated dial is one of `involved` (involved to informational), `explicit` (situation-dependent to explicit reference), `abstract` (concrete to abstract style), or `formality` (contextual to formal). Each entry holds exactly `key`, `step`, `trait` and `evidence`. `render` refuses an entry in any of these cases:
- its `step` is not a whole number from 1 to 5;
- its `trait`, whitespace aside, is not part of one item in `sections` or of one Routing Table row's Register cell;
- `evidence` is empty, or an id in it is not of the form `E1`, or is not cited by that same item. A range written `E1 to E5`, `E1-E5` or with an en dash cites every id inside it;
- its key appears twice.

## The page

- **Header:** name, root type, whether and when the voice was confirmed and by whom, and which files and dates the page reflects.
- **Lead:** the Identity section, copied.
- **One aligned block of dials:**
  - Register: the four rated dials, each an open dot on a five-step scale, with the trait line as a sidenote.
  - Stance: hedges, boosters, I, we, you.
  - Rhythm: sentence length, sentence variety, long sentences.
  - Punctuation: any punctuation band the profile carries.
- **How a counted dial is drawn:** the dot is the median, the solid band is the range the voice is set to, and a polished feature adds its measured band as a dashed outline and the side polished away. A dial with nothing behind it is a dotted line reading `not known` or `not rated`. A group in which no dial has anything behind it is one line naming its dials and why, and the key is left out when no dial is drawn.
- **Below the dials:** the routing table, the kept markers, then Tone, Vocabulary, Structural Habits, Audience and Prohibitions as written, and every Not available label.
- **Footer:** the sha256 of each file read.

The page carries no script and no external request. All text from the files is escaped, and inline code is kept. Light and dark follow the reader's system setting, and the layout holds at phone width.

## Limits

- **An old-format `voice.md`**, written before Build Voice recorded `voice-profile:`, shows every measured dial as not known. Rebuilding the voice with the current Build Voice fills them.
- **Scales are fixed per feature** (for example hedges 0 to 20 per 1,000 words), and widen only when a value runs past them. Compare dials by position on their own scale, not across scales.
- **English labels only.**

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install, `--env` and system-dependency clauses have nothing to bind, and the tool carries no Dependencies section. Nothing is written but the `--output` file the caller names.

## Output

One JSON object on stdout, exit 0. A refusal prints to stderr, leaves stdout empty, and exits 1.
- `extract` without `--output` prints the data object.
- `extract` with `--output` prints `{ "written", "state", "profile" }`.
- `render` prints `{ "written", "rated", "measured", "profile" }`, where `measured` is the number of range features drawn.

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| `--install is refused` | Drop the flag. The tool installs nothing |
| `unknown command`, `unknown flag`, `needs a value`, `is given twice`, `belongs to no flag` | Read `help` and pass each flag once, with its value |
| `must be an absolute path` | Pass absolute paths |
| `is not inside --root` | Pass the root that binds this `voice.md`, and the file it binds |
| `voice-profile: … is an absolute path` or `outside the owning root` | The `voice.md` line is wrong. Rebuilding the voice is `skills/Build Voice/`; never edit the bound file by hand |
| `unknown range feature`, `unknown key`, `has no numeric`, `decision`, `polish`, `measured` | The profile is not a confirmed copy voice-lexicon validates. Point `voice-profile:` at the copy Build Voice wrote |
| `has not been built` | Every section of `voice.md` is still a prompt line or a Not available label. Run `skills/Build Voice/`; no page is made |
| `quotes no trait line`, `is not in voice.md as extracted`, `does not cite`, `cites no evidence`, `whole number from 1 to 5`, `is not one of`, `appears twice` | Fix the rated entry: copy the trait line exactly, cite only ids that line cites, a step from 1 to 5 |
| `already exists, and this tool never overwrites` | Archive the earlier file per `standards/conventions.md` Archives, or pass a new path |
| `inside the voice-report-html tool directory`, `symbolic link`, `folder that does not exist` | Pass `--output` as a new file in the owning root's `work/onboarding/` |
| `is not valid UTF-8` or `is not valid JSON` | Fix the file the message names |

## Success

- `help`, and `--help` beside any command, exits 0 with nothing installed and names every flag.
- `extract` exits 0 with one data object whose every value is copied from `voice.md`, the profile it names, or the root's `AGENTS.md`, and whose `features` is empty when no profile was read.
- `render` writes one static page only for a built voice, only with rated dials that quote a trait line and its cited evidence, and never over an existing file.
- A bad path, destination, profile or data file, an unknown flag, or `--install` exits 1 with stdout empty, and the message names the cause and the fix.
- Nothing is written but the `--output` file, and nothing is installed.
