---
root: [name]
type:
layout: 5
classifier_refusal: no
---

# [name]

The Wiser constitution (`wiser/AGENTS.md`) and `standards/` govern the work here. This declaration projects `standards/user-root.md`. This template is inert until copied into an empty destination. Set type at copy-time to personal, org, client, department, or industry.

## Always

These lines restate rules of the Wiser constitution for an app that has not loaded it. Where the two differ, the constitution governs.

- **Find the skill first.** Before any task, find Wiser's skill or expert for it and follow it: in the installed Wiser plugin where this app has one, otherwise by calling Wiser's `find_skill` with the request in the person's own words and loading what it names with `load_skill`. Only a plain question of fact needs none. (Precedence and routing)
- **A question gets an answer.** A question is answered, never acted on. Asked what you think, or `thoughts?`, judge the work and say so; write, send, change and delete nothing. (Behavioral Core)
- **Name the loss before the write.** Is the file one this folder's Provides lists as its about, voice, design or competitors file, and would this write replace or delete an answered heading, or replace or delete the file while any heading is answered? A heading is answered when, with the provenance preamble removed, its section holds a line that is not a prompt line, a whole line that begins and ends with `*`, and not only an evidence label in square brackets. The file's title is not a heading. Yes: ask a question that names what would be lost, and wait for their yes. The request that asked for the change is not that yes, and until it comes neither copy that file nor write it. No: before replacing or deleting it, say what the old one holds that will be lost. Either way, once the write is allowed, first copy the file to the archive this file names for it (a `zArchive` folder beside it where none is named), under a name no earlier copy has. Stop if that name exists. (Irreversibles)
- **Never promise to stop asking.** When the person asks not to be asked before something Wiser does through a connected account, do not agree in chat: that is a standing approval, and only Wiser's Standing Approval skill can make one, so find it and follow it. Any other lasting way of working they ask for goes to Wiser's Save Preference skill. A review, and the question Irreversibles requires before this folder's about, voice, design or competitors file is overwritten or deleted, are never waived this way. (Precedence and routing)
- **A review is owed until it runs.** When a skill calls for a review in another context and this app cannot open one, say the review is still owed, offer to run it in a new chat given the work and the reviewer's file, and do not call the work final until it has run. The person may decline a review of a piece of work; a review of a change to this folder cannot be declined. (Behavioral Core)

## Provides

- about: memory/about.md
- voice: memory/voice.md
- design: memory/design.md

Competitors follows the constitution's Workspace Model. Knowledge sets are not Provides bindings.

## Work Directories

| Directory | Holds | Ships or first-use |
|-----------|-------|--------------------|
| `work/` | Projects with a written completion condition at `work/<slug>/`. Unsure defaults here. Router: `work/AGENTS.md` | ships, with router |
| `programs/` | Standing concerns without a completion condition at `programs/<slug>/`. Programs contain their projects at `programs/<slug>/<project>/`. Router: `programs/AGENTS.md` | ships, with router, no slug folders |
| `sites/` | One envelope per domain wrapping `site/` (the kit), named for the registrable host, lowercase, no scheme, no `www` unless `www` is a distinct property. Envelope internals belong to Webmaster | declared always; created on first use, never empty |
| `sources/` | Classified originals, as received. Do not edit in place. Router: `sources/AGENTS.md` | ships, with router |
| `inbox/` | Unclassified captures | ships |
| `memory/` | Bound files for about, voice, design, and competitors only when bound. Provides binds files, never this directory | ships bound stubs |
| `memory/knowledge/<set>/` | Knowledge sets, never bound by Provides. Router: `memory/knowledge/AGENTS.md` | first use; empty `memory/knowledge/` may ship |
| `memory/answers/` | Dated answer files from a voice or design build, never bound by Provides. Router: `memory/answers/AGENTS.md` | ships, with router |
| `shared/` | This root's own skills, playbooks, experts, templates, tools, and connectors, each in its family directory. Never under memory | first use; declared row |
| `zBuilds/` | Root-meta playbooks, `builds.md`, Housekeeping plans at `zBuilds/playbooks/housekeeping.plan.md` | first use; declared row |
| `work/onboarding/` | Onboarding records for every type. Router: `work/onboarding/AGENTS.md` | ships |
| `work/zArchive/` | Archive home for work deliverables | created at onboard; declared |

Filing follows `standards/user-root.md` C4 to C11. Memory uses beside-the-file archives per `standards/conventions.md` Archives. The work archive row does not redirect memory archives.

## Onboarding

Not onboarded. `skills/Onboard Root/` sets the type and closes each key under its personal or full path; those files own the state grammar.

- about: blocked (not onboarded)
- voice: blocked (not onboarded)
- design: blocked (not onboarded)
