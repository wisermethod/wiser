"""Offline fixtures only. No model, torch import, download or real installation."""
import runpy as _runpy
from pathlib import Path as _IsolationPath
_runpy.run_path(str(_IsolationPath(__file__).parent / '../../lib/tests/isolated_home.py'))
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "chatterbox_tool.py"
spec = importlib.util.spec_from_file_location("chatterbox_tool", SCRIPT)
cb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cb)


def good_facts():
    return {"os": "Darwin", "os_version": "26.0.1", "machine": "arm64", "chip": "Apple M1",
            "memory_bytes": 4 * 1024 ** 3,
            "interpreter": {"path": "/usr/bin/python3.11", "implementation": "CPython",
                            "version": "3.11.15", "machine": "arm64"}, "ffmpeg": True,
            "environment_free_bytes": cb.REQUIRED_BYTES, "weights_free_bytes": cb.REQUIRED_BYTES}


class SurveyTests(unittest.TestCase):
    def test_supported_without_memory_floor(self):
        for memory in (None, 1, 4 * 1024 ** 3):
            facts = dict(good_facts(), memory_bytes=memory)
            self.assertEqual(cb.assess(facts)["status"], "supported")

    def test_unsupported(self):
        for changed in ({"os": "Linux"}, {"machine": "x86_64"}, {"chip": "Intel Core"},
                        {"ffmpeg": False}, {"os_version": "12.2"},
                        {"weights_free_bytes": cb.REQUIRED_BYTES - 1},
                        {"environment_free_bytes": cb.REQUIRED_BYTES - 1},
                        {"interpreter": {"implementation": "CPython", "version": "3.12.0", "machine": "arm64"}}):
            with self.subTest(changed=changed):
                self.assertEqual(cb.assess(dict(good_facts(), **changed))["status"], "unsupported")

    def test_unknown(self):
        for key in ("os", "os_version", "chip", "machine", "ffmpeg", "environment_free_bytes", "weights_free_bytes"):
            facts = dict(good_facts(), **{key: None})
            self.assertEqual(cb.assess(facts)["status"], "unknown", key)

    def test_warm_use_does_not_require_download_reserve_again(self):
        facts = dict(good_facts(), environment_free_bytes=1024, weights_free_bytes=1024)
        self.assertEqual(cb.assess(facts)["status"], "unsupported")
        self.assertEqual(cb.assess(facts, download=False)["status"], "supported")
        facts["chip"] = "Intel"
        self.assertEqual(cb.assess(facts, download=False)["status"], "unsupported")

    def test_check_no_import_or_write(self):
        for status, facts in (("supported", good_facts()), ("unsupported", dict(good_facts(), ffmpeg=False)),
                              ("unknown", dict(good_facts(), chip=None))):
            with patch.object(cb, "survey", return_value=facts), patch.object(cb, "consent", side_effect=AssertionError), \
                    patch.object(cb, "package_state", side_effect=AssertionError), \
                    patch.object(cb, "load_model", side_effect=AssertionError):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cb.main(["check"]), 0)
                self.assertEqual(json.loads(out.getvalue())["status"], status)
        self.assertNotIn("torch", sys.modules)
        self.assertNotIn("chatterbox", sys.modules)

    def test_install_refused_before_consent_or_subprocess(self):
        for chosen in (False, True):
            for status in ("unsupported", "unknown"):
                with patch.object(cb, "check", return_value={"status": status, "reasons": ["fixture"]}), \
                        patch.object(cb, "consent", side_effect=AssertionError("consent read too soon")), \
                        patch.object(cb.subprocess, "run", side_effect=AssertionError("install attempted")), \
                        patch.dict(os.environ, {"WISER_ALLOW_INSTALL": "1"}):
                    with self.assertRaises(cb.ToolError):
                        cb.install({"--route-chosen": chosen, "--install": True}, Path("/no-download"))
        with patch.object(cb, "check", return_value=cb.assess(good_facts())), \
                patch.object(cb, "consent", side_effect=AssertionError("marker must not establish choice")):
            with self.assertRaisesRegex(cb.ToolError, "--route-chosen"):
                cb.install({"--install": True}, Path("/no-download"))

    def test_marker_cannot_establish_supported_or_choice(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / ".wiser-consent").write_text(json.dumps({"realpath": str(root)}))
            with patch.object(cb, "PLUGIN", root), patch.dict(os.environ, {"WISER_ALLOW_INSTALL": "1"}):
                for status, chosen in (("unknown", True), ("unsupported", True), ("supported", False)):
                    with patch.object(cb, "check", return_value={"status": status, "reasons": []}), \
                            patch.object(cb.subprocess, "run", side_effect=AssertionError):
                        with self.assertRaises(cb.ToolError):
                            cb.install({"--route-chosen": chosen}, root / "models")


class JoinerTests(unittest.TestCase):
    def assert_words(self, text):
        pieces = cb.split_pieces(text)
        expected = cb.PAUSE.sub(" ", text).split()
        actual = [word for p in pieces for word in p["words"]]
        self.assertEqual(actual, expected)
        at = 0
        for p in pieces:
            self.assertLessEqual(len(p["words"]), 35)
            self.assertEqual(p["first_word"], at)
            at += len(p["words"])
            self.assertEqual(p["last_word"], at - 1)
            self.assertEqual(p["seed"], cb.SEED + p["piece"])
        self.assertEqual(pieces[-1]["gap_after_s"], 0)
        return pieces

    def test_short_pause_and_sentence_groups(self):
        p = self.assert_words("Here are your boards. <#0.8#> Pick one. Then we begin.")
        self.assertEqual([x["gap_after_s"] for x in p], [0.5, 0])

    def test_36_word_sentence(self):
        p = self.assert_words(" ".join("word%d" % i for i in range(36)) + ".")
        self.assertEqual([len(x["words"]) for x in p], [35, 1])
        self.assertEqual(p[0]["split"], "word_cap")

    def test_two_30_word_sentences_split_at_sentence(self):
        sentence = " ".join("word%d" % i for i in range(30)) + "."
        p = self.assert_words(sentence + " " + sentence)
        self.assertEqual([len(x["words"]) for x in p], [30, 30])
        self.assertEqual([x["gap_after_s"] for x in p], [0.3, 0])
        self.assertEqual(p[0]["split"], "sentence")

    def test_comma_before_closing_quotes(self):
        for quote in ('"', "'", "\u2019", "\u201d"):
            words = ["word%d" % i for i in range(40)]
            words[20] = "yes," + quote
            p = self.assert_words(" ".join(words) + ".")
            self.assertEqual(len(p[0]["words"]), 21, quote)
            self.assertEqual(p[0]["split"], "comma_cap")

    def test_last_comma_before_cap(self):
        words = ["word%d" % i for i in range(81)]
        words[10] += ","
        words[30] += ","
        p = self.assert_words(" ".join(words) + ".")
        self.assertEqual(len(p[0]["words"]), 31)
        self.assertEqual(p[0]["split"], "comma_cap")

    def test_varied_many_sentences(self):
        self.assert_words(" ".join(" ".join("w%d" % n for n in range(i)) + "." for i in (1, 35, 36, 9, 76)))

    def test_invalid_marks(self):
        for text in ("", "<#0.5#> words", "words <#0.5#>", "one <#bad#> two", "one <#0.5#> <#0.5#> two"):
            with self.assertRaises(cb.ToolError):
                cb.split_pieces(text)


class ArtifactTests(unittest.TestCase):
    def test_stale_interpreter_links_are_retained_outside_active_venv(self):
        with tempfile.TemporaryDirectory() as temp:
            tool = Path(temp)
            venv = tool / ".venv"
            (venv / "bin").mkdir(parents=True)
            (venv / "bin/python3").symlink_to(tool / "moved-python")
            (venv / "retained-package").write_bytes(b"package")
            with patch.object(cb, "TOOL", tool), patch.object(cb, "VENV", venv), \
                    contextlib.redirect_stderr(io.StringIO()):
                retained = cb.retain_unusable_environment()
            self.assertFalse(venv.exists())
            self.assertTrue((retained / "bin/python3").is_symlink())
            self.assertEqual((retained / "retained-package").read_bytes(), b"package")

    def test_install_worker_ignores_caller_import_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            venv = root / ".venv"
            venv.mkdir()
            with patch.object(cb, "VENV", venv), patch.object(cb, "PLUGIN", root), \
                    patch.object(cb, "check", return_value=dict(cb.assess(good_facts()))), \
                    patch.object(cb, "consent", return_value=False), \
                    patch.object(cb, "package_state", return_value={"status": "complete"}), \
                    patch.object(cb.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as run:
                self.assertEqual(cb.install({"--route-chosen": True}, root / "models"), 0)
            args = run.call_args.args[0]
            self.assertIn("-I", args)
            self.assertIn("-c", args)
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / "chatterbox_tool.py").write_text(
                "import json\nfrom pathlib import Path\n"
                "def finish_install(base):\n print(json.dumps({'ok': True})); return 0\n")
            (root / "json.py").write_text("raise RuntimeError('caller module must not import')\n")
            real_args = [sys.executable, *args[1:-2], str(scripts), str(root / "models")]
            isolated = subprocess.run(real_args, cwd=root, capture_output=True, text=True)
            self.assertEqual(isolated.returncode, 0, isolated.stderr)
            self.assertEqual(json.loads(isolated.stdout), {"ok": True})
            control = subprocess.run([a for a in real_args if a != "-I"], cwd=root, capture_output=True)
            self.assertNotEqual(control.returncode, 0)

    def test_package_state_requires_usable_own_interpreter(self):
        with tempfile.TemporaryDirectory() as temp:
            venv = Path(temp) / "venv"
            marker = venv / "lib/python3.11/site-packages/chatterbox/__init__.py"
            marker.parent.mkdir(parents=True)
            marker.touch()
            good = {"path": str(venv / "bin/python3"), "implementation": "CPython", "machine": "arm64",
                    "version": "3.11.15", "prefix": str(venv)}
            with patch.object(cb, "VENV", venv), patch.object(cb, "pins", return_value={}), \
                    patch.object(cb, "read_json", return_value={"files": {}}):
                for facts in (dict(good, version=None), dict(good, machine="x86_64"),
                              dict(good, version="3.12.0"), dict(good, prefix="/foreign")):
                    with patch.object(cb, "inspect_interpreter", return_value=facts):
                        self.assertEqual(cb.package_state()["status"], "incomplete")
                with patch.object(cb, "inspect_interpreter", return_value=good):
                    self.assertEqual(cb.package_state()["status"], "complete")

    def test_weight_install_restarts_and_forces_only_invalid_files(self):
        for already_present in (False, True):
            with tempfile.TemporaryDirectory() as temp:
                base = Path(temp)
                snapshot = base / "snapshot"
                snapshot.mkdir()
                if already_present:
                    (snapshot / "broken").write_bytes(b"incomplete")
                before = {"status": "incomplete", "snapshot": str(snapshot), "invalid_files": ["broken"]}
                after = {"status": "complete", "snapshot": str(snapshot), "invalid_files": []}
                download = unittest.mock.Mock()
                hub = types.SimpleNamespace(hf_hub_download=download)
                # No real package import, loader, consent write or download.
                with patch.dict(sys.modules, {"huggingface_hub": hub}), \
                        patch.object(cb, "weight_state", side_effect=[before, after]), \
                        patch.object(cb, "read_json", return_value={"files": {"broken": {"bytes": 4}}}), \
                        patch.object(cb, "VENV", base), patch.object(cb, "package_state", return_value={"status": "complete"}), \
                        patch.object(cb, "load_model"), patch.object(cb, "check", side_effect=AssertionError("reserve checked twice")), \
                        patch.dict(os.environ, {}, clear=False), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(cb.install_weights(base), 0)
                self.assertEqual(download.call_count, 1)
                self.assertTrue(download.call_args.kwargs["force_download"])
                self.assertEqual(download.call_args.kwargs["revision"], cb.REVISION)

    def test_absent_complete_incomplete_weights(self):
        with tempfile.TemporaryDirectory() as temp:
            base, tool = Path(temp) / "models", Path(temp) / "tool"
            tool.mkdir()
            (tool / "weights.json").write_text(json.dumps({"files": {"model": {"bytes": 4, "sha256":
                "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7"}}}))
            with patch.object(cb, "TOOL", tool):
                self.assertEqual(cb.weight_state(base)["status"], "absent")
                folder = Path(cb.weight_state(base)["snapshot"])
                folder.mkdir(parents=True)
                (folder / "model").write_bytes(b"data")
                self.assertEqual(cb.weight_state(base)["status"], "complete")
                (folder / "model").write_bytes(b"bad!")
                self.assertEqual(cb.weight_state(base)["status"], "incomplete")
                (folder / "model").unlink()
                (folder / "model.incomplete").write_bytes(b"da")
                self.assertEqual(cb.weight_state(base)["status"], "incomplete")

    def test_record_shape_and_trial_boundary(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = {}
            for key in ("--text", "--words", "--reference"):
                paths[key] = root / key[2:]
                paths[key].write_bytes(b"input")
            output = root / "out.wav"
            output.write_bytes(b"output")
            p = {"start_sample": 0, "end_sample": 24000, "first_word": 0, "last_word": 1}
            record = cb.make_record(paths, ["Hello", "there."], [p], 24000, 24000, 4.0, 3.01,
                                    {"chatterbox-tts": "0.1.7"}, output, "trial")
            self.assertEqual(record["trial"]["status"], "refused")
            self.assertEqual(cb.trial_verdict(3, 1)["status"], "accepted")
            self.assertEqual(cb.trial_verdict(30.001, 10)["status"], "refused")
            self.assertEqual(set(record), {"version", "command", "engine", "inputs", "settings", "watermark",
                                           "words", "passages", "layout", "output", "timing", "trial"})
            self.assertEqual(set(record["layout"]), {"version", "sample_rate", "passages"})
            self.assertEqual(record["layout"]["passages"], [p])
            self.assertEqual(record["output"]["sha256"], cb.sha256(output))
            self.assertEqual(record["output"]["bytes"], 6)
            self.assertTrue(record["watermark"]["enabled"])
            self.assertFalse(record["watermark"]["disable_switch"])
            json.dumps(record, allow_nan=False)

    def test_pair_publication_refuses_existing_and_cleans_partial(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            staged, output, record = (root / name for name in ("staged", "take", "record"))
            staged.write_bytes(b"wave")
            record.write_bytes(b"existing")
            with self.assertRaises(FileExistsError):
                cb.publish_pair(staged, output, record, {})
            self.assertFalse(output.exists())
            self.assertEqual(record.read_bytes(), b"existing")

    def test_path_links_and_key(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tool, config = root / "tool", root / "config"
            tool.mkdir()
            config.mkdir()
            key = config / "auth-provider.env"
            key.touch()  # empty fixture, no real credential read
            alias = root / "alias"
            alias.symlink_to(tool, target_is_directory=True)
            hardlink = root / "hardlink"
            os.link(key, hardlink)
            with patch.object(cb, "TOOL", tool), patch.object(cb, "config_dir", return_value=config):
                for p, destination in ((alias / "new.wav", True), (hardlink, False), (key / "child", True)):
                    with self.assertRaises(cb.ToolError):
                        cb.screen(str(p), "fixture", destination)

    def test_inference_missing_packages_never_installs(self):
        with patch.object(cb, "survey", return_value=good_facts()), \
                patch.object(cb, "package_state", return_value={"status": "absent"}), \
                patch.object(cb, "install", side_effect=AssertionError), \
                patch.dict(os.environ, {"WISER_ALLOW_INSTALL": "1"}):
            with self.assertRaises(cb.ToolError):
                cb.run_engine("trial", {}, Path("/models"), ({}, None, [], []))


class CommandTests(unittest.TestCase):
    def test_trial_refuses_text_and_words_before_engine(self):
        for flag in ("--text", "--words"):
            with self.subTest(flag=flag), \
                    patch.object(cb, "inputs", side_effect=AssertionError("inputs opened")), \
                    patch.object(cb, "run_engine", side_effect=AssertionError("model started")), \
                    contextlib.redirect_stdout(io.StringIO()) as out, \
                    contextlib.redirect_stderr(io.StringIO()) as err:
                code = cb.main(["trial", "--reference", "/ref", "--output", "/out.wav", flag, "/input"])
            self.assertEqual(code, 1)
            self.assertEqual(out.getvalue(), "")
            self.assertIn('unknown option or argument "%s"' % flag, err.getvalue())

    def test_shipped_trial_is_exactly_35_plain_english_words(self):
        text = (cb.TOOL / "trial.txt").read_text(encoding="utf-8")
        words = cb.read_json(cb.TOOL / "trial-words.json")
        self.assertEqual(len(words), 35)
        self.assertEqual(words, text.split())
        for word in words:
            self.assertRegex(word, r"\A[A-Za-z]+(?:'[A-Za-z]+)*[,.!?;:]*\Z")
        pieces = cb.split_pieces(text)
        self.assertEqual(len(pieces), 1)
        self.assertEqual(pieces[0]["words"], words)

    def test_trial_uses_shipped_inputs_and_members_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            reference, output = root / "reference.wav", root / "trial.wav"
            reference.write_bytes(b"reference fixture")
            with patch.object(cb, "run_engine", return_value=0) as engine:
                code = cb.main(["trial", "--reference", str(reference), "--output", str(output)])
            self.assertEqual(code, 0)
            command, opts, _, validated = engine.call_args.args
            paths, record, words, pieces = validated
            self.assertEqual(command, "trial")
            self.assertEqual(opts, {"--reference": str(reference), "--output": str(output)})
            self.assertEqual(paths["--text"], cb.TOOL / "trial.txt")
            self.assertEqual(paths["--words"], cb.TOOL / "trial-words.json")
            self.assertEqual(paths["--reference"], reference)
            self.assertEqual(record, Path(str(output) + ".json"))
            self.assertEqual(words, cb.read_json(cb.TOOL / "trial-words.json"))
            self.assertEqual(pieces, cb.split_pieces((cb.TOOL / "trial.txt").read_text()))

    def test_help_on_fresh_copy(self):
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--route-chosen", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_closed_flags_and_duplicate_flags(self):
        for args in (["install", "--bypass"], ["check", "--install"],
                     ["trial", "--route-chosen"], ["check", "--model-cache", "/a", "--model-cache", "/b"]):
            with self.assertRaises(cb.ToolError):
                cb.parse(args)

    def test_no_import_side_effects(self):
        self.assertNotIn("torch", sys.modules)
        self.assertNotIn("chatterbox", sys.modules)


if __name__ == "__main__":
    unittest.main()
