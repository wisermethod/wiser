# Classifier caller

`ask.mjs` is the shared caller a tool uses to put one closed judgment to the classifier. `standards/primitives.md` Invocation is the rule it implements. The module reaches the gateway for that call and nothing else: it computes nothing in the answer, reads no credential, and writes no file.

## Call

`ask({ action, input, owningRoot, gatewayHome, replay, timeoutMs })` returns `{ path, reason, answer, record }`.

`path` is `classifier`, `builtin`, or `replay`. `reason` is why a builtin path was taken: `no-owning-root`, `unreadable-root`, `refused`, `no-classifier`, `unavailable`, or the answer's own status string. It is null on `classifier` and `replay`. `answer` is the answer as received, with every score unchanged, or null on a builtin path. `record` is `{ action, input_sha256, input, answer, path, ms, at }` when the path is `classifier`, the supplied record when the path is `replay`, and null on a builtin path. `input_sha256` is the sha256 of the canonical JSON of `input`: object keys sorted recursively, arrays in order, no whitespace.

`owningRoot` is an absolute directory whose `AGENTS.md` can be read. `gatewayHome` defaults to the gateway's own home and is set when that gateway was started with `--home`. `replay` is a record object, or a path to a JSON file holding one. A record whose `action` or `input_sha256` differs from this judgment throws; it is never ignored, and a matching replay makes no call and reads no presence file. `timeoutMs` defaults to 20000.

The CLI reads one JSON value and prints the result as one JSON line:

```
node tools/lib/classifier/ask.mjs --action <id> --owning-root <abs dir> [--gateway-home <abs dir>] [--replay <file>] [--timeout-ms <n>] --input -
```

`--input -` reads stdin. `help` and `--help` print usage and exit 0. An unknown flag, a missing `--action` or `--input`, unparseable input, and a replay mismatch exit 1 with a message on stderr. Every path above exits 0.

## Test seam

The call goes through `hooks/lib/call.mjs`. When `WISER_HOOK_STUB_FILE` names a JSON map of action id to an answer, no gateway is started. A null or missing entry is the `unavailable` path. `WISER_HOOK_STUB_LOG`, when set, receives one line per call and stays empty when no call is made.
