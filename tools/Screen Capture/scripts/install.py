"""The tool-local wheel cache and person- and copy-scoped install consent (stdlib only)."""
import importlib.metadata
import json
import os
import re
import stat
import uuid
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


def config_dir():
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "wiser"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "wiser"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "wiser"


def trusted_config_dir(directory):
    # Windows trusts the marker by its location in the person's own profile.
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode):
        raise OSError("the user-config directory is not a real directory")
    if sys.platform != "win32":
        if info.st_uid != os.getuid():
            raise OSError("the user-config directory is owned by another user")
        if info.st_mode & 0o022:
            raise OSError("the user-config directory is writable by group or others")


def person_marker_grants():
    """Same directory and descriptor trust boundary as tools/lib/consent.js."""
    try:
        directory = config_dir()
        trusted_config_dir(directory)
        fd = os.open(directory / ".wiser-consent", os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                return False
            if sys.platform != "win32" and (info.st_uid != os.getuid() or info.st_mode & 0o022):
                return False
            data = json.load(stream)
        if (not isinstance(data, dict) or data.get("scope") != "person"
                or not isinstance(data.get("tool"), str) or not data["tool"]
                or not isinstance(data.get("date"), str)
                or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", data["date"])):
            return False
        return date.fromisoformat(data["date"]).isoformat() == data["date"]
    except (OSError, ValueError):
        return False


def write_marker(path, payload):
    temporary = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(json.dumps(payload) + "\n")
        os.replace(temporary, path)
        return True
    except OSError:
        return False  # Explicit authorization still permits this install.
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def copy_only(error, saved=True):
    reason = str(error).splitlines()[0]
    message = "This consent covers only this copy" if saved else "This run is authorised and no consent was saved"
    sys.stderr.write(message + ": " + reason + ".\n")


def warn_copy_consent():
    if not person_marker_grants():
        try:
            trusted_config_dir(config_dir())
        except OSError as error:
            copy_only(error)


def write_person_consent(payload, copy_marker=None, realpath=None):
    person_error = None
    try:
        directory = config_dir()
        missing = []
        parent = directory
        while not parent.exists() and not parent.is_symlink():
            missing.append(parent)
            parent = parent.parent
        for parent in reversed(missing):
            parent.mkdir(mode=0o700, exist_ok=True)
        trusted_config_dir(directory)
        if not write_marker(directory / ".wiser-consent", dict(payload, scope="person")):
            raise OSError("the person marker could not be written")
    except OSError as error:
        person_error = error
    saved = write_marker(copy_marker, dict(payload, realpath=realpath)) if copy_marker is not None else False
    if person_error is not None:
        copy_only(person_error, saved)


def ensure(tool, authorised, argv):
    cache = tool / ".venv"
    python = cache / "bin" / "python3"
    if not ready(cache):
        root = plugin_root(tool)
        explicit = authorised or os.environ.get("WISER_ALLOW_INSTALL") == "1"
        consent = False
        if root:
            try:
                fd = os.open(root / ".wiser-consent", os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
                with os.fdopen(fd, "r", encoding="utf-8") as stream:
                    if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                        raise OSError("the copy marker is not a regular file")
                    marker = json.load(stream)
                consent = isinstance(marker, dict) and marker.get("realpath") == str(root)
            except (ValueError, OSError):
                pass
        if not (explicit or consent or person_marker_grants()):
            raise CaptureError("Wiser asks once per person; a yes covers this install and later installs by any Wiser tool in any copy. packages missing: PyObjC 11.1 (Cocoa, Quartz, CoreML, Vision), Pillow 11.3.0, "
                               "NumPy 2.0.2 (Python <3.11) or 2.3.5 (Python >=3.11). "
                               "Install fetches roughly 100 MB from pypi.org and files.pythonhosted.org into "
                               + str(cache) + "; pip cache is off. Retry with --install or WISER_ALLOW_INSTALL=1")
        if not explicit:
            warn_copy_consent()
        if explicit:
            payload = {"date": date.today().isoformat(), "tool": "Screen Capture"}
            write_person_consent(payload, root / ".wiser-consent" if root else None, str(root))
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
