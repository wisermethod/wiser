<!-- provenance-preamble -->
Provenance contract for this file. These are the rules this file holds itself to, and a claim that does not meet them does not enter. The marker lines above and below delimit this preamble so the close gates can exempt it from the claim scan; keep both.

**Who writes this file.** The Build Voice skill owns this file and authors it, including the routing table and the authority key lines below. Instantiation of this root does not write voice from its own reading; it records what that skill returned.

**Traits are moves.** Every trait here is something a reader can look for in a piece of writing and say whether it is present. An adjective is not a trait: "the register is friendly" cannot be checked, "names the object before the feeling" can. A quality that cannot be checked that way does not enter the file.

**Registers.** Every quote, and every fact about a person, carries its sourcing register as a parenthetical naming the payload that register requires: `(Firsthand: <person who observed it>)`, `(Secondhand: relayed by <person>)`, `(Public statement: <where>)`, `(Research inference: E3, E11)`. `standards/conventions.md` owns what each register means. Firsthand names a person who observed the thing; a document is not an observer. A statement about what an audience believes is a research inference and names the evidence rows it derives from, or it does not enter.

**Labels.** Every checkable claim carries one of the four evidence labels defined in `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the entire vocabulary of this file. No fifth label is invented and no shorter set is substituted.

**Anchors.** Every load-bearing claim ends with a verification anchor, a bracketed row id naming its row in `work/onboarding/verification.md`, written as `[V<n>]` with the row's number in place of `<n>`: row 9 is anchored as V9 in that form. The register decision, its confirmation, and any counted claim about the client's own material are load-bearing. A key line below that carries a date or a count takes an anchor too.

**Prompt lines.** A prompt line is a whole line that begins with `*` and ends with `*`. Every prompt line here is replaced with content or with a labeled absence. A surviving prompt line means this file is unfinished.

**Placeholder tokens.** The placeholder token in this template is `[name]`. Instantiation replaces every one of them. A surviving token means this file is uninstantiated.
<!-- /provenance-preamble -->

# Voice of [name]

How this client sounds; the voice that governs work produced for them.

voice-authority-name: <the named person who confirmed this voice>
voice-authority-basis: <their role, and why the confirmation is theirs to give>
voice-confirmation-date: <the date they confirmed it, as YYYY-MM-DD, with its anchor>
voice-authority-fallback-signoff: <whose sign-off is still outstanding, when the authority above is a fallback rather than the owner; delete this line when the authority is the owner>

An authority nobody can name is not an authority. Where the person who set a rule cannot be identified, say so here and open a row for it in `todos/current.md` with an owner.

## Identity

*How the client presents itself, and what it wants to be known for.*

## Routing Table

Each output type this root produces, the register that governs it, and why that register and not another. Every output type this root was set up to produce gets a row. The register follows from what the outputs are for, not from whichever surface of the client was read first.

| Output type | Register | Why |
|-------------|----------|-----|

*One row per output type this root produces. A consumer-facing output does not inherit a corporate register because the corporate site was the easiest source to read.*

## Audience

*Who the client's material speaks to. Every statement about what those readers already believe is a research inference naming the evidence rows it came from, or it does not go here.*

## Tone

*Register and stance as moves a reader can check, and where they shift by channel or audience.*

## Vocabulary

*The client's own terms and spellings, and the words they will not use.*

## Structural Habits

*How their material is built: openings, length, headings, and any rules their brand guide sets. A length, a count, or a quotation is counted from the material itself and carries its anchor.*

## Prohibitions

*Claims, comparisons, words, and formats their brand forbids.*
