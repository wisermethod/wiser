# Local graph memory contract

Engine documentation and skill contract for ask-time Pro / `backend: graph`.

**Version:** 0.3.1, 2026-09-12
**Status:** specified and executable for query, embed and ingest

## Scope and availability

The backend mapping is `tools/knowledge-memory/references/backends.md`. This file specifies the local graph engine and the contract its callers follow. `knowledge_memory.py` executes graph ingest and recall. Its prerequisite checks stop before source or store access on the failures below. Wiki, databased and chunk commands need no graph venv.

## Engine and store

LadybugDB, Python import `ladybug`, version 0.20.4, is the embedded property-graph engine; its license is MIT and its query language is Cypher text. Engine references: [Python API](https://docs.ladybugdb.com/client-apis/python/) and [package metadata](https://pypi.org/project/ladybug/0.20.4/).

One native `graph.lbdb` file belongs to one dataset at the path the caller names in the owning root. Reopen means open the same path. The database path is a file, not a directory; two datasets use two files. This is neither SQLite FTS5 nor NetworkX. `ingest --set --store --extraction` creates the graph schema when needed; `tools/AGENTS.md` remains the write inventory.

## Types and provenance

Graph ingest accepts the extraction shape in `tools/knowledge-memory/references/schemas.md` section 2 and stores `Idea`, `Entity`, and every declared relation type: nodes carry `name`, `definition` or `summary`, `quote`, `source_path`, and `status`; the relation carries its endpoints, `quote`, `source_path`, and `status`. Relations run from Idea to Idea or Entity. Facts, decisions and open questions are counted as skipped with a named unsupported-table reason; no additional node tables are invented.

Ingest always creates Candidates regardless of extraction status. Existing node names and identical edges are skipped with counts; one extraction is transactional. No graph promote or replay command is provided. Every node and relation needs a located quote and source path. No quote, no node. Knowledge Set Onboarding confirms Pro canon with the human; ingest never sets Canonical automatically.

## Query and retrieval

The read-only query surface accepts Cypher `MATCH` only. Write clauses, DDL, `CALL`, `INSTALL`, `LOAD`, comments, and multi-statement strings are refused before execute; malformed queries are also refused before execute. Each query opens only the caller's dataset file read-only.

Two retrieval paths return located items:

- Cypher relation traversal follows typed edges. Removing a required edge removes the match; lexical hits cannot stand in for that relation.
- Local embedding nearest-neighbour retrieval searches stored names, definitions or summaries, aliases, and quotes. It covers paraphrases lexical FTS5 can miss. Entity aliases are included when present. Candidate seed items stay unconfirmed; ranking does not establish canon.

An item has `name`, `quote`, and `source_path`. Embedding rows also have cosine `score` and `rank`. There is never an `answer` field. `skills/Knowledge Recall/` composes from items; empty items yield `Not available`.

Weights placement follows the constitution's `AGENTS.md` Writes and the person-scoped model-weights row in `tools/AGENTS.md`. A knowledge-set recipe names a file inside that `models/` folder. The default ONNX file is `all-MiniLM-L6-v2.onnx`, with `tokenizer.json` beside it. Optional recipe `embedding_file` is a basename only, with no separators or `..`. The engine does not supply or download embedding weights.

## Verbs and failures

These are English verbs, not action ids or new CLI commands:

- **query**: run read-only Cypher traversal and return located items.
- **embed**: compute local embeddings and return nearest-neighbour items.
- **ingest**: load permitted corpus and confirmed human knowledge as Candidates, under Upgrade seed below.

Only commands listed in `tools/knowledge-memory/TOOL.md` may be invoked. Graph compile runs `chunk --set DIR`, session extraction, then `ingest --set DIR --store FILE --extraction FILE`; FILE for the store names `graph.lbdb`. Graph retrieval runs `recall --set DIR --store FILE --query TEXT`. A MATCH query takes the query path even with `retrieval: embedding`; other text takes the embed path only when that recipe value is selected. The lexical recipe default supplies no graph fallback.

The executable engine path checks these failures before any source read, exits nonzero, and leaves no partial compiled writes:

| Failure | Cause |
|---------|-------|
| `missing-engine: ladybug` | The named graph engine is absent |
| `missing-weights` | The local weights required for embedding retrieval are absent |
| `refused-import: cognee` | A refused Cognee import is attempted |

Missing packages produce the Script Contract consent report unless installation is already authorised. No failure triggers a weight download. An alternative engine is not a retry.

## Upgrade seed

Databased-to-graph reuses corpus paths without copying corpus. Corpus, confirmed databased canon, and decided items seed Candidate graph nodes with located quotes and their original source paths. Graph ingest loads that seed from session extraction after chunking, always as Candidates. Isolated proof and a later product ingest both produced zero auto-Canonical nodes and left the source databased store and corpus hashes unchanged.

No Canonical status is silently copied. A human confirms Pro canon. No replay rule is accepted; one would require explicit operator acceptance and isolation tests. Knowledge Curation records the prior backend and the new caller-named graph file; confirmation belongs to the named human, never to ingest.

## Refusals

Cognee, provider keys, script-side chat completions, `.env` walkers, loadable extra engines, invented connector action ids, and remote graph services are refused. Neither lexical FTS5 nor a model-memory answer substitutes for a graph result.

## Grant

Package installation follows `standards/script-contract.md` Dependencies and Runtimes through `--install`, `WISER_ALLOW_INSTALL=1`, or a matching plugin consent marker. Under that consent the tool installs Ladybug and the embedding runtime into its own venv and finishes the command. This contract grants no weight download; missing local weights stop as `missing-weights`.
