---
name: voice-report-html
type: tool
category: documents
description: Read a root's bound voice.md, the confirmed voice-lexicon profile it names, and the voice key's state line in the root's AGENTS.md into one data object, render that object as one static HTML page with dials for register, stance and rhythm or as a fragment of those dials for a host that draws HTML in the conversation, and say whether an existing page still shows the voice as set now
version: 0.4.0
---

# voice-report-html

One static page that shows a voice as it is set now. It copies; it does not judge. Every value on the page comes from one of four places:
- the bound `voice.md`;
- the confirmed profile copy that file names on its `voice-profile:` line;
- the voice key's state line under `## Onboarding` in the owning root's `AGENTS.md`;
- a rated position the caller supplies, together with the trait line from `voice.md` that it rests on.

## Context

Use it when a person asks to see their voice. `skills/Voice Report/` is its caller, and its steps say when each command runs.

Do not use it to decide what a voice is, to measure writing, or to place a rated dial. Measuring is `tools/voice-lexicon/`, and building the voice is `skills/Build Voice/`. A rated dial's position is the caller's judgment; this tool only checks that the judgment quotes a trait line `voice.md` carries and the evidence ids that line cites, or, for a Register cell, its row cites.

**The page reflects the current setting.** For a range feature the person answered keep or polish on, the solid band is the range the voice is set to. A polished feature also shows the band as measured, as a dashed outline, so a habit the person chose to drop is never shown as their voice. The page records the sha256 of `voice.md` and the profile, the date `voice.md` was saved, and from `AGENTS.md` only the voice state line, as written, with no fingerprint, so an unrelated edit there leaves the page current. It does not update itself. `fresh` says whether it still shows the voice as set now, so a caller reuses an unchanged page and rebuilds a stale one.

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

Later, before building again, the caller asks whether the page is still current:

```bash
node scripts/voice-report-html.js fresh --page "/path/to/root/work/onboarding/2026-10-15 voice report.html" --voice "/path/to/root/memory/voice.md" --root /path/to/root
```

The render run over `tests/fixtures/complete-root` with that one rated dial printed:

```json
{"written":"/path/to/root/work/onboarding/2026-10-15 voice report.html","rated":1,"measured":9,"profile":"read"}
```

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/voice-report-html.js help` | Print usage and exit | No |
| `node scripts/voice-report-html.js extract --voice <file> --root <dir> [--output <file>]` | Read `voice.md`, the profile it names, and the voice state line in the root's `AGENTS.md` into one data object | Only the `--output` file, when one is given |
| `node scripts/voice-report-html.js render --data <file> --output <file> [--date YYYY-MM-DD]` | Validate a data object, rated dials included, and write the page | The `--output` file |
| `node scripts/voice-report-html.js fresh --page <file> --voice <file> --root <dir>` | Say whether a page still shows the voice as set now | No |
| `node scripts/voice-report-html.js inline --data <file>` | Print the dials as one HTML fragment for the conversation | No |

`extract` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--voice <file>` | The file the owning root's Provides block binds as `voice`. Absolute path, inside `--root` | None; required |
| `--root <dir>` | The owning root's folder. `--voice` must sit inside it, the `voice-profile:` path resolves against it, and its own `AGENTS.md` is read for the voice state line | None; required |
| `--output <file>` | Write the data object here and print `{ "written", "state", "profile" }`. Absolute path, held to the destination rules below | The data object goes to stdout |
| `--help`, `-h` | Print usage and exit | Off |

`render` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--data <file>` | A data object `extract` wrote, with any rated dials added. Absolute path | None; required |
| `--output <file>` | The page to write. Absolute path, held to the destination rules below | None; required |
| `--date <YYYY-MM-DD>` | The generation date printed on the page | Today, local time |
| `--help`, `-h` | Print usage and exit | Off |

`fresh` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--page <file>` | A page `render` wrote. Absolute path | None; required |
| `--voice <file>` | The file the owning root binds as `voice` now. Absolute path, inside `--root` | None; required |
| `--root <dir>` | The owning root's folder | None; required |
| `--help`, `-h` | Print usage and exit | Off |

`inline` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--data <file>` | A data object `extract` wrote, with any rated dials added; validated exactly as `render` validates it. Absolute path | None; required |
| `--help`, `-h` | Print usage and exit | Off |

`fresh` is true only when all of the following hold:
- the page's recorded voice path is the bound file's path from the root;
- the bound file's sha256 is the one the page recorded;
- the voice names the same profile path the page read (a trailing anchor removed);
- that profile is still there, with the sha256 the page recorded;
- the voice key's state line in the root's `AGENTS.md`, and its state, read as the page recorded them.

Otherwise `fresh` is false, and `changed` says, in words, each difference found. A page made before 0.2.0 records no fingerprints, and one made before 0.4.0 records no state line; neither is ever fresh.

No command takes `--env`. This tool installs nothing, and `--install` is refused by name. The following are refused before any file is read:
- an unknown flag or an unknown command, named;
- a repeated flag;
- a flag given no value, an empty or all-space value, or a value starting with `-`;
- an argument that belongs to no flag.

**Paths.** Every path is absolute. A path is canonicalized by walking up to the deepest folder that exists, resolving it, and rejoining the missing part below. Sources must be regular files. The `voice-profile:` line is read as a path from the owning root, a trailing verification anchor such as ` [V7]` removed first, and it is refused when it is absolute or resolves outside the root.

**Destination rules.** `--output` is refused in each of these cases:
- it resolves inside this tool's directory (compared by path, and by device and inode on every ancestor);
- it is a symbolic link;
- anything already exists at the path;
- its folder does not exist.

**This tool never overwrites.** The caller archives an earlier page first, per `standards/conventions.md` Archives. The file is created exclusively, without following a link.

**Size caps:** `voice.md` and the root's `AGENTS.md` 2 MB each; the profile and the data file 20 MB each. An `AGENTS.md` over its cap is read as `unreadable`, not refused.

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

From the owning root's own `AGENTS.md`, only the voice key's state line under `## Onboarding`, as `skills/Onboard Root/` writes it: `- voice: provisional (…; owner: …)`. The line is kept as written, and the heading may be indented up to three spaces. Its state is its first word where that is `complete`, `provisional` or `blocked`, `unrecognized` where it is anything else, and `absent` where the file, the heading or the line is not there. Where the file is there but cannot be read (not a regular file, a broken link, unreadable, over its cap, or not UTF-8), the state is `unreadable` and extract still runs. The key is **open** in any state but `complete`, `absent` and `unreadable`. This line, not `voice-confirmation-date:`, says where the voice stands now.

A voice is `built` when at least one known section is answered; otherwise it is `unbuilt`.

## Data object

| Field | Carries |
|-------|---------|
| `state` | `built` or `unbuilt` |
| `subject` | From the title line; `null` when absent |
| `voice` | `path` from the root, `sha256`, and `modified` (the date the file was last saved) |
| `authority` | `name`, `basis`, `confirmed`, `fallbackSignoff`, each as written or `null` |
| `onboarding` | `path` (`AGENTS.md`), `state` (`complete`, `provisional`, `blocked`, `unrecognized`, `absent` or `unreadable`), and `line`, the state line after `voice:` as written or `null`. `render` and `inline` refuse a data object without it, or with another state |
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
- `evidence` is empty, or an id in it is not of the form `E1`, or neither the first item in `sections` holding the trait nor the row of any Register cell holding it cites every id in it. A Register cell's row cites what any of its cells cites, its Why cell included, and a range never runs across two cells. A range written `E1 to E5`, `E1-E5` or with an en dash cites every id inside it;
- its key appears twice.

## The page

- **Header:** name; where the voice stands, and when it was confirmed and by whom; and which files and dates the page reflects. An open key is shown by its state line as written, `voice: provisional (…)`, and an `unreadable` one as `voice state not known: AGENTS.md could not be read`; either way the confirmation date then follows as `last confirmed`, or `not yet confirmed` where there is none. A confirmation line holding no date, such as an anchor alone, reads `not yet confirmed`.
- **Lead:** the Identity section, copied.
- **One aligned block of dials:**
  - Register: the four rated dials, each an open dot on a five-step scale, with the trait line as a sidenote.
  - Stance: hedges, boosters, I, we, you.
  - Rhythm: sentence length, sentence variety, long sentences.
  - Punctuation: any punctuation band the profile carries.
- **How a counted dial is drawn:** the dot is the median, the solid band is the range across the samples (for a polished feature, the narrower range it is set to), and a polished feature adds its measured band as a dashed outline and the side polished away. A dial with nothing behind it is a dotted line reading `not known` or `not rated`. A group in which no dial has anything behind it is one line naming its dials and why, and the key is left out when no dial is drawn.
- **Below the dials:** the routing table, the kept markers, then Tone, Vocabulary, Structural Habits, Audience and Prohibitions as written, and every Not available label.
- **Footer:** a short fingerprint of `voice.md` and the profile, and a note when the voice state line was read. The full sha256 of each fingerprinted file, the paths read, and the state line and its state sit in `voice-report:` meta tags in the page head, which `fresh` reads.

The page carries no script and no external request. All text from the files is escaped, and inline code is kept. Light and dark follow the reader's system setting, and the layout holds at phone width.

## The fragment

`inline` prints `{ "fragment", "rated", "measured", "profile" }`. The fragment is for a host that draws HTML inside the conversation: an inline visual or widget tool. It is one short `<style>` block followed by one `<div>`.

What it holds:
- a hidden heading for screen readers;
- a one-line header: name, and where the voice stands, worded as the page's header words it;
- the same dials as the page, drawn by the same code with the same marks, and their styles taken from `template/report.css`, each quoted trait line shown under its rated dial;
- the key.

What it leaves out:
- no page shell, script, comment or external request;
- no lead paragraph and no lists; those stay on the page;
- no background; its colours read the host's own variables (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-accent`, `--border-strong`, `--border-stronger`, `--surface-2`, `--font-sans`), each with a fallback taken from the page's own light and dark colours in `template/report.css`, so it follows the host's light or dark mode.

It writes nothing. The caller passes it to the host's renderer unchanged.

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
- `fresh` prints `{ "fresh", "changed" }`; `changed` is `[]` when `fresh` is true.
- `inline` prints `{ "fragment", "rated", "measured", "profile" }`.

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
| `quotes no trait line`, `is not in voice.md as extracted`, `does not cite`, `no one line`, `cites no evidence`, `whole number from 1 to 5`, `is not one of`, `appears twice` | Fix the rated entry: copy the trait line exactly, cite only ids that line cites, or for a Register cell its row cites, a step from 1 to 5 |
| `already exists, and this tool never overwrites` | Archive the earlier file per `standards/conventions.md` Archives, or pass a new path |
| `inside the voice-report-html tool directory`, `symbolic link`, `folder that does not exist` | Pass `--output` as a new file in the owning root's `work/onboarding/` |
| `is not valid UTF-8` or `is not valid JSON` | Fix the file the message names |

## Success

- `help`, and `--help` beside any command, exits 0 with nothing installed and names every flag.
- `extract` exits 0 with one data object whose every value is copied from `voice.md`, the profile it names, or the voice state line in the root's `AGENTS.md`, and whose `features` is empty when no profile was read.
- `inline` exits 0 with one fragment only for a built voice whose data `render` would accept, and writes nothing.
- `fresh` exits 0 and is true only when the page's recorded files are the bound files, unchanged, and the voice state line reads as it did.
- The page never calls a voice confirmed while the root's state line leaves the voice key open, in any state but `complete`, or while `AGENTS.md` cannot be read.
- `render` writes one static page only for a built voice, only with rated dials that quote a trait line and its cited evidence, and never over an existing file.
- A bad path, destination, profile or data file, an unknown flag, or `--install` exits 1 with stdout empty, and the message names the cause and the fix.
- Nothing is written but the `--output` file, and nothing is installed.
