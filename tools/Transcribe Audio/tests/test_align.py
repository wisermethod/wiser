"""Offline contract tests: standard library, synthetic spans, no model or network."""
import array
import contextlib
import errno
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

TOOL = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("known_word_align", TOOL / "scripts" / "align.py")
align = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(align)


def passage(start=0, end=1000, first=0, last=1):
    return dict(start_sample=start, end_sample=end, first_word=first, last_word=last)


def layout(*passages, rate=1000):
    return dict(version=1, sample_rate=rate, passages=list(passages))


class AlignTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="wiser-align-test-")
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name).resolve()
        self.audio = self.folder / "audio.wav"
        self.audio.touch()
        self.words = self.folder / "words.json"
        self.words.write_text('["Hello,", "world!"]', encoding="utf-8")
        self.output = self.folder / "timings.json"
        self.args = ["--audio", str(self.audio), "--words", str(self.words), "--output", str(self.output)]

    def test_parse_and_language_refusals(self):
        self.assertEqual(align.parse(self.args)["--words"], str(self.words))
        for extra in (["--model", "base"], ["--mystery"], ["--language", "fr"],
                      ["--words", str(self.words)], ["--install", "--install"], ["--layout"]):
            with self.subTest(extra=extra), self.assertRaises(align.AlignmentError):
                align.parse(self.args + extra)
        with self.assertRaisesRegex(align.AlignmentError, "--audio is required"):
            align.parse([])

    def test_normalization_preserves_one_to_one_identity(self):
        words = ['"Hello,"', "don't", "Alice’s", "world!", "'quoted'"]
        original = list(words)
        self.assertEqual(align.normalize_words(words), ["HELLO", "DON'T", "ALICE'S", "WORLD", "QUOTED"])
        self.assertEqual(words, original)

    def test_unsupported_words_are_named_never_filtered(self):
        for word in ("", "123", "R2D2", "café", "Straße", "well-known", "A/B", "C++", "…", "...",
                     "two words", "<emphasis>New</emphasis>", "[pause]", "a.b", "🙂", None):
            with self.subTest(word=word), self.assertRaisesRegex(align.AlignmentError, "index 1"):
                align.normalize_words(["valid", word])
        for words in ([], {}, "Hello"):
            with self.assertRaises(align.AlignmentError):
                align.normalize_words(words)

    def test_layout_accepts_gaps_and_inclusive_word_ranges(self):
        doc = layout(passage(0, 400, 0, 0), passage(700, 1000, 1, 1))
        self.assertEqual(align.validate_layout(doc, 1000, 1000, 2), doc["passages"])
        self.assertEqual(align.validate_layout(None, 1000, 1000, 2), [passage()])

    def test_layout_refuses_invalid_bounds_coverage_types_and_versions(self):
        cases = [layout(passage(), rate=16000), layout(passage(end=1001)), layout(passage(start=-1)),
                 layout(passage(end=0)), layout(passage(first=1)), layout(passage(last=0)),
                 layout(passage(last=2)), layout(), layout(passage(start=False)),
                 layout(passage(end=1000.0)), layout(passage(0, 700, 0, 0), passage(600, 900, 1, 1)),
                 layout(passage(0, 400, 0, 0), passage(500, 900, 0, 1)),
                 dict(version=2, sample_rate=1000, passages=[passage()]),
                 dict(version=True, sample_rate=1000, passages=[passage()]),
                 dict(version=1, sample_rate=1000, passages=[dict(passage(), extra=1)]),
                 dict(version=1, sample_rate=1000, passages=[passage()], extra=1)]
        for doc in cases:
            with self.subTest(doc=doc), self.assertRaises(align.AlignmentError):
                align.validate_layout(doc, 1000, 1000, 2)

    def test_strict_json_refuses_duplicates_nonfinite_and_bad_encoding(self):
        for text in ('{"version":1,"version":2}', '[NaN]', '[Infinity]', '{broken'):
            self.words.write_text(text)
            with self.assertRaisesRegex(align.AlignmentError, "strict JSON"):
                align.read_json(self.words, "--words")

    def test_path_screen_refuses_relative_and_tool_output_through_symlink(self):
        with self.assertRaisesRegex(align.AlignmentError, "absolute"):
            align.screen("relative.json", "--words")
        link = self.folder / "tool-link"
        link.symlink_to(TOOL, target_is_directory=True)
        with self.assertRaisesRegex(align.AlignmentError, "inside this tool"):
            align.screen(str(link / "absent" / "out.json"), "--output", True)
        loop = self.folder / "loop"
        loop.symlink_to(loop)
        with self.assertRaisesRegex(align.AlignmentError, "real path"):
            align.screen(str(loop / "out.json"), "--output", True)

    def test_path_screen_refuses_key_hardlink_without_reading_it(self):
        # Empty synthetic key file, never opened by the screen.
        keydir = self.folder / "config"
        keydir.mkdir()
        key = keydir / "auth-provider.env"
        key.touch()
        alias = self.folder / "alias.json"
        os.link(key, alias)
        with patch.object(align, "config_dir", return_value=keydir), self.assertRaisesRegex(align.AlignmentError, "key file"):
            align.screen(str(alias), "--words")

    def test_bad_input_stops_before_environment_or_model(self):
        layout_file = self.folder / "layout.json"
        layout_file.write_text(json.dumps(layout(passage(end=1001))))
        cases = [(self.args + ["--layout", str(layout_file)], None),
                 (self.args + ["--language", "es"], None),
                 (self.args, '["valid", "42"]')]
        for args, contents in cases:
            if contents:
                self.words.write_text(contents)
            with self.subTest(args=args), patch.object(align, "decode_audio", return_value=(1000, 1000, array.array('f', [0] * 16000))), \
                    patch.object(align, "ensure_environment") as env, patch.object(align, "load_model") as model, \
                    contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(align.main(args), 1)
                self.assertEqual(out.getvalue(), "")
                self.assertTrue(err.getvalue().startswith("Error:"))
                env.assert_not_called()
                model.assert_not_called()
                self.assertFalse(self.output.exists())

    def test_existing_output_is_preserved_before_decode(self):
        self.output.write_text("existing artifact")
        with patch.object(align, "decode_audio") as decode, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(align.main(self.args), 1)
            decode.assert_not_called()
        self.assertEqual(self.output.read_text(), "existing artifact")

    def test_passage_clock_anchor_end_and_repeated_words(self):
        groups = [[SimpleNamespace(start=5, end=8)], [SimpleNamespace(start=10, end=15)]]
        p = passage(24000, 48000)
        timings = align.passage_timings(["Press", "Press!"], groups, p, 24000, 0.1, True)
        self.assertEqual(timings[0], {"text": "Press", "start": 1.0, "end": 1.5})
        self.assertAlmostEqual(timings[1]["start"], 1.7)
        self.assertEqual(timings[1]["end"], 2.0)
        align.validate_output(["Press", "Press!"], timings, 24000, 48000)
        unanchored = align.passage_timings(["Press", "Press!"], groups, p, 24000, 0.1, False)
        self.assertAlmostEqual(unanchored[0]["start"], 1.2)

    def test_ctc_token_count_and_identity_are_enforced(self):
        spans = [SimpleNamespace(token=t, start=i, end=i + 1) for i, t in enumerate([1, 2, 9, 1])]
        groups = align.word_spans(spans, [1, 2, 9, 1], 9)
        self.assertEqual([len(g) for g in groups], [2, 1])
        for targets in ([1, 2], [1, 2, 9, 2]):
            with self.assertRaises(align.AlignmentError):
                align.word_spans(spans, targets, 9)

    def test_output_rejects_nonfinite_reversed_wrong_identity_and_missing(self):
        valid = [{"text": "Hello,", "start": 0.1, "end": 0.3}, {"text": "world!", "start": 0.4, "end": 1.0}]
        align.validate_output(["Hello,", "world!"], valid, 1000, 1000)
        cases = [valid[:1], [dict(valid[0], text="HELLO"), valid[1]],
                 [dict(valid[0], start=-0.1), valid[1]], [valid[0], dict(valid[1], end=1.01)],
                 [dict(valid[0], start=float("nan")), valid[1]],
                 [valid[0], dict(valid[1], end=float("inf"))],
                 [valid[0], dict(valid[1], start=0.05)], [dict(valid[0], start=0.35), valid[1]]]
        for timings in cases:
            with self.assertRaises(align.AlignmentError):
                align.validate_output(["Hello,", "world!"], timings, 1000, 1000)

    def test_output_file_is_word_array_and_never_overwrites(self):
        words = [{"text": "Hello,", "start": 0.0, "end": 0.4}]
        align.write_output(self.output, words)
        self.assertEqual(json.loads(self.output.read_text()), words)
        with self.assertRaises(FileExistsError):
            align.write_output(self.output, [])
        self.assertEqual(json.loads(self.output.read_text()), words)
        self.assertFalse(list(self.folder.glob(".wiser-align-*")))

    def test_publish_without_hard_links_succeeds_and_refuses_a_racing_output(self):
        timings = [{"text": "Hello,", "start": 0.0, "end": 0.4}]
        with patch.object(align.os, "link", side_effect=OSError(errno.ENOTSUP, "no hard links")), \
                patch.object(align, "decode_audio", return_value=(1000, 1000, array.array("f", [0] * 16000))), \
                patch.object(align, "ensure_environment"), patch.object(align, "load_model"), \
                patch.object(align, "infer", return_value=timings), \
                patch.dict(sys.modules, {"torch": SimpleNamespace(), "torchaudio": SimpleNamespace(),
                    "torchaudio.pipelines": SimpleNamespace(WAV2VEC2_ASR_BASE_960H=object())}), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(align.main(self.args), 0)
        self.assertEqual(json.loads(self.output.read_text()), timings)
        self.assertFalse(list(self.folder.glob(".wiser-align-*")))
        # The exclusive-create fallback must also refuse a name that appeared
        # after main's initial existence check.
        with patch.object(align.os, "link", side_effect=OSError(errno.ENOTSUP, "no hard links")), \
                self.assertRaises(FileExistsError):
            align.write_output(self.output, [])
        self.assertEqual(json.loads(self.output.read_text()), timings)

    def test_failed_publish_retains_finished_temporary_and_removes_partial_output(self):
        timings = [{"text": "Hello,", "start": 0.0, "end": 0.4}]
        with patch.object(align.os, "link", side_effect=OSError(errno.ENOTSUP, "no hard links")), \
                patch.object(align.shutil, "copyfileobj", side_effect=OSError("copy failed")), \
                self.assertRaises(OSError):
            align.write_output(self.output, timings)
        self.assertFalse(self.output.exists())
        pending = list(self.folder.glob(".wiser-align-*"))
        self.assertEqual(len(pending), 1)
        self.assertEqual(json.loads(pending[0].read_text()), timings)

    def test_failed_sync_retains_finished_temporary(self):
        timings = [{"text": "Hello,", "start": 0.0, "end": 0.4}]
        with patch.object(align.os, "fsync", side_effect=OSError(errno.EIO, "sync failed")), \
                self.assertRaises(OSError):
            align.write_output(self.output, timings)
        self.assertFalse(self.output.exists())
        pending = list(self.folder.glob(".wiser-align-*"))
        self.assertEqual(len(pending), 1)
        self.assertEqual(json.loads(pending[0].read_text()), timings)

    def test_failed_repair_puts_the_set_aside_weight_back(self):
        weight = self.folder / "alignment-models" / "engine.pth"
        weight.parent.mkdir(parents=True)
        original = b"<html>not a checkpoint</html>"
        weight.write_bytes(original)
        torch = SimpleNamespace(hub=SimpleNamespace(download_url_to_file=Mock()))
        def get_model(**kwargs):
            if not weight.exists():
                raise OSError(errno.ETIMEDOUT, "offline")
            raise RuntimeError("Invalid magic number; corrupt file?")
        bundle = SimpleNamespace(_path=weight.name, get_model=Mock(side_effect=get_model))
        with patch.object(align, "consent"), self.assertRaisesRegex(align.AlignmentError, "--install"):
            align.load_model(torch, bundle, self.folder, {"--install": True})
        self.assertEqual(weight.read_bytes(), original)
        self.assertFalse(list(weight.parent.glob("*.incomplete-*")))

    def test_model_cache_absent_complete_and_incomplete_without_real_engine(self):
        torch = SimpleNamespace(hub=SimpleNamespace(download_url_to_file=Mock()))
        bundle = SimpleNamespace(_path="engine-selected.pth")
        weight = self.folder / "alignment-models" / bundle._path
        def get_model(**kwargs):
            if not weight.exists():
                torch.hub.download_url_to_file("unused", str(weight))
                weight.parent.mkdir(exist_ok=True)
                weight.write_bytes(b"synthetic complete")
            if weight.read_bytes() != b"synthetic complete":
                raise EOFError()
            return "model sentinel"
        bundle.get_model = Mock(side_effect=get_model)
        with patch.object(align, "authorized", return_value=False):
            with self.assertRaisesRegex(align.AlignmentError, "378 MB"):
                align.load_model(torch, bundle, self.folder, {})
        torch.hub.download_url_to_file.assert_not_called()
        weight.parent.mkdir(exist_ok=True)
        weight.write_bytes(b"synthetic partial")
        with patch.object(align, "authorized", return_value=False):
            with self.assertRaisesRegex(align.AlignmentError, "--install"):
                align.load_model(torch, bundle, self.folder, {})
        self.assertEqual(weight.read_bytes(), b"synthetic partial")
        with patch.object(align, "consent") as consent:
            self.assertEqual(align.load_model(torch, bundle, self.folder, {}), "model sentinel")
            consent.assert_called_once()
        self.assertEqual(len(list(weight.parent.glob("*.incomplete-*"))), 1)
        torch.hub.download_url_to_file.reset_mock()
        with patch.object(align, "consent") as consent:
            self.assertEqual(align.load_model(torch, bundle, self.folder, {}), "model sentinel")
            consent.assert_not_called()
            torch.hub.download_url_to_file.assert_not_called()

    def test_ram_or_permission_failure_does_not_authorize_download(self):
        for error in (RuntimeError("out of memory"), RuntimeError("DefaultCPUAllocator: can't allocate memory"),
                      RuntimeError("Could not allocate memory for Tensor SizesAndStrides!"),
                      MemoryError(), OSError(errno.ENOMEM, "allocation failed"), PermissionError("denied")):
            bundle = SimpleNamespace(_path="engine.pth", get_model=Mock(side_effect=error))
            torch = SimpleNamespace(hub=SimpleNamespace(download_url_to_file=Mock()))
            with patch.object(align, "consent") as consent, self.assertRaisesRegex(align.AlignmentError, "no download"):
                align.load_model(torch, bundle, self.folder, {})
            consent.assert_not_called()

    def test_corrupt_checkpoint_requires_consent_and_is_retained_before_download(self):
        for error in (RuntimeError("Invalid magic number; corrupt file?"), ValueError("not a checkpoint")):
            with self.subTest(error=error):
                folder = self.folder / ("cache-" + type(error).__name__)
                weight = folder / "alignment-models" / "engine.pth"
                weight.parent.mkdir(parents=True)
                original = b"<html>not a zip or checkpoint</html>"
                weight.write_bytes(original)
                torch = SimpleNamespace(hub=SimpleNamespace(download_url_to_file=Mock()))
                def get_model(**kwargs):
                    if not weight.exists():
                        torch.hub.download_url_to_file("unused", str(weight))
                        weight.write_bytes(b"synthetic complete")
                    if weight.read_bytes() == original:
                        raise error
                    return "model sentinel"
                bundle = SimpleNamespace(_path=weight.name, get_model=Mock(side_effect=get_model))
                with patch.object(align, "authorized", return_value=False), \
                        self.assertRaisesRegex(align.AlignmentError, "--install"):
                    align.load_model(torch, bundle, folder, {})
                self.assertEqual(weight.read_bytes(), original)
                self.assertFalse(list(weight.parent.glob("*.incomplete-*")))
                torch.hub.download_url_to_file.assert_not_called()
                with patch.object(align, "consent") as consent:
                    self.assertEqual(align.load_model(torch, bundle, folder, {"--install": True}), "model sentinel")
                    consent.assert_called_once()
                torch.hub.download_url_to_file.assert_called_once()
                retained = list(weight.parent.glob("*.incomplete-*"))
                self.assertEqual(len(retained), 1)
                self.assertEqual(retained[0].read_bytes(), original)
                self.assertEqual(weight.read_bytes(), b"synthetic complete")

    def test_package_readiness_needs_exact_versions_and_real_package_markers(self):
        cache = self.folder / "venv"
        site = cache / "lib/python3.9/site-packages"
        versions = dict(align.ENGINES)
        with patch.object(align, "CACHE_DIR", cache):
            self.assertFalse(align.engines_ready(versions))
            for package in align.ENGINES:
                package_dir = site / package
                package_dir.mkdir(parents=True)
                (package_dir / "__init__.py").touch()
            self.assertTrue(align.engines_ready(versions))
            self.assertFalse(align.engines_ready(dict(versions, torchaudio="2.9.0")))

    def test_supported_cpython_minors_and_patch_versions_reach_handoff(self):
        # The 2.8.0 releases' installed METADATA both list these five minors.
        cache = self.folder / "venv"
        interpreter = cache / "bin/python3"
        interpreter.parent.mkdir(parents=True)
        interpreter.touch()
        for minor in (9, 10, 11, 12, 13):
            for micro in (0, 6, 15):
                info = {"python": [3, minor, micro], "implementation": "cpython", **align.ENGINES}
                with self.subTest(version=info["python"]), patch.object(align, "CACHE_DIR", cache), \
                        patch.object(align, "cached_environment_info", return_value=info), \
                        patch.object(align, "engines_ready", return_value=True), \
                        patch.object(align, "consent") as consent, patch.object(align.subprocess, "run") as run, \
                        patch.object(align.os, "execv") as handoff:
                    align.ensure_environment({}, self.args)
                handoff.assert_called_once()
                consent.assert_not_called()
                run.assert_not_called()

    def test_wrong_interpreter_refused_before_any_install(self):
        cache = self.folder / "venv"
        interpreter = cache / "bin/python3"
        interpreter.parent.mkdir(parents=True)
        interpreter.touch()
        for version, implementation in (([3, 8, 20], "cpython"), ([3, 14, 0], "cpython"),
                                         ([3, 11, 15], "pypy")):
            with self.subTest(version=version, implementation=implementation), patch.object(align, "CACHE_DIR", cache), \
                    patch.object(align, "cached_environment_info", return_value={"python": version, "implementation": implementation}), \
                    patch.object(align, "consent") as consent, patch.object(align.subprocess, "run") as run, \
                    self.assertRaisesRegex(align.AlignmentError, "CPython 3.9-3.13"):
                align.ensure_environment({}, self.args)
            consent.assert_not_called()
            run.assert_not_called()

    def test_alignment_package_install_is_pinned_local_and_verified_before_handoff(self):
        cache = self.folder / "venv"
        interpreter = cache / "bin/python3"
        interpreter.parent.mkdir(parents=True)
        interpreter.touch()
        info = {"python": [3, 11, 15], "implementation": "cpython", **align.ENGINES}
        with patch.object(align, "CACHE_DIR", cache), \
                patch.object(align, "cached_environment_info", return_value=info), \
                patch.object(align, "engines_ready", side_effect=[False, True]), \
                patch.object(align, "consent") as consent, patch.object(align.subprocess, "run") as run, \
                patch.object(align.os, "execv") as handoff:
            align.ensure_environment({}, self.args)
        consent.assert_called_once()
        command = run.call_args.args[0]
        self.assertEqual(command[:4], [str(interpreter), "-m", "pip", "install"])
        self.assertIn("--no-cache-dir", command)
        self.assertIn("--disable-pip-version-check", command)
        self.assertEqual(command[-1], str(TOOL / "requirements-align.txt"))
        self.assertEqual(run.call_args.kwargs['env']['PIP_NO_CACHE_DIR'], '1')
        handoff.assert_called_once()

    def test_decode_uses_one_whisper_ffmpeg_clock_and_source_bounds(self):
        pcm = array.array("h", [-32768, -1, 0, 1, 32767])
        if sys.byteorder != "little":
            pcm.byteswap()
        # 13 source samples become five 16 kHz samples; the source bound must
        # not be rounded back from the resampled length (which gives 15).
        probe = {"streams": [{"sample_rate": "48000", "duration_ts": 13, "time_base": "1/48000"}]}
        with patch.object(align.shutil, "which", return_value="present"), \
                patch.object(align.subprocess, "run", side_effect=[
                    SimpleNamespace(stdout=json.dumps(probe).encode()), SimpleNamespace(stdout=pcm.tobytes())]) as run:
            rate, samples, audio = align.decode_audio(self.audio)
        self.assertEqual((rate, samples), (48000, 13))
        self.assertEqual(list(audio), [-1.0, -1 / 32768, 0.0, 1 / 32768, 32767 / 32768])
        self.assertEqual(run.call_count, 2)  # One probe, one whole-file decode.
        self.assertEqual(run.call_args.args[0], [
            "ffmpeg", "-nostdin", "-threads", "0", "-i", str(self.audio), "-f", "s16le",
            "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"])

    def test_container_padding_or_absent_duration_uses_decoded_bounds(self):
        for extra in ({}, {"duration_ts": 48000, "time_base": "1/48000"}):
            probe = {"streams": [dict(sample_rate="48000", **extra)]}
            with self.subTest(metadata=extra), patch.object(align.shutil, "which", return_value="present"), \
                    patch.object(align.subprocess, "run", side_effect=[
                        SimpleNamespace(stdout=json.dumps(probe).encode()),
                        SimpleNamespace(stdout=array.array("h", [0] * 1600).tobytes())]):
                rate, samples, audio = align.decode_audio(self.audio)
            self.assertEqual((rate, samples, len(audio)), (48000, 4800, 1600))
            self.assertEqual(align.validate_layout(None, rate, samples, 2), [passage(end=4800)])

    def test_unusable_container_duration_keeps_successfully_decoded_audio(self):
        for duration, time_base in (("N/A", "1/48000"), (4800, "N/A"), (4800, "0/0"),
                                    ("0/0", "1/48000"), (0, "1/48000"), (-4800, "1/48000"),
                                    ("4800.5", "1/48000")):
            probe = {"streams": [{"sample_rate": "48000", "duration_ts": duration, "time_base": time_base}]}
            with self.subTest(duration=duration, time_base=time_base), \
                    patch.object(align.shutil, "which", return_value="present"), \
                    patch.object(align.subprocess, "run", side_effect=[
                        SimpleNamespace(stdout=json.dumps(probe).encode()),
                        SimpleNamespace(stdout=array.array("h", [0] * 1600).tobytes())]):
                rate, samples, audio = align.decode_audio(self.audio)
                self.assertEqual((rate, samples, len(audio)), (48000, 4800, 1600))

    def test_empty_16k_passage_refused_before_environment_including_whole_file(self):
        layout_file = self.folder / "layout.json"
        for doc in (None, layout(passage(0, 2), rate=48000), layout(passage(1, 2), rate=48000)):
            args = list(self.args)
            if doc is not None:
                layout_file.write_text(json.dumps(doc))
                args.extend(["--layout", str(layout_file)])
            with self.subTest(layout=doc), \
                    patch.object(align, "decode_audio", return_value=(48000, 2, array.array("f", [0]))), \
                    patch.object(align, "ensure_environment", side_effect=align.AlignmentError("environment reached")) as env, \
                    patch.object(align, "load_model") as model, \
                    contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(align.main(args), 1)
                env.assert_not_called()
                model.assert_not_called()
                self.assertEqual(out.getvalue(), "")
                self.assertIn("16 kHz", err.getvalue())
                self.assertFalse(self.output.exists())

    def test_passages_slice_full_decode_at_truncated_16k_bounds_without_resampling(self):
        class Tensor:
            def __init__(self, data):
                self.data = list(data)
            def unsqueeze(self, dimension):
                return self
            def size(self, dimension):
                return len(self.data)
            def log_softmax(self, dimension):
                return self
        torch = SimpleNamespace(tensor=lambda data, **kwargs: Tensor(data), float32="float32", int32="int32",
                                zeros=lambda n: Tensor([0] * n),
                                cat=lambda tensors: Tensor([x for t in tensors for x in t.data]),
                                inference_mode=contextlib.nullcontext)
        functional = SimpleNamespace(forced_align=Mock(return_value=([None], [SimpleNamespace(exp=lambda: None)])),
                                     merge_tokens=Mock(return_value=[]))
        bundle = SimpleNamespace(sample_rate=16000, get_labels=lambda: ["-", "|", "A"])
        model = Mock(return_value=(Tensor(range(100)), None))
        p = passage(10001, 20003, 0, 0)
        q = passage(22001, 30007, 1, 1)
        spans = [[SimpleNamespace(start=5, end=50)]]
        audio = array.array("f", range(16000))
        with patch.dict(sys.modules, {"torchaudio": SimpleNamespace(functional=functional),
                                     "torchaudio.functional": functional}), \
                patch.object(align, "word_spans", return_value=spans), \
                patch.object(align, "validate_output") as validate:
            timings = align.infer(torch, audio, ["A", "A"], ["A", "A"], [p, q], 44100, bundle, model, True)
        for call, bounds in zip(model.call_args_list, (p, q)):
            actual = call.args[0].data
            self.assertEqual(actual[:4800], [0] * 4800)
            start = int(bounds["start_sample"] / 44100 * 16000)
            end = int(bounds["end_sample"] / 44100 * 16000)
            self.assertEqual(actual[4800:], list(audio[start:end]))
        self.assertEqual([t["start"] for t in timings], [10001 / 44100, 22001 / 44100])
        self.assertEqual(validate.call_args.args[2:], (16000, len(audio)))

    def test_help_and_check_offline_entrypoints(self):
        # The child reports its own imports after running the real entrypoint.
        probe = """
import contextlib, io, json, runpy, sys
from pathlib import Path
sys.argv = sys.argv[1:]
sys.path.insert(0, str(Path(sys.argv[0]).parent))
out, err, status = io.StringIO(), io.StringIO(), 0
with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
    try:
        runpy.run_path(sys.argv[0], run_name="__main__")
    except SystemExit as exit:
        status = exit.code
print(json.dumps({"status": status, "stdout": out.getvalue(), "stderr": err.getvalue(),
                  "engines": [name for name in ("torch", "torchaudio") if name in sys.modules]}))
"""
        for args in (["help"], ["align", "--help"], ["check"]):
            result = subprocess.run([sys.executable, "-c", probe, str(TOOL / "scripts" / "transcribe.py"), *args],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stderr, "")
            child = json.loads(result.stdout)
            self.assertEqual(child["status"], 0, child["stderr"])
            self.assertEqual(child["stderr"], "")
            self.assertEqual(child["engines"], [], "child imported an engine: %r" % child["engines"])
            if args == ["check"]:
                self.assertEqual(set(json.loads(child["stdout"])), {"python", "ffmpeg", "packages"})

    def test_offline_entrypoints_test_detects_engine_import_in_child(self):
        real_run = subprocess.run
        for engine in ("torch", "torchaudio"):
            def inject(command, **kwargs):
                prefix = "import sys, types; sys.modules[%r] = types.ModuleType(%r);\n" % (engine, engine)
                if command[1] == "-c":
                    command = [*command[:2], prefix + command[2], *command[3:]]
                else:
                    command = [command[0], "-c", prefix +
                        "import runpy; from pathlib import Path; sys.argv = sys.argv[1:]; "
                        "sys.path.insert(0, str(Path(sys.argv[0]).parent)); "
                        "runpy.run_path(sys.argv[0], run_name='__main__')",
                        *command[1:]]
                return real_run(command, **kwargs)
            result = unittest.TestResult()
            case = AlignTests("test_help_and_check_offline_entrypoints")
            with self.subTest(engine=engine), patch.object(subprocess, "run", side_effect=inject):
                case.run(result)
                self.assertEqual(len(result.failures), 1, "child engine import escaped detection")
                self.assertIn(engine, result.failures[0][1])


if __name__ == "__main__":
    unittest.main()
