"""Disposable person profile for a Python test worker and every child."""
import atexit
import os
import tempfile
_home = tempfile.TemporaryDirectory(prefix="wiser-python-suite-home-")
atexit.register(_home.cleanup)
os.environ.update(HOME=_home.name, USERPROFILE=_home.name, PIP_NO_INDEX="1")
os.environ["TMPDIR"] = os.path.join(_home.name, "tmp")
os.mkdir(os.environ["TMPDIR"])
tempfile.tempdir = os.environ["TMPDIR"]
for _key in ("XDG_CONFIG_HOME", "APPDATA", "LOCALAPPDATA", "WISER_ALLOW_INSTALL"):
    os.environ.pop(_key, None)
