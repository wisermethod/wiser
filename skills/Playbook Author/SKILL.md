---
name: Playbook Author
type: skill
category: authoring
description: Create, instantiate, resume, review, or close out a WISER Playbook for work that spans sessions
version: 0.1.0
---

# Playbook Author

## Context

Use to create, instantiate, resume, review, or close out a Playbook. Not for work that finishes in one session: execute that directly, and route it to Play Author only when it will recur with different inputs; `standards/playbook.md` states the test that separates the two, so apply it before anything else. Not for prose deliverables; that is Content Author.

## Objective

Leave the Playbook in the state its job defines: created or instantiated to the Success condition in `standards/playbook.md`; resumed with reconciliation done and one attested next action; reviewed per the Review Process; or closed out with Final Check evidence and the end state its Type requires.

The format, the WISER method, Type semantics, execution modes, naming, and storage all live in `standards/playbook.md`. Load it before doing anything below; this skill adds only workflow.

## Which Job

Decide the job before running any section.

| Situation | Job |
|-----------|-----|
| No Playbook and no Template master covers this work | Create |
| A Template master covers the process | Instantiate, even when the request says create |
| A Playbook exists and work stopped mid-flight | Resume |
| A Playbook exists and is being audited | Review |
| The work an instance or one-time Playbook covers is finished | Close out |

## Create

1. Fix ownership and placement. Name the root that owns the work per the constitution's Workspace Model, asking when no root fits or more than one does; then place and name the file per `standards/playbook.md`, stating the path and asking only for a correction.
2. Choose Type. One-time is the default; choose Template only when the same process will run again with different inputs.
3. Do the Witness audit for real before drafting anything downstream. Read the Key files and record what you found. If a file cannot be read, say which and stop.
4. Interrogate before designing the plan. Fill the risk table, then derive the riskiest piece from it, then let that choice set Solve. Drafting Expand first produces a plausible sequence built on nothing.
5. Confirm the execution mode once risks are on the table, not before; choose by the Execution Mode section of `standards/playbook.md`.
6. Ask the user only what cannot be inferred or researched, each question carrying a recommended default.
7. Decompose Expand into milestones and tasks against the tests in `standards/playbook.md`.
8. Verify before delivering: read the draft cold three times, from three different execution states (nothing started, mid-Expand, Solve just failed). Each read must yield one specific next action with no questions asked. If one does not, fix the section that broke, then reread.

## Instantiate

Copy the master to a dated instance per the Type section of `standards/playbook.md`, then work the instance from Witness: the copy reset its checkpoints, so this run's Key files are read and its checkpoints earned fresh. Never re-author the structure the master carries.

## Resume

1. Reconcile before doing any work, in the order the Resume discipline in `standards/playbook.md` fixes. Later items get corrected to match earlier ones, never the reverse.
2. If Status is Paused, read the recorded blocker and resolve or escalate it. Never resume past a blocker silently.
3. Judge staleness before executing anything: re-read the Key files and compare disk against the Witness findings. On divergence, re-run Witness on the affected part and record a learning. If the divergence changes which assumption would invalidate the plan, re-enter Interrogate and re-pick the riskiest piece before touching Expand: set Status to the re-entered canon, mark invalidated checkpoints and dependent task evidence with the date and a learning, and point Progress at the first action of that canon. Otherwise continue from the next action in Progress.
4. If the document contradicts disk in a way you cannot adjudicate, stop and ask; do not pick a winner and proceed.

## Review

Follow the Review Process in `standards/instruction-quality.md`. The stress test for a Playbook is a cold read from a mid-execution state, asking one question: what is the next action? A document that cannot answer has already failed. Audit against the sections of `standards/playbook.md` that own the criteria: Required Sections, Risk First, Milestones and Tasks, Living Document with its session-end protocol, and Success. Deliver findings; do not rewrite the document.

## Close Out

1. Confirm this file is an instance or a one-time Playbook; a Template master is never closed out.
2. Run Final Check and record its evidence, then set Status to Complete.
3. Name the artifacts this work's completion affects and update them, or hand that list to whoever owns them.
4. Archive per `standards/conventions.md`.
5. Decide promotion. If this process will run again, promote by the reset in `standards/playbook.md`: the undated master is a new file beside the archived run, its header declaring Template. If this was a Template instance, choose which learnings generalize and write only those back to the master; instance-specific ones stay behind.

## Pitfalls

- **The request is ambiguous** about which job, which root owns the work, or Type: ask. Never guess ownership or Type, and never infer a location from the last one used.
- **Risks are generic and mitigations hedge.** Rewrite each mitigation as an action someone can take. If no action exists, the risk is not understood yet: return to Witness.
- **The riskiest piece was picked for looking hard.** Re-derive it per Risk First in `standards/playbook.md`, then re-sequence Solve to build it first.
- **A Template master is about to be executed, ticked, Completed, or archived.** Stop. Copy it to an instance and work the instance; the master changes only by deliberate learning promotion.
- **A session is ending with the document behind the work.** Run the session-end protocol in `standards/playbook.md` now; write only what you can attest to, and mark the rest unverified.

## Success

- The file sits at the path its owning root declares, named per `standards/playbook.md`; a created or instantiated document meets that standard's Success condition.
- A resume left reconciliation done and Progress naming one attested next action, or Status Paused with its blocker recorded.
- A review delivered the stress test and ranked findings per the Review Process, and did not rewrite the document.
- A close-out left Final Check evidence recorded, Status Complete, the archive copy in place, and any promotion producing an undated master beside it.
