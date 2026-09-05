#!/usr/bin/env python3
"""
knowledge-memory - curated knowledge graph over an embedded Cognee store.

Usage:
  python3.11 scripts/knowledge_memory.py help
  python3.11 scripts/knowledge_memory.py check
  python3.11 scripts/knowledge_memory.py bootstrap --store [dir] --env [file] [--install]
  python3.11 scripts/knowledge_memory.py ingest --set [dir] --store [dir] --env [file]
      [--report [dir]] [--proceed] [--install]
  python3.11 scripts/knowledge_memory.py recall --set [dir] --store [dir] --env [file]
      --query [text] [--as-of YYYY-MM-DD] [--top-k N] [--mode context|answer]
  python3.11 scripts/knowledge_memory.py review-pass --set [dir] --store [dir] --env [file]
  python3.11 scripts/knowledge_memory.py promote --set [dir] --store [dir] --env [file]
      --decided [file]
  python3.11 scripts/knowledge_memory.py mark-stale --set [dir] --store [dir] --env [file]
      --id [node-id] [--valid-to YYYY-MM-DD]
  python3.11 scripts/knowledge_memory.py healthcheck --set [dir] --store [dir] --env [file]
      [--eval]
  python3.11 scripts/knowledge_memory.py forget --set [dir] --store [dir] --env [file]
      (--memory-only | --data-id [id] | --dataset) --confirm

The rules this file follows are stated once, in
system/templates/Script Contract.md. This script runs under Python rather than
Node, which that contract's Runtimes clause allows because TOOL.md declares the
interpreter under Dependencies. Python 3.11 or newer is required for every
command except help and check.
"""

from __future__ import annotations

# Standard library only above the package cache check below. Nothing here
# imports from outside this tool directory.
import asyncio
import hashlib
import importlib.metadata
import importlib.util
import inspect
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, date
from pathlib import Path
from typing import Any
from uuid import UUID

SCRIPT_DIR = Path(__file__).resolve().parent
TOOL_DIR = SCRIPT_DIR.parent

# The first-run package cache: a virtual environment beside the scripts, which
# is the one thing this script writes inside its own directory.
CACHE_DIR = TOOL_DIR / ".venv"

CORE_REQUIREMENTS = TOOL_DIR / "requirements.txt"
GENERAL_PACK = TOOL_DIR / "packs" / "general"
REVIEW_ITEM_TEMPLATE = TOOL_DIR / "templates" / "review_item.md"

# One installed package's own metadata directory, not the cache directory
# itself: an install that dies partway leaves the cache in place and the
# packages absent.
CORE_MARKER = "cognee"

MIN_PYTHON = (3, 11)
INTERPRETER_CANDIDATES = ("python3.11", "python3.12", "python3.13", "python3.14")

GRAPH_PROVIDER = "ladybug"
VECTOR_PROVIDER = "lancedb"
DB_PROVIDER = "sqlite"

DATASET_RE = re.compile(r"^[a-z0-9_]+$")
SET_SLUG_RE = re.compile(r"^[a-z0-9-]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

KNOWN_KINDS = ("book", "blog", "website", "domain", "mixed")
KNOWN_SENSITIVITY = ("public", "internal", "confidential")
KNOWN_CHUNKING = ("heading-aware", "paragraph")
KNOWN_MODES = ("context", "answer")

REQUIRED_RECIPE_KEYS = (
    "set",
    "dataset",
    "kind",
    "owner",
    "sensitivity",
    "provider_consent",
    "pack",
    "node_sets",
    "eval",
)
KNOWN_RECIPE_KEYS = {
    "set",
    "dataset",
    "kind",
    "owner",
    "sensitivity",
    "provider_consent",
    "canon_confirmed",
    "sources",
    "pack",
    "node_sets",
    "chunking",
    "llm",
    "review_cadence_days",
    "stale_after_days",
    "write_policy",
    "promotion_policy",
    "eval",
}
KNOWN_SOURCES_KEYS = {"include", "exclude"}
KNOWN_LLM_KEYS = {"provider", "model", "embedding_model"}
KNOWN_WRITE_POLICY_KEYS = {"agents_may_remember_episodes"}
KNOWN_PROMOTION_POLICY_KEYS = {"auto_accept"}

LEGAL_SUFFIXES = frozenset(
    ("inc", "corp", "corporation", "llc", "ltd", "gmbh", "co")
)

REVIEW_TYPE_DIRS = {
    "new_finding": "new_findings",
    "stale": "stale",
    "merge_proposal": "merge_proposals",
    "conflict": "conflicts",
}

COMMANDS = (
    "check",
    "bootstrap",
    "ingest",
    "recall",
    "review-pass",
    "promote",
    "mark-stale",
    "healthcheck",
    "forget",
)

VALUE_OPTIONS = (
    "--store",
    "--env",
    "--set",
    "--report",
    "--query",
    "--as-of",
    "--top-k",
    "--mode",
    "--decided",
    "--id",
    "--valid-to",
    "--data-id",
)
FLAG_OPTIONS = (
    "--install",
    "--proceed",
    "--eval",
    "--memory-only",
    "--dataset",
    "--confirm",
)

ALLOWED_OPTIONS = {
    "check": frozenset(("--store", "--install")),
    "bootstrap": frozenset(("--store", "--env", "--install")),
    "ingest": frozenset(
        ("--set", "--store", "--env", "--report", "--proceed", "--install")
    ),
    "recall": frozenset(
        (
            "--set",
            "--store",
            "--env",
            "--query",
            "--as-of",
            "--top-k",
            "--mode",
            "--install",
        )
    ),
    "review-pass": frozenset(("--set", "--store", "--env", "--install")),
    "promote": frozenset(("--set", "--store", "--env", "--decided", "--install")),
    "mark-stale": frozenset(
        ("--set", "--store", "--env", "--id", "--valid-to", "--install")
    ),
    "healthcheck": frozenset(("--set", "--store", "--env", "--eval", "--install")),
    "forget": frozenset(
        (
            "--set",
            "--store",
            "--env",
            "--memory-only",
            "--data-id",
            "--dataset",
            "--confirm",
            "--install",
        )
    ),
    "selftest": frozenset(("--install",)),
}

USAGE = """knowledge-memory - curated knowledge graph over an embedded Cognee store.

Usage:
  python3.11 scripts/knowledge_memory.py help
  python3.11 scripts/knowledge_memory.py check
  python3.11 scripts/knowledge_memory.py bootstrap --store [dir] --env [file] [--install]
  python3.11 scripts/knowledge_memory.py ingest --set [dir] --store [dir] --env [file]
      [--report [dir]] [--proceed] [--install]
  python3.11 scripts/knowledge_memory.py recall --set [dir] --store [dir] --env [file]
      --query [text] [--as-of YYYY-MM-DD] [--top-k N] [--mode context|answer]
  python3.11 scripts/knowledge_memory.py review-pass --set [dir] --store [dir] --env [file]
  python3.11 scripts/knowledge_memory.py promote --set [dir] --store [dir] --env [file]
      --decided [file]
  python3.11 scripts/knowledge_memory.py mark-stale --set [dir] --store [dir] --env [file]
      --id [node-id] [--valid-to YYYY-MM-DD]
  python3.11 scripts/knowledge_memory.py healthcheck --set [dir] --store [dir] --env [file]
      [--eval]
  python3.11 scripts/knowledge_memory.py forget --set [dir] --store [dir] --env [file]
      (--memory-only | --data-id [id] | --dataset) --confirm

Commands:
  check            Report the interpreter, venv, and whether cognee is installed
  bootstrap        Create the store directories and configure Cognee against them
  ingest           Hash sources, estimate or remember new files, then improve once
  recall           Query one dataset and print answer, context, and references
  review-pass      Write review items for candidates, merges, stale nodes, conflicts
  promote          Apply one decided review item
  mark-stale       Set status Stale and valid_to on one node; never deletes
  healthcheck      Counts, backlogs, last ingest; optionally run eval questions
  forget           Remove memory, one data_id, or a dataset; requires --confirm
  help             Print this message

Options:
  --store [dir]         Owning-root store directory, absolute, outside this tool
  --set [dir]           Knowledge set directory holding set.yaml, absolute
  --env [file]          Bound credential file, absolute. Values never enter the
                        process environment, a log, or the output
  --report [dir]        Directory ingest writes its JSON report into, absolute.
                        Default: <set>/reports/
  --query [text]        Recall query text
  --as-of YYYY-MM-DD    Appended to the query as "(as of YYYY-MM-DD)"; recorded
                        in the output. This API does not filter by date
  --top-k N             Recall neighbour cap. Default 15
  --mode [name]         context (only_context) or answer (default, with references)
  --proceed             Actually ingest; without it ingest dry-runs and stops
  --decided [file]      A review item under <set>/review/decided/
  --id [node-id]        Graph node id for mark-stale
  --valid-to YYYY-MM-DD valid_to to set; default today
  --data-id [id]        UUID of one ingested file to forget
  --memory-only         Forget derived memory and keep source hashes
  --dataset             Forget the whole dataset named in the recipe
  --eval                Run the recipe's eval questions during healthcheck
  --confirm             Required for forget; without it the script says what it
                        would forget and stops
  --install             Authorise the first-run install. Without it a tool that
                        is not installed yet reports what it would fetch, and
                        from where, and stops. WISER_ALLOW_INSTALL=1 does the
                        same for an unattended run.
  --help                Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.
Progress lines go to stderr prefixed knowledge-memory:."""


def stop(message: str) -> None:
    """Stop the run: stderr only, stdout empty, exit 1."""
    sys.stderr.write(message + "\n")
    sys.exit(1)


def fail(message: str) -> None:
    """A failure, which is every stop but the first-run install's re-run notice."""
    stop("Error: " + message)


def note(message: str) -> None:
    """Progress: stderr, so stdout carries only the final JSON object."""
    sys.stderr.write("knowledge-memory: " + message + "\n")


def emit(result: Any) -> None:
    """One JSON object on stdout, and nothing else ever reaches stdout."""
    sys.stdout.write(json.dumps(json_ready(result), separators=(",", ":")) + "\n")


def usage_hint() -> str:
    return 'Run "python3.11 scripts/knowledge_memory.py help" for usage.'


def parse(args: list[str], allowed: frozenset[str]) -> tuple[dict[str, str], set[str]]:
    """Every word is claimed by name or refused by name; nothing is ignored."""
    values: dict[str, str] = {}
    flags: set[str] = set()
    index = 0
    while index < len(args):
        word = args[index]
        if word in VALUE_OPTIONS:
            value = args[index + 1] if index + 1 < len(args) else None
            if value is None or value.startswith("-"):
                fail("%s needs a value. %s" % (word, usage_hint()))
            if word in values:
                fail(
                    "%s was given more than once and takes one value. %s"
                    % (word, usage_hint())
                )
            if word not in allowed:
                fail('unknown option "%s". %s' % (word, usage_hint()))
            values[word] = value
            index += 2
            continue
        if word in FLAG_OPTIONS:
            if word in flags:
                fail(
                    "%s was given more than once and takes no value. %s"
                    % (word, usage_hint())
                )
            if word not in allowed:
                fail('unknown option "%s". %s' % (word, usage_hint()))
            flags.add(word)
            index += 1
            continue
        if word.startswith("-"):
            fail('unknown option "%s". %s' % (word, usage_hint()))
        fail('unexpected argument "%s". %s' % (word, usage_hint()))
    return values, flags


def python_version_string() -> str:
    return "%d.%d.%d" % sys.version_info[:3]


def python_is_ok() -> bool:
    return sys.version_info[:2] >= MIN_PYTHON


def interpreters_found() -> list[str]:
    found = []
    for name in INTERPRETER_CANDIDATES:
        if shutil.which(name):
            found.append(name)
    return found


def require_python() -> None:
    if python_is_ok():
        return
    fail(
        "this script needs Python 3.11 or newer; this interpreter is %s. "
        "Run it with python3.11 (or python3.12, python3.13, python3.14) instead of python3."
        % python_version_string()
    )


def cache_python() -> Path:
    if os.name == "nt":
        return CACHE_DIR / "Scripts" / "python.exe"
    return CACHE_DIR / "bin" / "python3"


def cognee_marker_present() -> bool:
    """True when cognee's own dist-info directory is inside the venv.

    The marker is the installed package's metadata, never the .venv directory
    itself: an install that dies partway leaves that directory in place.
    """
    roots = list(CACHE_DIR.glob("lib/python*/site-packages"))
    roots.append(CACHE_DIR / "Lib" / "site-packages")
    for root in roots:
        if list(root.glob("cognee-*.dist-info")):
            return True
    return False


def requirement_names() -> list[str]:
    names = []
    if not CORE_REQUIREMENTS.is_file():
        return names
    for raw in CORE_REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        name = re.split(r"[<>=!~\[]", line, 1)[0].strip()
        if name:
            names.append(name)
    return names


def same_file(left: Path, right: Path) -> bool:
    """True when two paths name one file, however each of them is spelled.

    Device and inode are the file's own identity, which is the thing a
    comparison of resolved strings cannot see. Path.resolve preserves the case
    it was handed, so on a case insensitive filesystem, which is where this root
    ships, two spellings of one file canonicalize to two different strings and a
    string comparison misses. A hard link is not a link to a path either: it is a
    second name for one inode and it canonicalizes to itself, so resolving both
    sides is not enough on its own. A path that does not exist has no identity to
    compare, so this answers False there and the caller compares the deepest
    ancestor that does exist instead.
    """
    try:
        here = os.stat(left)
        there = os.stat(right)
    except OSError:
        return False
    return (here.st_dev, here.st_ino) == (there.st_dev, there.st_ino)


def unresolvable(option: str, where: Path | str) -> str:
    return (
        "%s could not be resolved to a real path at %s. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself."
        % (option, where)
    )


def canonical(option: str, candidate: Path) -> Path:
    """The path with every component that exists resolved through symbolic links.

    Path.resolve follows links on the components present on disk and appends the
    rest, so a link standing in for the file itself, or for any ancestor of it,
    collapses onto the one real path that a lexical comparison would spell
    differently and let through. Resolving a path opens nothing, so this runs
    before any file is read or written.

    Absence is the only reason resolution may keep going. Any other refusal from
    the filesystem, an unreadable ancestor or a loop of symbolic links, means the
    real path cannot be known, and a screen that cannot know which file it is
    looking at refuses by name rather than letting the interpreter report a
    traceback carrying host paths.
    """
    try:
        return Path(candidate).resolve()
    except (OSError, RuntimeError):
        fail(unresolvable(option, candidate))
        raise


def deepest_existing(option: str, path: Path) -> Path:
    """The deepest component of a path that exists on disk.

    A directory named for the first time does not exist yet, and a path that does
    not exist has no inode to compare, so the screen compares the identity of the
    deepest ancestor that does exist: that is the directory the write would land
    in. Absence is the only reason to keep climbing; any other refusal means the
    real path cannot be known, and the run refuses.
    """
    probe = path
    while True:
        try:
            os.stat(probe)
            return probe
        except (FileNotFoundError, NotADirectoryError):
            pass
        except OSError:
            fail(unresolvable(option, probe))
        parent = probe.parent
        if parent == probe:
            return probe
        probe = parent


def inside_dir(existing: Path, root: Path) -> bool:
    """True when an existing path is root or sits beneath it, by identity."""
    probe = existing
    while True:
        if same_file(probe, root):
            return True
        parent = probe.parent
        if parent == probe:
            return False
        probe = parent


def inside_tool_dir(existing: Path) -> bool:
    return inside_dir(existing, TOOL_DIR)


def require_absolute(option: str, value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        fail(
            '%s must be absolute; got "%s". Pass the full path, not one relative to the current directory.'
            % (option, value)
        )
    return path


def screen_path(
    option: str,
    value: str,
    *,
    destination: bool,
    env_file: Path | None = None,
    must_exist: bool = False,
    as_file: bool = False,
    as_dir: bool = False,
) -> Path:
    """Canonicalize a caller path and refuse the credential file, its directory, and this tool."""
    given = require_absolute(option, value)
    resolved = canonical(option, given)
    existing = deepest_existing(option, resolved)
    if destination or as_dir:
        if inside_tool_dir(existing):
            fail(
                "%s resolves inside this tool directory (%s). Scripts write only to a work directory in the owning root; pass that path instead."
                % (option, TOOL_DIR)
            )
    else:
        if inside_tool_dir(existing):
            fail(
                "%s resolves inside this tool directory (%s). Pass a path in the owning root."
                % (option, TOOL_DIR)
            )
    if env_file is not None:
        try:
            env_dir = env_file.parent
            if same_file(existing, env_file) or inside_dir(existing, env_dir):
                fail(
                    "%s resolves to the --env file or inside the directory that holds it. Pass a work path, not the credential file."
                    % option
                )
        except OSError:
            pass
    if must_exist and not resolved.exists():
        fail("no path at %s. Check %s." % (resolved, option))
    if as_file and resolved.exists() and not resolved.is_file():
        fail("%s is not a file at %s." % (option, resolved))
    if as_file and must_exist and not resolved.is_file():
        fail("no file at %s. Check %s." % (resolved, option))
    if as_dir and resolved.exists() and not resolved.is_dir():
        fail("%s is not a directory at %s." % (option, resolved))
    return resolved


def env_missing_message(option_present: bool, named: str | None) -> str:
    if not option_present:
        return (
            "--env is required. Ask the agent to resolve the workspace Provides binding "
            "and pass that absolute path; this script does not search for a credential file. "
            + usage_hint()
        )
    return (
        "--env names a file that does not exist at %s. Ask the agent to resolve the binding "
        "instead of guessing a path."
        % named
    )


def load_env_path(value: str | None) -> Path:
    if not value:
        fail(env_missing_message(False, None))
    given = require_absolute("--env", value)
    if not given.exists():
        fail(env_missing_message(True, value))
    resolved = canonical("--env", given)
    if not resolved.is_file():
        fail("--env is not a file at %s. Ask the agent to resolve the binding." % resolved)
    if not os.access(resolved, os.R_OK):
        fail("--env is not readable at the path the agent passed. Resolve the binding again.")
    return resolved


def parse_env_text(text: str) -> dict[str, str]:
    """Parse KEY=value lines. Blank lines and full-line # comments are ignored.

    Optional surrounding double quotes on the value are stripped. The values are
    returned to the caller and must never be logged or printed.
    """
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail(
                "the --env file has a line that is not KEY=value. Fix the file; this script does not print the line."
            )
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1]
        if not key:
            fail(
                "the --env file has a line with an empty key. Fix the file; this script does not print the line."
            )
        values[key] = value
    return values


def parse_env_file(path: Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        fail("--env could not be read. Ask the agent to resolve the binding.")
        raise
    return parse_env_text(text)


def openai_key(env_values: dict[str, str]) -> str:
    key = env_values.get("OPENAI_API_KEY")
    if not key:
        fail(
            "OPENAI_API_KEY is missing from the --env file. "
            "Ask the agent to resolve the secrets:openai binding and pass that file as --env."
        )
    return key


def refuse_store_env(store_dir: Path) -> None:
    env_path = store_dir / ".env"
    if env_path.exists():
        fail(
            "the store contains a file named .env at %s. Remove that file before running this tool; "
            "Cognee loads .env from the working directory at import and would put those values into the process environment."
            % env_path
        )


def store_is_writable(store_dir: Path) -> bool:
    probe = store_dir if store_dir.exists() else store_dir.parent
    while True:
        try:
            return os.access(probe, os.W_OK)
        except OSError:
            parent = probe.parent
            if parent == probe:
                return False
            probe = parent


def install_authorised() -> bool:
    return "--install" in sys.argv or os.environ.get("WISER_ALLOW_INSTALL") == "1"


def consent_message() -> str:
    packages = requirement_names() or [CORE_MARKER, "pyyaml"]
    named = ", ".join(packages)
    return (
        "this tool is not installed yet and this run did not authorise an install. "
        "Installing creates a virtual environment at %s (the .venv/ directory inside this tool) "
        "and fetches %s from pypi.org and files.pythonhosted.org into it. "
        "The resolved tree is on the order of one hundred packages and several hundred megabytes "
        "(an estimate). pip's own download cache is switched off, and PIP_CACHE_DIR and "
        "XDG_CACHE_HOME in the install child point at a temporary directory that is removed "
        "afterwards, so the installer's cache does not land outside this tool. "
        "tools/AGENTS.md lists every write an install makes. "
        "Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 "
        "for an unattended run. Nothing is read from stdin, so this is the only way to answer."
        % (CACHE_DIR, named)
    )


def require_install_consent() -> None:
    """Consent before an install, matching the Node tools' Dependencies clause.

    This script does not read stdin, so it cannot ask. It reports what would be
    fetched and stops; whoever is driving it asks the person and re-runs with
    --install, which authorises the install AND completes the run.
    """
    if install_authorised():
        return
    fail(consent_message())


def install() -> None:
    require_install_consent()
    if not CORE_REQUIREMENTS.is_file():
        fail("requirements.txt is missing from %s." % TOOL_DIR)
    if not CACHE_DIR.exists():
        note("First run: creating the package cache in %s" % CACHE_DIR)
        try:
            subprocess.run(
                [sys.executable, "-m", "venv", str(CACHE_DIR)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            fail(
                "could not create the package cache at %s. Confirm python3.11 -m venv works and that this tool directory is writable."
                % CACHE_DIR
            )
    interpreter = cache_python()
    if not interpreter.exists():
        fail(
            "the package cache at %s holds no interpreter. Delete that directory and run the command again."
            % CACHE_DIR
        )
    note(
        "Installing packages into %s. The resolved tree is on the order of one hundred packages and several hundred megabytes (an estimate)."
        % CACHE_DIR
    )
    cache_tmp = tempfile.mkdtemp(prefix="knowledge-memory-pip-")
    try:
        env = dict(os.environ)
        env["PIP_NO_CACHE_DIR"] = "1"
        env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
        env["PIP_CACHE_DIR"] = cache_tmp
        env["XDG_CACHE_HOME"] = cache_tmp
        subprocess.run(
            [
                str(interpreter),
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--disable-pip-version-check",
                "-r",
                str(CORE_REQUIREMENTS),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            env=env,
        )
    except Exception:
        fail(
            "installing packages failed (%s). Delete %s, confirm python3.11 --version is 3.11 or newer, then run the command again with --install."
            % ("CalledProcessError", CACHE_DIR)
        )
    finally:
        shutil.rmtree(cache_tmp, ignore_errors=True)
    if not cognee_marker_present():
        fail(
            "the install finished but cognee is still missing from %s. Check that %s lists every package this script imports."
            % (CACHE_DIR, CORE_REQUIREMENTS.name)
        )
    note("Packages installed.")


def in_venv() -> bool:
    try:
        return same_file(Path(sys.prefix), CACHE_DIR)
    except OSError:
        return Path(sys.prefix).resolve() == CACHE_DIR.resolve()


def ensure_packages() -> None:
    if not cognee_marker_present():
        install()
    if in_venv():
        return
    interpreter = cache_python()
    if not interpreter.exists():
        fail(
            "the package cache at %s holds no interpreter. Delete that directory and run the command again."
            % CACHE_DIR
        )
    if os.environ.get("KNOWLEDGE_MEMORY_CACHE_RUN") == "1":
        fail(
            "the package cache at %s did not take over the run. Delete that directory and run the command again."
            % CACHE_DIR
        )
    os.environ["KNOWLEDGE_MEMORY_CACHE_RUN"] = "1"
    target = str(interpreter)
    os.execv(target, [target, str(Path(__file__).resolve())] + sys.argv[1:])


def json_ready(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_ready(item) for item in value]
    dump = getattr(value, "model_dump", None) or getattr(value, "dict", None)
    if callable(dump):
        try:
            return json_ready(dump())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        try:
            return json_ready(
                {
                    key: item
                    for key, item in vars(value).items()
                    if not key.startswith("_")
                }
            )
        except Exception:
            pass
    return str(value)


def parse_date_flag(option: str, value: str) -> str:
    if not DATE_RE.match(value):
        fail('%s must be YYYY-MM-DD; got "%s".' % (option, value))
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        fail('%s must be YYYY-MM-DD; got "%s".' % (option, value))
    return value


def today_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def now_stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d-%H%M%S")


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def unknown_keys(mapping: dict[str, Any], known: set[str], prefix: str) -> list[str]:
    problems = []
    for key in mapping:
        if key not in known:
            labelled = "%s.%s" % (prefix, key) if prefix else str(key)
            problems.append(
                'unknown key "%s" in set.yaml. This script reads only the keys in tools/knowledge-memory/templates/set.yaml.'
                % labelled
            )
    return problems


def recipe_problems(data: Any) -> list[str]:
    """Validate recipe shape against templates/set.yaml. Stdlib only; no YAML."""
    problems: list[str] = []
    if not isinstance(data, dict):
        return ["set.yaml must be a mapping of keys to values."]
    problems.extend(unknown_keys(data, KNOWN_RECIPE_KEYS, ""))
    for key in REQUIRED_RECIPE_KEYS:
        if key not in data:
            problems.append('set.yaml is missing required key "%s".' % key)
    sources = data.get("sources")
    if "sources" not in data:
        problems.append('set.yaml is missing required key "sources.include".')
    elif not isinstance(sources, dict):
        problems.append('set.yaml key "sources" must be a mapping with include and optional exclude.')
    else:
        problems.extend(unknown_keys(sources, KNOWN_SOURCES_KEYS, "sources"))
        if "include" not in sources:
            problems.append('set.yaml is missing required key "sources.include".')
        elif not isinstance(sources.get("include"), list) or not sources.get("include"):
            problems.append('set.yaml key "sources.include" must be a non-empty list of globs.')
        if "exclude" in sources and sources.get("exclude") is not None and not isinstance(
            sources.get("exclude"), list
        ):
            problems.append('set.yaml key "sources.exclude" must be a list of globs.')
    dataset = data.get("dataset")
    if isinstance(dataset, str) and dataset and not DATASET_RE.match(dataset):
        problems.append(
            'dataset "%s" is not allowed. Use only lowercase letters, digits, and underscores ([a-z0-9_]+).'
            % dataset
        )
    slug = data.get("set")
    if isinstance(slug, str) and slug and not SET_SLUG_RE.match(slug):
        problems.append(
            'set "%s" is not allowed. Use only lowercase letters, digits, and hyphens.'
            % slug
        )
    kind = data.get("kind")
    if isinstance(kind, str) and kind and kind not in KNOWN_KINDS:
        problems.append(
            'kind "%s" is not allowed. One of: %s.' % (kind, ", ".join(KNOWN_KINDS))
        )
    sensitivity = data.get("sensitivity")
    if isinstance(sensitivity, str) and sensitivity and sensitivity not in KNOWN_SENSITIVITY:
        problems.append(
            'sensitivity "%s" is not allowed. One of: %s.'
            % (sensitivity, ", ".join(KNOWN_SENSITIVITY))
        )
    owner = data.get("owner")
    if "owner" in data and not str(owner or "").strip():
        problems.append('set.yaml key "owner" is blank. Name a person or role.')
    consent = data.get("provider_consent")
    if "provider_consent" in data and not str(consent or "").strip():
        who = str(owner).strip() if owner else "the set owner"
        problems.append(
            "provider_consent is blank. %s has to give it (name and date) before this set can be ingested, because the corpus is sent to the model provider."
            % who
        )
    node_sets = data.get("node_sets")
    if "node_sets" in data and (not isinstance(node_sets, list) or not node_sets):
        problems.append('set.yaml key "node_sets" must be a non-empty list.')
    eval_path = data.get("eval")
    if "eval" in data and not str(eval_path or "").strip():
        problems.append('set.yaml key "eval" is blank. Point it at the eval questions file.')
    pack = data.get("pack")
    if "pack" in data and not str(pack or "").strip():
        problems.append('set.yaml key "pack" is blank. Use "general" or a path relative to the set.')
    llm = data.get("llm")
    if llm is None:
        pass
    elif not isinstance(llm, dict):
        problems.append('set.yaml key "llm" must be a mapping.')
    else:
        problems.extend(unknown_keys(llm, KNOWN_LLM_KEYS, "llm"))
        provider = llm.get("provider")
        if provider is not None and provider != "openai":
            problems.append(
                'llm.provider "%s" is not supported in v1. Use openai.' % provider
            )
    chunking = data.get("chunking")
    if chunking is not None and chunking not in KNOWN_CHUNKING:
        problems.append(
            'chunking "%s" is not allowed. One of: %s.'
            % (chunking, ", ".join(KNOWN_CHUNKING))
        )
    write_policy = data.get("write_policy")
    if write_policy is None:
        pass
    elif not isinstance(write_policy, dict):
        problems.append('set.yaml key "write_policy" must be a mapping.')
    else:
        problems.extend(unknown_keys(write_policy, KNOWN_WRITE_POLICY_KEYS, "write_policy"))
    promotion = data.get("promotion_policy")
    if promotion is None:
        pass
    elif not isinstance(promotion, dict):
        problems.append('set.yaml key "promotion_policy" must be a mapping.')
    else:
        problems.extend(
            unknown_keys(promotion, KNOWN_PROMOTION_POLICY_KEYS, "promotion_policy")
        )
    return problems


def validate_recipe(data: Any) -> dict[str, Any]:
    problems = recipe_problems(data)
    if problems:
        fail(problems[0])
    assert isinstance(data, dict)
    return data


def recipe_provider(recipe: dict[str, Any]) -> str:
    llm = recipe.get("llm") or {}
    if isinstance(llm, dict):
        provider = llm.get("provider") or "openai"
    else:
        provider = "openai"
    if provider != "openai":
        fail('llm.provider "%s" is not supported in v1. Use openai.' % provider)
    return provider


def load_yaml(path: Path, label: str) -> Any:
    try:
        import yaml  # noqa: WPS433 - imported only after the venv check
    except Exception:
        fail("PyYAML is missing from the package cache at %s after install." % CACHE_DIR)
        raise
    try:
        with open(path, encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle)
    except Exception as error:
        fail("could not parse %s as YAML (%s)." % (label, type(error).__name__))
        raise
    return loaded


def load_recipe(set_dir: Path) -> dict[str, Any]:
    path = set_dir / "set.yaml"
    loaded = load_yaml(path, "set.yaml")
    if loaded is None:
        fail("set.yaml at %s is empty." % path)
    return validate_recipe(loaded)


def require_set_yaml(set_dir: Path) -> Path:
    path = set_dir / "set.yaml"
    if not path.is_file():
        fail(
            "no set.yaml in %s. Pass the knowledge set directory that holds set.yaml."
            % set_dir
        )
    if not os.access(path, os.R_OK):
        fail("set.yaml at %s is not readable." % path)
    return path


def resolve_pack(set_dir: Path, pack: str) -> Path:
    if pack == "general":
        return GENERAL_PACK
    return canonical("--pack", set_dir / pack)


def load_pack(pack_dir: Path) -> tuple[Any, tuple[str, ...], Path, str]:
    graph_path = pack_dir / "graph_model.py"
    ontology_path = pack_dir / "ontology.ttl"
    prompt_path = pack_dir / "extraction_prompt.md"
    if not graph_path.is_file():
        fail("the pack at %s has no graph_model.py." % pack_dir)
    if not prompt_path.is_file():
        fail("the pack at %s has no extraction_prompt.md." % pack_dir)
    spec = importlib.util.spec_from_file_location(
        "knowledge_memory_pack_graph_model", graph_path
    )
    if spec is None or spec.loader is None:
        fail("could not load graph_model.py from %s." % pack_dir)
        raise RuntimeError
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        fail("loading graph_model.py failed (%s)." % type(error).__name__)
        raise
    graph_model = getattr(module, "GRAPH_MODEL", None)
    if graph_model is None:
        fail("graph_model.py at %s does not export GRAPH_MODEL." % graph_path)
    protected = getattr(module, "PROTECTED_TYPES", ())
    if not isinstance(protected, (list, tuple)):
        protected = ()
    prompt = prompt_path.read_text(encoding="utf-8")
    return graph_model, tuple(protected), ontology_path, prompt


def canonical_names_from_canon(path: Path) -> list[str]:
    if not path.is_file():
        return []
    names: list[str] = []
    in_canonical = False
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#"):
            in_canonical = "canonical" in stripped.lower()
            continue
        if in_canonical and stripped.startswith("- "):
            names.append(stripped[2:].strip())
    return names


def build_custom_prompt(extraction_prompt: str, set_dir: Path, set_name: str) -> str:
    names = canonical_names_from_canon(set_dir / "canon.md")
    names_block = "<canonical_names>\n" + "\n".join(names) + "\n</canonical_names>"
    source_block = "<source>\nset: %s\n</source>" % set_name
    return extraction_prompt.rstrip() + "\n\n" + names_block + "\n\n" + source_block + "\n"


def expand_sources(set_dir: Path, include: list[Any], exclude: list[Any] | None) -> list[Path]:
    found: list[Path] = []
    for pattern in include:
        text = str(pattern)
        for match in set_dir.glob(text):
            if match.is_file():
                found.append(canonical("sources.include", match))
    excluded: set[tuple[int, int]] = set()
    for pattern in exclude or []:
        for match in set_dir.glob(str(pattern)):
            if match.is_file():
                resolved = canonical("sources.exclude", match)
                try:
                    stat = os.stat(resolved)
                    excluded.add((stat.st_dev, stat.st_ino))
                except OSError:
                    continue
    unique: list[Path] = []
    seen: set[tuple[int, int]] = set()
    for path in found:
        try:
            stat = os.stat(path)
            identity = (stat.st_dev, stat.st_ino)
        except OSError:
            continue
        if identity in seen or identity in excluded:
            continue
        seen.add(identity)
        unique.append(path)
    unique.sort(key=lambda item: str(item))
    return unique


def ledger_path(set_dir: Path) -> Path:
    return set_dir / "reports" / "ledger.json"


def load_ledger(set_dir: Path) -> dict[str, Any]:
    path = ledger_path(set_dir)
    if not path.is_file():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        fail("could not read the ledger at %s (%s)." % (path, type(error).__name__))
        raise
    if not isinstance(loaded, dict):
        fail("the ledger at %s is not a JSON object." % path)
    return loaded


def save_ledger(set_dir: Path, ledger: dict[str, Any]) -> None:
    path = ledger_path(set_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation and legal suffixes, collapse whitespace."""
    text = name.lower()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    tokens = [token for token in text.split() if token not in LEGAL_SUFFIXES]
    return " ".join(tokens)


def operation_failed(operation: str, error: BaseException) -> None:
    fail(
        "%s failed (%s). The provider message is omitted because it can carry a credential."
        % (operation, type(error).__name__)
    )


async def maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def drop_shell_api_key() -> None:
    os.environ.pop("OPENAI_API_KEY", None)


def scrub_key_from_environ(key: str) -> bool:
    """Remove the key's value from os.environ if present. Never log the value.

    Exact-value matches are always removed. Substring matches are removed only
    on credential-shaped variable names, so a short test value cannot rewrite
    PATH.
    """
    if not key:
        return False
    leaked = False
    credential_name = re.compile(r"(API_KEY|SECRET|TOKEN|PASSWORD|PASSWD)", re.I)
    to_delete: list[str] = []
    for name, value in list(os.environ.items()):
        if value is None:
            continue
        if value == key:
            leaked = True
            to_delete.append(name)
            continue
        if key in value and credential_name.search(name):
            leaked = True
            to_delete.append(name)
    for name in to_delete:
        os.environ.pop(name, None)
    return leaked


def key_in_environ(key: str) -> bool:
    if not key:
        return False
    for value in os.environ.values():
        if value == key:
            return True
    return False


def apply_storage_env(store_dir: Path) -> None:
    system_root = store_dir / "system"
    data_root = store_dir / "data"
    system_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)
    os.environ["SYSTEM_ROOT_DIRECTORY"] = str(system_root)
    os.environ["DATA_ROOT_DIRECTORY"] = str(data_root)
    os.environ["GRAPH_DATABASE_PROVIDER"] = GRAPH_PROVIDER
    os.environ["VECTOR_DB_PROVIDER"] = VECTOR_PROVIDER
    os.environ["DB_PROVIDER"] = DB_PROVIDER
    os.environ["ENABLE_BACKEND_ACCESS_CONTROL"] = "true"


def find_ontology_setter(config: Any) -> Any | None:
    """Return a config setter whose name contains 'ontology', or None.

    Do not guess a setter name and call it blind. Introspect dir(config).
    """
    # TODO(Solve): confirm which cognee.config attribute, if any, sets the
    # ontology file path in 1.5.4, and whether it is a setter or a field.
    for name in dir(config):
        if "ontology" not in name.lower():
            continue
        attr = getattr(config, name, None)
        if callable(attr):
            return attr
    return None


def configure_llm_key(cognee_mod: Any, key: str) -> bool:
    """Pass the key in-process. Never assign it to os.environ.

    Returns True when cognee.config.set_llm_api_key existed and was called.
    """
    config = getattr(cognee_mod, "config", None)
    if config is not None and hasattr(config, "set_llm_api_key"):
        try:
            config.set_llm_api_key(key)
        except Exception as error:
            operation_failed("cognee.config.set_llm_api_key", error)
        return True
    return False


def remember_key_configs(used_setter: bool, key: str) -> tuple[dict[str, str], dict[str, str]]:
    if used_setter:
        return {}, {}
    # TODO(Solve): confirm the llm_config / embedding_config dict shape that
    # remember() actually forwards in cognee 1.5.4.
    payload = {"api_key": key, "provider": "openai"}
    return payload, dict(payload)


def read_config_provider(config: Any, fragment: str, fallback: str) -> str:
    if config is None:
        return fallback
    for name in dir(config):
        lower = name.lower()
        if fragment not in lower or "provider" not in lower:
            continue
        attr = getattr(config, name, None)
        if callable(attr):
            try:
                value = attr()
            except TypeError:
                continue
            except Exception:
                continue
            if value:
                return str(value)
        elif attr:
            return str(attr)
    return fallback


def import_cognee(store_dir: Path, key: str, *, contradiction: bool) -> tuple[Any, bool, bool]:
    refuse_store_env(store_dir)
    apply_storage_env(store_dir)
    if contradiction:
        os.environ["CONTRADICTION_DETECTION"] = "true"
    drop_shell_api_key()
    try:
        os.chdir(store_dir)
    except OSError:
        fail("could not change directory to the store at %s." % store_dir)
    try:
        import cognee  # noqa: WPS433 - imported only after chdir and storage env
    except Exception as error:
        fail(
            "importing cognee failed (%s). Delete %s and re-run with --install."
            % (type(error).__name__, CACHE_DIR)
        )
        raise
    used_setter = configure_llm_key(cognee, key)
    leaked = scrub_key_from_environ(key)
    if not used_setter:
        # recall, promote, and the rest have no remember() kwargs path. If the
        # setter is absent they cannot supply the key in-process.
        pass
    return cognee, used_setter, leaked


def require_in_process_key(used_setter: bool, command: str) -> None:
    if used_setter:
        return
    if command == "ingest":
        return
    fail(
        "the API key cannot be supplied in-process under this cognee version "
        "(cognee.config.set_llm_api_key is absent and %s does not call remember())."
        % command
    )


def cognee_version_string() -> str:
    try:
        return importlib.metadata.version("cognee")
    except Exception:
        return "unknown"


def summarise_remember(result: Any) -> Any:
    ready = json_ready(result)
    if not isinstance(ready, dict):
        return ready
    keep = {}
    for key, value in ready.items():
        lower = key.lower()
        if any(
            token in lower
            for token in ("count", "id", "added", "dataset", "status", "node", "edge", "data")
        ):
            keep[key] = value
    return keep or ready


def extract_data_ids(result: Any) -> list[str]:
    """Best-effort data_id list from a RememberResult. Shape is unverified."""
    # TODO(Solve): record how RememberResult exposes per-file data_id values
    # in cognee 1.5.4 so the ledger can store them without guessing.
    ready = json_ready(result)
    found: list[str] = []

    def walk(item: Any) -> None:
        if isinstance(item, dict):
            for key, value in item.items():
                if key.lower() in ("data_id", "dataid", "id") and isinstance(value, str):
                    found.append(value)
                else:
                    walk(value)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(ready)
    return found


async def remember_with_ontology(
    cognee_mod: Any,
    data: list[str],
    *,
    ontology: Path | None,
    remember_kwargs: dict[str, Any],
) -> tuple[Any, bool]:
    """Call remember, trying ontology_file_path, then a config setter, then none.

    Whether ontology_file_path reaches cognify through remember() is unverified.
    """
    # TODO(Solve): confirm whether remember() forwards ontology_file_path to
    # cognify() in cognee 1.5.4. If it TypeErrors, confirm the config setter
    # name that find_ontology_setter returns, if any.
    if ontology is None or not ontology.is_file():
        result = await cognee_mod.remember(data, **remember_kwargs)
        return result, False
    ontology_kw = dict(remember_kwargs)
    ontology_kw["ontology_file_path"] = str(ontology)
    try:
        result = await cognee_mod.remember(data, **ontology_kw)
        return result, True
    except TypeError:
        pass
    setter = find_ontology_setter(getattr(cognee_mod, "config", None))
    if setter is not None:
        applied_setter = False
        try:
            setter(str(ontology))
            applied_setter = True
        except TypeError:
            try:
                setter(ontology_file_path=str(ontology))
                applied_setter = True
            except Exception:
                applied_setter = False
        except Exception:
            applied_setter = False
        if applied_setter:
            result = await cognee_mod.remember(data, **remember_kwargs)
            return result, True
    note("the ontology was not applied this run")
    result = await cognee_mod.remember(data, **remember_kwargs)
    return result, False


def reduce_context_item(item: Any) -> dict[str, Any]:
    if isinstance(item, str):
        return {"text": item}
    ready = json_ready(item)
    if not isinstance(ready, dict):
        return {"text": str(item)}
    out: dict[str, Any] = {}
    for key in ("text", "content", "chunk", "answer", "name", "payload"):
        if key in ready and ready[key] is not None:
            out["text"] = ready[key]
            break
    for key in (
        "source",
        "sources",
        "reference",
        "references",
        "path",
        "file_path",
        "document",
        "metadata",
    ):
        if key in ready:
            out[key] = ready[key]
    if "text" not in out:
        out["text"] = str(item)
    return out


def split_recall_result(result: Any) -> tuple[Any, list[Any], Any]:
    """Return (answer, context_items, references). Shape is unverified."""
    # TODO(Solve): record the actual cognee.recall return type in 1.5.4
    # (string, SearchResult, tuple, dict) and which fields carry source paths.
    if result is None:
        return None, [], None
    if isinstance(result, str):
        text = result.strip()
        if not text:
            return None, [], None
        return result, [{"text": result}], None
    ready = json_ready(result)
    if isinstance(ready, list):
        items = [reduce_context_item(item) for item in ready]
        return None, items, None
    if isinstance(ready, dict):
        answer = ready.get("answer", ready.get("result", ready.get("text")))
        context = ready.get("context", ready.get("items", ready.get("chunks", [])))
        if context is None:
            context = []
        if not isinstance(context, list):
            context = [context]
        references = ready.get("references", ready.get("sources", ready.get("source")))
        items = [reduce_context_item(item) for item in context]
        if answer and not items:
            items = [reduce_context_item(answer)]
        return answer, items, references
    answer = getattr(result, "answer", None) or getattr(result, "result", None)
    context = getattr(result, "context", None) or getattr(result, "chunks", None) or []
    if not isinstance(context, list):
        context = [context]
    references = getattr(result, "references", None) or getattr(result, "sources", None)
    return answer, [reduce_context_item(item) for item in context], references


async def call_recall(
    cognee_mod: Any,
    *,
    query: str,
    dataset: str,
    top_k: int,
    only_context: bool,
    include_references: bool,
) -> Any:
    kwargs = {
        "datasets": [dataset],
        "top_k": top_k,
        "only_context": only_context,
    }
    if include_references:
        kwargs["include_references"] = True
    try:
        return await cognee_mod.recall(query, **kwargs)
    except Exception as error:
        operation_failed("cognee.recall", error)
        raise


def coerce_node(raw: Any) -> dict[str, Any]:
    # TODO(Solve): record the node object shape returned by get_graph_data()
    # in cognee 1.5.4 (dict, DataPoint, (id, props), NetworkX node).
    data: dict[str, Any] = {}
    if isinstance(raw, dict):
        data.update(raw)
    elif isinstance(raw, (list, tuple)) and raw:
        data["id"] = raw[0]
        if len(raw) >= 2 and isinstance(raw[-1], dict):
            data.update(raw[-1])
        elif len(raw) >= 2:
            data["name"] = raw[1]
    else:
        dump = getattr(raw, "model_dump", None) or getattr(raw, "dict", None)
        if callable(dump):
            try:
                dumped = dump()
                if isinstance(dumped, dict):
                    data.update(dumped)
            except Exception:
                pass
        for attr in (
            "id",
            "node_id",
            "uuid",
            "uid",
            "element_id",
            "name",
            "status",
            "quote",
            "type",
            "entity_type",
            "valid_to",
            "valid_from",
            "confidence",
            "source",
            "source_path",
            "file_path",
            "data_id",
            "created_at",
            "ingested_on",
        ):
            if hasattr(raw, attr):
                value = getattr(raw, attr)
                if value is not None and attr not in data:
                    data[attr] = value
        if hasattr(raw, "__class__"):
            data.setdefault("type", raw.__class__.__name__)
    if "id" not in data:
        for key in ("node_id", "uuid", "uid", "element_id"):
            if data.get(key) is not None:
                data["id"] = data[key]
                break
    return data


def coerce_edge(raw: Any) -> dict[str, Any]:
    # TODO(Solve): record the edge object shape returned by get_graph_data()
    # in cognee 1.5.4.
    data: dict[str, Any] = {}
    if isinstance(raw, dict):
        data.update(raw)
        return data
    if isinstance(raw, (list, tuple)):
        if len(raw) == 3:
            data["source"] = raw[0]
            middle = raw[1]
            last = raw[2]
            if isinstance(middle, str) and not isinstance(last, str):
                data["relation"] = middle
                data["target"] = last
            elif isinstance(last, str):
                data["target"] = middle
                data["relation"] = last
            else:
                data["target"] = last
                data["relation"] = middle
            if isinstance(data.get("target"), dict):
                extra = data["target"]
                data["target"] = extra.get("id", extra)
                data.update({key: value for key, value in extra.items() if key != "id"})
            return data
        if len(raw) >= 2:
            data["source"] = raw[0]
            data["target"] = raw[1]
            return data
    for attr in ("source", "target", "relation", "relationship", "type", "label"):
        if hasattr(raw, attr):
            data[attr] = getattr(raw, attr)
    return data


def edge_relation(edge: dict[str, Any]) -> str:
    for key in ("relation", "relationship", "type", "label", "rel", "edge_type"):
        value = edge.get(key)
        if value is not None:
            return str(value)
    return ""


def split_graph_data(result: Any) -> tuple[list[Any], list[Any]]:
    if result is None:
        return [], []
    if isinstance(result, tuple) and len(result) == 2:
        return list(result[0] or []), list(result[1] or [])
    if isinstance(result, dict):
        nodes = result.get("nodes") or result.get("Nodes") or []
        edges = (
            result.get("edges")
            or result.get("Edges")
            or result.get("relationships")
            or []
        )
        return list(nodes), list(edges)
    if isinstance(result, list):
        return list(result), []
    return [], []


async def enumerate_graph(cognee_mod: Any, dataset: str) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]], str]:
    """Return (engine, nodes, edges, access_path). Fail by naming paths tried."""
    tried: list[str] = []
    datasets_mod = getattr(cognee_mod, "datasets", None)
    if datasets_mod is not None:
        for name in ("get_graph_data", "get_dataset_data", "get_data"):
            fn = getattr(datasets_mod, name, None)
            if not callable(fn):
                continue
            label = "cognee.datasets.%s" % name
            tried.append(label)
            try:
                # TODO(Solve): confirm which cognee.datasets helper enumerates
                # nodes for one dataset, and its signature.
                try:
                    result = fn(dataset)
                except TypeError:
                    result = fn()
                result = await maybe_await(result)
                nodes_raw, edges_raw = split_graph_data(result)
                if nodes_raw or edges_raw:
                    nodes = [coerce_node(item) for item in nodes_raw]
                    edges = [coerce_edge(item) for item in edges_raw]
                    return None, nodes, edges, label
            except Exception:
                continue
    tried.append("cognee.infrastructure.databases.graph.get_graph_engine")
    try:
        from cognee.infrastructure.databases.graph import get_graph_engine

        engine = await maybe_await(get_graph_engine())
        if engine is None or not hasattr(engine, "get_graph_data"):
            raise RuntimeError("engine missing get_graph_data")
        result = await maybe_await(engine.get_graph_data())
        nodes_raw, edges_raw = split_graph_data(result)
        nodes = [coerce_node(item) for item in nodes_raw]
        edges = [coerce_edge(item) for item in edges_raw]
        return (
            engine,
            nodes,
            edges,
            "cognee.infrastructure.databases.graph.get_graph_engine().get_graph_data()",
        )
    except Exception:
        fail(
            "could not enumerate graph nodes. Tried: %s."
            % "; ".join(tried)
        )
        raise


def find_update_method(engine: Any) -> tuple[str, Any] | None:
    """Introspect the graph engine for a node update method. Do not call blind."""
    # TODO(Solve): confirm the graph engine method that updates node properties
    # in cognee 1.5.4 (historical name update_node) and the working signature.
    if engine is None:
        return None
    names = []
    for name in dir(engine):
        if name.startswith("_"):
            continue
        lower = name.lower()
        if "update" in lower and "node" in lower:
            names.append(name)
        elif name in ("update_node", "upsert_node", "set_node"):
            names.append(name)
    seen: set[str] = set()
    ordered: list[str] = []
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        ordered.append(name)
    for name in ordered:
        attr = getattr(engine, name, None)
        if callable(attr):
            return name, attr
    return None


async def update_node_fields(engine: Any, node_id: Any, fields: dict[str, Any]) -> bool:
    found = find_update_method(engine)
    if found is None:
        return False
    _name, method = found
    attempts = (
        lambda: method(node_id, fields),
        lambda: method(node_id, **fields),
        lambda: method({"id": node_id, **fields}),
        lambda: method(node_id, properties=fields),
        lambda: method(properties=fields, node_id=node_id),
    )
    for attempt in attempts:
        try:
            await maybe_await(attempt())
            return True
        except TypeError:
            continue
        except Exception as error:
            operation_failed("graph node update", error)
    return False


def node_status(node: dict[str, Any]) -> str:
    value = node.get("status")
    if value is None:
        return ""
    return str(value)


def node_type_label(node: dict[str, Any]) -> str:
    for key in ("entity_type", "type", "label", "node_type"):
        value = node.get(key)
        if value:
            return str(value)
    return "unknown"


def node_name(node: dict[str, Any]) -> str:
    for key in ("name", "label", "text", "summary", "question"):
        value = node.get(key)
        if value:
            return str(value)
    return str(node.get("id") or "")


def node_id_of(node: dict[str, Any]) -> str:
    value = node.get("id")
    if value is None:
        return ""
    return str(value)


def is_protected(node: dict[str, Any], protected_types: tuple[str, ...]) -> bool:
    labels = {
        node_type_label(node).lower(),
        str(node.get("type") or "").lower(),
        str(node.get("entity_type") or "").lower(),
    }
    protected = {item.lower() for item in protected_types}
    return bool(labels & protected)


def collect_review_ids(review_root: Path) -> set[str]:
    ids: set[str] = set()
    if not review_root.is_dir():
        return ids
    for path in review_root.rglob("*"):
        if not path.is_file():
            continue
        ids.add(path.stem)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        match = re.search(r"(?m)^id:\s*(\S+)", text)
        if match:
            ids.add(match.group(1).strip())
    return ids


def review_covers_token(review_root: Path, token: str) -> bool:
    if not token or not review_root.is_dir():
        return False
    for path in review_root.rglob("*"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if token in text:
            return True
    return False


def next_review_id(dataset: str, existing: set[str]) -> str:
    stamp = datetime.now().strftime("%Y%m%d")
    n = 1
    while True:
        candidate = "%s-%s-%d" % (dataset, stamp, n)
        if candidate not in existing:
            existing.add(candidate)
            return candidate
        n += 1


def render_review_item(
    *,
    item_id: str,
    item_type: str,
    dataset: str,
    title: str,
    node_type: str,
    action: str,
    why: str,
    quote: str,
    source_path: str,
    content_hash: str,
    confidence: str,
    extra: str = "",
) -> str:
    created = today_iso()
    hash_short = content_hash[:12] if content_hash else ""
    hash_field = ("sha256:" + hash_short) if hash_short else ""
    body = extra + "\n" if extra else ""
    return (
        "---\n"
        "id: %s\n"
        "type: %s\n"
        "dataset: %s\n"
        "status: open\n"
        "created: %s\n"
        "---\n"
        "\n"
        "# %s\n"
        "\n"
        "## Surface forms\n"
        "\n"
        "- \"%s\"\n"
        "\n"
        "## Node type\n"
        "\n"
        "%s\n"
        "\n"
        "## Proposed action\n"
        "\n"
        "%s\n"
        "\n"
        "## Evidence\n"
        "\n"
        "| Quote (40 words at most) | Source path | Content hash | Extractor confidence |\n"
        "|--------------------------|------------|--------------|----------------------|\n"
        "| \"%s\" | %s | %s | %s |\n"
        "\n"
        "## Why this is not auto-decidable\n"
        "\n"
        "%s\n"
        "\n"
        "## Recommendation\n"
        "\n"
        "\n"
        "## Decision\n"
        "\n"
        "reviewer:\n"
        "decision:\n"
        "date:\n"
        "note:\n"
        "%s"
    ) % (
        item_id,
        item_type,
        dataset,
        created,
        title,
        title,
        node_type,
        action,
        quote,
        source_path,
        hash_field,
        confidence,
        why,
        body,
    )


def parse_frontmatter_and_body(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        fail("the decided item has no YAML frontmatter.")
    parts = text.split("---", 2)
    if len(parts) < 3:
        fail("the decided item frontmatter is not closed.")
    fields: dict[str, str] = {}
    for raw in parts[1].splitlines():
        line = raw.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().lower()] = value.strip()
    return fields, parts[2]


def parse_decision_block(body: str) -> dict[str, str]:
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        if re.match(r"^##\s+Decision\s*$", lines[index]):
            break
        index += 1
    else:
        fail("the decided item has no ## Decision block.")
    fields: dict[str, str] = {}
    index += 1
    while index < len(lines) and not lines[index].startswith("#"):
        line = lines[index].strip()
        if line and ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip().lower()] = value.strip()
        index += 1
    return fields


def append_changelog(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(line.rstrip() + "\n")


def set_frontmatter_status(path: Path, status: str) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(
        r"(?m)^status:\s*\S+",
        "status: %s" % status,
        text,
        count=1,
    )
    if count == 0:
        updated = text.replace("---\n", "---\nstatus: %s\n" % status, 1)
    path.write_text(updated, encoding="utf-8")


def find_node(nodes: list[dict[str, Any]], node_id: str) -> dict[str, Any] | None:
    for node in nodes:
        if node_id_of(node) == node_id:
            return node
    return None


def ledger_entry_for_node(node: dict[str, Any], ledger: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    for key in ("source", "source_path", "file_path", "path"):
        value = node.get(key)
        if isinstance(value, str) and value in ledger:
            return value, ledger[value]
    data_id = node.get("data_id")
    if data_id is not None:
        for path, entry in ledger.items():
            if isinstance(entry, dict) and str(entry.get("data_id")) == str(data_id):
                return path, entry
    return None, None


def parse_iso_date(value: Any) -> date | None:
    if not value:
        return None
    text = str(value)[:10]
    if not DATE_RE.match(text):
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


async def attempt_memify_detect(cognee_mod: Any, dataset: str) -> None:
    # TODO(Solve): confirm whether detect_entity_duplicates is a registered
    # memify task name in cognee 1.5.4. The name is unverified.
    try:
        await cognee_mod.memify(
            extraction_tasks=["detect_entity_duplicates"],
            dataset=dataset,
        )
    except Exception:
        note("detect_entity_duplicates is not available in this cognee version")


async def attempt_memify_merge(cognee_mod: Any, dataset: str) -> bool:
    # TODO(Solve): confirm whether merge_entity_duplicates is a registered
    # memify task name in cognee 1.5.4. Never call it without a decided item.
    try:
        await cognee_mod.memify(
            enrichment_tasks=["merge_entity_duplicates"],
            dataset=dataset,
        )
        return True
    except Exception:
        note("merge_entity_duplicates is not available in this cognee version")
        return False


def cmd_check(values: dict[str, str]) -> None:
    store_writable: bool | None = None
    store_arg = values.get("--store")
    if store_arg:
        store_dir = screen_path("--store", store_arg, destination=True)
        store_writable = store_is_writable(store_dir)
    emit(
        {
            "python": python_version_string(),
            "python_ok": python_is_ok(),
            "interpreters_found": interpreters_found(),
            "venv": CACHE_DIR.is_dir(),
            "cognee": cognee_marker_present(),
            "store_writable": store_writable,
        }
    )


def cmd_selftest() -> None:
    """Hidden: unit-test stdlib validators without installing cognee."""
    cases: list[dict[str, Any]] = []

    def record(name: str, ok: bool, detail: Any = None) -> None:
        cases.append({"name": name, "ok": ok, "detail": detail})

    sample = {
        "set": "example-set",
        "dataset": "exampleroot_example_set",
        "kind": "book",
        "owner": "tester",
        "sensitivity": "internal",
        "provider_consent": "tester, 2026-09-05",
        "canon_confirmed": "",
        "sources": {"include": ["corpus/**/*.md"], "exclude": []},
        "pack": "general",
        "node_sets": ["kind:book"],
        "chunking": "heading-aware",
        "llm": {
            "provider": "openai",
            "model": "default",
            "embedding_model": "default",
        },
        "review_cadence_days": 7,
        "stale_after_days": 30,
        "write_policy": {"agents_may_remember_episodes": False},
        "promotion_policy": {
            "auto_accept": ["exact_ontology_match", "normalized_name_match_same_type"]
        },
        "eval": "eval.questions.yaml",
    }
    record("valid recipe", recipe_problems(sample) == [], recipe_problems(sample))

    unknown = dict(sample)
    unknown["nope"] = 1
    unknown_errors = recipe_problems(unknown)
    record(
        "unknown key",
        any("nope" in item for item in unknown_errors),
        unknown_errors,
    )

    nested = dict(sample)
    nested["sources"] = {"include": ["corpus/**/*.md"], "weird": 1}
    nested_errors = recipe_problems(nested)
    record(
        "unknown nested key",
        any("weird" in item for item in nested_errors),
        nested_errors,
    )

    missing = dict(sample)
    del missing["dataset"]
    missing_errors = recipe_problems(missing)
    record(
        "missing required key",
        any("dataset" in item for item in missing_errors),
        missing_errors,
    )

    blank = dict(sample)
    blank["provider_consent"] = ""
    blank_errors = recipe_problems(blank)
    record(
        "blank provider_consent",
        any("provider_consent" in item for item in blank_errors),
        blank_errors,
    )

    bad_dataset = dict(sample)
    bad_dataset["dataset"] = "Not Valid"
    dataset_errors = recipe_problems(bad_dataset)
    record(
        "bad dataset",
        any("dataset" in item for item in dataset_errors),
        dataset_errors,
    )

    other_provider = dict(sample)
    other_provider["llm"] = {"provider": "anthropic"}
    provider_errors = recipe_problems(other_provider)
    record(
        "refused provider",
        any("anthropic" in item for item in provider_errors),
        provider_errors,
    )

    record("normalize Acme Corp.", normalize_name("Acme Corp.") == "acme")
    record("normalize Foo, Inc", normalize_name("Foo, Inc") == "foo")
    record(
        "normalize whitespace",
        normalize_name("  Alpha   LLC  ") == "alpha",
    )

    env_parsed = parse_env_text('FOO=bar\n# comment\n\nBAZ="qux"\n')
    record(
        "parse env text",
        env_parsed == {"FOO": "bar", "BAZ": "qux"},
        {key: True for key in env_parsed},
    )

    failed = [case for case in cases if not case["ok"]]
    emit({"ok": not failed, "tests": cases})
    if failed:
        sys.exit(1)


def refuse_if_env_collision(option: str, resolved: Path, env_file: Path) -> None:
    existing = deepest_existing(option, resolved)
    try:
        if same_file(existing, env_file) or inside_dir(existing, env_file.parent):
            fail(
                "%s resolves to the --env file or inside the directory that holds it. Pass a work path, not the credential file."
                % option
            )
    except OSError:
        pass


def peek_dataset(set_dir: Path) -> str:
    """Read dataset: from set.yaml with the stdlib so forget --confirm can speak before install."""
    path = set_dir / "set.yaml"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return "the dataset named in set.yaml"
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("dataset:"):
            value = line.split(":", 1)[1].strip().strip('"').strip("'")
            if value:
                return value
    return "the dataset named in set.yaml"


def prepare_store_args(
    values: dict[str, str],
    *,
    need_set: bool,
    need_env: bool,
) -> tuple[Path | None, Path, Path | None, dict[str, str]]:
    store_arg = values.get("--store")
    if not store_arg:
        fail("--store is required. Pass the owning root's knowledge/.store/ directory. " + usage_hint())
    if need_env and not values.get("--env"):
        fail(env_missing_message(False, None))
    # Screen --store before requiring the --env file to exist, so a store inside
    # this tool is refused even when --env names a path that is not yet a file.
    store_dir = screen_path("--store", store_arg, destination=True, env_file=None)
    set_dir = None
    if need_set:
        set_arg = values.get("--set")
        if not set_arg:
            fail(
                "--set is required. Pass the knowledge set directory that holds set.yaml. "
                + usage_hint()
            )
        set_dir = screen_path(
            "--set",
            set_arg,
            destination=False,
            env_file=None,
            must_exist=True,
            as_dir=True,
        )
        if not set_dir.is_dir():
            fail("--set is not a directory at %s." % set_dir)
        require_set_yaml(set_dir)
    env_path = None
    env_values: dict[str, str] = {}
    if need_env:
        env_path = load_env_path(values.get("--env"))
        env_values = parse_env_file(env_path)
        refuse_if_env_collision("--store", store_dir, env_path)
        if set_dir is not None:
            refuse_if_env_collision("--set", set_dir, env_path)
    if store_dir.exists():
        refuse_store_env(store_dir)
    return set_dir, store_dir, env_path, env_values


def cmd_bootstrap(values: dict[str, str]) -> None:
    if not values.get("--env"):
        fail(env_missing_message(False, None))
    _set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=False, need_env=True
    )
    key = openai_key(env_values)
    require_python()
    ensure_packages()
    store_dir.mkdir(parents=True, exist_ok=True)
    refuse_store_env(store_dir)
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "bootstrap")
    leaked = scrub_key_from_environ(key) or leaked
    config = getattr(cognee_mod, "config", None)
    emit(
        {
            "ok": True,
            "store": str(store_dir),
            "python": python_version_string(),
            "cognee_version": cognee_version_string(),
            "graph_provider": read_config_provider(config, "graph", GRAPH_PROVIDER),
            "vector_provider": read_config_provider(config, "vector", VECTOR_PROVIDER),
            "key_in_environ": key_in_environ(key),
            "key_leaked_to_environ": leaked,
        }
    )


async def ingest_async(
    values: dict[str, str],
    flags: set[str],
    set_dir: Path,
    store_dir: Path,
    key: str,
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    provider = recipe_provider(recipe)
    if provider != "openai":
        fail('llm.provider "%s" is not supported in v1. Use openai.' % provider)
    pack_dir = resolve_pack(set_dir, str(recipe["pack"]))
    if not pack_dir.is_dir():
        fail("the pack directory %s does not exist." % pack_dir)
    started = datetime.now()
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=True
    )
    llm_config, embedding_config = remember_key_configs(used_setter, key)
    if not used_setter and not llm_config:
        fail(
            "the API key cannot be supplied in-process under this cognee version "
            "(no set_llm_api_key and remember() cannot take llm_config)."
        )
    graph_model, _protected, ontology, extraction_prompt = load_pack(pack_dir)
    prompt = build_custom_prompt(extraction_prompt, set_dir, str(recipe["set"]))
    include = recipe["sources"]["include"]
    exclude = recipe["sources"].get("exclude") or []
    files = expand_sources(set_dir, include, exclude)
    ledger = load_ledger(set_dir)
    new_files: list[Path] = []
    skipped: list[str] = []
    hashes: dict[str, str] = {}
    mtimes: dict[str, float] = {}
    for path in files:
        digest = hash_file(path)
        hashes[str(path)] = digest
        try:
            mtimes[str(path)] = path.stat().st_mtime
        except OSError:
            mtimes[str(path)] = 0.0
        entry = ledger.get(str(path))
        if isinstance(entry, dict) and entry.get("sha256") == digest:
            skipped.append(str(path))
        else:
            new_files.append(path)

    report_dir_arg = values.get("--report")
    if report_dir_arg:
        report_dir = screen_path(
            "--report",
            report_dir_arg,
            destination=True,
        )
    else:
        report_dir = set_dir / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    if not new_files:
        duration = (datetime.now() - started).total_seconds()
        report = {
            "ok": True,
            "files_added": [],
            "files_skipped_unchanged": skipped,
            "files_failed": [],
            "ontology_applied": False,
            "key_in_environ": key_in_environ(key),
            "key_leaked_to_environ": leaked,
            "dataset": recipe["dataset"],
            "pack": recipe["pack"],
            "duration_seconds": round(duration, 3),
            "review_due": False,
            "message": "nothing is new; every source hash matches the ledger",
        }
        return report

    data = [str(path) for path in new_files]
    remember_kwargs: dict[str, Any] = {
        "dataset_name": recipe["dataset"],
        "custom_prompt": prompt,
        "graph_model": graph_model,
        "node_set": list(recipe["node_sets"]),
        "incremental_loading": True,
        "raise_on_error": True,
    }
    if llm_config:
        remember_kwargs["llm_config"] = llm_config
        remember_kwargs["embedding_config"] = embedding_config

    proceed = "--proceed" in flags
    if not proceed:
        remember_kwargs["dry_run"] = True
        try:
            result, ontology_applied = await remember_with_ontology(
                cognee_mod,
                data,
                ontology=ontology if ontology.is_file() else None,
                remember_kwargs=remember_kwargs,
            )
        except Exception as error:
            operation_failed("cognee.remember (dry_run)", error)
            raise
        estimate = json_ready(result)
        note("re-run with --proceed to ingest")
        emit(
            {
                "dry_run": True,
                "estimate": estimate,
                "files_new": data,
                "files_skipped_unchanged": skipped,
                "ontology_applied": ontology_applied,
                "dataset": recipe["dataset"],
            }
        )
        sys.exit(1)

    remember_kwargs.pop("dry_run", None)
    files_failed: list[dict[str, str]] = []
    files_added: list[str] = []
    remember_result = None
    ontology_applied = False
    try:
        remember_result, ontology_applied = await remember_with_ontology(
            cognee_mod,
            data,
            ontology=ontology if ontology.is_file() else None,
            remember_kwargs=remember_kwargs,
        )
        files_added = list(data)
    except SystemExit:
        raise
    except Exception as error:
        class_name = type(error).__name__
        files_failed = [{"path": path, "error": class_name} for path in data]

    if files_added:
        try:
            await cognee_mod.improve(dataset=recipe["dataset"])
        except Exception as error:
            note("cognee.improve failed (%s)" % type(error).__name__)

    data_ids = extract_data_ids(remember_result) if remember_result is not None else []
    ingested_on = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    for index, path in enumerate(files_added):
        data_id = data_ids[index] if index < len(data_ids) else None
        ledger[path] = {
            "sha256": hashes.get(path, ""),
            "mtime": mtimes.get(path, 0.0),
            "ingested_on": ingested_on,
            "data_id": data_id,
        }
    save_ledger(set_dir, ledger)

    duration = (datetime.now() - started).total_seconds()
    report = {
        "ok": True,
        "files_added": files_added,
        "files_skipped_unchanged": skipped,
        "files_failed": files_failed,
        "ontology_applied": ontology_applied,
        "key_in_environ": key_in_environ(key),
        "key_leaked_to_environ": leaked,
        "dataset": recipe["dataset"],
        "pack": recipe["pack"],
        "duration_seconds": round(duration, 3),
        "review_due": True,
    }
    if remember_result is not None:
        report["remember_result"] = summarise_remember(remember_result)
    report_path = report_dir / ("ingest-%s.json" % now_stamp())
    report_path.write_text(
        json.dumps(json_ready(report), indent=2) + "\n", encoding="utf-8"
    )
    report["report"] = str(report_path)
    return report


def cmd_ingest(values: dict[str, str], flags: set[str]) -> None:
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    report_dir_arg = values.get("--report")
    if report_dir_arg:
        screen_path("--report", report_dir_arg, destination=True)
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    report = asyncio.run(ingest_async(values, flags, set_dir, store_dir, key))
    emit(report)


async def recall_async(
    set_dir: Path,
    store_dir: Path,
    key: str,
    query: str,
    as_of: str | None,
    top_k: int,
    mode: str,
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "recall")
    query_text = query
    if as_of:
        query_text = "%s (as of %s)" % (query, as_of)
    only_context = mode == "context"
    include_references = mode == "answer"
    result = await call_recall(
        cognee_mod,
        query=query_text,
        dataset=str(recipe["dataset"]),
        top_k=top_k,
        only_context=only_context,
        include_references=include_references,
    )
    answer, context, references = split_recall_result(result)
    if only_context:
        answer = None
    if not context and not answer:
        answer = None
        context = []
    canon = recipe.get("canon_confirmed")
    if not str(canon or "").strip():
        canon = None
    return {
        "dataset": recipe["dataset"],
        "query": query_text,
        "as_of": as_of,
        "answer": answer,
        "context": context,
        "references": references,
        "canon_confirmed": canon,
        "key_leaked_to_environ": leaked,
    }


def cmd_recall(values: dict[str, str]) -> None:
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    query = values.get("--query")
    if not query:
        fail("--query is required. " + usage_hint())
    as_of = values.get("--as-of")
    if as_of:
        as_of = parse_date_flag("--as-of", as_of)
    top_k_raw = values.get("--top-k") or "15"
    try:
        top_k = int(top_k_raw)
    except ValueError:
        fail('--top-k must be an integer; got "%s".' % top_k_raw)
        raise
    if top_k < 1:
        fail("--top-k must be 1 or more.")
    mode = values.get("--mode") or "answer"
    if mode not in KNOWN_MODES:
        fail('unknown --mode "%s". One of: %s.' % (mode, ", ".join(KNOWN_MODES)))
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(
        asyncio.run(
            recall_async(set_dir, store_dir, key, query, as_of, top_k, mode)
        )
    )


def source_fields_for_node(
    node: dict[str, Any], ledger: dict[str, Any]
) -> tuple[str, str, str, str]:
    quote = str(node.get("quote") or "")
    confidence = str(node.get("confidence") or "")
    path, entry = ledger_entry_for_node(node, ledger)
    source_path = path or str(node.get("source") or node.get("source_path") or "")
    content_hash = ""
    if isinstance(entry, dict):
        content_hash = str(entry.get("sha256") or "")
    return quote, source_path, content_hash, confidence


async def review_pass_async(set_dir: Path, store_dir: Path, key: str) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    pack_dir = resolve_pack(set_dir, str(recipe["pack"]))
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "review-pass")
    _graph_model, protected, _ontology, _prompt = load_pack(pack_dir)
    await attempt_memify_detect(cognee_mod, str(recipe["dataset"]))
    engine, nodes, edges, access_path = await enumerate_graph(
        cognee_mod, str(recipe["dataset"])
    )
    del engine
    ledger = load_ledger(set_dir)
    review_root = set_dir / "review"
    existing_ids = collect_review_ids(review_root)
    written: dict[str, list[str]] = {
        "new_finding": [],
        "merge_proposal": [],
        "stale": [],
        "conflict": [],
    }
    stale_after = recipe.get("stale_after_days") or 30
    try:
        stale_after_days = int(stale_after)
    except (TypeError, ValueError):
        stale_after_days = 30
    today = date.today()

    def write_item(item_type: str, **kwargs: Any) -> None:
        item_id = next_review_id(str(recipe["dataset"]), existing_ids)
        directory = review_root / REVIEW_TYPE_DIRS[item_type]
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / ("%s.md" % item_id)
        path.write_text(
            render_review_item(item_id=item_id, item_type=item_type, dataset=str(recipe["dataset"]), **kwargs),
            encoding="utf-8",
        )
        written[item_type].append(str(path))

    for node in nodes:
        status = node_status(node) or "Candidate"
        if status != "Candidate":
            continue
        nid = node_id_of(node)
        if nid and review_covers_token(review_root, nid):
            continue
        quote, source_path, content_hash, confidence = source_fields_for_node(
            node, ledger
        )
        write_item(
            "new_finding",
            title=node_name(node) or nid or "unnamed",
            node_type=node_type_label(node),
            action="promote",
            why="no exact ontology match; no normalized-name match to a Canonical of the same type in this set",
            quote=quote,
            source_path=source_path,
            content_hash=content_hash,
            confidence=confidence,
            extra="node_id: %s" % nid,
        )

    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for node in nodes:
        label = node_type_label(node)
        normalized = normalize_name(node_name(node))
        if not normalized:
            continue
        groups.setdefault((label.lower(), normalized), []).append(node)
    seen_pairs: set[tuple[str, str]] = set()
    for (_label, _normalized), group in groups.items():
        if len(group) < 2:
            continue
        for index, left in enumerate(group):
            for right in group[index + 1 :]:
                left_id = node_id_of(left)
                right_id = node_id_of(right)
                if not left_id or not right_id or left_id == right_id:
                    continue
                pair = tuple(sorted((left_id, right_id)))
                if pair in seen_pairs:
                    continue
                statuses = {node_status(left), node_status(right)}
                collide = True
                candidate_canonical = statuses == {"Candidate", "Canonical"}
                if not collide and not candidate_canonical:
                    continue
                seen_pairs.add(pair)
                if review_covers_token(review_root, left_id) and review_covers_token(
                    review_root, right_id
                ):
                    continue
                protected_flag = is_protected(left, protected) or is_protected(
                    right, protected
                )
                why = "normalized-name match of the same type"
                if protected_flag:
                    why = "a protected type"
                write_item(
                    "merge_proposal",
                    title="%s / %s" % (node_name(left), node_name(right)),
                    node_type=node_type_label(left),
                    action="merge-into %s" % right_id,
                    why=why,
                    quote=str(left.get("quote") or right.get("quote") or ""),
                    source_path="",
                    content_hash="",
                    confidence="",
                    extra="left_id: %s\nright_id: %s\nprotected: %s\n"
                    % (left_id, right_id, "true" if protected_flag else "false"),
                )

    for node in nodes:
        reasons: list[str] = []
        path, entry = ledger_entry_for_node(node, ledger)
        if path and not Path(path).exists():
            reasons.append("ledger source path no longer exists on disk")
        valid_to = parse_iso_date(node.get("valid_to"))
        if valid_to is not None and valid_to < today:
            reasons.append("valid_to is in the past")
        status = node_status(node) or "Candidate"
        if status == "Candidate":
            ingested = None
            if isinstance(entry, dict):
                ingested = parse_iso_date(entry.get("ingested_on"))
            if ingested is None:
                ingested = parse_iso_date(node.get("ingested_on") or node.get("created_at"))
            sources = node.get("sources")
            single_source = False
            if sources is None:
                single_source = bool(path) or bool(node.get("source"))
            elif isinstance(sources, list) and len(sources) == 1:
                single_source = True
            elif isinstance(sources, str):
                single_source = True
            if (
                ingested is not None
                and single_source
                and (today - ingested).days > stale_after_days
            ):
                reasons.append(
                    "Candidate older than stale_after_days with a single source"
                )
        if not reasons:
            continue
        nid = node_id_of(node)
        if nid and review_covers_token(review_root, nid):
            continue
        quote, source_path, content_hash, confidence = source_fields_for_node(
            node, ledger
        )
        write_item(
            "stale",
            title=node_name(node) or nid or "unnamed",
            node_type=node_type_label(node),
            action="mark-stale",
            why="; ".join(reasons),
            quote=quote,
            source_path=source_path,
            content_hash=content_hash,
            confidence=confidence,
            extra="node_id: %s" % nid,
        )

    for edge in edges:
        relation = edge_relation(edge)
        if "contradicts" not in relation.lower():
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        token = "%s:%s:%s" % (source, relation, target)
        if review_covers_token(review_root, token):
            continue
        write_item(
            "conflict",
            title="contradicts: %s -> %s" % (source, target),
            node_type="Fact",
            action="edit-ontology",
            why="a contradiction with a Canonical fact",
            quote=str(edge.get("quote") or ""),
            source_path="",
            content_hash="",
            confidence="",
            extra="relation: %s\nsource: %s\ntarget: %s\n" % (relation, source, target),
        )

    counts = {key: len(paths) for key, paths in written.items()}
    return {
        "ok": True,
        "dataset": recipe["dataset"],
        "access_path": access_path,
        "counts": counts,
        "paths": written,
        "key_leaked_to_environ": leaked,
    }


def cmd_review_pass(values: dict[str, str]) -> None:
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(asyncio.run(review_pass_async(set_dir, store_dir, key)))


async def apply_status(
    engine: Any,
    node: dict[str, Any],
    fields: dict[str, Any],
    changelog: Path,
    item_id: str,
    decision: str,
    reviewer: str,
) -> bool:
    nid = node_id_of(node)
    applied = await update_node_fields(engine, nid, fields)
    if not applied:
        append_changelog(
            changelog,
            "%s\t%s\t%s\t%s\tapplied: false\tfields=%s"
            % (today_iso(), item_id, decision, reviewer, json.dumps(json_ready(fields))),
        )
        fail(
            "this cognee version exposes no node update method (tried names containing both update and node). "
            "The intended change was appended to %s with applied: false."
            % changelog
        )
    return True


async def promote_async(
    set_dir: Path, store_dir: Path, key: str, decided: Path
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    pack_dir = resolve_pack(set_dir, str(recipe["pack"]))
    text = decided.read_text(encoding="utf-8")
    front, body = parse_frontmatter_and_body(text)
    decision_fields = parse_decision_block(body)
    reviewer = decision_fields.get("reviewer", "").strip()
    decision_raw = decision_fields.get("decision", "").strip()
    decided_on = decision_fields.get("date", "").strip()
    if not reviewer or not decision_raw or not decided_on:
        fail(
            "the decided item is missing reviewer, decision, or date. Fill the ## Decision block."
        )
    parts = decision_raw.split()
    verb = parts[0]
    target_id = parts[1] if len(parts) > 1 else ""
    allowed = {
        "promote",
        "alias-of",
        "mark-stale",
        "reject",
        "merge-into",
        "edit-ontology",
    }
    if verb not in allowed:
        fail(
            'decision "%s" is not allowed. Use promote, alias-of <id>, mark-stale, reject, merge-into <id>, or edit-ontology.'
            % decision_raw
        )
    if verb in ("alias-of", "merge-into") and not target_id:
        fail("%s needs a target node id." % verb)
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "promote")
    _graph_model, _protected, ontology, _prompt = load_pack(pack_dir)
    engine, nodes, _edges, access_path = await enumerate_graph(
        cognee_mod, str(recipe["dataset"])
    )
    item_node_id = ""
    extra_id = re.search(r"(?m)^node_id:\s*(\S+)", body)
    if extra_id:
        item_node_id = extra_id.group(1).strip()
    if not item_node_id:
        left = re.search(r"(?m)^left_id:\s*(\S+)", body)
        if left:
            item_node_id = left.group(1).strip()
    node = find_node(nodes, item_node_id) if item_node_id else None
    changelog = set_dir / "review" / "changelog.md"
    dataset = str(recipe["dataset"])
    item_id = front.get("id") or decided.stem

    if verb == "edit-ontology":
        ontology_path = str(ontology) if ontology.is_file() else str(pack_dir / "ontology.ttl")
        note("edit the ontology at %s; this command makes no graph change" % ontology_path)
        append_changelog(
            changelog,
            "%s\t%s\t%s\t%s" % (today_iso(), item_id, decision_raw, reviewer),
        )
        set_frontmatter_status(decided, "applied")
        return {
            "ok": True,
            "decision": decision_raw,
            "ontology": ontology_path,
            "applied": True,
            "graph_changed": False,
            "key_leaked_to_environ": leaked,
        }

    if node is None:
        fail(
            "could not find node %s via %s. Confirm the review item names node_id."
            % (item_node_id or "(missing)", access_path)
        )
        raise RuntimeError
    if node_status(node) == "Canonical" and verb in ("reject",):
        fail(
            "refusing to reject a Canonical node. Canonical nodes are never deleted by this script."
        )

    fields: dict[str, Any]
    graph_note = ""
    if verb == "promote":
        fields = {"status": "Canonical"}
        await apply_status(engine, node, fields, changelog, item_id, decision_raw, reviewer)
    elif verb == "alias-of":
        fields = {"status": "Alias", "alias_of": target_id}
        await apply_status(engine, node, fields, changelog, item_id, decision_raw, reviewer)
    elif verb == "mark-stale":
        fields = {"status": "Stale", "valid_to": today_iso()}
        await apply_status(engine, node, fields, changelog, item_id, decision_raw, reviewer)
    elif verb == "reject":
        fields = {"status": "Rejected"}
        await apply_status(engine, node, fields, changelog, item_id, decision_raw, reviewer)
        data_id_match = re.search(r"data_id:\s*([0-9a-fA-F-]{36})", text)
        if data_id_match:
            try:
                await cognee_mod.forget(
                    data_id=UUID(data_id_match.group(1)), dataset=dataset
                )
            except Exception as error:
                operation_failed("cognee.forget", error)
    elif verb == "merge-into":
        merged = await attempt_memify_merge(cognee_mod, dataset)
        if not merged:
            fields = {"status": "Alias", "alias_of": target_id}
            await apply_status(
                engine, node, fields, changelog, item_id, decision_raw, reviewer
            )
            graph_note = (
                "the graph merge was not performed; the source node was marked Alias of the target"
            )
            note(graph_note)
        else:
            append_changelog(
                changelog,
                "%s\t%s\t%s\t%s" % (today_iso(), item_id, decision_raw, reviewer),
            )
    else:
        fail('decision "%s" is not allowed.' % decision_raw)

    if verb != "merge-into" or graph_note:
        append_changelog(
            changelog,
            "%s\t%s\t%s\t%s" % (today_iso(), item_id, decision_raw, reviewer),
        )
    set_frontmatter_status(decided, "applied")
    result = {
        "ok": True,
        "decision": decision_raw,
        "node_id": node_id_of(node),
        "applied": True,
        "key_leaked_to_environ": leaked,
    }
    if graph_note:
        result["note"] = graph_note
    return result


def cmd_promote(values: dict[str, str]) -> None:
    set_dir, store_dir, env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    decided_arg = values.get("--decided")
    if not decided_arg:
        fail("--decided is required. Pass a file under <set>/review/decided/. " + usage_hint())
    decided = screen_path(
        "--decided",
        decided_arg,
        destination=False,
        env_file=env_path,
        must_exist=True,
        as_file=True,
    )
    decided_root = (set_dir / "review" / "decided").resolve()
    try:
        decided.relative_to(decided_root)
    except ValueError:
        fail(
            "--decided must be a file under %s; got %s."
            % (decided_root, decided)
        )
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(asyncio.run(promote_async(set_dir, store_dir, key, decided)))


async def mark_stale_async(
    set_dir: Path, store_dir: Path, key: str, node_id: str, valid_to: str
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "mark-stale")
    engine, nodes, _edges, access_path = await enumerate_graph(
        cognee_mod, str(recipe["dataset"])
    )
    node = find_node(nodes, node_id)
    if node is None:
        fail("could not find node %s via %s." % (node_id, access_path))
        raise RuntimeError
    if node_status(node) == "Canonical":
        # Status flip to Stale is allowed; deletion is not. Canonical may be
        # marked stale by a human. We still never delete.
        pass
    fields = {"status": "Stale", "valid_to": valid_to}
    changelog = set_dir / "review" / "changelog.md"
    applied = await update_node_fields(engine, node_id, fields)
    if not applied:
        append_changelog(
            changelog,
            "%s\t%s\tmark-stale\t(script)\tapplied: false\tfields=%s"
            % (today_iso(), node_id, json.dumps(fields)),
        )
        fail(
            "this cognee version exposes no node update method (tried names containing both update and node). "
            "The intended change was appended to %s with applied: false."
            % changelog
        )
    append_changelog(
        changelog,
        "%s\t%s\tmark-stale\t(script)" % (today_iso(), node_id),
    )
    return {
        "ok": True,
        "id": node_id,
        "fields": fields,
        "key_leaked_to_environ": leaked,
    }


def cmd_mark_stale(values: dict[str, str]) -> None:
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    node_id = values.get("--id")
    if not node_id:
        fail("--id is required. " + usage_hint())
    valid_to = values.get("--valid-to") or today_iso()
    valid_to = parse_date_flag("--valid-to", valid_to)
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(asyncio.run(mark_stale_async(set_dir, store_dir, key, node_id, valid_to)))


def newest_ingest_report(reports_dir: Path) -> str | None:
    if not reports_dir.is_dir():
        return None
    reports = sorted(reports_dir.glob("ingest-*.json"))
    if not reports:
        return None
    latest = reports[-1]
    return latest.name


def open_review_counts(review_root: Path) -> dict[str, int]:
    counts = {key: 0 for key in REVIEW_TYPE_DIRS}
    if not review_root.is_dir():
        return counts
    inverse = {value: key for key, value in REVIEW_TYPE_DIRS.items()}
    for path in review_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in (".md", ".markdown"):
            continue
        parent = path.parent.name
        item_type = inverse.get(parent)
        if not item_type:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        match = re.search(r"(?m)^status:\s*(\S+)", text)
        status = match.group(1) if match else "open"
        if status == "open":
            counts[item_type] += 1
    return counts


def eval_blob(answer: Any, context: list[Any], references: Any) -> str:
    parts = [str(answer or "")]
    for item in context:
        parts.append(json.dumps(json_ready(item)))
    if references is not None:
        parts.append(json.dumps(json_ready(references)))
    return "\n".join(parts)


def question_passes(
    question: dict[str, Any], answer: Any, context: list[Any], references: Any
) -> tuple[bool, str]:
    blob = eval_blob(answer, context, references)
    blob_lower = blob.lower()
    expected = str(question.get("expected") or "").strip()
    must_not = str(question.get("must_not_match") or "").strip()
    if must_not and must_not.lower() in blob_lower:
        return False, "must_not_match found"
    if expected.startswith("path:"):
        needle = expected[5:].strip()
        ref_text = json.dumps(json_ready(references)).lower() if references is not None else ""
        if needle.lower() in ref_text:
            return True, "path found in references"
        return False, "path not found in references"
    if expected:
        if expected.lower() in blob_lower:
            return True, "expected found"
        return False, "expected not found"
    if must_not:
        return True, "must_not_match absent"
    return False, "no expected or must_not_match"


async def healthcheck_async(
    set_dir: Path, store_dir: Path, key: str, run_eval: bool
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "healthcheck")
    _engine, nodes, _edges, access_path = await enumerate_graph(
        cognee_mod, str(recipe["dataset"])
    )
    ledger = load_ledger(set_dir)
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    facts_missing_quote = 0
    stale_nodes = 0
    candidate_dates: list[date] = []
    for node in nodes:
        ntype = node_type_label(node)
        status = node_status(node) or "unset"
        by_type[ntype] = by_type.get(ntype, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        if status == "Stale":
            stale_nodes += 1
        is_fact = "fact" in ntype.lower() or (
            "subject" in node and "predicate" in node and "object" in node
        )
        if is_fact and not str(node.get("quote") or "").strip():
            facts_missing_quote += 1
        if status == "Candidate":
            _path, entry = ledger_entry_for_node(node, ledger)
            ingested = None
            if isinstance(entry, dict):
                ingested = parse_iso_date(entry.get("ingested_on"))
            if ingested is None:
                ingested = parse_iso_date(node.get("ingested_on"))
            if ingested is not None:
                candidate_dates.append(ingested)
    oldest_candidate = (
        min(candidate_dates).isoformat() if candidate_dates else None
    )
    report = {
        "ok": True,
        "dataset": recipe["dataset"],
        "access_path": access_path,
        "counts_by_type": by_type,
        "counts_by_status": by_status,
        "facts_missing_quote": facts_missing_quote,
        "candidate_backlog_oldest_ingest": oldest_candidate,
        "stale_backlog_count": stale_nodes,
        "last_ingest": newest_ingest_report(set_dir / "reports"),
        "review_open": open_review_counts(set_dir / "review"),
        "key_leaked_to_environ": leaked,
        "eval": None,
    }
    if not run_eval:
        return report
    eval_rel = str(recipe.get("eval") or "").strip()
    eval_path = set_dir / eval_rel
    if not eval_path.is_file():
        fail("the eval file %s is missing." % eval_path)
    loaded = load_yaml(eval_path, "eval")
    questions = loaded.get("questions") if isinstance(loaded, dict) else None
    if not isinstance(questions, list):
        fail("the eval file has no questions list.")
        raise RuntimeError
    results = []
    passed = 0
    failed = 0
    skipped = 0
    for question in questions:
        if not isinstance(question, dict):
            skipped += 1
            continue
        text = str(question.get("question") or "").strip()
        qid = str(question.get("id") or "")
        if not text:
            skipped += 1
            results.append({"id": qid, "pass": None, "skipped": True})
            continue
        as_of = question.get("as_of")
        query_text = text
        if as_of and str(as_of) != "YYYY-MM-DD":
            query_text = "%s (as of %s)" % (text, as_of)
        result = await call_recall(
            cognee_mod,
            query=query_text,
            dataset=str(recipe["dataset"]),
            top_k=15,
            only_context=False,
            include_references=True,
        )
        answer, context, references = split_recall_result(result)
        ok, reason = question_passes(question, answer, context, references)
        if ok:
            passed += 1
        else:
            failed += 1
        results.append(
            {
                "id": qid,
                "type": question.get("type"),
                "pass": ok,
                "reason": reason,
            }
        )
    report["eval"] = {
        "ran": True,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "questions": results,
    }
    return report


def cmd_healthcheck(values: dict[str, str], flags: set[str]) -> None:
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    require_python()
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(
        asyncio.run(
            healthcheck_async(set_dir, store_dir, key, "--eval" in flags)
        )
    )


def forget_target_description(
    flags: set[str], values: dict[str, str], dataset: str
) -> str:
    if "--memory-only" in flags:
        return (
            "derived memory for dataset %s (forget(dataset=%s, memory_only=True)); "
            "ledger hashes would be kept and ingested_on and data_id cleared"
            % (dataset, dataset)
        )
    if "--dataset" in flags:
        return "the whole dataset %s (forget(dataset=%s)) and the ledger would be renamed" % (
            dataset,
            dataset,
        )
    data_id = values.get("--data-id")
    return "data_id %s in dataset %s" % (data_id, dataset)


async def forget_async(
    set_dir: Path,
    store_dir: Path,
    key: str,
    flags: set[str],
    values: dict[str, str],
) -> dict[str, Any]:
    recipe = load_recipe(set_dir)
    recipe_provider(recipe)
    dataset = str(recipe["dataset"])
    cognee_mod, used_setter, leaked = import_cognee(
        store_dir, key, contradiction=False
    )
    require_in_process_key(used_setter, "forget")
    ledger = load_ledger(set_dir)
    if "--memory-only" in flags:
        try:
            await cognee_mod.forget(dataset=dataset, memory_only=True)
        except Exception as error:
            operation_failed("cognee.forget", error)
        for path, entry in list(ledger.items()):
            if isinstance(entry, dict):
                entry["ingested_on"] = None
                entry["data_id"] = None
                ledger[path] = entry
        save_ledger(set_dir, ledger)
        return {
            "ok": True,
            "action": "memory-only",
            "dataset": dataset,
            "key_leaked_to_environ": leaked,
        }
    if "--dataset" in flags:
        try:
            await cognee_mod.forget(dataset=dataset)
        except Exception as error:
            operation_failed("cognee.forget", error)
        path = ledger_path(set_dir)
        renamed = None
        if path.is_file():
            renamed = path.with_name("ledger.forgotten-%s.json" % today_iso())
            path.replace(renamed)
        return {
            "ok": True,
            "action": "dataset",
            "dataset": dataset,
            "ledger": str(renamed) if renamed else None,
            "key_leaked_to_environ": leaked,
        }
    data_id_raw = values.get("--data-id")
    try:
        data_uuid = UUID(data_id_raw)
    except (TypeError, ValueError):
        fail('--data-id must be a UUID; got "%s".' % data_id_raw)
        raise
    try:
        await cognee_mod.forget(data_id=data_uuid, dataset=dataset)
    except Exception as error:
        operation_failed("cognee.forget", error)
    dropped = []
    for path, entry in list(ledger.items()):
        if isinstance(entry, dict) and str(entry.get("data_id")) == str(data_uuid):
            dropped.append(path)
            del ledger[path]
    save_ledger(set_dir, ledger)
    return {
        "ok": True,
        "action": "data-id",
        "dataset": dataset,
        "data_id": str(data_uuid),
        "dropped": dropped,
        "key_leaked_to_environ": leaked,
    }


def cmd_forget(values: dict[str, str], flags: set[str]) -> None:
    modes = [name for name in ("--memory-only", "--dataset") if name in flags]
    if values.get("--data-id"):
        modes.append("--data-id")
    if len(modes) != 1:
        fail(
            "forget needs exactly one of --memory-only, --data-id, or --dataset. "
            + usage_hint()
        )
    set_dir, store_dir, _env_path, env_values = prepare_store_args(
        values, need_set=True, need_env=True
    )
    assert set_dir is not None
    require_python()
    dataset = peek_dataset(set_dir)
    if "--confirm" not in flags:
        fail(
            "this run would forget %s and --confirm was not given. Re-run with --confirm if that is what you meant."
            % forget_target_description(flags, values, dataset)
        )
    ensure_packages()
    key = openai_key(env_values)
    if not store_dir.exists():
        fail("the store at %s does not exist. Run bootstrap first." % store_dir)
    emit(asyncio.run(forget_async(set_dir, store_dir, key, flags, values)))


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    command = argv[0] if argv else "help"
    if command in ("help", "--help", "-h") or "--help" in argv or "-h" in argv:
        sys.stdout.write(USAGE + "\n")
        sys.exit(0)
    if command in ("selftest", "--selftest"):
        _values, _flags = parse(argv[1:], ALLOWED_OPTIONS["selftest"])
        cmd_selftest()
        return
    if command not in COMMANDS:
        fail('unknown command "%s". %s' % (command, usage_hint()))
    values, flags = parse(argv[1:], ALLOWED_OPTIONS[command])
    if command == "check":
        cmd_check(values)
        return
    if command == "bootstrap":
        cmd_bootstrap(values)
        return
    if command == "ingest":
        cmd_ingest(values, flags)
        return
    if command == "recall":
        cmd_recall(values)
        return
    if command == "review-pass":
        cmd_review_pass(values)
        return
    if command == "promote":
        cmd_promote(values)
        return
    if command == "mark-stale":
        cmd_mark_stale(values)
        return
    if command == "healthcheck":
        cmd_healthcheck(values, flags)
        return
    if command == "forget":
        cmd_forget(values, flags)
        return
    fail('unknown command "%s". %s' % (command, usage_hint()))


if __name__ == "__main__":
    main()
