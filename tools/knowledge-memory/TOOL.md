---
name: knowledge-memory
type: tool
category: knowledge
description: Lints local knowledge wikis, builds and queries a dataset-scoped databased store (SQLite FTS5), and ingests and recalls a local LadybugDB graph, all from session-extracted knowledge with located provenance
version: 0.3.0
gaps:
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
  - hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
---

# knowledge-memory

## Context

Use through `skills/Knowledge Set Onboarding/`, `skills/Knowledge Curation/`, and `skills/Knowledge Recall/` for deterministic wiki lint, databased operations, or graph ingest and recall. Read `tools/knowledge-memory/references/backends.md` for the backend contract. Storage is local for wiki, databased, and graph; extraction is as local as the harness. The session compiles or extracts; graph recall may run a local embedding model, never a chat completion.

Graph follows `experts/Memory Expert/graph.md`, with prerequisite stops before source or store access. A map of existing files belongs to `skills/Knowledge Map/`. Hosted is a documented stop on `experts/Memory Expert/hosted.md`, never a command. Apply the constitution's Behavioral Core for the three absences and honest stops.

## Dependencies

Paths are absolute. `--set` names `memory/knowledge/<set>/`; `--store` names a SQLite file, conventionally `<owning-root>/memory/knowledge/store/databased.sqlite`, or one dataset-owned `graph.lbdb` file for graph. Both are refused inside this tool, including aliases. Wiki commands take no store. `templates/set.yaml` lists the recipe keys; unknown keys are refused by name. Session permission is recorded before sources are read.

Presence check: `python3.11 --version` for databased and graph work; `python3 --version` for wiki. Missing system runtimes follow `standards/script-contract.md` System dependencies. Databased work requires Python 3.11+; databased store commands also require SQLite FTS5. `python3.11 scripts/knowledge_memory.py check` reports the interpreter and whether `CREATE VIRTUAL TABLE t USING fts5(x)` works. Wiki needs neither Python 3.11 nor FTS5: the lint script runs with Python 3.9+ and its standard library. Reading and compiling wiki pages needs no installation. Wiki, databased and chunk commands use the standard library and never require the graph venv. Graph ingest and recall use Ladybug 0.20.4 in this tool's `.venv`; embedding recall also uses onnxruntime 1.30.0 and tokenizers 0.23.2. Tokenizers installs with `--no-deps`; its unused huggingface-hub dependency is intentionally absent.

## Usage

Run `python3.11 scripts/knowledge_memory.py` followed by one row below. Help also works on Python 3.9.

| Command | Behavior |
|---------|----------|
| `help` or `--help` | Usage, exit 0 before the version check |
| `check [--install]` | Interpreter, version, `databased_python_ok`, `fts5`, `graph_packages` presence by package and `installed` (all three present). Without `--install`, reports only; with it, installs missing graph packages and finishes |
| `bootstrap --store FILE [--set DIR]` | Databased only; create parents and an empty SQLite schema with FTS5; an optional recipe must name databased |
| `chunk --set DIR` | Chunk included corpus files into `extraction/<stem>.chunks.json`; report count |
| `chunk --source FILE --out DIR --dataset NAME` | Chunk one supplied text source; optional `--max-chars`, default 6000 |
| `ingest --set DIR --store FILE --extraction FILE` | Dispatch by backend. Databased reports sources added, hash skips, nodes, rejections and `review_due`; graph creates its schema and reports Candidate nodes, edges, name skips, unsupported types and rejections |
| `recall --set DIR --store FILE --query TEXT` | Databased lexical or graph MATCH/embedding items, never an answer; optional `--top-k` (15), `--as-of YYYY-MM-DD` (recorded, not filtered) |
| `wiki-lint --set DIR` | Check index, links and high-signal grounding; append lint log |
| `review-pass --set DIR --store FILE` | Write new findings, stale candidates, merge proposals and conflicts with filled Subject blocks |
| `promote --set DIR --store FILE --decided FILE` | Apply only `status: decided` items under `review/decided/`; use `--from-canon` instead to write and apply confirmed canon entries, or `--replay` for applied items |
| `mark-stale --set DIR --store FILE --id NODE` | Set Stale and `valid_to`, no deletion; optional `--valid-to YYYY-MM-DD`, default today's date |
| `healthcheck --set DIR --store FILE` | Counts by type and status, facts missing provenance, backlog ages, last ingest; `--eval` scores the caller's `eval.questions.yaml` as retrieval checks only and writes each row's `question` and `expected` into the report. Filling that file is the skill, per `references/backends.md` Databased eval. As-of rows fail by the declared gap, so `eval.passed` is false while they exist; that is not a reason to drop them |
| `forget --set DIR --store FILE --confirm` | Exactly one of `--memory-only`, `--dataset`, `--data-id ID`; without confirmation, describe and stop without writes |

All flags above are closed sets. Every command accepts the bare `--install` flag; only graph ingest, graph recall and `check --install` use it. `bootstrap`, `review-pass`, `promote`, `mark-stale`, `healthcheck` and `forget` remain databased-only. Graph recipes on them fail before sources or store creation.

The forget modes change only this dataset's store rows. Memory-only keeps the dataset registration; dataset removes it too. Data-id names one source by corpus path or full source hash. Every mode keeps the corpus, extraction files and human decisions. Wiki lint also accepts a corpus/wiki fixture without a recipe; when a recipe exists it must name wiki and record session permission.

## Data contract

Load `references/schemas.md` for databased manifests, extraction JSON, retrieval items and normalized identity. Chunk accepts UTF-8 `.md` and `.txt` only. Binaries are refused by name; PDFs are converted before onboarding, with originals under `corpus/originals/`. Text is verbatim, headings bound chunks, long spans split at paragraph then sentence boundaries; an oversized sentence splits at the cap. Markdown frontmatter is excluded as metadata. Source stems must be unique within a set.

For databased, the skill appends source context and canonical names to the pack prompt and writes one extraction entry per chunk. The tool validates pack, source and chunk hashes, then quotes and node fields in the schema's order. Rejected nodes are counted with their reasons; accepted nodes load as Candidates. Reuse requires four-part identity: dataset, source hash, chunk hash and pack hash. The ledger under `extraction/` skips completed unchanged sources; incomplete or rejected extraction can be corrected and retried. No cost estimate flag is needed because ingest makes no model call.

Databased `recall` returns the items object in `references/schemas.md` section 3, with no `answer` key. Lexical terms search FTS5; alias hits resolve to their supported target at the lexical rank, then outgoing typed links add one hop. Every query and hop checks dataset isolation. The skill composes from those items alone.

Load `references/wiki-schemas.md` for wiki shapes. Compile establishes the grounding invariant: every number, date and direct quote is locatable in linked corpus. Lint locates quoted strings and arabic numerals after whitespace collapse. It fixes only missing index entries and links with exactly one safe match; all other findings remain in its report. `wiki/log.md` is append-only. Lint is a deterministic check, not a judgment of whether a paraphrase is faithful.

Databased human decisions are portable. `promote` applies a filled Decision block; replay identifies its Subject by `(dataset, kind, normalized_name)`. Alias and merge decisions retain the source node as Alias and record a same-kind target by normalized name. Canonical comes only from a human decision. `--from-canon` reads the canonical tables in Knowledge Set Onboarding, requires located quotes and ingested subjects, and takes the reviewer and date from `canon_confirmed`. Ontology edits stay pending for the human; they do not silently change the pack.

## Graph data and retrieval

Graph uses the same chunk manifests, extraction schema and quote-location validator. `chunk --set DIR` works without packages. Graph ingest accepts Idea and Entity nodes and all six declared relation types, from Idea to Idea or Entity. Nodes have a primary key of `name`; nodes and relations carry located `quote`, `source_path` and Candidate status regardless of supplied node status. Entity aliases are retained. Facts, decisions and open questions are counted as skipped with reason `unsupported graph node table`. Unresolved or ambiguous endpoints are counted. No quote, no node.

Ingest creates a native LadybugDB file at `--store`, with schema and one extraction in a transaction. Re-ingest skips existing primary keys and identical edges; it reports those skips and never overwrites canon or corpus. It does not read a databased store. Two datasets require two files. Graph has no promote, replay or store-removal command; a named human confirms Pro canon in the set's records.

Graph recall treats `--query` beginning with MATCH, case-insensitively, as Cypher even with `retrieval: embedding`. It opens that file read-only, refuses writes, comments, separators and NUL, and prepares before executing. Return a node, or `name`, `quote`, `source_path` in that order; other result shapes fail. Otherwise `retrieval: embedding` computes local CPU embeddings of names, definitions or summaries, quotes and aliases, with attention-mask mean pooling, L2 normalization and cosine ranking. Default `--top-k` is 15. `retrieval: lexical` remains the default and is not a graph text-search fallback. Databased rejects `retrieval: embedding`.

Graph items contain `name`, `quote`, `source_path`; embedding items also contain `score` and `rank`. No `answer` field is returned. `--as-of` is recorded, never filtered. Node confirmation is not inferred from a similarity score. Model files must already exist under the person-scoped `models/` folder named by the constitution's Writes and `tools/AGENTS.md`; optional recipe `embedding_file` is a basename there, with no separators or `..`. The tokenizer is `tokenizer.json` beside it. No weights are downloaded, including with `--install`.

## Script Contract

The script follows `system/templates/Script Contract.md`, the pointer to `standards/script-contract.md`. Dependencies, Runtimes, Help without configuration, Unknown flags, Output and errors, Where files are written, and Caller-named paths bind this implementation. The entry file remains standard-library; its sibling loads graph dependencies after venv re-exec. `--install`, `WISER_ALLOW_INSTALL=1`, or a matching plugin consent marker permits the package install into this tool's `.venv` from `pypi.org` and `files.pythonhosted.org`, estimated several hundred megabytes including dependencies. pip's cache is off. The authorised run finishes after install. No dotenv or key is accepted; `--env` is refused. Unknown, repeated and inapplicable flags fail before work. Every caller-named path is screened. The write inventory is `tools/AGENTS.md`.

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
| `missing-engine: ladybug` | Read the consent report and authorise packages with `--install`, or repair the named engine in the tool venv |
| `missing-weights` | Supply the local model and tokenizer files in the person-scoped models folder; the tool never fetches them |
| `refused-import: cognee` | Remove the refused import; no engine retry |
| `this command is databased-only; backend: graph is not supported.` | Use graph ingest or recall; no graph promotion or replay command exists |
| `hosted-unspecified: read experts/Memory Expert/hosted.md; stop before reading sources.` | Read the hosted stub; produce no substitute result |
| `unknown option "--env".` | Remove `--env`; this tool takes no environment file |
