---
standard: primitives
version: 0.3.0
description: The four typed primitives, how they invoke and sequence one another, and the frontmatter every typed file carries
---

# Primitives

A primitive is an invocable unit of capability: an Expert, a Skill, a Tool, or a Connector. Each is one directory named for itself, holding its typed file plus whatever supporting files it needs. The typed file declares what the primitive is; this standard owns that taxonomy and that declaration.

Division of labor: the body under the frontmatter follows `instruction-quality.md`, which owns how instructions are written and judged; the Play and Playbook formats belong to `play.md` and `playbook.md`; naming characters, formatting, and dates belong to `conventions.md`. Cite those standards; do not restate them here.

## The Four Types

| Type | File | What it is |
|------|------|------------|
| Skill | `SKILL.md` | A capability a user invokes by name for its output |
| Expert | `EXPERT.md` | A persona that carries a perspective, judges work through it, and sequences the skills a chain of work needs |
| Tool | `TOOL.md` | A deterministic operation skills and experts call |
| Connector | `CONNECTOR.md` | Authenticated access to an outside platform |

This table is the single home of these definitions; routers cite it rather than restating it.

Litmus: it produces an output on request (Skill), it judges work through a lens and decides what the work needs next (Expert), it runs the same way every time (Tool), or its hard part is authenticating to somewhere else (Connector).

## Connector Bodies

A connector's typed file is always `CONNECTOR.md`. What sits beside it is one of two shapes, and a connector directory is one shape or the other, never both.

| Generation | Body | How a harness reaches it |
|------------|------|--------------------------|
| CLI | Scripts invoked with flags, taking `--env` at a bound credential file | A skill or expert runs a command |
| New | A local stdio MCP server reaching an authenticated gateway | The harness attaches it as an MCP server |

Both are connectors under the definition above: the hard part of each is authenticating to somewhere else. Only the socket differs. A new-generation connector holds no credential file, so it requests no `secrets:<platform>` key in its frontmatter, and the absence of that key is a declaration rather than an omission.

Two generations live at once on purpose. New connectors are new generation; the CLI connectors already in this root keep `--env` until later Playbooks archive them, and `--env` is not retired. The contracts governing what a connector's scripts do and how a new connector is classified before it is built are not carried in this root, so a connector authored here is held to this standard alone; neither those rules nor the charter's account of where secrets live are restated here.

## Invocation

Skills and experts invoke tools and connectors, and they alone do. Skills never invoke each other's internals, and neither do experts; behavior two of them share moves down into a tool, or the two are one primitive. Tools and connectors invoke no primitive; the one exception is a Composite tool's parent routing to its own sub-tools.

An expert may select and sequence skills. It names the skill it picked before running it, and it may tell that skill which files to read. It never reaches inside a skill's steps, overrides its internals, or presents a skill's output as its own. A skill still never calls another skill: the expert is the only sequencer, and a file one skill wrote is the only channel to the next. Anything an expert does that runs the same way every time is a tool, not expert behavior.

## Placement

`skills/<Name>/SKILL.md`, `experts/<Name>/EXPERT.md`, `tools/<Name>/TOOL.md`, `connectors/<Name>/CONNECTOR.md`.

- Those four directories are flat. Category is frontmatter metadata, never a folder tier: a primitive is identified by its declaration, not by where it sits.
- One exception to flatness: a Composite tool, a tool whose directory holds sub-tools exactly one level deeper, `tools/<Name>/<Sub>/TOOL.md`. A sub-tool is a full typed file with `type: tool`; there is no composite type. Sub-tools require their parent's `tools/<Name>/TOOL.md` to exist and route to them. No primitive nests deeper.
- Overlays live in owned roots per the constitution's Workspace Model, and their typed files follow this standard. A release gate scans only the root it runs in; overlay authors hold their own files to the standard themselves.

## Names

A primitive's name is unique within its root, across all four types, compared case-insensitively: `Draft` and `draft` are one name, and no tool may take a skill's name. A name is how a user and a router reach a primitive, and one name with two answers is a routing failure. Sub-tool names share the namespace, because they too are invocable by name; a generic sub-tool name like `List` spends a root-wide name, so prefix it when siblings elsewhere might want it. The same name appearing in an owned root's overlay, declared with `replaces` in its frontmatter, is replacement rather than collision; the constitution governs which answers.

## Frontmatter

Every typed file opens with this block:

```
---
name: <the primitive's name>
type: <skill | expert | tool | connector>
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

All five are required. Three keys are optional. `memory` is a non-empty dash-list of the abstract keys the primitive requests, bound per the constitution's Workspace Model; never a scalar. `gaps` is a non-empty dash-list of short one-line descriptions of capabilities this root does not yet provide that the primitive's body names as missing; the release gate collects every declared gap into `system/GAPS.md`. A body that says no primitive in this root covers something carries a matching `gaps` entry; omit the key when there is nothing to declare. `replaces` marks an owned-root overlay, and only a top-level primitive may carry it, never a sub-tool. It is a single-line scalar, byte-equal to the overlay's own `name`; copy the shared primitive's spelling exactly, since the target is found by the same case-insensitive match Names uses. That target must exist in the shared root with this file's `type`: a `replaces` whose target is missing marks a stale overlay, and a same-name primitive without the key is a collision, not a replacement. The key never appears in this root, and the gate rejects it here. Nothing else belongs in the block; a fact that fits none of these keys belongs in the body. An optional key with nothing to declare is omitted, never written empty.

The block is a flat map in exactly this grammar, deliberately small so that every host and the dependency-free release parser read it identically:

- Line 1 of the file is `---`; the block closes at the next line that is only `---`; no blank lines between them.
- A scalar is `key: value`, one space after the colon, the value a single line.
- A list is `key:` with nothing after the colon, each item on its own line indented exactly two spaces: `  - item`.
- Keys appear once. Nothing else parses: no nesting, no inline collections, no anchors, no multi-line scalars, no comments.
- Quoting is double or none: double quotes are stripped. A value opening with a single quote, or carrying an unquoted `#`, reads differently across hosts, so the gate rejects it. Double-quote a value carrying a colon (`"secrets:slack"`), a `#`, or one a general YAML reader would coerce (`"true"`, `"1.0"`); leave the rest bare.

## Indexes

Each family directory's AGENTS.md carries an index generated from this frontmatter at release, grouped by `category`; `name`, `category`, and `description` carry their rules so those tables stay correct. Sub-tools never appear in an index; their parent routes to them. This root carries no generator, so each family index is maintained by hand against this frontmatter.

## Done

A primitive is done when all of the following hold:

- Its directory name, its typed file, and its `name` agree, and that name collides with no other primitive in its root.
- Its frontmatter carries the five required keys in the flat shape above, and its `description` matches what invoking it actually yields.
- Its body passes `standards/instruction-quality.md`, including the three-varied-inputs verification.
