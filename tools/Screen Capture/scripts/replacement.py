"""Replace letters with glyph-like strokes of two colours, seeded by the box size, then the approved soft blur."""
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PAD = 1
FEATHER = 3
SIGMA_PER_LINE = 0.3
SIGMA_MIN, SIGMA_MAX = 4.0, 12.0
CORNER_PER_LINE, CORNER_MAX = 0.35, 8.0


def colours(a, box):
    x0, y0, x1, y1 = box
    h, w = a.shape[:2]
    # A two-pixel ring, excluding every pixel inside the box.
    crop = a[max(0, y0 - 2):min(h, y1 + 2), max(0, x0 - 2):min(w, x1 + 2)]
    ring = np.ones(crop.shape[:2], bool)
    cy, cx = y0 - max(0, y0 - 2), x0 - max(0, x0 - 2)
    ring[cy:cy + y1 - y0, cx:cx + x1 - x0] = False
    bg = np.median(crop[ring], axis=0) if ring.any() else np.array([255., 255., 255.])
    pixels = a[y0:y1, x0:x1]
    grey = pixels[..., 0] * 0.299 + pixels[..., 1] * 0.587 + pixels[..., 2] * 0.114
    bg_grey = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114
    ink = pixels[np.abs(grey - bg_grey) >= 40]
    return bg, np.median(ink, axis=0) if ink.size else bg


def replacement(width, height, bg, ink):
    """No location, source pixels, text or letter shape can enter this function.

    Glyph-like strokes at about the ink density of a line of text, so that after the blur the box reads as softened
    text, as the approved blur did, rather than as solid bars. Drawn at four times the size and reduced, so the
    strokes are anti-aliased; every choice comes from a generator seeded by the box's width and height alone.
    """
    rng = random.Random((width << 32) | height)
    scale = 4
    big_w, big_h = width * scale, height * scale
    mask = Image.new("L", (big_w, big_h), 0)
    draw = ImageDraw.Draw(mask)
    top, base = round(0.30 * big_h), round(0.74 * big_h)
    stem = max(scale, round(0.13 * big_h))
    x, letters = round(0.06 * big_w), 0
    while x < big_w - stem:
        advance = round(big_h * rng.uniform(0.42, 0.62))
        kind = rng.random()
        draw.rectangle((x, round(0.12 * big_h) if kind < 0.18 else top, x + stem, base), fill=255)
        if kind > 0.45:
            draw.rectangle((x + advance - 2 * stem, top, x + advance - stem, base), fill=255)
        if 0.3 < kind < 0.75:
            draw.rectangle((x, top, x + advance - stem, top + stem), fill=255)
        x += advance
        letters += 1
        if letters >= rng.randint(6, 14):
            x += round(big_h * rng.uniform(0.20, 0.30))
            letters = 0
    coverage = np.asarray(mask.resize((width, height), Image.LANCZOS), dtype=np.float32)[..., None] / 255.0
    return bg + coverage * (ink - bg)


def soften(image, rects):
    original = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = original.shape[:2]
    sanitized = original.copy()
    prepared = []
    for r in rects:
        x0, y0, x1, y1 = max(0, r[0] - PAD), max(0, r[1] - PAD), min(w, r[2] + PAD), min(h, r[3] + PAD)
        if x1 <= x0 or y1 <= y0:
            continue
        bg, ink = colours(original, (x0, y0, x1, y1))
        # Sanitize ALL boxes before any convolution, including nearby boxes in its context.
        sanitized[y0:y1, x0:x1] = replacement(x1 - x0, y1 - y0, bg, ink)
        prepared.append(((x0, y0, x1, y1), r[3] - r[1], bg))
    a = sanitized.copy()
    for (x0, y0, x1, y1), line_height, bg in prepared:
        sigma = min(SIGMA_MAX, max(SIGMA_MIN, SIGMA_PER_LINE * line_height))
        e = FEATHER + math.ceil(3 * sigma)
        ex0, ey0, ex1, ey1 = max(0, x0 - e), max(0, y0 - e), min(w, x1 + e), min(h, y1 + e)
        crop = sanitized[ey0:ey1, ex0:ex1].copy()
        cx0, cy0, cx1, cy1 = x0 - ex0, y0 - ey0, x1 - ex0, y1 - ey0
        soft = np.asarray(Image.fromarray(np.clip(crop + 0.5, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(sigma)), dtype=np.float32)
        under = a[ey0:ey1, ex0:ex1].copy()
        under[cy0:cy1, cx0:cx1] = bg
        radius = min(CORNER_MAX, CORNER_PER_LINE * (cy1 - cy0), (cx1 - cx0) / 2)
        yy, xx = np.mgrid[0:crop.shape[0], 0:crop.shape[1]]
        dx = np.maximum(np.maximum(cx0 + radius - xx, xx - (cx1 - 1 - radius)), 0)
        dy = np.maximum(np.maximum(cy0 + radius - yy, yy - (cy1 - 1 - radius)), 0)
        t = np.clip(1 - np.maximum(np.hypot(dx, dy) - radius, 0) / FEATHER, 0, 1)
        alpha = (t * t * (3 - 2 * t))[..., None]
        a[ey0:ey1, ex0:ex1] = alpha * soft + (1 - alpha) * under
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
