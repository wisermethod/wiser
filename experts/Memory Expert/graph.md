# Graph memory stub

Shipped stub for ask-time Pro / `backend: graph`.

**Version:** 0.1.0, 2026-09-11
**Status:** unspecified

## What this is

A named gap, not a module. Intended: a true local graph database in the owning root, with local embeddings and a graph query language. This is a later Local Graph build owned by Memory Expert; this plugin does not ship that implementation yet.

## What must not exist

- A loadable extra engine or connector for this gap
- Cognee, a provider key, or a script-side chat completion
- Invented query-language ids in skills
- A live embed or graph query language path

## Intended verbs, not ids

These names are English, not action ids.

- **query**: run a graph query over typed nodes and edges, returning items not answers
- **embed**: compute local embeddings over canon names, definitions, aliases, and quoted facts
- **ingest**: load corpus plus confirmed canon into that graph

Until Local Graph ships those verbs, every `backend: graph` path is the honest stop in `tools/knowledge-memory/references/backends.md`.

## What the skills do today

Knowledge Set Onboarding, asked for Pro: record the option, write `backend: graph` in the run record if a set was being discussed, create no compiled layer, do not read corpus into a graph-engine session, name this stub, stop.

Knowledge Curation, asked to upgrade to graph: same stop. Keep the existing backend and compiled layer intact.

Knowledge Recall, pointed at a graph set: same stop.

Memory Expert Job 1 may recommend Pro as a future path and must say it cannot be built in this plugin yet.

## Grant

None.
