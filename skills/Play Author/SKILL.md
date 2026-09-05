---
name: Play Author
type: skill
category: authoring
description: Write or review Plays, primitive instruction bodies, and library components
version: 0.1.1
---

# Play Author

## Context

Use when writing or reviewing agent instructions: a Play, the body of a typed primitive (SKILL.md, EXPERT.md, TOOL.md), an AGENTS.md router, or a library component. Not for execution plans that span sessions; that is Playbook Author. Not for prose content; that is Content Author.

## Objective

Produce an instruction file an agent can execute without clarification, with consistent output across varied inputs, verified per the three-varied-inputs rule in `standards/instruction-quality.md`.

All principles live in `standards/instruction-quality.md`. Load it before writing; this skill adds only workflow.

## Before Writing

If the request is unclear, ask: What type of file? What does success look like? What content will it process? What scope? Do not guess; wrong assumptions waste time.

Reuse check: search this root's skills, the requesting owner's existing Plays (the home its AGENTS.md names, `plays/` if it is silent), and existing primitives before writing new. Extend or compose rather than duplicate.

## Output Types

| Type | Distinguisher |
|------|---------------|
| Play | Stands alone; one file; the whole file is the prompt |
| Primitive body | Lives in a typed file; routed by the chain; may reference supporting files |
| Library component | Pure reference; informs but never instructs; no objective |

Litmus: a file containing verbs that direct agent action is a Play or a primitive body, never a library component.

Play instances belong in the requesting owner's root, never in this plugin root. Default home is `plays/`. If that root's AGENTS.md names a different home, use it: a client root files the Play in the `work/<subject>/` folder of the work it produces, as `<does-this-thing>.play.md`.

## Writing Process

1. Identify the output type
2. Define context, negative boundary first
3. Define verifiable success
4. Write minimal; cut until quality would degrade
5. Add decision points wherever judgment is needed
6. Add pitfall responses
7. Verify with three varied inputs
8. On failure, diagnose which section broke: wrong scope is Context, wrong goal is Objective, missing information is Inputs, wrong judgment is Steps, unhandled edge case is Pitfalls. Fix that section; retest

## Composition

When files reference other files: state explicitly what to load and when; keep XML tags and terminology aligned across the set; test the full chain with realistic input. Composition fails at boundaries.

## Review Mode

For auditing an existing instruction file, follow the Review Process in `standards/instruction-quality.md` end to end, triage through the closing distillation pass. When the file references or is referenced by others, a TOOL.md beside its SETUP.md, a skill and the type files it loads, the composition review is not optional. A triage verdict of rewrite becomes a write: return to this skill's writing workflow with the old file as source material.

## Success

The file passes the three quality tests (clarity, completeness, elegance) and the three-varied-inputs verification.
