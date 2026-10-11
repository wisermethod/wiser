# knowledge-memory setup

Read `tools/knowledge-memory/references/backends.md` for the memory-option contract and `TOOL.md` for command details.

**Simple.** Keep sources and compiled wiki pages locally. No install is needed. The session compiles from permitted corpus text; `wiki-lint --set DIR` checks the index, links and high-signal grounding with Python 3.9+.

**Standard.** Keep session-extracted knowledge in the local databased store. Run `python3.11 scripts/knowledge_memory.py check` with the intended interpreter; databased work requires Python 3.11+ and SQLite FTS5. A successful check reports both, and installs nothing.

**Pro.** Read `experts/Knowledge Expert/graph.md`. Graph ingest and recall execute locally with LadybugDB. On `retrieval: embedding`, ingest also cuts the corpus into searchable passages, which roughly doubles the store, and a recall is two tool calls with one model call between them; `references/backends.md` Mapping carries what that costs per question and is where the option is chosen. `check` reports graph package presence; `check --install` installs the pinned engine and embedding runtime into this tool's `.venv` under Script Contract consent and completes. `--install` also works on the graph command that needs the packages. Missing engine is `missing-engine: ladybug`; missing ONNX or tokenizer files is `missing-weights`, even with `--install`. The tool only reads weights already in the person-scoped `models/` folder; it never downloads them. Python presence and missing-runtime handling follow `standards/script-contract.md` System dependencies.

The Pro model files are the full-precision ONNX export of `sentence-transformers/all-MiniLM-L6-v2`, from that model's page on Hugging Face, saved as `all-MiniLM-L6-v2.onnx`, with that page's `tokenizer.json` beside it. They were taken at the page's revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, where the export is listed as `onnx/model.onnx`, and they are the files this plugin's maintainers use. The recall figures in `references/backends.md` were measured on a machine whose `models/` folder held these files before and after those runs; the runs themselves recorded no checksum of the file they loaded. The page also lists optimized and quantized exports of the same model. None of them is the default, and one that loads returns plausible results, so a wrong pick can fail silently. Check the two files against this table:

| File | Bytes | SHA-256 |
|------|-------|---------|
| `all-MiniLM-L6-v2.onnx` | 90405214 | `6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452` |
| `tokenizer.json` | 466247 | `be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037` |

Inside the person-scoped `models/` folder, whose location `tools/AGENTS.md` gives, run `shasum -a 256 all-MiniLM-L6-v2.onnx tokenizer.json`, or `sha256sum` with the same two names where `shasum` is absent, or `Get-FileHash -Algorithm SHA256 all-MiniLM-L6-v2.onnx, tokenizer.json` in PowerShell, which prints the hash in capitals. Both hashes must match the table before Pro work runs on these files. Where either differs, stop, say which file, and replace it with the file described above; the tool does not check the hashes itself, so a mismatched file still loads. A recipe's `embedding_file` may name another ONNX file in that folder. The tool reads any file the way it reads this one: on CPU, mean pooling over the attention mask, no query or passage prefix, and the folder's `tokenizer.json`. A model built for anything else may stop with an error, or may run and return plausible results that nothing has checked, with no warning.

**Enterprise.** Read `experts/Knowledge Expert/hosted.md`. Hosted lookup, ingest and export are unspecified; stop before reading a source or creating a compiled layer.

## First set

`skills/Knowledge Set Onboarding/` settles the memory option, kind, close intensity and session permission. It creates `memory/knowledge/<set>/` in the owning root using the templates. Convert PDFs and other binary material to UTF-8 markdown or text first. Keep the supplied original under `corpus/originals/`; the conversion's provenance header names it.

For a databased set, create the SQLite file with `bootstrap --store /absolute/owning-root/memory/knowledge/store/databased.sqlite`, then chunk. The session extracts one chunk at a time in the pack schema; `ingest --set DIR --store FILE --extraction FILE` validates and loads it. The skill conducts confirmation and evaluation. For graph, write `retrieval: embedding` in the recipe unless the requester wants Cypher only, run `chunk --set DIR`, extract in the session, then `ingest --set DIR --store /absolute/owning-root/path/graph.lbdb --extraction FILE`. Ingest creates its schema and Candidates; no SQLite bootstrap or graph promote runs. Recall uses `recall --set DIR --store FILE --query TEXT`, with MATCH for relations or recipe `retrieval: embedding` for paraphrases. Lexical on a graph recipe is not a text-search fallback. For a wiki set, compile pages, confirm the kept pages and index, then lint. The write inventory is `tools/AGENTS.md`.
