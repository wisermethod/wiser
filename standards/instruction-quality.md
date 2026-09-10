---
standard: instruction-quality
version: 0.1.2
description: How instructions are written in and around Wiser; the sole home of the Elegance definition
---

# Instruction Quality

Every instruction file in this system (the bodies of SKILL.md, EXPERT.md, and TOOL.md, Plays, Playbooks, and AGENTS.md routers) is written to this standard. Other files cite this standard; none restate it.

## Elegance

Elegance is complete thinking distilled: nothing missing, nothing wasted. It is not brevity; a one-page play and a fifty-page playbook can each be elegant.

**The threshold test:** can you remove anything without degrading the result? If yes, cut it.

**Structural clarity:** each thing appears once, in the right place. If you find yourself restating, the structure is wrong.

**Rank:** correctness always outranks elegance. In review, elegance is judged last: Objective, then Boundaries, then Failure modes, then Position, then Elegance.

**The checkpoint:** before declaring non-trivial work done, pause: knowing what I know now, is there a cleaner way? Skip for mechanical fixes.

## The Position Principle

Models attend most to beginning and end; the middle receives less focus.

- Opening: identity, objective, critical constraints
- Middle: reference material, steps, domain knowledge
- Closing: output format, success criteria, final reminders

Short instructions can ignore position; long ones cannot.

Restating is never allowed for convenience. One exception: a rule whose violation is irreversible may be anchored once more at the close.

The constitution's rules are cited by heading, never redefined. A primitive that depends on one of them names the rule and says what it yields for the task at hand; it does not restate what the rule says in its own words, because a restatement drifts from the source, ships the drift as a fact, and is the harder of the two to catch, since a reviewer who knows the rule reads past a fluent version of it. The closing exception above still applies.

## The Skeleton

Every effective instruction file follows this structure. Not every file needs every section; the skeleton is always underneath.

| Section | Answers | Position |
|---------|---------|----------|
| Context | When to use? When NOT to use? | Opening |
| Objective | What will it accomplish? How is that verified? | Opening |
| Inputs | What does it need? (XML boundaries) | Opening |
| Identity | What lens does the agent adopt? | Opening |
| Steps | What does it do? Where are the decision points? | Middle |
| Pitfalls | What goes wrong? What is the response? | Middle |
| Success | How do you know it worked? | Closing |

## Writing Each Section

**Context:** open with when to use, then draw the negative boundary, which constrains more than the positive enables: "Use when X, not when Y."

**Objective:** verifiable, not vague. "Refactor to eliminate duplicate logic; verify by running tests," not "improve the code."

**Inputs:** wrap user content in XML boundaries so instructions and material never blur: `<user_request>`, `<source_material>`, `<context>`.

**Identity:** a lens, not decoration. "Reviewer focused on maintainability" judges differently than "reviewer focused on performance."

**Steps:** every step requiring judgment carries the decision, the criteria, and what to do for each outcome.

**Pitfalls:** each with a specific response, not a warning. Always include the clarification pitfall: if the request is ambiguous, ask before proceeding.

**Success:** observable. "All tests pass, no new linter errors," not "works well."

## Quality Tests

- **Clarity:** can an agent with no prior context follow it?
- **Completeness:** does it produce the output it promises?
- **Elegance:** the threshold test, above.

**Verification:** run the instruction with three varied inputs. All three must produce the expected output without intervention. Varied inputs test reliability; one input tests luck.

## Patterns Over Examples

Show structure, not content. Positive examples cause mimicry; patterns cause understanding. Reserve examples for code, structured data, and technical formats where exact reproduction is the goal.

## Review Process

Triage first: a file with an identifiable objective and localized issues is salvageable and gets this review; one with no clear objective or fundamental incoherence is not, and review stops there. The rewrite is a separate write job for the skill that owns the type, with the old text as source material; a review never rebuilds the file itself.

Reviews begin with a stress test: run one realistic request through the instruction end to end, and when instruction files reference each other, through the whole chain, checking that terms, handoffs, and boundaries stay consistent across the files with no gap and no overlap. Describe at least one scenario where the instruction produces wrong or inconsistent output. Finding none means the file is excellent or the scenario was too easy; try a harder one before concluding. A finding without a failure scenario is cosmetic; deprioritize or drop it.

Each finding names where it lives, what is wrong, the failure scenario, and the minimal fix. Audit in the Rank order Elegance defines; Boundaries live in Context's negative and Inputs, failure modes in Pitfalls. With the requester in the loop, present observations one at a time with options (accept, alternate fix, drop) and a recommendation, and after five accepted changes offer: continue, re-assess, or stop. Without one, deliver the findings ranked; the gate and the integration belong to whoever owns the file. Verify each accepted fix by re-running the stress test.

Review fixes add text; they never remove it. A review that integrated fixes is not done until the threshold test re-runs on the whole file: keep each added rule, cut its justification unless the rule is opaque without it, and give anything now said twice one home. A findings-only review ends with the ranked findings.
