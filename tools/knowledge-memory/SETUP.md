# knowledge-memory setup

Read `tools/knowledge-memory/references/backends.md` for the memory-option contract and `TOOL.md` for command details.

**Simple.** Keep sources and compiled wiki pages locally. No install is needed. The session compiles from permitted corpus text; `wiki-lint --set DIR` checks the index, links and high-signal grounding with Python 3.9+.

**Standard.** Keep session-extracted knowledge in the local databased store. Run `python3.11 scripts/knowledge_memory.py check` with the intended interpreter; databased work requires Python 3.11+ and SQLite FTS5. A successful check reports both, and installs nothing.

**Pro.** Read `experts/Memory Expert/graph.md`. Graph ingest and recall execute locally with LadybugDB. `check` reports graph package presence; `check --install` installs the pinned engine and embedding runtime into this tool's `.venv` under Script Contract consent and completes. `--install` also works on the graph command that needs the packages. Missing engine is `missing-engine: ladybug`; missing ONNX or tokenizer files is `missing-weights`, even with `--install`. The tool only reads weights already in the person-scoped `models/` folder; it never downloads them. Python presence and missing-runtime handling follow `standards/script-contract.md` System dependencies.

**Enterprise.** Read `experts/Memory Expert/hosted.md`. Hosted lookup, ingest and export are unspecified; stop before reading a source or creating a compiled layer.

## First set

`skills/Knowledge Set Onboarding/` settles the memory option, kind, close intensity and session permission. It creates `memory/knowledge/<set>/` in the owning root using the templates. Convert PDFs and other binary material to UTF-8 markdown or text first. Keep the supplied original under `corpus/originals/`; the conversion's provenance header names it.

For a databased set, create the SQLite file with `bootstrap --store /absolute/owning-root/memory/knowledge/store/databased.sqlite`, then chunk. The session extracts one chunk at a time in the pack schema; `ingest --set DIR --store FILE --extraction FILE` validates and loads it. The skill conducts confirmation and evaluation. For graph, write `retrieval: embedding` in the recipe unless the requester wants Cypher only, run `chunk --set DIR`, extract in the session, then `ingest --set DIR --store /absolute/owning-root/path/graph.lbdb --extraction FILE`. Ingest creates its schema and Candidates; no SQLite bootstrap or graph promote runs. Recall uses `recall --set DIR --store FILE --query TEXT`, with MATCH for relations or recipe `retrieval: embedding` for paraphrases. Lexical on a graph recipe is not a text-search fallback. For a wiki set, compile pages, confirm the kept pages and index, then lint. The write inventory is `tools/AGENTS.md`.
