# Live checks

## Failed writes

- Did a write fail? Yes: read every state it could have changed before recording what was created, and start a retry from what that read finds. No: use the observed result.

## Field extraction

- Does a check extract JSON fields? Yes: allow optional whitespace after a colon and print an explicit no-match marker when nothing matches; a blank field is a broken check, never an answer. No: go on.

## Network

- Does each way the code can reach out have its own fixture, including linked stylesheets, style elements and WebRTC? Yes: limit the claim to those paths. No: add the missing fixtures before making the claim.
- Is the host macOS? Yes: supplement any Node hook with outside observation, running each arm under `sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))'`, reading `/usr/bin/log show` for `Sandbox: <process>(<pid>) deny(1) network-outbound`, and running a control that tries a connection beside it. No: go on.
- Did a macOS sandbox probe refuse without a kernel line? Yes: identical denials from the same profile are deduplicated; read refusal from the probe itself and use a host not yet tried when the kernel line is needed. No: keep the observed result.
- Did a sandboxed probe refuse a connection? Yes: count that attempt as a connection in either arm's no-call decision, and require an outside-sandbox control to reach the host before treating it as evidence. No: use the observed result.

## Host sessions

- Will the check launch a host session? Yes: deny shell and edit tools, set every user setting the test depends on explicitly with `--settings`, hash the settings files after each run, and read the pane before pressing Enter on input the test did not type. No: go on.
