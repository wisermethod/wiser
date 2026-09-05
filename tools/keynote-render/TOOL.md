---
name: keynote-render
type: tool
category: documents
description: Builds and edits native Keynote decks from JSON or markdown SSOT, with zArchive safety before every in-place mutation
version: 0.2.0
---

# keynote-render

One tool for native Keynote: greenfield build from a JSON deck spec, and in-place edit of an existing `.key` from a markdown SSOT so hand-tuned craft (custom shapes, accent rules, spacing) survives content changes.

## Context

Use it when the deliverable is a Keynote file: a deck someone will open, edit, and present in Keynote, or an export that has to come out of Keynote's own renderer rather than a browser. Styling comes from a theme already installed in Keynote.

**Primary agent path for an existing deck:** load markdown → archive the `.key` → diff → minimal patch → save → verify. Do not rebuild the whole document when a patch will do.

Do not use it to author a deck in HTML: reveal.js decks belong to `skills/Create Presentation/`. Do not use it to decide what the slides say. It places the text it is handed; the writing discipline and visual review belong to the skill that calls this tool.

It runs on macOS with Keynote installed, and nowhere else. It authenticates to nothing, holds no credential, takes no `--env`, and after packages are installed it opens no network connection. The install itself reaches `registry.npmjs.org`, per `tools/AGENTS.md`.

## Workstream (primary)

```bash
node scripts/render.js sync --md /abs/slides.md --deck /abs/deck.key --brand /abs/brand.yaml --confirm
```

| Step | Behavior |
|------|----------|
| 1. Load SSOT | Parse `--md` (canonical markdown or the numbered-slide course shape; see [Markdown deck format](#markdown-deck-format)) |
| 2a. Existing `.key` | **Archive first** to sibling `zArchive/` per `standards/conventions.md` § Archives. If the copy fails, stop; the deck is not mutated |
| 2b. | Inspect live structure (bulk), diff markdown vs deck, apply minimal `update` / `insert` / `delete` |
| 2c. | Save in place. Unchanged slides keep theme, masters, custom shapes, and manual layout |
| 3. Missing `.key` | Full build from markdown (same engine as `build`); no archive step |
| 4. Verify | Inspect notes on one updated slide; optional `--out` snapshot directory; JSON report of ops and `archivePath` |

Low-level commands (`update-slide`, `insert-slide`, `delete-slide`) exist for debugging and partial ops. Every mutator that changes an existing `.key` archives first and requires `--confirm`.

Conservative delete policy: `sync` never removes deck slides that are missing from markdown unless you pass `--allow-delete`. A short markdown cannot wipe a deck by accident.

## Archive safety

Follow `standards/conventions.md` § Archives exactly. This tool does not invent a second scheme.

| Rule | Value |
|------|--------|
| Where | `zArchive/` in the **same directory as the `.key`**, unless `--archive-dir` names another absolute directory that still uses the same naming rules. Create `zArchive/` if missing |
| When | Before every successful mutator on an existing `.key`: `sync` (patch mode), `update-slide`, `insert-slide`, `delete-slide` |
| Name | `YY-MM-DD Vn - <original filename and extension unchanged>` |
| Version | Starts at **1**, **resets each day**; scan that day's names for the next free `Vn` |
| Example | Deck `Quarter Review.key` on 2026-08-05 → `26-08-05 V1 - Quarter Review.key`, then `26-08-05 V2 - Quarter Review.key` |
| Result | Every mutator JSON includes `archivePath` (absolute) when an existing deck was mutated |
| Failure | Archive copy fails → **do not** mutate the deck |

Do not delete or overwrite prior archive copies. Do not use `zVersions/` or timestamp-only filenames.

## Quick Start

```bash
node scripts/render.js help
node scripts/render.js check
```

**Edit an existing deck from markdown (usual path):**

```bash
node scripts/render.js sync \
  --md /path/to/slides.md \
  --deck /path/to/deck.key \
  --brand /path/to/brand.yaml \
  --confirm
```

**Greenfield JSON build:**

```bash
node scripts/render.js build --spec /path/to/deck.json --brand /path/to/brand.yaml --out /path/to/deck.key
node scripts/render.js snapshot --deck /path/to/deck.key
node scripts/render.js export --deck /path/to/deck.key --format pdf
```

## Dependencies

Keynote is scripted through JXA, so this tool runs a second interpreter beyond Node and declares it here per the Script Contract's Runtimes and System dependencies clauses. Each is checked after help parsing and only on a command that reaches Keynote; a missing one fails the run by naming the dependency and its check command. Install steps are never written here.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| osascript (JXA) | Every command except `help` and `check` | `osascript -l JavaScript -e 'JSON.stringify(true)'` succeeds |
| Keynote | Every command except `help` and `check` | `/Applications/Keynote.app` or `/Applications/Keynote Creator Studio.app` exists |

macOS must also permit the calling terminal to control Keynote. `themes` proves it; Troubleshooting names the failure.

## Markdown deck format

Full contract: `deck-markdown.md`. Summary:

```markdown
## Slide 1. Title here

layout: bullets
texts.subtitle: Lead-in ending in a colon:

On slide:

- Bullet one
- Bullet two

Presenter notes:

What you say.
```

| Feature | Support |
|---------|---------|
| Slide order | File order of `## Slide N. Title` (or `## Title`) sections |
| Title | From the heading; optional restatement as first on-slide line |
| Body | Lines under `On slide:`; list markers stripped; newlines → Keynote body lines |
| Notes | Under `Presenter notes:` |
| Layout | Optional `layout: intent-or-master` (used on **insert** and greenfield build; **not** re-applied on in-place update, so masters and custom chrome stay) |
| Images | `image: path` or `**Visual (full slide):** path`; relative to the markdown file. On update, named images **replace** existing images on that slide then add; documented here so agents do not expect dual stacks |
| Secondary text | `texts.<key>:` or brand-mapped semantic keys after resolve |

**The numbered-slide course shape** (`## Slide N. Title` with `On slide:` / `Presenter notes:` / visual labels) parses without a permanent one-off fork. Prefer light markdown edits over tool special-cases when mapping is incomplete.

### Diff rules

- Match primarily by **order**; title mismatch at the same index is reported, not blocking.
- Same position, content changed → update in place (V1).
- Markdown has extra slides → insert after current end (V2).
- Deck has extra slides → keep unless `--allow-delete`.
- Ops list is in the result JSON before/as applied; human- and agent-readable.

### Reorder

Keynote scripting exposes `move slide` for clean reorder when it works (`moveSlide` in the library). Prefer that over delete+insert so custom shapes survive. Delete+insert is the documented fallback when move fails; it does **not** preserve custom shapes on the moved slide. `sync` does not auto-reorder by title; structure changes are insert/delete by order.

## Inputs (JSON build)

Two files for greenfield `build`, each named by absolute path:

- **Deck spec** (`--spec`): JSON with `slides` only (content).
- **Brand file** (`--brand`): theme, layout intents, text indices, optional logo.

## Deck spec

```json
{
  "slides": [
    {
      "layout": "bullets",
      "title": "...",
      "body": "one line, or an array of lines",
      "texts": { "subtitle": "..." },
      "notes": "presenter notes",
      "images": [{ "path": "relative-or-absolute.png", "x": 100, "y": 100, "width": 400 }]
    }
  ]
}
```

| Field | Holds |
|-------|-------|
| `layout` | Brand intent or master name; omitted → theme default |
| `title`, `body` | Master placeholders; array `body` → one line per item |
| `texts` | Semantic keys (brand) or text item indices |
| `notes` | Presenter notes |
| `images` | Points on the theme canvas; relative paths resolve against the spec directory |

## Brand file

```yaml
theme: <installed theme name>
layouts:
  <intent>: <master layout name>
texts:
  <master layout name>:
    <semantic key>: <text item index>
logo:
  path: <absolute or relative to this file>
  x: 880
  y: 28
  width: 110
  slides: all | first | [1, 3]
```

Only `theme` is required when no `--theme` is passed. Misspelled keys are refused.

## Usage

| Command | Purpose | Reaches Keynote |
|---------|---------|-----------------|
| `sync --md … --deck …` | **Primary:** markdown → archive → diff → patch (or build) | Yes |
| `update-slide --deck … --slide n` | V1 in-place content update | Yes |
| `insert-slide --deck … --after n` | V2 insert after n (0 = front) | Yes |
| `delete-slide --deck … --slide n` | V2 delete; renumbers | Yes |
| `help` | Usage | No |
| `check` | osascript + Keynote presence | No |
| `themes` | Installed theme names | Yes |
| `layouts --theme "…"` | Master names for one theme | Yes |
| `build --spec …` | Greenfield JSON → `.key` | Yes |
| `inspect --deck … --slide n` | One slide structure | Yes |
| `snapshot --deck …` | One image per slide | Yes |
| `export --deck … --format …` | pdf / pptx / html / images | Yes |

### Options

| Option | Effect |
|--------|--------|
| `--md <path>` | Markdown SSOT, absolute (`sync`) |
| `--spec <path>` | Deck JSON, absolute (`build`) |
| `--deck <path>` | `.key` path, absolute |
| `--brand <path>` | Brand YAML, absolute |
| `--theme "name"` | Theme override |
| `--out <path>` | Output path (build/export/snapshot; on `sync`, optional snapshot dir) |
| `--slide <n>` | Slide number from 1 |
| `--after <n>` | Insert after n; 0 = before first |
| `--layout <name>` | Master or brand intent |
| `--title`, `--body`, `--notes` | Content fields for mutators; `--body` may be a JSON string array |
| `--texts <json>` | JSON object of keys/indices → text |
| `--image <path>` | Absolute image; on update, replaces existing images on that slide |
| `--allow-delete` | `sync` may delete deck-only slides |
| `--archive-dir <path>` | Override archive directory (naming rules unchanged) |
| `--confirm` | Required for mutators on existing `.key`; also replaces build/export outputs |
| `--format` | `pdf`, `pptx`, `html`, `images` |
| `--help` | Usage |

### Example mutators

```bash
node scripts/render.js update-slide --deck /abs/deck.key --slide 2 \
  --title "New title" --body '["Line one","Line two"]' --notes "Say this" --confirm

node scripts/render.js insert-slide --deck /abs/deck.key --after 2 \
  --layout bullets --brand /abs/brand.yaml --title "Inserted" --body "Body" --confirm

node scripts/render.js delete-slide --deck /abs/deck.key --slide 5 --confirm
```

## Script Contract

The scripts follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. What a run writes, and where, is in `tools/AGENTS.md`. The `zArchive/` copy taken before every in-place edit has a row of its own there, because its default path is derived from `--deck` rather than named by the caller.

Replacing an existing **output file** from `build` / `snapshot` / `export` is opt-in via `--confirm`. Mutating an existing **deck** is also opt-in via `--confirm`, and always preceded by a `zArchive/` copy when the deck already exists.

Only a brand file needs an installed package; if this copy has not yet authorised an install, the first branded command reports what it would install and stops, and `--install` on that run is the answer. Later tools in this copy install without asking.

## Output

Each successful command prints one JSON object to stdout and exits 0.

| Command | Notable fields |
|---------|----------------|
| `sync` (patch) | `mode: "patch"`, `archivePath`, `ops`, `summary`, `applied`, `verify`, `warnings`, optional `snapshot` |
| `sync` (build) | `mode: "build"`, `archivePath: null`, `outputPath` via deck path, `slides`, `warnings` |
| `sync` (noop) | `mode: "noop"`, `archivePath: null` when nothing to apply |
| `update-slide` / `insert-slide` / `delete-slide` | `archivePath`, op result, `warnings` where applicable |
| `build` | `name`, `theme`, `slideCount`, `outputPath`, `slides`, `warnings` |
| `inspect` | layout, placeholders, text items, notes |
| `snapshot` | `slideCount`, `outDir` |
| `export` | `exported`, `format`, `outPath` |
| `check` | runtime booleans |

Every entry in `warnings` is a defect: text asked for that is not on the slide (missing or hidden placeholder). Fix the SSOT or brand, not by hand-editing what the next build would replace, except that **in-place update** is designed so the next sync does **not** replace untouched chrome.

Failure: empty stdout, cause and fix on stderr, exit 1.

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails, and a path that is relative or inside this tool, are in `tools/RUNNING.md`; the rows below are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `missing osascript` / `missing Keynote` | Wrong host or Keynote not installed | Dependencies section; install steps live nowhere in this tool |
| `Keynote automation is not permitted for this terminal` | macOS Automation denial | System Settings → Privacy & Security → Automation |
| `changes an existing deck. Pass --confirm` | Mutator without confirm | Review ops / intent, pass `--confirm` |
| `archive copy failed` | Could not write `zArchive/` | Fix permissions/path; deck was not modified |
| `deck has a slide not in markdown` (`keep-extra`) | Markdown shorter than deck | Intentional keep, or pass `--allow-delete` after review |
| `is not a valid deck spec` / brand | Validation failed | Fix listed lines |
| `already exists at <path>` | Output occupied without `--confirm` | `--confirm` or another `--out` |
| `--out resolves inside this tool directory` | Write into the tool | Point at a work directory in the owning root |
| `this master hides the title placeholder` (warning) | Master hides placeholder | Route through `texts` + brand index |
| `Error: unknown option` / `unknown command` | Typo | See `help` |

## Success

- `help` and `check` work with nothing installed; `check` launches nothing.
- `build` still works for greenfield JSON; existing inspect/snapshot/export unchanged in contract.
- `sync` on an existing deck does not rebuild from scratch; unchanged slides keep custom shapes.
- Every successful mutation of an existing `.key` leaves a correctly named copy in sibling `zArchive/` before the change, and returns `archivePath`.
- Default sync never deletes slides only present in the deck.
- Diff and applied ops are visible in the JSON result.
