# Local graph memory contract

Engine documentation and skill contract for ask-time Pro / `backend: graph`.

**Version:** 0.2.0, 2026-09-11
**Status:** specified

## Scope and availability

The backend mapping is `tools/knowledge-memory/references/backends.md`. This file specifies the local graph engine and the contract its callers follow. It does not ship an executable graph path: `knowledge_memory.py` still exits `graph-unspecified` before sources. Until the tool ships query, embed, and ingest for graph, every `backend: graph` path loads this file and reports that named stop. The missing capability is execution, not specification.

## Engine and store

LadybugDB, Python import `ladybug`, version 0.20.4, is the embedded property-graph engine; its license is MIT and its query language is Cypher text. Engine references: [Python API](https://docs.ladybugdb.com/client-apis/python/) and [package metadata](https://pypi.org/project/ladybug/0.20.4/).

One native `graph.lbdb` file belongs to one dataset at the path the caller names in the owning root. Reopen means open the same path. The database path is a file, not a directory; two datasets use two files. This is neither SQLite FTS5 nor NetworkX. The compiled-layer contract does not add a currently supported store command to `tools/knowledge-memory/TOOL.md`; `tools/AGENTS.md` remains the write inventory.

## Types and provenance

Labeled property-graph node and relation tables match the six databased types in `tools/knowledge-memory/references/schemas.md` section 2. The isolated proof covers `Idea`, `Entity`, and `DEPENDS_ON`: nodes carry `name`, `definition` or `summary`, `quote`, `source_path`, and `status`; the relation carries its endpoints, `quote`, `source_path`, and `status`. This is proof of that subset, not a claim that the tool implements all six types.

Ingest creates Candidates until a human promotes them. Every node and relation needs a located quote and source path. No quote, no node. Knowledge Set Onboarding confirms Pro canon with the human; ingest never sets Canonical automatically.

## Query and retrieval

The read-only query surface accepts Cypher `MATCH` only. Write clauses, DDL, `CALL`, `INSTALL`, `LOAD`, comments, and multi-statement strings are refused before execute; malformed queries are also refused before execute. Each query opens only the caller's dataset file read-only.

Two retrieval paths return located items:

- Cypher relation traversal follows typed edges. Removing a required edge removes the match; lexical hits cannot stand in for that relation.
- Local embedding nearest-neighbour retrieval searches canon names, definitions, aliases, and quoted facts. It covers paraphrases lexical FTS5 can miss. The proved embedding input covered names, definitions and quotes; aliases remain part of the contract.

An item has `name`, `quote`, and `source_path`. Embedding rows also have cosine `score` and `rank`. There is never an `answer` field. `skills/Knowledge Recall/` composes from items; empty items yield `Not available`.

Weights placement follows the constitution's `AGENTS.md` Writes and the person-scoped model-weights row in `tools/AGENTS.md`. A knowledge-set recipe names a file inside that `models/` folder. The proved ONNX file is `all-MiniLM-L6-v2.onnx`. The engine does not supply or download embedding weights.

## Verbs and failures

These are English verbs, not action ids or new CLI commands:

- **query**: run read-only Cypher traversal and return located items.
- **embed**: compute local embeddings and return nearest-neighbour items.
- **ingest**: load permitted corpus and confirmed human knowledge as Candidates, under Upgrade seed below.

Only commands listed in `tools/knowledge-memory/TOOL.md` may be invoked. Its existing databased ingest is not graph ingest. The current graph stop is `graph-unspecified: read experts/Memory Expert/graph.md; stop before reading sources.` No source is read and no compiled layer is created while that stop applies.

The specified engine path checks these failures before any source read, exits nonzero, and leaves no partial compiled writes:

| Failure | Cause |
|---------|-------|
| `missing-engine: ladybug` | The named graph engine is absent |
| `missing-weights` | The local weights required for embedding retrieval are absent |
| `refused-import: cognee` | A refused Cognee import is attempted |

A failure triggers no automatic install or network attempt. An alternative engine is not a retry.

## Upgrade seed

Databased-to-graph reuses corpus paths without copying corpus. Corpus, confirmed databased canon, and decided items seed Candidate graph nodes with located quotes and their original source paths. The isolated seed proof produced two Candidate ideas from confirmed canon, zero auto-Canonical nodes, and unchanged source hashes. It did not execute a product upgrade.

No Canonical status is silently copied. A human confirms Pro canon. No replay rule is accepted; one would require explicit operator acceptance and isolation tests. Until the tool ships graph ingest, Knowledge Curation keeps the existing backend, recipe and compiled layer intact and stops before any source read.

## Refusals

Cognee, provider keys, script-side chat completions, `.env` walkers, loadable extra engines, invented connector action ids, and remote graph services are refused. Neither lexical FTS5 nor a model-memory answer substitutes for a graph result.

## Grant

None. A later installation of Ladybug or onnxruntime into a tool directory follows `standards/script-contract.md` Dependencies and Runtimes through `--install` consent; this file grants no installation. Weight consent follows that standard's version-matched-artifact clause and the write inventory cited above.
