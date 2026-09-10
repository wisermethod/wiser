---
standard: user-root
version: 0.2.0
description: One declared user-root tree and the clauses used to score its layout
---

# User Root

## Context

Applies to personal, org, client, department, and industry user roots. This is the layout authority, not a plugin layout or a procedure that authorizes changing a populated directory. Instruction quality is governed by `standards/instruction-quality.md`; formatting and archives by `standards/conventions.md`.

## C1 Identification

The constitution's Workspace Model (`wiser/AGENTS.md`) owns root identification. Its declaration is in root `AGENTS.md`: `type:`, a Provides block, the Wiser constitution citation, Onboarding state lines, and the declared-directory table. A folder set never identifies a user root. The frontmatter also carries `root:` and `layout:`, the latter this standard's current tree version (2). Increment that integer when this standard changes the tree; a version difference is a converge input, never permission to re-onboard. A missing layout version on an already-declared Wiser root is drift, not foreign identity.

## C2 One tree

All five types use C3. Type changes speaker, prompt sheets, competitors offer, and close intensity, never the directory set. Empty roots instantiate the template; populated roots require a cited plan.

## C3 Declared directories

The root's Work Directories table projects these rows. A first-use row is present when declared and unused, even if its directory does not yet exist. A ships row requires the path and the named router at instantiation. For a populated conversion, absent shipped paths become cited plan items rather than a template overlay.

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

A directory not in this table is not a root home. Plays file with their work, per `standards/play.md`. Work-subject playbooks stay with that work; root-changing playbooks use C8.

## C4 Work versus programs

Work has an end. A program does not.

A slug with a written completion condition files at `work/<slug>/`, or under its program at `programs/<slug>/<project>/`. A standing concern with no completion condition files at `programs/<slug>/`. Unsure is work.

Each slug's `AGENTS.md` states that completion condition or standing concern. An unresolved work condition is recorded as awaiting its owner, not invented. Moving a slug between work and programs is a Housekeeping plan gated by System Expert. The work and programs routers project this clause.

## C5 Inbox versus sources

Inbox is the drop zone for unclassified captures. Sources is classified originals, as received, for every type. A supplied original edited in place or filed as output is misfiled.

## C6 Bound memory versus knowledge

Provides binds about, voice, design to files. Competitors is bound only after confirmation per the constitution's Workspace Model. Knowledge sets live at `memory/knowledge/<set>/`; Provides does not bind that path. Mixing knowledge-set content into bound files is a defect. This clause gives Housekeeping a finding to hand off, not a bound-memory write.

## C7 Shared overlay

This root's own primitives live under `shared/` in the six families C3 names, never under memory. They must not reuse a composed plugin primitive's name, compared case-insensitively per `standards/primitives.md` Names. Score no-shadow against the composed plugin family indexes; unknown inventory is an absent proof, not a guessed pass. Credentials never live under `shared/`. A connector here is this root's; the gateway loads extra connector directories with `--connectors` (`gateway/SETUP.md`). A tool here is this root's local operation, not a plugin tool, and does not install into the plugin.

## C8 Root meta

The silent playbook home for a run that changes the root is `zBuilds/playbooks/`, not delivery. Root-meta actions live in `zBuilds/builds.md`. A root-changing Housekeeping plan is `zBuilds/playbooks/housekeeping.plan.md` when that directory exists; a target without it uses the caller's named gate directory. An absent ordinary plan home does not change this root-meta classification; Housekeeping owns bootstrap authority and recovery accounting.

## C9 Sites first use

The Work Directories table must have a first cell exactly `sites/`, backticked. Prose elsewhere is not a declaration. Declare the row for every type; do not create an empty directory. Site Author Context and Stand-up (`skills/Site Author/SKILL.md`) consume this row. Webmaster owns envelope internals.

## C10 Records

Every type keeps run-record, verification, audit, close-report, operating-file, extraction, evidence, and draft under `work/onboarding/`. OPER is `work/onboarding/operating-file.md`. SRC_DIR is `sources`. Retire `todos/current.md` and `work/onboarding-*.md` prefixed files. This fixes record placement; type still determines which records a run produces. Inbox remains the drop zone.

## C11 Archives

Create `work/zArchive/` at onboard for work deliverables. Memory replacement uses beside-the-file `zArchive/` per `standards/conventions.md` Archives. A run snapshot is additional recovery, not a replacement for that rule.

## Scoring

Score each clause present, absent, or misfiled and name the observed paths. Present means every applicable obligation holds, including conditional absence on first-use paths. Absent means required declaration, path, discriminator, or proof is missing. Misfiled means observed material or a declaration contradicts the clause; it outranks absent in an aggregate cell. No applicable object and no contradictory object is present (vacuous), not proof of a complete root. Empty scores missing required obligations but takes instantiate, never Housekeeping. Each converge row cites a clause, names its consumers, and separates structural repair from the identity or memory handoff.
