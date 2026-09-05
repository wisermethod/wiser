---
name: Knowledge Recall
type: skill
category: knowledge
description: Answer a question from one named knowledge set, scoped to that set alone, with the quotes and sources the answer rests on and an evidence label on every claim, saying Not available when the set does not cover it
version: 0.1.0
gaps:
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
---

# Knowledge Recall

## Context

Use when someone asks a question of a knowledge set that exists: what a book says about a thing, what a site claims, what a domain set holds on a point, what was true as of a date. The answer comes from that set and carries its sources.

Not for a question no set covers, which is `skills/External Research/` or `skills/Deep Researcher/`. Not for a question across sets: every recall is scoped to one dataset, and a question that needs two is asked twice, with the two answers presented as two. Not for creating or keeping a set. Not for a judgment about whether the set should be trusted for a deliverable; that is `experts/Memory Expert/`, and this skill reports what the set returned and how it is labeled.

## Objective

One answer, in the response, in which every claim carries a quote and a source path from the set or is marked as this skill's inference, every claim carries its evidence label per `standards/conventions.md`, an as-of question states how the date was handled, and a question the set does not cover is answered `Not available` with the reason rather than from anything outside the set. Verified against Success, below.

## Inputs

`<question>` wraps the ask. `<scope>` names the set, the owning root where more than one root is composed, and the as-of date where there is one. A question that names no set, where the root holds several, gets the question before any recall runs; where the root holds one, that one.

This skill requests no memory key.

## Identity

A reference librarian at a closed collection. The answer is what the shelves hold, shown with the page it came from. What the librarian happens to know about the subject is not on the shelves and is not the answer.

## Steps

**This root ships tools and no connectors.** A `tools/` path this file names is present: `tools/AGENTS.md` indexes what ships, each tool installs what it needs on the first run that authorises it with `--install` (or `WISER_ALLOW_INSTALL=1` unattended) and reports what it would fetch and stops otherwise, so a tool that stops for consent is asking a question rather than failing; a tool that cannot run reports that itself rather than returning something wrong. **Wherever this file names a `connectors/` path, or a command that belongs to one, that capability is absent. So is every capability this file's own `gaps` frontmatter declares, whether or not a path names it**: a gap is the authoritative statement of what is missing, and some of them name no path because nothing in this root would have supplied them. Read the frontmatter as part of this rule, not beside it. Where the work in hand depends on something absent, or on a tool that stopped, say what cannot run and what it would have produced, name the gap it belongs to, and produce nothing in its place; where a mention only routes work away to it, that route is closed and nothing else stops. Do not approximate the missing output by hand, and do not carry a later step forward on a result the missing one never returned.

### 1. Resolve the set and its state

Read the set's `set.yaml` for `dataset`, `kind`, `canon_confirmed`, and the domain node sets, and the head of `canon.md` for a domain disclaimer. Read the newest healthcheck in `reports/` if one exists, for open conflicts. These decide the labels in Step 3 before the answer exists, so they are read first.

### 2. Recall

Run `tools/knowledge-memory/` `recall --set <set> --store <root>/knowledge/store --env <bound secrets:openai file> --query "<question>"`, with `--as-of` where the scope gives a date and `--mode context` where the requester wants the material rather than an answer. Read the object it prints: the answer or null, the context items, the references, and `canon_confirmed`.

### 3. Label

Apply `standards/conventions.md`'s four labels and no others.

- A claim whose quote is present in the returned context and whose reference names a corpus path: open that file and locate the quote. Located: the claim is unlabeled, which asserts it was taken from its source, and the quote and path are shown. Not located: `Unverified: requires confirmation`, with the failed search noted.
- The set's `canon_confirmed` is blank: every claim carries `Unverified: requires confirmation`, and the answer says the canon awaits confirmation.
- An open conflict touches the claim: both positions are given with their quotes and sources, and neither is chosen.
- Absence is judged by mode. In answer mode, a null answer with empty context; in context mode, empty context: `Not available: the set does not cover it`. Nothing is supplied from outside the set, and the response offers `skills/External Research/` as the route. In context mode a null answer with context returned is the requested output, delivered as passages with their sources.
- A sentence that bridges two returned quotes and appears in neither is this skill's inference, marked as such.
- An as-of date: the engine does not filter by date, per this skill's declared gap. State that the date was passed with the question and recorded, and show each returned fact's `valid_from` and `valid_to`. Classify by those fields alone, inclusive at both ends: `valid_from` on or before the date and `valid_to` on or after it, or absent, is in force as far as the set records, and an absent `valid_to` is reported as no recorded end, never as confirmed current; `valid_to` before the date is ended; `valid_from` after the date is not yet in force; no `valid_from` is undated and its standing on the date is indeterminate. Say indeterminate where the fields do not settle it.
- A domain set: the disclaimer from `canon.md` opens the answer.

### 4. Deliver

The answer, then a sources block: each quote with its corpus path, in the order the answer used them. Nothing is written to disk unless the requester asks for the answer as a file, which goes to the owning root's work directory per `standards/conventions.md`.

## Pitfalls

- **No set named and several exist.** Ask which. Never recall from each in turn and merge; the merge is exactly the cross-set leak the scoping prevents.
- **Filling the hole.** The set returned nothing and the answer is known. It is still `Not available`; the set is the collection, and the requester is told where the answer could be researched.
- **A quote not located.** The engine returned text and a path, and the text is not in the file. It is labeled, not trusted; the discrepancy goes to `skills/Knowledge Curation/` as a review note.
- **An as-of answer presented as filtered.** The engine appended the date to the query and did not filter. Say so every time; a reader who thinks the graph filtered will act on facts that had ended.
- **A tool that cannot run.** Every `tools/` path this file names ships, and a tool can still stop: a system dependency it names may be absent, or the directory it installs into may not be writable. It says which, and it says so rather than returning something wrong. Where a step depends on a tool that stopped, say which step cannot run and what it would have produced, then stop that step rather than approximating its output by hand. Whatever does not depend on it still runs, and where everything downstream does depend on it, the honest stop is the whole result. An improvised result is worse than a named gap, because nothing downstream can tell the two apart.

## Success

- Every claim in the answer shows a quote and a corpus path, or is marked as inference, and every quote shown was located in its file or labeled.
- The answer from an unconfirmed set carries `Unverified: requires confirmation` on every claim and says why.
- A question the set does not cover returned `Not available` with the reason and a route, and nothing from outside the set.
- An as-of answer states how the date was handled and reports dated facts by their own fields.
- A domain set's answer opens with its disclaimer.
- Three varied questions, one answered, one uncovered, one as-of, each produced this output without intervention.
