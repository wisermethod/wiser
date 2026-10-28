"""Install consent regressions. Only synthetic homes/copies and mocked installers."""
import runpy as _runpy
from pathlib import Path as _IsolationPath
_runpy.run_path(str(_IsolationPath(__file__).parent / '../../lib/tests/isolated_home.py'))
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import types
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

TOOL = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


import ast

align = load("consent_align", TOOL / "scripts/align.py")
# transcribe.py executes its CLI at module scope. Load its actual stdlib consent
# definitions through AST, without installing, importing engines or running CLI.
script = TOOL / "scripts/transcribe.py"
tree = ast.parse(script.read_text(), filename=str(script))
names = {"trusted_config_dir", "copy_only", "warn_copy_consent", "platform_user_config_dir", "flag_authorised", "marker_grants", "person_marker_grants",
         "write_marker", "write_person_consent", "install_authorised", "write_consent",
         "require_install_consent", "stop", "fail", "install_question", "install_size"}
header = tree.body[:next(i for i, node in enumerate(tree.body) if isinstance(node, ast.Assign))]
selected = [node for node in tree.body if (node in header and isinstance(node, (ast.Import, ast.ImportFrom)))
            or (isinstance(node, ast.FunctionDef) and node.name in names)
            or (isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and (t.id.startswith("INSTALL_") or t.id == "MODEL_QUESTION_SIZES") for t in node.targets))]
transcribe = types.ModuleType("consent_transcribe")
exec(compile(ast.Module(body=selected, type_ignores=[]), str(script), "exec"), transcribe.__dict__)
transcribe.CONSENT_MARKER = ".wiser-consent"
transcribe.model = "base"


class ConsentCases:
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="wiser-consent-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.home = self.root / "home"
        self.home.mkdir()
        self.copy = self.root / "fresh-copy"
        self.tool = self.copy / "tools" / "fixture"
        self.tool.mkdir(parents=True)
        (self.copy / "tools" / "AGENTS.md").write_text("# Synthetic plugin\n")
        environment = patch.dict(os.environ, {"HOME": str(self.home), "USERPROFILE": str(self.home),
                                "XDG_CONFIG_HOME": "", "APPDATA": "", "WISER_ALLOW_INSTALL": "0"})
        environment.start()
        self.addCleanup(environment.stop)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.configure()
        self.marker = self.config_dir() / ".wiser-consent"
        self.copy_marker = self.copy / ".wiser-consent"
        self.valid = {"scope": "person", "date": "2026-10-27", "tool": "fixture"}

    def person(self, data=None, mode=0o600):
        self.marker.parent.mkdir(parents=True, exist_ok=True)
        self.marker.write_text(json.dumps(self.valid if data is None else data))
        self.marker.chmod(mode)

    def denied(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(self.error):
            self.install(False)

    def test_install_question_copy(self):
        self.assertEqual(self.app.INSTALL_ONCE, "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.")
        self.assertEqual(self.app.INSTALL_HELP, "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.")
        self.assertEqual(self.app.INSTALL_COPY_ONLY, 'Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ')
        self.assertEqual(self.app.INSTALL_NOT_SAVED, "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ")
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                self.install(False)
            except self.error as error:
                message = stderr.getvalue() or str(error)
            else:
                self.fail("missing packages must refuse without consent")
        self.assertEqual(stdout.getvalue(), "")
        first, blank, details = message.split("\n", 2)
        self.assertTrue(first.startswith("This Wiser skill needs to download and install "), first)
        self.assertTrue(first.endswith(self.app.INSTALL_ONCE), first)
        purposes = {
            "Transcribe Audio": ("line up known words with the moments they're spoken in a recording" if self.app.__name__ == "consent_align" else "turn your recordings into text without uploading them anywhere"),
            "knowledge-memory": "store and search your knowledge as a connected graph",
            "Chatterbox": "speak your text in your own voice without uploading your recording anywhere",
            "Screen Capture": "capture and record app windows and blank out private details",
        }
        self.assertIn("in order to " + purposes[self.tool_name] + ".", first)
        what, size = {
            "Transcribe Audio": (("the code libraries word timing needs (and the word-timing model, if you don't have it yet)", "380 MB for the model, if it's needed, plus the code libraries")
                                 if self.app.__name__ == "consent_align" else
                                 ("the code libraries speech recognition needs (and the base speech-recognition model, if you don't have it yet)", "145 MB for the model, if it's needed, plus the code libraries")),
            "knowledge-memory": ("the graph database libraries", None),
            "Chatterbox": ("the voice model and the code libraries it needs", "4.6 GB"),
            "Screen Capture": ("Apple's screen libraries for Python and an image library", "100 MB"),
        }[self.tool_name]
        self.assertEqual(first, "This Wiser skill needs to download and install " + what
                         + " on your machine in order to " + purposes[self.tool_name] + "."
                         + (" It's about " + size + "." if size else "") + " " + self.app.INSTALL_ONCE)
        self.assertEqual(blank, "")
        self.assertTrue(details.startswith("Details for the assistant: "), details)

    def test_person_in_fresh_copy(self):
        self.denied()
        self.assertFalse(self.copy_marker.exists())
        self.person()
        with contextlib.redirect_stderr(io.StringIO()):
            self.install(False)
        self.assertFalse(self.copy_marker.exists(), "inherited consent must not write markers")
        self.assertEqual(json.loads(self.marker.read_text()), self.valid)
        self.copy_marker.write_text(json.dumps({"realpath": str(self.root / "old-copy")}))
        with contextlib.redirect_stderr(io.StringIO()):
            self.install(False)

    def test_invalid_person_records(self):
        for record in ({}, [], "broken", {**self.valid, "scope": "copy"},
                       {**self.valid, "tool": ""}, {**self.valid, "tool": 7},
                       {**self.valid, "date": "2026-02-31"}, {**self.valid, "date": "2026-2-03"},
                       {**self.valid, "date": None}, {**self.valid, "date": "0000-01-01"}):
            with self.subTest(record=record):
                self.person(record)
                self.denied()
        for raw in (b"{broken", b"\xff"):
            self.marker.write_bytes(raw)
            self.denied()

    @unittest.skipUnless(os.name == "posix", "POSIX ownership and modes")
    def test_untrusted_person_files(self):
        for mode in (0o620, 0o602, 0o666):
            with self.subTest(mode=oct(mode)):
                self.person(mode=mode)
                self.denied()
        self.person()
        uid = os.getuid()
        with patch.object(self.app.os, "getuid", return_value=uid + 1):
            self.denied()
        self.marker.unlink()
        target = self.root / "linked-marker"
        target.write_text(json.dumps(self.valid))
        target.chmod(0o600)
        self.marker.symlink_to(target)
        self.denied()
        self.marker.unlink()
        self.marker.mkdir()
        self.denied()

    def test_R2_copy_symlink(self):
        target = self.root / "matching-copy-marker"
        target.write_text(json.dumps({"realpath": str(self.copy.resolve())}))
        self.copy_marker.symlink_to(target)
        self.denied()
        self.copy_marker.unlink()
        self.copy_marker.write_bytes(target.read_bytes())
        with contextlib.redirect_stderr(io.StringIO()):
            self.install(False)

    def test_R2_copy_directory(self):
        self.copy_marker.mkdir()
        self.denied()

    def test_R5_no_saved_consent(self):
        self.marker.parent.mkdir(parents=True, mode=0o700)
        self.marker.parent.chmod(0o770)
        self.copy.chmod(0o500)
        output = io.StringIO()
        try:
            with contextlib.redirect_stderr(output):
                self.install(True)
        finally:
            self.copy.chmod(0o700)
        warnings = [line for line in output.getvalue().splitlines()
                    if line.startswith("Wiser will install this")]
        self.assertEqual(warnings, ["Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: the user-config directory is writable by group or others."])
        self.assertFalse(self.copy_marker.exists())
        self.assertFalse(self.marker.exists())

    def test_R5_copy_only_after_success(self):
        self.marker.parent.mkdir(parents=True, mode=0o700)
        self.marker.parent.chmod(0o770)
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            self.install(True)
        self.assertTrue(self.copy_marker.is_file())
        self.assertFalse(self.marker.exists())
        warnings = [line for line in output.getvalue().splitlines()
                    if line.startswith("Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason:")]
        self.assertEqual(warnings, ["Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: the user-config directory is writable by group or others."])

    def test_copy_marker_realpath(self):
        for record in ({"realpath": str(self.root / "other-copy")}, {}, [], "bad"):
            self.copy_marker.write_text(json.dumps(record))
            self.denied()
        self.copy_marker.write_text(json.dumps({"realpath": str(self.copy.resolve())}))
        with contextlib.redirect_stderr(io.StringIO()):
            self.install(False)
        self.assertFalse(self.marker.exists())

    @unittest.skipUnless(os.name == "posix", "POSIX creation modes")
    def test_explicit_writes_both_markers(self):
        previous = os.umask(0o022)
        self.addCleanup(os.umask, previous)
        for explicit in (True, False):
            with self.subTest(explicit=explicit):
                if not explicit:
                    os.environ["WISER_ALLOW_INSTALL"] = "1"
                    self.person(mode=0o666)
                    self.copy_marker.chmod(0o666)
                with contextlib.redirect_stderr(io.StringIO()):
                    self.install(explicit)
                person = json.loads(self.marker.read_text())
                copy = json.loads(self.copy_marker.read_text())
                self.assertEqual(set(person), {"scope", "date", "tool"})
                self.assertEqual(person["scope"], "person")
                self.assertEqual(person["tool"], self.tool_name)
                self.assertEqual(date.fromisoformat(person["date"]).isoformat(), person["date"])
                self.assertEqual(copy, {"realpath": str(self.copy.resolve()),
                                        "date": person["date"], "tool": self.tool_name})
                self.assertEqual(self.marker.stat().st_mode & 0o777, 0o600)
                self.assertEqual(self.copy_marker.stat().st_mode & 0o777, 0o600)
                parent = self.marker.parent
                while parent != self.home:
                    self.assertEqual(parent.stat().st_mode & 0o777, 0o700)
                    parent = parent.parent

    def test_failed_marker_writes_do_not_stop_install(self):
        original = os.open
        for failed in (self.marker, self.copy_marker):
            self.marker.unlink(missing_ok=True)
            self.copy_marker.unlink(missing_ok=True)
            def refuse(path, *args, **kwargs):
                candidate = Path(path)
                if candidate.parent == failed.parent and candidate.name.startswith(failed.name + ".tmp-"):
                    raise PermissionError("synthetic unwritable marker")
                return original(path, *args, **kwargs)
            with self.subTest(failed=failed.name), patch.object(self.app.os, "open", side_effect=refuse), \
                    contextlib.redirect_stderr(io.StringIO()):
                self.install(True)
            other = self.copy_marker if failed == self.marker else self.marker
            self.assertFalse(failed.exists(), "the failed marker must actually remain unwritten")
            self.assertTrue(other.is_file(), "one marker failing must not skip the other")
        with patch.object(Path, "mkdir", side_effect=PermissionError("synthetic unwritable config")), \
                contextlib.redirect_stderr(io.StringIO()):
            # Force a missing config directory without changing a real person's home.
            with patch.dict(os.environ, {"HOME": str(self.root / "missing-home"),
                                         "USERPROFILE": str(self.root / "missing-home")}):
                self.install(True)

    @unittest.skipUnless(os.name == "posix", "POSIX directory trust boundary")
    def test_user_config_directory_trust_and_copy_only_warning(self):
        for kind in ("symlink", "group-writable", "other-owned"):
            with self.subTest(kind=kind):
                self.person()
                directory = self.marker.parent
                directory.chmod(0o700)
                before = self.marker.read_bytes()
                linked = directory.with_name("linked-config-target")
                if kind == "symlink":
                    directory.rename(linked)
                    directory.symlink_to(linked, target_is_directory=True)
                elif kind == "group-writable":
                    directory.chmod(0o770)
                uid = os.getuid()
                output = io.StringIO()
                with contextlib.ExitStack() as stack:
                    if kind == "other-owned":
                        stack.enter_context(patch.object(self.app.os, "getuid", return_value=uid + 1))
                    self.assertFalse(self.app.person_marker_grants())
                    with contextlib.redirect_stderr(output):
                        self.install(True)
                    self.assertEqual(self.marker.read_bytes(), before)
                    self.assertTrue(self.copy_marker.is_file())
                    self.assertRegex(output.getvalue(), r"Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: [^\n]+\n")
                    warning = [line for line in output.getvalue().splitlines() if line.startswith("Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason:")]
                    self.assertEqual(len(warning), 1)
                    reason = {"symlink": "real directory", "group-writable": "writable by group", "other-owned": "owned by another"}[kind]
                    self.assertIn(reason, warning[0])
                    with contextlib.redirect_stderr(io.StringIO()):
                        self.install(False)  # matching copy consent still permits installation
                if kind == "symlink":
                    directory.unlink()
                    linked.rename(directory)
                else:
                    directory.chmod(0o700)

    @unittest.skipUnless(os.name == "posix", "POSIX no-follow marker writes")
    def test_person_marker_symlink_write_leaves_target_untouched(self):
        directory = self.marker.parent
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
        target = self.root / "leave-marker-target-alone"
        target.write_text("untouched")
        self.marker.symlink_to(target)
        self.assertFalse(self.app.person_marker_grants())
        with contextlib.redirect_stderr(io.StringIO()):
            self.install(True)
        self.assertEqual(target.read_text(), "untouched")
        self.assertFalse(self.marker.is_symlink())
        self.assertTrue(self.app.person_marker_grants())

    def test_platform_config_paths(self):
        cases = [("darwin", {}, self.home / "Library/Application Support/wiser"),
                 ("linux", {}, self.home / ".config/wiser"),
                 ("linux", {"XDG_CONFIG_HOME": str(self.home / "xdg")}, self.home / "xdg/wiser"),
                 ("win32", {}, self.home / "AppData/Roaming/wiser"),
                 ("win32", {"APPDATA": str(self.home / "roaming")}, self.home / "roaming/wiser")]
        for platform, env, expected in cases:
            with self.subTest(platform=platform, env=env), patch.object(sys, "platform", platform), \
                    patch.dict(os.environ, dict({"APPDATA": "", "XDG_CONFIG_HOME": ""}, **env)):
                self.assertEqual(self.config_dir(), expected)
                marker = expected / ".wiser-consent"
                marker.parent.mkdir(parents=True, exist_ok=True)
                marker.write_text(json.dumps(self.valid))
                marker.chmod(0o600)
                self.assertTrue(self.app.person_marker_grants())
                if platform == "win32":
                    marker.chmod(0o666)
                    self.assertTrue(self.app.person_marker_grants(), "Windows skips POSIX modes/owner")


class AlignConsentTests(ConsentCases, unittest.TestCase):
    def configure(self):
        self.app = align
        self.tool_name = "Transcribe Audio"
        self.error = align.AlignmentError
        self.config_dir = align.config_dir
        self.stack.enter_context(patch.object(align, "plugin_root", return_value=self.copy))

    def test_library_gate_and_later_weights_gate_name_exact_fetch(self):
        opts = {"--model-cache": str(self.home / "models")}
        with patch.object(align, "CACHE_DIR", self.tool / ".venv"), \
                patch.object(align, "environment_info", return_value={"python": [3, 11], "implementation": "cpython"}):
            with self.assertRaises(align.AlignmentError) as failure:
                align.ensure_environment(opts, [])
        self.assertEqual(str(failure.exception).split("\n")[0],
                         "This Wiser skill needs to download and install the code libraries word timing needs (and the word-timing model, if you don't have it yet) on your machine in order to line up known words with the moments they're spoken in a recording. It's about 380 MB for the model, if it's needed, plus the code libraries. " + align.INSTALL_ONCE)
        for text in ("pypi.org", "files.pythonhosted.org", "download.pytorch.org", str(self.home / "models/alignment-models")):
            self.assertIn(text, str(failure.exception))
        torch = types.SimpleNamespace(hub=types.SimpleNamespace(download_url_to_file=lambda *a: None))
        bundle = types.SimpleNamespace(_path="fixture.pt", get_model=lambda **kw: (_ for _ in ()).throw(align.DownloadNeeded()))
        with self.assertRaises(align.AlignmentError) as failure:
            align.load_model(torch, bundle, self.home / "models", opts)
        self.assertEqual(str(failure.exception).split("\n")[0],
                         "This Wiser skill needs to download and install the word-timing model on your machine in order to line up known words with the moments they're spoken in a recording. It's about 380 MB. " + align.INSTALL_ONCE)
        self.assertNotIn("pypi.org", str(failure.exception))
        self.assertNotIn("code libraries", str(failure.exception))

    def install(self, explicit):
        align.consent({"--install": explicit}, "synthetic packages missing")


class TranscribeConsentTests(ConsentCases, unittest.TestCase):
    def test_weight_download_refusal_states_scope(self):
        # Execute the real weights-only refusal with installed packages simulated;
        # no engine import, browser, installer or download can run in this branch.
        branch = next(node for node in tree.body if isinstance(node, ast.If)
                      and isinstance(node.test, ast.UnaryOp)
                      and isinstance(node.test.operand, ast.Name)
                      and node.test.operand.id == "weights_present")
        def stop(message):
            raise RuntimeError(message)
        for model, size, technical in [("base", "145 MB", "roughly 145MB"),
                                       ("medium", "1.5 GB", "about 1.5GB"),
                                       ("large", "3.1 GB", "about 3.1GB")]:
            state = dict(weights_present=False, install_authorised=lambda: False,
                         model=model, speech_models=self.home / "speech-models",
                         MODEL_SIZES={model: technical}, MODEL_QUESTION_SIZES=transcribe.MODEL_QUESTION_SIZES,
                         install_question=transcribe.install_question, fail=stop)
            with self.subTest(model=model), self.assertRaises(RuntimeError) as failure:
                exec(compile(ast.Module(body=[branch], type_ignores=[]), str(script), "exec"), state)
            message = str(failure.exception)
            self.assertEqual(message.split("\n")[0],
                             "This Wiser skill needs to download and install the " + model
                             + " speech-recognition model on your machine in order to turn your recordings into text without uploading them anywhere. It's about "
                             + size + ". You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.")
            for text in ("openaipublic.azureedge.net", str(state["speech_models"]), technical, "packages are already installed"):
                self.assertIn(text, message)

    def configure(self):
        self.app = transcribe
        self.tool_name = "Transcribe Audio"
        self.error = SystemExit
        self.config_dir = transcribe.platform_user_config_dir
        self.stack.enter_context(patch.object(transcribe, "plugin_root", return_value=self.copy, create=True))
        transcribe.CACHE_DIR = self.tool / ".venv"
        transcribe.model_cache = self.home / "models"

    def install(self, explicit):
        with patch.object(sys, "argv", ["transcribe.py"] + (["--install"] if explicit else [])):
            transcribe.require_install_consent("synthetic transcription")


if __name__ == "__main__":
    unittest.main()
