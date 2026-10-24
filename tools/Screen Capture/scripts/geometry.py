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


def _merges(shared, a, b):
    """The one merge rule, for single boxes and for rows of them: the shared area is at least half the smaller box's."""
    return shared >= 0.5 * np.minimum(a, b)


def overlaps(a, b):
    return bool(_merges(intersection(a, b), area(a), area(b)))


def _overlapping(rect, rects):
    """overlaps(rect, each row of rects) at once, by the same rule and arithmetic."""
    shared = (np.maximum(0, np.minimum(rect[2], rects[:, 2]) - np.maximum(rect[0], rects[:, 0])) *
              np.maximum(0, np.minimum(rect[3], rects[:, 3]) - np.maximum(rect[1], rects[:, 1])))
    sizes = np.maximum(0, rects[:, 2] - rects[:, 0]) * np.maximum(0, rects[:, 3] - rects[:, 1])
    return _merges(shared, area(rect), sizes)


def merge(rects):
    """Each group's rectangle and member indices, ordered by its first member. The groups are exactly those of
    repeatedly merging the first overlapping pair, in list order, and restarting, since a larger rectangle can bridge
    earlier regions and overlap is not monotone as rectangles grow. Only what a union can change is read again: the
    pairs before the grown rectangle, then its row and the rows after it, each row at once, so a recording with
    thousands of boxes takes seconds where restarting from the first pair took an hour."""
    if not rects:
        return []
    # Within 2**25 px every area is below 2**52, where NumPy's int64 and float64 agree exactly with Python's
    # comparison; a frame is far smaller, and anything larger is refused rather than merged differently.
    if any(abs(v) >= 2 ** 25 for r in rects for v in r):
        raise ValueError("box coordinates beyond 2**25 px")
    integral = all(isinstance(v, (int, np.integer)) for r in rects for v in r)
    box = np.array(rects, dtype=np.int64 if integral else np.float64)
    members = [[k] for k in range(len(rects))]
    alive = np.ones(len(rects), bool)
    start = 0  # every pair whose first rectangle comes before this index is known not to overlap
    while True:
        live = np.flatnonzero(alive)
        found = None
        for at in range(int(np.searchsorted(live, start)), len(live) - 1):
            hit = np.flatnonzero(_overlapping(box[live[at]], box[live[at + 1:]]))
            if len(hit):
                found = int(live[at]), int(live[at + 1 + hit[0]])
                break
        if found is None:
            break
        keep, gone = found
        while True:
            box[keep] = (min(box[keep][0], box[gone][0]), min(box[keep][1], box[gone][1]),
                         max(box[keep][2], box[gone][2]), max(box[keep][3], box[gone][3]))
            members[keep] += members[gone]
            alive[gone] = False
            # The grown rectangle may now overlap one before it, which is then the first overlapping pair.
            before = np.flatnonzero(alive[:keep])
            hit = np.flatnonzero(_overlapping(box[keep], box[before])) if len(before) else []
            if not len(hit):
                break
            keep, gone = int(before[hit[0]]), keep
        start = keep
    cast = int if integral else float
    return [(tuple(cast(v) for v in box[k]), members[k]) for k in np.flatnonzero(alive)]


def regions(files, per, dilate=None):
    dilate = DILATE if dilate is None else dilate
    found = [(tuple(box), i) for i, boxes in enumerate(per) for box in boxes if area(box)]
    regs = [{"rect": rect, "frames": {found[k][1] for k in ids}} for rect, ids in merge([b for b, _ in found])]
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
