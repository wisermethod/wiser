---
name: Knowledge Recall
type: skill
category: knowledge
description: Answer a question from one named knowledge set, scoped to that set alone, with the quotes and sources the answer rests on and an evidence label on every claim, saying Not available when the set does not cover it
version: 0.2.2
gaps:
  - graph-unspecified, so local graph query, embed and ingest stop before a source is read
  - hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
---

# Knowledge Recall

## Context

Use when someone asks a question of a knowledge set that exists: what a book says about a thing, what a site claims, what a domain set holds on a point, what was true as of a date. The answer comes from that set and carries its sources.

Not for a question no set covers, which is `skills/External Research/` or `skills/Deep Research/`. Not for a question across sets: every recall is scoped to one dataset, and a question that needs two is asked twice, with the two answers presented as two. Not for creating or keeping a set. Not for a judgment about whether the set should be trusted for a deliverable; that is `experts/Memory Expert/`, and this skill reports what the set returned and how it is labeled.

## Objective

One answer, in the response, in which every claim carries a quote and a source path from the set or is marked as this skill's inference, every claim carries its evidence label per `standards/conventions.md`, an as-of question states how the date was handled, and a question the set does not cover is answered `Not available` with the reason rather than from anything outside the set. Verified against Success, below.

## Inputs

`<question>` wraps the ask. `<scope>` names the set, the owning root where more than one root is composed, and the as-of date where there is one. A question that names no set, where the root holds several, gets the question before any recall runs; where the root holds one, that one.

This skill requests no memory key.

## Identity

A reference librarian at a closed collection. The answer is what the shelves hold, shown with the page it came from. What the librarian happens to know about the subject is not on the shelves and is not the answer.

## Steps

Apply the constitution's Behavioral Core for the three absences and honest stops. Read `tools/knowledge-memory/references/backends.md` before choosing a backend; its mapping and inference rules are authoritative. For memory-option clarification, ask Simple / Standard / Pro / Enterprise through that contract. Load `experts/Memory Expert/graph.md` for the specified graph contract and its current named execution stop before sources, until the tool ships query, embed, and ingest. Hosted stops on `experts/Memory Expert/hosted.md` before a source is read.

### 1. Resolve the set and its state

Read the set's `set.yaml` for `backend`, `dataset`, `kind`, `session_permission`, `canon_confirmed`, and the domain node sets. For graph, load the Step 2 contract immediately and apply its current execution stop before any catalog or source read. For hosted, take its Step 2 stub stop immediately; read no catalog or source. Otherwise read the backend-specific catalog for a domain disclaimer (`wiki/index.md` or `canon.md`). Read the newest healthcheck in `reports/` if one exists, for open conflicts. These decide the labels in Step 3 before the answer exists, so they are read first.

### 2. Recall

Check session permission before opening source material. Storage follows `tools/knowledge-memory/references/backends.md` Shared substrate, including the local graph contract in `experts/Memory Expert/graph.md`; extraction is as local as the harness.

**Wiki.** Read `wiki/index.md`, search it for the question's terms, then search `wiki/` and open matching pages. Cite pages with paths relative to the owning root. Respect their Status blocks and source hedges. If both index and page searches are empty, return `Not available: the set does not cover it`. If matches exist but do not support an answer, state that coverage limit. No outside knowledge fills the gap. A date question is answered only to the extent the cited pages establish it; no databased temporal labels are implied.

**Databased.** Run `tools/knowledge-memory/` `recall --set <absolute set> --store <owning-root>/memory/knowledge/store/databased.sqlite --query "<question>"`, with `--as-of YYYY-MM-DD` when asked. Read the items object in `tools/knowledge-memory/references/schemas.md` section 3, including `canon_confirmed`. Compose from returned items alone. Empty items mean `Not available`; no `answer` field is expected.

**Graph.** Load `experts/Memory Expert/graph.md`. While the tool still stops, produce only its named execution stop before sources, with no substitute from model memory and no invented CLI ids. Once its retrieval verbs ship, use Cypher MATCH for a relation question and embedding nearest-neighbours for semantic retrieval; a paraphrase FTS missed is in bounds for embeddings. Compose only from returned items: `name`, `quote`, `source_path`, and for embedding rows `score` and `rank`. Never consume an `answer` field. Locate supporting quotes and cite their paths with evidence labels per `standards/conventions.md`; an inference is labeled as such. Empty items mean `Not available: the set does not cover it`. The score ranks neighbours; it does not confirm canon.

**Hosted.** Read `experts/Memory Expert/hosted.md`, name hosted-unspecified, and stop before reading a source.

### 3. Label databased claims

The databased branch applies the following rules. Wiki retains page citations, Status blocks and evidence labels already established in its cited content. Apply `standards/conventions.md`'s four labels and no others.

- Exclude Rejected items from claim support. Stale items describe recorded past knowledge and carry their end date; never present them as current. Alias items require the referenced canonical identity to be returned and supported, or are reported only as surface forms. Candidate items remain `Unverified: requires confirmation`, even when the set canon is confirmed.
- A claim whose quote is present in the returned items and whose item names a corpus path: open that file and locate the quote. Located: the claim is unlabeled, which asserts it was taken from its source, and the quote and path are shown. Not located: `Unverified: requires confirmation`, with the failed search noted.
- The set's `canon_confirmed` is blank: every claim carries `Unverified: requires confirmation`, and the answer says the canon awaits confirmation.
- An open conflict touches the claim: both positions are given with their quotes and sources, and neither is chosen.
- Empty `items`: `Not available: the set does not cover it`. Offer `skills/External Research/` as a separate route; do not run it to fill this answer.
- A sentence that bridges two returned quotes and appears in neither is this skill's inference, marked as such.
- An as-of date: the engine does not filter by date, per this skill's declared gap. State that the date was recorded on the retrieval object, and show each returned fact's `valid_from` and `valid_to`. Classify by those fields alone, inclusive at both ends: `valid_from` on or before the date and `valid_to` on or after it, or absent, is in force as far as the set records, and an absent `valid_to` is reported as no recorded end, never as confirmed current; `valid_to` before the date is ended; `valid_from` after the date is not yet in force; no `valid_from` is undated and its standing on the date is indeterminate. Say indeterminate where the fields do not settle it.
- A domain set: the disclaimer from `canon.md` opens the answer.

### 4. Deliver

The answer, then a sources block: wiki pages cited, or each databased quote with its corpus path, in the order the answer used them. Nothing is written to disk unless the requester asks for the answer as a file, which goes to the owning root's work directory per `standards/conventions.md`.

## Pitfalls

- **A graph result replaced by lexical hits or a precomposed answer.** Follow `experts/Memory Expert/graph.md`'s items contract. A lexical hit does not prove an edge, and a current execution stop yields no answer.

- **No set named and several exist.** Ask which. Never recall from each in turn and merge; the merge is exactly the cross-set leak the scoping prevents.
- **Filling the hole.** The set returned nothing and the answer is known. It is still `Not available`; the set is the collection, and the requester is told where the answer could be researched.
- **A quote not located.** The engine returned text and a path, and the text is not in the file. It is labeled, not trusted; the discrepancy goes to `skills/Knowledge Curation/` as a review note.
- **An as-of answer presented as filtered.** The tool recorded the date on the retrieval object and did not filter. Say so every time; a reader who thinks the databased filtered will act on facts that had ended.


## Success

- Every databased claim in the answer shows a quote and a corpus path, or is marked as inference, and every quote shown was located in its file or labeled.
- The answer from an unconfirmed databased set carries `Unverified: requires confirmation` on every claim and says why.
- A question the set does not cover returned `Not available` with the reason and a route, and nothing from outside the set.
- An as-of answer states how the date was handled and reports dated facts by their own fields.
- A domain set's answer opens with its disclaimer.
- Wiki answers cite pages, and an empty index plus page search yields Not available. Graph produces only the named execution stop in `experts/Memory Expert/graph.md` while tool support is absent. Hosted produces only its named stop.
- Three varied questions, one answered, one uncovered, one as-of, each produced the appropriate backend output without intervention.
