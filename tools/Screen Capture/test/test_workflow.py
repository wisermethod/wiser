import contextlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
from support import TOOL, ADDRESS, NAME, temporary, still, font
from support import failing_worker
import capture
import check
import media
import ocr
import pipeline
from paths import CaptureError


class WorkflowTests(unittest.TestCase):
    def invoke(self, command, source, report, output=None, terms=(), named=()):
        argv = [command, "--input", str(source), "--report", str(report)]
        if output:
            argv += ["--output", str(output)]
        for term in terms:
            argv += ["--term", term]
        for box in named:
            argv += ["--region", ",".join(map(str, box))]
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = capture.main(argv)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_vision_character_box_and_unicode_offsets(self):
        with temporary() as directory:
            source = Path(directory) / "input.png"
            image, box = still(source, "Send to " + ADDRESS)
            hits = ocr.vision(source, [ADDRESS])
            whole = [hit["box"] for hit in hits if hit["class"] == "term 1 whole"]
            self.assertTrue(whole, "Vision must read the synthetic address positive control")
            self.assertGreater(whole[0][0], box[0] + 70, "use the candidate's character box, not the whole line")
            self.assertLess(whole[0][2] - whole[0][0], box[2] - box[0] - 70)
            self.assertEqual(ocr._range("🙂Riley", 1, 6), (2, 5))

    def test_match_across_lines_gets_one_box_per_line(self):
        with temporary() as directory:
            source = Path(directory) / "split.png"
            image = Image.new("RGB", (900, 700), "white")
            draw = ImageDraw.Draw(image)
            draw.text((45, 60), "Write to riley.q@", font=font(), fill="black")
            draw.text((45, 560), "example.org today", font=font(), fill="black")
            image.save(source)
            boxes = [hit["box"] for hit in ocr.vision(source, [ADDRESS]) if hit["class"] == "term 1 whole"]
            self.assertGreaterEqual(len(boxes), 2, "Vision must read both halves of the split address")
            for box in boxes:
                self.assertLess(box[3] - box[1], 120, "a box spans more than one line")

    def test_named_region_holds_when_detection_misses(self):
        with temporary() as directory:
            root = Path(directory)
            source, output = root / "input.png", root / "output.png"
            image, box = still(source)
            raw = check.verify([source], [NAME], workers=1)
            self.assertTrue(all(raw["hits_per_engine"][engine] > 0 for engine in ("vision", "tesseract")),
                            "both engines must read the missed run before redaction counts")
            x0, y0, x1, y1 = box
            # Only detection is switched off: the checker still uses both real engines.
            with patch.object(pipeline, "detect", return_value=[[]]):
                code, stdout, stderr = self.invoke("redact", source, root / "report.json", output,
                                                   [NAME], [(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4)])
            self.assertEqual(code, 0, "named-region redaction failed or was skipped: " + stderr)
            self.assertTrue(output.is_file())
            data = json.loads(stdout)
            self.assertEqual(data["frames_with_found_box"], 0)
            self.assertEqual(data["regions"], 1)
            checked = check.verify([output], [NAME], workers=1)
            self.assertEqual(checked["hits_per_engine"], {"vision": 0, "tesseract": 0})
            code, stdout, stderr = self.invoke("verify", output, root / "verify.json", terms=[NAME])
            self.assertEqual(code, 0, stderr)

    def test_failed_check_withholds_output_and_private_text(self):
        with temporary() as directory:
            root = Path(directory)
            source, output, report = root / "input.png", root / "output.png", root / "report.json"
            still(source)
            with patch.object(pipeline, "detect", return_value=[[]]):
                code, stdout, stderr = self.invoke("redact", source, report, output, [NAME])
            self.assertEqual(code, 1, "failed two-engine check must refuse publication")
            self.assertEqual(stdout, "")
            self.assertFalse(output.exists(), "a failed check published an output")
            self.assertTrue(report.is_file())
            self.assertIn(str(report), stderr)
            data = report.read_text()
            for secret in (NAME, "Riley", "Quintero"):
                self.assertNotIn(secret.lower(), (data + stdout + stderr).lower())
            self.assertGreater(len(json.loads(data)["hits"]), 0)
            self.assertEqual(list(root.glob(".wiser-screen-capture-*")), [])

    def test_still_cli_determinism_and_address_detection(self):
        with temporary() as directory:
            root = Path(directory)
            source = root / "input.png"
            still(source, ADDRESS + "\n" + NAME)
            outputs = []
            for i in range(2):
                output = root / ("out%d.png" % i)
                code, stdout, stderr = self.invoke("redact", source, root / ("report%d.json" % i), output, [ADDRESS, NAME])
                self.assertEqual(code, 0, stderr)
                result = json.loads(stdout)
                self.assertEqual(result["frames"], 1)
                self.assertEqual(result["frames_with_found_box"], 1)
                self.assertEqual(result["check"]["hits_per_engine"], {"vision": 0, "tesseract": 0})
                outputs.append(output.read_bytes())
            self.assertEqual(outputs[0], outputs[1])

    def test_video_pointer_two_engines_tags_and_determinism(self):
        with temporary() as directory:
            root = Path(directory)
            raw = root / "raw"
            raw.mkdir()
            for i in range(12):
                image = Image.new("RGB", (901, 261), "white")
                draw = ImageDraw.Draw(image)
                draw.text((50, 50), ADDRESS, font=font(), fill="black")
                draw.text((50, 130), NAME, font=font(), fill="black")
                # A synthetic I-beam moves over the two lines; no display is touched.
                x = 100 + i * 6
                y = 53 if i < 6 else 133
                draw.rectangle((x, y, x + 2, y + 30), fill=(100, 100, 100))
                image.save(raw / ("f%05d.png" % (i + 1)))
            source = root / "input.mp4"
            media.encode(raw, source, 6)
            originals = media.decode(source, root / "originals", 6)
            raw_check = check.verify(originals, [ADDRESS, NAME], workers=2)
            self.assertEqual(raw_check["frames"], 12)
            self.assertTrue(all(raw_check["hits_per_engine"][e] > 0 for e in ("vision", "tesseract")))
            decoded_hashes = []
            for i in range(2):
                output = root / ("out%d.mp4" % i)
                result = pipeline.execute("redact", source, output, root / ("report%d.json" % i), [ADDRESS, NAME], fps=6)
                self.assertEqual(result["frames"], 12)
                self.assertEqual(result["check"]["frames"], 12)
                self.assertEqual(result["check"]["hits_per_engine"], {"vision": 0, "tesseract": 0})
                tags = media.colour_tags(output)
                self.assertEqual({key: result["colour_tags"][key] for key in tags}, tags)
                self.assertTrue(all(value == "bt709" for value in tags.values()))
                self.assertIsInstance(result["colour_tags"]["retagged"], bool)
                decoded = media.decode(output, root / ("decoded%d" % i), 6)
                decoded_hashes.append([check.pixel_hash(path) for path in decoded])
                with Image.open(decoded[0]) as frame:
                    self.assertEqual(frame.size, (902, 262))
            self.assertEqual(decoded_hashes[0], decoded_hashes[1])

    def test_identical_pixel_frames_share_reading(self):
        with temporary() as directory:
            root = Path(directory)
            source = root / "a.png"
            still(source)
            with patch.object(check, "read_one", wraps=check.read_one) as read:
                result = check.verify([source, source, source], [NAME], workers=1)
            self.assertEqual(read.call_count, 1)
            self.assertEqual(result["frames"], 3)
            self.assertEqual(result["distinct_frames"], 1)
            self.assertEqual({hit["frame"] for hit in result["hits"]}, {0, 1, 2})

    def test_repeated_spawned_detection_is_complete(self):
        with temporary() as directory:
            source = Path(directory) / "input.png"
            still(source, ADDRESS)
            readings = [ocr.detect([source] * 9, [ADDRESS], workers=4) for _ in range(4)]
            self.assertTrue(all(len(rows) == 9 and all(rows) for rows in readings))
            self.assertTrue(all(rows == readings[0] for rows in readings))

    def test_worker_failure_is_private_and_reaped(self):
        import multiprocessing
        before = {p.pid for p in multiprocessing.active_children()}
        with self.assertRaises(CaptureError) as error:
            check.spawn_map(failing_worker, [None] * 4, workers=4)
        self.assertIn("parallel OCR failed", str(error.exception))
        self.assertNotIn(NAME, str(error.exception))
        self.assertEqual({p.pid for p in multiprocessing.active_children()}, before)

    def test_decode_workspace_removed_on_failure(self):
        with temporary() as directory:
            with patch.object(pipeline.tempfile, "tempdir", directory):
                with self.assertRaises(RuntimeError):
                    with pipeline.Workspace() as work:
                        path = work
                        raise RuntimeError("synthetic failure")
            self.assertFalse(path.exists())

    def test_retag_runs_once_then_reports_final_tags(self):
        with temporary() as directory:
            root = Path(directory)
            directory = root / "frames"
            directory.mkdir()
            output = root / "out.mp4"
            unknown = {"color_space": "bt709", "color_transfer": "unknown", "color_primaries": "unknown"}
            final = {key: "bt709" for key in unknown}
            def fake_run(arguments, operation):
                Path(arguments[-1]).write_bytes(b"synthetic")
            with patch.object(media, "run", side_effect=fake_run) as run, patch.object(media, "colour_tags", side_effect=[unknown, final]) as read:
                result = media.encode(directory, output, 30)
            self.assertEqual(read.call_count, 2)
            self.assertEqual(run.call_count, 2)
            self.assertTrue(result["retagged"])
            self.assertEqual({key: result[key] for key in final}, final)
            self.assertIn("h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", run.call_args_list[1].args[0])


if __name__ == "__main__":
    unittest.main()
