"""One headless builder or reviewer run, and a survey that starts no model.

The rules every shipped script follows are stated once, in
system/templates/Script Contract.md. This module uses the Python standard
library only. The role, the vendor, and the roots arrive as flags. There is
no configuration file.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

TOOL_DIR = str(Path(__file__).resolve().parents[1])
ROLES_DIR = os.path.join(TOOL_DIR, "roles")
HELP_COMMAND = "python3 scripts/subagent_runner.py help"

MAX_ATTACHMENT_BYTES = 200000
DEFAULT_TIMEOUT = 1800
# Seven days. A larger value is refused before a vendor process starts.
MAX_TIMEOUT = 604800
RUN_DIR_TRIES = 99
VERSION_TIMEOUT = 15
GIT_TIMEOUT = 30
GRACE_SECONDS = 5

CLIS = ("claude", "codex", "grok")
ROLE_NAMES = ("builder", "reviewer", "adversarial_reviewer")
ACCESS_LEVELS = ("write", "read-only")
DEFAULT_ACCESS = {"builder": "write", "adversarial_reviewer": "read-only", "reviewer": "read-only"}
EFFORTS = {
    "claude": ("low", "medium", "high", "xhigh", "max"),
    "codex": ("none", "minimal", "low", "medium", "high", "xhigh"),
    "grok": ("low", "medium", "high", "xhigh"),
}
RUN_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")

CLAUDE_READ_TOOLS = "Read,Glob,Grep"
CLAUDE_WRITE_TOOLS = "Read,Glob,Grep,Edit"
CLAUDE_SETTINGS = '{"disableAllHooks":true,"autoMemoryEnabled":false}'
CLAUDE_MCP = '{"mcpServers":{}}'

OS_SANDBOX = "operating-system-sandbox"
VENDOR_PERMISSION = "vendor-permission-system"
BOUNDARY_NONE = "none"

# System and managed files the Codex 0.161.0 loader names. `codex exec --help`
# names `$CODEX_HOME/config.toml` and says `--ignore-user-config` skips that
# file only. `codex sandbox --help` names managed requirements and does not
# name a path. These three paths are the ones that loader contains.
CODEX_SYSTEM_FILES = (
    "/etc/codex/config.toml",
    "/etc/codex/requirements.toml",
    "/etc/codex/managed_config.toml",
)
CLAUDE_LIMITS = [
    "claude --help: under --restricted, managed settings and --settings still apply, and file tools are confined to the working directories (--add-dir included). --safe-mode disables installed plugins, hooks, skills, MCP servers, and the other customizations that help names; admin-managed policy settings still apply, and permissions work normally. That help also says built-in tools and plugins work normally under --safe-mode.",
]

GROK_REVIEW_REFUSAL = (
    "no enforced boundary for a grok reviewer in bounded mode. "
    "grok --help describes --tools as built-in tools to allow and --disallowed-tools as built-in tools to remove. "
    "It describes no flag that turns MCP servers, plugins, or hooks off for a headless run. "
    "grok inspect reports mcpServers, plugins, and hooks separately from built-in tools, and grok mcp list only lists configured servers. "
    "Nothing in that help or those listings establishes the toolset a headless run actually gets, so a --tools value of "
    "read_file,glob,grep,list_dir is not a boundary. "
    "Use claude, whose bounded reviewer passes --restricted, --tools, --strict-mcp-config, and --safe-mode. "
    "A bounded codex run is not an alternative: codex mcp list --json does not establish the effective configuration, "
    "and --ignore-user-config drops the user layer only."
)

HELP = """\
Subagent Runner: run one builder or reviewer, or survey the boundary.

Usage:
  python3 scripts/subagent_runner.py help
  python3 scripts/subagent_runner.py survey --role ROLE --cli CLI --model NAME
      [--effort LEVEL] [--access LEVEL] --root DIR [--root DIR ...]
      [--unrestricted]
  python3 scripts/subagent_runner.py run --role ROLE --cli CLI --model NAME
      [--effort LEVEL] [--access LEVEL] --root DIR [--root DIR ...]
      --runs DIR (--task TEXT | --task-file FILE) [--context FILE]
      [--diff] [--timeout SECONDS] [--dry-run] [--unrestricted]
      [--run-name NAME]

DIR and FILE are absolute paths. There is no configuration file.
The first --root is the working directory.

Commands:
  help     Print this text and exit.
  survey   Report which vendor tools are on PATH, their versions, and the
           mode and boundary this role would get. Starts no model.
  run      Run one role. Starts the vendor tool --cli names.

run options:
  --role ROLE        builder, reviewer, or adversarial_reviewer. Required.
  --cli CLI          claude, codex, or grok. Required.
  --model NAME       Model name passed to that vendor. Required.
  --effort LEVEL     Optional. claude: low, medium, high, xhigh, max.
                     codex: none, minimal, low, medium, high, xhigh.
                     grok: low, medium, high, xhigh.
  --access LEVEL     write or read-only. Default write for builder and
                     read-only for the others. Only a builder may be write.
  --root DIR         A directory for the delegate. Repeatable. Required.
                     The first is the working directory.
  --runs DIR         Directory for the run folder. Absolute path. Required.
  --task TEXT        The brief. Exactly one of --task and --task-file.
  --task-file FILE   The brief, read from a file. Absolute path.
  --context FILE     Attach a file. Repeatable. Absolute path.
  --diff             Attach git status and diff for every root that is a
                     git repository.
  --timeout SECONDS  Per-run limit. A positive whole number of ASCII
                     digits, from 1 to 604800. Default 1800.
  --dry-run          Write the prompt and return the command. Start nothing.
  --unrestricted     Run a builder whose access is write with that vendor's
                     permission checks off. Reviewers cannot use it.
  --run-name NAME    Folder name under --runs. Letters, digits, hyphens,
                     underscores, and periods. Refused when the folder exists.
                     When omitted, the tool names the folder.
  --help, -h         Print this text and exit.

survey options:
  --role, --cli, --model, --effort, --access, --root
                     The same flags as run. --root is repeatable.
  --unrestricted     Report the unrestricted mode instead of the default.
  --help, -h         Print this text and exit.

Bounded is the default. A role whose vendor has no enforced boundary is
refused, and the message names the other vendors. A bounded codex run is
refused when its effective configuration is not established. codex mcp list
--json does not establish that set.
This tool installs nothing. --install is refused like any other unknown flag.
An unknown flag is refused by name. A repeated flag is refused, except
--context and --root. A value that starts with - is refused.

A delegate that completed prints one JSON object and exits 0. help and
--help print usage and exit 0. survey and --dry-run print one JSON object
and exit 0. Any other delegate outcome prints to stderr, leaves stdout
empty, and exits 1. The run folder's status.json records the same state.
"""


class RunnerError(Exception):
    """A refusal. main() prints it on stderr and exits 1."""


def fail(message):
    raise RunnerError(message)


def help_hint(message):
    fail('{}. Run "{}" for usage.'.format(message, HELP_COMMAND))


def emit(payload):
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def canonical(label, raw):
    """Resolve the deepest existing ancestor before collapsing '..'.

    normpath would remove a symlink's '..' before the filesystem is asked,
    and would name a different file from the path the caller spelled.
    """
    if not isinstance(raw, str) or not os.path.isabs(raw):
        shown = raw if isinstance(raw, str) else type(raw).__name__
        fail('{} must be an absolute path; got "{}", which would resolve against whatever directory the caller happened to be in. Pass an absolute path.'.format(label, shown))
    parts = []
    for part in raw.split(os.sep):
        if part == "" or part == ".":
            continue
        parts.append(part)
    resolved = os.sep
    pending = []
    for part in parts:
        if part == "..":
            # A missing component, or one that exists and is not a directory,
            # cannot be traversed. Collapsing it would name a different path.
            if pending:
                fail("{} cannot be canonicalized: '..' follows '{}', which does not exist. Pass a path whose existing components are directories.".format(label, pending[-1]))
            if not os.path.isdir(resolved):
                fail("{} cannot be canonicalized: '..' follows '{}', which is not a directory. Pass a path the filesystem can traverse.".format(label, resolved))
            parent = os.path.dirname(resolved)
            resolved = parent if parent else os.sep
            continue
        if pending:
            pending.append(part)
            continue
        candidate = os.path.join(os.sep, part) if resolved == os.sep else os.path.join(resolved, part)
        try:
            found = os.path.lexists(candidate)
        except OSError as error:
            fail("{} could not be resolved to a real path at {} ({}). Confirm every folder on the way is readable.".format(label, candidate, error.strerror))
        if not found:
            pending.append(part)
            continue
        try:
            real = os.path.realpath(candidate)
        except OSError as error:
            fail("{} could not be resolved to a real path at {} ({}). Fix the symbolic links on the way.".format(label, candidate, error.strerror))
        if not os.path.exists(real):
            fail("{} could not be resolved to a real path ({} does not exist). Fix the symbolic link.".format(label, candidate))
        resolved = real
    if pending:
        return os.path.join(resolved, *pending)
    return resolved


def stat_id(path):
    st = os.stat(path)
    return (st.st_dev, st.st_ino)


def inside(path, root):
    """True when path is root or sits inside it, compared by device and inode."""
    try:
        root_id = stat_id(root)
    except OSError as error:
        fail("could not screen against {} ({}). Fix that directory's permissions.".format(root, error.strerror))
    head = path
    while True:
        try:
            if stat_id(head) == root_id:
                return True
        except FileNotFoundError:
            pass
        except OSError as error:
            fail("could not screen {} ({}). Pass a path this user can stat.".format(path, error.strerror))
        parent = os.path.dirname(head)
        if parent == head:
            return False
        head = parent


def contains_path(path, child):
    """True when path is a strict ancestor of child."""
    if not os.path.exists(path) or not inside(child, path):
        return False
    try:
        return stat_id(path) != stat_id(child)
    except OSError:
        return False


def find_plugin_root(tool_dir):
    """Directory above the tool's family directory, when it holds tools/AGENTS.md.

    The family directory is the parent of the tool directory. Installed, that
    parent is named tools, and its parent holds tools/AGENTS.md. A copy that
    is not installed that way has no plugin root.
    """
    family = os.path.dirname(tool_dir)
    root = os.path.dirname(family)
    if not family or not root or os.path.normcase(root) == os.path.normcase(family):
        return None
    if os.path.basename(family) != "tools":
        return None
    marker = os.path.join(root, "tools", "AGENTS.md")
    try:
        if not os.path.isfile(marker):
            return None
        if os.path.normcase(os.path.realpath(family)) != os.path.normcase(os.path.realpath(os.path.join(root, "tools"))):
            return None
        return os.path.realpath(root)
    except OSError:
        return None


def destination_block(path, tool_dir, plugin_root, kind):
    """A reason to refuse, or None. kind is 'runs' or 'builder-root'."""
    if inside(path, tool_dir):
        return "resolves inside this tool directory"
    if kind == "builder-root" and contains_path(path, tool_dir):
        return "contains this tool directory"
    if plugin_root and kind in ("runs", "builder-root"):
        if inside(path, plugin_root):
            return "resolves inside the plugin root"
        if contains_path(path, plugin_root):
            return "contains the plugin root"
    return None


class Screen(object):
    def __init__(self, tool_dir=None):
        self.tool_dir = canonical("this tool directory", tool_dir or TOOL_DIR)
        self.plugin_root = find_plugin_root(self.tool_dir)

    def source_file(self, label, raw):
        resolved = canonical(label, raw)
        if not os.path.isfile(resolved):
            fail("{} is not a file ({}). Pass an absolute path to a file.".format(label, resolved))
        return resolved

    def runs_dir(self, raw):
        resolved = canonical("--runs", raw)
        if os.path.exists(resolved) and not os.path.isdir(resolved):
            fail("--runs is not a directory ({}). Pass an absolute path to a directory.".format(resolved))
        reason = destination_block(resolved, self.tool_dir, self.plugin_root, "runs")
        if reason:
            where = "this tool" if "tool directory" in reason else "the plugin"
            fail("--runs {} ({}). Pass a directory outside {}.".format(reason, resolved, where))
        return resolved

    def root_dir(self, raw, protect):
        resolved = canonical("--root", raw)
        if not os.path.isdir(resolved):
            fail("--root is not an existing directory ({}). Pass a root that exists.".format(resolved))
        if protect:
            reason = destination_block(resolved, self.tool_dir, self.plugin_root, "builder-root")
            if reason:
                where = "this tool" if "tool directory" in reason else "the plugin"
                fail("--root {} ({}). Pass a builder root outside {}.".format(reason, resolved, where))
        return resolved


class Boundary(object):
    def __init__(self, mode, kind, stops_writes, flags, refusal=None, limits=None):
        self.mode = mode
        self.kind = kind
        self.stops_writes = stops_writes
        self.flags = list(flags)
        self.refusal = refusal
        self.limits = list(limits or [])

    @property
    def read_only(self):
        return bool(self.stops_writes)

    def as_dict(self):
        return {
            "mode": self.mode,
            "boundary_kind": self.kind,
            "stops_writes": self.stops_writes,
            "read_only": self.read_only,
            "enforcement_flags": self.flags,
            "limits": self.limits,
            "refusal": self.refusal,
        }


def _unrestricted_refusal(role, access):
    return Boundary(
        "unrestricted", None, False, [],
        "--unrestricted runs a builder with permission checks off, and only when that builder's access is write. "
        "This run is {} with access {}. Remove --unrestricted, or pass --role builder with --access write.".format(role, access),
    )


def boundary_for(cli, access, mode, role):
    """The enforced boundary for one role, or a refusal that names the alternatives."""
    if access == "write" and role != "builder":
        return Boundary(
            mode, None, False, [],
            "only a builder may have access write. This run is {}. Pass --access read-only, or pass --role builder.".format(role),
        )
    if mode == "unrestricted":
        if role != "builder" or access != "write":
            return _unrestricted_refusal(role, access)
        if cli == "claude":
            flags = ["--dangerously-skip-permissions"]
        elif cli == "codex":
            flags = ["--dangerously-bypass-approvals-and-sandbox"]
        elif cli == "grok":
            flags = ["--permission-mode", "bypassPermissions"]
        else:
            fail("unsupported vendor {!r}.".format(cli))
        return Boundary("unrestricted", BOUNDARY_NONE, False, flags)

    if access == "read-only":
        if cli == "claude":
            flags = ["--restricted", "--permission-mode", "dontAsk", "--permission-prompts", "none",
                     "--tools", CLAUDE_READ_TOOLS]
            return Boundary("bounded", VENDOR_PERMISSION, True, flags, limits=CLAUDE_LIMITS)
        if cli == "codex":
            # Not a boundary. codex_bounded_refusal reads the vendor and refuses
            # unless that read establishes the effective set. read_only stays
            # false until then, and the current listing never establishes it.
            return Boundary("bounded", None, False, [])
        if cli == "grok":
            return Boundary("bounded", None, False, [], GROK_REVIEW_REFUSAL)
        fail("unsupported vendor {!r}.".format(cli))

    if access == "write":
        if cli == "claude":
            flags = ["--restricted", "--permission-mode", "acceptEdits", "--permission-prompts", "none",
                     "--tools", CLAUDE_WRITE_TOOLS]
            return Boundary("bounded", VENDOR_PERMISSION, False, flags, limits=CLAUDE_LIMITS)
        if cli == "codex":
            return Boundary("bounded", None, False, [])
        if cli == "grok":
            return Boundary(
                "bounded", None, False, [],
                "no enforced boundary for a grok builder in bounded mode. "
                "grok --help lists --sandbox with a profile and does not list profile names, so no sandbox is selected, "
                "and no permission mode in that help confines writes to the working directories. "
                "Use claude, whose bounded builder passes --restricted, "
                "or pass --unrestricted to run this grok builder with permission checks off. "
                "A bounded codex run is not an alternative: its effective configuration is not established, "
                "and --ignore-user-config drops the user layer only.",
            )
        fail("unsupported vendor {!r}.".format(cli))
    fail("access {!r} is not write or read-only.".format(access))


_APPROVE_RE = re.compile(
    r"(?i)approval_mode[\"']?\s*(?:=|:)\s*(?:\"approve\"|'approve'|approve)(?!\w)"
)
_MCP_RE = re.compile(r"(?i)(?:^|\n)\s*\[+\s*mcp_servers\b|\bmcp_servers\s*=")


def _codex_alternatives(role, access):
    if role == "builder" and access == "write":
        return (
            "Use claude, whose bounded builder passes --restricted, "
            "or pass --unrestricted to run this builder with permission checks off."
        )
    return (
        "Use claude, whose bounded run passes --restricted, --tools, --strict-mcp-config, and --safe-mode."
    )


def _codex_refusal(cause, role, access):
    return "{}. A bounded codex run is refused. {}".format(cause.rstrip("."), _codex_alternatives(role, access))


def _codex_config_paths(roots):
    paths = list(CODEX_SYSTEM_FILES)
    for root in roots:
        paths.append(os.path.join(root, ".codex", "config.toml"))
    return paths


def _config_file_cause(path):
    """None when the file is absent or adds no MCP server and no approve override.

    The file's text is not copied into the cause. A configuration can hold a credential.
    """
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except FileNotFoundError:
        return None
    except OSError as error:
        return "{} could not be read ({}). This file is part of the effective configuration and was not established".format(
            path, error.strerror or "unreadable")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return "{} is not valid UTF-8, so this configuration was not established".format(path)
    has_mcp = _MCP_RE.search(text) is not None
    has_approve = _APPROVE_RE.search(text) is not None
    if not has_mcp and not has_approve:
        return None
    found = []
    if has_mcp:
        found.append("an MCP server")
    if has_approve:
        found.append('approval_mode "approve"')
    return "{} contains {}. --ignore-user-config does not drop this file".format(path, " and ".join(found))


def _approve_in(value, trail):
    if isinstance(value, dict):
        mode = value.get("approval_mode")
        if isinstance(mode, str) and mode.lower() == "approve":
            where = trail or "approval_mode"
            return 'approval_mode "approve" ({})'.format(where)
        for key, item in value.items():
            if key == "approval_mode":
                continue
            found = _approve_in(item, key if not trail else "{}.{}".format(trail, key))
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _approve_in(item, trail)
            if found:
                return found
    return None


def _describe_mcp_server(server):
    if not isinstance(server, dict):
        return "an MCP entry that is not an object"
    name = server.get("name")
    if not isinstance(name, str) or not name.strip():
        name = "unnamed"
    layer = server.get("layer")
    if not isinstance(layer, str) or not layer.strip():
        layer = server.get("source")
    if isinstance(layer, str) and layer.strip():
        where = "at the {} layer".format(layer.strip())
    else:
        where = "whose configuration layer is not named"
    text = 'MCP server "{}" {}'.format(name.strip(), where)
    approve = _approve_in(server, "")
    if approve:
        text = "{} with {}".format(text, approve)
    return text


def _read_codex_mcp_list(executable):
    """Return (servers, cause). cause is set when the listing cannot be read."""
    proc = subprocess.Popen(
        [executable, "mcp", "list", "--json"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        out, _err = proc.communicate(timeout=VERSION_TIMEOUT)
    except subprocess.TimeoutExpired:
        stop_process(proc)
        _finish_pipes(proc)
        return None, "codex mcp list --json could not be read (timed out after {} seconds)".format(VERSION_TIMEOUT)
    except OSError as error:
        stop_process(proc)
        return None, "codex mcp list --json could not be read ({})".format(error.strerror or "could not start")
    except KeyboardInterrupt:
        stop_process(proc)
        _finish_pipes(proc)
        raise
    if proc.returncode != 0:
        return None, "codex mcp list --json could not be read (exited {})".format(proc.returncode)
    try:
        text = out.decode("utf-8")
    except UnicodeDecodeError:
        return None, "codex mcp list --json could not be read (was not valid UTF-8)"
    try:
        data = json.loads(text)
    except ValueError:
        return None, "codex mcp list --json could not be read (was not valid JSON)"
    if not isinstance(data, list):
        return None, "codex mcp list --json could not be read (was not a JSON array)"
    described = []
    for server in data:
        described.append(_describe_mcp_server(server))
    if described:
        return described, None
    return [], None


def codex_bounded_refusal(executable, roots, role, access):
    """Why a bounded codex run is refused.

    `codex mcp list --json` (Codex 0.161.0) lists configured servers and does not
    name the configuration layer or a tool approval override. `--ignore-user-config`
    drops `$CODEX_HOME/config.toml` only. An empty listing therefore does not
    establish the effective set, and this function does not return an allow.
    """
    servers, cause = _read_codex_mcp_list(executable)
    if cause:
        return _codex_refusal(cause, role, access)
    if servers:
        cause = (
            "codex mcp list --json reports {}. --ignore-user-config drops $CODEX_HOME/config.toml only, "
            "so a listed server is not shown to be outside the bounded run, and approval_policy \"never\" "
            "does not deny a tool whose approval_mode is approve"
        ).format("; ".join(servers))
        return _codex_refusal(cause, role, access)
    for path in _codex_config_paths(roots):
        file_cause = _config_file_cause(path)
        if file_cause:
            return _codex_refusal(file_cause, role, access)
    return _codex_refusal(
        "codex mcp list --json names no MCP server and does not print the configuration layer or any tool "
        "approval override. codex exec --help says --ignore-user-config does not load $CODEX_HOME/config.toml "
        "and names no flag that drops system configuration. Nothing Codex prints establishes the effective configuration",
        role, access,
    )


def extra_dir_flags(cli, boundary, roots):
    """Directory grants that belong to the boundary. Codex read-only gets none."""
    extras = roots[1:]
    if not extras or boundary.refusal:
        return []
    if cli == "codex":
        if boundary.mode == "bounded" and boundary.stops_writes:
            return []
        flags = []
        for extra in extras:
            flags.extend(["--add-dir", extra])
        return flags
    if cli == "claude":
        flags = []
        for extra in extras:
            flags.extend(["--add-dir", extra])
        return flags
    return []


def roots_note(roots):
    lines = ["Workspace roots (the first is the working directory):"]
    for path in roots:
        lines.append("- {}".format(path))
    return "\n".join(lines)


def read_role(role):
    path = os.path.join(ROLES_DIR, role + ".md")
    if not os.path.isfile(path):
        fail("this tool is missing roles/{}.md. Restore the file that shipped with the tool.".format(role))
    try:
        with open(path, "rb") as handle:
            data = handle.read()
        return data.decode("utf-8")
    except UnicodeDecodeError:
        fail("roles/{}.md is not valid UTF-8. Restore the file that shipped with the tool.".format(role))
    except OSError as error:
        fail("roles/{}.md could not be read ({}). Restore the file that shipped with the tool.".format(role, error.strerror))


def read_utf8_file(path):
    """Return (text, problem). problem is a short reason, never a traceback."""
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError as error:
        return "", "could not be read ({})".format(error.strerror)
    try:
        return data.decode("utf-8"), None
    except UnicodeDecodeError:
        return "", "is not valid UTF-8"


def read_contexts(screen, paths):
    """Attach files. The size is the file's size, taken before any read."""
    resolved_paths = []
    total = 0
    for raw in paths:
        resolved = screen.source_file("--context", raw)
        try:
            size = os.path.getsize(resolved)
        except OSError as error:
            fail("--context could not be measured at {} ({}). Pass a readable file.".format(resolved, error.strerror))
        total += size
        if total > MAX_ATTACHMENT_BYTES:
            fail("attached context exceeds {} bytes at {} (running total {}). Attach less, or name the paths in the task instead of attaching the files.".format(
                MAX_ATTACHMENT_BYTES, resolved, total))
        resolved_paths.append((resolved, size))
    items = []
    total = 0
    for resolved, size in resolved_paths:
        try:
            with open(resolved, "rb") as handle:
                data = handle.read()
        except OSError as error:
            fail("--context could not be read at {} ({}). Pass a readable file.".format(resolved, error.strerror))
        total += len(data)
        if total > MAX_ATTACHMENT_BYTES:
            fail("attached context exceeds {} bytes at {} (running total {}). Attach less, or name the paths in the task instead of attaching the files.".format(
                MAX_ATTACHMENT_BYTES, resolved, total))
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            fail("--context is not valid UTF-8 ({}). Save the file as UTF-8.".format(resolved))
        items.append((resolved, text))
    return items


def git_child_env():
    """No inherited external diff, text conversion, or config injection."""
    env = {}
    for key, value in os.environ.items():
        if key in ("GIT_EXTERNAL_DIFF", "GIT_CONFIG_PARAMETERS") or key.startswith("GIT_CONFIG_"):
            continue
        env[key] = value
    env["GIT_OPTIONAL_LOCKS"] = "0"
    return env


def git_prefix(git):
    return [
        git,
        "--no-optional-locks",
        "-c", "core.fsmonitor=",
        "-c", "core.fsmonitorHookVersion=",
        "-c", "diff.external=",
    ]


def decode_git(data):
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return "git output was not valid UTF-8."


def _finish_pipes(process):
    """Drain a killed child so its pipes are not left open."""
    if process is None:
        return
    try:
        process.communicate(timeout=1)
    except (subprocess.TimeoutExpired, OSError, ValueError):
        for pipe in (process.stdin, process.stdout, process.stderr):
            if pipe is None:
                continue
            try:
                pipe.close()
            except OSError:
                pass


def run_git(argv):
    """Return (code, stdout, stderr). code is None when the call times out."""
    proc = subprocess.Popen(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        env=git_child_env(),
    )
    try:
        out, err = proc.communicate(timeout=GIT_TIMEOUT)
    except subprocess.TimeoutExpired:
        stop_process(proc)
        _finish_pipes(proc)
        return None, b"", b""
    return proc.returncode, out or b"", err or b""


def require_git():
    git = shutil.which("git")
    if not git:
        fail("git is not on PATH, so --diff cannot attach a snapshot. Presence check: git --version.")
    try:
        result = subprocess.run(
            [git, "--version"], capture_output=True, timeout=VERSION_TIMEOUT, start_new_session=True,
            env=git_child_env())
    except (OSError, subprocess.TimeoutExpired):
        fail("git did not answer. Presence check: git --version.")
    if result.returncode != 0:
        fail("git --version exited {}. Presence check: git --version.".format(result.returncode))
    return git


def git_section(git, name, path):
    probe_code, probe_out, probe_err = run_git(git_prefix(git) + ["-C", path, "rev-parse", "--is-inside-work-tree"])
    if probe_code is None:
        return "### {} ({}): git rev-parse timed out after {} seconds".format(name, path, GIT_TIMEOUT)
    if probe_code != 0:
        detail = decode_git(probe_err).strip()
        return "### {} ({}): not a git repository (git rev-parse exited {})\n{}".format(name, path, probe_code, detail)
    if decode_git(probe_out).strip() != "true":
        return "### {} ({}): not a git repository".format(name, path)
    status_code, status_out, status_err = run_git(
        git_prefix(git) + ["-C", path, "status", "--short", "--untracked-files=all"])
    diff_code, diff_out, diff_err = run_git(
        git_prefix(git) + ["-C", path, "diff", "--no-ext-diff", "--no-textconv", "HEAD"])
    lines = ["### {} ({})".format(name, path)]
    if status_code is None:
        lines.append("git status timed out after {} seconds".format(GIT_TIMEOUT))
    elif status_code != 0:
        lines.append("git status exited {}\n{}".format(status_code, decode_git(status_err).strip()))
    else:
        text = decode_git(status_out)
        lines.append("```\n{}```".format(text if text else "(clean)\n"))
    if diff_code is None:
        lines.append("git diff timed out after {} seconds".format(GIT_TIMEOUT))
    elif diff_code != 0:
        lines.append("git diff exited {}\n{}".format(diff_code, decode_git(diff_err).strip()))
    else:
        text = decode_git(diff_out)
        lines.append("```diff\n{}```".format(text if text else "(no diff)\n"))
    return "\n".join(lines)


def git_snapshot(roots):
    git = shutil.which("git")
    if not git:
        return "git is not installed; no diff attached."
    return "\n\n".join(git_section(git, "root {}".format(index + 1), path) for index, path in enumerate(roots))


def assemble_prompt(role, task, roots, contexts, include_diff):
    parts = [read_role(role).strip(), roots_note(roots), "## Task\n\n" + task.strip()]
    for path, text in contexts:
        parts.append("## Attached: {}\n\n```\n{}\n```".format(path, text))
    if include_diff:
        parts.append("## Working tree snapshot\n\n" + git_snapshot(roots))
    parts.append("Reply with your report only.")
    return "\n\n".join(parts) + "\n"


def valid_run_name(name):
    return bool(name) and name not in (".", "..") and RUN_NAME_RE.fullmatch(name) is not None


def new_run_dir(stamp, role_name, cli, base):
    """A folder named to the second. A second run in that second takes -2, -3, ..."""
    name = "{}-{}-{}".format(stamp, role_name, cli)
    for n in range(1, RUN_DIR_TRIES + 1):
        run_dir = os.path.join(base, name if n == 1 else "{}-{}".format(name, n))
        try:
            os.mkdir(run_dir)
            return run_dir
        except FileExistsError:
            continue
    fail("no free run folder for {} after {} tries. Remove an old folder or pass another --runs directory.".format(name, RUN_DIR_TRIES))


def claim_run_dir(runs, role, cli, run_name):
    if run_name is None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return new_run_dir(stamp, role, cli, runs)
    if not valid_run_name(run_name):
        fail("--run-name may contain only letters, digits, hyphens, underscores, and periods, and may not be '.' or '..'. Got {!r}.".format(run_name))
    run_dir = os.path.join(runs, run_name)
    if os.path.exists(run_dir):
        fail("--run-name already exists ({}). Pick another name, or omit --run-name.".format(run_dir))
    try:
        os.mkdir(run_dir)
    except FileExistsError:
        fail("--run-name already exists ({}). Pick another name, or omit --run-name.".format(run_dir))
    return run_dir


def apply_env(updates, base=None):
    env = dict(base if base is not None else os.environ)
    for key, value in updates.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return env


def build_command(cli, spec, boundary, prompt_path, roots, run_dir, executable):
    """argv, stdin bytes, env, cwd, and the codex last-message path for one run."""
    primary = roots[0]
    extras = roots[1:]
    effort = spec.get("effort")
    text, problem = read_utf8_file(prompt_path)
    if problem:
        fail("the prompt {} ({}). The run folder could not be used.".format(problem, prompt_path))
    env = {}
    last_message = None
    directory_flags = extra_dir_flags(cli, boundary, roots)

    if cli == "claude":
        argv = [executable, "-p", "--model", spec["model"], "--output-format", "json",
                "--no-session-persistence", "--disable-slash-commands",
                "--strict-mcp-config", "--mcp-config", CLAUDE_MCP,
                "--setting-sources", "", "--settings", CLAUDE_SETTINGS]
        if boundary.mode == "bounded":
            argv.append("--safe-mode")
        if effort:
            argv.extend(["--effort", effort])
        argv.extend(directory_flags)
        argv.extend(boundary.flags)
        stdin = text.encode("utf-8")
        env["CLAUDE_CONFIG_DIR"] = str(Path.home() / ".claude")
        env["CLAUDECODE"] = None
    elif cli == "codex":
        last_message = os.path.join(run_dir, "last-message.md")
        argv = [executable, "exec", "--model", spec["model"], "--skip-git-repo-check",
                "--cd", primary, "--output-last-message", last_message]
        if effort:
            argv.extend(["-c", 'model_reasoning_effort="{}"'.format(effort)])
        argv.extend(directory_flags)
        argv.extend(boundary.flags)
        argv.append("-")
        stdin = text.encode("utf-8")
    elif cli == "grok":
        argv = [executable, "--prompt-file", prompt_path, "--model", spec["model"],
                "--cwd", primary, "--output-format", "json", "--disallowed-tools", "Agent"]
        if effort:
            argv.extend(["--effort", effort])
        if extras:
            argv.extend(["--rules", roots_note(roots)])
        argv.extend(boundary.flags)
        stdin = None
    else:
        fail("unsupported vendor {!r}.".format(cli))
    return {"argv": argv, "stdin": stdin, "env": env, "cwd": primary, "last_message": last_message}


def parse_output(cli, raw, last_message=None, exit_code=0):
    """Return (report, state). state is completed, failed, incomplete, or invalid-output."""
    state = "completed" if exit_code == 0 else "failed"
    if cli == "codex":
        text = ""
        problem = None
        if last_message and os.path.isfile(last_message):
            text, problem = read_utf8_file(last_message)
        if problem:
            return "", ("invalid-output" if state == "completed" else state)
        text = text.strip()
        if state == "completed" and not text:
            state = "invalid-output"
        return text or raw.strip(), state
    try:
        data = json.loads(raw)
    except ValueError:
        return raw.strip(), ("invalid-output" if state == "completed" else state)
    if not isinstance(data, dict):
        return raw.strip(), ("invalid-output" if state == "completed" else state)
    report = data.get("result") or data.get("text") or data.get("response") or ""
    if data.get("is_error") or data.get("error") or str(data.get("subtype", "")).startswith("error"):
        state = "failed"
    elif state == "completed":
        stop = str(data.get("stopReason") or data.get("stop_reason") or "end_turn")
        stop = stop.lower().replace("_", "")
        if stop not in ("endturn", "stop"):
            state = "incomplete"
        elif not isinstance(report, str) or not report.strip():
            state = "invalid-output"
    return (report if isinstance(report, str) and report.strip() else raw.strip()), state


def _signal_group(pgid, sig):
    try:
        os.killpg(pgid, sig)
    except (ProcessLookupError, PermissionError, OSError):
        return


def _group_alive(pgid):
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _reap(process):
    if process is None or process.poll() is not None:
        return
    try:
        process.wait(timeout=0.1)
    except subprocess.TimeoutExpired:
        pass


def _wait_for_group(process, pgid, seconds):
    """True when no member of the group remains."""
    deadline = time.monotonic() + seconds
    while True:
        _reap(process)
        if not _group_alive(pgid):
            _reap(process)
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.1)


_termination_requested = False


def _on_catchable_termination(signum, frame):
    """SIGINT already raises KeyboardInterrupt. SIGTERM and SIGHUP join it."""
    global _termination_requested
    if _termination_requested:
        return
    _termination_requested = True
    raise KeyboardInterrupt


def install_termination_handlers():
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, _on_catchable_termination)


def stop_process(process):
    """SIGTERM the group, then SIGKILL whatever is still in it after the grace period.

    Waiting on the parent is not enough. A child that ignores SIGTERM keeps
    running after the parent has exited, and the group has to be killed then.
    start_new_session makes the vendor pid the process group id. If that
    process has already exited, the recorded pid is still the group id.
    """
    if process is None or process.pid is None:
        return
    try:
        pgid = os.getpgid(process.pid)
    except OSError:
        pgid = process.pid
    _signal_group(pgid, signal.SIGTERM)
    if _wait_for_group(process, pgid, GRACE_SECONDS):
        return
    _signal_group(pgid, signal.SIGKILL)
    _wait_for_group(process, pgid, 2)


def vendor_version(executable):
    try:
        result = subprocess.run(
            [executable, "--version"], capture_output=True, timeout=VERSION_TIMEOUT, start_new_session=True)
    except (OSError, subprocess.TimeoutExpired) as error:
        kind = "timed out" if isinstance(error, subprocess.TimeoutExpired) else error.strerror
        return None, "{} --version {}".format(os.path.basename(executable), kind)
    if result.returncode != 0:
        return None, "{} --version exited {}".format(os.path.basename(executable), result.returncode)
    raw = result.stdout or result.stderr or b""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None, "{} --version is not valid UTF-8".format(os.path.basename(executable))
    line = text.strip().splitlines()
    shown = line[0].strip() if line else ""
    if len(shown) > 300:
        shown = shown[:300]
    return shown or None, None


def survey_vendors():
    found = {}
    for cli in CLIS:
        executable = shutil.which(cli)
        if not executable:
            found[cli] = {"on_path": False, "path": None, "version": None, "version_error": None}
            continue
        version, error = vendor_version(executable)
        found[cli] = {"on_path": True, "path": executable, "version": version, "version_error": error}
    return found


def require_vendor(cli):
    executable = shutil.which(cli)
    if not executable:
        fail("'{}' is not on PATH, so this role cannot run. Presence check: {} --version.".format(cli, cli))
    return executable


def write_json(path, payload):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, indent=2) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def build_payload(ctx, state, exit_code, seconds, report):
    boundary = ctx["boundary"]
    return {
        "command": "run",
        "state": state,
        "role": ctx["role"],
        "cli": ctx["cli"],
        "model": ctx["model"],
        "effort": ctx["effort"],
        "access": ctx["access"],
        "mode": boundary.mode,
        "boundary_kind": boundary.kind,
        "stops_writes": boundary.stops_writes,
        "read_only": boundary.read_only,
        "enforcement_flags": boundary.flags,
        "limits": boundary.limits,
        "roots": ctx["roots"],
        "delegate_started": bool(ctx.get("started")),
        "pid": ctx.get("pid"),
        "pgid": ctx.get("pgid"),
        "started_at": ctx.get("started_at"),
        "exit_code": exit_code,
        "seconds": seconds,
        "run_dir": ctx.get("run_dir"),
        "prompt_path": ctx.get("prompt_path"),
        "dry_run": bool(ctx.get("dry_run")),
        "argv": ctx.get("argv"),
        "report": report,
    }


def settle(ctx, state, exit_code, seconds, report):
    """Rewrite status.json and either print the object or name the state on stderr."""
    if report is None or not str(report).strip():
        report = "No report returned. See stderr.log in the run folder."
    payload = build_payload(ctx, state, exit_code, seconds, report)
    status_path = os.path.join(ctx["run_dir"], "status.json")
    report_path = os.path.join(ctx["run_dir"], "report.md")
    try:
        write_json(status_path, payload)
        with open(report_path, "w", encoding="utf-8") as handle:
            handle.write(report + "\n")
    except OSError as error:
        sys.stderr.write("Error: delegate state {}. The run folder is {}. status.json could not be written ({}).\n".format(
            state, ctx["run_dir"], error.strerror or error))
        return 1
    if state == "completed":
        emit(payload)
        return 0
    sys.stderr.write("Error: delegate state {}. The run folder is {}. Read status.json in that folder.\n".format(
        state, ctx["run_dir"]))
    return 1


def write_started(ctx):
    payload = build_payload(ctx, "started", None, None, None)
    # A started record has no report yet. null, not the placeholder.
    payload["report"] = None
    write_json(os.path.join(ctx["run_dir"], "status.json"), payload)


def interpret(ctx, state, exit_code):
    stdout_path = os.path.join(ctx["run_dir"], "stdout.log")
    raw, problem = read_utf8_file(stdout_path)
    if state == "timeout":
        if problem:
            return "Vendor output {}.".format(problem), "timeout"
        return raw.strip(), "timeout"
    if problem:
        if state == "completed":
            return "Vendor output {}.".format(problem), "invalid-output"
        return "Vendor output {}.".format(problem), state
    report, state = parse_output(ctx["cli"], raw, ctx.get("last_message"), exit_code if exit_code is not None else 1)
    return report, state


def launch(ctx):
    stdout_path = os.path.join(ctx["run_dir"], "stdout.log")
    stderr_path = os.path.join(ctx["run_dir"], "stderr.log")
    process = None
    started_clock = None
    try:
        with open(stdout_path, "wb") as out, open(stderr_path, "wb") as err:
            try:
                process = subprocess.Popen(
                    ctx["argv"], stdin=subprocess.PIPE, stdout=out, stderr=err,
                    cwd=ctx["cwd"], env=ctx["env"], start_new_session=True)
            except OSError as error:
                shutil.rmtree(ctx["run_dir"], ignore_errors=True)
                fail("could not start '{}' ({}). Presence check: {} --version.".format(ctx["cli"], error.strerror, ctx["cli"]))
            ctx["process"] = process
            ctx["pid"] = process.pid
            try:
                ctx["pgid"] = os.getpgid(process.pid)
            except OSError:
                ctx["pgid"] = process.pid
            ctx["started_at"] = utc_now()
            ctx["started"] = True
            started_clock = time.monotonic()
            try:
                write_started(ctx)
            except OSError as error:
                stop_process(process)
                sys.stderr.write("Error: delegate state error. The run folder is {}. status.json could not be written ({}).\n".format(
                    ctx["run_dir"], error.strerror or error))
                return 1
            try:
                process.communicate(input=ctx["stdin"], timeout=ctx["timeout"])
                code = process.returncode
                state = "completed" if code == 0 else "failed"
            except subprocess.TimeoutExpired:
                stop_process(process)
                _finish_pipes(process)
                code = process.returncode
                state = "timeout"
        seconds = round(time.monotonic() - started_clock, 1)
        report, state = interpret(ctx, state, code)
        return settle(ctx, state, code, seconds, report)
    except KeyboardInterrupt:
        if ctx.get("started") and process is not None:
            stop_process(process)
            _finish_pipes(process)
            seconds = round(time.monotonic() - started_clock, 1) if started_clock is not None else None
            return settle(ctx, "interrupted", process.returncode, seconds, None)
        raise


def require_identity(args):
    role = args.get("--role")
    if role is None:
        help_hint("--role is required. Use builder, reviewer, or adversarial_reviewer")
    if role not in ROLE_NAMES:
        fail("--role must be builder, reviewer, or adversarial_reviewer; got {!r}.".format(role))
    cli = args.get("--cli")
    if cli is None:
        help_hint("--cli is required. Use claude, codex, or grok")
    if cli not in CLIS:
        fail("--cli must be claude, codex, or grok; got {!r}.".format(cli))
    model = args.get("--model")
    if not isinstance(model, str) or not model.strip():
        help_hint("--model is required and must be a non-empty string")
    effort = args.get("--effort")
    if effort is not None and effort not in EFFORTS[cli]:
        fail("--effort must be one of {} for {}; got {!r}.".format(", ".join(EFFORTS[cli]), cli, effort))
    access = args.get("--access", DEFAULT_ACCESS[role])
    if access not in ACCESS_LEVELS:
        fail("--access must be write or read-only; got {!r}.".format(access))
    if role != "builder" and access == "write":
        fail("only a builder may have access write. Pass --access read-only, or pass --role builder.")
    roots = args.get("--root")
    if not roots:
        help_hint("--root is required. Pass the absolute path of a directory. The first --root is the working directory")
    return role, cli, model.strip(), effort, access, list(roots)


def prepare_roots(screen, raw_roots, protect):
    roots = []
    seen = set()
    for raw in raw_roots:
        resolved = screen.root_dir(raw, protect)
        ident = stat_id(resolved)
        if ident in seen:
            fail("--root resolves to the same directory as another root ({}). List each root once.".format(resolved))
        seen.add(ident)
        roots.append(resolved)
    return roots


def _ascii_digits(raw):
    return bool(raw) and all("0" <= character <= "9" for character in raw)


def timeout_of(args):
    raw = args.get("--timeout")
    if raw is None:
        return DEFAULT_TIMEOUT
    if not isinstance(raw, str):
        raw = str(raw)
    fix = "Pass a whole number of seconds from 1 to {}, using the digits 0-9.".format(MAX_TIMEOUT)
    if raw == "":
        fail("--timeout is empty. {}".format(fix))
    if not _ascii_digits(raw):
        fail("--timeout must be a positive whole number written with ASCII digits 0-9; got {!r}. {}".format(raw, fix))
    try:
        value = int(raw)
    except (ValueError, OverflowError):
        fail("--timeout could not be read as a whole number; got {!r}. {}".format(raw, fix))
    if value < 1 or value > MAX_TIMEOUT:
        fail("--timeout is {} seconds, which is outside 1 to {}. {}".format(value, MAX_TIMEOUT, fix))
    return value


def task_text(args, screen):
    if ("--task" in args) == ("--task-file" in args):
        fail("provide exactly one of --task or --task-file.")
    if "--task-file" in args:
        path = screen.source_file("--task-file", args["--task-file"])
        text, problem = read_utf8_file(path)
        if problem:
            fail("--task-file {} ({}). Save the brief as UTF-8.".format(problem, path))
    else:
        text = args["--task"]
    if not str(text).strip():
        fail("the task is empty. Pass a brief in --task or --task-file.")
    return text


def remove_run_dir(ctx):
    run_dir = ctx.get("run_dir")
    if run_dir and os.path.isdir(run_dir):
        shutil.rmtree(run_dir, ignore_errors=True)


def run_command(args):
    limit = timeout_of(args)
    mode = "unrestricted" if args.get("--unrestricted") else "bounded"
    role, cli, model, effort, access, raw_roots = require_identity(args)
    if "--runs" not in args:
        fail("--runs is required. Pass the absolute path of a directory outside this tool.")
    run_name = args.get("--run-name")
    if run_name is not None and not valid_run_name(run_name):
        fail("--run-name may contain only letters, digits, hyphens, underscores, and periods, and may not be '.' or '..'. Got {!r}.".format(run_name))
    if ("--task" in args) == ("--task-file" in args):
        fail("provide exactly one of --task or --task-file.")
    screen = Screen()
    runs = screen.runs_dir(args["--runs"])
    roots = prepare_roots(screen, raw_roots, protect=(role == "builder"))
    boundary = boundary_for(cli, access, mode, role)
    if boundary.refusal:
        fail(boundary.refusal)
    # Bounded codex is stops_writes false until its listing is read. That read
    # is below, after the caller's paths, and it refuses. The generic line
    # would hide the listing's own cause.
    if access == "read-only" and not boundary.stops_writes and not (cli == "codex" and mode == "bounded"):
        fail("no boundary that stops writes is available for this read-only role. Refusing to call it read-only.")
    if args.get("--diff"):
        require_git()
    text = task_text(args, screen)
    contexts = read_contexts(screen, args.get("--context", []))
    if cli == "codex" and mode == "bounded" and not boundary.refusal:
        found = shutil.which("codex")
        if found is None:
            fail(_codex_refusal(
                "codex is not on PATH, so codex mcp list --json could not be read. Presence check: codex --version",
                role, access))
        fail(codex_bounded_refusal(found, roots, role, access))
    executable = require_vendor(cli)
    prompt = assemble_prompt(role, text, roots, contexts, bool(args.get("--diff")))
    os.umask(0o077)
    os.makedirs(runs, exist_ok=True)
    runs = screen.runs_dir(runs)
    run_dir = claim_run_dir(runs, role, cli, run_name)
    ctx = {
        "role": role,
        "cli": cli,
        "model": model,
        "effort": effort,
        "access": access,
        "boundary": boundary,
        "roots": roots,
        "run_dir": run_dir,
        "prompt_path": os.path.join(run_dir, "prompt.md"),
        "argv": None,
        "stdin": None,
        "env": None,
        "cwd": roots[0],
        "last_message": None,
        "timeout": limit,
        "dry_run": bool(args.get("--dry-run")),
        "started": False,
        "pid": None,
        "pgid": None,
        "started_at": None,
        "process": None,
    }
    try:
        with open(ctx["prompt_path"], "w", encoding="utf-8") as handle:
            handle.write(prompt)
        spec = {"cli": cli, "model": model, "effort": effort, "access": access}
        command = build_command(cli, spec, boundary, ctx["prompt_path"], roots, run_dir, executable)
        ctx["argv"] = command["argv"]
        ctx["stdin"] = command["stdin"]
        ctx["env"] = apply_env(command["env"])
        ctx["cwd"] = command["cwd"]
        ctx["last_message"] = command["last_message"]
        if ctx["dry_run"]:
            emit(build_payload(ctx, "dry-run", None, None, None))
            return 0
        return launch(ctx)
    except KeyboardInterrupt:
        if ctx.get("started"):
            stop_process(ctx.get("process"))
            _finish_pipes(ctx.get("process"))
            return settle(ctx, "interrupted", None, None, None)
        remove_run_dir(ctx)
        sys.stderr.write("Error: interrupted before the delegate started.\n")
        return 1
    except RunnerError:
        if not ctx.get("started"):
            remove_run_dir(ctx)
        raise
    except Exception as error:
        if ctx.get("started"):
            stop_process(ctx.get("process"))
            _finish_pipes(ctx.get("process"))
            return settle(ctx, "error", None, None, "The runner failed after the delegate started.")
        remove_run_dir(ctx)
        sys.stderr.write("Error: the runner failed before the delegate started ({}). No run folder was kept.\n".format(type(error).__name__))
        return 1


def survey_command(args):
    mode = "unrestricted" if args.get("--unrestricted") else "bounded"
    role, cli, model, effort, access, raw_roots = require_identity(args)
    screen = Screen()
    roots = prepare_roots(screen, raw_roots, protect=(role == "builder"))
    boundary = boundary_for(cli, access, mode, role)
    if cli == "codex" and mode == "bounded" and not boundary.refusal:
        found = shutil.which("codex")
        if found is None:
            reason = _codex_refusal(
                "codex is not on PATH, so codex mcp list --json could not be read. Presence check: codex --version",
                role, access)
        else:
            reason = codex_bounded_refusal(found, roots, role, access)
        boundary = Boundary("bounded", None, False, [], reason)
    entry = {
        "role": role,
        "cli": cli,
        "model": model,
        "effort": effort,
        "access": access,
    }
    entry.update(boundary.as_dict())
    entry["directory_flags"] = [] if boundary.refusal else extra_dir_flags(cli, boundary, roots)
    emit({
        "command": "survey",
        "mode": mode,
        "vendors": survey_vendors(),
        "role": entry,
    })
    return 0


VALUE_FLAGS = {
    "survey": ["--role", "--cli", "--model", "--effort", "--access", "--root"],
    "run": ["--role", "--cli", "--model", "--effort", "--access", "--root",
            "--runs", "--task", "--task-file", "--context", "--timeout", "--run-name"],
}
BARE_FLAGS = {
    "survey": ["--unrestricted", "--help", "-h"],
    "run": ["--diff", "--dry-run", "--unrestricted", "--help", "-h"],
}
REPEATABLE = {"--context", "--root"}


def parse_args(argv):
    if not argv:
        help_hint("no command was given")
    head = argv[0]
    if head in ("help", "--help", "-h"):
        for token in argv[1:]:
            if token in ("--help", "-h"):
                continue
            if token.startswith("-"):
                help_hint('unknown option "{}"'.format(token))
            help_hint('unexpected argument "{}"'.format(token))
        return {"help": True}
    if head not in VALUE_FLAGS:
        help_hint('unknown command "{}"'.format(head))
    value_flags = set(VALUE_FLAGS[head])
    bare_flags = set(BARE_FLAGS[head])
    if "--help" in argv[1:] or "-h" in argv[1:]:
        _consume(head, argv[1:], value_flags, bare_flags)
        return {"help": True}
    args = _consume(head, argv[1:], value_flags, bare_flags)
    args["command"] = head
    return args


def _consume(command, tokens, value_flags, bare_flags):
    args = {}
    seen = set()
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if not token.startswith("-"):
            help_hint('unexpected argument "{}". Every value belongs to an option'.format(token))
        if token not in value_flags and token not in bare_flags:
            help_hint('unknown option "{}"'.format(token))
        if token in bare_flags:
            if token in seen:
                help_hint('"{}" was given more than once. Pass it once'.format(token))
            seen.add(token)
            args[token] = True
            index += 1
            continue
        if index + 1 >= len(tokens):
            help_hint('"{}" needs a value'.format(token))
        value = tokens[index + 1]
        if value.startswith("-"):
            help_hint('"{}" needs a value; got "{}", which is an option. Pass the value after {}'.format(token, value, token))
        if token in seen and token not in REPEATABLE:
            help_hint('"{}" was given more than once. Pass it once'.format(token))
        seen.add(token)
        if token in REPEATABLE:
            args.setdefault(token, []).append(value)
        else:
            args[token] = value
        index += 2
    args["command"] = command
    return args


def main(argv):
    install_termination_handlers()
    try:
        args = parse_args(list(argv))
        if args.get("help"):
            sys.stdout.write(HELP)
            return 0
        if args["command"] == "survey":
            return survey_command(args)
        if args["command"] == "run":
            return run_command(args)
        help_hint('unknown command "{}"'.format(args["command"]))
    except RunnerError as error:
        sys.stderr.write("Error: {}\n".format(error))
        return 1
    except KeyboardInterrupt:
        sys.stderr.write("Error: interrupted before the delegate started.\n")
        return 1
    except UnicodeDecodeError:
        sys.stderr.write("Error: a file was not valid UTF-8. Save it as UTF-8.\n")
        return 1
    except OSError as error:
        sys.stderr.write("Error: could not write the run folder ({}). Pass a --runs directory this user can write.\n".format(error.strerror or error))
        return 1
    return 0
