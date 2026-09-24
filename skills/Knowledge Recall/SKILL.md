---
name: Knowledge Recall
type: skill
category: knowledge
description: Answer a question from one named knowledge set, scoped to that set alone, with the quotes and sources the answer rests on and an evidence label on every claim, saying Not available when the set does not cover it
version: 0.6.6
gaps:
  - hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
---

# Knowledge Recall

## Context

Use when someone asks a question of a knowledge set that exists: what a book says about a thing, what a site claims, what a domain set holds on a point, what was true as of a date. The answer comes from that set and carries its sources.

Not for a question no set covers, which is `skills/External Research/` or `skills/Deep Research/`. Not for a question across sets: every recall is scoped to one dataset, and a question that needs two is asked twice, with the two answers presented as two. Not for creating or keeping a set. Not for a judgment about whether the set should be trusted for a deliverable; that is `experts/Knowledge Expert/`, and this skill reports what the set returned and how it is labeled.

Classifier seam: routing, where `hooks/route.mjs` may open this skill for an ask. Else: the routing table, read as `AGENTS.md` states.

## Objective

One answer, in the response, in which every claim carries a quote and a source path from the set or is marked as this skill's inference, every claim carries its evidence label per `standards/conventions.md`, an as-of question states how the date was handled, and a question the set does not cover is answered `Not available` with the reason rather than from anything outside the set. Verified against Success, below.

## Inputs

`<question>` wraps the ask. `<scope>` names the set, the owning root where more than one root is composed, and the as-of date where there is one. A question that names no set, where the root holds several, gets the question before any recall runs; where the root holds one, that one.

This skill requests no memory key.

## Identity

A reference librarian at a closed collection. The answer is what the shelves hold, shown with the page it came from. What the librarian happens to know about the subject is not on the shelves and is not the answer.

## Steps

Apply the constitution's Behavioral Core for the three absences and honest stops. Read `tools/knowledge-memory/references/backends.md` before choosing a backend; its mapping and inference rules are authoritative. For memory-option clarification, ask Simple / Standard / Pro / Enterprise through that contract. Load `experts/Knowledge Expert/graph.md` for executable graph ingest and recall, including its missing-engine, missing-weights and refused-import stops before sources. Hosted stops on `experts/Knowledge Expert/hosted.md` before a source is read.

### 1. Resolve the set and its state

Read the set's `set.yaml` for `backend`, `dataset`, `kind`, `session_permission`, `canon_confirmed`, and the domain node sets. For graph, load the Step 2 contract and obtain the tool result before any catalog or source read; a named prerequisite stop ends that path. After successful retrieval, read `canon.md` if present for confirmation and domain context. For hosted, take its Step 2 stub stop immediately; read no catalog or source. For wiki or databased, read the backend-specific catalog for a domain disclaimer (`wiki/index.md` or `canon.md`). Any other `backend`, or none, stops the run: name the value and do not open a catalog or a source. Read the newest healthcheck in `reports/` if one exists, for open conflicts. These decide the labels in Step 3 before the answer exists, so they are read first.

### 2. Recall

Check session permission before opening source material. A `session_permission` that does not name who permitted this session and the date is missing: stop and get permission rather than opening source material. Storage follows `tools/knowledge-memory/references/backends.md` Shared substrate, including the local graph contract in `experts/Knowledge Expert/graph.md`; extraction is as local as the harness.

**Wiki.** Read `wiki/index.md`, search it for the question's terms, then search `wiki/` and open matching pages. Cite pages with paths relative to the owning root. Respect their Status blocks and source hedges. If both index and page searches are empty, return `Not available: the set does not cover it`. If matches exist but do not support an answer, state that coverage limit. No outside knowledge fills the gap. A date question is answered only to the extent the cited pages establish it, and a question that asks for no date does not gain one; no databased temporal labels are implied.

**Databased.** Run `tools/knowledge-memory/` `recall --set <absolute set> --store <owning-root>/memory/knowledge/store/databased.sqlite --query "<question>"`, with `--as-of YYYY-MM-DD` when asked. Read the items object in `tools/knowledge-memory/references/schemas.md` section 3, including `canon_confirmed`. Compose from returned items alone. Empty items mean `Not available`; no `answer` field is expected. Returned items that do not answer the question also mean `Not available`, and the answer says which items came back and why they do not answer.

**Graph.** Load `experts/Knowledge Expert/graph.md`. A relation question is one call: `recall --set <absolute set> --store <absolute graph.lbdb> --query "<MATCH query>"`. MATCH takes the Cypher path in every recipe and takes neither flag below.

With recipe `retrieval: embedding`, a paraphrase question is **two calls with your own judgment between them**, which is the same shape as the wiki branch above, where you read an index and choose pages. The chooser reads passage quotes, so that stop does not fall through to this choice.

1. **Rank the candidates.** `recall --set <absolute set> --store <absolute graph.lbdb> --query "<question>" --rank hybrid --candidates-only`. Name `--rank hybrid` on this call every time. Omitting it runs cosine alone, which is a different retrieval policy and a measurably worse one. **Name `--candidates-only` too.** It returns the passages without the `idea` and `related` items this step is told to ignore two sentences below, and it changes nothing about which passages come back or what each one carries. Omitting it returns them anyway and you still may not read them.
2. **Choose, as the chooser.** Take the `part: passage` items and **sort them by `name`**, then judge each on its `name` and its `quote`, which is the passage text. Name order is not relevance order, which is the point of sorting by it: it presents the candidates in an order that tells you nothing, so the judgment is yours rather than the ranking's. It usually follows the source, and it is allocation order where a set was built over more than one ingest, so do not read position as position in the book. **Ignore `score`, `rank`, `vector_rank` and `lexical_rank`, and ignore any `idea` and `related` items the call returned**: it returns the passages in ranked order, with those attachments unless Step 1 named `--candidates-only`, and choosing by the ranking the step exists to second-guess is not choosing. Nothing else may enter this judgment either: not an expected answer, not the corpus, not the set file, not another question, not how this answer will be judged. **If Step 1 left you holding anything from outside that list, this judgment is not isolated and the result is not a measurement of the set.** Pick at most three, best first, fewer if fewer are worth reading and none if none can carry the answer. Judge whether a passage carries the material asked for, not whether it repeats the question's words; one that opens mid-topic may still run into the answer and one that echoes the question may not carry it. Where a question asks for two things, prefer a set covering both parts over three covering one. **You are selecting, not answering. A selection that composes an answer is a defect**: it makes the result a measurement of the chooser rather than of the set, and the answer is void. Name the chosen passages as a JSON list of `{"name", "score", "rank"}`, carrying each passage item's own `score` and `rank` unchanged, best first, and carrying `vector_rank` and `lexical_rank` too where the item has them, so the second call can say which ranker found each passage rather than losing it. **Carry that list on the next call's own command line and write no file.** A selection written into the owning root is an answer key: it names which passage answers a question, in a directory a later session searches by that question's own words, and it makes the set unmeasurable one question at a time.
3. **Recall the selection.** `recall --set <absolute set> --store <absolute graph.lbdb> --query "<the same question>" --select '<that JSON list>'`. Same set, same store, same question. Not `--rank` and not `--candidates-only`: a selection has already fixed the passages, and the tool refuses a flag that would rank or trim nothing.

Compose the answer only from what step 3 returned. If `retrieval` is `lexical` and the question is not MATCH, paraphrase recall is off; name that recipe limit, do not run FTS5, and do not invent Cypher. Report missing-engine, missing-weights or refused-import before opening source material; no substitute or invented CLI ids. Compose only from returned items: `name`, `quote`, `source_path`, the `part` each came from, and for embedding rows `score` and `rank`. A `passage` item's `quote` is the passage text itself. Never consume an `answer` field. Cite each supporting quote's path, with an evidence label per `standards/conventions.md`; an inference is labeled as such. **Do not re-open the corpus to locate a quote.** A graph item is located at ingest, which is what `experts/Knowledge Expert/graph.md` means by "No quote, no node" and "a passage is its own located quote", and locating it again in the answer re-establishes what ingest established. Whether the corpus has changed **since** ingest is a different obligation, and Pitfalls says how it is tested. Empty items mean `Not available: the set does not cover it`. The score ranks neighbours; it does not confirm canon. Seed items remain Candidates; label their claims `Unverified: requires confirmation` and do not infer node confirmation from the set-level marker. A blank `canon_confirmed` also makes the whole set unconfirmed; never fill it during recall. An as-of date is recorded, never filtered; graph items have no temporal fields to establish standing on that date.

**Hosted.** Read `experts/Knowledge Expert/hosted.md`, name hosted-unspecified, and stop before reading a source.

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

The answer, then a sources block: wiki pages cited, or each databased or graph quote with its corpus path, in the order the answer used them. Nothing is written to disk unless the requester asks for the answer as a file, which goes to the owning root's work directory per `standards/conventions.md`.

## Pitfalls

- **A graph result replaced by lexical hits or a precomposed answer.** Follow `experts/Knowledge Expert/graph.md`'s items contract. A lexical hit does not prove an edge, and a prerequisite stop yields no answer. A graph recipe still on `retrieval: lexical` cannot answer a paraphrase; name that limit instead of inventing MATCH or calling FTS5.

- **The chooser answering instead of choosing.** Step 2 of the graph branch is a selection, and a chooser that writes prose, reasons toward the answer, or picks by what it already believes has stopped measuring the set. Pick identifiers; the answer is composed in Step 4 from what the tool returned.

- **The ranked call made without `--rank`.** The flag existing in the tool is not the policy running. A graph recall that omits it retrieves a different, worse candidate set, and nothing in the result says so.

- **No set named and several exist.** Ask which. Never recall from each in turn and merge; the merge is exactly the cross-set leak the scoping prevents.
- **Filling the hole.** The set returned nothing and the answer is known. It is still `Not available`; the set is the collection, and the requester is told where the answer could be researched.
- **A quote not located.** The engine returned text and a path, and the text is not in the file. It is labeled, not trusted; the discrepancy goes to `skills/Knowledge Curation/` as a review note. **Against a graph set a mismatch means the corpus changed after ingest**, so it is a drift test and not a search. **Test it the way ingest tested it, or a sound quote fails.** A `passage` quote is a slice of its corpus file and is present in it byte for byte, so ask whether it is there **as a contiguous slice**. **An `idea`, `related` or `match` quote is not a slice**: ingest accepted it by collapsing whitespace on both sides and asking whether one contained the other, and it stored the text as extracted, so **test that quote with whitespace collapsed on both sides** and never by exact bytes or line by line. A corpus is usually hard wrapped, a quote spans the break, and the stricter test would label a sound claim `Unverified: requires confirmation` for a quote that is there. **Run it on every distinct quote the answer cites and on nothing else**: a graph answer composes from at most three chosen passages and the items attached to them, so that is a handful by construction, and **a candidate pool is never checked**.
- **An as-of answer presented as filtered.** The tool recorded the date on the retrieval object and did not filter. Say so every time; a reader who thinks the databased filtered will act on facts that had ended.


## Success

- Every databased claim in the answer shows a quote and a corpus path, or is marked as inference, and every quote shown was located in its file or labeled.
- The answer from an unconfirmed databased set carries `Unverified: requires confirmation` on every claim and says why.
- A question the set does not cover returned `Not available` with the reason and a route, and nothing from outside the set.
- An as-of answer states how the date was handled and reports dated facts by their own fields.
- A domain set's answer opens with its disclaimer.
- Wiki answers cite pages, and an empty index plus page search yields Not available. Graph composes from located items only or reports the named prerequisite stop in `experts/Knowledge Expert/graph.md`. A paraphrase question on a `retrieval: embedding` graph set issued a ranked call naming `--rank` and `--candidates-only`, a selection of at most three passages that composed nothing and **was written to no file**, and a `--select` call carrying that selection on its command line, and the answer rests on the third call's items. Hosted produces only its named stop.
- Three varied questions, one answered, one uncovered, one as-of, each produced the appropriate backend output without intervention.
