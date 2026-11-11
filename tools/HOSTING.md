# Hosting a tool command

Use this page to prepare a portable core, a hosted declaration and shared cases. A command stays on the member's side when it needs more than one file, a directory, an app or device on the member's machine, or anything it cannot be handed in one call: stop and omit it from `hosted:`. A command that reads one file the caller names can be hosted, since the host hands the core that file's bytes. `copy-check`'s `facts` stops here: it needs three files (`--copy`, `--ledger`, `--fact-map`) and a list (`--allow`); do not bundle or drop inputs to make it fit. A hosted command returns files only in its answer.

## 1. Isolate the work

Read the command's `TOOL.md`, entry and tests. Apply **Core first** in `standards/script-contract.md`. Put the core in `scripts/` with a name ending in `-core.js`. Check the module doing the hosted command's work and its import graph and packages; the core itself must import no Node built-in, whatever the gate accepts.

Which entry shape fits? For work on values, use a pure function of values, as `normalizeCatalog(set, catalog)` in `tools/icon-set/scripts/lib/search-core.js`. For a file command, use an input object and a list of files, each `{ name, mediaType, bytes: Uint8Array }`, as `runData(input, files)` in `tools/data/scripts/data-core.js` and `analyzeHtml(input, files)` in `tools/seo-page-analyzer/scripts/analyze-core.js`. Map non-path options to input fields and the file to bytes. Verify the CLI calls the same core; for file commands, malformed envelopes and wrong file counts must refuse.

The sandbox may supply standard JavaScript globals, including `Date`, and the web-standard globals used by these cores: `TextEncoder`, `TextDecoder`, `Uint8Array`, `ArrayBuffer` and `URL`. See `tools/data/test/fixtures/portable.mjs` and `tools/lib/tests/portable-module.js`; the latter supplies `URL` for HTML analysis. No Node built-ins or globals such as `process`, `Buffer` or `require` are available; anything else must be passed in.

## 2. Measure, then answer the five tests

Test the byte cap, one byte over, and the parsing, iteration and output caps. Keep inputs and expected answers in the tool's existing `test/fixtures/` or `tests/fixtures/`; if neither exists, create fixtures under its existing `test/` or `tests/`, or use `test/fixtures/` for a new suite. Keep the largest input generator or fixture, encoded byte count and slowest work's elapsed-time assertion in the tool's own limit tests: `tools/data/test/shared-cases.test.js` and `tools/seo-page-analyzer/tests/shared-cases.test.js` show these checks; their sibling `work-limits.test.js` files pin costly shapes. Run those named tests with `node --test`.

Answer each term of the pass-through sentence in `standards/primitives.md`, Frontmatter, **Tool-only keys**, yes or no:

| Test | How to tell |
|------|-------------|
| **One call?** | Trace input to answer; no continuation or split job is needed. |
| **Input of at most 8 MiB?** | The boundary cases measure bytes and refuse excess input before work starts. |
| **Time limit of at most 240 s?** | Measured work fits the declared limit; work-cap and timeout tests pass. |
| **Nothing kept once the call returns?** | Inspect the core and imports for persistent writes, caches and retained request/result content; none is allowed. |
| **No container?** | Inspect the command's execution path and dependencies; none needs a container. |

Any no: keep the command local and stop; use `runs: local` if none is hosted. A local tool with no core free of Node built-ins declares `local-only:` with the reason (Tool-only keys). All yes: continue. Non-fetching commands cap parsing, iterations and output work. Put potentially hanging regression cases in child processes with a timeout at the declared deadline, as the work-limit tests do; a timer cannot interrupt synchronous work. A timeout or unbounded work fails the time test.

## 3. Declare the result

Set `runs: both` and `hosted:` in `TOOL.md` using Tool-only keys' grammar. Retain existing entries and limits when adding another command. A new hosted command raises the tool's version. Check entries against the limit tests and verify excess input refuses whole.

## 4. Check network use

Does the command fetch? No: continue. Yes: pass fetch and an all-address lookup into the core. Screen initial and discovered destinations, including redirects, with `tools/lib/destination-core.js`'s `destinationReason(hostname, lookup)`; only `null` permits fetching. Follow `tools/tag-audit/scripts/audit-core.js`'s `auditPage({ url }, fetch, lookup, options)` with `requireResolved: true`, a byte cap and one deadline signal. Force expiration with a fixture and assert refusal. Test blocked literals, mixed public/private DNS, failed lookup and blocked redirects; refused destinations must never be fetched.

## 5. Prove agreement and check the declaration

Run the shared cases through the CLI and a portable host; compare complete answers, failures and generated bytes. Use saved cases or generators for successes, malformed inputs and limit refusals, and preserve CLI compatibility checks. A clock or other run-dependent value must be passed in or fixed by the test before comparison: `tools/seo-page-analyzer/tests/shared-cases.test.js` passes `analyzedAt` to the core and uses `tools/seo-page-analyzer/tests/fixtures/clock.mjs` for the CLI. `tools/data/test/shared-cases.test.js` shows file cases without a clock; fetching cases use fixture fetch/lookup functions, as in `tools/tag-audit/test/shared-cases.test.js`. Run the tool's suite; it must pass.

Run `bash system/gates/tool-frontmatter.sh` from the plugin root and resolve findings before registration. Exit codes: **0** passes; **1** refuses; **2** cannot measure. The gate guards against an oversight; review covers the import graph and packages.

**Success:** the opening boundary and all five tests pass, the declaration matches the limit tests, shared cases agree, and the gate exits 0. Registration is the host's own procedure.
