# Acceptance checks

- Does acceptance hand an input to a called skill? Yes: read that skill's own Inputs first and require only what it accepts. No: go on. Does it cite an earlier proof's output as a reference? Yes: check that the output was made by the method now shipped; otherwise remake it by that method before using it. No: go on.
- Does a person sit through the flow? Yes: name its reference flow and measure the full path against it: time to first result, answers typed before it, and approvals asked after it. No: accept the output and its parts.
- Does the build design a member-facing question flow? Yes: show its exact wording to the operator before building it; a simulated member is never the pass. No: go on.
- Does the build lay out pages? Yes: get the layout approved as a mockup before building pages, even when the look is already approved. No: go on.
