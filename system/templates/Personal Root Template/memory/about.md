<!-- provenance-preamble -->
Provenance contract for this file. These are the rules this file holds itself to, and a claim that does not meet them does not enter. The marker lines above and below delimit this preamble so the close gates can exempt it from the claim scan; keep both.

**Registers.** Every quote, and every fact about a person, carries its sourcing register as a parenthetical naming the payload that register requires: `(Firsthand: <person who observed it>)`, `(Secondhand: relayed by <person>)`, `(Public statement: <where>)`, `(Research inference: <evidence row ids>)`. `standards/conventions.md` owns what each register means and this file does not restate it. Firsthand names a person who observed the thing; a document is not an observer. A durable claim about anything other than a person names the source it was read from, or it is marked unverified.

**Labels.** Every figure, reading, and checkable claim carries one of the four evidence labels defined in `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the entire vocabulary of this file. No fifth label is invented, and no shorter set is substituted. A heading with no answer takes one of the four with its reason, never a bare sentence saying the answer is missing. An unlabeled figure asserts it was measured.

**Prompt lines.** A prompt line is a whole line that begins with `*` and ends with `*`. Every prompt line is replaced during Instantiation, either with content or with a labeled absence. A surviving prompt line means the file is unfinished.

**Placeholder tokens.** The placeholder token in this template is `[name]`. Instantiation replaces every one of them. A surviving token means the file is uninstantiated.

**Scope.** These rules bind `voice.md` and `design.md` in this folder as well as this file, and they are stated once, here.
<!-- /provenance-preamble -->

# About [name]

What an agent needs to know about this person before working in this root.

## Who

*Role, what they do, and where; one or two lines.*

## Key Facts

*Durable facts that change how an agent acts: location and time zone, working languages, standing constraints and preferences.*

## Relationships

*The organizations, clients, and teams this person works with, and their part in each.*

## Current Focus

*What is live now, and the date this was last confirmed.*
