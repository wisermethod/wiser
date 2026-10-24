"""Every-frame, two-engine check with pixel-identical frames sharing one reading."""
import hashlib
import multiprocessing
from multiprocessing.connection import wait
import os
import subprocess

from PIL import Image
from paths import CaptureError
from terms import Matcher


def _batch(sender, function, jobs):
    try:
        try:
            payload = (True, [(i, function(job)) for i, job in jobs])
        except CaptureError as error:
            # The tool's own refusal is fixed text, never recognized text or a term, so it is passed on.
            payload = (False, str(error))
        except BaseException:
            # No exception body: a native OCR error can contain recognized text.
            payload = (False, None)
        try:
            sender.send(payload)
        except (OSError, EOFError):
            # The parent may already have stopped after another worker failed.
            pass
    finally:
        sender.close()


def spawn_map(function, jobs, workers=None):
    if not jobs:
        return []
    count = min(workers or 8, os.cpu_count() or 1, len(jobs))
    if count == 1:
        return [function(job) for job in jobs]
    # One pipe per spawn avoids the shared queue locks that stalled repeated
    # macOS OCR pools. Read before join, so a full pipe cannot block shutdown.
    context = multiprocessing.get_context("spawn")
    processes, receivers = [], []
    output = [None] * len(jobs)
    indexed = list(enumerate(jobs))
    try:
        for worker in range(count):
            receiver, sender = context.Pipe(duplex=False)
            receivers.append(receiver)
            process = context.Process(target=_batch, args=(sender, function, indexed[worker::count]))
            process.start()
            processes.append(process)
            sender.close()
        pending = set(receivers)
        while pending:
            for receiver in wait(pending):
                try:
                    ok, rows = receiver.recv()
                except EOFError:
                    ok, rows = False, None
                if not ok:
                    raise CaptureError(rows or "parallel OCR failed; check the pinned packages and readable input frames, then retry")
                for i, result in rows:
                    output[i] = result
                pending.remove(receiver)
        return output
    finally:
        for receiver in receivers:
            receiver.close()
        for process in processes:
            process.join(timeout=1)
            if process.is_alive():
                process.terminate()
                process.join()


def pixel_hash(path):
    with Image.open(path) as image:
        image = image.convert("RGBA")
        return hashlib.sha256(repr(image.size).encode() + image.tobytes()).digest()


def read_one(job):
    from ocr import vision
    path, terms = job
    rows = [{"engine": "vision", **row} for row in vision(path, terms)]
    result = subprocess.run(["tesseract", str(path), "-", "--psm", "11"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise CaptureError("Tesseract OCR failed; check: tesseract --version, then retry with a readable frame")
    # psm 11's plain-text mode supplies no boxes. Do not fabricate one.
    rows.extend({"engine": "tesseract", "class": label}
                for lo, hi, label in Matcher(terms).matches(result.stdout))
    return rows


def verify(files, terms, workers=None):
    unique, frame_keys = {}, []
    for path in files:
        key = pixel_hash(path)
        frame_keys.append(key)
        unique.setdefault(key, path)
    readings = spawn_map(read_one, [(str(path), terms) for path in unique.values()], workers)
    by_key = dict(zip(unique, readings))
    hits = [{"frame": i, **hit} for i, key in enumerate(frame_keys) for hit in by_key[key]]
    return {"frames": len(files), "distinct_frames": len(unique),
            "hits_per_engine": {engine: sum(hit["engine"] == engine for hit in hits)
                                for engine in ("vision", "tesseract")}, "hits": hits}
