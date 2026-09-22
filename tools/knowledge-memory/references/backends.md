# Knowledge-set contract

The one home of the four-option design. The expert, the three skills, and the tool templates cite this file. None restates the mapping. A change here is a change to all of them.

**Version:** 0.5.0, 2026-09-15. Changelog: Pro recall's candidate text is re-measured on a current store, the chooser's call names `--candidates-only`, and MATCH is stated as the one-call path for a name lookup.

This is the shipped home.

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
| Pro | `graph`, LadybugDB `graph.lbdb` | Chunk, session extraction, then ingest Candidates into LadybugDB, which on `retrieval: embedding` also cuts the corpus into searchable passages, under `experts/Knowledge Expert/graph.md` | **Two tool calls and one model call between them**, returning located items: `recall` ranks passages naming `--rank` and `--candidates-only`, the agent running Knowledge Recall chooses among them, `recall --select` carrying that selection on its command line returns the chosen ones with the ideas located in them and one typed hop out. The chooser reads the whole candidate set. **Re-measured 2026-09-15 at a median 28,569 characters of candidate text a row** at the default passage-pool `--top-k` of 25, min 24,561 and max 30,496, over 47 rows on a 1,012-passage store of thirteen sources. **The figure the 2026-09-14 reading gave on the same 47 rows was 30,940, and it is replaced rather than reconciled**: a figure is re-measured on the store it is quoted for, and no cause for the difference was established. **The 15 that default replaced read a median 17,116 on those rows, re-measured the same day and the same way**, so the text the chooser reads is **1.67 times** what it was. The 2026-09-14 pair was 19,347 and 1.60 times; **both halves are replaced rather than one**, because a re-measured figure beside a carried one is a ratio of two stores. That is characters of candidate text, **not billed cost, which nothing here measured**: it excludes tokenization, the harness instructions around that text, output and reasoning usage, retries, caching and pricing. **`--candidates-only` does not change this number**, which is the passage text; what it removes is the `idea` and `related` items beside it, **100 of 125 items and 45% of the payload on one measured call**, at no change to any passage. **It buys payload and not time**: the traversal it skips measured at **at most 0.069 seconds of a 15.28 second call**, 0.45%, where the corpus embedding alone was 14.69 seconds. **Cypher MATCH stays one call and no model call, and it is the fast path for a name lookup**: a question that names a node or a relation is answered by MATCH without ranking, without a chooser and without a second call, so it costs neither the candidate text above nor the model call between | Human confirms Pro canon; no auto-Canonical or graph promote command |
| Enterprise | `hosted` | Unspecified. Stop | Unspecified. Stop | Unspecified. Stop |

Default memory option: Simple (`wiki`). Infer Standard only when the requester names a confirmed canon, as-of questions, or a retrieval eval. Infer Pro only when they name a graph database, embeddings, or a graph query language, and tell them what a Pro recall costs per question before they choose it, because the cell above is a per-question cost a requester pays and not a one-time compile cost. Infer Enterprise from a shared hosted store. Never infer Pro or Enterprise from "serious". Never infer Simple from "personal". If signals conflict, ask which memory option they mean.

## Shared substrate

Every backend keeps:

- One owning root, never this plugin root
- One named set at `memory/knowledge/<set>/`
- Immutable sources at `memory/knowledge/<set>/corpus/`
- `set.yaml` carrying `backend`, `kind`, `close_intensity`, `session_permission`
- Session permission recorded before any source is read: this session may process the material, who said so, and when. Storage is local for `wiki`, `databased`, and `graph`. Extraction is as local as the harness. `hosted` is neither, and the skill stops before a source is read
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
  extraction/             # databased and graph backends
  review/                 # databased backend only
  reports/
  canon.md                # databased backend only; wiki uses wiki/index.md as the catalog
memory/knowledge/store/   # databased only; one SQLite file, every table keyed by dataset
```

The store for `databased` is `memory/knowledge/store/` in the owning root, one SQLite file, every table keyed by dataset. The conventional file is `databased.sqlite` (formerly `graph.sqlite`). Wiki writes no store. The graph compiled layer is the dataset's native `graph.lbdb` file at a caller-named path in the owning root, not the plugin, per `experts/Knowledge Expert/graph.md`; graph ingest creates it and recall opens it read-only. On `retrieval: embedding` that file also holds the corpus cut into passages, so it carries the source text a second time and is roughly twice the size of the same set without them, measured at 1.95 times on a 541-passage book. `corpus/` stays immutable and remains the source of record. `tools/AGENTS.md` is the current write inventory. Hosted remains a stub and writes no local compiled layer.

## What each backend is

**Wiki.** Karpathy's LLM wiki, remapped onto Wiser primitives, not copied from any third-party skill. `corpus/` is raw and immutable. `wiki/` is compiled markdown the session maintains. `wiki/index.md` is the catalog. `wiki/log.md` is append-only. Grounding invariant: every load-bearing fact (a number, a date, a direct quote) is locatable verbatim in a `corpus/` file that article's Raw field links. Compile establishes the invariant; lint verifies it. At this scale grep and read are the retrieval. No typed ontology, no vector index, no MCP. Shapes live in `wiki-schemas.md` beside this file.

**Databased.** The 2026-09-05 harness-model design: six extracted types, Candidate until a human promotes, 40-word located quotes, FTS5 lexical recall with hop-0 BM25 then hop-1 on idea edges, items not answers. Shapes live in `schemas.md` beside this file. This is not a graph database and must not be called one. Q1 lexical stands for Standard; embeddings belong to Local Graph, outside Memory v1.

**Databased eval.** The one home of what a filled eval is. Skills cite this paragraph; none restates it. Eval questions are the definition of built. They come from what the set must answer: the request, the confirmed canon, and the coverage-pass heads. Each retrieval question locates in a `corpus/` file before it enters `eval.questions.yaml`. The question text is not the expected node name, and not a paste or leading stretch of that item's canon quote or definition. `expected` is a located item string. A paraphrase whose words already sit in a definition or quote is in bounds; a paraphrase FTS misses is a recorded Q1 limit, not a Local Graph run and not a rewrite of the question to the node. The template's five single-hop, five two-hop, and two as-of rows are a scoring floor, not the pack. Count from the confirmed catalog, not from corpus bytes or chunk count: those estimate extract work. Retrieval: every Canonical idea appears as `expected` on at least one single-hop or two-hop row, and every Canonical entity a practitioner would look up (a person, an organization, the work) does too. Human answer read: sized by `close_intensity` per The confirmation sitting below; at full it is one composed practitioner question per organizing-pass theme and per coverage-pass head that entered the canon, plus at least two uncovered `Not available` rows, the dated-item read, and a conflict where one is open. If Canonical ideas are fewer than the book's chapters, or fewer than the coverage-pass heads, that is a compile miss recorded in the run record, not a reason to write a smaller eval. Omitting a load-bearing located head is an eval miss. `must_not_match` covers held-back names, and isolation once a second dataset exists. As-of rows stay; do not drop them to make `eval.passed` true. The human answer read is required and is the robustness half. Candidate questions may be mined in a second context that has not seen the canon. Do not invoke `skills/External Research/` to write eval rows. If the owner wants questions a field would ask from public sources, Onboarding may run External Research for those questions as its request, then turn returned topics into candidates and locate them. Keep those that locate; keep the rest as uncovered `Not available` rows. Research writes no answers and does not enter `corpus/` unless Phase 2 gathers the cited primary. The confirmation sitting, below, is where the human half is spoken; this paragraph remains the filled-eval contract, and `healthcheck --eval` runs after confirmation.

**Graph.** The specified local graph contract is `experts/Knowledge Expert/graph.md`. Load it for LadybugDB storage, Cypher relation traversal, embedding neighbours, item shapes, Candidate ingest, upgrade seed, and failure semantics. Query, embed, and ingest are English verbs there, not new CLI ids. The tool executes `chunk`, graph `ingest`, and graph `recall`; missing-engine, missing-weights and refused-import checks precede sources and compiled-store access. A graph recipe records `retrieval: embedding` when paraphrase neighbours are in scope; MATCH still takes the Cypher path. On that recipe recall is two calls with the agent choosing between them, and `skills/Knowledge Recall/` owns the choosing and the rules it runs under, because a model call at ask time cannot live in a tool. `retrieval: lexical` on graph is Cypher only, not an FTS5 fallback. The confirmation sitting, below, is where Unverified Candidate recall is spoken; a recorded embedding miss is preserved with its query and expected items.

**Hosted.** A OneReach MCP connector, not specified and not connected. No loadable directory under `wiser/connectors/`. The stub is `experts/Knowledge Expert/hosted.md`. Intended verbs are lookup and ingest. Action ids are not invented here. Adding the service is Connector Build's human input, then Connector Author. Until then every `hosted` path is an honest stop: name the gap, produce nothing in its place.

## The confirmation sitting

The sitting is the confirmation interface; files are evidence, never reading assigned before a question is answered. `skills/Knowledge Set Onboarding/` Phase 6 owns the protocol: the turns, the decision words, the pace, resume, and the sitting record. Every consumer loads it from there. This section owns only what the sitting must contain per backend and how much of it a close intensity requires.

`close_intensity` sizes the human half. Core: themes as a list; every open conflict; the pass-and-miss probes (one located hit labeled Unverified, one uncovered question answered Not available, the dated-item limit once, and for graph each recorded embedding probe as it ran, hit or miss, where the recipe has one); a load-bearing sample of three cited reads (wiki) or five ideas (databased, graph). Full: everything in core, then every coverage head one at a time, still under the five-question pace. The machine half does not shrink: retrieval `expected` still covers every Canonical idea per Databased eval above, and that check runs after confirmation, not in the sitting.

Unverified Candidate recall spoken before confirmation is not `healthcheck --eval`. Databased `recall` returns items for an uncovered question too. Do the returned items state an answer to the question? Yes: they are the items the skill composes from. No, or the item list is empty: the answer is `Not available`, and any items that came back are disclosed with why they do not answer. You cannot tell: `Not available`, and disclose the items. The model's own memory does not fill the hole. A recorded miss is preserved with its query and expected items; the query is never rewritten to a node name.

The sitting adds no vector index to wiki, no promote command to graph, and no shared extraction step across backends. Wiki still has no vector index. Databased is still not a graph database.

## Organizing pass

`skills/Categorize Content/` is the first compile over a body of material, not another backend and not owned by Knowledge Expert (Ghost Writer owns it). Knowledge Set Onboarding offers it after the corpus exists and before wiki compile or databased extract. Is this corpus a book, a domain, or mixed? No: do not offer `skills/Categorize Content/`. Yes, and you can point to separable subjects, each with a passage: the corpus is substantial enough for themes. Offer it. Did the requester accept? Yes: the organizing pass ran. No, or no answer: it did not run. Do not invent themes. Yes, and its passages cannot be separated into subjects, however many files it spans: it is too thin. Skip with that reason and name `skills/Knowledge Map/`. Yes, and there is no compilable source, or the requester has said the set is not worth keeping: stop without a compiled layer. You cannot tell which of these the corpus is: ask. Do not offer, skip, or stop on a guess.

- Wiki: the shipped themes become topic directories and the first article names
- Databased: the shipped themes become Candidate Ideas for the canon interview
- Graph: the shipped themes may seed Candidate Ideas with located quotes; follow `experts/Knowledge Expert/graph.md`, including its prerequisite stops before sources
- Hosted: the shipped themes would be the collection schema; then stop

Themes structure topics and order. They are not a maximum count of wiki articles or canon rows. After the theme list, a coverage pass walks the corpus. Does the idea locate, and does it have a home? It locates and has no home, including when you cannot tell whether it is important or only mildly interesting: add it as an article or a Candidate Idea. Missing an important located idea is worse than keeping a mildly interesting located one. It does not locate: do not add it. No quote, no page, no node. Compression that drops a located head this question would have added is a compile miss, not elegance.

Too thin is the corpus question at the start of this section: passages that cannot be separated into subjects name `skills/Knowledge Map/` (Research Expert owns it; this build does not). A map invents nothing and stores nothing.

`skills/Build Concepts/` stays one insight for one piece. It is not a knowledge-set step.

## Upgrade, not translation

Compiled knowledge is regenerable. Upgrade carries `corpus/` and human decisions, then rebuilds compiled knowledge at the new backend.

**Wiki to databased.** Keep `corpus/`. Treat kept wiki pages as the first-pass Idea list for the canon interview, not as auto-Canonical. Then chunk, extract, ingest. A wiki sentence becomes Canonical only when a quote of at most 40 words is located in a corpus file and a human promotes it.

**Databased to graph.** Follow the Candidate seed in `experts/Knowledge Expert/graph.md`: reuse corpus paths without copying corpus; confirmed canon and decided items seed Candidates, with no silent Canonical copy. Graph ingest loads that Candidate seed from session extraction after chunking. Keep the original databased store intact, name a separate graph file, and record the backend change. A human confirms Pro canon; there is no replay rule.

**Graph to hosted.** Stop on `experts/Knowledge Expert/hosted.md` until the hosted connector is specified. No export runs.

Down is not a path. Wiki to graph does not skip databased: go through databased, or follow `experts/Knowledge Expert/graph.md` for direct Candidate ingest when Pro was requested without a databased set. Knowledge Curation owns upgrade; it is not another skill.

Wiki and databased ship in Memory v1. Graph ingest and recall execute under `experts/Knowledge Expert/graph.md`; hosted remains a stub. The options are not rankings of knowledge quality, and Standard is not gated on a wiki eval failure.

## Honest stops

- `graph`: follow `experts/Knowledge Expert/graph.md`; report `missing-engine: ladybug`, `missing-weights`, or `refused-import: cognee` before source or store access. Package installation follows Script Contract consent; weights are never downloaded
- `hosted` and no specified connector: stop, name the gap
- Material this session may not process: stop, record the decline
- Is there no compilable source, or has the requester said the set is not worth keeping? Yes: do not create `memory/knowledge/<set>/`. Route to `skills/Knowledge Map/`. No: a set can be created. You cannot tell: ask. Do not create the set on a guess
- A question the set does not cover: `Not available`. The model's own memory does not fill the hole
- A loadable hosted connector with a half-manifest: never. Gateway `--check` would refuse to start
