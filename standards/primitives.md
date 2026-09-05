---
standard: primitives
version: 0.4.0
description: The three typed primitives, how they invoke and sequence one another, and the frontmatter every typed file carries
---

# Primitives

A primitive is an invocable unit of capability: an Expert, a Skill, or a Tool. Each is one directory named for itself, holding its typed file plus whatever supporting files it needs. The typed file declares what the primitive is; this standard owns that taxonomy and that declaration.

Division of labor: the body under the frontmatter follows `instruction-quality.md`, which owns how instructions are written and judged; the Play and Playbook formats belong to `play.md` and `playbook.md`; naming characters, formatting, and dates belong to `conventions.md`. Cite those standards; do not restate them here.

## The Three Types

| Type | File | What it is |
|------|------|------------|
| Skill | `SKILL.md` | A capability a user invokes by name for its output |
| Expert | `EXPERT.md` | A persona that carries a perspective, judges work through it, and sequences the skills a chain of work needs |
| Tool | `TOOL.md` | A deterministic operation skills and experts call |

This table is the single home of these definitions; routers cite it rather than restating it.

Litmus: it produces an output on request (Skill), it judges work through a lens and decides what the work needs next (Expert), or it runs the same way every time (Tool). A fourth type, a connector, is authenticated access to an outside platform; this release ships none, and the build that ships one defines it here.

## Invocation

Skills and experts invoke tools, and they alone do. Skills never invoke each other's internals, and neither do experts; behavior two of them share moves down into a tool, or the two are one primitive. Tools invoke no primitive.

An expert may select and sequence skills. It names the skill it picked before running it, and it may tell that skill which files to read. It never reaches inside a skill's steps, overrides its internals, or presents a skill's output as its own. Anything an expert does that runs the same way every time is a tool, not expert behavior.

A skill may run another skill by name where its own steps say so, handing over exactly what that skill declares it takes. **What no primitive may do is reach inside another's steps, override its internals, or present its output as its own**, and that is what this rule protects. A skill that finds itself needing another skill's internals has found a tool, or the two are one primitive.

## Placement

`skills/<Name>/SKILL.md`, `experts/<Name>/EXPERT.md`, `tools/<Name>/TOOL.md`.

- Those three directories are flat. Category is frontmatter metadata, never a folder tier: a primitive is identified by its declaration, not by where it sits.

## Names

A primitive's name is unique within its root, across all three types, compared case-insensitively: `Draft` and `draft` are one name, and no tool may take a skill's name. A name is how a user and a router reach a primitive, and one name with two answers is a routing failure.

## Frontmatter

Every typed file opens with this block:

```
---
name: <the primitive's name>
type: <skill | expert | tool>
category: <lowercase letters and hyphens>
description: <one line stating what invoking it yields>
version: <semantic version, starting at 0.1.0>
---
```

| Key | Rule |
|-----|------|
| `name` | Equals the containing directory's name exactly, character for character |
| `type` | Matches the typed file it sits in |
| `category` | One or more lowercase words joined by single hyphens; reuse a category the family already has when one fits |
| `description` | One line stating what invoking it yields, plain prose with no vertical bar; indexes display it verbatim |
| `version` | A digits-only triple, `MAJOR.MINOR.PATCH`, no suffix, starting at 0.1.0; raise it when behavior changes, and a behavior change requires re-verification |

All five are required. Two keys are optional. `memory` is a non-empty dash-list of the abstract keys the primitive requests, bound per the constitution's Workspace Model; never a scalar. `gaps` is a non-empty dash-list of short one-line descriptions of capabilities this root does not yet provide that the primitive's body names as missing; `system/GAPS.md` collects every declared gap, by hand. A body that says no primitive in this root covers something carries a matching `gaps` entry; omit the key when there is nothing to declare. Nothing else belongs in the block; a fact that fits none of these keys belongs in the body. An optional key with nothing to declare is omitted, never written empty.

The block is a flat map in exactly this grammar, deliberately small so that every host reads it identically:

- Line 1 of the file is `---`; the block closes at the next line that is only `---`; no blank lines between them.
- A scalar is `key: value`, one space after the colon, the value a single line.
- A list is `key:` with nothing after the colon, each item on its own line indented exactly two spaces: `  - item`.
- Keys appear once. Nothing else parses: no nesting, no inline collections, no anchors, no multi-line scalars, no comments.
- Quoting is double or none: double quotes are stripped. A value opening with a single quote, or carrying an unquoted `#`, reads differently across hosts, so it is not used. Double-quote a value carrying a colon (`"secrets:slack"`), a `#`, or one a general YAML reader would coerce (`"true"`, `"1.0"`); leave the rest bare.

## Indexes

Each family directory's AGENTS.md carries an index of that family, grouped by `category` and maintained by hand from this frontmatter; `name`, `category`, and `description` carry their rules so those tables stay correct.

## Done

A primitive is done when all of the following hold:

- Its directory name, its typed file, and its `name` agree, and that name collides with no other primitive in its root.
- Its frontmatter carries the five required keys in the flat shape above, and its `description` matches what invoking it actually yields.
- Its body passes `standards/instruction-quality.md`, including the three-varied-inputs verification.
