# Fix a supported finding

Apply at Review step 7 when the file read and any required run support the finding, before fixing it.

- Does a Playbook clause gate the supported fix? Yes: cite that clause and leave the action gated. No: fix it in this run; "beyond the run" is not a gate. No Playbook: fix it within the task's authorized boundaries.
- Does the fix widen an exception? Yes: test it on the case that motivated the code before accepting it. No: add no exception probe.
