import runpy as _runpy
from pathlib import Path as _IsolationPath
_runpy.run_path(str(_IsolationPath(__file__).parent / '../../lib/tests/isolated_home.py'))
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch
from support import TOOL, temporary, still
import capture
import install
import paths
from paths import CaptureError


class ContractTests(unittest.TestCase):
    def test_uninstalled_cli_on_each_interpreter(self):
        interpreters = json.loads(os.environ.get("WISER_TEST_INTERPRETERS", "[]")) or [sys.executable]
        with temporary() as directory:
            root = Path(directory)
            tool = root / "tools" / "Screen Capture"
            tool.parent.mkdir()
            (tool.parent / "AGENTS.md").write_text("# Synthetic install root\n")
            shutil.copytree(TOOL / "scripts", tool / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
            for python in interpreters:
                for command in (["help"], ["--help"]):
                    result = subprocess.run([python, str(tool / "scripts/capture.py")] + command, capture_output=True)
                    self.assertEqual(result.returncode, 0)
                    self.assertIn(b"--region", result.stdout)
                result = subprocess.run([python, str(tool / "scripts/capture.py"), "redact", "--unknown"], capture_output=True)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"--unknown", result.stderr)
            self.assertFalse((tool / ".venv").exists())
            self.assertFalse((root / ".wiser-consent").exists())

    def test_import_has_no_cli_side_effect(self):
        result = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import capture; print('imports=1')",
                                 str(TOOL / "scripts")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "imports=1\n")

    def test_paths_links_aliases_and_reserved_key(self):
        with temporary() as directory:
            root = Path(directory)
            source, box = root / "input.png", None
            still(source)
            tool = root / "tool"
            tool.mkdir()
            alias = root / "alias"
            alias.symlink_to(tool, target_is_directory=True)
            with self.assertRaisesRegex(CaptureError, "inside the tool"):
                paths.screen(str(alias / "new.png"), "--output", tool, True)
            with self.assertRaisesRegex(CaptureError, "already exists"):
                paths.screen(str(source), "--output", tool, True)
            with self.assertRaisesRegex(CaptureError, "absolute"):
                paths.screen("relative.png", "--input", tool)
            key_dir = root / "credentials"
            key_dir.mkdir()
            key = key_dir / "auth-provider.env"
            # Empty stand-in, never reading or copying real credential contents.
            key.touch()
            hard = root / "hard.png"
            os.link(key, hard)
            with patch.object(paths, "config_dir", return_value=key_dir):
                with self.assertRaisesRegex(CaptureError, "connector key"):
                    paths.screen(str(hard), "--input", tool)
                with self.assertRaisesRegex(CaptureError, "credential directory"):
                    paths.screen(str(key_dir / "new.json"), "--report", tool, True)
            loop = root / "loop"
            loop.symlink_to(loop)
            with self.assertRaisesRegex(CaptureError, "cannot be resolved"):
                paths.screen(str(loop / "input.png"), "--input", tool)
            destination = root / "link.png"
            destination.symlink_to(source)
            self.assertEqual(paths.screen(str(destination), "--input", tool), source.resolve())

    def test_closed_flags_values_and_destinations(self):
        with temporary() as directory:
            root = Path(directory)
            source = root / "input.png"
            still(source)
            base = ["redact", "--input", str(source), "--output", str(root / "out.png"), "--report", str(root / "report.json")]
            for extra in (["--fps", "nan"], ["--region", "0,0,0,1"], ["--term", " "], ["--install", "--install"],
                          ["--output", str(root / "second.png")], ["--unknown"], ["--help", "--unknown"]):
                with self.assertRaises(CaptureError):
                    capture.parse(base + extra)
            with self.assertRaises(CaptureError):
                capture.parse(["verify", "--input", str(source), "--report", str(root / "report.json"), "--region", "0,0,10,10"])
            # verify reads every frame as written, so it takes no decode rate.
            with self.assertRaises(CaptureError):
                capture.parse(["verify", "--input", str(source), "--report", str(root / "report.json"), "--fps", "30"])
            with self.assertRaises(CaptureError):
                capture.parse(["redact", "--input", str(source), "--output", str(root / "same.png"), "--report", str(root / "same.png")])

    def test_redact_and_verify_refuse_other_platforms_first(self):
        with temporary() as directory:
            root = Path(directory)
            source = root / "input.png"
            still(source)
            for argv in (["verify", "--input", str(source), "--report", str(root / "report.json")],
                         ["redact", "--input", str(source), "--output", str(root / "out.png"), "--report", str(root / "r.json")]):
                stdout, stderr = io.StringIO(), io.StringIO()
                with patch.object(sys, "platform", "linux"), patch.object(shutil, "which") as which, \
                        patch.object(install, "ensure") as ensure, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    code = capture.main(argv)
                self.assertEqual((code, stdout.getvalue()), (1, ""))
                self.assertIn("macOS is required", stderr.getvalue())
                which.assert_not_called()
                ensure.assert_not_called()

    def test_missing_dependency_before_install(self):
        with temporary() as directory:
            root = Path(directory)
            source = root / "input.png"
            still(source)
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.object(shutil, "which", return_value=None), patch.object(install, "ensure") as ensure, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = capture.main(["verify", "--input", str(source), "--report", str(root / "report.json"), "--install"])
            self.assertEqual(code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("tesseract --version", stderr.getvalue())
            ensure.assert_not_called()

    def test_consent_marker_realpath_and_cache_environment(self):
        with temporary() as directory:
            root = Path(directory)
            tool = root / "tools" / "Screen Capture"
            tool.mkdir(parents=True)
            (root / "tools/AGENTS.md").write_text("# Synthetic root\n")
            with patch.dict(os.environ, {"WISER_ALLOW_INSTALL": "0"}):
                with self.assertRaisesRegex(CaptureError, "packages missing"):
                    install.ensure(tool, False, [])
                (root / ".wiser-consent").write_text(json.dumps({"realpath": str(root / "other")}))
                with self.assertRaisesRegex(CaptureError, "packages missing"):
                    install.ensure(tool, False, [])
            environment = install.install_env(tool / ".venv")
            self.assertEqual(environment["PIP_NO_CACHE_DIR"], "1")
            self.assertEqual(environment["PIP_DISABLE_PIP_VERSION_CHECK"], "1")
            self.assertTrue(environment["PIP_CACHE_DIR"].startswith(str(tool)))
            self.assertTrue(environment["XDG_CACHE_HOME"].startswith(str(tool)))


if __name__ == "__main__":
    unittest.main()
