---
root: [name]
type: client
---

# [name]

A client's root: the work done for them, the facts known about them, and their brand voice.

The composed Wiser root's constitution and `standards/` govern the work here; this file declares only what is local to this root.

## Provides
- about: memory/about.md
- voice: memory/voice.md
- design: memory/design.md

`competitors` is deliberately not bound here. `memory/competitors.md` ships as a stub of headings and prompt lines, and a Provides line pointing at a stub is a failed close. The key is bound, as `competitors: memory/competitors.md`, only after the set has been confirmed by a named person on a dated exchange and the file has been written from that confirmed set. Until then the key stays unbound, which is a complete state and not a missing file.

Bind abstract keys to files that exist. Never bind `memory/` as a directory, and never bind a key to a path that is not there yet.

## Where to put something

One question: **what are you holding?** If you already know, it does not go in `inbox/`. If you do not know yet, it does not go anywhere else.

| You are holding | Put it here | Why this folder exists |
|-----------------|-------------|------------------------|
| A file or note you have not classified yet | `inbox/` | A waiting room. The moment you know what it is, it leaves. |
| An action that still needs doing | `todos/current.md` | The living list. Not the file the action produces. |
| A document the client supplied, or that arrived about them | `sources/` | The originals, as received. Do not edit in place. |
| A deliverable or draft being made for them | `work/<subject>/` | This root's output. Filing is in `work/AGENTS.md`. |
| A recipe for work in that subject | `work/<subject>/<does-this-thing>.play.md` | Lives with the work it produces. Not a top-level folder. |
| A multi-session plan for that subject | `work/<subject>/<does-this-thing>.playbook.md` | Lives with the work it plans. The folder is the run; no date in the filename. |
| Records from creating this root | `work/onboarding/` | Evidence the bound files were checked. Not the todo list. |
| A fact, voice rule, or design rule later jobs must get right | `memory/` | What every later skill loads. Provides binds the files. |
| A replaced file | `zArchive/` next to the original | Recovery. Naming is in `standards/conventions.md`. |

### inbox vs work vs sources vs todos

Four different objects. Mixing them is how a root becomes a junk drawer.

- **inbox** is unclassified. A PDF dropped in conversation sits here until someone says what it is.
- **sources** is classified input. The client sent it, or it was gathered as evidence. Inventoried, not rewritten.
- **work** is classified output. It is being made here, or it was. A draft and its final sit together in a subject folder.
- **todos** is classified action. Someone still has to do it. The pitch deck is `work/content/`; "Dana owes a quote for slide 4" is a row in `todos/current.md`.

A todo is not a place to put files. The list item lives here; the artifact it points at lives in `work/` or `sources/`. A file named `TODO-pitch.md` in `inbox/` is a misfile: it is a draft (`work/media/`) plus a list row.

### Play vs Playbook vs Skill

A Skill is not a client-root object. Do not create `skills/` here. How a recurring piece of work gets done for this client is a Play or a Playbook, filed in the subject folder of the work it serves.

**Skill** (lives in the Wiser root, invoked by name). A shared capability the chain routes to: Content Author, Onboard Root, Deep Researcher. Stateless. No Decision Log. No memory of where the last sitting stopped. Many roots reuse it. If every client would need the same thing, it is a Skill in the plugin, not a file in this root.

**Play** (`<does-this-thing>.play.md` in the subject folder). A recipe for one repeatable outcome this client owns. One file is the whole prompt. Recurs with different inputs, one sitting, same quality. "How this client's monthly byline gets written" sits in `work/content/monthly-byline.play.md` next to the bylines it produces. You open the file; the chain does not index it.

**Playbook** (`<does-this-thing>.playbook.md` in the subject folder). A plan that spans sittings and must remember decisions: checkboxes, Decision Log, Progress, resume instructions. "The Q4 launch" sits in `work/campaigns/Q4-2026/q4-launch.playbook.md`. The folder is the run, so the filename has no date. The deliverables the plan produces sit beside it, not inside it. When the run completes, archive the playbook next to itself.

**Reusable Playbook** (Type: Template). Same process, many runs. The master is undated and named for the process, in the parent of the runs: `work/campaigns/launch.playbook.md`. Each new campaign copies it into that campaign's folder as `launch.playbook.md` and executes the copy. Learnings that generalize go back to the master on purpose; the copy's checkboxes stay in the campaign.

The difference that matters: a reusable Playbook still has a run. It accumulates state, then you copy it for the next campaign. A Skill has no run. It is the same capability every time, for every client, with no memory of the last time. Promoting a client Playbook into a Skill because it "feels reusable" is how this client's Q4 decisions leak into the next client's launch.

A one-off job is none of these: just do it, and file the output in `work/<subject>/`.

This root's AGENTS.md is the home declaration `standards/play.md` and `standards/playbook.md` allow: Plays and Playbooks live in the subject folder they serve, not in top-level `plays/` or `playbooks/`. Do not create those directories. Do not create `skills/`.

## Work Directories

This root's declared directories under `standards/conventions.md`. The table above is what a person uses; this table is what an agent files against.

| Directory | Holds |
|-----------|-------|
| `work/` | Deliverables, drafts, and the Plays and Playbooks of the subject they serve. Filing is in `work/AGENTS.md`. |
| `sources/` | Documents supplied for this client, as received |
| `todos/` | The living list of open actions; the file is `todos/current.md` |
| `inbox/` | Unclassified captures |
| `zArchive/` | This root's archive home |

## Client Root

`voice` here is the client's brand voice, governing every output this root owns. When an output owned here goes out under an organization's name rather than the client's, request `voice:org` and `design:org`, and `about:org` for any facts it states about that organization.

`memory/about.md` holds this client's facts. `memory/competitors.md`, when bound, holds the confirmed competitive set. The sourcing rules in `standards/conventions.md` bite hardest here, where most of what is worth recording is a fact about a person.

A root that holds shared credentials adds `memory/secrets/`, binds each as `secrets:<platform>` in the Provides block above, and never commits a value.

Brands, markets, and legal entities of this client live in this root until one of them has its own voice, its own facts, and its own engagement. Then ask whether that brand earns its own client root. Do not split on sight.

## Instantiation

This section is temporary. It governs the copy, the fill, and the per-key close, and it is deleted only when every memory key is complete or unbound.

### Copy and replace

1. Copy this template into the workspace under this root's real name, spelled as the people involved spell the short name. `root:` in the frontmatter matches that folder name.
2. Replace `[name]` everywhere it appears, here, in every file under `memory/`, and in `todos/current.md`. Leave `type: client` as it is.
3. The directories that ship with this template are the whole standing tree. Do not create workstream folders under `work/` in advance; `work/AGENTS.md` governs what gets created and when.

### Fill, per key

Fill `memory/about.md` and `memory/design.md` here, replacing each prompt line with content. A prompt line is a whole line that begins with `*` and ends with `*`, and none may survive.

A heading with no answer does not get a sentence of its own invention. It gets one of the four evidence labels from `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the whole vocabulary. Do not invent a fifth and do not substitute a shorter set.

`memory/voice.md` is not authored here. The Build Voice skill owns that file and writes it, including its routing table and its authority key lines. Instantiation records what that skill returned and nothing more.

### The competitors offer

1. Ask whether this root should hold a competitors file. Three answers: yes, not now, no.
2. On yes, suggest a set from public sources as an evidence package, each name carrying the source that caused the suggestion and the date it was retrieved. No ranking, no round number, no share figure before confirmation.
3. Put the whole suggested list to the requester: which to keep, which to drop, which the research missed. Record who confirmed it and on what date.
4. Write `memory/competitors.md` from the confirmed set only, then add `competitors: memory/competitors.md` to the Provides block above. Bind after confirmation, never before.
5. On not now, delete `memory/competitors.md`, leave the key unbound, and record the deferral in `todos/current.md` with a named owner and a status. A deferral nobody owns is not a deferral.
6. On no, delete `memory/competitors.md`, leave the key unbound, and record the answer in `work/onboarding/run-record.md` so the decline is visible to a later session. Do not open an operating item. The offer is not asked again this run, and a declined offer is a complete outcome, not an open gap that a later session picks up and re-asks.

Both outcomes record `competitors: unbound` in the per-key close. An unbound key with no file is the correct declined state; a stub left on disk unbound is inert but pointless.

### Per-key close

Closing is per memory key, not one switch for the root. Each of `about`, `voice`, `design`, and `competitors` when the offer was accepted, closes in one of three states, and the state is recorded under `## Per-key close` in `work/onboarding/run-record.md`:

- **complete**: every heading answered or carrying its label, and every load-bearing claim read back against the source it cites.
- **provisional**: bound and usable, with named gaps outstanding, each carrying an owner and a status in `todos/current.md`.
- **blocked**: not usable, with the blocker named as a person, a credential, or a capability.

`competitors` may additionally be **unbound**, which is the declined or deferred offer. Unbound is a complete outcome, not a provisional one, and not a failure.

### What a non-complete key refuses

The refusal is scoped to the keys that are not complete, never to the root as a whole. While a key is provisional or blocked, refuse a deliverable write that would load that key, name the key and its state, and ask to finish it. A deliverable that loads only complete keys proceeds: a deferred voice does not block a facts-only deliverable, and a root with one provisional key is not reported as a failed onboarding.

### Deleting this section

Delete this section when every key is complete or unbound. While any key is provisional or blocked, keep this section, and keep it naming each such key by name and by state, so a later session reads the refusal and knows exactly which keys it covers. A retained section that does not name its keys is no better than no section at all.
