---
name: knowledge-memory
type: tool
category: knowledge
description: Lints local knowledge wikis and builds, queries, reviews, and rebuilds a dataset-scoped databased store (SQLite FTS5) from session-extracted knowledge with located provenance
version: 0.2.2
gaps:
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
  - graph-unspecified, so local graph query, embed and ingest stop before a source is read
  - hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
---

# knowledge-memory

## Context

Use through `skills/Knowledge Set Onboarding/`, `skills/Knowledge Curation/`, and `skills/Knowledge Recall/` for deterministic wiki lint or databased operations. Read `tools/knowledge-memory/references/backends.md` for the backend contract. Storage is local for wiki, databased, and (later) graph; extraction is as local as the harness. The session compiles or extracts; no script calls a model.

Graph stops on `experts/Memory Expert/graph.md` before a source is read. A map of existing files belongs to `skills/Knowledge Map/`. Hosted is a documented stop on `experts/Memory Expert/hosted.md`, never a command. Apply the constitution's Behavioral Core for the three absences and honest stops.

## Inputs and dependencies

Paths are absolute. `--set` names `memory/knowledge/<set>/`; `--store` names a SQLite file, conventionally `<owning-root>/memory/knowledge/store/databased.sqlite`. Both are refused inside this tool, including aliases. Wiki commands take no store. `templates/set.yaml` lists the recipe keys; unknown keys are refused by name. Session permission is recorded before sources are read.

Databased work requires Python 3.11+; databased store commands also require SQLite FTS5. `python3.11 scripts/knowledge_memory.py check` reports the interpreter and whether `CREATE VIRTUAL TABLE t USING fts5(x)` works. Wiki needs neither Python 3.11 nor FTS5: the lint script runs with Python 3.9+ and its standard library. Reading and compiling wiki pages needs no installation.

## Usage

Run `python3.11 scripts/knowledge_memory.py` followed by one row below. Help also works on Python 3.9.

| Command | Behavior |
|---------|----------|
| `help` or `--help` | Usage, exit 0 before the version check |
| `check` | Interpreter, `databased_python_ok`, and FTS5 result; nothing installed |
| `bootstrap --store FILE` | Create parents and an empty SQLite schema with FTS5 |
| `chunk --set DIR` | Chunk included corpus files into `extraction/<stem>.chunks.json`; report count |
| `chunk --source FILE --out DIR --dataset NAME` | Chunk one supplied text source; optional `--max-chars`, default 6000 |
| `ingest --set DIR --store FILE --extraction FILE` | Validate then load one extraction; report sources added, skipped by hash, nodes ingested, rejection reasons and `review_due` |
| `recall --set DIR --store FILE --query TEXT` | Databased-only retrieval items, never an answer; optional `--top-k` (15), `--as-of YYYY-MM-DD` (recorded, not filtered) |
| `wiki-lint --set DIR` | Check index, links and high-signal grounding; append lint log |
| `review-pass --set DIR --store FILE` | Write new findings, stale candidates, merge proposals and conflicts with filled Subject blocks |
| `promote --set DIR --store FILE --decided FILE` | Apply only `status: decided` items under `review/decided/`; use `--from-canon` instead to write and apply confirmed canon entries, or `--replay` for applied items |
| `mark-stale --set DIR --store FILE --id NODE` | Set Stale and `valid_to`, no deletion; optional `--valid-to YYYY-MM-DD`, default today's date |
| `healthcheck --set DIR --store FILE` | Counts by type and status, facts missing provenance, backlog ages, last ingest; `--eval` scores the caller's `eval.questions.yaml` as retrieval checks only and writes each row's `question` and `expected` into the report. Filling that file is the skill, per `references/backends.md` Databased eval. As-of rows fail by the declared gap, so `eval.passed` is false while they exist; that is not a reason to drop them |
| `forget --set DIR --store FILE --confirm` | Exactly one of `--memory-only`, `--dataset`, `--data-id ID`; without confirmation, describe and stop without writes |

The forget modes change only this dataset's store rows. Memory-only keeps the dataset registration; dataset removes it too. Data-id names one source by corpus path or full source hash. Every mode keeps the corpus, extraction files and human decisions. Wiki lint also accepts a corpus/wiki fixture without a recipe; when a recipe exists it must name wiki and record session permission.

## Data contract

Load `references/schemas.md` for databased manifests, extraction JSON, retrieval items and normalized identity. Chunk accepts UTF-8 `.md` and `.txt` only. Binaries are refused by name; PDFs are converted before onboarding, with originals under `corpus/originals/`. Text is verbatim, headings bound chunks, long spans split at paragraph then sentence boundaries; an oversized sentence splits at the cap. Markdown frontmatter is excluded as metadata. Source stems must be unique within a set.

The skill appends source context and canonical names to the pack prompt and writes one extraction entry per chunk. The tool validates pack, source and chunk hashes, then quotes and node fields in the schema's order. Rejected nodes are counted with their reasons; accepted nodes load as Candidates. Reuse requires four-part identity: dataset, source hash, chunk hash and pack hash. The ledger under `extraction/` skips completed unchanged sources; incomplete or rejected extraction can be corrected and retried. No cost estimate flag is needed because ingest makes no model call.

`recall` returns the items object in `references/schemas.md` section 3, with no `answer` key. Lexical terms search FTS5; alias hits resolve to their supported target at the lexical rank, then outgoing typed links add one hop. Every query and hop checks dataset isolation. The skill composes from those items alone.

Load `references/wiki-schemas.md` for wiki shapes. Compile establishes the grounding invariant: every number, date and direct quote is locatable in linked corpus. Lint locates quoted strings and arabic numerals after whitespace collapse. It fixes only missing index entries and links with exactly one safe match; all other findings remain in its report. `wiki/log.md` is append-only. Lint is a deterministic check, not a judgment of whether a paraphrase is faithful.

Human decisions are portable. `promote` applies a filled Decision block; replay identifies its Subject by `(dataset, kind, normalized_name)`. Alias and merge decisions retain the source node as Alias and record a same-kind target by normalized name. Canonical comes only from a human decision. `--from-canon` reads the canonical tables in Knowledge Set Onboarding, requires located quotes and ingested subjects, and takes the reviewer and date from `canon_confirmed`. Ontology edits stay pending for the human; they do not silently change the pack.

## Script Contract

The script follows `system/templates/Script Contract.md`, the pointer to `standards/script-contract.md`. It uses only the Python standard library, no package cache, no dotenv and no key. `--install` is refused by name: this tool installs nothing. Unknown, repeated and inapplicable flags fail before work. Every caller-named path is screened. The write inventory is `tools/AGENTS.md`.

Success prints one JSON object and exits 0; help prints usage. Failures print only to stderr and exit 1. Rejected nodes, lint findings and failed eval rows are reported results, not command failures. No result promises a composed answer or a model quality judgment.

## Troubleshooting

| Message | Next action |
|---------|-------------|
| `this script needs Python 3.11 or newer` | Run databased work with a suitable interpreter; use `check` to inspect it |
| `databased work needs SQLite FTS5. Check with knowledge_memory.py check using a Python build with FTS5.` | Use a Python build whose `check` reports FTS5 |
| `unknown recipe key:` | Correct the named key against `templates/set.yaml` |
| `owner and session_permission must name who permitted this session to process the material and when.` | Record the session's actual permission before processing sources |
| `pack_version mismatch; re-extract with the current pack.` | Re-extract with the current pack |
| `source_hash mismatch with source on disk.` | Re-chunk the source on disk and re-extract changed chunks |
| `--decided must sit under review/decided/.` | Record the human decision and file the item there |
| `decision block incomplete:` | Have the reviewer supply the missing field |
| `graph-unspecified: read experts/Memory Expert/graph.md; stop before reading sources.` | Read the graph stub; produce no substitute result |
| `hosted-unspecified: read experts/Memory Expert/hosted.md; stop before reading sources.` | Read the hosted stub; produce no substitute result |
| `unknown option "--install"; this tool installs nothing.` | Remove `--install`; this tool needs no installation |
| `unknown option "--env"; this tool installs nothing.` | Remove `--env`; this tool takes no environment file |
