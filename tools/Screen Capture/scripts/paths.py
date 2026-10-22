"""Canonical caller paths, screened by filesystem identity before any open."""
import os
import sys
import errno
from pathlib import Path


class CaptureError(Exception):
    pass


def same_file(a, b):
    try:
        x, y = os.stat(a), os.stat(b)
        return (x.st_dev, x.st_ino) == (y.st_dev, y.st_ino)
    except OSError:
        return False


def canonical(path):
    try:
        result = Path(path).resolve()
        # Python 3.13+ resolve(strict=False) leaves a loop unresolved. Probe the
        # deepest existing ancestor as well, allowing absence and nothing else.
        probe = result
        while True:
            try:
                probe.stat()
                break
            except (FileNotFoundError, NotADirectoryError):
                if probe == probe.parent:
                    break
                probe = probe.parent
        return result
    except (OSError, RuntimeError):
        raise CaptureError("path cannot be resolved; repair unreadable folders or symbolic link loops and retry") from None


def deepest(path):
    while True:
        try:
            path.stat()
            return path
        except (FileNotFoundError, NotADirectoryError):
            if path == path.parent:
                return path
            path = path.parent
        except OSError as error:
            if error.errno == errno.ELOOP:
                raise CaptureError("path cannot be resolved; repair the symbolic link loop and retry") from None
            raise CaptureError("path cannot be screened; check folder permissions and retry") from None


def inside(path, directory):
    probe = deepest(path)
    while True:
        if same_file(probe, directory):
            return True
        if probe == probe.parent:
            return False
        probe = probe.parent


def config_dir():
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "wiser"
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))) / "wiser"
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "wiser"


def screen(value, option, tool, destination=False, directory=False):
    if not Path(value).is_absolute():
        raise CaptureError(option + " must be absolute; pass a full path")
    path = canonical(value)
    key = config_dir() / "auth-provider.env"
    # Compare identities without ever reading credentials. A hard link keeps identity.
    if same_file(path, key) or path == canonical(key):
        raise CaptureError(option + " names the connector key; choose a work file")
    # The key's directory is reserved for credentials, even when it does not exist yet.
    reserved = canonical(key.parent)
    if path == reserved or reserved in path.parents or inside(path, reserved):
        raise CaptureError(option + " is in the credential directory; choose a work file")
    if destination:
        if inside(path, tool):
            raise CaptureError(option + " resolves inside the tool; choose a work directory")
        if path.exists():
            raise CaptureError(option + " already exists; choose a new filename")
        if not path.parent.is_dir():
            raise CaptureError(option + " parent is absent; create the work directory and retry")
    elif not (path.is_dir() if directory else path.is_file()):
        raise CaptureError(option + " is not a readable file or directory; check its path")
    return path
