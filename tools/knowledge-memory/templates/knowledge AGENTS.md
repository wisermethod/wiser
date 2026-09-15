# Knowledge

Knowledge sets live at `memory/knowledge/<set>/` in this owning root. Load the composed Wiser root's `tools/knowledge-memory/references/backends.md` for the backend contract. Provides does not bind sets. `experts/Memory Expert/` judges them; its three knowledge skills create, curate, and recall them.

Wiki compile and databased and graph extraction use the session's model after `session_permission` records who allowed this session to process the material and when. Storage is local for wiki, databased and graph; extraction is as local as the harness. Graph ingest and recall execute under `experts/Memory Expert/graph.md`, which is the contract to load rather than a stop; its prerequisite failures are named there. Hosted stops on `experts/Memory Expert/hosted.md` before a source is read.

**Store:** `memory/knowledge/store/databased.sqlite`, databased only, one owning root and every table scoped by dataset. A graph set instead has one `graph.lbdb` file per dataset at the path its caller named in this root; on `retrieval: embedding` that file also holds the corpus cut into searchable passages and is roughly twice the size without them. Keep the corpus and human decisions as the recovery material; the compiled layer is rebuilt by Knowledge Curation.

## Sets

| Set | Dataset | Backend | Kind | Close intensity | Owner | Canon confirmed | Last ingest |
|-----|---------|---------|------|-----------------|-------|----------------|-------------|

One note per set may follow this table, headed **`<set>` open items**, and it is part of that set's record rather than a comment on it. It is where what the row is told to carry but the table has no column for goes: the close state and its named gaps from `skills/Knowledge Set Onboarding/` Phase 8, and the open items from `skills/Knowledge Curation/` Step 7. Write what a reader needs in order not to misread a `Not available`: what the corpus does and does not hold, with counts and paths.

## What a set holds

Paths below are relative to `memory/knowledge/<set>/`. Shapes are in the tool's `references/schemas.md` and `references/wiki-schemas.md`.

| Path | Holds | Backend |
|------|-------|---------|
| `set.yaml` | Recipe, session permission, close intensity, confirmation and policies | All |
| `corpus/` | Immutable sources with provenance headers | All; graph reads it at ingest and on `retrieval: embedding` stores it cut into passages; hosted reads none |
| `corpus/originals/` | Binary originals; `originals/` is never compiled from | All, when conversion was needed |
| `wiki/` | Kept pages, index and append-only log | Wiki |
| `extraction/` | Chunk manifests, resumable extraction files and hash ledger | Databased and graph |
| `canon.md` | Human-confirmed entries with located quotes | Databased |
| `review/` | New findings, stale candidates, merge proposals, conflicts, decided items and changelog | Databased |
| `reports/` | Run records, lint findings, ingest reports and healthchecks | Wiki, databased and graph |
| `eval.questions.yaml` | Databased retrieval questions; wiki evaluation is a human read of cited pages | Databased |
| `pack/` | An optional set-owned extraction pack | Databased |

## Decisions

Only applying a human decision sets Canonical: a decided item or a confirmed canon. Replay carries these decisions across databased rebuilds. An unconfirmed databased set's answers carry `Unverified: requires confirmation`. Wiki conflicts and replacements keep Status blocks; archive answers are never cascade-updated. Recall stays inside one set.
