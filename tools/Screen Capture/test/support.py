"""All fixtures are synthetic and are generated inside the runner's scratch directory."""
import os
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL / "scripts"))

ADDRESS = "riley.q@example.org"
NAME = "Riley Quintero"


def temporary():
    return tempfile.TemporaryDirectory(prefix="screen-capture-test-", dir=os.environ.get("WISER_TEST_SCRATCH"))


def font(size=32):
    return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)


def still(path, text=NAME, location=(45, 65), size=(900, 260)):
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    draw.text(location, text, font=font(), fill="black")
    box = draw.textbbox(location, text, font=font())
    image.save(path)
    return image, box


def failing_worker(job):
    raise RuntimeError(NAME)


def refusing_worker(job):
    from paths import CaptureError
    raise CaptureError("Tesseract OCR failed; check: tesseract --version, then retry with a readable frame")
