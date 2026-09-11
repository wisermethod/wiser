# Hosted memory stub

Shipped stub for the Enterprise / `hosted` backend. It does not become a connector.

**Version:** 0.1.0, 2026-09-09
**Status:** unspecified

## What this is

A named gap, not a module. The intended platform is OneReach, reached later as an MCP connector through the gateway, the same way every other connector in this plugin is reached. The connector is not specified, not connected, and not on the ship list. Connector Build's Authority already makes adding a service a human input. This build does not add one.

## What must not exist

- Any loadable connector directory for this gap
- A `manifest.json` that the gateway would load
- Invented action ids in any skill, expert, or tool
- A live lookup, ingest, or export

A half-connector fails `gateway --check` and takes down every other connector. The stub is a file the expert and skills read, then stop.

## Intended verbs, not ids

When Connector Author later runs from an approved Connector Advisor plan, the module is expected to cover two verbs. Names below are English, not action ids.

- **lookup**: given a query and a collection or set identity, return items with text and source, never an answer
- **ingest**: given corpus files and, where they exist, a confirmed canon and decided review items, add them to that collection

Until those ids exist on a typed `CONNECTOR.md` this plugin ships, every `backend: hosted` path is the honest stop in `tools/knowledge-memory/references/backends.md`.

## What the skills do today

Knowledge Set Onboarding, asked for Enterprise: record the option, write `backend: hosted` in the run record if a set directory was already being discussed, do not create compiled layers, do not read the corpus into a hosted session, name this stub, stop.

Knowledge Curation, asked to upgrade to hosted: same stop.

Knowledge Recall, pointed at a hosted set: same stop.

Memory Expert Job 1, asked to recommend Enterprise: may recommend it as the future path and must say it cannot be built in this plugin yet.

## Grant

None. There is no `auth.md`, no toolkit name, and no `secrets:` key. A session that asks how to connect is handed Connector Advisor, not a recipe.
