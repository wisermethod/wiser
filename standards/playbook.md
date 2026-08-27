---
standard: playbook
version: 0.1.1
description: The Playbook format; the WISER method for multi-session execution with decision tracking and learning capture
---

# Playbook

## Context

Not for single-session work; execute that directly, and if it recurs make it a Play (`standards/play.md`). Use a Playbook when work spans sessions or context windows, when decisions made along the way must survive the session that made them, or when the approach may change as the work teaches you something. The overhead is justified only by that tracking; without it you have a task list with ceremony.

## The WISER Method

Preconditions come first: prerequisites that must be true before work begins (archive before refactoring, access granted before integration, backup before migration), or an explicit "None". Then the five canons run in order. Each closes with a Checkpoint that is not passed until evidence can be cited.

| Canon | Purpose | Checkpoint evidence |
|-------|---------|---------------------|
| Witness | Verify current state; ground the objective in what exists | Key files and systems read, not assumed; divergences from documentation recorded; objective specific and measurable; scope and non-scope explicit |
| Interrogate | Surface unknowns, assumptions, and execution risks | Unknowns listed; assumptions stated; every risk carries a specific mitigation; riskiest piece named; reuse check done |
| Solve | Build the riskiest piece first | The riskiest piece works, or it demonstrably does not and the plan pivoted |
| Expand | Build out the full objective | Every milestone verified; documentation impact addressed |
| Refine | A human stress-tests; the agent iterates | Tested in real use; feedback incorporated; the success criteria testable at this stage pass |
| Final Check | Confirm nothing was left inconsistent | Every item on the Final Check list in the Structure passes |

Status is never Complete until Final Check passes.

## Risk First

Interrogate drives Solve. This ordering is the load-bearing idea of the method: the riskiest piece is the assumption whose failure would invalidate the plan, not the task that looks hardest. Build it before anything that depends on it, so a wrong plan fails in the first session rather than the last. Each risk carries a status (Active, Mitigated, Realized, Retired), a concrete countermeasure, and notes updated as work proceeds. A mitigation that names no action is not a mitigation. Skimpy risk work is the top failure mode: a Playbook with generic risks and hedged mitigations reads complete, sequences the work wrong, and finds out late. Risks keep their detail even when the rest of the document is compressed.

## Required Sections

Every Playbook carries a Header (created and updated dates, Type, Collaboration, Status, Method), Context with Key files, Preconditions, Authority, the five canons, Final Check, Decision Log, Learnings, Resume Instructions, Progress, and Success Criteria. The Structure section below shows what each holds. A section with nothing in it says "None" rather than disappearing.

Order is fixed and cognitive: constraints, then objective, then unknowns, then plan, then tracking. Optional: an **Execution Model** section after Authority when the work has a specific orchestration approach (how sessions are run, how work is delegated, what review a load-bearing artifact receives). Add it only when that approach is not evident from the tasks.

## Milestones and Tasks

Expand holds milestones; each groups a few tasks, typically 3 to 5, toward one verifiable outcome. For multi-session builds a milestone is a session, with a target date and a coherent theme.

Every task is atomic (one action, not two joined by "and" or "then"), verifiable (a done-state checkable on disk or by a run, not by opinion), right-sized (completable inside its session), and independent of its siblings where possible. Warning signs: vague verbs (handle, address, improve); no observable done state; a milestone holding one or two tasks, which is a task; a task that is really a project.

Evidence is recorded inline. When a task or checkpoint completes, write the outcome and the absolute date at the checkbox or checkpoint itself: what was run, what passed, what was observed. Evidence is disk state, a run's output, or a named human attestation with its date; work that leaves no disk trace records who confirmed it.

## Type

**One-time** executes once, completes, archives.

**Template** is never executed directly: each run copies the master to a dated instance and executes the instance, leaving the master clean. The copy resets what the run will fill: checkboxes and their evidence, checkpoint results, Progress, the header dates, Status to Draft, and the Decision Log. It carries what the master knows: structure, Preconditions, the risk table with every status returned to Active, and Learnings, which the run appends to. When an instance completes, promote the learnings that generalize back to the master deliberately; auto-appending accretes instance noise. A completed one-time Playbook is promoted to a Template by that same reset, keeping its structure, risks, and Learnings.

## Execution Mode

**Collaborative (default):** pause at every checkpoint for human confirmation; discuss significant decisions before logging them; surface new risks as they appear. For uncertain territory, irreversible changes, high stakes.

**Autonomous:** run through checkpoints without pausing; log every decision with rationale and alternatives; present the completed work and the Decision Log for review. For well-understood work and established patterns.

Autonomous guardrails. Stop and notify a human when:
- A task falls under "Needs human input" in Authority
- A task fails twice (two attempts without meeting its done-state)
- Scope must change (required work falls outside the stated Scope)
- Solve disproves the approach (this stops both modes; pivot, descope, or abandon is a human decision)
- A high-severity risk emerges (one that could invalidate the plan), or a risk realizes with impact beyond what its mitigation contains

Authority is the gate: anything under Needs human input pauses in both modes. Mode governs the rest, checkpoints and decision discussion. A guardrail stop sets Status to Paused and records the blocker. Mode is declared in the header and may change mid-execution; log the change as a decision.

## Living Document

The document is updated as the work happens, never reconstructed afterward.

- Check off tasks as they complete, with inline evidence
- Update Status at canon transitions, and the updated date after any change
- Move risk statuses as they change; add newly surfaced risks
- Log each decision immediately with its rationale and the alternatives evaluated; a decision recorded later loses its alternatives
- Record a learning whenever an assumption is validated or invalidated
- On a scope change: log it, update Scope and risks, then re-evaluate whether the riskiest piece changed
- On a task failure: log it in Learnings and attempt one recovery if a clear fix exists. On a second failure, stop. Collaborative discusses; Autonomous documents the blocker and stops
- On a release, a version stamp, a tag, or a deployment: reconcile this document in the same change. Shipping is when the document is most likely to be wrong and most certain to be trusted

**Session-end protocol.** A session ends by reconciling the document against disk, never by asserting it is current. Reconcile what a later reader will act on: each checkbox against the artifact it claims, each count and version against the file that carries it, each statement about what is committed, pushed, tagged, released, or deployed against the repository and the destination themselves, and Progress against the last thing that actually happened. A claim that cannot be checked against something on disk is rewritten until it can be.

Progress then names the current canon, one specific next action, and every gate still open, named as open rather than left out. A gate nobody names is a gate nobody closes.

A stale line is not documentation debt. Every later session reads this document as instruction and acts on it, so a wrong line is paid for twice, once believing it and once undoing it. Where the document and disk disagree, disk is right, the document is corrected, and the drift is recorded as a learning, because drift repeats.

**Resume discipline.** On resume, before continuing any work, reconcile in one order: disk first, then inline task evidence, then Progress and Status, then checkpoint lines; later items are corrected to match earlier ones. A decision found undocumented is logged on discovery and marked recovered; drift that reveals something records a learning.

## Naming and Storage

Default home, if the owning root's AGENTS.md is silent: the `playbooks/` directory of the root that owns the work. Instances are named `YYYY-MM-DD-[slug].plan.md`, dated by creation; a Template master is the same slug undated, `[slug].plan.md`, its Type header declaring what it is. (This root's own build plans live in `infrastructure/build/plans/`.)

A root's AGENTS.md may declare a different home. A client root places each Playbook in the `work/<subject>/` folder of the work it plans, named `<does-this-thing>.playbook.md`, with no date in the living filename: the subject folder is the run. A Template master sits in the parent of the runs under the same naming, and each run is a copy into that run's folder, also undated. Completed runs archive next to themselves; the archive prefix carries the date.

Dates, naming charset, and archiving follow `standards/conventions.md`.

## Structure

```markdown
# [Title]

**Created:** YYYY-MM-DD | **Updated:** YYYY-MM-DD
**Type:** One-time | Template
**Collaboration:** Collaborative | Autonomous
**Status:** Draft | Active ([canon]) | Final Check | Paused | Complete | Template
**Method:** WISER Playbook

## Context
[Why this work matters; what a new context needs to know]
**Key files:** [What to read first]

## Preconditions
- [ ] [Prerequisite, or "None"]

## Authority
**Autonomous:** [What the agent may execute freely]
**Needs human input:** [What requires confirmation]

## Execution Model
[Optional: how sessions run, how work is delegated, what review load-bearing artifacts get]

## Witness
**Audit:** [What was read and verified, with date]
**Findings:** [State as found; divergences from what was assumed]
**Objective:** [End state, measurable]
**Scope:** [In] | **Not in scope:** [Out] | **Depends on:** [Prerequisites]
**Current State:** [Verified starting point]
**Deliverable:** [What this Playbook produces]
**Checkpoint:** [Condition]. [Result, evidence, and date once passed]

## Interrogate
**Questions for user** (each with a recommended default):
- [ ] [Question. "A or B? Recommend A because ..."]

**Execution risks:**

| Risk | Status | Mitigation | Notes |
|------|--------|------------|-------|
| [What could go wrong] | Active / Mitigated / Realized / Retired | [Specific countermeasure] | [Updated as work proceeds] |

**Reuse check:**
- [ ] [Existing primitive, Play, or prior work to leverage]

**Riskiest piece:** [The assumption whose failure invalidates the plan]
**Checkpoint:** [Condition]. [Result, evidence, and date]

## Solve
- [ ] [Task that proves or disproves feasibility]
- [ ] [Validation with a pass or fail threshold]

**Checkpoint:** [Condition, plus what happens if it fails]. [Result, evidence, and date]

## Expand
### [Milestone or Session 1]: [Name]
- [ ] [Task] ([evidence and date when done])
- [ ] [Task]

### [Milestone or Session 2]: [Name]
- [ ] [Task]

### Documentation Updates
- [ ] [What to update, or "None"]

**Checkpoint:** [Condition]

## Refine
- [ ] [Human testing step]
- [ ] [Iteration task]

**Checkpoint:** [Condition]

## Final Check
- [ ] Documentation Updates from Expand are done
- [ ] No stale references
- [ ] Tests pass for touched components (if applicable)
- [ ] All checkboxes reflect actual state
- [ ] Decision Log and Learnings are current

## Decision Log
| Date | Decision | Rationale | Alternatives |
|------|----------|-----------|--------------|

## Learnings
| Date | Learning | Impact |
|------|----------|--------|

## Resume Instructions
1. Read this Playbook end to end
2. Read the Key files
3. Check Progress for the current canon and next action
4. Verify checkboxes against actual disk state; correct drift
5. Continue from the documented next action

## Progress
**Last worked:** YYYY-MM-DD
**Current Canon:** [Canon]
**Next action:** [Specific next step]

| Canon | Items | Done | Status |
|-------|-------|------|--------|

## Success Criteria
- [ ] [Verifiable condition]
```

## Success

A Playbook is ready when an agent with no prior context can read it, resume it, and know exactly what to do next. The file itself passes `standards/instruction-quality.md`.
