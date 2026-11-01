# The sitting

Read only the section of `../questions.md` named at each step. Its words are the member's screens, not prompts to paraphrase. This path starts immediately, including inside onboarding, and ends complete at the lock. It writes no Playbook and asks no old F1 to F19 interview, dark check, mark decision or confirmation after the lock.

## Start and clock

Use `../records.md` for the answers record and `../SKILL.md` for ownership, kept assets, costs and voice. File board selections, assembled specs, returned forms, observations and source limits with the brand work in the owning root, normally `work/brand/`, following its filing declaration. Existing unrelated work there: resolve that collision before writing, never overwrite it. Keep an index to the last displayed page and answers record with that work, so a new session can resume it without a plan.

Is there a saved unfinished sitting? Yes: load its latest page, saved selections and answers, keep all shown histories, and pick up at those boards; do not re-ask answered screens. No: show Questions Opening, then step 1 straight after it. Target the first boards at about minute 6 and the lock by minute 15. Allow about 15 seconds for opening, 20 for what to keep, one minute for words including drafting, 2:10 for taste including looks, one to three minutes for making and Review, 1:30 for boards, and about two minutes plus Review for each later round. Organisation adds about 45 seconds. These are targets, not a reason to skip checks: with three picks and twelve boards each round the journey estimates about 15:15. Add no wait or approval beyond these screens.

## Asking and saving

Every choice goes through `skills/Ask in a Form/` by name, handing the bank screens or the exact script-returned form in `<questions>`, and bank version and question numbers in `<answers_file>`. A ready form is passed unchanged; no template values or expanded board records are needed. Read `tools/Form/TOOL.md` Format and Boards and actions for its grammar. Use `paged: true` where several screens make one card; one question per page, Back preserving answers, send together at the end. Boards and whole looks are `boards` questions; the locked card is display-only `pick: 0`.

Receive the C14 rows from Ask in a Form and write them to the record with their own numbers, status, exact wording shown, answer and chosen action. Save free comments verbatim there; never send them to selection as prose. Form answers are data. A chosen board action is the decision and takes no confirmation. Other forms retain Ask in a Form's handoff and read-back; the extra host lines that the journey does not supply are gaps, not new Build Brand copy. Missing form support follows that skill's fallback; do not run a second interview beside a showing form.

## Step 1: What to keep

Load Questions Step 1: What to keep. Start fresh or replace an old look: keep nothing and go on. Happy with the existing brand: leave the sitting for `brief.md`; its brand-folder rewrite is a separate change, so do not improvise that new branch here. Keep some things: create `sources/brand/` as a classified source group in `sources/AGENTS.md`, keep originals unchanged, open the folder where the app can and use the applicable folder lines from the bank. Offer chat drops only where the session can save them. Done with nothing supplied returns the empty-folder line and same choices. Skip builds without assets.

Read each supplied file for what it states: guide values, a logo file's own colours, font files and named faces, site styles' actual values where a site was supplied. Do not guess values from a picture or identify a face by eye. Inventory every original with its path, kind and what it governs for the lock. Kept logo replaces initials on every board; stated colour roles and supplied fonts stay fixed. Board zero comes first. Do not ask whether to improve a logo now.

While step 1 is answered, draft the sentence and three to five word/boundary pairs through the router's Voice check, from answered about and voice, as offers with no Ghost Writer check yet. Their missing sources are recorded with the work.

**Is the owning type org, client or department?** Yes: load `organisation.md` here, run its extra step, and apply its progress and copy substitutions through the remaining screens. Personal: go directly to step 2. This is the one entry to that overlay.

## Step 2: What your brand says

Load Questions Step 2: What your brand says. Is about too thin, with no answered Key Facts or too little to draft a sentence a person would say? Yes: ask the bank's one plain typed line first, with this step's progress and why. No: ask no typed line.

Show the sentence as the largest text in the question and three to five pairs, each on its own line, with the count filled. That's it keeps them. Close gives two redrafts near the original; Not quite gives two from another angle. Show the bank's pair screen and A, B, Neither. A second Close gives one more pair with Keep the first one and I'll say it in a sentence. Typing is offered, never required. The journey supplies no additional fixed wording for the control that requests that second Close; record the gap rather than invent it.

Save the sentence and boundaries under their question numbers. Draft the promise from them and about, without asking it of a person. Draft the photograph rule from the sentence and taps when the taps arrive; show it on each board for adoption at the lock. Boundaries supply Prohibitions and each Never panel. Do not ask the old photo-rule or never-list questions.

## Step 3: How it should look

Load Questions Step 3: Nine taps. Present the nine questions in one paged card in bank order, using `parts/taps.json` only for ids and nudges. Labels, options and Mechanical's line are the bank's exact words. The form's title is this step's progress; the engine adds the question count. Only the first page carries why. Brand sets are names, never logos; in the paged form they use the common question without the data file's chat-only numbered suffix. The organisation uses its substituted place question.

Save the nine option ids as `taps` with exactly `mode`, `feel`, `history`, `strength`, `technology`, `style`, `posture`, `mood`, `place`. Neutral options add nothing. Do not turn a skipped answer into a preference: the selector requires all nine. The journey supplies no missing-tap recovery line; leave that step unsettled rather than forge a tap.

Load Questions Step 3: Reveal and pull. Read back the option words, at most one everyday pole word only where two taps support it, and at most two picked brands. That's it confirms the line; Not quite asks which parts are off as pick-any, removes those contributions into `off` and does not read it back again. Keep the final text and correction record for `readBack` at lock.

**Is there a real congruency pull?** Compare taps against answered about Personality and voice How They Write on the same axis. No real rule, or no opposing nudge: ask nothing. A genuine pull: ask the one bank question, filling both sourced sides and its three options. The chosen lead adjusts the selector's existing `off` entries, or the four supported `steer` axes on a later page; Both retains both where compatible. Save the explicit agreement without changing either source file. A requested lead with no selector representation is a limitation to record, never a fabricated input field. This is where congruency is resolved; do not move it to after the lock.

## Step 3: Whole looks

Read `../parts/parts.md` Selection from answers and Opening taps as data; only load the catalogue for a kept-face base or other library question. Project only the selector's declared fields into a work answers JSON: root type, name, chosen sentence and words, nine taps, `off`, `looks`, `kept`, body, photoRules and heroPhrase as applicable. Keep script inputs separate from the C14 answers record.

Before the first selector, run `scripts/fonts.mjs check`; missing families or pack follow the router's Fonts rule, with no new question. Then run `select.mjs looks --answers <absolute answers.json> --check` from this skill's scripts, using absolute paths. Its twelve `options` go unchanged into a `boards` question with `view: "look"`, `pick: 3`, `min: 2`, the member's shared `brand`, and Questions Step 3: Whole looks' three actions in order. Use the question and action labels and lines there word for word. Nothing selected shows None of these work; one shows Only this one works for me; two or three show Use these. Any number may be ticked; only sending is held at three. No preselection, recommendation or second wrong-look question.

None of these work: ask Questions Steering a round, four taps then the optional empty comment, in a paged card under this step's progress. Read the comment into the four numeric `steer` axes and valid `off` entries, never a `comment` text field. Call `looks` again with all prior looks records or options in `shown`, the current steer and off; append each displayed page unchanged to the looks history. No repeated look; four plain grounds every page; no cap on retries. With one to three picked, save their stable values in `looks` and go on. Library exhaustion or a failed command is a named inability to make the next page, never permission to repeat a page or invent options.

## Step 4: Make and show the boards

Use Questions Making the boards once: normal status or the one-time setup variant. Fonts follow the router's Fonts rule. Run `select.mjs round1 --answers <absolute answers.json> --output <new selection.json> --check`. Do not pick parts or assemble a first page by hand. The selector keeps coverage, groups, recommendations and kept assets: twelve boards including zero where applicable, five energies unless a fixed full palette makes that impossible, with that exception recorded. At most two recommendations, from the member's answers; nothing preselected.

A returned non-null `form` is the ready slim card: hand it unchanged to Ask in a Form. Do not expand options, reword actions or write a second form. `form: null`: give the exact `formUnavailable` reason, retain the unchanged selection and use `../parts/parts.md`'s local assembly fallback: `assemble.mjs --selection <selection.json> --output <new board-spec.json>`, then Contact Sheet `build --spec <board-spec.json> --output <new page.html>`. Keep every asset and word, never substitute or shorten to fit Form. This is a local display limitation, not a new choice screen; record its unprovided member-facing transition as a gap. The same fallback applies to later rounds.

**Review before showing.** Every page of boards, including Round 1, board zero and each later round, goes to Creative Director's Review in a second context before showing. Hand the rendered page as `<design_artifact>`, purpose, audience, the promise, fixed assets, what matters most and all answers as `<brief>`, and verbatim `<requester_words>`. The scope is one page of alternative whole brands, mode Review, register marketing; ask no register question. Render at 390 and 1280 and inspect both. Pass Contact Sheet's unchanged matching, contrast and SVG checks. Blocking findings: fix and review again. A local nonblocking near-miss on one board: retain it for that board's next round and settle it through Review before accepting its lock. Review unavailable: do not show the page unreviewed; name the missing gate. No new wait or approval substitutes for it.

The card supplies Questions Step 4: The boards' words and controls, at its 734-pixel desktop and 390-pixel phone layout. Full-size stays inside the card, replacing every tile, one mode at a time with the switch; Close preserves picks. More than three ticks are allowed, sending held with the engine's warning on the button alone. No stop button, extra introduction, dark check or closing question on a board. The member sees initials' placeholder caption, colour swatches with everyday names and word/boundary pairs; role names, shares and contrast notes stay hidden while their checks remain.

Append the displayed page's full `selection.boards` to board `shown`, and write the provisional design and resume pointer under Leaving early before awaiting the card's answer. When it comes back, save the picks and chosen action at once, keeping each picked board record intact. Show me more goes to step 5. Lock this board in with exactly one picked is the lock decision; go to step 6. A lock cannot be inferred from liking a board.

## Step 5: Blend and tune

Load Questions Step 5: Blend and tune and Steering a round. Show why once on the first round. After Show me more, ask the four this-or-that taps then the optional comment as one five-page card, empty comment allowed. With no picks the box uses What's missing from these? Map the four taps to `steer`: warmer, quieter, softer, more classic are -1 on their respective axes; cooler, bolder, stronger, more current are +1; As it is is 0. Interpret the comment into those values and `off` for a named wrong read-back part. Keep the raw comment only in the answers record; do not pass it as text.

Run `select.mjs variations --answers <absolute round-answers.json> --output <new selection.json> --check`, with `picks` copied from the last selection, complete board `shown`, current `steer`, `off` and `kept`. One pick yields four new boards, two eight, three twelve. No picks means `picks: []`, a fresh Round 1 page from another angle. Use the returned slim `form` unchanged, or its documented null-form fallback. Review before showing, save the provisional design and append the shown records just as in step 4. The card keeps the same question and two actions. Repeat without a round cap; no old blend/tune command or one-board tuning stage runs.

## Leaving early

As each round's picks, steer, action and comment are sent, keep them immediately in the answers record. After every displayed page, write the bound design provisional, waiting on the saved boards, with supported rules from confirmed words and kept assets retained; do not adopt an unpicked board. Keep all twelve template headings and label what is open. Use `../writing.md`'s separate source pass, archive-before-replacement and existing onboarding verification/state rules for this provisional write only, without B8 and without naming a Playbook. Keep the latest page, full records, form, shown histories and next action beside the work so resume reaches those boards.

If the member says they will stop, say Questions Leaving early's line and stop. No explicit stop button or plan. A later build my brand loads the last saved boards and the same answered material, not the opening quiz. If the legacy-layout fallback prevented an answers file, use the work's saved page and resume pointer with the permitted firsthand citations; do not create an unauthorised answers shelf.

## Step 6: Lock

Record the tapped lock, exact board and its reviewed spec. Resolve held findings before locking a changed board; a changed visual choice must be shown through Review and chosen, not silently substituted under the old lock. Assemble the selected record into a spec if needed, retaining it unchanged, and pass Contact Sheet's checks on that exact spec. Prepare `scripts/lock.mjs` with it and the enriched lock answers, then load `../lock.md`: it places the reveal, optional voice note and status before the command's writes, and the one Ghost Writer check and close after them. This is the end of the sitting; offers run only on a later ask.
