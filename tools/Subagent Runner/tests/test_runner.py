"""Offline checks for Subagent Runner. No vendor model is started.

Run from the tool directory:
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -t tests
"""

import builtins
import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

TOOL = Path(__file__).resolve().parents[1]
SCRIPT = TOOL / "scripts" / "subagent_runner.py"
sys.path.insert(0, str(TOOL / "scripts"))

import engine  # noqa: E402


FAKE = textwrap.dedent("""\
    import json, os, signal, sys, time
    from pathlib import Path
    args = sys.argv[1:]
    name = Path(sys.argv[0]).name
    marker = os.environ.get("ARGVFILE")
    if marker:
        with open(marker, "a", encoding="utf-8") as handle:
            handle.write(name + " " + json.dumps(args) + "\\n")
    if "--version" in args or "-V" in args:
        sys.stdout.write(name + " 0\\n")
        raise SystemExit(0)
    if args[:2] == ["mcp", "list"]:
        mode = os.environ.get("FAKE_MODE", "ok")
        if mode == "mcp-system-writer":
            sys.stdout.write(json.dumps([{
                "name": "files",
                "layer": "system",
                "tools": {"write_file": {"approval_mode": "approve"}},
            }]) + "\\n")
            raise SystemExit(0)
        if mode == "mcp-unreadable":
            sys.stderr.write("not-for-the-message\\n")
            raise SystemExit(1)
        sys.stdout.write("[]\\n")
        raise SystemExit(0)
    mode = os.environ.get("FAKE_MODE", "ok")
    if mode == "sleep":
        time.sleep(60)
        raise SystemExit(0)
    if mode == "ignoreterm":
        pid = os.fork()
        if pid == 0:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            time.sleep(30)
            os._exit(0)
        pidfile = os.environ.get("PIDFILE")
        if pidfile:
            Path(pidfile).write_text(str(pid))
        time.sleep(30)
        raise SystemExit(0)
    if mode in ("background", "background-fail"):
        pid = os.fork()
        if pid == 0:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            time.sleep(30)
            os._exit(0)
        pidfile = os.environ.get("PIDFILE")
        if pidfile:
            Path(pidfile).write_text(str(pid))
        sys.stdout.write(json.dumps({"result": "did the work", "stopReason": "end_turn"}) + "\\n")
        sys.stdout.flush()
        raise SystemExit(0 if mode == "background" else 2)
    if mode == "badjson":
        sys.stdout.write("not json\\n")
        raise SystemExit(0)
    if mode == "badbytes":
        sys.stdout.buffer.write(b"\\xff\\xfe")
        raise SystemExit(0)
    if mode == "badfile" and "--output-last-message" in args:
        out = args[args.index("--output-last-message") + 1]
        Path(out).write_bytes(b"\\xff\\xfe")
        raise SystemExit(0)
    if mode == "error":
        sys.stdout.write(json.dumps({"is_error": True, "result": "x"}) + "\\n")
        raise SystemExit(2)
    if mode == "fail-after-started":
        run_dir = None
        if "--output-last-message" in args:
            run_dir = str(Path(args[args.index("--output-last-message") + 1]).parent)
        elif "--prompt-file" in args:
            run_dir = str(Path(args[args.index("--prompt-file") + 1]).parent)
        status_path = Path(run_dir) / "status.json" if run_dir else None
        deadline = time.time() + 10
        while time.time() < deadline:
            if status_path and status_path.is_file():
                try:
                    data = json.loads(status_path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    data = {}
                if data.get("state") == "started" and data.get("pid"):
                    sys.stdout.write(json.dumps({"is_error": True, "result": "nope"}) + "\\n")
                    raise SystemExit(2)
            time.sleep(0.05)
        sys.stderr.write("status.json was not started\\n")
        raise SystemExit(3)
    if "exec" in args and "--output-last-message" in args:
        out = args[args.index("--output-last-message") + 1]
        Path(out).write_text("final report\\n")
        sys.stdout.write("noise\\n")
        raise SystemExit(0)
    sys.stdout.write(json.dumps({"result": "did the work", "stopReason": "end_turn"}) + "\\n")
""")


def live_group_members(pgid):
    """Process ids in pgid that are not zombies."""
    result = subprocess.run(
        ["ps", "-ax", "-o", "pid=,pgid=,stat="], capture_output=True, text=True)
    found = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 3 or parts[1] != str(pgid):
            continue
        if parts[2].startswith("Z"):
            continue
        found.append(int(parts[0]))
    return found


def child_pids(pid):
    result = subprocess.run(
        ["ps", "-ax", "-o", "pid=,ppid="], capture_output=True, text=True)
    found = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] == str(pid):
            found.append(int(parts[0]))
    return found


def assert_pid_dead(case, pid):
    state = subprocess.run(
        ["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True)
    text = state.stdout.strip()
    if text and not text.startswith("Z"):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        case.fail("process {} was still running ({})".format(pid, text))


def write_fake(directory):
    directory.mkdir(parents=True, exist_ok=True)
    body = "#!" + sys.executable + "\n" + FAKE
    for name in engine.CLIS:
        path = directory / name
        path.write_text(body, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IEXEC)


def bytecode_places():
    """Where a command could leave bytecode for this tool.

    CPython writes __pycache__ beside the source. The interpreter on this
    platform writes a mirror under the user cache instead. Both are checked.
    The paths are computed from this file. None is written into the test.
    """
    places = [TOOL]
    cache = Path.home() / "Library" / "Caches" / "com.apple.python"
    mirrored = cache.joinpath(*TOOL.resolve().parts[1:])
    places.append(mirrored)
    return places


def pyc_files(places):
    found = set()
    for root in places:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix == ".pyc" or path.name == "__pycache__":
                found.add(path)
    return found


class ToolCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.work = self.root / "work"
        self.work.mkdir()
        self.runs = self.root / "runs"
        self.runs.mkdir()
        self.fake = self.root / "bin"
        write_fake(self.fake)

    def tearDown(self):
        self.tmp.cleanup()

    def env(self, **extra):
        env = os.environ.copy()
        env.pop("GIT_EXTERNAL_DIFF", None)
        parts = [str(self.fake), os.path.dirname(sys.executable)]
        git = shutil.which("git")
        if git and extra.pop("with_git", False):
            parts.append(os.path.dirname(git))
        env["PATH"] = os.pathsep.join(parts)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env.update(extra)
        return env

    def invoke(self, args, **extra):
        return subprocess.run(
            [sys.executable, str(SCRIPT)] + args,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=self.env(**extra))

    def assert_failure(self, result, needle):
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn(needle, result.stderr)
        self.assertIn(engine.HELP_COMMAND, result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def args(self, role="builder", cli="codex", model="builder-model", effort="low",
             access=None, task="go", roots=None, extra=None):
        argv = ["run", "--role", role, "--cli", cli, "--model", model]
        if effort is not None:
            argv.extend(["--effort", effort])
        if access:
            argv.extend(["--access", access])
        for root in (roots or [self.work]):
            argv.extend(["--root", str(root)])
        argv.extend(["--runs", str(self.runs)])
        if task is not None:
            argv.extend(["--task", task])
        if extra:
            argv.extend(extra)
        return argv


class HelpTests(ToolCase):
    def test_help_needs_no_configuration_file(self):
        result = self.invoke(["help"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertIn("--root", result.stdout)
        self.assertIn("--unrestricted", result.stdout)
        self.assertNotIn("--env", result.stdout)

    def test_help_flag_answers_before_any_path_is_used(self):
        missing = self.root / "missing" / "nope"
        result = self.invoke(["run", "--help", "--root", str(missing)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("survey", result.stdout)
        self.assertFalse(missing.exists())

    def test_help_lists_every_flag(self):
        for flag in ("--role", "--cli", "--model", "--effort", "--access", "--root",
                     "--runs", "--task", "--task-file", "--context", "--diff",
                     "--timeout", "--dry-run", "--unrestricted", "--run-name",
                     "--help", "-h"):
            self.assertIn(flag, engine.HELP)
        self.assertNotIn("--env", engine.HELP)

    def test_unknown_flag_beside_help_is_refused(self):
        result = self.invoke(["help", "--nope"])
        self.assert_failure(result, "--nope")

    def test_no_command_points_at_help(self):
        result = self.invoke([])
        self.assert_failure(result, "no command")

    def test_commands_write_no_bytecode(self):
        places = bytecode_places()
        before = pyc_files(places)
        env = self.env()
        # The presence of this variable at startup would hide a script that
        # forgot to set the flag before importing. The script has to do it.
        env.pop("PYTHONDONTWRITEBYTECODE", None)

        def run(args):
            return subprocess.run(
                [sys.executable, str(SCRIPT)] + args,
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                env=env)

        run(["help"])
        run(["survey", "--nope"])
        refused = run(self.args(cli="grok", role="reviewer"))
        self.assertEqual(refused.returncode, 1, refused.stderr)
        dry = run(self.args(cli="claude", extra=["--dry-run"]))
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertEqual(pyc_files(places), before)


class FlagTests(ToolCase):
    def test_unknown_flag_is_refused_by_name(self):
        result = self.invoke(["run", "--install"])
        self.assert_failure(result, "--install")
        result = self.invoke(["run", "--env", str(self.root / "c.json")])
        self.assert_failure(result, "--env")

    def test_unknown_command_is_refused_by_name(self):
        result = self.invoke(["dance"])
        self.assert_failure(result, "dance")

    def test_repeated_flag_is_refused_and_root_may_repeat(self):
        result = self.invoke(self.args(extra=["--diff", "--diff", "--dry-run"]))
        self.assert_failure(result, "--diff")
        other = self.root / "other"
        other.mkdir()
        result = self.invoke(self.args(cli="claude", roots=[self.work, other], extra=["--dry-run"]))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_value_that_starts_with_a_dash_is_refused(self):
        result = self.invoke(["run", "--context", "--diff"])
        self.assert_failure(result, "--context")

    def test_equals_form_is_an_unknown_option(self):
        result = self.invoke(["run", "--timeout=5"])
        self.assert_failure(result, "--timeout=5")

    def test_timeout_must_be_a_positive_whole_number(self):
        result = self.invoke(self.args(extra=["--timeout", "0", "--dry-run"]))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("--timeout", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_timeout_rejects_non_ascii_digits_and_values_past_the_bound(self):
        self.assertIn("604800", engine.HELP)
        cases = (
            ("\u00b2", "ASCII digits"),
            ("\uff12", "ASCII digits"),
            ("604801", "outside 1 to 604800"),
            ("", "empty"),
        )
        for raw, needle in cases:
            fresh = self.root / "timeout-runs"
            if fresh.exists():
                shutil.rmtree(fresh)
            fresh.mkdir()
            result = self.invoke(["run", "--role", "builder", "--cli", "claude", "--model", "m",
                               "--root", str(self.work), "--runs", str(fresh), "--task", "go",
                               "--timeout", raw])
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn(needle, result.stderr)
            self.assertIn("0-9", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(list(fresh.iterdir()), [])

    def test_unexpected_argument_is_refused(self):
        result = self.invoke(["survey", "extra"])
        self.assert_failure(result, "extra")

    def test_identity_flags_are_checked(self):
        missing_role = self.invoke(["run", "--cli", "codex", "--model", "m", "--root", str(self.work),
                                 "--runs", str(self.runs), "--task", "go"])
        self.assert_failure(missing_role, "--role")
        bad_effort = self.invoke(self.args(cli="grok", effort="max"))
        self.assertEqual(bad_effort.returncode, 1, bad_effort.stderr)
        self.assertIn("--effort", bad_effort.stderr)
        self.assertEqual(bad_effort.stdout, "")
        writer = self.invoke(self.args(role="reviewer", access="write"))
        self.assertEqual(writer.returncode, 1, writer.stderr)
        self.assertIn("only a builder", writer.stderr)
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_run_name_rules(self):
        bad = self.invoke(self.args(extra=["--run-name", "../x", "--dry-run"]))
        self.assertEqual(bad.returncode, 1, bad.stderr)
        self.assertIn("--run-name", bad.stderr)
        self.assertEqual(list(self.runs.iterdir()), [])
        ok = self.invoke(self.args(cli="claude", extra=["--run-name", "round.1_a", "--dry-run"]))
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertTrue((self.runs / "round.1_a" / "prompt.md").is_file())
        again = self.invoke(self.args(cli="claude", extra=["--run-name", "round.1_a", "--dry-run"]))
        self.assertEqual(again.returncode, 1, again.stderr)
        self.assertIn("already exists", again.stderr)
        self.assertEqual(again.stdout, "")


class PathTests(ToolCase):
    def test_symlink_parent_of_a_missing_file_collapses(self):
        real = self.root / "real"
        real.mkdir()
        link = self.root / "link"
        link.symlink_to(real)
        resolved = engine.canonical("sample", str(link / "missing" / "file"))
        self.assertEqual(resolved, os.path.join(os.path.realpath(str(real)), "missing", "file"))

    def test_parent_through_a_file_or_a_missing_component_is_refused(self):
        regular = self.work / "regular-file"
        regular.write_text("x", encoding="utf-8")
        through_file = os.path.join(str(self.work), "regular-file", "..", "x")
        through_missing = os.path.join(str(self.work), "missing", "..", "x")
        missing_tail = os.path.join(str(self.work), "missing", "x")
        allowed = engine.canonical("sample", missing_tail)
        self.assertEqual(allowed, os.path.join(os.path.realpath(str(self.work)), "missing", "x"))
        with self.assertRaises(engine.RunnerError) as caught:
            engine.canonical("sample", through_file)
        self.assertIn("not a directory", str(caught.exception))
        with self.assertRaises(engine.RunnerError) as caught:
            engine.canonical("sample", through_missing)
        self.assertIn("does not exist", str(caught.exception))
        fresh = self.root / "path-runs"
        fresh.mkdir()
        spells = (
            ("--task-file", through_file, "not a directory"),
            ("--task-file", through_missing, "does not exist"),
            ("--context", through_file, "not a directory"),
            ("--context", through_missing, "does not exist"),
            ("--root", through_file, "not a directory"),
            ("--root", through_missing, "does not exist"),
        )
        for flag, raw, needle in spells:
            if fresh.exists():
                shutil.rmtree(fresh)
            fresh.mkdir()
            argv = ["run", "--role", "builder", "--cli", "claude", "--model", "m",
                    "--runs", str(fresh), "--task", "go"]
            if flag == "--root":
                argv.extend(["--root", raw])
            elif flag == "--task-file":
                argv.extend(["--root", str(self.work), "--task-file", raw])
                argv = [item for item in argv if item != "--task" and item != "go"]
            else:
                argv.extend(["--root", str(self.work), "--context", raw])
            result = self.invoke(argv)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn(needle, result.stderr)
            self.assertIn(flag, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(list(fresh.iterdir()), [], flag)

    def test_symlink_then_dotdot_follows_the_target(self):
        nested = self.root / "nested"
        nested.mkdir()
        real = nested / "real"
        real.mkdir()
        link = self.root / "link"
        link.symlink_to(real)
        marker = nested / "marker.txt"
        marker.write_text("here", encoding="utf-8")
        spelled = str(link / ".." / "marker.txt")
        resolved = engine.canonical("sample", spelled)
        self.assertEqual(resolved, os.path.realpath(str(marker)))
        self.assertEqual(os.path.dirname(resolved), os.path.realpath(str(nested)))
        self.assertNotEqual(os.path.realpath(os.path.dirname(os.path.normpath(spelled))), os.path.dirname(resolved))
        relative = self.root / "relative-link"
        relative.symlink_to(os.path.join("nested", "real"))
        relative_spelled = str(relative / ".." / "marker.txt")
        self.assertEqual(engine.canonical("sample", relative_spelled), os.path.realpath(str(marker)))
        through_dir = self.root / "through-dir"
        through_dir.symlink_to(os.path.join("nested", "real", "..", "marker.txt"))
        self.assertEqual(engine.canonical("sample", str(through_dir)), os.path.realpath(str(marker)))

    def test_broken_symlink_is_refused(self):
        broken = self.root / "broken"
        broken.symlink_to(self.root / "no-such")
        with self.assertRaises(engine.RunnerError):
            engine.canonical("sample", str(broken / "file"))

    def test_symlink_target_traversal_is_refused_for_each_flag(self):
        base = self.root / "tree"
        real = base / "realdir"
        real.mkdir(parents=True)
        brief = base / "brief.md"
        brief.write_text("secret brief", encoding="utf-8")
        regular = base / "regular-file"
        regular.write_text("x", encoding="utf-8")
        link_missing = base / "link-missing"
        link_missing.symlink_to(os.path.join("missing", "..", "brief.md"))
        link_file = base / "link-file"
        link_file.symlink_to(os.path.join("regular-file", "..", "brief.md"))
        link_root_missing = base / "link-root-missing"
        link_root_missing.symlink_to(os.path.join("missing", "..", "realdir"))
        link_root_file = base / "link-root-file"
        link_root_file.symlink_to(os.path.join("regular-file", "..", "realdir"))
        with self.assertRaises(OSError):
            open(link_missing, "rb").read()
        with self.assertRaises(engine.RunnerError) as caught:
            engine.canonical("--task-file", str(link_missing))
        self.assertIn("does not exist", str(caught.exception))
        plain = base / "plain-link"
        plain.symlink_to(brief)
        self.assertEqual(engine.canonical("--task-file", str(plain)), os.path.realpath(str(brief)))
        spells = (
            ("--task-file", str(link_missing), "does not exist"),
            ("--task-file", str(link_file), "not a directory"),
            ("--context", str(link_missing), "does not exist"),
            ("--context", str(link_file), "not a directory"),
            ("--root", str(link_root_missing), "does not exist"),
            ("--root", str(link_root_file), "not a directory"),
        )
        fresh = self.root / "link-runs"
        for flag, raw, needle in spells:
            if fresh.exists():
                shutil.rmtree(fresh)
            fresh.mkdir()
            argv = ["run", "--role", "builder", "--cli", "claude", "--model", "m",
                    "--runs", str(fresh), "--task", "go"]
            if flag == "--root":
                argv.extend(["--root", raw])
            elif flag == "--task-file":
                argv.extend(["--root", str(self.work), "--task-file", raw])
                argv = [item for item in argv if item != "--task" and item != "go"]
            else:
                argv.extend(["--root", str(self.work), "--context", raw])
            result = self.invoke(argv)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn(needle, result.stderr)
            self.assertIn(flag, result.stderr)
            self.assertNotIn("secret brief", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(list(fresh.iterdir()), [], flag)

    def test_trailing_slash_or_dot_requires_a_directory(self):
        brief = self.work / "brief.md"
        brief.write_text("secret brief", encoding="utf-8")
        for spelling in (str(brief) + os.sep, os.path.join(str(brief), ".")):
            for label in ("--task-file", "--context", "--root"):
                with self.assertRaises(engine.RunnerError) as caught:
                    engine.canonical(label, spelling)
                self.assertIn("requires a directory", str(caught.exception))
        directory = self.work
        for spelling in (str(directory) + os.sep, os.path.join(str(directory), ".")):
            self.assertEqual(
                engine.canonical("--root", spelling), os.path.realpath(str(directory)))
        link = self.root / "dir-link"
        link.symlink_to(directory)
        self.assertEqual(
            engine.canonical("--root", str(link) + os.sep), os.path.realpath(str(directory)))
        file_link = self.root / "file-link"
        file_link.symlink_to(brief)
        with self.assertRaises(engine.RunnerError) as caught:
            engine.canonical("--task-file", str(file_link) + os.sep)
        self.assertIn("requires a directory", str(caught.exception))
        fresh = self.root / "slash-runs"
        spells = (
            ("--task-file", str(brief) + os.sep),
            ("--task-file", os.path.join(str(brief), ".")),
            ("--context", str(brief) + os.sep),
            ("--context", os.path.join(str(brief), ".")),
            ("--root", str(brief) + os.sep),
            ("--root", os.path.join(str(brief), ".")),
        )
        for flag, raw in spells:
            if fresh.exists():
                shutil.rmtree(fresh)
            fresh.mkdir()
            argv = ["run", "--role", "builder", "--cli", "claude", "--model", "m",
                    "--runs", str(fresh), "--task", "go"]
            if flag == "--root":
                argv.extend(["--root", raw])
            elif flag == "--task-file":
                argv.extend(["--root", str(self.work), "--task-file", raw])
                argv = [item for item in argv if item != "--task" and item != "go"]
            else:
                argv.extend(["--root", str(self.work), "--context", raw])
            result = self.invoke(argv)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn("requires a directory", result.stderr)
            self.assertIn(flag, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(list(fresh.iterdir()), [], flag)
        kept = self.invoke(self.args(
            cli="claude", roots=[str(self.work) + os.sep], extra=["--dry-run"]))
        self.assertEqual(kept.returncode, 0, kept.stderr)
        self.assertIn(os.path.realpath(str(self.work)), json.loads(kept.stdout)["roots"])

    def test_runs_inside_the_tool_is_refused(self):
        link = self.root / "tool-link"
        link.symlink_to(engine.TOOL_DIR)
        result = self.invoke(self.args(extra=["--runs", str(link / "out"), "--dry-run"]))
        # args() already passed --runs self.runs, then extra overrides? No, extra appends a second --runs.
        # The parser refuses a repeated --runs. Build the command without the helper's runs.
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(link / "out"),
                           "--task", "go", "--dry-run"])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("this tool directory", result.stderr)

    def test_builder_root_inside_the_tool_is_refused(self):
        result = self.invoke(["survey", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(TOOL)])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("this tool directory", result.stderr)

    def test_relative_runs_path_is_refused(self):
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", "runs", "--task", "go"])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("absolute", result.stderr)

    def test_resolved_root_is_what_the_command_uses(self):
        real = self.root / "real-root"
        real.mkdir()
        link = self.root / "root-link"
        link.symlink_to(real)
        result = self.invoke(self.args(roots=[link], extra=["--unrestricted", "--dry-run"]))
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        real_path = os.path.realpath(str(real))
        self.assertIn(real_path, payload["argv"])
        self.assertNotIn(str(link), payload["argv"])
        self.assertIn(real_path, payload["roots"])
        prompt = Path(payload["prompt_path"]).read_text(encoding="utf-8")
        self.assertIn(real_path, prompt)

    def test_plugin_root_blocks_runs_and_a_builder_root(self):
        plugin = self.root / "plugin"
        family = plugin / "tools"
        tool = family / "Runner"
        (tool / "scripts").mkdir(parents=True)
        (family / "AGENTS.md").write_text("family\n", encoding="utf-8")
        screen = engine.Screen(str(tool))
        self.assertEqual(screen.plugin_root, os.path.realpath(str(plugin)))
        inside = plugin / "notes"
        inside.mkdir()
        with self.assertRaises(engine.RunnerError) as caught:
            screen.runs_dir(str(inside))
        self.assertIn("plugin root", str(caught.exception))
        with self.assertRaises(engine.RunnerError) as caught:
            screen.runs_dir(str(self.root))
        self.assertIn("contains the plugin root", str(caught.exception))
        with self.assertRaises(engine.RunnerError) as caught:
            screen.root_dir(str(inside), protect=True)
        self.assertIn("plugin root", str(caught.exception))
        with self.assertRaises(engine.RunnerError) as caught:
            screen.root_dir(str(plugin), protect=True)
        self.assertIn("tool directory", str(caught.exception))
        allowed = screen.root_dir(str(plugin), protect=False)
        self.assertEqual(allowed, os.path.realpath(str(plugin)))
        beside = self.root / "beside"
        beside.mkdir()
        self.assertEqual(screen.runs_dir(str(beside)), os.path.realpath(str(beside)))
        # A copy outside the installed layout has no plugin root, wherever this suite runs.
        lone = self.root / "lone" / "Some Tool"
        lone.mkdir(parents=True)
        self.assertIsNone(engine.find_plugin_root(str(lone)))
        unmarked = self.root / "unmarked" / "tools" / "Some Tool"
        unmarked.mkdir(parents=True)
        self.assertIsNone(engine.find_plugin_root(str(unmarked)))


class BoundaryTests(ToolCase):
    def command(self, cli, access, mode="bounded", role=None, effort="low", roots=None):
        role = role or ("builder" if access == "write" else "reviewer")
        spec = {"cli": cli, "model": "m", "effort": effort, "access": access}
        boundary = engine.boundary_for(cli, access, mode, role)
        self.assertIsNone(boundary.refusal, boundary.refusal)
        base = roots or [str(self.work), str(self.root / "extra")]
        (self.root / "extra").mkdir(exist_ok=True)
        prompt = self.root / "prompt.md"
        prompt.write_text("do it", encoding="utf-8")
        run_dir = self.root / "one-run"
        run_dir.mkdir(exist_ok=True)
        return engine.build_command(cli, spec, boundary, str(prompt), base, str(run_dir), executable=str(self.fake / cli)), boundary

    def test_claude_bounded_reviewer_has_read_tools_and_no_shell(self):
        command, boundary = self.command("claude", "read-only")
        argv = command["argv"]
        tools = argv[argv.index("--tools") + 1].split(",")
        self.assertEqual(tools, ["Read", "Glob", "Grep"])
        self.assertNotIn("Bash", tools)
        self.assertIn("--restricted", argv)
        self.assertIn("--safe-mode", argv)
        self.assertIn("dontAsk", argv)
        self.assertEqual(boundary.kind, engine.VENDOR_PERMISSION)
        self.assertTrue(boundary.stops_writes)
        self.assertTrue(boundary.read_only)
        self.assertNotIn("--dangerously-skip-permissions", argv)

    def test_claude_read_only_builder_uses_the_read_tools(self):
        command, boundary = self.command("claude", "read-only", role="builder")
        argv = command["argv"]
        tools = argv[argv.index("--tools") + 1].split(",")
        self.assertEqual(tools, ["Read", "Glob", "Grep"])
        self.assertIn("dontAsk", argv)
        self.assertTrue(boundary.stops_writes)
        self.assertNotIn("Edit", tools)

    def test_claude_bounded_builder_confines_file_tools_and_omits_the_shell(self):
        command, boundary = self.command("claude", "write", role="builder")
        argv = command["argv"]
        tools = argv[argv.index("--tools") + 1].split(",")
        self.assertEqual(tools, ["Read", "Glob", "Grep", "Edit"])
        self.assertNotIn("Bash", tools)
        self.assertIn("--restricted", argv)
        self.assertIn("--safe-mode", argv)
        self.assertIn("acceptEdits", argv)
        self.assertEqual(argv[argv.index("--permission-prompts") + 1], "none")
        self.assertEqual(boundary.kind, engine.VENDOR_PERMISSION)
        self.assertFalse(boundary.read_only)
        self.assertNotIn("--dangerously-skip-permissions", argv)

    def test_claude_unrestricted_skips_permission_checks(self):
        command, boundary = self.command("claude", "write", mode="unrestricted", role="builder")
        argv = command["argv"]
        self.assertIn("--dangerously-skip-permissions", argv)
        self.assertNotIn("--restricted", argv)
        self.assertNotIn("--safe-mode", argv)
        self.assertEqual(boundary.kind, engine.BOUNDARY_NONE)
        self.assertFalse(boundary.stops_writes)

    def test_claude_isolation_on_both_modes(self):
        for mode in ("bounded", "unrestricted"):
            command, _boundary = self.command("claude", "write", mode=mode, role="builder")
            argv = command["argv"]
            self.assertIn("--no-session-persistence", argv)
            self.assertIn("--disable-slash-commands", argv)
            self.assertIn("--strict-mcp-config", argv)
            self.assertEqual(argv[argv.index("--mcp-config") + 1], engine.CLAUDE_MCP)
            self.assertEqual(argv[argv.index("--setting-sources") + 1], "")
            settings = json.loads(argv[argv.index("--settings") + 1])
            self.assertIs(settings["autoMemoryEnabled"], False)
            self.assertIs(settings["disableAllHooks"], True)
            self.assertIsNone(command["env"]["CLAUDECODE"])
            self.assertEqual(command["env"]["CLAUDE_CONFIG_DIR"], str(Path.home() / ".claude"))
            merged = engine.apply_env(command["env"], {"CLAUDECODE": "1", "OTHER": "kept"})
            self.assertNotIn("CLAUDECODE", merged)
            self.assertEqual(merged["OTHER"], "kept")

    def test_claude_adds_extra_roots_and_uses_the_primary_as_cwd(self):
        command, _boundary = self.command("claude", "read-only")
        argv = command["argv"]
        self.assertEqual(command["cwd"], str(self.work))
        self.assertEqual(argv[argv.index("--add-dir") + 1], str(self.root / "extra"))
        self.assertEqual(command["stdin"], b"do it")

    def test_codex_bounded_read_only_is_refused_and_not_called_read_only(self):
        fresh = self.root / "codex-read-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "reviewer", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(fresh), "--task", "look",
                           "--dry-run"])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("A bounded codex run is refused", result.stderr)
        self.assertIn("effective configuration", result.stderr)
        self.assertIn("claude", result.stderr)
        self.assertNotIn("Refusing to call it read-only", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])
        survey = self.invoke(["survey", "--role", "reviewer", "--cli", "codex", "--model", "m",
                           "--root", str(self.work)])
        self.assertEqual(survey.returncode, 0, survey.stderr)
        role = json.loads(survey.stdout)["role"]
        self.assertIn("effective configuration", role["refusal"])
        self.assertFalse(role["read_only"])
        self.assertFalse(role["stops_writes"])
        self.assertIsNone(role["boundary_kind"])
        self.assertEqual(role["enforcement_flags"], [])
        self.assertEqual(role["directory_flags"], [])

    def test_codex_system_layer_writer_is_refused(self):
        fresh = self.root / "codex-writer-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--access", "write", "--root", str(self.work), "--runs", str(fresh),
                           "--task", "go"], FAKE_MODE="mcp-system-writer")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn('MCP server "files"', result.stderr)
        self.assertIn("at the system layer", result.stderr)
        self.assertIn('approval_mode "approve"', result.stderr)
        self.assertIn("write_file", result.stderr)
        self.assertIn("--ignore-user-config", result.stderr)
        self.assertIn("A bounded codex run is refused", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])
        reviewer = self.invoke(["run", "--role", "reviewer", "--cli", "codex", "--model", "m",
                             "--root", str(self.work), "--runs", str(fresh), "--task", "look"],
                            FAKE_MODE="mcp-system-writer")
        self.assertEqual(reviewer.returncode, 1, reviewer.stderr)
        self.assertIn("at the system layer", reviewer.stderr)
        self.assertNotIn("Refusing to call it read-only", reviewer.stderr)
        self.assertEqual(list(fresh.iterdir()), [])
        survey = self.invoke(["survey", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work)], FAKE_MODE="mcp-system-writer")
        self.assertEqual(survey.returncode, 0, survey.stderr)
        role = json.loads(survey.stdout)["role"]
        self.assertIn('MCP server "files"', role["refusal"])
        self.assertIn("at the system layer", role["refusal"])
        self.assertIn('approval_mode "approve"', role["refusal"])
        self.assertFalse(role["read_only"])

    def test_codex_listing_that_cannot_be_read_is_refused(self):
        fresh = self.root / "codex-unread-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(fresh), "--task", "go"],
                          FAKE_MODE="mcp-unreadable")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("could not be read", result.stderr)
        self.assertIn("exited 1", result.stderr)
        self.assertIn("A bounded codex run is refused", result.stderr)
        self.assertNotIn("not-for-the-message", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_codex_project_config_approve_is_refused(self):
        nested = self.work / ".codex"
        nested.mkdir()
        (nested / "config.toml").write_text(
            '[mcp_servers.files]\ncommand = "writer"\napproval_mode = "approve"\n',
            encoding="utf-8")
        fresh = self.root / "codex-project-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(fresh), "--task", "go"])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("config.toml", result.stderr)
        self.assertIn("an MCP server", result.stderr)
        self.assertIn('approval_mode "approve"', result.stderr)
        self.assertIn("--ignore-user-config does not drop this file", result.stderr)
        self.assertNotIn("writer", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_codex_unrestricted_bypasses_the_sandbox(self):
        command, boundary = self.command("codex", "write", mode="unrestricted", role="builder", effort=None)
        argv = command["argv"]
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertNotIn("--sandbox", argv)
        self.assertNotIn("--ignore-user-config", argv)
        self.assertNotIn("model_reasoning_effort", " ".join(argv))
        self.assertEqual(boundary.kind, engine.BOUNDARY_NONE)

    def test_grok_bounded_reviewer_is_refused_and_names_the_literal_list(self):
        boundary = engine.boundary_for("grok", "read-only", "bounded", "reviewer")
        self.assertIsNotNone(boundary.refusal)
        self.assertIn("read_file,glob,grep,list_dir", boundary.refusal)
        self.assertNotIn("read_file,glob,grep,list_dir", boundary.flags)
        self.assertIn("not a boundary", boundary.refusal)
        self.assertIn("codex", boundary.refusal)
        self.assertIn("claude", boundary.refusal)
        self.assertIsNone(boundary.kind)
        self.assertFalse(boundary.stops_writes)

    def test_grok_bounded_builder_is_refused_and_names_alternatives(self):
        boundary = engine.boundary_for("grok", "write", "bounded", "builder")
        self.assertIsNotNone(boundary.refusal)
        self.assertIn("--unrestricted", boundary.refusal)
        self.assertIn("codex", boundary.refusal)
        self.assertIn("claude", boundary.refusal)
        self.assertIsNone(boundary.kind)

    def test_grok_unrestricted_uses_bypass(self):
        command, boundary = self.command("grok", "write", mode="unrestricted", role="builder")
        argv = command["argv"]
        self.assertIn("bypassPermissions", argv)
        self.assertNotIn("dontAsk", argv)
        self.assertEqual(boundary.kind, engine.BOUNDARY_NONE)

    def test_unrestricted_reviewer_is_refused(self):
        boundary = engine.boundary_for("codex", "read-only", "unrestricted", "reviewer")
        self.assertIn("--unrestricted", boundary.refusal)
        self.assertIn("builder", boundary.refusal)


class ParseTests(unittest.TestCase):
    def test_parse_output(self):
        self.assertEqual(engine.parse_output("claude", json.dumps({"result": "ok", "stopReason": "end_turn"})),
                         ("ok", "completed"))
        self.assertEqual(engine.parse_output("grok", json.dumps({"text": "ok", "stopReason": "max_tokens"}))[1],
                         "incomplete")
        self.assertEqual(engine.parse_output("claude", json.dumps({"is_error": True, "result": "x"}))[1], "failed")
        self.assertEqual(engine.parse_output("claude", "not json")[1], "invalid-output")
        with tempfile.TemporaryDirectory() as tmp:
            last = Path(tmp) / "last.md"
            last.write_text("final")
            self.assertEqual(engine.parse_output("codex", "", str(last)), ("final", "completed"))
            self.assertEqual(engine.parse_output("codex", "", str(Path(tmp) / "none.md"))[1], "invalid-output")
            bad = Path(tmp) / "bad.md"
            bad.write_bytes(b"\xff\xfe")
            report, state = engine.parse_output("codex", "", str(bad))
            self.assertEqual(state, "invalid-output")
            self.assertEqual(report, "")

    def test_same_second_run_folders_get_a_suffix(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = engine.new_run_dir("20261010-120000", "reviewer", "codex", tmp)
            second = engine.new_run_dir("20261010-120000", "reviewer", "codex", tmp)
            self.assertEqual(os.path.basename(first), "20261010-120000-reviewer-codex")
            self.assertEqual(os.path.basename(second), "20261010-120000-reviewer-codex-2")
            self.assertTrue(os.path.isdir(first) and os.path.isdir(second))


class RunTests(ToolCase):
    def test_attachment_at_the_limit_is_kept_and_one_byte_over_is_refused(self):
        context = self.root / "notes.txt"
        context.write_bytes(b"x" * engine.MAX_ATTACHMENT_BYTES)
        result = self.invoke(self.args(cli="claude", extra=["--context", str(context), "--dry-run"]))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("x", Path(json.loads(result.stdout)["prompt_path"]).read_text(encoding="utf-8"))
        context.write_bytes(b"x" * (engine.MAX_ATTACHMENT_BYTES + 1))
        context.chmod(0)
        try:
            refused = self.invoke(self.args(extra=["--context", str(context), "--dry-run"]))
        finally:
            context.chmod(0o644)
        self.assertEqual(refused.returncode, 1, refused.stderr)
        self.assertEqual(refused.stdout, "")
        self.assertIn("200000", refused.stderr)
        self.assertNotIn("could not be read", refused.stderr)
        self.assertNotIn("Traceback", refused.stderr)
        self.assertEqual(len(list(self.runs.iterdir())), 1)

    def test_over_limit_is_measured_before_the_file_is_read(self):
        context = self.root / "notes.txt"
        context.write_bytes(b"y" * (engine.MAX_ATTACHMENT_BYTES + 1))
        screen = engine.Screen()
        opened = []
        original = builtins.open

        def guard(file, *args, **kwargs):
            if os.fspath(file) == str(context):
                opened.append(os.fspath(file))
            return original(file, *args, **kwargs)

        builtins.open = guard
        try:
            with self.assertRaises(engine.RunnerError) as caught:
                engine.read_contexts(screen, [str(context)])
        finally:
            builtins.open = original
        self.assertEqual(opened, [])
        self.assertIn("200000", str(caught.exception))

    def test_over_limit_creates_nothing_when_it_is_the_first_call(self):
        context = self.root / "notes.txt"
        context.write_bytes(b"y" * (engine.MAX_ATTACHMENT_BYTES + 1))
        fresh = self.root / "fresh-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(fresh),
                           "--task", "go", "--context", str(context)])
        self.assertEqual(result.returncode, 1)
        self.assertIn(str(engine.MAX_ATTACHMENT_BYTES), result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_task_file_and_attachment_that_are_not_utf8_are_refusals(self):
        task = self.root / "task.md"
        task.write_bytes(b"hello \xff")
        fresh = self.root / "empty-runs"
        fresh.mkdir()
        result = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--root", str(self.work), "--runs", str(fresh),
                           "--task-file", str(task)])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("UTF-8", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])
        attachment = self.root / "note.txt"
        attachment.write_bytes(b"note \xff")
        result = self.invoke(self.args(extra=["--context", str(attachment), "--dry-run"]))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("UTF-8", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_dry_run_assembles_the_prompt_and_does_not_start_the_vendor(self):
        context = self.root / "notes.txt"
        context.write_text("context here", encoding="utf-8")
        marker = self.root / "argv.txt"
        result = self.invoke(self.args(role="adversarial_reviewer", cli="claude", model="review-model",
                                    effort="high", task="check it",
                                    extra=["--context", str(context), "--diff", "--dry-run"]),
                          ARGVFILE=str(marker), with_git=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertFalse(marker.exists())
        payload = json.loads(result.stdout)
        self.assertEqual(payload["state"], "dry-run")
        self.assertFalse(payload["delegate_started"])
        self.assertIsNone(payload["pid"])
        self.assertEqual(payload["mode"], "bounded")
        self.assertEqual(payload["cli"], "claude")
        self.assertEqual(payload["boundary_kind"], engine.VENDOR_PERMISSION)
        self.assertTrue(payload["read_only"])
        self.assertTrue(payload["stops_writes"])
        tools = payload["argv"][payload["argv"].index("--tools") + 1]
        self.assertEqual(tools, "Read,Glob,Grep")
        self.assertNotIn("Bash", tools.split(","))
        prompt = Path(payload["prompt_path"]).read_text(encoding="utf-8")
        self.assertIn("ADVERSARIAL REVIEWER sub-agent", prompt)
        self.assertIn("## Task\n\ncheck it", prompt)
        self.assertIn("context here", prompt)
        self.assertIn("not a git repository", prompt)
        self.assertIn("the first is the working directory", prompt)
        self.assertFalse((Path(payload["run_dir"]) / "status.json").exists())

    def test_reviewer_uses_the_reviewer_text_and_the_given_cli(self):
        result = self.invoke(self.args(role="reviewer", cli="claude", model="review-model",
                                    effort="high", task="look", extra=["--dry-run"]))
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["role"], "reviewer")
        self.assertEqual(payload["model"], "review-model")
        self.assertEqual(payload["cli"], "claude")
        prompt = Path(payload["prompt_path"]).read_text(encoding="utf-8")
        self.assertIn("You are the REVIEWER sub-agent", prompt)
        self.assertNotIn("ADVERSARIAL", prompt)

    def test_bounded_is_the_default_and_unrestricted_is_a_flag(self):
        bounded = self.invoke(self.args(cli="claude", extra=["--dry-run"]))
        self.assertEqual(bounded.returncode, 0, bounded.stderr)
        payload = json.loads(bounded.stdout)
        self.assertEqual(payload["mode"], "bounded")
        self.assertIn("--restricted", payload["enforcement_flags"])
        self.assertNotIn("--dangerously-skip-permissions", payload["argv"])
        opened = self.invoke(self.args(extra=["--unrestricted", "--dry-run"]))
        self.assertEqual(opened.returncode, 0, opened.stderr)
        other = json.loads(opened.stdout)
        self.assertEqual(other["mode"], "unrestricted")
        self.assertEqual(other["boundary_kind"], engine.BOUNDARY_NONE)
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", other["argv"])
        fresh = self.root / "codex-default-runs"
        fresh.mkdir()
        refused = self.invoke(["run", "--role", "builder", "--cli", "codex", "--model", "m",
                            "--root", str(self.work), "--runs", str(fresh), "--task", "go",
                            "--dry-run"])
        self.assertEqual(refused.returncode, 1, refused.stderr)
        self.assertEqual(refused.stdout, "")
        self.assertIn("effective configuration", refused.stderr)
        self.assertIn("A bounded codex run is refused", refused.stderr)
        self.assertNotIn("Traceback", refused.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_grok_builder_and_reviewer_bounded_refuse_before_a_run_folder(self):
        fresh = self.root / "empty-runs"
        fresh.mkdir()
        builder = self.invoke(["run", "--role", "builder", "--cli", "grok", "--model", "m",
                            "--root", str(self.work), "--runs", str(fresh), "--task", "go"])
        self.assertEqual(builder.returncode, 1)
        self.assertEqual(builder.stdout, "")
        self.assertIn("no enforced boundary", builder.stderr)
        self.assertIn("--unrestricted", builder.stderr)
        reviewer = self.invoke(["run", "--role", "reviewer", "--cli", "grok", "--model", "m",
                             "--root", str(self.work), "--runs", str(fresh), "--task", "go"])
        self.assertEqual(reviewer.returncode, 1)
        self.assertEqual(reviewer.stdout, "")
        self.assertIn("read_file,glob,grep,list_dir", reviewer.stderr)
        self.assertIn("codex", reviewer.stderr)
        self.assertIn("claude", reviewer.stderr)
        self.assertNotIn("Traceback", reviewer.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_missing_vendor_names_the_presence_check(self):
        env = self.env()
        # The interpreter's own directory can contain the vendor tool. Use an empty directory of this test's own.
        empty = self.root / "empty-path"
        empty.mkdir()
        env["PATH"] = str(empty)
        result = subprocess.run(
            [sys.executable, str(SCRIPT)] + self.args(extra=["--dry-run"]),
            capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertRegex(result.stderr, r"'?codex'? is not on PATH")
        self.assertIn("codex --version", result.stderr)

    def test_missing_git_names_its_check_and_writes_nothing(self):
        fresh = self.root / "no-git-runs"
        fresh.mkdir()
        env = self.env()
        # The interpreter's own directory can contain git. Keep only the stand-ins.
        env["PATH"] = str(self.fake)
        result = subprocess.run(
            [sys.executable, str(SCRIPT)] + ["run", "--role", "builder", "--cli", "codex", "--model", "m",
                                              "--root", str(self.work), "--runs", str(fresh),
                                              "--task", "go", "--diff", "--dry-run"],
            capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("git --version", result.stderr)
        self.assertEqual(list(fresh.iterdir()), [])

    def test_completed_run_writes_the_record_and_names_the_boundary(self):
        task = self.root / "task.md"
        task.write_text("from a file", encoding="utf-8")
        result = self.invoke(self.args(cli="claude", task=None, extra=["--task-file", str(task)]))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertEqual(payload["state"], "completed")
        self.assertTrue(payload["delegate_started"])
        self.assertEqual(payload["mode"], "bounded")
        self.assertEqual(payload["boundary_kind"], engine.VENDOR_PERMISSION)
        self.assertEqual(payload["report"], "did the work")
        self.assertIsInstance(payload["pid"], int)
        self.assertIsInstance(payload["pgid"], int)
        self.assertEqual(payload["pgid"], payload["pid"])
        self.assertTrue(payload["started_at"])
        self.assertIn("--restricted", payload["enforcement_flags"])
        self.assertTrue(payload["limits"])
        run_dir = Path(payload["run_dir"])
        for name in ("prompt.md", "stdout.log", "stderr.log", "report.md", "status.json"):
            self.assertTrue((run_dir / name).is_file(), name)
        stored = json.loads((run_dir / "status.json").read_text(encoding="utf-8"))
        self.assertEqual(stored, payload)

    def test_claude_and_grok_reports_come_from_their_json(self):
        claude = json.loads(self.invoke(self.args(cli="claude")).stdout)
        self.assertEqual(claude["report"], "did the work")
        self.assertEqual(claude["state"], "completed")
        grok = self.invoke(self.args(cli="grok", extra=["--unrestricted"]))
        payload = json.loads(grok.stdout)
        self.assertEqual(payload["report"], "did the work")
        self.assertIn("bypassPermissions", payload["argv"])

    def test_failed_and_invalid_output_leave_status_and_empty_stdout(self):
        bad = self.invoke(self.args(cli="claude", extra=["--run-name", "bad-json"]), FAKE_MODE="badjson")
        self.assertEqual(bad.returncode, 1, bad.stderr)
        self.assertEqual(bad.stdout, "")
        self.assertIn("invalid-output", bad.stderr)
        self.assertIn(str(self.runs / "bad-json"), bad.stderr)
        self.assertNotIn("Traceback", bad.stderr)
        stored = json.loads((self.runs / "bad-json" / "status.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["state"], "invalid-output")
        self.assertTrue(stored["delegate_started"])
        self.assertIsInstance(stored["pid"], int)
        binary = self.invoke(self.args(cli="claude", extra=["--run-name", "bad-bytes"]), FAKE_MODE="badbytes")
        self.assertEqual(binary.returncode, 1, binary.stderr)
        self.assertEqual(binary.stdout, "")
        self.assertNotIn("Traceback", binary.stderr)
        binary_state = json.loads((self.runs / "bad-bytes" / "status.json").read_text(encoding="utf-8"))
        self.assertEqual(binary_state["state"], "invalid-output")
        codex_bad = self.invoke(self.args(extra=["--unrestricted", "--run-name", "bad-file"]), FAKE_MODE="badfile")
        self.assertEqual(codex_bad.returncode, 1, codex_bad.stderr)
        self.assertNotIn("Traceback", codex_bad.stderr)
        self.assertEqual(json.loads((self.runs / "bad-file" / "status.json").read_text(encoding="utf-8"))["state"],
                         "invalid-output")
        failed = self.invoke(self.args(cli="claude", extra=["--run-name", "vendor-failed"]), FAKE_MODE="error")
        self.assertEqual(failed.returncode, 1, failed.stderr)
        self.assertEqual(failed.stdout, "")
        self.assertIn("failed", failed.stderr)
        failed_state = json.loads((self.runs / "vendor-failed" / "status.json").read_text(encoding="utf-8"))
        self.assertEqual(failed_state["state"], "failed")
        self.assertEqual(failed_state["exit_code"], 2)

    def test_a_failure_after_start_saw_the_started_record(self):
        result = self.invoke(self.args(extra=["--unrestricted", "--run-name", "saw-start"]),
                          FAKE_MODE="fail-after-started")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "")
        stored = json.loads((self.runs / "saw-start" / "status.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["state"], "failed")
        self.assertEqual(stored["exit_code"], 2)
        self.assertIsInstance(stored["pid"], int)
        self.assertIsInstance(stored["pgid"], int)
        log = (self.runs / "saw-start" / "stderr.log").read_text(encoding="utf-8")
        self.assertNotIn("was not started", log)

    def test_interrupt_rewrites_status(self):
        proc = subprocess.Popen(
            [sys.executable, str(SCRIPT)] + self.args(cli="claude", extra=["--run-name", "nap", "--timeout", "60"]),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env(FAKE_MODE="sleep"),
            start_new_session=True)
        status = self.runs / "nap" / "status.json"
        deadline = time.time() + 15
        seen = None
        try:
            while time.time() < deadline:
                if status.is_file():
                    try:
                        seen = json.loads(status.read_text(encoding="utf-8"))
                    except (OSError, ValueError):
                        seen = None
                    if seen and seen.get("state") == "started" and seen.get("pid") and seen.get("pgid"):
                        break
                time.sleep(0.05)
            else:
                self.fail("status.json never recorded state started")
            os.kill(proc.pid, signal.SIGINT)
            stdout, stderr = proc.communicate(timeout=20)
        finally:
            if proc.poll() is None:
                os.kill(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
        self.assertEqual(proc.returncode, 1, stderr)
        self.assertEqual(stdout, b"")
        text = stderr.decode("utf-8", "replace")
        self.assertIn("interrupted", text)
        self.assertIn(str(self.runs / "nap"), text)
        self.assertNotIn("Traceback", text)
        final = json.loads(status.read_text(encoding="utf-8"))
        self.assertEqual(final["state"], "interrupted")
        self.assertEqual(final["pid"], seen["pid"])
        self.assertEqual(final["pgid"], seen["pgid"])
        self.assertIsInstance(final["pgid"], int)
        self.assertEqual(final["started_at"], seen["started_at"])

    def _cancel_after_start(self, sig, name):
        pidfile = self.root / (name + ".pid")
        proc = subprocess.Popen(
            [sys.executable, str(SCRIPT)] + self.args(
                cli="claude", extra=["--run-name", name, "--timeout", "60"]),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=self.env(FAKE_MODE="ignoreterm", PIDFILE=str(pidfile)),
            start_new_session=True)
        status = self.runs / name / "status.json"
        deadline = time.time() + 15
        seen = None
        child = None
        try:
            while time.time() < deadline:
                if status.is_file():
                    try:
                        seen = json.loads(status.read_text(encoding="utf-8"))
                    except (OSError, ValueError):
                        seen = None
                if (seen and seen.get("state") == "started" and seen.get("pid")
                        and seen.get("pgid") and pidfile.is_file()):
                    break
                time.sleep(0.05)
            else:
                self.fail("status.json never recorded a started process group")
            child = int(pidfile.read_text(encoding="utf-8"))
            os.kill(proc.pid, sig)
            stdout, stderr = proc.communicate(timeout=20)
        finally:
            if proc.poll() is None:
                os.kill(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
        self.assertEqual(proc.returncode, 1, stderr)
        self.assertEqual(stdout, b"")
        text = stderr.decode("utf-8", "replace")
        self.assertIn("interrupted", text)
        self.assertNotIn("Traceback", text)
        final = json.loads(status.read_text(encoding="utf-8"))
        self.assertEqual(final["state"], "interrupted")
        self.assertEqual(final["pid"], seen["pid"])
        self.assertEqual(final["pgid"], seen["pgid"])
        self.assertIsInstance(final["pgid"], int)
        self.assertNotEqual(final["state"], "started")
        state = subprocess.run(["ps", "-p", str(child), "-o", "stat="], capture_output=True, text=True)
        stat_text = state.stdout.strip()
        if stat_text and not stat_text.startswith("Z"):
            os.kill(child, signal.SIGKILL)
            self.fail("descendant was still running after the grace period ({})".format(stat_text))

    def test_sigterm_after_start_stops_the_group_and_rewrites_status(self):
        self._cancel_after_start(signal.SIGTERM, "term")

    def test_sighup_after_start_stops_the_group_and_rewrites_status(self):
        self._cancel_after_start(signal.SIGHUP, "hup")

    def test_timeout_kills_a_descendant_that_ignores_sigterm(self):
        pidfile = self.root / "child.pid"
        result = self.invoke(self.args(cli="claude", extra=["--timeout", "1", "--run-name", "timed"]),
                          FAKE_MODE="ignoreterm", PIDFILE=str(pidfile))
        pid = None
        try:
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn("timeout", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            stored = json.loads((self.runs / "timed" / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["state"], "timeout")
            self.assertTrue(stored["delegate_started"])
            self.assertGreaterEqual(stored["seconds"], 5)
            self.assertLess(stored["seconds"], 20)
            self.assertTrue(pidfile.is_file())
            pid = int(pidfile.read_text(encoding="utf-8"))
            state = subprocess.run(["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True)
            text = state.stdout.strip()
            if text and not text.startswith("Z"):
                self.fail("descendant was still running after the grace period ({})".format(text))
        finally:
            if pid:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    pid = None
                if pid:
                    os.kill(pid, signal.SIGKILL)

    def test_diff_reports_a_non_zero_git_result(self):
        if shutil.which("git") is None:
            self.skipTest("git is not installed")
        subprocess.run(["git", "init"], cwd=str(self.work), capture_output=True, check=True)
        (self.work / "added.txt").write_text("hello", encoding="utf-8")
        result = self.invoke(self.args(cli="claude", extra=["--diff", "--dry-run"]), with_git=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        prompt = Path(json.loads(result.stdout)["prompt_path"]).read_text(encoding="utf-8")
        self.assertIn("added.txt", prompt)
        self.assertIn("git diff exited", prompt)
        self.assertNotIn("(no diff)", prompt)

    def test_diff_disables_external_helpers_and_optional_locks(self):
        git_dir = self.root / "git-bin"
        git_dir.mkdir()
        git = git_dir / "git"
        git.write_text(textwrap.dedent("""\
            #!{python}
            import json, os, sys
            from pathlib import Path
            marker = os.environ.get("GIT_ARGV")
            if marker:
                with open(marker, "a", encoding="utf-8") as handle:
                    handle.write(json.dumps({{
                        "argv": sys.argv,
                        "external": os.environ.get("GIT_EXTERNAL_DIFF"),
                        "locks": os.environ.get("GIT_OPTIONAL_LOCKS"),
                    }}) + "\\n")
            if "--version" in sys.argv:
                sys.stdout.write("git version 0\\n")
                raise SystemExit(0)
            if "rev-parse" in sys.argv:
                sys.stdout.write("true\\n")
                raise SystemExit(0)
            raise SystemExit(0)
        """).format(python=sys.executable), encoding="utf-8")
        git.chmod(git.stat().st_mode | stat.S_IEXEC)
        marker = self.root / "git-argv.txt"
        env = self.env()
        env["PATH"] = str(git_dir) + os.pathsep + env["PATH"]
        env["GIT_ARGV"] = str(marker)
        env["GIT_EXTERNAL_DIFF"] = "evil-diff"
        env["GIT_CONFIG_PARAMETERS"] = "'diff.external=evil'"
        result = subprocess.run(
            [sys.executable, str(SCRIPT)] + self.args(cli="claude", extra=["--diff", "--dry-run"]),
            capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = [json.loads(line) for line in marker.read_text(encoding="utf-8").splitlines()]
        diff_rows = [row for row in rows if "diff" in row["argv"]]
        self.assertTrue(diff_rows)
        argv = diff_rows[0]["argv"]
        self.assertIn("--no-optional-locks", argv)
        self.assertIn("--no-ext-diff", argv)
        self.assertIn("--no-textconv", argv)
        self.assertIn("core.fsmonitor=", argv)
        self.assertIn("diff.external=", argv)
        for row in rows:
            self.assertIsNone(row["external"])
            self.assertEqual(row["locks"], "0")
        prompt = Path(json.loads(result.stdout)["prompt_path"]).read_text(encoding="utf-8")
        self.assertIn("(no diff)", prompt)

    def test_a_hanging_git_is_reported_as_a_timeout(self):
        git_dir = self.root / "slow-git"
        git_dir.mkdir()
        git = git_dir / "git"
        git.write_text("#!" + sys.executable + "\n" + textwrap.dedent("""\
            import sys, time
            if "--version" in sys.argv:
                sys.stdout.write("git version 0\\n")
                raise SystemExit(0)
            time.sleep(30)
            raise SystemExit(0)
        """), encoding="utf-8")
        git.chmod(git.stat().st_mode | stat.S_IEXEC)
        previous = engine.GIT_TIMEOUT
        engine.GIT_TIMEOUT = 1
        saved = os.environ.get("PATH")
        os.environ["PATH"] = str(git_dir) + os.pathsep + (saved or "")
        try:
            text = engine.git_snapshot([str(self.work)])
        finally:
            engine.GIT_TIMEOUT = previous
            if saved is None:
                os.environ.pop("PATH", None)
            else:
                os.environ["PATH"] = saved
        self.assertIn("timed out", text)
        self.assertNotIn("(no diff)", text)

    def test_survey_reports_versions_boundaries_and_the_refusal(self):
        extra = self.root / "extra"
        extra.mkdir()
        marker = self.root / "argv.txt"
        result = self.invoke(["survey", "--role", "builder", "--cli", "grok", "--model", "m",
                           "--root", str(self.work), "--root", str(extra)],
                          ARGVFILE=str(marker))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertEqual(payload["command"], "survey")
        self.assertEqual(payload["mode"], "bounded")
        for cli in engine.CLIS:
            self.assertTrue(payload["vendors"][cli]["on_path"])
            self.assertIn(cli, payload["vendors"][cli]["version"])
        lines = marker.read_text(encoding="utf-8").splitlines()
        self.assertTrue(lines)
        for line in lines:
            self.assertIn("--version", line)
            self.assertNotIn("--prompt-file", line)
            self.assertNotIn(" exec", line)
        self.assertIn("no enforced boundary", payload["role"]["refusal"])
        self.assertEqual(payload["role"]["directory_flags"], [])

    def test_survey_unrestricted_previews_that_mode(self):
        result = self.invoke(["survey", "--role", "builder", "--cli", "codex", "--model", "m",
                           "--effort", "low", "--root", str(self.work), "--unrestricted"])
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["mode"], "unrestricted")
        self.assertEqual(payload["role"]["boundary_kind"], engine.BOUNDARY_NONE)
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", payload["role"]["enforcement_flags"])
        reviewer = self.invoke(["survey", "--role", "reviewer", "--cli", "codex", "--model", "m",
                             "--root", str(self.work), "--unrestricted"])
        self.assertEqual(reviewer.returncode, 0, reviewer.stderr)
        self.assertIsNotNone(json.loads(reviewer.stdout)["role"]["refusal"])

    def test_model_does_not_enter_the_child_environment(self):
        command, _boundary = BoundaryTests.command(
            self, "codex", "write", mode="unrestricted", role="builder")
        values = " ".join("" if value is None else str(value) for value in command["env"].values())
        self.assertNotIn("builder-model", values)
        self.assertNotIn("m", command["env"].values())

    def _assert_group_stopped(self, pgid, pidfile=None):
        members = live_group_members(pgid)
        if members:
            for member in members:
                try:
                    os.kill(member, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            self.fail("process group {} still had live members {}".format(pgid, members))
        if pidfile is not None and pidfile.is_file():
            assert_pid_dead(self, int(pidfile.read_text(encoding="utf-8")))

    def _background_exit(self, mode, name):
        pidfile = self.root / (name + ".pid")
        result = self.invoke(
            self.args(cli="claude", extra=["--run-name", name, "--timeout", "60"]),
            FAKE_MODE=mode, PIDFILE=str(pidfile))
        return result, pidfile

    def test_completed_run_stops_a_background_child_that_ignores_sigterm(self):
        result, pidfile = self._background_exit("background", "bg-ok")
        try:
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stderr, "")
            payload = json.loads(result.stdout)
            self.assertEqual(payload["state"], "completed")
            self.assertEqual(payload["report"], "did the work")
            self.assertTrue(payload["delegate_started"])
            stored = json.loads((self.runs / "bg-ok" / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["state"], "completed")
            self._assert_group_stopped(stored["pgid"], pidfile)
        finally:
            if pidfile.is_file():
                try:
                    os.kill(int(pidfile.read_text(encoding="utf-8")), signal.SIGKILL)
                except (ProcessLookupError, ValueError, OSError):
                    pass

    def test_failed_run_stops_a_background_child_that_ignores_sigterm(self):
        result, pidfile = self._background_exit("background-fail", "bg-fail")
        try:
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertIn("failed", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            stored = json.loads((self.runs / "bg-fail" / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["state"], "failed")
            self.assertEqual(stored["exit_code"], 2)
            self._assert_group_stopped(stored["pgid"], pidfile)
        finally:
            if pidfile.is_file():
                try:
                    os.kill(int(pidfile.read_text(encoding="utf-8")), signal.SIGKILL)
                except (ProcessLookupError, ValueError, OSError):
                    pass

    def _hook_driver(self, source):
        driver = self.root / "spawn-hook.py"
        driver.write_text(
            "import os, signal, sys\n"
            "sys.dont_write_bytecode = True\n"
            "sys.path.insert(0, os.environ['HOOK_SCRIPTS'])\n"
            "import engine\n"
            + source +
            "engine.after_spawn = hook\n"
            "raise SystemExit(engine.main(sys.argv[1:]))\n",
            encoding="utf-8")
        return driver

    def test_signal_between_spawn_and_publication_stops_the_group(self):
        cases = ((signal.SIGTERM, "SIGTERM", "win-term"),
                 (signal.SIGINT, "SIGINT", "win-int"),
                 (signal.SIGHUP, "SIGHUP", "win-hup"))
        for _sig, signame, name in cases:
            pidfile = self.root / (name + ".pid")
            driver = self._hook_driver(
                "def hook(ctx):\n"
                "    os.kill(os.getpid(), signal.{})\n".format(signame))
            env = self.env(FAKE_MODE="ignoreterm", PIDFILE=str(pidfile))
            env["HOOK_SCRIPTS"] = str(TOOL / "scripts")
            result = subprocess.run(
                [sys.executable, str(driver)] + self.args(
                    cli="claude", extra=["--run-name", name, "--timeout", "30"]),
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                env=env, timeout=30)
            try:
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertIn("interrupted", result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                status = self.runs / name / "status.json"
                self.assertTrue(status.is_file(), "{}: no status.json, so the start was never recorded".format(signame))
                final = json.loads(status.read_text(encoding="utf-8"))
                self.assertEqual(final["state"], "interrupted", signame)
                self.assertTrue(final["delegate_started"])
                self.assertIsInstance(final["pgid"], int)
                self.assertIsInstance(final["pid"], int)
                self._assert_group_stopped(final["pgid"], pidfile)
            finally:
                if pidfile.is_file():
                    try:
                        os.kill(int(pidfile.read_text(encoding="utf-8")), signal.SIGKILL)
                    except (ProcessLookupError, ValueError, OSError):
                        pass

    def test_sigkill_before_publication_leaves_no_live_vendor(self):
        driver = self._hook_driver(
            "def hook(ctx):\n"
            "    os.kill(os.getpid(), signal.SIGSTOP)\n")
        env = self.env(FAKE_MODE="sleep")
        env["HOOK_SCRIPTS"] = str(TOOL / "scripts")
        proc = subprocess.Popen(
            [sys.executable, str(driver)] + self.args(
                cli="claude", extra=["--run-name", "sigkill", "--timeout", "30"]),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
            start_new_session=True)
        children = []
        try:
            deadline = time.time() + 15
            while time.time() < deadline:
                if proc.poll() is not None:
                    err = proc.stderr.read().decode("utf-8", "replace")
                    self.fail("runner exited before publication ({}) {}".format(proc.returncode, err))
                state = subprocess.run(
                    ["ps", "-p", str(proc.pid), "-o", "stat="],
                    capture_output=True, text=True)
                if state.stdout.strip().startswith("T"):
                    break
                time.sleep(0.05)
            else:
                self.fail("runner did not stop between spawn and publication")
            children = child_pids(proc.pid)
            self.assertTrue(children, "the handshake child was not alive in the window")
            os.kill(proc.pid, signal.SIGKILL)
            proc.wait(timeout=5)
            run_dir = self.runs / "sigkill"
            self.assertTrue((run_dir / "prompt.md").is_file())
            self.assertFalse((run_dir / "status.json").exists())
            deadline = time.time() + 5
            while time.time() < deadline:
                if not running_pids(children):
                    break
                time.sleep(0.05)
            else:
                self.fail("a vendor was still alive after the runner was killed")
        finally:
            if proc.poll() is None:
                try:
                    os.kill(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            try:
                proc.communicate(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                pass
            for child in children:
                try:
                    os.kill(child, signal.SIGKILL)
                except ProcessLookupError:
                    pass


def running_pids(pids):
    """Pids that are still running and are not zombies."""
    alive = []
    for pid in pids:
        state = subprocess.run(
            ["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True)
        text = state.stdout.strip()
        if text and not text.startswith("Z"):
            alive.append(pid)
    return alive


if __name__ == "__main__":
    unittest.main()
