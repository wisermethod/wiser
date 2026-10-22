"""The tool-local wheel cache and plugin-scoped install consent (stdlib only)."""
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

from paths import CaptureError


def plugin_root(tool):
    for directory in (tool,) + tuple(tool.parents):
        if (directory / "tools" / "AGENTS.md").is_file():
            return directory.resolve()
    return None


def install_env(cache):
    env = dict(os.environ)
    env.update(PIP_NO_CACHE_DIR="1", PIP_DISABLE_PIP_VERSION_CHECK="1",
               PIP_CACHE_DIR=str(cache / "pip-cache"), XDG_CACHE_HOME=str(cache / "cache"),
               PYTHONDONTWRITEBYTECODE="1")
    return env


def ready(cache):
    return any((p / "objc" / "__init__.py").is_file()
               for p in cache.glob("lib/python*/site-packages"))


def ensure(tool, authorised, argv):
    cache = tool / ".venv"
    python = cache / "bin" / "python3"
    if not ready(cache):
        root = plugin_root(tool)
        explicit = authorised or os.environ.get("WISER_ALLOW_INSTALL") == "1"
        consent = False
        if root:
            try:
                marker = json.loads((root / ".wiser-consent").read_text())
                consent = isinstance(marker, dict) and marker.get("realpath") == str(root)
            except (ValueError, OSError):
                pass
        if not explicit and not consent:
            raise CaptureError("packages missing: PyObjC 11.1 (Cocoa, Quartz, CoreML, Vision), Pillow 11.3.0, "
                               "NumPy 2.0.2 (Python <3.11) or 2.3.5 (Python >=3.11). "
                               "Install fetches roughly 100 MB from pypi.org and files.pythonhosted.org into "
                               + str(cache) + "; pip cache is off. Retry with --install or WISER_ALLOW_INSTALL=1")
        if explicit and root:
            payload = {"realpath": str(root), "date": date.today().isoformat(), "tool": "Screen Capture"}
            marker = root / ".wiser-consent"
            marker.write_text(json.dumps(payload) + "\n")
            marker.chmod(0o600)
        try:
            if not cache.exists():
                subprocess.run([sys.executable, "-m", "venv", str(cache)], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            sys.stderr.write("First run: installing dependencies into " + str(cache) + "\n")
            # Wheels only: an unsupported interpreter must fail, never compile.
            result = subprocess.run([str(python), "-m", "pip", "install", "--only-binary=:all:",
                                     "--no-cache-dir", "--disable-pip-version-check", "-r",
                                     str(tool / "requirements.txt")], env=install_env(cache),
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if result.returncode or not ready(cache):
                raise CaptureError("wheel install failed; check the pinned requirements support this interpreter, "
                                   "remove the incomplete .venv and retry with --install")
        except OSError:
            raise CaptureError("cannot create the tool's .venv; check python3 -m venv and directory permissions") from None
    if Path(sys.prefix).resolve() != cache.resolve():
        if os.environ.get("WISER_CAPTURE_CACHE_RUN") == "1" or not python.is_file():
            raise CaptureError("the .venv interpreter is incomplete; remove it and retry with --install")
        os.environ["WISER_CAPTURE_CACHE_RUN"] = "1"
        os.execv(str(python), [str(python), str(tool / "scripts" / "capture.py")] + argv)
