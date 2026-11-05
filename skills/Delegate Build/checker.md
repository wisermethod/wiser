# Withheld acceptance

Apply before the builder starts, at Brief step 7. Use `skills/Prove Change/` Prove a change step 7 for showing controls able to fail.

- When is the checker first chosen? Before the build: write it outside every directory the brief names. After the builder returns: write it then. Will another builder run? Yes: use the before-build placement again. No: keep that placement.
- Does acceptance pin an inventory? Yes: pin only the branch's own additions, or state in the checker file how a later approved change amends it. No: add no inventory pin.
- Was the checker planned before the build? Yes: before the builder starts, run every check's controls on planted text that passes that check; a check failing on the unbuilt tree has not exercised its controls. No, first chosen after the builder returned: run the same controls before judging the delivery.
- Does it check text? Yes: also plant wrong sentences beside right ones in passing text. A wrong sentence passes through its neighbour: narrow that check to one clause, sentence or line and rerun it. None passes: retain the scope. No: no text-scope probe is needed.
- Does it check one sentence? Yes: try faithful sentences holding a version number and a decimal; bound the sentence by a full stop followed by space or line end. Either fails: repair the span and rerun it. Both pass: keep it. No: add no sentence span.
- Does it read a Markdown section? Yes: end at the next heading of the same or a higher level. No: add no section parser.
