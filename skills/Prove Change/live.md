# Live checks

## Failed writes

- Did a write fail? Yes: read every state it could have changed before recording what was created, and start a retry from what that read finds. No: use the observed result.

## Field extraction

- Does a check extract JSON fields? Yes: allow optional whitespace after a colon and print an explicit no-match marker when nothing matches; a blank field is a broken check, never an answer. No: go on.

## Network

- Is the claim that a child process makes no network call? Yes: observe connections without and with the fix on fresh caches, list everything each run leaves behind, and use one fixture per way the code can reach out, including linked stylesheets, style elements and WebRTC. Source inspection is not observation. No: go on.
- Is the child a Node process? Yes: observe with a `NODE_OPTIONS=--require` hook patching `http`, `https` and `net`, each arm on a fresh `HOME` and `TMPDIR`; on macOS also use the outside observation below. No: observe from outside the process on fresh caches.
- Is the host macOS? Yes: run the child under `sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))'`, read `/usr/bin/log show` for `Sandbox: <process>(<pid>) deny(1) network-outbound`, and run a control that tries a connection beside it. No: use the host's outside connection observer with a connecting control.
- Is a sandbox denial absent from the log? Yes: macOS deduplicates identical denials from the same profile; read refusal from the probe itself, keep an outside-sandbox control that reaches the host, and use a host not yet tried when the kernel line is needed. No: keep the logged denial as observation.
- Did the arm without the fix connect, or did its sandboxed probe refuse while the outside control reached the host? Yes: the observation can see or block a call. No: rebuild the observation before claiming anything. Did the fixed arm attempt a connection, even if refused, or leave unexpected files? Yes: do not claim it makes no call. No: record only the paths the fixtures exercised.

## Host sessions

- Will the check launch a host session? Yes: deny shell and edit tools, set every user setting the test depends on explicitly with `--settings`, hash the settings files after each run, and read the pane before pressing Enter on input the test did not type. No: go on.
