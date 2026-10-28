"""Adversarial-review regressions. All installs/downloads/models are fakes.

The WAV tests use existing numpy/soundfile, never torch or a real model.
"""
import base64
import contextlib
import csv
import hashlib
import io
import importlib.util
import json
import os
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from test_chatterbox import cb, good_facts


class PackageRepairs(unittest.TestCase):
    @contextlib.contextmanager
    def environment(self):
        with tempfile.TemporaryDirectory() as temp:
            tool = Path(temp).resolve()
            venv = tool / ".venv"
            site = venv / "lib/python3.11/site-packages"
            dist = site / "chatterbox_tts-0.1.7.dist-info"
            dist.mkdir(parents=True)
            (dist / "METADATA").write_text("Name: chatterbox-tts\nVersion: 0.1.7\n")
            source = site / "chatterbox/__init__.py"
            source.parent.mkdir()
            source.write_bytes(b"# original\n")
            (tool / "requirements.lock").write_text("chatterbox-tts==0.1.7\n")
            # The test pins small stand-ins; the shipped pins have their own RECORD proof.
            perth_name = "perth/perth_net/pretrained/implicit/perth_net_250000.pth.tar"
            perth = site / perth_name
            perth.parent.mkdir(parents=True)
            perth.write_bytes(b"checkpoint")
            (tool / "perth-files.json").write_text(json.dumps({"files": {
                perth_name: {"bytes": 10, "sha256": cb.sha256(perth)}}}))
            def record():
                with (dist / "RECORD").open("w", newline="") as f:
                    writer = csv.writer(f)
                    for p in (source, perth, dist / "METADATA"):
                        encoded = base64.urlsafe_b64encode(bytes.fromhex(cb.sha256(p))).decode().rstrip("=")
                        writer.writerow([str(p.relative_to(site)), "sha256=" + encoded, p.stat().st_size])
                    writer.writerow([str((dist / "RECORD").relative_to(site)), "", ""])
            record()
            py = {"implementation": "CPython", "machine": "arm64", "version": "3.11.15",
                  "prefix": str(venv), "path": str(venv / "bin/python3")}
            with patch.object(cb, "TOOL", tool), patch.object(cb, "VENV", venv), \
                    patch.object(cb, "inspect_interpreter", return_value=py):
                yield tool, venv, source, perth, record

    def test_record_size_and_same_size_digest_damage(self):
        with self.environment() as (_, _, source, _, _):
            self.assertEqual(cb.package_state()["status"], "complete")
            for data in (b"# changed!\n", b"short"):
                source.write_bytes(data)
                self.assertEqual(cb.package_state()["status"], "incomplete")

    def test_rewritten_wheel_bytecode_is_not_damage(self):
        # Python checks bytecode against its source and rewrites it; a wheel may
        # still list a .pyc with a hash, as NumPy's does. Rewriting it is not damage.
        with self.environment() as (_, venv, source, _, record):
            pyc = source.parent / "__pycache__" / "__init__.cpython-311.pyc"
            pyc.parent.mkdir()
            pyc.write_bytes(b"bytecode as shipped")
            rec = next(venv.glob("lib/python3.11/site-packages/*.dist-info/RECORD"))
            encoded = base64.urlsafe_b64encode(bytes.fromhex(cb.sha256(pyc))).decode().rstrip("=")
            with rec.open("a", newline="") as f:
                csv.writer(f).writerow(["chatterbox/__pycache__/__init__.cpython-311.pyc", "sha256=" + encoded, pyc.stat().st_size])
            self.assertEqual(cb.package_state()["status"], "complete")
            pyc.write_bytes(b"bytecode Python wrote again, longer")
            self.assertEqual(cb.package_state()["status"], "complete")
            pyc.unlink()
            self.assertEqual(cb.package_state()["status"], "complete")

    def test_missing_or_unhashed_record_file(self):
        with self.environment() as (_, venv, source, _, record):
            source.unlink()
            self.assertEqual(cb.package_state()["status"], "incomplete")
            source.write_bytes(b"# original\n")
            record()
            records = list(venv.glob("lib/python3.11/site-packages/*.dist-info/RECORD"))
            records[0].write_text(records[0].read_text().replace("sha256=", "md5="))
            self.assertEqual(cb.package_state()["status"], "incomplete")

    def test_corrupt_metadata_is_incomplete_instead_of_crashing_install(self):
        with self.environment() as (_, venv, _, _, _):
            metadata = next(venv.glob("lib/python3.11/site-packages/*.dist-info/METADATA"))
            for payload in (b"truncated", b"\xff"):
                metadata.write_bytes(payload)
                self.assertEqual(cb.package_state()["status"], "incomplete")

    def test_perth_pin_cannot_be_overridden_by_record(self):
        with self.environment() as (_, _, _, perth, record):
            perth.write_bytes(b"badcheckpt")
            record()
            self.assertEqual(cb.package_state()["status"], "incomplete")
            loader = Mock(return_value=types.SimpleNamespace(device="mps"))
            torch = types.SimpleNamespace(backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: True)),
                                          mps=types.SimpleNamespace(synchronize=lambda: None))
            with patch.dict(sys.modules, {"torch": torch, "chatterbox.tts": types.SimpleNamespace(
                    ChatterboxTTS=types.SimpleNamespace(from_local=loader))}):
                with self.assertRaises(cb.ToolError):
                    cb.load_model(Path("/snapshot"))
            loader.assert_not_called()

    def test_extra_perth_checkpoint_cannot_bypass_pin(self):
        with self.environment() as (_, _, _, perth, _):
            (perth.parent / "perth_net_999999.pth.tar").write_bytes(b"untrusted")
            self.assertEqual(cb.package_state()["status"], "incomplete")

    def test_bad_perth_pin_refuses_before_loader_even_with_matching_record(self):
        with self.environment() as (_, _, _, perth, record):
            perth.write_bytes(b"badcheckpt")
            record()
            with patch.dict(sys.modules, {"torch": None}):
                with self.assertRaisesRegex(cb.ToolError, "no model loaded"):
                    cb.load_model(Path("/snapshot"))

    def test_authorized_install_retains_corrupt_usable_environment_and_rebuilds(self):
        with self.environment() as (tool, venv, source, _, _):
            source.write_bytes(b"short")
            before = cb.package_state()
            with patch.object(cb, "PLUGIN", tool), patch.object(cb, "check", return_value=cb.assess(good_facts())), \
                    patch.object(cb, "consent", return_value=False), \
                    patch.object(cb, "package_state", side_effect=[before, {"status": "complete"}]), \
                    patch.object(cb.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as run, \
                    contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cb.install({"--route-chosen": True}, tool / "models"), 0)
            self.assertTrue(list((tool / ".venv-recovery").glob("*/lib/python3.11/site-packages/chatterbox/__init__.py")))
            self.assertTrue(any("venv" in call.args[0] for call in run.call_args_list))
            self.assertTrue(any("install" in call.args[0] for call in run.call_args_list))

    def test_model_load_failure_rebuilds_once_in_same_authorized_run(self):
        with self.environment() as (tool, _, _, _, _):
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                return types.SimpleNamespace(returncode=2 if len(calls) == 1 else 0)
            with patch.object(cb, "PLUGIN", tool), patch.object(cb, "check", return_value=cb.assess(good_facts())), \
                    patch.object(cb, "consent", return_value=False), \
                    patch.object(cb, "package_state", return_value={"status": "complete"}), \
                    patch.object(cb.subprocess, "run", side_effect=run), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cb.install({"--route-chosen": True}, tool / "models"), 0)
            self.assertEqual(sum("install" in c for c in calls), 1)
            self.assertTrue(list((tool / ".venv-recovery").iterdir()))

    def test_probe_refusal_is_not_treated_as_a_corrupt_environment(self):
        # A refusal reinstalling cannot cure, such as no MPS, must not set aside a good environment.
        with self.environment() as (tool, _, _, _, _):
            state = {"status": "complete", "snapshot": "/snapshot", "invalid_files": []}
            with patch.object(cb, "weight_state", return_value=state), \
                    patch.object(cb, "offline_runtime", return_value=contextlib.nullcontext()), \
                    patch.object(cb, "load_model", side_effect=cb.ToolError("speech requires MPS")), \
                    contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cb.finish_install(tool / "models"), 1)

    def test_failed_rebuild_puts_the_working_environment_back(self):
        with self.environment() as (tool, venv, source, _, _):
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                if len(calls) == 1:
                    return types.SimpleNamespace(returncode=2)
                if "install" in args:
                    raise cb.subprocess.CalledProcessError(1, args)
                return types.SimpleNamespace(returncode=0)
            with patch.object(cb, "PLUGIN", tool), patch.object(cb, "check", return_value=cb.assess(good_facts())), \
                    patch.object(cb, "consent", return_value=False), \
                    patch.object(cb, "package_state", return_value={"status": "complete"}), \
                    patch.object(cb.subprocess, "run", side_effect=run), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(Exception):
                    cb.install({"--route-chosen": True}, tool / "models")
            self.assertEqual(source.read_bytes(), b"# original\n")

    def test_rebuild_can_be_launched_by_the_environment_being_retained(self):
        with self.environment() as (tool, venv, _, _, _):
            launcher = venv / "bin/python3"
            launcher.parent.mkdir()
            launcher.write_bytes(b"fake interpreter")
            facts = good_facts()
            facts["interpreter"]["path"] = str(launcher)
            creators = []
            def run(args, **kwargs):
                if "venv" in args:
                    creators.append(args[0])
                    self.assertTrue(Path(args[0]).is_file(), "retaining .venv lost the creator interpreter")
                return types.SimpleNamespace(returncode=0)
            with patch.object(cb, "PLUGIN", tool), patch.object(cb, "check", return_value=cb.assess(facts)), \
                    patch.object(cb, "consent", return_value=False), \
                    patch.object(cb, "package_state", side_effect=[{"status": "incomplete", "interpreter_usable": True},
                                                                 {"status": "complete"}]), \
                    patch.object(cb.subprocess, "run", side_effect=run), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cb.install({"--route-chosen": True}, tool / "models"), 0)
            self.assertEqual(len(creators), 1)


class DownloadRepairs(unittest.TestCase):
    def test_free_at_uses_available_statvfs_blocks(self):
        with patch.object(cb.os, "statvfs", return_value=types.SimpleNamespace(f_bavail=2, f_frsize=4)), \
                patch.object(cb.shutil, "disk_usage", return_value=types.SimpleNamespace(free=cb.REQUIRED_BYTES)):
            self.assertEqual(cb.free_at(cb.TOOL), 8)
            facts = dict(good_facts(), environment_free_bytes=cb.free_at(cb.TOOL))
            self.assertEqual(cb.assess(facts)["status"], "unsupported")

    @contextlib.contextmanager
    def weights(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hub = root / cb.ENGINE_FOLDER / "hub"
            blob = hub / "models--ResembleAI--chatterbox/blobs" / hashlib.sha256(b"data").hexdigest()
            snapshot = hub / "models--ResembleAI--chatterbox/snapshots" / cb.REVISION
            snapshot.mkdir(parents=True)
            blob.parent.mkdir()
            (root / "weights.json").write_text(json.dumps({"files": {
                "model": {"bytes": 4, "sha256": hashlib.sha256(b"data").hexdigest()}}}))
            download = Mock(side_effect=lambda **kw: (snapshot / "model").write_bytes(b"data"))
            with patch.object(cb, "TOOL", root), patch.object(cb, "VENV", root), \
                    patch.object(cb, "package_state", return_value={"status": "complete"}), \
                    patch.object(cb, "load_model"), patch.dict(os.environ), \
                    patch.dict(sys.modules, {"huggingface_hub": types.SimpleNamespace(hf_hub_download=download)}), \
                    contextlib.redirect_stdout(io.StringIO()):
                yield root, hub, blob, snapshot, download

    def test_recheck_space_after_environment_writes_before_any_download(self):
        with self.weights() as (root, _, _, _, download):
            with patch.object(cb, "free_at", return_value=3):
                with self.assertRaisesRegex(cb.ToolError, r"4.*3"):
                    cb.install_weights(root)
            download.assert_not_called()

    def test_space_counts_only_missing_files(self):
        with self.weights() as (root, _, _, snapshot, download):
            with patch.object(cb, "free_at", return_value=4):
                self.assertEqual(cb.install_weights(root), 0)
            download.assert_called_once()
            download.reset_mock()
            with patch.object(cb, "free_at", return_value=0):
                self.assertEqual(cb.install_weights(root), 0)
            download.assert_not_called()

    def test_remove_only_own_stale_incomplete_files_even_before_supported_check(self):
        with self.weights() as (root, hub, _, _, download):
            partial = hub / "killed.id.incomplete"
            partial.write_bytes(b"partial")
            other = root / "other.incomplete"
            other.write_bytes(b"keep")
            # Never follow a cache-directory link outside this engine's hub.
            outside = root / "outside"
            outside.mkdir()
            linked = outside / "keep.incomplete"
            linked.write_bytes(b"keep")
            (hub / "link").symlink_to(outside, target_is_directory=True)
            with patch.object(cb, "check", return_value={"status": "unsupported", "reasons": []}), \
                    patch.object(cb, "consent", side_effect=AssertionError):
                with self.assertRaises(cb.ToolError):
                    cb.install({"--route-chosen": True}, root)
            self.assertFalse(partial.exists())
            self.assertTrue(other.exists())
            self.assertTrue(linked.exists())
            download.assert_not_called()

    def test_bad_blob_without_snapshot_is_forced_in_first_run(self):
        with self.weights() as (root, _, blob, _, download):
            blob.write_bytes(b"evil")  # same size, wrong digest
            self.assertEqual(cb.install_weights(root), 0)
            self.assertTrue(download.call_args.kwargs["force_download"])


class DeviceRepairs(unittest.TestCase):
    def test_speech_mps_and_explicit_cpu_watermarker_after_failed_live_mps_experiment(self):
        self.assertEqual(cb.WATERMARK.get("device"), "cpu")
        for device in ("cpu", "mps"):
            net = Mock(device=types.SimpleNamespace(type=device))
            model = types.SimpleNamespace(device="mps", watermarker=types.SimpleNamespace(perth_net=net))
            loader = Mock(return_value=model)
            torch = types.SimpleNamespace(backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: True)),
                                          mps=types.SimpleNamespace(synchronize=lambda: None))
            with patch.object(cb, "package_state", return_value={"status": "complete"}), \
                    patch.dict(sys.modules, {"torch": torch, "chatterbox.tts": types.SimpleNamespace(
                        ChatterboxTTS=types.SimpleNamespace(from_local=loader))}):
                if device != "cpu":
                    with self.assertRaises(cb.ToolError):
                        cb.load_model(Path("/snapshot"))
                else:
                    self.assertIs(cb.load_model(Path("/snapshot")), model)
                net.to.assert_not_called()
                loader.assert_called_once_with(Path("/snapshot"), device="mps")

    def test_mps_unavailable_never_loads_cpu(self):
        loader = Mock()
        torch = types.SimpleNamespace(backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: False)))
        with patch.object(cb, "package_state", return_value={"status": "complete"}), \
                patch.dict(sys.modules, {"torch": torch, "chatterbox.tts": types.SimpleNamespace(
                    ChatterboxTTS=types.SimpleNamespace(from_local=loader))}):
            with self.assertRaises(cb.ToolError):
                cb.load_model(Path("/snapshot"))
        loader.assert_not_called()
        self.assertEqual(cb.cache_env(Path("/cache"))["PYTORCH_ENABLE_MPS_FALLBACK"], "0")


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ("numpy", "soundfile", "tqdm")),
                     "WAV fixtures need the existing engine's numpy, soundfile and tqdm")
class WaveRepairs(unittest.TestCase):
    def fake_take(self, command, text, compute=1, sampling=False):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            paths = {k: root / k[2:] for k in ("--text", "--words", "--reference")}
            for p in paths.values():
                p.write_bytes(b"fixture")
            paths["--output"] = root / "out.wav"
            pieces = cb.split_pieces(text)
            expected = [np.array([0.125 * (i+1), -0.25, 0.5], dtype=np.float32) for i in range(len(pieces))]
            waves = [np.concatenate(([0, 0.001], p, [0.001, 0])).astype(np.float32) for p in expected]
            class Wave:
                def __init__(self, a): self.a = a
                def squeeze(self, dim): return self
                def cpu(self): return self
                def numpy(self): return self.a
            def generate(*args, **kwargs):
                if sampling:
                    # Import after cache_env, just as Chatterbox imports tqdm.
                    from tqdm import tqdm
                    tqdm.set_lock(threading.RLock())
                    list(tqdm(range(2), desc="Sampling"))
                return Wave(waves.pop(0))
            model = types.SimpleNamespace(sr=100, generate=generate)
            torch = types.SimpleNamespace(mps=types.SimpleNamespace(synchronize=lambda: None), manual_seed=lambda v: None)
            out, err = io.StringIO(), io.StringIO()
            # Purge/restore tqdm so its envwrap reads this engine's environment.
            tqdm_modules = {k: v for k, v in sys.modules.items() if k == "tqdm" or k.startswith("tqdm.")}
            for key in tqdm_modules: del sys.modules[key]
            try:
                with patch.object(cb, "VENV", Path(sys.prefix)), \
                        patch.object(cb, "survey", return_value=good_facts()), \
                        patch.object(cb, "package_state", return_value={"status": "complete"}), \
                        patch.object(cb, "weight_state", return_value={"status": "complete", "snapshot": "/snapshot"}), \
                        patch.object(cb, "load_model", return_value=model), \
                        patch.object(cb, "pins", return_value={}), patch.dict(sys.modules, {"torch": torch}), \
                        patch.object(cb.time, "perf_counter", side_effect=[0, 1, 2, 2 + compute]), \
                        contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    rc = cb.run_engine(command, {}, root, (paths, root / "out.wav.json",
                        [w for p in pieces for w in p["words"]], pieces))
                data, rate = sf.read(str(paths["--output"]), dtype="float32")
                record = cb.read_json(root / "out.wav.json")
                return rc, out.getvalue(), err.getvalue(), record, data, expected
            finally:
                for key in list(sys.modules):
                    if key == "tqdm" or key.startswith("tqdm."): del sys.modules[key]
                sys.modules.update(tqdm_modules)

    def test_written_wav_slices_trimmed_pieces_gaps_and_last_end(self):
        import numpy as np
        text = " ".join("word%d" % i for i in range(36)) + ". <#0.5#> Last piece."
        rc, _, _, record, data, expected = self.fake_take("synthesize", text)
        self.assertEqual(rc, 0)
        self.assertEqual([p["gap_after_samples"] for p in record["passages"]], [30, 50, 0])
        at = 0
        for p, want in zip(record["passages"], expected):
            self.assertEqual(p["start_sample"], at)
            np.testing.assert_array_equal(data[p["start_sample"]:p["end_sample"]], want)
            self.assertEqual((p["trim_start_samples"], p["trim_end_samples"]), (2, 2))
            at = p["end_sample"] + p["gap_after_samples"]
            np.testing.assert_array_equal(data[p["end_sample"]:at], np.zeros(p["gap_after_samples"]))
        self.assertEqual(record["passages"][-1]["end_sample"], len(data))
        self.assertEqual(record["output"]["samples"], len(data))

    def test_refused_trial_stderr_is_exactly_one_json_object(self):
        self.assertEqual(cb.cache_env(Path("/cache")).get("TQDM_DISABLE"), "1")
        with patch.dict(os.environ):
            os.environ.pop("TQDM_DISABLE", None)
            rc, out, err, record, _, _ = self.fake_take("trial", "Fixed passage.", compute=1, sampling=True)
        self.assertEqual(rc, 1)
        self.assertEqual(out, "")
        refusal = json.loads(err)
        self.assertEqual(err.count("\n"), 1)
        self.assertEqual(refusal["timing"]["compute_per_audio_s"], 1 / (3 / 100))
        self.assertEqual(refusal["timing"], record["timing"])


if __name__ == "__main__":
    unittest.main()
