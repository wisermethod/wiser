#!/usr/bin/env python3
"""Screen Capture's redaction core. Stdlib only until flags, paths and dependencies pass."""
import json
import math
import sys
from pathlib import Path

# Prevent bytecode writes alongside shipped scripts, including spawned workers.
sys.dont_write_bytecode = True

from paths import CaptureError, screen, same_file

TOOL = Path(__file__).resolve().parent.parent
USAGE = """Screen Capture - redact and verify existing images and recordings on macOS.

Usage:
  python3 scripts/capture.py help
  python3 scripts/capture.py --help
  python3 scripts/capture.py redact --input <absolute path> --output <absolute path>
      --report <absolute path> [--term <text>]... [--region <x,y,w,h>]...
      [--fps <n>] [--install]
  python3 scripts/capture.py verify --input <absolute path> --report <absolute path>
      [--term <text>]... [--fps <n>] [--install]

Commands: help, redact, verify.
Options:
  --input <path>       Existing PNG still, or MOV/MP4 recording; absolute path.
  --output <path>      New PNG for a still, MP4 for a recording; outside this tool.
  --report <path>      New JSON report, absolute, outside this tool; counts and places only.
  --term <text>        Repeatable address or name, held only in memory; case/whitespace/OCR folding.
  --region <x,y,w,h>   Repeatable integer rectangle, in output pixels; redact only, all frames, no fit.
  --fps <n>           Recording decode rate, positive number; default 30.
  --install           Authorize pinned wheels into this tool's .venv, pip cache off;
                      WISER_ALLOW_INSTALL=1 also authorizes an unattended run.
  --help              Print this message before any dependency check.

Frames in reports are zero-indexed; boxes are [left, top, right, bottom], exclusive.
Recordings are encoded as silent H.264 MP4. Failed checks withhold the output.
Success: one JSON object, exit 0. Failure: stderr only, exit 1, with a cause and fix.
"""


def parse(argv):
    if not argv or argv[0] in ("help", "--help"):
        if len(argv) > 1:
            raise CaptureError("help accepts no extra arguments; run python3 scripts/capture.py help")
        return None
    command = argv[0]
    allowed = {"--input", "--report", "--term", "--fps", "--install", "--help"}
    if command == "redact":
        allowed.update(("--output", "--region"))
    elif command != "verify":
        raise CaptureError("unknown command " + command + "; run python3 scripts/capture.py help")
    values = {"--term": [], "--region": []}
    index = 1
    while index < len(argv):
        option = argv[index]
        if option not in allowed:
            # Print the flag name only, never a value that might contain a term.
            name = option.split("=", 1)[0] if option.startswith("-") else "(positional argument)"
            raise CaptureError("unknown option " + name + "; run python3 scripts/capture.py help")
        if option in values and option not in ("--term", "--region"):
            raise CaptureError(option + " was repeated; give it once and consult help")
        if option in ("--install", "--help"):
            values[option] = True
            index += 1
            continue
        if index + 1 == len(argv) or argv[index + 1].startswith("--"):
            raise CaptureError(option + " needs a value; consult help")
        value = argv[index + 1]
        if option in ("--term", "--region"):
            values[option].append(value)
        else:
            values[option] = value
        index += 2
    if values.get("--help"):
        return None
    for option in ("--input", "--report") + (("--output",) if command == "redact" else ()):
        if option not in values:
            raise CaptureError(option + " is required; consult help")
    if any(not value.strip() for value in values["--term"]):
        raise CaptureError("--term is empty; give nonblank text or omit it")
    try:
        fps = float(values.get("--fps", 30))
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError()
    except ValueError:
        raise CaptureError("--fps must be finite and positive; use 30 unless another decode rate is needed") from None
    named = []
    for value in values["--region"]:
        try:
            x, y, w, h = map(int, value.split(","))
            if min(x, y) < 0 or min(w, h) <= 0:
                raise ValueError()
            named.append((x, y, x + w, y + h))
        except ValueError:
            raise CaptureError("--region must be x,y,w,h with nonnegative integer x,y and positive w,h; consult help") from None
    source = screen(values["--input"], "--input", TOOL)
    if source.suffix.lower() not in (".png", ".mov", ".mp4"):
        raise CaptureError("--input must resolve to PNG, MOV or MP4; choose a supported file")
    if source.suffix.lower() == ".png" and "--fps" in values:
        raise CaptureError("--fps applies to recordings; omit it for a still")
    report = screen(values["--report"], "--report", TOOL, True)
    output = screen(values["--output"], "--output", TOOL, True) if command == "redact" else None
    all_paths = [source, report] + ([output] if output else [])
    for i, a in enumerate(all_paths):
        for b in all_paths[i + 1:]:
            if a == b or same_file(a, b):
                raise CaptureError("input, output and report must be different files; choose new destination names")
    if output and output.suffix.lower() != (".png" if source.suffix.lower() == ".png" else ".mp4"):
        raise CaptureError("--output must be PNG for a still or MP4 for a recording; correct its extension")
    return command, source, output, report, values["--term"], named, fps, values.get("--install", False)


def main(argv=None):
    try:
        argv = sys.argv[1:] if argv is None else argv
        parsed = parse(argv)
        if parsed is None:
            sys.stdout.write(USAGE)
            return 0
        command, source, output, report, terms, named, fps, authorised = parsed
        # Local presence checks precede any install, and only run where needed.
        import shutil
        import subprocess
        dependencies = ["tesseract"]
        if source.suffix.lower() != ".png":
            dependencies.append("ffmpeg")
            if command == "redact":
                dependencies.append("ffprobe")
        for dependency in dependencies:
            flag = "--version" if dependency == "tesseract" else "-version"
            if not shutil.which(dependency) or subprocess.run([dependency, flag], stdout=subprocess.DEVNULL,
                                                            stderr=subprocess.DEVNULL).returncode:
                raise CaptureError("missing " + dependency + "; check: " + dependency + " " + flag + ". Make that check pass and retry")
        from install import ensure
        ensure(TOOL, authorised, argv)
        from pipeline import execute
        result = execute(command, source, output, report, terms, named, fps)
        sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
        return 0
    except CaptureError as error:
        sys.stderr.write("Error: " + str(error) + "\n")
    except (Exception, KeyboardInterrupt):
        # Native OCR/provider exceptions can contain text. Never echo their body.
        sys.stderr.write("Error: processing failed or was interrupted; check the input, package cache, permissions and disk space, then retry\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
