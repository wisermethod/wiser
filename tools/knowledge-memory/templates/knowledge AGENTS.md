# Knowledge

Knowledge sets live at `memory/knowledge/<set>/` in this owning root. Load the composed Wiser root's `tools/knowledge-memory/references/backends.md` for the backend contract. Provides does not bind sets. `experts/Memory Expert/` judges them; its three knowledge skills create, curate, and recall them.

Wiki compile and databased extraction use the session's model after `session_permission` records who allowed this session to process the material and when. Storage is local for wiki, databased, and (later) graph; extraction is as local as the harness. Graph stops on `experts/Memory Expert/graph.md`; hosted stops on `experts/Memory Expert/hosted.md` before a source is read.

**Store:** `memory/knowledge/store/databased.sqlite`, databased only, one owning root and every table scoped by dataset. Keep the corpus and human decisions as the recovery material; the databased is rebuilt by Knowledge Curation.

## Sets

| Set | Dataset | Backend | Kind | Close intensity | Owner | Canon confirmed | Last ingest |
|-----|---------|---------|------|-----------------|-------|----------------|-------------|

## What a set holds

Paths below are relative to `memory/knowledge/<set>/`. Shapes are in the tool's `references/schemas.md` and `references/wiki-schemas.md`.

| Path | Holds | Backend |
|------|-------|---------|
| `set.yaml` | Recipe, session permission, close intensity, confirmation and policies | All |
| `corpus/` | Immutable sources with provenance headers | All; graph and hosted read none yet |
| `corpus/originals/` | Binary originals; `originals/` is never compiled from | All, when conversion was needed |
| `wiki/` | Kept pages, index and append-only log | Wiki |
| `extraction/` | Chunk manifests, resumable extraction files and hash ledger | Databased |
| `canon.md` | Human-confirmed entries with located quotes | Databased |
| `review/` | New findings, stale candidates, merge proposals, conflicts, decided items and changelog | Databased |
| `reports/` | Run records, lint findings, ingest reports and healthchecks | Wiki and databased |
| `eval.questions.yaml` | Databased retrieval questions; wiki evaluation is a human read of cited pages | Databased |
| `pack/` | An optional set-owned extraction pack | Databased |

## Decisions

Only applying a human decision sets Canonical: a decided item or a confirmed canon. Replay carries these decisions across databased rebuilds. An unconfirmed databased set's answers carry `Unverified: requires confirmation`. Wiki conflicts and replacements keep Status blocks; archive answers are never cascade-updated. Recall stays inside one set.
