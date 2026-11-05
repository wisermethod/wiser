# Preconditions, acceptance and release

Answer these before writing tasks; acceptance and the milestone map follow Milestones and Tasks in `standards/playbook.md`.

- Is a licence check needed? Search the plan first. It gates user-supplied material: remove it; never make it a Precondition. It gates a repository dependency: keep it. It gates model weights: read their own declaration, card or bundle text before planning on them; the downloading package's licence does not cover the weights. None needed: add none.
- Does acceptance hand an input to a called skill? Yes: read that skill's own Inputs first and require only what it accepts. No: go on. Does it cite an earlier proof's output as a reference? Yes: check that the output was made by the method now shipped; otherwise remake it by that method before using it. No: go on.
- Is the change caller-side? Yes: accept the invocation being made, naming every primitive that issues the call, rather than the capability merely being present. No: accept the changed behaviour.
- Does a person sit through the flow? Yes: name its reference flow and measure the full path against it: time to first result, answers typed before it, and approvals asked after it. No: accept the output and its parts.
- Does the build design a member-facing question flow? Yes: show its exact wording to the operator before building it; a simulated member is never the pass. No: go on.
- Does the build lay out pages? Yes: get the layout approved as a mockup before building pages, even when the look is already approved. No: go on.
- Could a full pass leave the result unusable? Yes: add an explicit shippability clause, such as runs unpatched. No: retain the acceptance; shippability is proved only when named.
- Does the result need distribution? Yes: plan every distribution step as a build task, or name each unplanned step open at handoff. No: go on.
- Must a live run clean up after itself? Yes: prove its cleanup early on a real target the run does not need, not only a stand-in, and name who runs it. No: go on. Could the host's permission check refuse a deletion regardless of recorded approval? Yes: plan the owner doing it, for both the proof and final cleanup, leaving the page open; never route around the check. No: use the named runner.
