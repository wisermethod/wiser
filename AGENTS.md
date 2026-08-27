---
root: wiser
---

# Wiser

The general knowledge-work plugin: the skills, experts, and standards that a knowledge worker uses for agentic work, in their own voice, on their own material.

**This file is this root's constitution.** Where a primitive cites "the constitution", it means this file. The chain starts here: load it before the first read or write under this root.

This root is a capability product, owned by EffectiveSC.

## What this root is

An authoring tree, not a working folder. Nothing here is anyone's work product; everything here is the capability that such work uses. Output belongs in the working folder a session attaches, never in this root.

## Writes

Writes land only under this root, and in use this root is read-only.

Never write to another root composed in the same workspace, whatever its permissions look like on disk. A workspace that happens to compose a root is not permission to edit it.

## Workspace Model

The attached working folder is the **owning root**: the personal, org, client, department, or industry folder the user attached for this work. Its own `AGENTS.md` declares its `type` and a **Provides** block binding abstract keys to files. **A root is identified by that declaration, never by its folder name.** Before the first read or write under any path in the working folder, load that directory's `AGENTS.md`, or the nearest ancestor's if it has none; absence is never permission.

**Abstract keys and the Provides block.** Primitives do not name files; they request keys, and the owning root's Provides block binds each key to a file.

- The keys are `voice`, `about`, `design`, `secrets:<platform>`, and the optional `competitors`.
- An **unscoped** key resolves in the root that owns the output. A **scoped** key, written `voice:org` or `voice:client`, resolves in the root of that type.
- More than one plausible root, or none: ask. Never hunt.

**When a key is unbound.**

- A **required** key unbound: stop and ask.
- An **optional** key unbound: name what degraded, and proceed.
- `competitors` is optional and is bound only where a competitive set has been confirmed. Unbound means there is no confirmed set, so work that names, ranks, or differentiates against another party says so and proceeds. **Never invent a set to finish the sentence.**
- **A bound file whose headings say its content is not yet defined counts as unavailable.** Name the degradation the same way, and never invent what it would have said.

**Secrets.** A `secrets:<platform>` key resolves through a Provides binding; unbound, the personal root's `memory/secrets/` is the only default. Found nowhere: stop and ask. **A secret's contents never enter the conversation, a log, a commit, or another file.**

**This plugin is read-only in use.** Never write under this root during a session. Outputs land in the working folder, in the directories that folder's own `AGENTS.md` declares.

## Behavioral Core

Binding on any work done through this root.

- Ambiguous requests get a clarifying question; uncertain interpretations get stated and confirmed. A pure question gets an answer, never execution.
- For non-trivial work, state the approach, the alternatives considered, and the confidence in it before executing.
- Challenge flaws, weak evidence, and better alternatives; defer to sound reasoning, new context, or an explained trade-off. **Do not auto-defer on pushback**: restate unless the point was addressed.
- Execute what the host can execute. Never hand the user steps you could run yourself; where the host cannot act, say so and hand off the smallest possible step.
- **A review runs in a context that did not produce the work.** Delegate it, handing over the work and the reviewing primitive, never the reasoning that produced the work.

Guard rails, binding for any shared artifact:

- Never modify the thing being tested to make a test pass. A failing test found a problem; report it.
- Fixes flow toward the root cause, never toward accommodating a problem elsewhere.
- Before modifying anything shared, name its consumers. Unable to name them, look harder first.
- **A bug is existing behavior that is wrong; missing infrastructure is behavior that does not exist yet.** Report gaps; never bridge them by degrading a component.

## Irreversibles

**A secret's contents never enter the conversation, a log, a commit, or another file.**

**Nothing is ever written under this root**, nor to the top level of any root. Output lands in the working folder, in the directories that folder's own `AGENTS.md` declares. The one exception is a tool's first-run dependency cache on the user's own machine, per that tool's own contract, and this root ships no tools.

**Nothing is deleted or overwritten without naming what is being lost first.** Where a root's own `AGENTS.md` declares an archive home, a file is archived there before it is replaced.

## Precedence and routing

A workspace usually composes this root alongside an owning root and any context roots. They are peers on disk and not peers in process.

- **This root governs how work is done:** which skill or expert owns a task, what a deliverable must satisfy, which standards bind.
- **The owning root governs what the work is about and where it lands:** voice, about, design, domain routing, and filing.
- Read this root first, then the owning root, then context roots as the task needs.
- Where they conflict on **how** work is done, this root wins. Where they conflict on **facts, voice, or filing**, the owning root wins.
- Do not invent parallel rules in a workspace. If a rule seems missing, it is in the chain: find it rather than restating it.

For any deliverable, consult `skills/AGENTS.md` and `experts/AGENTS.md` and pick the skill or expert that owns the work before drafting. Load that file; naming it is not loading it.

## Standards

`standards/` is binding on work in this root, not advisory.

| Standard | Owns |
|----------|------|
| `standards/primitives.md` | The four primitive types, how they invoke one another, and the typed-file frontmatter |
| `standards/instruction-quality.md` | How instructions are written and judged; the sole home of Elegance |
| `standards/conventions.md` | Formatting, dates, naming, working files, root layout, archives, sourcing, evidence labels |
| `standards/play.md` | The Play format |
| `standards/playbook.md` | The Playbook format |

Each family's `AGENTS.md` carries an index of that family. **This root carries no generator, so those indexes are maintained by hand** against the frontmatter of what is actually present.

## What this root does not carry

Stated here so a reader is not left hunting for it. This root ships skills, experts, and the standards binding them. It does not ship tools, connectors, a release gate, a generated plugin projection, or a separate runtime charter. Where a primitive's step depends on one of those, that primitive says so at the step and declares the lost capability in its `gaps` frontmatter. **`system/GAPS.md` collects every declared gap in one place.**

## Working under this root

Work that changes this root is planned as a Playbook, per `standards/playbook.md`.

`system/templates/` holds the root templates a new working folder is created from, and `skills/Onboard Root/` is what reads them. Everything under `system/templates/` is inert: a template's `AGENTS.md` and declarations belong to the copy it will become, not to this chain.
