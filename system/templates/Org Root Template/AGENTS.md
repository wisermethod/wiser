---
root: [name]
type: org
---

# [name]

An organization's own root: its shared work, its facts, and its public voice.

The Wiser constitution and `standards/` govern the work here; this file declares only what is local.

## Provides
- about: memory/about.md
- voice: memory/voice.md
- design: memory/design.md

## Work Directories

This root's declared directories under `standards/conventions.md`:

| Directory | Holds |
|-----------|-------|
| `work/` | This root's deliverables and their drafts |
| `plays/` | This root's Plays (`standards/play.md`) |
| `playbooks/` | This root's Playbooks (`standards/playbook.md`); created on first use |
| `skills/` | This root's Skills (`standards/primitives.md`); ships with the template |
| `experts/` | This root's Experts; created on first use |
| `tools/` | This root's Tools; created on first use |
| `inbox/` | Quick captures with no home yet |
| `zArchive/` | This root's archive home; created on first use |

## Org Root

`voice` here is the organization's public voice, governing the outputs this root owns. Material that carries the organization's name but is authored in another root requests `voice:org`, `design:org`, and `about:org` to reach them.

A department is not a subdirectory here. A unit with facts or a register of its own becomes a department-type root composed alongside this one.

A shared credential, when one is taken, lives in `memory/secrets/` and is bound as `secrets:<platform>` in the Provides block above, per the constitution's Secrets rule; none is bound until then.

## Onboarding

Not onboarded. `skills/Onboard Root/` takes this root down its full path and rewrites these lines at Phase 9. `full-path.md` there says what each state means; the skill's Step 5 says what a key that is not complete refuses. A competitors line is added only when that offer was made.

- about: blocked (not onboarded)
- voice: blocked (not onboarded)
- design: blocked (not onboarded)
