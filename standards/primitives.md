---
standard: primitives
version: 0.11.0
description: The four typed primitives, how they invoke and sequence one another, the frontmatter every typed file carries, and the classifier seam a new typed file declares, and any file whose seam changes
---

# Primitives

A primitive is an invocable unit of capability: an Expert, a Skill, a Tool, or a Connector. Each is one directory named for itself, holding its typed file plus whatever supporting files it needs. The typed file declares what the primitive is; this standard owns that taxonomy and that declaration.

Division of labor: the body under the frontmatter follows `instruction-quality.md`, which owns how instructions are written and judged; the Play and Playbook formats belong to `play.md` and `playbook.md`; naming characters, formatting, and dates belong to `conventions.md`. Cite those standards; do not restate them here.

## The Four Types

| Type | File | What it is |
|------|------|------------|
| Skill | `SKILL.md` | A capability a user invokes by name for its output |
| Expert | `EXPERT.md` | A persona that carries a perspective, judges work through it, and sequences the skills a chain of work needs |
| Tool | `TOOL.md` | A deterministic operation skills and experts call; a classifier answer it asks for is one of its inputs, recorded and accepted back, per Invocation |
| Connector | `CONNECTOR.md` | Authenticated access to an outside platform, loaded by the root's gateway |

This table is the single home of these definitions; routers cite it rather than restating it.

Litmus: it produces an output on request (Skill), it judges work through a lens and decides what the work needs next (Expert), it runs the same way every time (Tool), or it reaches an outside account the person connected (Connector).

## Invocation

Skills and experts invoke tools, and they alone do. Skills never invoke each other's internals, and neither do experts; behavior two of them share moves down into a tool, or the two are one primitive. Tools invoke no primitive. Skills and experts invoke connectors by action id through the gateway; they never import a connector module, never read a credential, and never present a vendor body as their own judgment.

**A tool may put a closed judgment to the classifier through the gateway**, where its `TOOL.md` names the judgment and the path that settles it when no classifier answers, and declares both as Classifier Seam states; it reaches the gateway for that call and nothing else. **The answer is an input the tool records, not a result it computes.** Its output carries the answer as received, with every confidence or score in it as returned, the question and the candidates it was asked over, and which path settled the judgment. The tool accepts that record back as an input, in which case it makes no call and settles the judgment the same way; a record whose question or candidates differ from the ones this run would send is refused, not applied. A tool that reads live state, a page or a site, replays the judgment on the candidates it recorded, does not claim to reproduce that state, and acts on live state only after reading it again. Every measurement, count and calculation the tool reports comes from its own code; the classifier's confidence appears only as the record of that one judgment. **It makes no live call unless the session's binding verifies**: the record `hooks/` writes for the session from the roots it composes, read through the session identity the harness gives the tool and checked against the process that runs it, as `hooks/AGENTS.md` states. The binding must name exactly one owning root, whose `AGENTS.md` the tool can read and which no `AGENTS.md` at or above it declares `classifier_refusal: yes` when the tool sends, the same test `hooks/` applies and stricter than `standards/user-root.md` C13 alone, and whose own scan below it, bounded as `hooks/AGENTS.md` states, found no such declaration. A root the caller names must be that root, and a live call names at least one file or store as the material of the judgment, each an existing absolute path that sits inside that root and is not refused where it sits. Where a live call is not made, for want of a verified session, a single root, a readable root that does not refuse, a matching caller-named root, or material inside it, the tool takes its own path; a matching replay record makes no live call and needs none of these. Which root owns the work is neither the tool's to resolve nor the model's to name, and a harness that writes no binding leaves every tool on its own path.

**Skills and experts do not put their own decisions or Success lines to the classifier.** What a classifier answer is, and what its absence leaves, is the constitution's `## Classifier`.

An expert may select and sequence skills. It names the skill it picked before running it, and it may tell that skill which files to read. It never reaches inside a skill's steps, overrides its internals, or presents a skill's output as its own. Anything an expert does that runs the same way every time is a tool, not expert behavior.

A skill may run another skill by name where its own steps say so, handing over exactly what that skill declares it takes. **What no primitive may do is reach inside another's steps, override its internals, or present its output as its own**, and that is what this rule protects. A skill that finds itself needing another skill's internals has found a tool, or the two are one primitive.

## Classifier Seam

A classifier seam is a closed judgment a classifier could answer for a primitive: a question whose answer is one of the candidates named before it is asked, or "none of these", which the judgment admits as an answer. Code puts the question to the classifier, and the seam has a path that settles it when no classifier answers. Every new skill, expert and tool, and any file whose seam changes, declares its seams, or declares that it has none, so that where the classifier reaches in a root is read off its files rather than found by running them. A typed file first written under an earlier version of this standard may carry none until a change adds or alters a seam in it, as Done states. A connector carries no declaration: it is transport and makes no judgment of its own, and which action serves a request is the gateway's, per `gateway/AGENTS.md`.

**The declaration is one line in the typed file's Context**, in one of two forms:

```
Classifier seam: none.
Classifier seam: <each seam, naming in backticks the code that makes the call>. Else: <the path that settles each one without a classifier>.
```

It is read the way `experts/AGENTS.md` reads an `Owns:` line. It starts at the left margin, is never wrapped, and sits under a `## Context` heading at column 0, outside any code block or comment. It ends with a period, and the seam form names its else path once, after `Else: `. A file carries one such line. The keyword anywhere else in the file, or in a Context line that is not the declaration, is an error. The declaration is a line in the body and not a key, for two reasons: Frontmatter admits no key beyond those it lists, and nothing reads the line at run time. An author, a reviewer and a gate read it, and no host decides from it whether to call.

**The call is made by code, never chosen by the model.** A seam is a call made by the route hook before the model starts, by a tool's own script under Invocation, or by the gateway. A judgment that would reach the classifier only if the model chose to ask is not a seam and is not declared. What that allows each type:

- **A tool's seam** is the closed judgment its script puts to the classifier under Invocation, the one its `TOOL.md` names. Its else path is the path that settles the judgment when no classifier answers.
- **A skill's or an expert's seam is never one of its own steps, decisions or Success lines**, which Invocation keeps its own. It is one of two things:
  - **Routing**, where an index that `hooks/` reads lists the primitive, so the route hook can open it for an ask. Its else path is the routing table, read as the constitution states.
  - **A judgment inside a tool or a gateway action that one of its steps runs.** Its else path is what that step does when the tool or action settles without the classifier.

  A primitive with more than one seam names each, and its one `Else: ` gives each else path in the same order.

**A seam is released only when it passes being run both ways.** Declaring a seam that already runs, without changing it, is not adding one. The change that adds or alters a seam runs the primitive three times with no classifier and three times with one. The six runs are interleaved in an order fixed before the first, on the same cases in both arms, assigned before any run, that include at least one whose right answer is none of the candidates, and the judgment admits "none of these" as an answer. The cases' right answers come from two readers who did not produce the cases and agree without seeing each other's labels, or from an existing labelled set scored under its own frozen rule. A reader who does not know which arm produced a deliverable scores it against the primitive's Success lines, item by item. It passes when both hold:

- **Without a classifier, the primitive meets its own release bar**: the three-varied-inputs verification `instruction-quality.md` requires, judged on its Success lines. That arm is what everyone without a classifier runs, and a seam never excuses it.
- **With a classifier, it matches that arm and costs less.** Its median of Success items met is no more than 2% of the items scored below the without arm's median, with the none-of-these cases counted; every case whose right answer is none of the candidates is answered as none in each with-arm run; and on no single case does the with arm's median fall below the without arm's by more than one Success item. Its end-to-end wall time and its cost are each below the without arm's range, which means below the lowest of the without arm's three per-repeat medians, for wall time and for cost separately, each counting the classifier's own time and cost and every fallback's. **Where a wrong answer acts on the world**, such as a click or a write, each error in the with arm is also shown to be caught and undone in at least 2 of 3 live repeats, and none goes unnoticed.

A seam that fails is not shipped. The primitive ships without it, declaring the seams that remain, and its else path is what runs. The runs belong to the change, as Done places a verification, and are recorded where that change records it. The typed file carries the declaration and never the runs.

## Connector Bodies

A connector is one directory under `connectors/`, named for the service, holding `CONNECTOR.md`, `manifest.json`, `index.js`, and `auth.md`. The directory is flat; modules are files and keys inside that directory, not nested service folders. Templates live at `system/templates/Connector Template/`, never as a directory under `connectors/`.

The New generation is a module the root's gateway loads and serves over stdio. The person attaches one process, `gateway/server.js`. That process loads every connector's manifest, resolves each action id, applies policy, and either runs the action or returns a status object that names the next step. A hosted client that cannot spawn a process gets the provider's hosted catalog only, documented as such in `gateway/SETUP.md`.

A module holds no credential. Vendor grants live with the auth provider. A local-file module's key is `--secret <service>=<abs file>` or a Provides `secrets:<platform>` path the root names, never a default directory in a root, and never `memory/secrets/`. The module receives a context (`catalog`, `proxy`, `http` when unwrap is allowed, `audit`) and never a provider client. It imports Node built-ins and files inside its own directory only. It never reads a credential file, never writes a file, and never names a provider slug. Agent-facing ids are `service.module.action`. A grant is per module: two modules are two `needs_connect` stops.

`CONNECTOR.md` uses the same five required frontmatter keys as the other types, with `type: connector`. Risk, confirmation, privilege, and execution live in `manifest.json`, not in that block. An action no manifest declares never runs.

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

All five are required. Two keys are optional. `memory` is a non-empty dash-list of the abstract keys the primitive requests, bound per the constitution's Workspace Model; never a scalar. `gaps` is a non-empty dash-list of short one-line descriptions of capabilities this root does not yet provide that the primitive's body names as missing; The **owning root's own** `system/GAPS.md` collects every declared gap, by hand: a primitive's gaps are collected in the root that ships that primitive, and a domain plugin's gaps never project into the base's, which `standards/plugin-root.md` C4 scores misfiled as a base file naming a domain plugin. A root whose primitives declare no gap needs no such file, and the first primitive that declares one creates it. A body that says no primitive in this root covers something carries a matching `gaps` entry; omit the key when there is nothing to declare. Nothing else belongs in the block; a fact that fits none of these keys belongs in the body. An optional key with nothing to declare is omitted, never written empty.

The block is a flat map in exactly this grammar, deliberately small so that every host reads it identically:

- Line 1 of the file is `---`; the block closes at the next line that is only `---`; no blank lines between them.
- A scalar is `key: value`, one space after the colon, the value a single line.
- A list is `key:` with nothing after the colon, each item on its own line indented exactly two spaces: `  - item`.
- Keys appear once. Nothing else parses: no nesting, no inline collections, no anchors, no multi-line scalars, no comments.
- Quoting is double or none: double quotes are stripped. A value opening with a single quote, or carrying an unquoted `#`, reads differently across hosts, so it is not used. Double-quote a value carrying a colon (`"secrets:slack"`), a `#`, or one a general YAML reader would coerce (`"true"`, `"1.0"`); leave the rest bare.

## Indexes

Each family directory's AGENTS.md carries an index of that family, grouped by `category` and maintained by hand from this frontmatter; `name`, `category`, and `description` carry their rules so those tables stay correct. Ownership is a projection of `Owns:` / `Stands alone:`, never of frontmatter: the experts index projects each `Owns:` line and the skills index projects the inverse as Owner; category headings remain the grouping.

**A skill whose declared yield cannot be produced at all without a connector this release does not ship says so at the end of its description**, so a reader of the index learns it there rather than after opening the file; one that is merely degraded without a connector declares that in `gaps` alone. The sentence is the skill's own and the index projects it like any other, which is what keeps the index a projection. The build that ships a connector removes the sentence with it.

## Done

A primitive is done when all of the following hold:

- Its directory name, its typed file, and its `name` agree, and that name collides with no other primitive in its root.
- Its frontmatter carries the five required keys in the flat shape above, and its `description` matches what invoking it actually yields.
- Its body passes `standards/instruction-quality.md`.
- A skill, expert or tool carries its classifier seam declaration in its Context, in the form Classifier Seam states. A typed file first written under an earlier version of this standard may carry none until a change adds or alters a seam in it. A file that carries the line is held to the form.

**Done does not assert that a primitive has been run, and no root may claim that it has.**
`instruction-quality.md` requires the three-varied-inputs verification of a change that authors or
revises an instruction. That obligation sits on the change, and it is discharged by the change,
rather than standing as a permanent property the file carries afterward.

This clause used to make the verification a condition of Done, and the effect was that **no
primitive in any root was ever Done.** Measured in `wiser` on 2026-09-19: zero of 89 typed files
carried a record of such a run, while runs for 27 of them existed and were unreachable from the
primitive. A condition that nothing satisfies and nothing checks is not a standard; it is a wish
that makes every other clause here look optional by association.

Where a change runs the verification, it states in that change what the run covered **and what it
did not**. Where no change has run it, the primitive is Done on the clauses above and the
verification is owed, not assumed.
