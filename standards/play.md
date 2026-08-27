---
standard: play
version: 0.1.2
description: The Play format; what a Play is, its frontmatter, where it lives, and when it is done
---

# Play

A Play is a standalone instruction file for a repeatable outcome. One file, one outcome; the whole file is the prompt, so an agent handed nothing but this file can execute it. Its body follows the skeleton in `standards/instruction-quality.md`, which owns how instructions are written and judged. This standard owns only the format.

## What a Play Is Not

| Not this | Because | Where it lives |
|----------|---------|----------------|
| A Skill | A Skill is a shared invocable capability that the chain routes to and many roots reuse | This root's `skills/` |
| A Playbook | A Playbook is a multi-session execution plan that carries state and decision history; see `standards/playbook.md` | per that standard |
| A library component | A library component is pure reference; it informs but never instructs and has no objective | beside whatever loads it |

Litmus: a single instruction file directing agent action toward one repeatable outcome, owned by one root, is a Play. Standalone means the instructions are complete in one file; the data a Play processes and the memory keys it requests are inputs, not dependencies.

## When to Write One

Write a Play when a task will recur with different inputs and you want the same quality every time.

Do not write one for work that happens once; execute it instead. Do not write one for work that spans sessions and accumulates decisions; that is a Playbook, and when it also recurs, a Template Playbook (`standards/playbook.md`).

## Frontmatter

Every Play opens with this block:

```
---
name: <the Play's name, matching the file name>
type: play
description: <one line stating what the Play produces>
version: <semantic version, starting at 0.1.0>
---
```

All four fields are required; the one optional field, `memory`, lists the abstract keys the Play requests, bound per the constitution's Workspace Model. Nothing else belongs in the block. Indexes read this frontmatter; keep `description` accurate. Raise `version` when behavior changes; a behavior change requires re-verification.

## Placement and Naming

- Play instances live in the owning root, never in this plugin root. This root ships the format and the authoring skill (`skills/Play Author/`), not Play instances.
- Default home, if the owning root's AGENTS.md is silent: `plays/<name>.md`.
- A root's AGENTS.md may declare a different home. A client root places each Play in the `work/<subject>/` folder of the work it produces, named `<does-this-thing>.play.md`.
- One Play is one file. A Play that has grown to need supporting instruction files is no longer standing alone. If other clients would need the same capability, make it a Skill in this root. If only this client needs it, keep the supporting files in that subject folder; do not create a client `skills/` overlay to hold a Play that got long.
- Naming characters, casing, and dates follow `standards/conventions.md`.

## Done

A Play is done when all of the following hold:

- It passes the three-varied-inputs verification defined in `standards/instruction-quality.md`.
- Its frontmatter is complete and its `description` matches what the Play actually produces.
- It sits where the owning root's AGENTS.md places it.
