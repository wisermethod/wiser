<!-- provenance-preamble -->
Provenance contract for this file. These are the rules this file holds itself to, and a claim that does not meet them does not enter. The marker lines above and below delimit this preamble so the close gates can exempt it from the claim scan; keep both.

**Registers.** A claim about a competitor is a claim about an organisation or a person, so it carries its sourcing register as a parenthetical naming the payload that register requires: `(Firsthand: <person who observed it>)`, `(Secondhand: relayed by <person>)`, `(Public statement: <where>)`, `(Research inference: E3, E11)`. `standards/conventions.md` owns what each register means. A name the requester supplied is secondhand from that named person until a public source is found.

**Labels.** Every comparative, ranking, share and count carries one of the four evidence labels defined in `standards/conventions.md`, written in square brackets in place: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the entire vocabulary of this file. Verified means located in the source, not true; a third party's unaudited ranking is not Verified.

**Anchors.** Every load-bearing claim ends with a verification anchor, a bracketed row id naming its row in `work/onboarding/verification.md`, written as `[V<n>]` with the row's number in place of `<n>`: row 4 is anchored as V4 in that form. A ranking, a share, a "larger than" and an "only" are load-bearing and are read back before they enter.

**Comparatives.** Every comparative, ranking and share figure carries its unit, its denominator and the window it covers. Never trim a list to a round number. Never encode a comparative in a heading or a folder name.

**Prompt lines.** A prompt line is a whole line that begins with `*` and ends with `*`. Every prompt line here is replaced with content or with a labeled absence.

**
<!-- /provenance-preamble -->

# Competitors of [name]

Who this client competes with, confirmed with the requester. Downstream work loads this file when a deliverable names, ranks, or differentiates against another party.

This file ships as a stub and is not bound. The `competitors` key is added to the Provides block in this root's `AGENTS.md` only after the set has been confirmed by a named person on a dated exchange, and only once this file has been written from that confirmed set. A Provides line pointing at a stub is a failed close. If the offer is answered **not now**, delete this file at close so an unbound key has no file on disk, and record the deferral in `todos/current.md` with a named owner and a status. If the offer is answered **no**, delete this file at close and record the decline in `work/onboarding/run-record.md` so a later session can see it was asked and settled. A decline opens no operating item and is not asked again this run: turning a settled no into an open gap is how a later session comes back and re-asks it. Either way the per-key close records `competitors: unbound`.

## The Set

*The named competitors this root will treat as the set, who confirmed it, and the date. Names suggested and declined sit here too, with who declined them, so they are not re-suggested.*

## Per Competitor

One heading per confirmed competitor, the competitor's own name.

### [Competitor]

*What they are, where they sit relative to this client, and what this client will and will not claim about them. Every comparative, ranking, and share figure carries its unit, denominator, window, and a sourcing register. Never trim this list to a round number.*

## Missed and Unknown

*Competitors the requester named that public research did not surface, each sourced as secondhand from that named person until a public source is found. Areas the requester said they do not compete, as claims, not as colour.*
