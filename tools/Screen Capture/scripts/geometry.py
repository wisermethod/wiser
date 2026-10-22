"""Ink-relative tracking and steady, fitted regions. Rectangles are exclusive xyxy."""
import math
import numpy as np
from PIL import Image

TRACK_LIMIT = 0.35
DILATE = 3
SNAP = 6
INK = 40


def gray(path):
    with Image.open(path) as image:
        return np.asarray(image.convert("L"), dtype=np.int16)


def clip(rect, size):
    w, h = size
    x0, y0, x1, y1 = rect
    return (max(0, min(w, math.floor(x0))), max(0, min(h, math.floor(y0))),
            max(0, min(w, math.ceil(x1))), max(0, min(h, math.ceil(y1))))


def area(r):
    return max(0, r[2] - r[0]) * max(0, r[3] - r[1])


def intersection(a, b):
    return area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))


def union(a, b):
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def changed(current, reference):
    if current.shape != reference.shape or not reference.size:
        return 1.0
    ink = int(np.sum(np.abs(reference - np.median(reference)) >= INK))
    return float(np.sum(np.abs(current - reference) >= INK)) / max(ink, 1)


def _sweep(files, per, order, limit):
    out = [[] for _ in files]
    active = {}
    for i in order:
        g = gray(files[i])
        keep = {}
        for box, reference in active.items():
            x0, y0, x1, y1 = box
            if changed(g[y0:y1, x0:x1], reference) < limit:
                keep[box] = reference
                out[i].append(box)
        for box in per[i]:
            box = clip(box, (g.shape[1], g.shape[0]))
            if area(box):
                x0, y0, x1, y1 = box
                keep[box] = g[y0:y1, x0:x1].copy()
        active = keep
    return out


def track(files, per, limit=None):
    limit = TRACK_LIMIT if limit is None else limit
    forward = _sweep(files, per, range(len(files)), limit)
    backward = _sweep(files, per, range(len(files) - 1, -1, -1), limit)
    merged = [sorted(set(tuple(b) for b in original + a + b))
              for original, a, b in zip(per, forward, backward)]
    return merged, sum(bool(boxes) and not bool(original) for boxes, original in zip(merged, per))


def _edge(ink, at, step, lo, hi):
    if ink[at]:
        for k in range(1, SNAP + 1):
            j = at - step * k
            if not lo <= j < hi:
                return at
            if not ink[j]:
                return j + step
        return at
    for k in range(1, SNAP + 1):
        j = at + step * k
        if not lo <= j < hi:
            return at
        if ink[j]:
            return j
    return at


def snap(g, rect):
    h, w = g.shape
    x0, y0, x1, y1 = clip(rect, (w, h))
    if x1 <= x0 or y1 <= y0:
        return tuple(rect)
    # A dense run can occupy most of the OCR box. Estimate the page from its
    # surrounding ring so the fit never mistakes that run for the background.
    around = g[max(0, y0 - 2):min(h, y1 + 2), max(0, x0 - 2):min(w, x1 + 2)]
    ring = np.ones(around.shape, bool)
    cy, cx = y0 - max(0, y0 - 2), x0 - max(0, x0 - 2)
    ring[cy:cy + y1 - y0, cx:cx + x1 - x0] = False
    bg = np.median(around[ring]) if ring.any() else np.median(g[y0:y1, x0:x1])
    off = max(0, x0 - SNAP - 1)
    band = g[y0:y1, off:min(w, x1 + SNAP + 1)]
    cols = (abs(band - bg) >= INK).any(axis=0)
    nx0 = _edge(cols, x0 - off, 1, 0, len(cols)) + off
    nx1 = _edge(cols, x1 - 1 - off, -1, 0, len(cols)) + off + 1
    if nx1 <= nx0:
        nx0, nx1 = x0, x1
    offy = max(0, y0 - SNAP - 1)
    stripe = g[offy:min(h, y1 + SNAP + 1), nx0:nx1]
    rows = (abs(stripe - bg) >= INK).any(axis=1)
    ny0 = _edge(rows, y0 - offy, 1, 0, len(rows)) + offy
    ny1 = _edge(rows, y1 - 1 - offy, -1, 0, len(rows)) + offy + 1
    if ny1 <= ny0:
        ny0, ny1 = y0, y1
    return nx0, ny0, nx1, ny1


def overlaps(a, b):
    return intersection(a, b) >= 0.5 * min(area(a), area(b))


def regions(files, per, dilate=None):
    dilate = DILATE if dilate is None else dilate
    regs = [{"rect": tuple(box), "frames": {i}} for i, boxes in enumerate(per)
            for box in boxes if area(box)]
    # Restart after each union: a larger rectangle can bridge earlier regions.
    merging = True
    while merging:
        merging = False
        for i in range(len(regs)):
            for j in range(i + 1, len(regs)):
                if overlaps(regs[i]["rect"], regs[j]["rect"]):
                    regs[i]["rect"] = union(regs[i]["rect"], regs[j]["rect"])
                    regs[i]["frames"].update(regs[j]["frames"])
                    del regs[j]
                    merging = True
                    break
            if merging:
                break
    output = [[] for _ in files]
    for region in regs:
        found = sorted(region["frames"])
        rect = region["rect"]
        samples = sorted(set(found[::15] + [found[0], found[-1]]))
        fits = [snap(gray(files[i]), rect) for i in samples]
        fits = [f for f in fits if f != rect] or [rect]
        fitted = fits[0]
        for fit in fits[1:]:
            fitted = union(fitted, fit)
        region["rect"] = fitted
        near = {j for i in found for j in range(max(0, i - dilate), min(len(files), i + dilate + 1))}
        for i in sorted(near):
            output[i].append(fitted)
    return output, regs


def crossings(g, box, level):
    """The proof's direct edge test, also at low contrast during fade-in."""
    h, w = g.shape
    x0, y0, x1, y1 = box
    ring = np.zeros(g.shape, bool)
    ring[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2] = True
    ring[y0:y1, x0:x1] = False
    bg = np.median(g[ring]) if ring.any() else 255
    ink = np.abs(g - bg) >= level
    counts = []
    if x0 > 0:
        counts.append(np.sum(ink[y0:y1, x0 - 1] & ink[y0:y1, x0]))
    if x1 < w:
        counts.append(np.sum(ink[y0:y1, x1] & ink[y0:y1, x1 - 1]))
    if y0 > 0:
        counts.append(np.sum(ink[y0 - 1, x0:x1] & ink[y0, x0:x1]))
    if y1 < h:
        counts.append(np.sum(ink[y1, x0:x1] & ink[y1 - 1, x0:x1]))
    return int(sum(counts))
