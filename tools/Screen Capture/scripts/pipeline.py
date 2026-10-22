"""Redaction transaction: publish only an output whose two-engine check passed."""
import json
import os
import shutil
import tempfile
import time
from pathlib import Path

from PIL import Image
from check import verify
from geometry import track, regions
from media import decode, encode, versions
from ocr import detect
from paths import CaptureError
from replacement import soften


class Workspace:
    def __enter__(self):
        self.path = Path(tempfile.mkdtemp(prefix="wiser-screen-capture-"))
        return self.path

    def __exit__(self, *exc):
        shutil.rmtree(self.path)


def write_report(path, report):
    # Never persist OCR strings, terms, fragments or exception bodies.
    with path.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


def execute(command, source, output, report, terms=(), named=(), fps=30):
    kind = "still" if source.suffix.lower() == ".png" else "video"
    clock = {key: 0.0 for key in ("decode", "detect", "redact", "encode", "check")}
    version = versions(kind == "video")
    pending = None
    try:
        with Workspace() as work:
            start = time.perf_counter()
            files = [source] if kind == "still" else decode(source, work / "raw", fps)
            clock["decode"] = time.perf_counter() - start
            if command == "verify":
                start = time.perf_counter()
                checked = verify(files, terms)
                clock["check"] = time.perf_counter() - start
                write_report(report, {"ok": not bool(checked["hits"]), "kind": kind, **checked})
                if checked["hits"]:
                    raise CaptureError("output check found readable content; inspect the places in " + str(report) +
                                       " and redact those regions before retrying")
                return {"ok": True, "kind": kind, "check": checked, "report": str(report),
                        "seconds": clock, "versions": version}
            with Image.open(files[0]) as image:
                width, height = image.size
            for x0, y0, x1, y1 in named:
                if x0 < 0 or y0 < 0 or x1 > width or y1 > height:
                    raise CaptureError("--region falls outside the image; use a rectangle in output pixels within its dimensions")
            start = time.perf_counter()
            detected = detect(files, terms)
            found_frames = sum(bool(b) for b in detected)
            tracked, added = track(files, detected)
            clock["detect"] = time.perf_counter() - start
            start = time.perf_counter()
            per, regs = regions(files, tracked)
            # Named regions are exact, apply on every frame, and never pass through fitting.
            if named:
                per = [boxes + list(named) for boxes in per]
            rendered = work / "redacted"
            rendered.mkdir()
            for i, (path, boxes) in enumerate(zip(files, per), 1):
                with Image.open(path) as image:
                    if image.size != (width, height):
                        raise CaptureError("frame dimensions changed; normalize the recording's dimensions and retry")
                    soften(image, boxes).save(rendered / ("f%05d.png" % i), format="PNG")
            clock["redact"] = time.perf_counter() - start
            descriptor, filename = tempfile.mkstemp(prefix=".wiser-screen-capture-", suffix=output.suffix,
                                                   dir=str(output.parent))
            os.close(descriptor)
            pending = Path(filename)
            start = time.perf_counter()
            tags = None
            if kind == "still":
                shutil.copyfile(rendered / "f00001.png", pending)
            else:
                tags = encode(rendered, pending, fps)
            clock["encode"] = time.perf_counter() - start
            start = time.perf_counter()
            # Read the written deliverable, including H.264 artifacts, never the pre-encode frames.
            check_files = [pending] if kind == "still" else decode(pending, work / "check", fps)
            checked = verify(check_files, terms)
            clock["check"] = time.perf_counter() - start
            write_report(report, {"ok": not bool(checked["hits"]), "kind": kind, **checked})
            if checked["hits"]:
                raise CaptureError("redaction check found readable content; output withheld. Inspect the places in " + str(report) +
                                   " and add --region rectangles before retrying")
            if output.exists():
                raise CaptureError("--output appeared during the run; choose a new filename and retry")
            pending.rename(output)
            pending = None
            return {"ok": True, "output": str(output), "kind": kind, "frames": len(files),
                    "frames_with_found_box": found_frames, "frames_added_by_tracking": added,
                    "regions": len(regs) + len(named), "check": checked, "seconds": clock,
                    "colour_tags": tags, "report": str(report), "versions": version}
    finally:
        if pending is not None:
            pending.unlink(missing_ok=True)
