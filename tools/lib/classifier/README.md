# Classifier caller

`ask.mjs` is the shared caller a future tool seam uses to put one closed judgment to the classifier. No shipped tool calls it today. `standards/primitives.md` Invocation is the rule it implements. The module reaches the gateway for that call and nothing else: it computes nothing in the answer, reads no credential, and writes no file. The owning root comes from the session binding `hooks/AGENTS.md` describes. This caller does not choose it.

## Call

`ask({ action, input, owningRoot, material, gatewayHome, replay, timeoutMs })` returns `{ path, reason, answer, record }`.

`path` is `classifier`, `builtin`, or `replay`. `reason` is why a builtin path was taken. It is null on `classifier` and `replay`. `answer` is the answer as received, with every score unchanged, or null on a builtin path. `record` is `{ action, input_sha256, input, answer, path, ms, at }` when the path is `classifier`, the supplied record when the path is `replay`, and null on a builtin path. `input_sha256` is the sha256 of the canonical JSON of `input`: object keys sorted recursively, arrays in order, no whitespace.

The order, and the reason each failure carries. What the binding records is `hooks/AGENTS.md`.

1. A replay is decided first, before any session or presence read. A record whose `action` or `input_sha256` differs from this judgment throws, and so does a record whose stored `input` does not hash to its `input_sha256`. It is never ignored, and a matching replay makes no call.
2. `CLAUDE_PID` or `CLAUDE_CODE_SESSION_ID` missing: `no-session`. Nothing is sent.
3. `CLAUDE_PID` is not an ancestor of this process: `not-ancestor`. Nothing is sent.
4. The binding for that session does not verify: the verifier's reason (`no-harness`, `no-pointer`, `stale-session`, `no-binding`, `unverifiable`, `pending`).
5. The binding is refused: `refused`.
6. `owning_root` is null, several roots or none: `no-owning-root`, including when the caller names a root.
7. `owningRoot`, when the caller names one, has to equal `owning_root` after resolving symlinks: otherwise `root-mismatch`.
8. That root's `AGENTS.md` cannot be read: `unreadable-root`. Read again now, a refusal at or above it: `refused`.
9. `material` is required: at least one absolute path the judgment is about, a file or a directory. None: `no-material`. Each has to resolve inside that owning root: otherwise `material-outside-root`. A refusal at or above that path: `refused`.
10. Then the presence check and the call, as before. No attached classifier: `no-classifier`. A call that returns nothing: `unavailable`. An answer that carries a status: that status.

`gatewayHome` defaults to the gateway's own home and is set when that gateway was started with `--home`. `timeoutMs` defaults to 20000.

The CLI reads one JSON value and prints the result as one JSON line:

```
node tools/lib/classifier/ask.mjs --action <id> [--owning-root <abs dir>] [--material <abs path>] [--gateway-home <abs dir>] [--replay <file>] [--timeout-ms <n>] --input -
```

At least one `--material` is required for a call to be sent, and it may be repeated. `--input -` reads stdin. `help` and `--help` print usage and exit 0. An unknown flag, a missing `--action` or `--input`, unparseable input, and a replay mismatch exit 1 with a message on stderr. Every path above exits 0.

## Test seam

The call goes through `hooks/lib/call.mjs`. When `WISER_HOOK_STUB_FILE` names a JSON map of action id to an answer, no gateway is started. A null or missing entry is the `unavailable` path. `WISER_HOOK_STUB_LOG`, when set, receives one line per call and stays empty when no call is made.

## Trial runner

`trial.mjs` runs a paired trial: the same cases run by a headless Claude Code host with the classifier on (`C`) and off (`E`), in a seeded order. The skill that calls it decides and talks to the person. This script is the machinery.

```
node tools/lib/classifier/trial.mjs <command> [flags]
```

`help` and `--help` print usage and exit 0. An unknown flag is refused by that name. Success prints one JSON object and exits 0. Failure prints to stderr only and exits 1. `--work` is an absolute directory the caller creates. It is refused when it resolves inside this plugin or inside the directory that holds the key file. Nothing is written inside the script's directory.

| Command | Flags | What it writes |
|---|---|---|
| `plan` | `--work`, `--ceiling-file` | `<work>/plan.json` |
| `ceiling` | `--ceiling-file`, `--usd` | the ceiling file, `{"usd", "set"}` |
| `run` | `--work`, `--go`, `--keep-temp`, `--key-file` | `<work>/runs/<id>/`, `<work>/safety.json` |
| `blind` | `--work`, `--seed` | `<work>/blind/packets/`, `<work>/blind/map.json` |
| `score` | `--work`, `--model` | `<work>/scores/<oid>.json` |
| `report` | `--work` | `<work>/verdict.json` |
| `keyscan` | `--work`, `--key-file`, extra directories | nothing; prints counts |

`plan` reads `<work>/spec.json`:

```
{
  "kind": "routing" | "seam",
  "tree": "<abs plugin dir>", "commit": "<optional rev, exported with git archive>",
  "classifier": "<abs dir the gateway loads with --classifier>",
  "model": "<host model id>", "effort": "<optional>",
  "repeats": 3, "seed": <int>, "max_turns": 30, "deadline_s": 720,
  "root": "<optional abs dir of a synthetic root>", "root_files": {"<rel path>": "<content>"},
  "seam_action": "<the first-party action the seam calls; required for a seam trial>",
  "usd_per_run": <optional, at or above 0>, "calls_per_run": <optional>, "classifier_usd_per_call": <optional, at or above 0>,
  "cases": [ {"id": "c1", "ask": "...", "expect": "skills/X/SKILL.md" | "experts/Y/EXPERT.md" | "none",
              "rubric": [{"id": "S1", "text": "..."}], "none": false, "none_item": "<rubric id when none is true>"} ]
}
```

Without `root`, each run's root is built from `system/templates/User Root Template/` and declared `type: personal`; a named `root` is copied as it is. It refuses a `kind` other than `routing` or `seam`, no cases, a case with no `id`, `ask`, or `rubric`, fewer than one case with `"none": true`, `repeats` under 3, a non-absolute `tree` or `classifier`, and a tree without `gateway/server.js` and `skills/AGENTS.md`. Dollar figures come from `usd_per_run` in the spec, else the median `usd` of `meta.json` files under the parent of `--work` whose `model` matches, else the table in `COST_TABLE` (`opus`, `sonnet`, `haiku`, and the judge row). `needs_go` is true when there is no ceiling or `usd_worst` exceeds it.

`run` refuses without `plan.json`, and when `needs_go` is true and `--go` is absent. Each run is `<case>-<arm>-<repeat>` in `plan.order`. Arm `C` symlinks `auth-provider.env` at the trial home's platform config path to `--key-file` (default `defaultProviderEnvPath()`). Arm `E` writes the three empty lines, mode 0600. The host keeps the real `HOME`. `HOME` moves only in `--settings` `env` and the gateway MCP `env`, and on Linux `XDG_CONFIG_HOME` moves with it; the trial key path is refused unless it resolves inside the trial home. The runner runs on macOS and Linux and refuses elsewhere. The host's `Read` tool is denied the trial key path and the person's key directory, and its shell runs in Claude Code's OS sandbox (`sandbox.enabled`, `allowUnsandboxedCommands: false`, `filesystem.denyRead` on both key directories); hooks and the MCP gateway run outside that sandbox, so they still read the key. Probed live 2026-09-24: `wc -c` on the key path answered `operation not permitted` in six of six runs while arm `C`'s route hook answered in each. **A residual, stated:** the sandbox covers the paths named; a key the person keeps elsewhere is not covered, and the key scan is what catches one that reached a record. A run is invalid when, in arm `C`, the seam's own action (`seam_action`; `wiser.route.ask` for a routing trial) did not answer `ok`, or when, in arm `E`, any first-party call did. SIGINT and SIGTERM stop the running host's process group and the safety judgment still runs. Temp state is removed at the end, including after a stop, unless `--keep-temp`.

**What stops `run`**, each before or after the host runs as stated, with the reason on stderr and the records so far kept: the key file has no `WISER_CLASSIFIER_KEY` value; the lock proof, a connector `execute` put to a fresh gateway started as a `C` run's is, does not answer `needs_connect`; a connector `execute` answers `ok` in any trial home; a run's session id appears in any file under the real gateway home; a run invalid twice; spend past `usd_worst`, the classifier's calls counted; and the real gateway home or key file changing between before the first run and after the last. On that last one, a trial's gateway and hooks run in its own trial home, so what one could leave in the real gateway home is its session id or its own process in a presence file, while the person's other sessions write there all the time. The key file changing stops the run. A watcher records every 2 s each process descending from this script; a trial's gateway lives for its whole run, so it is always recorded. A presence file, `classifier-status/<harness>.json`, stops the run when the pid it names is one of those, or cannot be read, and is otherwise attributed to another session, a short-lived gateway included. Any other change is attributed only when no presence file stopped the run and no file there names a trial session id; otherwise it stops. The hashes and this judgment run on every exit once the runs have started, a stop included, and `safety.json` records `stopped_early` with the reason. It records the lock proof, both hash sets, what changed, what stopped, what was attributed, and each run's footprint check.

`blind` writes one packet per valid run: the ask, the rubric items, and the deliverable, with every sentence that names how a judgment was settled (the classifier, a builtin path, a gateway status, the route line) removed from both arms alike, and the count per packet kept in the map, not the packet. It refuses to write any packet when a deliverable holds the classifier key. The map from opaque id to run id is a separate file. `score` asks for one fenced JSON block and records `scores`, `reasons`, `score`, `usd` (every attempt charged) and the packet's sha256, or `status: unparsed`; it re-scores a packet whose hash changed and stops before its spend would pass `usd_worst`. `report` refuses unless every planned run is valid and fully scored against the packet now on disk, then writes the five pass lines from `standards/primitives.md` `## Classifier Seam`. Line b is judged from each on-arm deliverable by the case's none item, and says so in `basis`: the runner does not record the classifier's own answer. Plan and verdict dollar figures count host, judge and classifier. `release` is always `a separate decision; this verdict releases nothing`.

`keyscan` prints the key's length and the first 12 hex of its sha256, never the value. Exit 0 is `clean`. Any other verdict goes to stderr and exits 1.

`WISER_TRIAL_HOST`, when set, names an executable run in place of `claude` with the same argv. It is a test seam, the same kind of switch as `WISER_HOOK_STUB_FILE`, and it is not passed through to the host.
