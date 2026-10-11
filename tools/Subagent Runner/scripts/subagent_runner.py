#!/usr/bin/env python3
"""Run one builder or reviewer through a vendor command-line tool.

The rules this file follows are stated once, in
system/templates/Script Contract.md.
"""

import sys

# Before any local import, so this process writes no bytecode into the tool.
sys.dont_write_bytecode = True

import os
from pathlib import Path

os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import engine  # noqa: E402


if __name__ == "__main__":
    try:
        sys.exit(engine.main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.stderr.write("Error: interrupted before the delegate started.\n")
        sys.exit(1)
