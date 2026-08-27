<!-- provenance-preamble -->
Provenance contract for this file. These are the rules this file holds itself to, and a claim that does not meet them does not enter. The marker lines above and below delimit this preamble so the close gates can exempt it from the claim scan; keep both.

**Registers.** Every quote, and every fact about a person, carries its sourcing register as a parenthetical naming the payload that register requires: `(Firsthand: <person who observed it>)`, `(Secondhand: relayed by <person>)`, `(Public statement: <where>)`, `(Research inference: E3, E11)`. `standards/conventions.md` owns what each register means and this file does not restate it. Firsthand names a person who observed the thing; a document is not an observer.

**Labels.** Every figure, reading, and checkable claim carries one of the four evidence labels defined in `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the entire vocabulary of this file. No fifth label is invented, and no shorter set is substituted. An unlabeled figure asserts it was measured.

**Anchors.** Every load-bearing claim ends with a verification anchor, a bracketed row id naming its row in `work/onboarding/verification.md`, written as `[V<n>]` with the row's number in place of `<n>`: row 7 is anchored as V7 in that form. A load-bearing claim is one a deliverable would act on: a prohibition, a compliance constraint, a commercial term, a named person's title or quote, a figure a deliverable would state. An anchored claim ends with its row id and carries no full stop after it.

**Figures.** Figures sit in a table with a provenance column, never in prose, because prose is where a unit, a denominator and a window get lost. The Key Facts table below ships its header row and carries the figures marker under its heading. Do not replace that table with a paragraph.

**Prompt lines.** A prompt line is a whole line that begins with `*` and ends with `*`. Every prompt line in this file is replaced during Instantiation, either with content or with a labeled absence. A surviving prompt line means this file is unfinished.

** A surviving token means this file is uninstantiated.
<!-- /provenance-preamble -->

# About [name]

What an agent needs to know about this client before doing work for them.

## Who This Client Is

*What the client does, who they serve, and the market they operate in.*

## Key Facts

<!-- figures -->

Every figure an agent must get right sits in the table below, one row each. A row carries the unit it is counted in, the denominator it is a share of, the tool that produced it, the window it covers, its evidence label, and the source it was read from. A row missing any of those is not ready to enter this file.

| Figure | Unit | Denominator | Tool | Window | Label | Source |
|--------|------|-------------|------|--------|-------|--------|

*One row per figure: products, scale, locations, and the measured history of this relationship. Never trim the rows to a round number and never drop a denominator to make a row read cleanly.*

*Facts that are not figures are written as sentences under this heading, each carrying its register and its anchor.*

## People

*Who matters on the client side: name, role, and what to know before writing to them or about them. Each person-fact carries its register, and a title or a quote carries its anchor.*

## What is being done

*The work this root produces for them, the workstreams it covers, and who owns the relationship.*

## What was bought

*The commercial terms: fee, term, volumes, and cadence. Which separately priced items are in scope, named as bought. A priced option that has not been bought is recorded here as out of scope; it is never recorded as scope.*

## Hard Constraints

*What must not be done: prohibitions, compliance flags, and anything the client or the organization serving them has said is not permitted. This heading takes what the source documents forbid, not what they propose. A constraint found in a source and not written here is the omission this heading exists to stop.*

## Current Focus

*What the client is working on now, and the date this was last confirmed.*
