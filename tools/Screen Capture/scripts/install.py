"""The tool-local wheel cache and plugin-scoped install consent (stdlib only)."""
import importlib.metadata
import json
import os
import re
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


def required_pins(tool):
    pins = {}
    for line in (tool / "requirements.txt").read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        requirement, separator, marker = line.partition(";")
        if separator:
            # The manifest uses only these two Python-version markers. Fail
            # closed if a later manifest introduces an unsupported expression.
            match = re.fullmatch(r'\s*python_version\s*(<|>=)\s*"(\d+)\.(\d+)"\s*', marker)
            if not match:
                raise ValueError("unsupported requirement marker")
            before = sys.version_info[:2] < (int(match[2]), int(match[3]))
            if before != (match[1] == "<"):
                continue
        match = re.fullmatch(r"\s*([A-Za-z0-9_.-]+)==([^\s;]+)\s*", requirement)
        if not match:
            raise ValueError("requirement must be pinned")
        pins[re.sub(r"[-_.]+", "-", match[1]).lower()] = match[2]
    return pins


def ready(cache):
    site = cache / ("lib/python%d.%d/site-packages" % sys.version_info[:2])
    try:
        pins = required_pins(cache.parent)
        found = {}
        for dist in importlib.metadata.distributions(path=[str(site)]):
            name = dist.metadata.get("Name")
            if name:
                key = re.sub(r"[-_.]+", "-", name).lower()
                found.setdefault(key, set()).add(dist.version)
        return bool(pins) and all(found.get(name) == {version} for name, version in pins.items())
    except (OSError, ValueError):
        return False


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
        failure = ("wheel install failed; remove the incomplete .venv at " + str(cache) +
                   " and retry with --install after checking python3 -m venv, pinned wheel support and directory permissions")
        try:
            if not python.is_file():
                subprocess.run([sys.executable, "-m", "venv", str(cache)], check=True,
                               env=install_env(cache), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            sys.stderr.write("First run: installing dependencies into " + str(cache) + "\n")
            # Wheels only: an unsupported interpreter must fail, never compile.
            result = subprocess.run([str(python), "-m", "pip", "install", "--only-binary=:all:",
                                     "--no-cache-dir", "--disable-pip-version-check", "-r",
                                     str(tool / "requirements.txt")], env=install_env(cache),
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if result.returncode or not ready(cache):
                raise CaptureError(failure)
        except (OSError, subprocess.SubprocessError):
            raise CaptureError(failure) from None
    if Path(sys.prefix).resolve() != cache.resolve():
        if os.environ.get("WISER_CAPTURE_CACHE_RUN") == "1" or not python.is_file():
            raise CaptureError("the .venv interpreter is incomplete; remove it and retry with --install")
        os.environ["WISER_CAPTURE_CACHE_RUN"] = "1"
        os.execv(str(python), [str(python), "-B", str(tool / "scripts" / "capture.py")] + argv)
