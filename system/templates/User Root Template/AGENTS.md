---
root: [name]
type:
layout: 2
---

# [name]

The Wiser constitution (`wiser/AGENTS.md`) and `standards/` govern the work here. This declaration projects `standards/user-root.md`. This template is inert until copied into an empty destination. Set type at copy-time to personal, org, client, department, or industry.

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
| `memory/knowledge/<set>/` | Knowledge sets, never bound by Provides | first use; empty `memory/knowledge/` may ship |
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
