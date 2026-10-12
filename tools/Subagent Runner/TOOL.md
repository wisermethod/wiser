---
name: Subagent Runner
type: tool
category: automation
description: Run one builder or reviewer through a vendor command-line tool named by flags, or survey the boundary that run would use
version: 0.1.1
---

# Subagent Runner

One command runs one sub-agent, a builder, a reviewer, or an adversarial reviewer, through the vendor command-line tool the flags name. A second command reports, without starting a model, which of those tools are present and which boundary that run would get. The delegate's report comes back as data. This tool does not decide whether that report is right.

There is no configuration file. The role, the vendor, the model, the effort, the access, and the roots arrive as flags. A run record has to say which model ran and where, and those flags put nothing secret on the command.

## Context

Use it when `claude`, `codex`, or `grok` is on `PATH` and a caller wants one headless run, with a task, optional attached files, an optional working-tree snapshot, a timeout, and a recorded prompt and result outside this tool.

Do not use it to judge the delegate's work, to install a vendor tool, or to turn permission checks off except by passing `--unrestricted` on the command. Bounded is the default. Unrestricted exists only as that flag, and only for a builder whose access is `write`.

Classifier seam: none.

## Quick Start

```bash
python3 scripts/subagent_runner.py help
```

Usage text. No configuration file and no vendor tool are required.

```bash
python3 scripts/subagent_runner.py survey --role builder --cli claude --model a-model --effort low --root "$ROOT"
python3 scripts/subagent_runner.py run --role builder --cli claude --model a-model --effort low --access write --root "$ROOT" --runs "$RUNS" --task "Describe the change" --dry-run
```

`$ROOT` and `$RUNS` are absolute paths the caller supplies. `survey` and a completed `run` print one JSON object and exit 0. `--dry-run` writes the prompt and prints the command it would have started, and exits 0. Any other delegate outcome leaves stdout empty, names the state and the run folder on stderr, and exits 1. A refusal before a vendor process starts does the same and leaves no run folder.

## Dependencies

This tool's script runs under Python rather than Node, which the Script Contract's Runtimes clause allows once the interpreter is declared here. The script uses the Python 3 standard library only. Nothing installs, and `--install` is refused by name like any other unknown flag. A missing dependency fails the command that needs it by naming the dependency and its check, never with install steps.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Python 3 | Every command. The script is written for this interpreter | `python3 --version` succeeds |
| `claude` | A run whose `--cli` is `claude`, and the `claude` row of `survey` | `claude --version` succeeds |
| `codex` | A run whose `--cli` is `codex`, and the `codex` row of `survey`. A bounded run also reads `codex mcp list --json` before it will start, and refuses when that listing cannot be read | `codex --version` succeeds. The bounded read is `codex mcp list --json` |
| `grok` | A run whose `--cli` is `grok`, and the `grok` row of `survey` | `grok --version` succeeds |
| `git` | `--diff` only. Not used by `help`, `survey`, or a run without `--diff` | `git --version` succeeds |

The interpreter is the one dependency a script cannot check from inside itself, so the agent runs `python3 --version` before the first invocation. `help` does not check the vendor tools or git. `survey` reports each vendor that `PATH` can resolve and does not fail because one is absent. `run` checks only the vendor that `--cli` names, after the flags have been accepted and after a missing boundary has been refused. A bounded `codex` run reads `codex mcp list --json` after the caller's paths and refuses before a run folder, including when `codex` is not on `PATH`. `git --version` runs only when `--diff` is set, and a failure there happens before a run folder is created.

## Identity

`survey` and `run` take the same identity flags. There is no file to search for and no default location. Nothing is read from the environment as configuration. Model, effort, access, and roots are arguments, and the run record includes them on purpose.

| Flag | Required | Values |
|------|----------|--------|
| `--role` | yes | `builder`, `reviewer`, or `adversarial_reviewer` |
| `--cli` | yes | `claude`, `codex`, or `grok` |
| `--model` | yes | A non-empty string. Passed only as that vendor's model argument. It is not copied into the child environment |
| `--effort` | no | Omitted means no effort flag. `claude`: `low`, `medium`, `high`, `xhigh`, `max` (`claude --help` lists those). `codex`: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` (sent as `-c model_reasoning_effort="<effort>"`; `codex exec --help` does not list the names). `grok`: `low`, `medium`, `high`, `xhigh` (`--effort` is the alias of `--reasoning-effort`; the help does not list the names) |
| `--access` | no | `write` or `read-only`. Default `write` for `builder` and `read-only` for the others. Only a builder may be `write` |
| `--root` | yes, repeatable | Absolute path of an existing directory. The first is the working directory. A later root is a directory grant only where the enforcement table says so |

`--unrestricted` is not an identity value. It selects the mode, and only on the command.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `python3 scripts/subagent_runner.py help` | Print usage and exit | No |
| `python3 scripts/subagent_runner.py survey --role ROLE --cli CLI --model NAME [--effort LEVEL] [--access LEVEL] --root DIR [--root DIR ...] [--unrestricted]` | Report vendor tools and the boundary this role would get. Starts no model | No |
| `python3 scripts/subagent_runner.py run --role ROLE --cli CLI --model NAME [--effort LEVEL] [--access LEVEL] --root DIR [--root DIR ...] --runs DIR (--task TEXT or --task-file FILE) [--context FILE] [--diff] [--timeout SECONDS] [--dry-run] [--unrestricted] [--run-name NAME]` | Run one role, or write the prompt and stop | Yes, under `DIR`, except a refusal before the vendor process starts, which writes nothing |

`survey` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--role`, `--cli`, `--model`, `--effort`, `--access`, `--root` | The identity flags above. `--root` is repeatable and required | See Identity |
| `--unrestricted` | Report the unrestricted mode instead of the default | Off. Bounded |
| `--help`, `-h` | Print usage and exit, before any path is used | Off |

`run` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--role`, `--cli`, `--model`, `--effort`, `--access`, `--root` | The identity flags above | See Identity |
| `--runs DIR` | Directory that will hold the run folder. Absolute path. Created if it is missing. Refused when it resolves inside this tool directory, when it resolves inside the plugin root, and when it contains the plugin root | None; required |
| `--task TEXT` | The brief. Exactly one of `--task` and `--task-file` | None |
| `--task-file FILE` | The brief, read from a file. Absolute path | None |
| `--context FILE` | Attach one file. Repeatable. Absolute path. The size is the file's size, taken before the file is read. The raw sizes together may not exceed 200000 | None |
| `--diff` | Attach `git status` and `git diff` for every root. Requires `git`. See the snapshot rules below | Off |
| `--timeout SECONDS` | Per-run limit. A positive whole number written with the ASCII digits `0-9`, from 1 to 604800. A superscript, a full-width digit, an empty value, a value outside that range, and any other value that is not those digits are refused before any file is read. The message names the cause and the fix. `--timeout=5` is an unknown option; pass `--timeout 5`. Checked before any file is read, including with `--dry-run` | 1800 |
| `--dry-run` | Write `prompt.md` and return the command. Start no vendor process and write no `status.json` | Off |
| `--unrestricted` | Run a builder whose access is `write` with that vendor's permission checks off. A reviewer, or a builder whose access is not `write`, is refused. No file can turn this on | Off. Bounded |
| `--run-name NAME` | Folder name under `--runs`. Letters, digits, hyphens, underscores, and periods. `.` and `..` are refused. Refused when that folder already exists. When omitted, the tool names the folder | Tool-named |
| `--help`, `-h` | Print usage and exit, before any path is used | Off |

No command takes a positional argument. An unknown flag is refused by name before any file is read, including when it sits beside `help`, and the message points at `python3 scripts/subagent_runner.py help`. A repeated flag is refused, except `--context` and `--root`. A flag that needs a value, given none or given a value that starts with `-`, is refused. An unknown command is refused by name. `--install` is refused by name because nothing installs. `--env` is an unknown flag. There is no configuration file.

## Paths

Every caller-named path is absolute. A relative path is refused, because it would resolve against whatever directory the caller happened to be in.

A path is canonicalized by walking its components. The deepest existing ancestor is resolved through the filesystem before any `..` is applied, and a missing tail with no `..` after it is joined back on afterwards. `..` is applied to that resolved path, so a symbolic link followed by `..` names the directory the filesystem names, not the lexical parent of the link. A `..` that follows a component which does not exist is refused. A `..` that follows a component which exists and is not a directory is refused. A symbolic link's target is walked with those same rules, from the link's directory when the target is relative and from the filesystem root when the target is absolute, and a target that itself contains a symbolic link is walked again. A target of `missing/../x` or `file/../x` is refused, for `--task-file`, `--context`, and `--root`. A broken symbolic link, including a link cycle, is refused. A trailing `/` or a trailing `/.` requires the resolved path to be a directory. A file spelled that way is refused for those same flags, and any caller-named path with that spelling is refused when it does not resolve to a directory. A path that cannot be canonicalized is refused and is never compared as spelled. The resolved path is the one opened, passed to the vendor, and written into the prompt and the record.

Comparison against a refused directory uses device and inode.

`--task-file` and `--context` are sources. They are read from wherever they resolve, including inside this tool directory. Bytes that are not valid UTF-8 are a refusal before a run folder, and the message says the file is not valid UTF-8. There is no traceback.

`--runs` is a destination. It is refused when the resolved path is inside this tool directory, when it is inside the plugin root, or when it contains the plugin root. A builder `--root` is refused on those same terms, and also when it contains this tool directory. A builder root is screened whether `--access` is `write` or `read-only`. A reviewer root is not screened as a destination. Two roots that resolve to the same directory are refused.

The plugin root is the directory above this tool's family directory, and only when that family directory is named `tools` and that plugin root contains `tools/AGENTS.md`. A copy of this tool that is not installed that way has no plugin root. This tool directory is still refused as a destination, and a builder root that contains this tool directory is still refused.

The screening is repeated after `--runs` is created, so a path that appears between the check and the create is still refused.

## Enforcement

Bounded is the default. It uses the strongest boundary that vendor's own help establishes. Where the help does not establish the effective toolset, or does not name a sandbox profile, the role is refused and the message names the alternatives. Unrestricted runs only when the command carries `--unrestricted`, and only for `builder` with access `write`.

`stops_writes` is true when the documented shell policy is read-only, or when the vendor's file tools are the read set and no shell tool is passed. `read_only` is true only when `stops_writes` is true. A surface this tool did not establish is never reported with `read_only` true. A `limits` list qualifies what the help does not establish. A limit is not a boundary. What cannot be established is written as unknown, never as something the sandbox allows or denies. Bounded `codex` is refused rather than qualified that way: nothing Codex prints establishes the effective configuration.

The JSON object and `status.json` name `mode`, `boundary_kind`, `stops_writes`, `read_only`, `enforcement_flags`, and `limits` on every run that starts. `boundary_kind` is `operating-system-sandbox`, `vendor-permission-system`, or `none`.

The flags in the table are the boundary. They are `enforcement_flags`. Model, effort, and directory flags are in `argv`. Directory flags are also `directory_flags` on `survey`. Isolation flags, further down, are passed on `claude` runs and are not the write boundary, except `--safe-mode`, which is passed only when the mode is bounded and which the help describes as disabling installed plugins, hooks, skills, and MCP servers.

| Vendor | Role | Mode | Flags | Boundary | Rests on |
|--------|------|------|-------|----------|----------|
| `claude` | `reviewer`, `adversarial_reviewer`, and `builder` with access `read-only` | bounded | `--restricted`, `--permission-mode dontAsk`, `--permission-prompts none`, `--tools Read,Glob,Grep`. Each root after the first is `--add-dir`. `--safe-mode` is also passed; it is isolation, and it is not in `enforcement_flags` | Vendor permission system. Stops writes, because those tools cannot write and no shell tool is passed. Limits, established by help rather than unknown: under `--restricted`, managed settings and `--settings` still apply. `--safe-mode` disables installed plugins, hooks, skills, and MCP servers; admin-managed policy settings still apply; permissions work normally, so the permission mode still applies. The same help says built-in tools and plugins work normally under `--safe-mode` | `claude --help`: `--restricted` removes Bash, PowerShell, REPL, the other code-running tools, and WebFetch unless `--tools` names them, ignores user, project, and local settings (managed settings and `--settings` still apply), confines file tools to the working directories (`--add-dir` included), and refuses `bypassPermissions`. `--tools` is "the list of available tools". `--permission-mode` lists `dontAsk`. `--permission-prompts none`: "anything that would prompt is denied automatically; the permission mode still decides everything else." `--add-dir`: "Additional directories to allow tool access to". `--safe-mode`: installed plugins, hooks, skills, MCP servers, and the other customizations that help names are disabled; admin-managed policy settings still apply; permissions work normally |
| `claude` | `builder` with access `write` | bounded | `--restricted`, `--permission-mode acceptEdits`, `--permission-prompts none`, `--tools Read,Glob,Grep,Edit`. Each later root is `--add-dir`. `--safe-mode` as on the read-only row | Vendor permission system. Does not stop writes: Edit can write, and the help confines file tools to the working directories. No shell, because `--restricted` does not pass Bash unless `--tools` names it, and Bash is not named. The same `--safe-mode` limits as the read-only row, including that permissions work normally so `acceptEdits` still applies | Same `--restricted`, `--tools`, `--permission-prompts`, `--add-dir`, and `--safe-mode` lines. `--permission-mode` lists `acceptEdits` |
| `claude` | `builder` with access `write` | unrestricted | `--dangerously-skip-permissions`. Not combined with `--restricted` or `--safe-mode`. The other isolation flags are still passed | None | `claude --help`: "Bypass all permission checks." `--restricted` refuses `bypassPermissions`, so the two are not combined |
| `codex` | `reviewer`, `adversarial_reviewer`, and `builder` with access `read-only` | bounded | Refused before any vendor process starts. No run folder. The command is not built, so no `--sandbox`, no `--ignore-user-config`, no `--ignore-rules`, and no `--approve-for-me` is sent. `survey` exits 0 with `refusal` set, `stops_writes` false, `read_only` false, and `boundary_kind` null | None. Not reported as read-only. Nothing Codex prints establishes the effective configuration, so every bounded run is refused | Before the refusal, the tool reads `codex mcp list --json`. When that listing is a JSON array, it also reads `/etc/codex/config.toml`, `/etc/codex/requirements.toml`, `/etc/codex/managed_config.toml`, and `<root>/.codex/config.toml` for each root. `$CODEX_HOME/config.toml` is not read: `codex exec --help` says `--ignore-user-config` does not load that file, and names no flag that drops system configuration. `--ignore-rules` drops user or project execpolicy `.rules` files only. `codex mcp list --help` says `--json` prints the configured servers. That listing, on Codex 0.161.0, does not name the configuration layer or a tool `approval_mode`. `codex sandbox --help` names managed requirements and names no filesystem path. The three `/etc/codex` files and a project `.codex/config.toml` are the system, managed, and project locations the Codex 0.161.0 loader names. An MCP tool whose `approval_mode` is `approve` is not denied by `approval_policy` `never`, and the shell sandbox does not constrain that writer. The run is refused when the listing cannot be read, when the listing or one of those files shows an MCP server or `approval_mode` `approve`, and when the listing is empty, because an empty listing still does not establish the set. The message names the cause. The alternative is `claude` |
| `codex` | `builder` with access `write` | bounded | Refused the same way as the read-only row. The message also names `--unrestricted` | None. Not started, and not reported as a workspace-write sandbox | The same read and the same evidence as the read-only row. `--ignore-user-config` drops `$CODEX_HOME/config.toml` only, so a listed server is not shown to be outside the bounded run. The alternatives are `claude`, whose bounded builder passes `--restricted`, or `--unrestricted` |
| `codex` | `builder` with access `write` | unrestricted | `--dangerously-bypass-approvals-and-sandbox`. Each later root is `--add-dir`. No `--sandbox` flag beside it. No `--ignore-user-config` and no `--ignore-rules` | None | `codex exec --help`: "Skip all confirmation prompts and execute commands without sandboxing." |
| `grok` | `reviewer`, `adversarial_reviewer`, and `builder` with access `read-only` | bounded | Refused. The command is not built: no vendor process and no run folder. The refusal does not depend on whether an MCP server is configured, and this tool does not call `grok mcp list` or `grok inspect` at run time. An empty listing would not establish the toolset a headless run gets | None available. `--tools read_file,glob,grep,list_dir` is not a boundary, because nothing establishes that those are the tools the run gets | `grok --help`: `--tools` is "Built-in tools to allow" and `--disallowed-tools` is "Built-in tools to remove". No flag in that help turns MCP servers, plugins, or hooks off for a headless `--prompt-file` run. `--disable-web-search` and `--no-subagents` name two switches and do not state the rest of the toolset. `grok inspect` reports `mcpServers`, plugins, and hooks separately from built-in tools, and `grok mcp list` only lists configured servers. Use `claude` (`--restricted`, `--tools`, `--strict-mcp-config`, and `--safe-mode`). |
| `grok` | `builder` with access `write` | bounded | Refused. The command is not built: no vendor process and no run folder | None available | `grok --help`: `--sandbox` is "Sandbox profile for filesystem and network access" and lists no profile names, so none is selected. No listed permission mode is described as confining writes to the working directories. The refusal names `claude` (`--restricted`) and `--unrestricted`. |
| `grok` | `builder` with access `write` | unrestricted | `--permission-mode bypassPermissions`, and always `--disallowed-tools Agent`. No `--sandbox` profile. Later roots are text in `--rules`, not a directory grant | None | `grok --help`: `--permission-mode` lists `bypassPermissions`. `--disallowed-tools`: "Built-in tools to remove". `--rules`: "Extra rules to append to the system prompt" |
| any | a reviewer, or a builder whose access is not `write` | unrestricted | Refused. No vendor process and no run folder | None | This tool's own flag: `--unrestricted` runs a builder with permission checks off, and only when that builder's access is `write` |

A read-only role whose boundary would not stop writes is refused with the statement that it will not be called read-only.

## Isolation

On every `claude` run, both modes, the process working directory is the first root, and the command also carries the isolation below. `--safe-mode` is the exception: it is passed only when the mode is bounded.

| Flag or variable | What it does | Rests on |
|------------------|--------------|----------|
| `-p`, `--output-format json` | One non-interactive run, one JSON result | `claude --help`: `-p` / `--print` for non-interactive output. `--output-format` lists `json` and works with `--print` |
| `--no-session-persistence` | The session is not saved and cannot be resumed | "Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)" |
| `--disable-slash-commands` | Skills are off | "Disable all skills" |
| `--strict-mcp-config` and `--mcp-config` with `{"mcpServers":{}}` | No MCP servers from anywhere but that empty config | "Only use MCP servers from --mcp-config, ignoring all other MCP configurations" |
| `--setting-sources` with an empty value | The list of setting sources to load is empty | "Comma-separated list of setting sources to load (user, project, local)." `--restricted` also ignores user, project, and local settings files. Managed settings and `--settings` still apply. `--restricted` is not passed on an unrestricted run, so this empty list is the isolation there |
| `--settings` with `{"disableAllHooks":true,"autoMemoryEnabled":false}` | The two keys this tool sends. They are not lines in `--help` | `--settings` "a JSON string to load additional settings from" |
| `--safe-mode` | Bounded runs only. Installed plugins, hooks, skills, MCP servers, and the other customizations that help names are disabled. Admin-managed policy settings still apply. Permissions work normally. Built-in tools and plugins work normally, which the help states and which is a limit, not an unknown | The `--safe-mode` paragraph in `claude --help` |
| `CLAUDE_CONFIG_DIR` | Set on the child to the `.claude` directory under the home directory returned for this user. The path is not written into this file | The run must not persist a session beside the work |
| `CLAUDECODE` | Removed from the child environment | A nested session must not see that variable set |

An unrestricted builder is the only `codex` command this tool starts. That command is `exec`, with `--model`, `--skip-git-repo-check` ("Allow running Codex outside a Git repository"), `--cd` of the first root ("use the specified directory as its working root"), `--output-last-message` naming `last-message.md` in the run folder, and a final `-` so the prompt is read from stdin. Effort, when set, is `-c model_reasoning_effort="<effort>"`. `-c` overrides a configuration value and parses the value as TOML. The effort key is not listed in `codex exec --help`. The allowed names are the identity table above. An unrestricted run does not pass `--ignore-user-config` or `--ignore-rules`. It passes `--dangerously-bypass-approvals-and-sandbox`.

`grok` is `--prompt-file` of `prompt.md`, `--model`, `--cwd` of the first root ("Working directory"), `--output-format json`, and `--disallowed-tools Agent`. Effort, when set, is `--effort`. An unrestricted builder is the only `grok` command this tool starts.

The child process for every vendor is started in its own session, so its process id is the process group id. That process group id is written to `status.json` as `pgid`, beside `pid`, as soon as the process exists. The vendor does not execute until that record is published. The runner blocks SIGINT, SIGTERM, and SIGHUP from just before the spawn until the start record is in place, and then delivers any of those that arrived, so a catchable signal in that window stops the group and rewrites the record as `interrupted`. The child waits on a handshake the runner releases only after that record is published. If the runner is killed before the release, the child sees the pipe close and exits, and the vendor never starts.

On every exit after the process exists, including a completed run, a non-zero exit, invalid output, a timeout, an interrupt, and an error, the whole process group is signalled before the final state is written, not only the parent. The group is sent SIGTERM, then SIGKILL after 5 seconds if any member is still there, including a descendant whose parent has already exited. A `git` call that exceeds its own limit is stopped the same way. The vendor limit is the whole vendor process. The default is 1800 seconds. The largest accepted value is 604800 seconds.

If the runner itself dies by a signal it cannot catch after `status.json` is `started`, this process is gone and cannot rewrite the record. The caller reads `pgid`, checks whether that process group is still alive, sends SIGTERM to it, waits 5 seconds, sends SIGKILL if any member remains, and marks the run `interrupted`. Leaving `started` in place would report a run that no longer has a supervisor. If the runner dies by a signal it cannot catch before `status.json` exists, the run folder may hold `prompt.md` and no `status.json`. That absence means the vendor never ran, and there is no process group to stop.

## What a run writes

The script sets `sys.dont_write_bytecode` before it imports the implementation, and sets `PYTHONDONTWRITEBYTECODE` for the process, so a command does not write bytecode into this tool directory.

Nothing else is written inside this tool directory. `survey` writes nothing. `help` writes nothing. A refusal before the vendor process starts writes nothing, including a refusal for the attachment limit, a task file or attachment that is not UTF-8, a missing vendor, a missing `git` when `--diff` is set, a missing boundary, a bounded `codex` run, a `--timeout` that is not ASCII digits or is outside 1 to 604800, a path whose `..` follows a missing component or a non-directory, a bad `--run-name`, or a path inside the plugin root.

`run` sets the file mode mask to `077` and creates one folder under `--runs`. When `--run-name` is omitted, the name is `{stamp}-{role}-{cli}`, with the local time to the second, the role, and the vendor. A second folder in that same second is `{stamp}-{role}-{cli}-2`, then `-3`, through `-99`. After that the run is refused. When `--run-name` is set, the folder is exactly that name under `--runs`, and it is created only if it does not already exist. The caller can therefore know the folder before the run.

| File | When | Contents |
|------|------|----------|
| `prompt.md` | Every `run` that gets as far as a folder, including `--dry-run` | The role text, the roots, the task, any attachments, the optional snapshot, and a closing line that the reply is the report only |
| `status.json` | After the process exists and before the vendor executes, then again on every exit path | First `state` is `started`, with the process id, the process group id, the start time, and `report` null. The vendor is released only after this write. The rewrite carries the final state, and it is written only after the process group has been stopped. The write is to a temporary file in the same folder, then an atomic replace |
| `stdout.log`, `stderr.log` | A real run | The vendor process streams, raw bytes |
| `last-message.md` | A real `codex` run | Written by `codex`, not by this tool. The report is read from it |
| `report.md` | A real run that reaches an exit path | The parsed report, or `No report returned. See stderr.log in the run folder.` when the parse produced nothing |

A caller decides whether a delegate started by reading `status.json`, not by reading stdout. Stdout is empty until the run finishes, and it is empty after any outcome other than `completed`.

`--dry-run` stops after `prompt.md`. It does not start the vendor, does not write `status.json`, and does not write the logs. If the vendor process fails to start, or the run is interrupted before the spawn, the run folder is removed. A run folder that remains and has no `status.json` means the runner died before the start record was published. The vendor never ran, and there is no process group to stop.

The prompt is, in order: the text of `roles/builder.md`, `roles/reviewer.md`, or `roles/adversarial_reviewer.md` for the requested role; a roots note whose first line is `Workspace roots (the first is the working directory):`; `## Task`; one `## Attached:` block per `--context` file, naming the resolved path; `## Working tree snapshot` when `--diff` is set; `Reply with your report only.`

Attachments are measured with the file's size before any of them is opened. The running total of those sizes refuses the command, without opening the file that crossed the limit, when the total is greater than 200000. The message names 200000 and the path. Exactly 200000 is accepted. The bytes are then read and decoded as UTF-8. A file that is not valid UTF-8 is a refusal. There is no traceback.

### Working tree snapshot

`--diff` runs `git` only. No external diff program, no text conversion, and no filesystem monitor runs. `git` takes no optional locks. Each `git` call is bounded at 30 seconds. On that timeout the `git` process group is stopped the same way a vendor process is stopped, and the snapshot says the call timed out. A non-zero `git` result is written into the snapshot with the exit code and `git`'s own text. It is not replaced with `(no diff)`. `(no diff)` is used only when `git diff` exits 0 and prints nothing. `(clean)` is used only when `git status` exits 0 and prints nothing.

The child environment drops `GIT_EXTERNAL_DIFF`, `GIT_CONFIG_PARAMETERS`, and every `GIT_CONFIG_*` variable, and sets `GIT_OPTIONAL_LOCKS=0`. The command is `git --no-optional-locks` with `-c core.fsmonitor=`, `-c core.fsmonitorHookVersion=`, and `-c diff.external=`. `git diff` also passes `--no-ext-diff` and `--no-textconv`. Output that is not valid UTF-8 is the sentence `git output was not valid UTF-8.` inside the snapshot, not a traceback.

For each root the snapshot runs, in that root: `git rev-parse --is-inside-work-tree`, then `git status --short --untracked-files=all`, then `git diff HEAD`. A non-zero `rev-parse` is reported as not a git repository, with the exit code. A repository whose `git diff HEAD` exits non-zero, including one with no commit yet, reports that exit. The headings are `root 1`, `root 2`, and so on.

If `git` is not on `PATH`, or `git --version` fails, the command exits 1 before a run folder. The message names `git --version`.

## Output

`help` and `--help` print usage text and exit 0.

`survey` and `--dry-run` print one JSON object and exit 0. `survey` exits 0 when the flags are valid, including when `refusal` is set. Starting that role with `run` exits 1 and writes no run folder.

A delegate that completed prints one JSON object and exits 0. The same object is `status.json`.

Any other outcome after the vendor process has started leaves stdout empty, prints one line on stderr, and exits 1. The line is `Error: delegate state {state}. The run folder is {run folder}. Read status.json in that folder.` The record in the run folder has the same `state`. The states are `failed`, `timeout`, `incomplete`, `invalid-output`, `interrupted`, and `error`. No other exit code is used. An interrupt is exit 1, including an interrupt before the spawn. That earlier interrupt prints `Error: interrupted before the delegate started.` and leaves no run folder.

A refusal before any vendor process starts prints to stderr, leaves stdout empty, exits 1, and leaves no run folder. The stderr line starts with `Error:` and names the cause and the fix. SIGINT, SIGTERM, and SIGHUP are that refusal when they arrive before the spawn. From the spawn until the start record is published they are held, then delivered, so one that arrives in that window is state `interrupted`: the group is stopped and `status.json` is final. After the record is published they are state `interrupted` as well. A signal the runner cannot catch does not run this cleanup. When `status.json` is `started`, the caller follows the recovery in Isolation: read `pgid`, stop that process group, and mark the run `interrupted`. When the run folder has no `status.json`, the vendor never ran.

`run` fields:

| Field | Carries |
|-------|---------|
| `command` | `run` |
| `state` | `started` while the vendor process is running, then `completed`, `failed`, `timeout`, `incomplete`, `invalid-output`, `interrupted`, `error`, or `dry-run` |
| `role` | The requested role. There is no fallback role |
| `cli`, `model`, `effort`, `access` | The flags that were applied. `effort` is null when omitted |
| `mode` | `bounded` or `unrestricted` |
| `boundary_kind` | `operating-system-sandbox`, `vendor-permission-system`, or `none`. Null when the row is refused and no boundary was established |
| `stops_writes`, `read_only` | `read_only` is true only when `stops_writes` is true |
| `enforcement_flags` | The boundary flags from the table. Directory flags and isolation flags are in `argv` |
| `limits` | What the help does not establish, or the established limits named in the table. Empty when there is nothing to qualify |
| `roots` | The resolved roots, first one the working directory |
| `delegate_started` | False for `--dry-run` and before the process exists. True once the vendor process has been started |
| `pid`, `pgid`, `started_at` | The vendor process id, the vendor process group id, and the UTC start time `YYYY-MM-DDTHH:MM:SSZ`. Null on `--dry-run` and before the start record. The vendor is started in its own session, so `pgid` and `pid` are the same number. A caller that finds the runner dead and `state` still `started` uses `pgid` as Isolation describes. A caller that finds a run folder and no `status.json` does not look for a process group: the vendor never ran |
| `exit_code`, `seconds` | The vendor process. Null on `--dry-run` and in the `started` record |
| `run_dir`, `prompt_path` | The folder and `prompt.md` |
| `dry_run` | True or false |
| `argv` | The full command, with paths resolved. Null until the command has been built |
| `report` | The report text. Null in the `started` record and on `--dry-run`. The placeholder sentence when a finished run produced no report |

`claude` and `grok` take the report from JSON `result`, then `text`, then `response`. The streams are read as bytes and decoded as UTF-8. Bytes that are not valid UTF-8 set `invalid-output` when the process exited 0, and otherwise keep the state already chosen (`failed` or `timeout`). There is no traceback. `is_error`, `error`, or a `subtype` that starts with `error` sets `failed`. On exit 0, a stop reason other than `end_turn` or `stop` (underscores ignored, letter case ignored) sets `incomplete`. Empty text on an otherwise completed parse sets `invalid-output`. Non-JSON on exit 0 sets `invalid-output`. `codex` reads `last-message.md` the same way: a missing, empty, or undecodable file on exit 0 is `invalid-output`, and a non-zero exit is `failed`. A timeout keeps the raw stdout and does not parse it.

`survey` fields: `command` is `survey`, `mode` is the mode that was previewed, and `vendors` has `claude`, `codex`, and `grok`. `role` is one object, not a list. There is no `spec_role` and no fallback. Each vendor entry has `on_path`, `path`, `version`, and `version_error`. `version` is the first line of `{cli} --version`, cut at 300 characters. A failure records the exit code or a timeout in `version_error` and does not copy the vendor's stderr. The role object has the same boundary fields as `run`, plus `refusal` (null when the run would be allowed) and `directory_flags`.

## What this tool cannot do

It adjudicates nothing. The delegate's report is returned data, including when `state` is `completed`. It does not check the report against the tree, does not redact it, and does not treat a completed delegate as an approval.

It does not edit the roots itself. A bounded `claude` builder has no shell, so it cannot run tests; the boundary that exists is file-tool confinement, with the limits in the table.

It does not install Python, git, or a vendor tool. It does not accept a configuration file. It does not resume a vendor session. It does not claim a boundary the vendor's help does not establish.

## Offline checks

From this tool's directory, with no vendor model started:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -t tests
```

The checks are offline. They use stand-in programs for the three vendor names. A live `survey` runs `{cli} --version` for each vendor. A bounded `codex` `survey` or `run` also runs `codex mcp list --json` and, when that listing can be read, reads the system and project files named in the enforcement table. It does not start a model. The checks do not call the installed vendor tools.

## Script contract

Every script in this tool follows `system/templates/Script Contract.md`. The entry is `scripts/subagent_runner.py`, and the interpreter is the Python 3 declared under Dependencies. `git` is the system dependency declared for `--diff`, with the presence command `git --version`.

Help is answered before any other work. Unknown flags are refused by name. There is no `--env` and no configuration file, so the contract's rule that `--env` values stay out of every output and log does not apply: nothing is read from such a file. Caller-named paths are screened as the Paths section says. A destination inside this tool directory is refused. The canonical path resolves the deepest existing ancestor through the filesystem before a parent component is collapsed. A symbolic link target is walked the same way, and a trailing `/` or `/.` requires a directory.

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| `unknown option "--install"` or `unknown option "--env"` | Drop the flag. Nothing installs, and there is no configuration file |
| `must be an absolute path` | Pass an absolute path. A relative one is refused on purpose |
| `resolves inside this tool directory` or `contains this tool directory` | Pass a `--runs` directory, and a builder `--root`, outside this tool |
| `resolves inside the plugin root` or `contains the plugin root` | Pass a `--runs` directory, and a builder `--root`, outside the plugin that holds this tool |
| `--run-name` `already exists` or the character rule | Pick another name, or omit `--run-name` and let the tool name the folder. `.` and `..` are refused |
| `attached context exceeds 200000 bytes` | Attach less, or name the paths in the task. The size is taken before the file is read. The folder is not created |
| `is not valid UTF-8` | Save the task file or the attachment as UTF-8. The folder is not created. Vendor output that is not UTF-8 is `invalid-output` in `status.json`, not a traceback |
| `no enforced boundary` | For a bounded `grok` reviewer, the help does not establish the toolset. Use `claude`, as the message says. For a bounded `grok` builder, use `claude` or `--unrestricted`. A bounded `codex` run is not that alternative |
| `A bounded codex run is refused` | The listing could not be read, or the listing or a system or project file shows an MCP server or `approval_mode` `approve`, or nothing Codex prints establishes the effective set. Use `claude`. For a builder whose access is `write`, `--unrestricted` is the other alternative |
| `cannot be canonicalized` | `..` follows a component that does not exist, or one that is not a directory, including inside a symbolic link's target. A trailing `/` or `/.` that does not name a directory is refused the same way. Pass a path the filesystem can traverse. A missing file at the end, with no `..` after it, is still accepted |
| `--unrestricted runs a builder` | Drop the flag, or pass `--role builder` with `--access write` |
| `'codex' is not on PATH` (or `claude`, or `grok`) | The message names the presence check, `{cli} --version`. Install steps are not in this file |
| `git is not on PATH` or `git --version` failed | Drop `--diff`, or make `git --version` succeed. No run folder is kept |
| `Error: delegate state ...` | The delegate did not complete. Read `status.json` in the run folder the line names. The process exited 1 on purpose |
| `--timeout` is empty, is not ASCII digits, or is outside 1 to 604800 | Pass a whole number of seconds from 1 to 604800, using the digits 0-9. The message names which of those it was |

## Success

- `help`, and `survey --help` or `run --help`, exits 0 and lists every flag in Usage, with no configuration file and no `--env`.
- An unknown flag, a repeated flag other than `--context` and `--root`, a relative path, a missing boundary, a bounded `codex` run, a `--timeout` that is empty or not ASCII digits or above 604800, a `--task-file`, `--context`, or `--root` whose `..` follows a regular file or a missing component, including when that `..` is inside a symbolic link's target, or whose spelling ends in `/` or `/.` and does not resolve to a directory, a `--runs` directory or a builder root inside or containing the plugin root, a bad `--run-name`, an attachment over 200000 bytes, or a task file or attachment that is not UTF-8, exits 1 with stdout empty, and writes no run folder.
- `survey` exits 0 with one JSON object, `mode` set, one `role` object, and `refusal` set when bounded or unrestricted mode would refuse that role. A bounded `codex` survey sets `read_only` false.
- `--dry-run` exits 0, writes only `prompt.md`, sets `delegate_started` to false and `state` to `dry-run`, and does not start a vendor process.
- A completed run exits 0 with one JSON object whose `mode`, `boundary_kind`, `enforcement_flags`, and `limits` match the enforcement table. The run folder holds the prompt, both logs, the report, and `status.json`. That file's `state` was `started`, with `pid` and `pgid`, before the final state. A descendant the vendor left in its process group is stopped before that final state, on a completed run and on a non-zero exit alike.
- A run that fails after starting, a run whose report cannot be parsed, a run that times out, and a run that is interrupted by SIGINT, SIGTERM, or SIGHUP, each exit 1 with stdout empty, and each leaves a final `status.json`. Each of those, and a completed run, leaves no live member of the vendor process group.
- A catchable signal delivered after the spawn and before the start record is published ends as `interrupted`, with the group stopped and a final `status.json`. A runner killed before that record leaves no `status.json` and no live vendor.
