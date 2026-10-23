"""Redaction transaction: publish only an output whose two-engine check passed."""
import json
import os
import shutil
import tempfile
import time
from pathlib import Path

from PIL import Image
from check import verify, spawn_map
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


def _soften_chunk(jobs):
    output = []
    for i, source, boxes, size, directory in jobs:
        with Image.open(source) as image:
            if image.size != size:
                raise CaptureError("frame dimensions changed; normalize the recording's dimensions and retry")
            path = Path(directory) / ("part%05d.png" % i)
            soften(image, boxes).save(path, format="PNG")
            output.append((i, str(path)))
    return output


def render_frames(files, per, rendered, size, workers=None):
    # Workers receive bounded chunks and write to disk, never send full frames
    # through pipes. Reassemble by frame index, never by worker completion/order.
    count = min(workers or 8, os.cpu_count() or 1, len(files))
    jobs = [(i, str(path), boxes, size, str(rendered))
            for i, (path, boxes) in enumerate(zip(files, per), 1)]
    chunks = [jobs[i::count] for i in range(count)]
    rows = [row for chunk in spawn_map(_soften_chunk, chunks, workers) for row in chunk]
    ordered = sorted(rows, key=lambda row: row[0])
    for i, (_, path) in enumerate(ordered, 1):
        Path(path).rename(rendered / ("f%05d.png" % i))


def execute(command, source, output, report, terms=(), named=(), fps=30, workers=None):
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
            render_frames(files, per, rendered, (width, height), workers)
            clock["redact"] = time.perf_counter() - start
            candidate = work / ("candidate" + output.suffix)
            start = time.perf_counter()
            tags = None
            if kind == "still":
                shutil.copyfile(rendered / "f00001.png", candidate)
            else:
                tags = encode(rendered, candidate, fps)
            clock["encode"] = time.perf_counter() - start
            start = time.perf_counter()
            # Read the written deliverable, including H.264 artifacts, never the pre-encode frames.
            check_files = [candidate] if kind == "still" else decode(candidate, work / "check")
            if len(check_files) != len(files):
                raise CaptureError("encoded video frame count changed during decode; output withheld. Check ffmpeg and retry")
            checked = verify(check_files, terms)
            clock["check"] = time.perf_counter() - start
            write_report(report, {"ok": not bool(checked["hits"]), "kind": kind, **checked})
            if checked["hits"]:
                raise CaptureError("redaction check found readable content; output withheld. Inspect the places in " + str(report) +
                                   " and add --region rectangles before retrying")
            if output.exists():
                raise CaptureError("--output appeared during the run; choose a new filename and retry")
            descriptor, filename = tempfile.mkstemp(prefix=".wiser-screen-capture-", suffix=output.suffix,
                                                   dir=str(output.parent))
            os.close(descriptor)
            pending = Path(filename)
            shutil.copyfile(candidate, pending)
            pending.rename(output)
            pending = None
            return {"ok": True, "output": str(output), "kind": kind, "frames": len(files),
                    "frames_with_found_box": found_frames, "frames_added_by_tracking": added,
                    "regions": len(regs) + len(named), "check": checked, "seconds": clock,
                    "colour_tags": tags, "report": str(report), "versions": version}
    finally:
        if pending is not None:
            pending.unlink(missing_ok=True)
