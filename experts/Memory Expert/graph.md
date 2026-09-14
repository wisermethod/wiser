# Local graph memory contract

Engine documentation and skill contract for ask-time Pro / `backend: graph`.

**Version:** 0.4.0, 2026-09-14
**Status:** specified and executable for query, embed and ingest

## Scope and availability

The backend mapping is `tools/knowledge-memory/references/backends.md`. This file specifies the local graph engine and the contract its callers follow. `knowledge_memory.py` executes graph ingest and recall. Its prerequisite checks stop before source or store access on the failures below. Wiki, databased and chunk commands need no graph venv.

## Engine and store

LadybugDB, Python import `ladybug`, version 0.20.4, is the embedded property-graph engine; its license is MIT and its query language is Cypher text. Engine references: [Python API](https://docs.ladybugdb.com/client-apis/python/) and [package metadata](https://pypi.org/project/ladybug/0.20.4/).

One native `graph.lbdb` file belongs to one dataset at the path the caller names in the owning root. Reopen means open the same path. The database path is a file, not a directory; two datasets use two files. This is neither SQLite FTS5 nor NetworkX. `ingest --set --store --extraction` creates the graph schema when needed; `tools/AGENTS.md` remains the write inventory.

## Types and provenance

Graph ingest accepts the extraction shape in `tools/knowledge-memory/references/schemas.md` section 2 and stores `Idea`, `Entity`, and every declared relation type: nodes carry `name`, `definition` or `summary`, `quote`, `source_path`, and `status`; the relation carries its endpoints, `quote`, `source_path`, and `status`. Relations run from Idea to Idea or Entity. Facts, decisions and open questions are counted as skipped with a named unsupported-table reason.

One further node table exists and it is not an extraction type. `Passage` holds the corpus itself, cut to the window the embedder actually reads, and `LOCATED_IN` edges each Idea and Entity to every passage its located quote falls inside. A passage is not invented from an extraction: it is the located source the quote already points at, cut where it can be searched. An extraction type this file does not name still gets a skip and a reason, never a table of its own.

A `Passage` carries `name`, `text`, `source_path`, `char_start`, `char_end`, `chunk_first`, `chunk_last` and `status`. It stores its text once, in `text`, and has no `quote` column: a passage is its own located quote, and recall maps `text` onto the item contract's `quote` at read time rather than storing the same span twice. The unit is 254 content tokens with 4 tokens of overlap, cut at token boundaries, which is what puts every content token of a source inside some window rather than the fifth of it a chunk-sized unit reaches. `LOCATED_IN` is its own relation type and never one of the six semantic ones, so a question about the graph's own structure excludes it by type rather than by a rule someone has to remember. A quote whose span meets two windows is edged to both, which is what the overlap is for.

Passages are cut only where the recipe records `retrieval: embedding`. A Cypher-only graph recipe has no consumer for them, stores none, and needs no weights at ingest.

**A store is either a passage store or it is not.** Adding passages to one that already holds knowledge ingested without them is refused, because retrieval searches passages the moment any exist, and the older knowledge would leave every answer without saying so. That is the Behavioral Core's rule against covering missing infrastructure by degrading a component, and the repair is to rebuild the set into a new store rather than half migrate this one. A store with no passages at all keeps the node retrieval it has always had.

Ingest always creates Candidates regardless of extraction status. Existing node names and identical edges are skipped with counts; one extraction is transactional. No graph promote or replay command is provided. Every node and relation needs a located quote and source path. No quote, no node. Knowledge Set Onboarding confirms Pro canon with the human; ingest never sets Canonical automatically.

## Query and retrieval

The read-only query surface accepts Cypher `MATCH` only. Write clauses, DDL, `CALL`, `INSTALL`, `LOAD`, comments, and multi-statement strings are refused before execute; malformed queries are also refused before execute. Each query opens only the caller's dataset file read-only.

Two retrieval paths return located items:

- Cypher relation traversal follows typed edges. Removing a required edge removes the match; lexical hits cannot stand in for that relation.
- Local embedding retrieval searches `Passage.text`, the corpus at the embedder's own window, and returns the ideas located in what it finds. A passage is embedded on its own `text` and nothing else; wrapping a name, a definition and aliases around it overflows the window and leaves half of every passage unread. Where a store holds no passages, retrieval falls back to stored names, definitions or summaries, aliases and quotes, which is what every store ingested before passages contains. It covers paraphrases lexical FTS5 can miss. Candidate seed items stay unconfirmed; ranking does not establish canon. A recorded embedding miss is preserved with its query and its expected items, and reruns unchanged when the embedder changes.
- Candidates are ordered by a hybrid of BM25 and cosine, interleaved, not by cosine alone. The two rankers are good at different things, so the passages worth recovering are the ones only one of them can see, and a consensus score discards those by construction. `--rank` selects the ranking and its default reproduces cosine exactly.

An item has `name`, `quote`, and `source_path`. Embedding rows also have `score` and `rank`. There is never an `answer` field. `skills/Knowledge Recall/` composes from items; empty items yield `Not available`.

An item from a store holding passages also carries `part`, one of `passage`, `idea`, `related`, or `match` on the Cypher path, and a `related` item carries the `relation`, `direction` and `via` it was reached by, because a typed hop that cannot say which type it followed is not a typed hop. The fallback path over a store with no passages returns the flat shape above and no `part`, which is what makes it a fallback rather than a second contract. An `idea` or `related` item has no `score` or `rank`, which are properties of an embedding row. The three parts ride inside `items` rather than beside it, so the one skill that composes graph results sees all of them and the shape above keeps its single home. Items are grouped by rank, passage then its ideas then its relations, because ordering part by part spends the whole evidence budget on passages and no idea ever reaches the composer.

Weights placement follows the constitution's `AGENTS.md` Writes and the person-scoped model-weights row in `tools/AGENTS.md`. A knowledge-set recipe names a file inside that `models/` folder. The default ONNX file is `all-MiniLM-L6-v2.onnx`, with `tokenizer.json` beside it. Optional recipe `embedding_file` is a basename only, with no separators or `..`. The engine does not supply or download embedding weights.

## Verbs and failures

These are English verbs, not action ids or new CLI commands:

- **query**: run read-only Cypher traversal and return located items.
- **embed**: compute local embeddings and return nearest-neighbour items.
- **ingest**: load permitted corpus and confirmed human knowledge as Candidates, under Upgrade seed below.

Only commands listed in `tools/knowledge-memory/TOOL.md` may be invoked. Graph compile runs `chunk --set DIR`, session extraction, then `ingest --set DIR --store FILE --extraction FILE`; FILE for the store names `graph.lbdb`. Graph retrieval on `retrieval: embedding` is **two calls, not one**: `recall --set DIR --store FILE --query TEXT` returns ranked candidates, the agent running `skills/Knowledge Recall/` chooses among them, and `recall --select FILE` returns the chosen passages with their ideas and relations. That skill owns the choosing and the rules it runs under; the chooser is a model call at ask time and Refusals below is why it cannot live in the tool. A MATCH query takes the query path even with `retrieval: embedding`, takes neither flag, and is one call; other text takes the embed path only when that recipe value is selected. The lexical recipe default supplies no graph fallback.

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
