"""Local Vision OCR. Candidate strings and declared terms never leave memory."""
import math
from pathlib import Path

from paths import CaptureError
from geometry import union
from terms import Matcher


def _pixels(box, width, height):
    return (max(0, math.floor(box.origin.x * width)),
            max(0, math.floor((1 - box.origin.y - box.size.height) * height)),
            min(width, math.ceil((box.origin.x + box.size.width) * width)),
            min(height, math.ceil((1 - box.origin.y) * height)))


def _range(text, lo, hi):
    # NSString/Vision use UTF-16 offsets, Python uses Unicode code points.
    return (len(text[:lo].encode("utf-16-le")) // 2,
            len(text[lo:hi].encode("utf-16-le")) // 2)


def vision(path, terms=()):
    import objc
    import Quartz
    import Vision
    from Foundation import NSURL

    with objc.autorelease_pool():
        source = Quartz.CGImageSourceCreateWithURL(NSURL.fileURLWithPath_(str(Path(path))), None)
        image = Quartz.CGImageSourceCreateImageAtIndex(source, 0, None) if source else None
        if image is None:
            raise CaptureError("Vision cannot open a frame; check the input image")
        width, height = Quartz.CGImageGetWidth(image), Quartz.CGImageGetHeight(image)
        request = Vision.VNRecognizeTextRequest.alloc().init()
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
        request.setUsesLanguageCorrection_(False)
        request.setRecognitionLanguages_(["en-US"])
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, {})
        ok, error = handler.performRequests_error_([request], None)
        if not ok:
            raise CaptureError("Vision OCR failed; confirm macOS supports Vision and retry")
        lines, offset = [], 0
        for observation in request.results() or []:
            candidates = observation.topCandidates_(1)
            if not candidates:
                continue
            candidate = candidates[0]
            text = str(candidate.string())
            lines.append((offset, text, candidate, observation.boundingBox()))
            offset += len(text) + 1
        combined = "\n".join(line[1] for line in lines)
        matches = []
        for lo, hi, label in Matcher(terms).matches(combined):
            boxes = []
            for start, text, candidate, fallback in lines:
                a, b = max(lo, start), min(hi, start + len(text))
                if a >= b:
                    continue
                observation, error = candidate.boundingBoxForRange_error_(_range(text, a - start, b - start), None)
                boxes.append(_pixels(observation.boundingBox() if observation else fallback, width, height))
            if boxes:
                box = boxes[0]
                for extra in boxes[1:]:
                    box = union(box, extra)
                matches.append({"class": label, "box": list(box)})
        return matches


def detect_one(job):
    path, terms = job
    return sorted(set(tuple(m["box"]) for m in vision(path, terms)))


def detect(files, terms, workers=None):
    from check import spawn_map
    return spawn_map(detect_one, [(str(f), terms) for f in files], workers)
