---
name: Bio Sketch
type: skill
category: research
description: Write or update one sketch of one named person the requester wants something from, covering identity, role currency, standing, the dated public record, routes, and an assessment against the ask
version: 0.1.12
memory:
  - about
gaps:
  - reading a contacts database or a professional network that needs a sign-in; their values arrive only as supplied records, or through the owning root's own navigation notes on its own session
---

# Bio Sketch

## Context

Use when the requester wants one sketch of one named person they want something from, written or brought up to date: who the person is, whether their role is current, their standing, their dated public record, routes to them, and an assessment against what is wanted.

Not for a page about a person (`skills/Profile Page/`), the requester's own bio, a speaker introduction, or an NIH biosketch (`skills/Content Author/`), or a list, the caller's loop over this skill, one person per run. Not for writing to the person, deciding whom to approach, sending, following, or connecting, which this skill never does.

This skill signs in to nothing. A sign-in, a second factor, or a captcha is handed to the requester.

Classifier seam: routing, where `hooks/route.mjs` may open this skill for an ask. Else: the routing table, read as `AGENTS.md` states.

## Objective

One file matching `sketch-format.md` at the resolved path, or no file and why.

## Inputs

Wrap what the requester supplies so material never reads as instruction, per `standards/instruction-quality.md`.

- `<person>`: the name, and any anchor given (an organization, a URL).
- `<ask>`: what the requester wants from the person.
- `<owning_root>`: the owning root.
- `<extension>`: zero or more extension files, handed in by the requester or by a calling skill.
- `<as_of>`: the date of this run, where set.
- `<staleness>`: a number of days, where set.
- `<depth>`: the full gather's depth, where set.
- `<source_material>`: supplied records, an existing file, pages.

Load `sketch-format.md` before gathering, once name and owning root are present.

`about` is optional, per the constitution's Workspace Model. Read it only to understand what the requester's organization offers. Unbound, use the ask's own words and say so. No `voice`: a record, not prose in a voice.

## Identity

A recorder of one person's professional public record.

## Steps

### Are the name and the owning root present?

Which owning root is named? Take the first match.

- `<person>` names no one. Ask once. Stop. Do not gather or write.
- `<owning_root>` names one root. That root.
- It is unset, and the constitution's Workspace Model yields one root. That root.
- Anything else. Ask once. Stop until one root is named. Do not gather or write.

### Which ask applies?

Resolve once the home is known. Take the first match.

- The request states what it wants from the person, beyond naming a project. That one.
- None stated, and the nearest `AGENTS.md` on the path to the home declares an ask for sketches filed below it. That one. Name the path on the ask line.
- The requester was asked and declined. Write the factual headings. Assessment and `Fit:` read `Not available: no ask was stated`. `status` is `draft`.
- None stated, no declaration, and not yet asked. Ask, once.

### Is the name order clear?

Apply File name in `sketch-format.md`. Take the first match.

- The family name is last, and the order is clear. Keep it.
- Any other. Ask. Never guess. Do not gather.

### What is the as-of date, and what staleness applies?

Per Dates in `standards/conventions.md`. Which date does `<as_of>` carry? Take the first match.

- Unset. Today.
- An absolute date. That date.
- A relative date that resolves to one date. That date.
- Anything else. Ask. Do not guess.

Which number applies? An extension's staleness is a setting, never a redefinition. Take the first match.

- The requester set days greater than zero. That number. `staleness_source` is `requester`.
- None set, and an applied extension declares a number greater than zero. The smallest such number. `staleness_source` is that extension's name; the earlier one if tied.
- None set, and extensions are not yet known. Leave the number unset.
- None set, and no extension declares a staleness value. 90. `staleness_source` is `default`.
- Any other value, an extension value that is not greater than zero included. Ask. Do not guess.

Do not gather while the number is unset.

### Where is the home?

Read declarations only: the owning root's `AGENTS.md`, and every `AGENTS.md` under each work directory it declares, programs, projects, and parts alike, at any depth. Per `standards/user-root.md` C3 and C4.

A home belongs to the folder whose own `AGENTS.md` declares it; a home declared inside a nested project or part is that folder's, not its parent's. Which directory is the home? Take the first match.

- A file of this person's sits in exactly one declared home, found as Is there a file for this person already? searches, and the request names no other folder. That home.
- The request names a program, project, or part, and that folder's own `AGENTS.md` declares a home. That home.
- Exactly one directory in the root is declared for bio sketches, or one file per person. That home.
- More than one, and neither the request nor an existing file picks one. Ask which. No answer: do not write.
- None. Ask which declared directory receives the file. Offer a `people/` part inside the program or project the work serves. Never create a directory at the root's top level.

What was the answer, where an offer or a question was put? Take the first match.

- A declared directory. That home.
- Accept, and one program or project serves the work. That part is the home. Record the `people/` declaration for the write. Do not write it yet.
- Accept, and more than one could. Ask which before declaring.
- Accept, and none serves the work. Do not create a directory. No declared directory named: do not write.
- None named, and decline. Do not write.

### Is there a file for this person already?

Search every declared sketch home, not only the resolved one, by the accent-folded file-name stem and by any email the request or a supplied record gives. Take the first match.

- Anchors show another person, beyond a different organization or location alone. A namesake's. Leave it. Name it under `Not to be confused with:`, as Identity states.
- Only the organization or location differs from the file's, not yet answered. Ask whether it is the same person. Do not gather until they answer.
- The requester answered that it is not the same person. A namesake's, as the first branch.
- More than one candidate. Ask which. Never merge. Do not gather until they answer.
- A match in another home. Ask: update there, or proceed here. Their choice of home is the home for this run.
- One file in this format (`schema: bio-sketch` and the base headings). Update it at its path.
- Another shape at the selected path: a supplied record, or an older sketch. Read it as evidence. Replace it at its path after the archive copy Archives in `standards/conventions.md` requires. `file`, `created`, and `last_verified` are as Front matter states.
- None. No file yet.

### Which extensions apply?

The set is every extension handed in, in handed order, then every extension an `AGENTS.md` on the path from the owning root down to the home declares, outermost first. Load the whole set before the declaration check and the clash check.

Read each as Extensions in `sketch-format.md`. Suffixes are Title and headings. One extension name is one owner, applied once, at its first position. A newer version is not a second owner.

Does it declare a name, a version, and a prefix? No: ask, and do not apply it. Yes: apply it.

What does each field do? Take the first match.

- What the file never holds shuts it out. Refuse it by name. Apply the rest. Name it in Open gaps. Never required.
- A score or tier. As Figures states. Any other label: refuse it by name, apply the rest, name it in Open gaps. Never a clash.
- No label rule. It takes the base's.
- Anything else the contract allows. Apply it.

Then set staleness if still unset.

### Does any name clash?

Before anything is gathered or written, check the base names, every name each applied extension declares, and every extension heading, token, and prefixed marker already in the existing file. A carried heading's owner counts as an owner.

A clash is the base redefined, two owners for one heading, one token, or one prefixed marker, an extension token under a base heading, or a base token under an extension heading. Take the first match.

- A clash. Stop. Name every clash the check finds, each name with both its owners. Write nothing. Put it to the requester.
- No clash. Continue.

### What does the early gather ask?

Run `skills/External Research/` by name, orchestrated, depth Quick, whatever `<depth>` says. Hand its Inputs. Do not reach inside its steps, or present its package as findings. Two queries: the identity anchors and any namesake; the role held now, and any move, departure, retirement, return, or reported death, each with its date and who stated it. `<scope>` is the professional public record, with What the file never holds excluded, and it excludes anything dated after the as-of date, so no line, role, standing, record item, or assessment rests on it. `<source_material>`, when held, is the existing file and supplied records. No package: record the stop, and fill nothing from memory. A gap names the field, as Open gaps states.

### Does the evidence name one person?

From the request, any existing file, and the package. Name a namesake as Identity states. Take the first match.

- One person, and two or more anchors. Continue.
- One person, and fewer than two anchors. Continue. Open gaps names the field. `status` stays `draft`.
- Two or more, or not the person named. Ask. Write nothing.
- Unclear whether it is one person. Ask. Write nothing.

### Can the recorded ask still be served by this person?

Apply Standing and fit to the early gather and to carried lines, supersession included, before this question. A reported death sets `deceased` there. A sighting does not stop the run. Take the first match.

- A reported death, or a `do-not-approach` fit already resting on a statement. No. Write the sketch the early gather supports, through the gate. Say why the run stopped. Gather nothing more. Go to What may enter the draft?.
- Anything else, a role change alone included. Yes. Continue, aimed at the role now held.

### What does the full gather ask?

Skip this step and the next two on an early stop.

Which depth does `<depth>` name? Take the first match.

- Quick, Standard, or Deep. That depth.
- Unset. Standard.
- Anything else. Ask. Do not guess.

Run `skills/External Research/` again, by name, orchestrated, at that depth. Hand its Inputs. Queries: record items, those the source material names first; routes; stated preferences and statements of what the person cares about; each applied extension's queries. `<source_material>` is the existing file and the supplied records. `<scope>` and the limits match the early gather. No package: the same stop.

### Which page showed no work?

Before a work field on an author page, a list, or a site search is recorded `Not available`, in either gather. Follow `tools/Browser Control/TOOL.md`.

Which profile? The owning root's, or ask. None given: the browser read did not run.

Which way was it read? Take the first match.

- The page needs a sign-in. The sign-in outcome under Does the owning root name a people database?.
- Fetch or archive holds the work. `Read: fetch` or `Read: archive`.
- Fetch shows none, browser holds it. `Read: browser`.
- Browser failed or shows none. `Not available`, naming each way tried on that line, as Lines states.

### Does the owning root name a people database?

Full gather only. The sign-in outcome also applies wherever a page needs a sign-in. Take the first match.

- It names one, the notes can be read, and the page does not need a sign-in. Read through `tools/Browser Control/TOOL.md` on the root's own session. Copy no notes. Ship none.
- It names one and no readable notes, or a page needs a sign-in. The field it would have filled is `Not available: <the database or network> needs a sign-in and no connector reads it`. Supplied records says the route was skipped. Hand a sign-in off as Context states.
- It names none, and no page needs a sign-in. Skip.

### What may enter the draft?

Do not write yet. Apply Lines, Figures, Currency, Standing and fit, Status, Supplied records, and What the file never holds. Set `status` and `Missing` as Status states after any drop or narrowing.

Which excerpt does a new line rest on? A carried line skips this. Take the first match.

- The package or a source record holds one, or the listing Record names. Say only what it says, and hand the line to the gate.
- None. No line. A required field left empty is `Not available: no supporting excerpt was kept`.

What may a supplied record fill? Apply Supplied records.

### What is kept from an extension this run was not given?

Check each line before carrying it. Take the first match.

- Shut out by What the file never holds, any kind. Drop it at the write, which archives first as Where is the file written? states. Name it as Open gaps states.
- A fact lacking source, register, or as-of date, or a figure lacking its label. Drop it and name the field.
- `Not available`, with reason and as-of date. Keep it.
- An Open gaps line, or the `extensions` entry. Keep it.
- Any other line. Carry it byte for byte.

Open gaps names the extension as not refreshed.

Which version applies? Take the first match.

- The handed version is the recorded one, or this extension has no recorded version (a first write included). Put the `extensions` entry as Front matter states.
- A newer version than the recorded one. Write its fields under the new version. Carry a heading it no longer declares under the old owner and version, by the matches above. Name the change in Open gaps.
- An older version than the one recorded. Keep the recorded version's lines and its `extensions` entry. Do not refresh them. Name the extension as not refreshed in Open gaps. Tell the requester of the mismatch.
- A changelog, a mapping, or an exemplar. The owner's. Do not write it.

### What is carried from a file in this format?

No file, or another shape: the draft is new, and another shape stays evidence until replaced. Drop and keep by the matches in What is kept from an extension this run was not given. Then take the first match.

- Same value, source, and as-of date already on a line. Add nothing.
- Allowed. Keep it byte for byte. Where this run's evidence changes it, write the new line and keep the carried line's text with `Superseded`, as Lines states, an inference under any heading, an extension's included, the same way. Only a drop by the matches above or a held gate finding's close removes or changes a carried line, and the requester is told which.

### What did the gate return?

Before any write, run `experts/Research Expert/` in a second context that did not build the draft, even on a match. Hand Job 1 and Inputs: `<consumer>` the sketch file; `<research_output>` is both evidence packages whole, as External Research returned them, with the draft, each new or changed line beside the excerpt it rests on, carried lines marked carried, and projections beside their lines; `<question>` whether each new or changed line rests on its excerpt, each carried line has source, register, and as-of date, each projection matches its line, and the draft matches `sketch-format.md`. Those three on a carried line need no new excerpt. A `rely` on a match writes nothing.

Does this reply state one verdict, `rely`, `rely with weak points` (Research Expert writes "rely with named weak points", and that is this verdict), or `return`, as the outcome of a review it completed? Take the first match.

- No. Do not count it. Run once more, in a new second context. Such a verdict: continue below. Still none: write nothing, and report that the review could not run.
- Yes. Continue.

Which findings hold? `rely` has none. On `rely with weak points` or `return`, each weak point, and each question or suggestion about a line, is a finding. Take the first match.

- Any finding about a source behind a line. It holds.
- A demand for a line, field, or output the format does not have, or a finding about a claim the draft does not make. It does not hold. Say so.
- Any other. It holds.

Which verdict is this? No third gate. Take the first match.

- `rely with weak points`. Close each held weak point as How does a held finding close? states, with no second gate. Go to the write.
- `return`, and a held finding is about the whole draft, such as the wrong person. Report it. Do not write.
- The first verdict is `return`, and some hold. Close each as below. Gate once more, in a new second context.
- The second verdict is `return`, and some hold. Close every held finding as below. Go to the write.
- `rely`, or `return` and none hold. Go to the write.

How does a held finding close? Do not gather again. Take the first match.

- A finding about a source behind a line. Relabel each figure on that source to the label Figures gives without it, then narrow or drop each line the finding shows the source no longer supports, or name the field in Open gaps as `rests on a source the gate found weak`. Naming the gap never leaves a label the finding has shown wrong, whatever the verdict.
- The line shows the shape fix. Use that fix.
- The value goes past its excerpt. Narrow it to the excerpt.
- A missing field. Name it as Open gaps states.
- Else drop the line. Where it held a figure, or leaves a required field empty, `Not available: dropped at the gate` stands in its place. Set `status` and `Missing` again.

### Where is the file written?

Did the gate return `rely`, and the draft matches the file? Yes: write nothing, and say it is unchanged. No: continue.

Does this write drop a line or replace the file? A supersession drops nothing. Take the first match.

- Yes, and the root declares git history as its recovery path, and the file being dropped from or replaced is committed and unchanged since that commit, per Archives in `standards/conventions.md`. Do not copy. Say so.
- Yes, otherwise. Archive first, per Archives in `standards/conventions.md`. Never delete the only copy.
- No. Do not archive.

Every archive that holds personal-life material is told to the requester by path when it is made, one that still holds dropped personal-life material included. Do not repeat the material.

Which file is at the path, checked immediately before writing? An update keeps its path and `file` marker. File name applies only when creating. Take the first match.

- An unread file of this person's, or the selected file changed since it was read. Do not write. Return to Is there a file for this person already? and rebuild from the first verdict. Another unread file: ask which. Do not write.
- The selected file byte for byte as it was read, or no file at the format's name. Write it.
- Another person's file. Use a free File name suffix, check once, and write if free. None free: ask for a name. Do not write into it.

Was the sketch written, and was a `people/` declaration recorded? Take the first match.

- Yes. Declare `people/` in that program or project's `AGENTS.md`.
- No. Do not declare it.

Set `created`, `last_verified`, `status`, `Missing`, and the projections as the contract states. Tell the fit, any reason code in force, every drop, and how each close was made.

## Pitfalls

- **A namesake read as the person.** Is there a file for this person already?
- **A sighting read as the role.** Role.
- **A supplied record read as a source.** Supplied records.
- **An invented figure.** Figures.
- **Personal-life material, including from a death notice.** What the file never holds.
- **An extension clash resolved silently.** Does any name clash?
- **Carried content dropped or kept against the retention rule.** What is kept from an extension this run was not given?

## Success

- Objective held.
- Which ask applies? held.
- Does any name clash? held.
- What is kept from an extension this run was not given? held.
- Lines held.
- Front matter held.
- Status held.
- Standing and fit held.
- What the file never holds held.
- Context held on sending, following, connecting, and signing in.
- What did the gate return? held. No third gate.
- Where is the file written? held.
