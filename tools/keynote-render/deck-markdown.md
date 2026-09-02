# Markdown deck format (keynote-render)

Source of truth for slide content when using `sync`. The JSON deck spec (`build --spec`) remains valid for greenfield and machine-generated content; markdown is the agent-facing SSOT for iterative edit.

This file is the format contract beside TOOL.md. TOOL.md describes the workstream that consumes it.

## Canonical shape

```markdown
# Optional deck title

## Slide 1. Cover title

layout: title

On slide:

Cover title

Subtitle or deck tagline

Presenter notes:

What the presenter says on this slide.

## Slide 2. Body slide

layout: bullets
texts.subtitle: Lead-in line ending in a colon:

On slide:

- First bullet
- Second bullet

Closing rule line as plain prose after the list.

Presenter notes:

1. Takeaway: ...
2. ...

## Slide 3. Image-led

layout: photo
image: assets/diagram.png

On slide:

Short label over or under the visual

Presenter notes:

...
```

### Headings

- `## Slide N. Title` or `## Slide N: Title` — preferred; `N` is documentary (order is file order).
- `## Title` alone is also a slide boundary when it is not a reserved non-slide heading.

### Optional per-slide keys (before `On slide:`)

| Key | Meaning |
|-----|---------|
| `layout: <intent-or-master>` | Brand layout intent, or exact master name |
| `image: <path>` | Image path, absolute or relative to the markdown file |
| `texts.<key>: <text>` | Secondary text by brand semantic key or numeric index |

### Blocks

| Label | Holds |
|-------|-------|
| `On slide:` / `On-slide:` | Visible slide copy |
| `Presenter notes:` / `Notes:` | Presenter notes (not on the slide image) |
| `**Visual (full slide):** path` | Image path (course-shape style) |

### On-slide parsing

- A first line that restates the heading title is treated as the title, not a bullet.
- A short lead-in line ending in `:` before any list becomes `texts.subtitle` when no explicit `texts.subtitle` is set.
- List markers (`-`, `*`, `1.`) are stripped; each item becomes one body line. Keynote bullet masters turn newlines into bullets.
- Non-list prose lines stay as body lines (closing rules, short statements).
- Inline `**bold**` / `*italic*` / `` `code` `` markers are stripped for Keynote placeholders.

## The numbered-slide course adapter

A course deck whose slides are numbered headings uses this shape:

- `## Slide N. Title`
- `**Purpose:** ...` (ignored for render; authoring only)
- `On slide:` / `Presenter notes:`
- Optional `**Visual (full slide):** \`assets/...\``
- Rendering conventions in such a file: lead-in colon lines → subtitle; closing rules → body last lines; true list items only as bullets

No separate permanent parser fork: the rules above accept that shape. Prefer light edits to the course markdown over tool special-cases when something does not map (for example add `layout: bullets` when a master must be forced on insert).

## Diff policy (sync)

- Match primarily by **order** (markdown slide 1 ↔ deck slide 1).
- Title mismatch at the same index is reported but does not block an in-place update.
- Same position, content changed → `update` (V1). Custom shapes and master stay.
- Markdown longer than deck → `insert` (V2) after the last existing slide, in order.
- Deck longer than markdown → `keep-extra` by default; `delete` only with `--allow-delete`.
- Result JSON lists every planned op and every applied op; mutators include `archivePath`.
