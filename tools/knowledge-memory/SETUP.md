# knowledge-memory setup

Read `tools/knowledge-memory/references/backends.md` for the memory-option contract and `TOOL.md` for command details.

**Simple.** Keep sources and compiled wiki pages locally. No install is needed. The session compiles from permitted corpus text; `wiki-lint --set DIR` checks the index, links and high-signal grounding with Python 3.9+.

**Standard.** Keep session-extracted knowledge in the local databased store. Run `python3.11 scripts/knowledge_memory.py check` with the intended interpreter; databased work requires Python 3.11+ and SQLite FTS5. A successful check reports both, and installs nothing.

**Pro.** Read `experts/Memory Expert/graph.md`. Local graph query, embed and ingest are unspecified; stop before reading a source or creating a compiled layer.

**Enterprise.** Read `experts/Memory Expert/hosted.md`. Hosted lookup, ingest and export are unspecified; stop before reading a source or creating a compiled layer.

## First set

`skills/Knowledge Set Onboarding/` settles the memory option, kind, close intensity and session permission. It creates `memory/knowledge/<set>/` in the owning root using the templates. Convert PDFs and other binary material to UTF-8 markdown or text first. Keep the supplied original under `corpus/originals/`; the conversion's provenance header names it.

For a databased set, create the SQLite file with `bootstrap --store /absolute/owning-root/memory/knowledge/store/databased.sqlite`, then chunk. The session extracts one chunk at a time in the pack schema; `ingest --set DIR --store FILE --extraction FILE` validates and loads it. The skill conducts confirmation and evaluation. For a wiki set, compile pages, confirm the kept pages and index, then lint. The write inventory is `tools/AGENTS.md`.
