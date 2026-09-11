# Knowledge-set contract

The one home of the four-option design. The expert, the three skills, and the tool templates cite this file. None restates the mapping. A change here is a change to all of them.

**Version:** 0.1.3, 2026-09-11. Changelog: four memory options; Standard is `databased`; Pro is `graph` stub.

This is the shipped home. The build-time copy is a projection; drift is reconciled toward this file.

## Three questions, never one word

A knowledge set answers three questions. They are not aliases.

| Question | Ask-time labels | Recipe field | Meaning |
|----------|-----------------|--------------|---------|
| Where does compiled knowledge live, and how is it recalled? | Simple, Standard, Pro, Enterprise | `backend: wiki \| databased \| graph \| hosted` | The memory option |
| What kind of sources is this? | book, blog, website, domain, mixed | `kind` | How the corpus is gathered |
| How deep is the close? | core, full | `close_intensity` | Read-back and audit depth, from Onboard Root |

The scaffold on `knowledge-memory` already asks a Phase 0 "Tier" question that is close intensity (will work from this set reach someone outside the workspace?). That word is retired for memory options. Skills ask **memory option** and write `backend`. They ask **close intensity** and write `close_intensity`. They never ask "tier".

Shipped prose does not treat Enterprise as better knowledge, or Simple as lesser. Onboard Root forbids encoding canonicity in a name; the same rule binds set names and backend names. Simple is the default because most sets are a compounding wiki, not because it is a starter that must be outgrown.

## Mapping

| Memory option | Backend | Compile | Recall | Review |
|---------------|---------|---------|--------|--------|
| Simple | `wiki` | Session compiles markdown pages from `corpus/` into `wiki/` | Read `wiki/index.md`, search `wiki/`, open pages, cite them | Lint (index, links, grounding). Human curates sources. Agents do not silently rewrite history |
| Standard | `databased` | Session extracts per chunk; the tool validates and ingests into SQLite FTS5, not a graph database | Tool `recall` returns items; the skill composes the answer from items only | Human promote, stale, forget. Agents never set Canonical |
| Pro | `graph` | Unspecified local graph. Stop | Unspecified. Stop | Unspecified. Stop |
| Enterprise | `hosted` | Unspecified. Stop | Unspecified. Stop | Unspecified. Stop |

Default memory option: Simple (`wiki`). Infer Standard only when the requester names a confirmed canon, as-of questions, or a retrieval eval. Infer Pro only when they name a graph database, embeddings, or a graph query language. Infer Enterprise from a shared hosted store. Never infer Pro or Enterprise from "serious". Never infer Simple from "personal". If signals conflict, ask which memory option they mean.

## Shared substrate

Every backend keeps:

- One owning root, never this plugin root
- One named set at `memory/knowledge/<set>/`
- Immutable sources at `memory/knowledge/<set>/corpus/`
- `set.yaml` carrying `backend`, `kind`, `close_intensity`, `session_permission`
- Session permission recorded before any source is read: this session may process the material, who said so, and when. Storage is local for `wiki`, `databased`, and (later) `graph`. Extraction is as local as the harness. `hosted` is neither, and the skill stops before a source is read
- Provenance on every load-bearing claim: a path under `corpus/`, and for `databased` a quote the tool can locate in a chunk
- Human decisions as the portable layer for an upgrade: wiki pages the owner kept, `review/decided/` items, a confirmed `canon.md`

Bound `memory/` files are `about`, `voice`, and `design`. Knowledge sets live at `memory/knowledge/<set>/` and Provides does not bind that path. Mixing set content into bound files is a defect.

## Layout

```
memory/knowledge/<set>/
  set.yaml
  corpus/                 # all backends; originals of binaries under corpus/originals/
  wiki/                   # wiki backend only
    index.md
    log.md
    <topic>/<article>.md
  extraction/             # databased backend only
  review/                 # databased backend only
  reports/
  canon.md                # databased backend only; wiki uses wiki/index.md as the catalog
memory/knowledge/store/   # databased only; one SQLite file, every table keyed by dataset
```

The store for `databased` is `memory/knowledge/store/` in the owning root, one SQLite file, every table keyed by dataset. The conventional file is `databased.sqlite` (formerly `graph.sqlite`). Wiki writes no store. Hosted and graph stubs write no local compiled layer.

## What each backend is

**Wiki.** Karpathy's LLM wiki, remapped onto Wiser primitives, not copied from any third-party skill. `corpus/` is raw and immutable. `wiki/` is compiled markdown the session maintains. `wiki/index.md` is the catalog. `wiki/log.md` is append-only. Grounding invariant: every load-bearing fact (a number, a date, a direct quote) is locatable verbatim in a `corpus/` file that article's Raw field links. Compile establishes the invariant; lint verifies it. At this scale grep and read are the retrieval. No typed ontology, no vector index, no MCP. Shapes live in `wiki-schemas.md` beside this file.

**Databased.** The 2026-09-05 harness-model design: six extracted types, Candidate until a human promotes, 40-word located quotes, FTS5 lexical recall with hop-0 BM25 then hop-1 on idea edges, items not answers. Shapes live in `schemas.md` beside this file. This is not a graph database and must not be called one. Q1 lexical stands for Standard; embeddings belong to Local Graph, outside Memory v1.

**Graph.** A true local graph with embeddings and a graph query language, not specified and not connected. The stub is `experts/Memory Expert/graph.md`; a later Local Graph build owned by Memory Expert is intended to implement it. Every `backend: graph` path is an honest stop until that build ships. No loadable extra engine or connector, Cognee, provider key, script-side model call, or `--env` path ships here.

**Hosted.** A OneReach MCP connector, not specified and not connected. No loadable directory under `wiser/connectors/`. The stub is `experts/Memory Expert/hosted.md`. Intended verbs are lookup and ingest. Action ids are not invented here. Adding the service is Connector Build's human input, then Connector Author. Until then every `hosted` path is an honest stop: name the gap, produce nothing in its place.

## Organizing pass

`skills/Categorize Content/` is the first compile over a body of material, not another backend and not owned by Memory Expert (Ghost Writer owns it). Knowledge Set Onboarding offers it after the corpus exists and before wiki compile or databased extract, for a book, a domain, or a mixed set large enough for themes.

- Wiki: the shipped themes become topic directories and the first article names
- Databased: the shipped themes become Candidate Ideas for the canon interview
- Graph: the shipped themes would be the collection schema; then stop
- Hosted: the shipped themes would be the collection schema; then stop

Themes structure topics and order. They are not a maximum count of wiki articles or canon rows. After the theme list, a coverage pass walks the corpus for important ideas that locate and have no theme home, and adds them as articles or Candidate Ideas. Missing an important located idea is worse than keeping a mildly interesting located one. Compression that drops a load-bearing head is a compile miss, not elegance. Ungrounded claims still stay out: no quote, no page, no node.

Skip when the corpus is too thin for themes; that follow-up is `skills/Knowledge Map/` (Research Expert owns it; this build does not). A map invents nothing and stores nothing.

`skills/Build Concepts/` stays one insight for one piece. It is not a knowledge-set step.

## Upgrade, not translation

Compiled knowledge is regenerable. Upgrade carries `corpus/` and human decisions, then rebuilds compiled knowledge at the new backend.

**Wiki to databased.** Keep `corpus/`. Treat kept wiki pages as the first-pass Idea list for the canon interview, not as auto-Canonical. Then chunk, extract, ingest. A wiki sentence becomes Canonical only when a quote of at most 40 words is located in a corpus file and a human promotes it.

**Databased to graph.** Stop on `experts/Memory Expert/graph.md` until Local Graph ships. No graph ingest or compiled layer is created.

**Graph to hosted.** Stop on `experts/Memory Expert/hosted.md` until the hosted connector is specified. No export runs.

Down is not a path. Wiki to graph does not skip databased: go through databased, or stop on the graph stub when Pro was requested without a databased set. Knowledge Curation owns upgrade; it is not another skill.

Wiki and databased ship in Memory v1. Graph and hosted are stubs. The options are not rankings of knowledge quality, and Standard is not gated on a wiki eval failure.

## Honest stops

- `graph` and no specified local-graph implementation: stop, name graph-unspecified and `experts/Memory Expert/graph.md` before reading sources
- `hosted` and no specified connector: stop, name the gap
- Material this session may not process: stop, record the decline
- A set too small to be worth any backend: route to Knowledge Map, do not create `memory/knowledge/<set>/`
- A question the set does not cover: `Not available`. The model's own memory does not fill the hole
- A loadable hosted connector with a half-manifest: never. Gateway `--check` would refuse to start
