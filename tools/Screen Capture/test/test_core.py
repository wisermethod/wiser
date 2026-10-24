import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image, ImageDraw
from support import temporary, font
import geometry
from geometry import changed, track, regions, crossings
from replacement import soften
from terms import Matcher


class ReplacementTests(unittest.TestCase):
    def test_letters_never_reach_blur(self):
        box = (40, 40, 380, 100)
        images = []
        for letters in ("MMMMMMM", "XXXXXXX"):
            image = Image.new("RGB", (440, 160), "white")
            draw = ImageDraw.Draw(image)
            draw.fontmode = "1"
            draw.text((50, 45), letters, font=font(42), fill="black")
            images.append(soften(image, [box]))
        a, b = [np.asarray(image)[40:100, 40:380] for image in images]
        self.assertTrue(np.array_equal(a, b), "original letter pixels reached the blur")
        self.assertGreater(np.ptp(a), 0, "replacement must retain a soft band")

    def test_still_bytes_deterministic(self):
        with temporary() as directory:
            image = Image.new("RGB", (250, 100), "white")
            ImageDraw.Draw(image).text((20, 30), "Riley Quintero", font=font(22), fill="black")
            a, b = [Path(directory) / name for name in ("a.png", "b.png")]
            for path in (a, b):
                soften(image, [(18, 25, 210, 65)]).save(path)
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_full_frame_and_empty_ink(self):
        image = Image.new("RGB", (40, 30), "white")
        self.assertEqual(soften(image, [(0, 0, 40, 30)]).tobytes(), image.tobytes())


class MechanicsTests(unittest.TestCase):
    def test_tracking_pointer_and_disappearance(self):
        with temporary() as directory:
            base = Image.new("RGB", (220, 80), "white")
            draw = ImageDraw.Draw(base)
            # Thin strokes ensure an image-area denominator would miss disappearance.
            for x in range(30, 180, 10):
                draw.rectangle((x, 30, x + 2, 45), fill="black")
            pointer = base.copy()
            ImageDraw.Draw(pointer).rectangle((60, 25, 63, 48), fill=(120, 120, 120))
            blank = Image.new("RGB", base.size, "white")
            sequence = [base, pointer, base, blank]
            files = []
            for i, image in enumerate(sequence):
                path = Path(directory) / ("f%d.png" % i)
                image.save(path)
                files.append(path)
            box = (25, 25, 185, 50)
            g = [np.asarray(image.convert("L"), dtype=np.int16)[25:50, 25:185] for image in sequence]
            self.assertGreater(changed(g[1], g[0]), 0)
            self.assertLess(changed(g[1], g[0]), 0.35)
            self.assertEqual(changed(g[3], g[0]), 1.0)
            per, added = track(files, [[box], [], [], []])
            self.assertEqual([bool(b) for b in per], [True, True, True, False],
                             "pointer coverage lost its tracked box, or vanished text retained it")
            self.assertEqual(added, 2)
            backward, _ = track(files, [[], [], [box], []])
            self.assertEqual([bool(b) for b in backward], [True, True, True, False])
            threshold = np.array([[255, 255, 0]], dtype=np.int16)
            self.assertEqual(changed(np.array([[215, 255, 0]], dtype=np.int16), threshold), 1.0)

    def test_merge_uses_half_smaller_area(self):
        with temporary() as directory:
            path = Path(directory) / "blank.png"
            Image.new("RGB", (150, 80), "white").save(path)
            a, b = (20, 20, 60, 40), (40, 20, 100, 40)
            per, regs = regions([path], [[a, b]])
            self.assertEqual(len(regs), 1, "half of the smaller area must merge even when IoU is below half")
            self.assertEqual(per, [[(20, 20, 100, 40)]])

    def test_merge_matches_restarting_from_the_first_pair(self):
        # The loop regions() used before 2026-10-24, kept as the reference: merge the first overlapping pair in list
        # order, then restart. Overlap at half the smaller area is not monotone, so order decides the groups.
        def reference(rects):
            regs = [{"rect": r, "ids": [k]} for k, r in enumerate(rects)]
            merging = True
            while merging:
                merging = False
                for i in range(len(regs)):
                    for j in range(i + 1, len(regs)):
                        if geometry.overlaps(regs[i]["rect"], regs[j]["rect"]):
                            regs[i]["rect"] = geometry.union(regs[i]["rect"], regs[j]["rect"])
                            regs[i]["ids"] += regs[j]["ids"]
                            del regs[j]
                            merging = True
                            break
                    if merging:
                        break
            return [(r["rect"], sorted(r["ids"])) for r in regs]

        rng = np.random.default_rng(20261024)
        cases = 0
        for size in (2, 3, 5, 8, 13, 40, 120):
            for _ in range(300 if size < 40 else 40):
                x0 = rng.integers(0, 60, size)
                y0 = rng.integers(0, 30, size)
                rects = [(int(a), int(b), int(a + rng.integers(1, 40)), int(b + rng.integers(1, 14)))
                         for a, b in zip(x0, y0)]
                got = [(rect, sorted(ids)) for rect, ids in geometry.merge(rects)]
                self.assertEqual(got, reference(rects), rects)
                cases += 1
        # Order matters: a small box inside a later union stops overlapping once the union outgrows it.
        rects = [(0, 0, 10, 10), (5, 0, 40, 10), (0, 0, 4, 40), (30, 0, 80, 10)]
        self.assertEqual([(r, sorted(i)) for r, i in geometry.merge(rects)], reference(rects))
        self.assertGreater(cases, 1500)

    def test_regions_scale_to_a_dense_recording(self):
        # 600 frames of a text window, about thirty boxes a frame jittering by a pixel, as the TextEdit run had.
        rng = np.random.default_rng(7)
        per = []
        for _ in range(600):
            per.append([(20 + 120 * (k % 6) + int(rng.integers(0, 2)), 30 + 22 * (k // 6) + int(rng.integers(0, 2)),
                         120 + 120 * (k % 6), 46 + 22 * (k // 6)) for k in range(30)])
        with temporary() as directory:
            path = Path(directory) / "blank.png"
            Image.new("RGB", (800, 200), "white").save(path)
            with patch.object(geometry, "snap", side_effect=lambda g, rect: rect):
                import time
                start = time.perf_counter()
                out, regs = regions([path] * 600, per)
                took = time.perf_counter() - start
        self.assertEqual(len(regs), 30)
        self.assertLess(took, 60, "merging 18,000 boxes took %.0f s" % took)

    def test_dilation_is_three_and_no_more(self):
        with temporary() as directory:
            path = Path(directory) / "blank.png"
            Image.new("RGB", (150, 80), "white").save(path)
            boxes = [[] for _ in range(13)]
            boxes[6] = [(20, 20, 100, 40)]
            per, _ = regions([path] * 13, boxes)
            self.assertEqual([i for i, b in enumerate(per) if b], list(range(3, 10)),
                             "region must cover exactly +/-3 frames")

    def test_fit_fade_and_edges(self):
        with temporary() as directory:
            files, arrays = [], []
            for i in range(31):
                image = Image.new("RGB", (160, 100), "white")
                draw = ImageDraw.Draw(image)
                # A line grows outward as low-contrast strokes fade in.
                if i:
                    value = max(0, 247 - i * 8)
                    draw.rectangle((22, 44, 120, 63), fill=(value,) * 3)
                draw.rectangle((25, 46, 118, 60), fill="black")
                path = Path(directory) / ("f%03d.png" % i)
                image.save(path)
                files.append(path)
                arrays.append(np.asarray(image.convert("L"), dtype=np.int16))
            per, _ = regions(files, [[(20, 40, 124, 68)]] * len(files))
            for i, (g, boxes) in enumerate(zip(arrays, per)):
                x0, y0, x1, y1 = boxes[0]
                padded = (x0 - 1, y0 - 1, x1 + 1, y1 + 1)
                for level in (40, 20, 8):
                    self.assertEqual(crossings(g, padded, level), 0,
                                     "stroke crosses the fitted edge on frame %d at level %d" % (i, level))
                yy, xx = np.where(np.abs(g - 255) >= 8)
                self.assertTrue(xx.min() >= padded[0] and xx.max() < padded[2] and
                                yy.min() >= padded[1] and yy.max() < padded[3],
                                "fade-in ink escaped its fitted box")

    def test_fit_samples_every_fifteenth_and_endpoints(self):
        with temporary() as directory:
            path = Path(directory) / "blank.png"
            Image.new("RGB", (150, 80), "white").save(path)
            with patch.object(geometry, "snap", wraps=geometry.snap) as snap:
                regions([path] * 32, [[(20, 20, 100, 40)]] * 32)
            self.assertEqual(snap.call_count, 4)


class TermsTests(unittest.TestCase):
    def labels(self, terms, text):
        return {label for lo, hi, label in Matcher(terms).matches(text)}

    def test_whole_fragments_parts_folding_and_edges(self):
        self.assertIn("address-shaped", self.labels([], "riley.q © example,org"))
        labels = self.labels(["riley.q@example.org"], "R I L E Y.Q @ EXAMP1E.0RG")
        self.assertIn("term 1 whole", labels)
        self.assertIn("term 1 fragment", labels)
        for fragment in ("riley.q", "example.org", "@example"):
            self.assertIn("term 1 fragment", self.labels(["riley.q@example.org"], fragment))
        self.assertIn("term 1 whole", self.labels(["riley.q@example.org"], "riley.q@example.orgsafely"))
        self.assertIn("term 1 whole", self.labels(["Riley Quintero"], "RI|EY\nQUINTER0"))
        self.assertIn("term 1 part", self.labels(["Riley Quintero"], "(Quintero)"))
        self.assertIn("term 1 part", self.labels(["Mark Stone"], "Mark"))
        self.assertEqual(self.labels(["Mark", "Mark Stone"], "Marketplace"), set())
        self.assertEqual(self.labels(["Riley Quintero"], "Rileys"), set())

    def test_unknown_address_is_matched_as_read(self):
        # Tesseract's sparse mode puts each block on its own line; a stray glyph read as "©" must not join them.
        self.assertNotIn("address-shaped", self.labels([], "Contact\n©\nSupport.Team"))
        self.assertNotIn("address-shaped", self.labels([], "Writing ©? reply.now"))
        self.assertIn("address-shaped", self.labels([], "riley.q @ example.org"))
        # A page that shortens an address leaves no ending; the address is still found by its cut-off mark.
        for shortened in ("Signed in as riley.q@exampl\u2026", "me@gmai\u2026 Settings", "ed@acme...",
                          "riley.q@exampleorg.\nNext", "Account riley.q@exampl."):
            self.assertIn("address-shaped", self.labels([], shortened), shortened)
        # The last is OCR noise as Tesseract's sparse mode gives it: two letters, a misread "@", a word, a line end.
        for ordinary in ("dev@mini:~$ ls", "user@MacBook-Pro:~ %", "Today@Apple is here", "main@HEAD -> origin",
                         "to@Wiser\n\n& Home"):
            self.assertNotIn("address-shaped", self.labels([], ordinary), ordinary)
        self.assertNotIn("address-shaped", self.labels([], "Contact © Support"))
        self.assertNotIn("address-shaped", self.labels([], "Follow @wisermemory"))
        # Two letters run into a misread "@" are OCR noise, not a shortened address.
        self.assertNotIn("address-shaped", self.labels([], "to@Wiser? Yes, now"))
        self.assertIn("term 1 whole", self.labels(["riley.q@example.org"], "riley.q\n@\nexample.org"))

    def test_a_short_address_fragment_matches_only_as_a_word(self):
        self.assertEqual(self.labels(["me@gmail.com"], "Home Menu"), set())
        self.assertIn("term 1 fragment", self.labels(["me@gmail.com"], "Signed in as me"))

    def test_offsets_and_numbered_classes(self):
        text = "Hi 🙂 R I L E Y Quintero!"
        matches = Matcher(["Nobody", "Riley Quintero"]).matches(text)
        whole = [(lo, hi) for lo, hi, label in matches if label == "term 2 whole"]
        self.assertEqual([text[lo:hi] for lo, hi in whole], ["R I L E Y Quintero"])


if __name__ == "__main__":
    unittest.main()
