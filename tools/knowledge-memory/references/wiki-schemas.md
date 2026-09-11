# Wiki shapes for the knowledge memory build

The one home of the wiki file shapes. `backends.md` names the backend. `schemas.md` names the databased store shapes and does not apply here. The wiki probe, the tool's `wiki-lint`, the onboarding and curation skills, and the wiki templates cite this file; none restates a shape.

**Version:** 0.1.0, 2026-09-09

All paths below are relative to `memory/knowledge/<set>/`. Dates are `YYYY-MM-DD`. Links inside wiki files are relative to the current file. Links in conversation output are project-root-relative from the owning root.

## 1. Corpus file

`corpus/<topic>/YYYY-MM-DD-descriptive-slug.md`, or without the date prefix when published date is unknown. Immutable after write. A binary original lives under `corpus/originals/` and is not compiled from; its text conversion is the corpus file, and the conversion's header names the original.

```markdown
# <source title>

- Source: <url or path or "supplied">
- Collected: <YYYY-MM-DD>
- Published: <YYYY-MM-DD or Unknown>
- Register: <one of the four in standards/conventions.md>
- Supplied by: <who>

<original text, formatting noise cleaned, opinions not rewritten>
```

## 2. Wiki article

`wiki/<topic>/<article>.md`. One level of topic directory only. File name is the concept, kebab-case, not the corpus file name.

```markdown
# <article title>

- Updated: <YYYY-MM-DD>
- Sources: <author or publication, date; semicolon-separated>
- Raw: [label](../../corpus/<topic>/<file>.md); <more>

<body>

## See Also

- [related](../othertopic/page.md)
```

Rules.

1. Every number, date, and direct quote in the body is locatable verbatim in a file named by Raw. Locate before write. If it cannot be located, drop the precise form or state the claim without that precision.
2. Derived values show their components so each component is findable in corpus.
3. A conflict with another article or a later source is a Status block, never a silent rewrite:

```markdown
**Status: Disputed.** <what disagrees, and the other article or corpus file>.
**Status: Outdated** (<YYYY-MM-DD>). <what replaced it>.
```

4. Archive pages (a query answer filed back) have no Raw field, cite wiki articles in Sources, and are never cascade-updated.

## 3. Index

`wiki/index.md`. One row per article, grouped by topic. Updated is the article's knowledge-content date, not the filesystem timestamp.

```markdown
# Knowledge Base Index

## <topic>
<one-line description of the topic>

- [Article title](<topic>/article.md): <one-line summary>. Updated: <YYYY-MM-DD>
```

## 4. Log

`wiki/log.md`. Append-only. Each entry starts with `## [YYYY-MM-DD] ` so `grep "^## \[" wiki/log.md` is the timeline.

```markdown
# Wiki Log

## [YYYY-MM-DD] ingest | <primary article title>
- Disposition: <New; Update; Disputed; No material>
- Raw: corpus/<topic>/<file>.md
- Updated: <cascade-updated article title>
```

A no-material ingest logs and stops; it does not add an index row. Lint appends `## [YYYY-MM-DD] lint | <N> issues found, <M> auto-fixed`.
