"""Synthetic-file redaction equivalence; no display, app or event APIs."""
import runpy as _runpy
from pathlib import Path as _IsolationPath
_runpy.run_path(str(_IsolationPath(__file__).parent / '../../lib/tests/isolated_home.py'))
from pathlib import Path
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
from support import temporary
import media
import pipeline


class ParallelTests(unittest.TestCase):
    def test_parallel_and_serial_redaction_every_frame_byte_identical(self):
        with temporary() as directory:
            root = Path(directory)
            raw = root / 'raw'
            raw.mkdir()
            # Every frame differs, so worker-order output cannot pass accidentally.
            for i in range(9):
                image = Image.new('RGB', (160, 96), (245 - i * 7, 248, 250))
                draw = ImageDraw.Draw(image)
                draw.rectangle((5 + i * 10, 8, 12 + i * 10, 15), fill=(i * 20, 30, 50))
                draw.rectangle((40, 44, 112, 58), fill=(30, 40, 50))
                image.save(raw / ('f%05d.png' % (i + 1)))
            source = root / 'source.mp4'
            media.encode(raw, source, 6)
            rendered_bytes, decoded_bytes = [], []
            original_render = pipeline.render_frames
            for workers in (1, 3):
                captured = []
                def render(*args, **kwargs):
                    original_render(*args, **kwargs)
                    captured.extend(p.read_bytes() for p in sorted(args[2].glob('f*.png')))
                output = root / ('out%d.mp4' % workers)
                with patch.object(pipeline, 'render_frames', side_effect=render):
                    result = pipeline.execute('redact', source, output, root / ('report%d.json' % workers),
                                              named=[(38, 42, 115, 61)], fps=6, workers=workers)
                self.assertEqual(result['frames'], 9)
                self.assertEqual(result['check']['hits_per_engine'], {'vision': 0, 'tesseract': 0})
                self.assertEqual(len(captured), 9)
                rendered_bytes.append(captured)
                frames = media.decode(output, root / ('decoded%d' % workers), 6)
                self.assertEqual(len(frames), 9)
                decoded_bytes.append([p.read_bytes() for p in frames])
            self.assertEqual(len(set(rendered_bytes[0])), 9)
            for index in range(9):
                self.assertEqual(rendered_bytes[0][index], rendered_bytes[1][index],
                                 'redacted PNG bytes differ at frame %d' % index)
                self.assertEqual(decoded_bytes[0][index], decoded_bytes[1][index],
                                 'encoded/decoded frame bytes differ at frame %d' % index)


if __name__ == '__main__':
    unittest.main()
