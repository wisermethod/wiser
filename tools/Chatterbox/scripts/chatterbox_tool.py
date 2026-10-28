#!/usr/bin/env python3
"""Local Chatterbox operation. Imports are standard-library-only until run_engine()."""
import base64
import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import re
import shutil
import stat
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch

TOOL = Path(__file__).resolve().parent.parent
PLUGIN = TOOL.parent.parent
VENV = TOOL / ".venv"
REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
MODEL = "ResembleAI/chatterbox"
ENGINE_FOLDER = "chatterbox-0.1.7-" + REVISION
SEED, MAX_WORDS, LIMIT = 20261026, 35, 3.0
SETTINGS = {"device": "mps", "exaggeration": 0.7, "cfg_weight": 0.3,
            "seed": SEED, "seed_step": 1, "max_words": MAX_WORDS,
            "trim_db": -50, "mark_gap_s": 0.5, "sentence_gap_s": 0.3,
            "repetition_penalty": 1.2, "min_p": 0.05, "top_p": 1.0, "temperature": 0.8}
WATERMARK = {"name": "Resemble PerTh", "applied_by": "chatterbox-tts",
             "enabled": True, "disable_switch": False, "device": "cpu",
             "post_join_detection_tested": False}
# Measured footprints rounded up to GiB; 2 GiB is a conservative install reserve,
# not a measured peak. Both destinations must have room for the entire route.
SPACE = {"environment_gib": 1.3, "weights_gib": 3.0, "caller_alignment_gib": 0.4,
         "install_headroom_gib": 2.0}
REQUIRED_BYTES = math.ceil(sum(SPACE.values()) * 1024 ** 3)
PAUSE = re.compile(r"<#[0-9]+(?:\.[0-9]+)?#>")
USAGE = """Chatterbox: local English speech from text and a reference, on Apple silicon MPS.
Usage: python3 scripts/chatterbox_tool.py help
       python3 scripts/chatterbox_tool.py check [--model-cache /absolute/models]
       python3 scripts/chatterbox_tool.py install --route-chosen [--install]
           [--model-cache /absolute/models]
       python3 scripts/chatterbox_tool.py trial --reference /absolute/reference.wav
           --output /absolute/trial.wav [--model-cache /absolute/models]
       python3 scripts/chatterbox_tool.py synthesize --text /absolute/scene.txt
           --words /absolute/words.json --reference /absolute/reference.wav
           --output /absolute/take.wav [--model-cache /absolute/models]
Commands: help, check (offline survey), install, trial (fixed shipped 35-word passage; refuse above 3.0 compute/audio), synthesize.
Options (closed per command):
  --model-cache DIR  Absolute model base, default person-scoped models/ (tools/AGENTS.md).
  --route-chosen     install only: caller attests the member chose this route.
  --install          install only: authorize packages/weights under tools/RUNNING.md.
                      Wiser asks once per person; a yes covers this install and later installs by any Wiser tool in any copy.
                    WISER_ALLOW_INSTALL=1, valid person or matching copy consent also authorizes install.
                    Neither consent nor environment variables bypass check or route choice.
  --text FILE        synthesize only: UTF-8 scene; <#0.5#>-shaped pause marks are controls, never words.
  --words FILE       synthesize only: strict JSON array matching every spoken whitespace-delimited word.
  --reference FILE   Member's reference recording, absolute; decoded locally by the engine.
  --output FILE      New absolute .wav outside this tool. Writes FILE.json beside it.
  --help, -h         Usage before dependencies/configuration. No --env; no credentials.
Requires native CPython 3.11 for the engine and FFmpeg (ffmpeg -version).
No download during help/check/trial/synthesize. Run install separately after a supported check
and route choice. Every output carries the package's PerTh watermark; no switch disables it.
Success: one JSON object, exit 0. Failure: stderr only, exit 1. check exits 0 for all verdicts.
"""


class ToolError(Exception):
    pass


def read_json(path):
    def unique(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError("duplicate JSON key")
            obj[key] = value
        return obj
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique,
                      parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))


def parse(argv):
    if not argv or argv[0] in ("help", "--help", "-h"):
        return "help", {}
    command, opts = argv[0], {}
    common = {"--model-cache"}
    values = {"check": common, "install": common,
              "trial": common | {"--reference", "--output"},
              "synthesize": common | {"--text", "--words", "--reference", "--output"}}
    if command not in values:
        raise ToolError('unknown command "%s"; run help.' % command)
    flags = {"--route-chosen", "--install"} if command == "install" else set()
    i = 1
    while i < len(argv):
        key = argv[i]
        if key in ("--help", "-h"):
            return "help", {}
        if key not in values[command] | flags:
            raise ToolError('unknown option or argument "%s"; run help.' % key)
        if key in opts:
            raise ToolError("%s was given more than once; run help." % key)
        if key in flags:
            opts[key] = True
            i += 1
        else:
            if i + 1 == len(argv) or argv[i + 1].startswith("-"):
                raise ToolError("%s needs a value; run help." % key)
            opts[key] = argv[i + 1]
            i += 2
    if command in ("trial", "synthesize"):
        required = ("--reference", "--output")
        if command == "synthesize":
            required += ("--text", "--words")
        for key in required:
            if key not in opts:
                raise ToolError("%s is required; run help." % key)
    return command, opts


def config_dir():
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "wiser"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "wiser"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "wiser"


def same_file(left, right):
    try:
        return os.path.samefile(left, right)
    except OSError:
        return False


def screen(value, label, destination=False):
    if not Path(value).is_absolute():
        raise ToolError("%s must be absolute; pass the full path." % label)
    try:
        p = Path(value).resolve()
        key = config_dir() / "auth-provider.env"
        for ancestor in (p, *p.parents):
            try:
                ancestor.stat()
            except FileNotFoundError:
                continue
            if same_file(ancestor, key) or p == key.resolve():
                raise ToolError("%s is the connector key file and is refused." % label)
            if destination and same_file(ancestor, TOOL):
                raise ToolError("%s resolves inside this tool; pass a work destination." % label)
        # Hard links to a shipped tool file cannot be used as output either.
        if destination and p.is_file():
            raise ToolError("%s already exists; choose a new destination." % label)
        return p
    except (OSError, RuntimeError) as error:
        raise ToolError("%s cannot be canonicalized; check permissions and links." % label) from error


def model_base(opts):
    # A directory may already exist; screen(destination=True) only refuses files.
    return screen(opts.get("--model-cache", str(config_dir() / "models")), "--model-cache", True)


def free_at(path):
    p = path
    try:
        while not p.exists():
            p = p.parent
        space = os.statvfs(p)
        return space.f_bavail * space.f_frsize
    except (OSError, AttributeError):
        return None


def present(name):
    try:
        return subprocess.run([name, "-version"], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=10).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def inspect_interpreter(candidate):
    if not candidate:
        return {"path": None, "implementation": None, "version": None, "machine": None, "prefix": None}
    try:
        result = subprocess.run([candidate, "-I", "-B", "-c",
                                 "import json,platform,sys; print(json.dumps({'implementation':platform.python_implementation(),"
                                 "'version':platform.python_version(),'machine':platform.machine(),'prefix':sys.prefix}))"],
                                capture_output=True, check=True, timeout=10)
        return dict(json.loads(result.stdout), path=str(candidate))
    except (OSError, ValueError, subprocess.SubprocessError):
        return {"path": str(candidate), "implementation": None, "version": None, "machine": None, "prefix": None}


def interpreter_facts():
    return inspect_interpreter(sys.executable if sys.version_info[:2] == (3, 11) else shutil.which("python3.11"))


def survey(base):
    chip, ram = None, None
    if platform.system() == "Darwin":
        for name in ("machdep.cpu.brand_string", "hw.memsize"):
            try:
                result = subprocess.run(["sysctl", "-n", name], capture_output=True, check=True, timeout=5)
                if name == "hw.memsize":
                    ram = int(result.stdout)
                else:
                    chip = result.stdout.decode().strip()
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
    return {"os": platform.system(), "os_version": platform.mac_ver()[0] or None,
            "machine": platform.machine(), "chip": chip, "memory_bytes": ram,
            "interpreter": interpreter_facts(), "ffmpeg": present("ffmpeg"),
            "environment_free_bytes": free_at(VENV), "weights_free_bytes": free_at(base / ENGINE_FOLDER)}


def assess(facts, download=True):
    unsupported, unknown = [], []
    def require(value, test, reason):
        if value is None or value == "":
            unknown.append(reason + " could not be established")
        elif not test(value):
            unsupported.append(reason)
    require(facts.get("os"), lambda v: v == "Darwin", "requires macOS")
    require(facts.get("machine"), lambda v: v == "arm64", "requires native Apple silicon arm64")
    require(facts.get("chip"), lambda v: v.startswith("Apple "), "requires an Apple silicon chip")
    version = facts.get("os_version")
    try:
        version = tuple(int(v) for v in version.split(".")[:2]) if version else None
    except (ValueError, AttributeError):
        version = None
    require(version, lambda v: v >= (12, 3), "MPS requires macOS 12.3 or newer")
    py = facts.get("interpreter") or {}
    require(py.get("implementation"), lambda v: v == "CPython", "requires CPython")
    require(py.get("version"), lambda v: re.fullmatch(r"3\.11\.\d+", v) is not None,
            "requires Python 3.11; check: python3.11 --version")
    require(py.get("machine"), lambda v: v == "arm64", "requires a native arm64 interpreter")
    require(facts.get("ffmpeg"), bool, "missing FFmpeg; check: ffmpeg -version")
    if download:
        for key in ("environment_free_bytes", "weights_free_bytes"):
            require(facts.get(key), lambda v: type(v) is int and v >= REQUIRED_BYTES,
                    "%s must have at least %d bytes free" % (key, REQUIRED_BYTES))
    return {"status": "unsupported" if unsupported else "unknown" if unknown else "supported",
            "reasons": unsupported + unknown, "facts": facts,
            "policy": {"machines": "Apple silicon Macs", "memory_floor": None,
                       "speed_limit_compute_per_audio_s": LIMIT,
                       "space_gib": SPACE, "required_free_bytes_at_each_destination": REQUIRED_BYTES,
                       "download_space_applied": download}}


def check(base):
    return dict(assess(survey(base)), environment=str(VENV),
                model_base=str(base), weights=str(base / ENGINE_FOLDER))


def require_supported(result, chosen):
    # Deliberately before reading any install-consent marker or variable.
    if result["status"] != "supported":
        raise ToolError("install refused: machine check is %s: %s. Resolve the check; no install ran."
                        % (result["status"], "; ".join(result["reasons"])))
    if not chosen:
        raise ToolError("install refused: caller must state the member chose this route with --route-chosen; no install ran.")


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


def consent(opts):
    explicit = opts.get("--install") or os.environ.get("WISER_ALLOW_INSTALL") == "1"
    try:
        fd = os.open(PLUGIN / ".wiser-consent", os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise OSError("the copy marker is not a regular file")
            marker = json.load(stream)
        prior = isinstance(marker, dict) and marker.get("realpath") == str(PLUGIN.resolve())
    except (OSError, ValueError):
        prior = False
    if not (explicit or prior or person_marker_grants()):
        raise ToolError("Wiser asks once per person; a yes covers this install and later installs by any Wiser tool in any copy. install needs consent: fetch pinned requirements.lock from pypi.org/files.pythonhosted.org "
                        "into %s (about 1.3 GiB), and %s weights (about 3.0 GiB) from huggingface.co "
                        "and cas-bridge.xethub.hf.co/cdn-lfs.huggingface.co/cdn-lfs-us-1.hf.co into the "
                        "versioned --model-cache. Reserve 0.4 GiB for caller alignment and 2 GiB install "
                        "headroom. pip cache is off. Re-run install with --route-chosen --install, or "
                        "WISER_ALLOW_INSTALL=1. See tools/RUNNING.md." % (VENV, MODEL))
    if not explicit:
        warn_copy_consent()
    return explicit


def pins():
    return dict(line.split("==") for line in (TOOL / "requirements.lock").read_text().splitlines()
                if line and not line.startswith("#"))


def package_state():
    roots = [VENV / "lib" / "python3.11" / "site-packages"]
    installed, invalid = {}, []
    for dist in importlib.metadata.distributions(path=[str(p) for p in roots]):
        try:
            name = dist.metadata["Name"]
            if not isinstance(name, str) or not name or not dist.version:
                raise ValueError("missing name or version")
            key = name.lower().replace("_", "-")
            if key in installed:
                invalid.append(name + ": duplicate distribution metadata")
            installed[key] = dist
        except (OSError, ValueError, UnicodeError, TypeError):
            invalid.append("unreadable distribution metadata")
    missing = [name for name, version in pins().items()
               if name.lower().replace("_", "-") not in installed or
               installed[name.lower().replace("_", "-")].version != version]
    for name in pins():
        dist = installed.get(name.lower().replace("_", "-"))
        if dist is None:
            continue
        try:
            files = dist.files
        except (OSError, ValueError, TypeError):
            files = None
        if not files:
            invalid.append(name + ": missing or empty RECORD")
            continue
        for entry in files:
            path = Path(dist.locate_file(entry))
            # Python checks bytecode against its source and rewrites it, so a .pyc,
            # whether pip compiled it or the wheel shipped it with a hash, is never compared.
            if path.suffix == ".pyc" and "__pycache__" in path.parts:
                continue
            try:
                if not path.resolve().is_relative_to(VENV.resolve()) or not path.is_file():
                    raise ValueError("missing or outside environment")
                if entry.hash is None and entry.size is None:
                    # Wheel RECORD cannot hash itself; no other unhashed entry is allowed.
                    if not str(entry).endswith(".dist-info/RECORD"):
                        raise ValueError("missing size and SHA-256")
                elif (entry.size is None or path.stat().st_size != entry.size or
                      entry.hash is None or entry.hash.mode != "sha256" or
                      base64.urlsafe_b64encode(bytes.fromhex(sha256(path))).decode().rstrip("=") != entry.hash.value):
                    raise ValueError("size or SHA-256 mismatch")
            except (OSError, ValueError):
                invalid.append(name + ": " + str(entry))
    # These two wheel payloads are inputs to torch.load/yaml.load. Their pins
    # are independent of the mutable installed RECORD, and checked before import.
    for name, spec in read_json(TOOL / "perth-files.json")["files"].items():
        path = roots[0] / name
        try:
            if path.stat().st_size != spec["bytes"] or sha256(path) != spec["sha256"]:
                invalid.append(name)
        except OSError:
            invalid.append(name)
        if name.endswith(".pth.tar"):
            # Perth loads the highest numbered checkpoint in the directory.
            # A second, unrecorded checkpoint must not bypass the pinned one.
            try:
                if set(path.parent.glob("*.pth.tar")) != {path}:
                    invalid.append(name + ": unexpected checkpoint")
            except OSError:
                invalid.append(name)
    marker = any((p / "chatterbox" / "__init__.py").is_file() for p in roots)
    interpreter = inspect_interpreter(venv_python())
    usable = (interpreter["implementation"] == "CPython" and interpreter["machine"] == "arm64"
              and re.fullmatch(r"3\.11\.\d+", interpreter["version"] or "") is not None
              and interpreter.get("prefix") is not None
              and Path(interpreter["prefix"]).resolve() == VENV.resolve())
    return {"status": "complete" if marker and not missing and not invalid and usable else "incomplete" if VENV.exists() else "absent",
            "mismatched_packages": missing, "invalid_files": invalid,
            "interpreter": interpreter, "interpreter_usable": usable}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def weight_state(base):
    """Pinned Hub objects plus their exact content digests, including tokenizer/conds."""
    folder = base / ENGINE_FOLDER
    expected = read_json(TOOL / "weights.json")
    snapshot = folder / "hub" / "models--ResembleAI--chatterbox" / "snapshots" / REVISION
    if not folder.exists():
        return {"status": "absent", "snapshot": str(snapshot), "invalid_files": list(expected["files"])}
    invalid = []
    for name, spec in expected["files"].items():
        path = snapshot / name
        try:
            if path.stat().st_size != spec["bytes"] or sha256(path) != spec["sha256"]:
                invalid.append(name)
        except OSError:
            invalid.append(name)
    return {"status": "incomplete" if invalid else "complete", "snapshot": str(snapshot),
            "invalid_files": invalid}


def cache_env(folder, runtime=None, offline=True):
    env = dict(os.environ)
    env.update({"HF_HOME": str(folder), "HF_HUB_CACHE": str(folder / "hub"),
                "HUGGINGFACE_HUB_CACHE": str(folder / "hub"), "HF_XET_CACHE": str(folder / "xet"),
                "HF_ASSETS_CACHE": str(folder / "assets"), "HF_HUB_DISABLE_TELEMETRY": "1",
                "HF_HUB_DISABLE_XET": "1", "DO_NOT_TRACK": "1", "PYTHONDONTWRITEBYTECODE": "1",
                "HF_HUB_OFFLINE": "1" if offline else "0", "TRANSFORMERS_OFFLINE": "1" if offline else "0",
                "PYTORCH_ENABLE_MPS_FALLBACK": "0", "TQDM_DISABLE": "1", "PIP_NO_CACHE_DIR": "1",
                "PIP_DISABLE_PIP_VERSION_CHECK": "1", "PIP_CONFIG_FILE": os.devnull,
                "PIP_CACHE_DIR": str(VENV / "pip-cache")})
    # The engine needs only local tensors. Keep incidental JIT/runtime caches in
    # the named destination during inference, not the person's global caches.
    runtime = runtime or VENV / "cache"
    env.update({"XDG_CACHE_HOME": str(runtime), "NUMBA_CACHE_DIR": str(runtime / "numba"),
                "TORCH_HOME": str(runtime / "torch"), "MPLCONFIGDIR": str(runtime / "matplotlib"),
                "TORCHINDUCTOR_CACHE_DIR": str(runtime / "inductor"),
                "TRITON_CACHE_DIR": str(runtime / "triton"),
                "TMPDIR": str(runtime), "TEMP": str(runtime), "TMP": str(runtime)})
    return env


def venv_python():
    return VENV / "bin" / "python3"


def retain_unusable_environment():
    """Leave a stale interpreter and all installed files recoverable, not active."""
    if not VENV.exists():
        return None
    recovery = TOOL / ".venv-recovery"
    if recovery.is_symlink():
        raise ToolError("environment recovery directory is a symbolic link; correct it before install.")
    recovery.mkdir(exist_ok=True)
    retained = recovery / uuid.uuid4().hex
    print("Retaining the unusable environment at %s before creating a fresh .venv." % retained, file=sys.stderr)
    VENV.rename(retained)
    return retained


def install(opts, base):
    # This Hub version restarts killed downloads. Remove only this engine's
    # orphaned temporaries before the disk survey, even if no space remains.
    clean_incomplete_downloads(base)
    result = check(base)
    require_supported(result, opts.get("--route-chosen", False))
    if VENV.is_symlink():
        raise ToolError("install refuses a linked .venv; use this tool's own environment.")
    explicit = consent(opts)
    if explicit:
        payload = {"date": date.today().isoformat(), "tool": "Chatterbox"}
        write_person_consent(payload, PLUGIN / ".wiser-consent", str(PLUGIN.resolve()))
    env = cache_env(base / ENGINE_FOLDER, offline=False)
    state = package_state()
    rebuilt = state["status"] != "complete"

    def rebuild():
        print("First run: installing dependencies into %s; pip cache is off." % VENV, file=sys.stderr)
        creator = Path(result["facts"]["interpreter"]["path"]).resolve()
        retained = retain_unusable_environment()
        if retained and creator.is_relative_to(VENV.resolve()):
            creator = retained / creator.relative_to(VENV.resolve())
        try:
            (VENV / "cache").mkdir(parents=True, exist_ok=True)
            subprocess.run([str(creator), "-I", "-B", "-m", "venv", str(VENV)],
                           env=env, stdout=sys.stderr, check=True)
            subprocess.run([str(venv_python()), "-I", "-B", "-m", "pip", "--isolated", "install", "--no-cache-dir",
                            "--disable-pip-version-check", "--no-deps", "--no-compile", "--only-binary=:all:",
                            "-r", str(TOOL / "requirements.lock")],
                           env=env, stdout=sys.stderr, check=True)
            subprocess.run([str(venv_python()), "-I", "-B", "-m", "pip", "check"], env=env, stdout=sys.stderr, check=True)
            if package_state()["status"] != "complete":
                raise ToolError("package install is incomplete; retry install with consent.")
        except BaseException:
            # A failed rebuild never strands the environment it replaced: set the
            # partial one aside and put the earlier one back where it was.
            if retained is not None and retained.exists():
                retain_unusable_environment()
                retained.rename(VENV)
            raise
    if rebuilt:
        rebuild()
    # A separate interpreter reports loader failure as 2 so even a metadata-
    # complete but unloadable environment gets one repair in this authorized run.
    worker = ("import sys; sys.path.insert(0, sys.argv[1]); import chatterbox_tool as tool; "
              "sys.exit(tool.finish_install(tool.Path(sys.argv[2])))")
    def finish():
        return subprocess.run([str(venv_python()), "-I", "-B", "-c", worker, str(TOOL / "scripts"), str(base)],
                              env=env, stdout=sys.stdout, stderr=sys.stderr).returncode
    code = finish()
    if code == 2 and not rebuilt:
        rebuild()
        code = finish()
    return 1 if code else 0


def clean_incomplete_downloads(base):
    hub = base / ENGINE_FOLDER / "hub"
    # os.walk does not follow directory links. Refuse linked cache ancestors,
    # and unlink a matching file link itself, never its destination.
    if any(p.is_symlink() for p in (base / ENGINE_FOLDER, hub)):
        raise ToolError("install refuses a linked engine or hub directory.")
    for directory, _, files in os.walk(hub, followlinks=False):
        for name in files:
            if name.endswith(".incomplete"):
                (Path(directory) / name).unlink()


class ModelLoadError(ToolError):
    pass


def finish_install(base):
    try:
        return install_weights(base)
    except ModelLoadError:
        print("Error: local model loader failed; the authorized installer will rebuild the environment once.",
              file=sys.stderr)
        return 2
    except ToolError as error:
        print("Error: %s" % error, file=sys.stderr)
        return 1
    except Exception as error:
        print("Error: local weight installation/validation failed (%s); retry install with consent. "
              "Incomplete weights have not been used for synthesis." % type(error).__name__, file=sys.stderr)
        return 1


def install_weights(base):
    folder = base / ENGINE_FOLDER
    env = cache_env(folder, offline=False)
    before = weight_state(base)
    if before["status"] != "complete":
        folder.mkdir(parents=True, exist_ok=True)
        missing_bytes = sum(read_json(TOOL / "weights.json")["files"][name]["bytes"]
                            for name in before["invalid_files"])
        # Read after pip and orphan cleanup. On a shared volume this already
        # includes every byte written by this run; subtracting again is wrong.
        available = free_at(folder)
        if available is None or available < missing_bytes:
            raise ToolError("weights need %d bytes; available bytes: %s; no download started."
                            % (missing_bytes, available))
        os.environ.update(env)
        from huggingface_hub import hf_hub_download
        # This Hub version restarts a killed file rather than resuming it.
        # Force every invalid object, even if only its blob (no snapshot) exists.
        for name in before["invalid_files"]:
            with contextlib.redirect_stdout(sys.stderr):
                hf_hub_download(repo_id=MODEL, filename=name, revision=REVISION,
                                cache_dir=str(folder / "hub"), force_download=True)
    after = weight_state(base)
    if after["status"] != "complete":
        raise ToolError("weights remain incomplete after download; retry install, never use these files.")
    # Validate through the package's real loader with all network blocked.
    with tempfile.TemporaryDirectory(prefix="install-probe-", dir=VENV) as temp:
        with offline_runtime(cache_env(folder, Path(temp))):
            try:
                load_model(Path(after["snapshot"]))
            except ToolError:
                # A refusal reinstalling cannot cure, such as no MPS, is reported as itself.
                raise
            except Exception as error:
                raise ModelLoadError("local loader failed") from error
    print(json.dumps({"ok": True, "command": "install", "packages": package_state(), "weights": after,
                      "model": MODEL, "revision": REVISION}))
    return 0


def split_pieces(text):
    """Preserve words exactly; pause/sentence grouping, and comma/space cap splits."""
    chunks = PAUSE.split(text)
    if any("<#" in c or "#>" in c for c in chunks):
        raise ToolError("unsupported pause mark; use <#0.5#>-shaped numeric marks.")
    if any(not c.strip() for c in chunks):
        raise ToolError("empty text or leading/trailing/consecutive pause marks; supply words between marks.")
    pieces = []
    for ci, chunk in enumerate(chunks):
        group = []
        for sentence in re.split(r"(?<=[.!?])\s+", chunk.strip()):
            words = sentence.split()
            if group and len(group) + len(words) > MAX_WORDS:
                pieces.append({"words": group, "gap_after_s": 0.3, "split": "sentence"})
                group = []
            while len(words) > MAX_WORDS:
                commas = [i + 1 for i, word in enumerate(words[:MAX_WORDS])
                          if word.rstrip("\"'\u2018\u2019\u201c\u201d").endswith(",")]
                at = commas[-1] if commas else MAX_WORDS
                pieces.append({"words": words[:at], "gap_after_s": 0.3,
                               "split": "comma_cap" if commas else "word_cap"})
                words = words[at:]
            group.extend(words)
        if group:
            pieces.append({"words": group, "gap_after_s": 0.5 if ci < len(chunks) - 1 else 0.0,
                           "split": "pause" if ci < len(chunks) - 1 else "end"})
    word = 0
    for i, piece in enumerate(pieces):
        piece.update({"piece": i, "text": " ".join(piece["words"]), "first_word": word,
                      "last_word": word + len(piece["words"]) - 1, "seed": SEED + i})
        word += len(piece["words"])
    return pieces


def inputs(opts, command="synthesize"):
    if command == "trial":
        opts = dict(opts, **{"--text": str(TOOL / "trial.txt"),
                             "--words": str(TOOL / "trial-words.json")})
    paths = {k: screen(opts[k], k, k == "--output")
             for k in ("--text", "--words", "--reference", "--output")}
    output = paths["--output"]
    if output.suffix.lower() != ".wav" or output.exists():
        raise ToolError("--output must be a new .wav file; choose a new destination.")
    record = screen(str(output) + ".json", "output record", True)
    if record.exists():
        raise ToolError("output record already exists; choose a new destination.")
    for key in ("--text", "--words", "--reference"):
        if not paths[key].is_file():
            raise ToolError("%s must name a readable file; check its path." % key)
    text = paths["--text"].read_text(encoding="utf-8")
    pieces = split_pieces(text)
    words = read_json(paths["--words"])
    if (not isinstance(words, list) or not words or
            any(not isinstance(w, str) or not w or any(c.isspace() for c in w) for w in words) or
            words != [w for piece in pieces for w in piece["words"]]):
        raise ToolError("--words must match all spoken words from --text in order, excluding pause marks; nothing is discarded.")
    return paths, record, words, pieces


@contextlib.contextmanager
def offline_runtime(env):
    def deny(*args, **kwargs):
        raise ToolError("network blocked during local model operation; run install separately if weights are incomplete.")
    with patch.dict(os.environ, env), patch.object(socket.socket, "connect", deny), \
            patch.object(socket.socket, "connect_ex", deny), patch.object(socket, "create_connection", deny), \
            contextlib.redirect_stdout(sys.stderr):
        yield


def load_model(snapshot):
    if package_state()["status"] != "complete":
        raise ToolError("installed files or pinned Perth checkpoint are incomplete; no model loaded; run authorized install.")
    import torch
    if not torch.backends.mps.is_available():
        raise ToolError("MPS unavailable in this interpreter; route refused, no CPU fallback. Check macOS/PyTorch MPS support.")
    from chatterbox.tts import ChatterboxTTS
    model = ChatterboxTTS.from_local(snapshot, device="mps")
    if model.device != "mps":
        raise ToolError("engine did not select mps; route refused.")
    # Tested on this Mac: moving PerthNet to MPS succeeds, but a real take
    # fails at aten::angle (torch 2.6). Keep the package's CPU watermarker.
    if model.watermarker.perth_net.device.type != "cpu":
        raise ToolError("watermark network did not select cpu; route refused.")
    torch.mps.synchronize()
    return model


def trial_verdict(compute_s, audio_s):
    if not (math.isfinite(compute_s) and compute_s >= 0 and math.isfinite(audio_s) and audio_s > 0):
        raise ToolError("invalid trial measurements; route refused.")
    ratio = compute_s / audio_s
    return {"status": "refused" if ratio > LIMIT else "accepted", "compute_per_audio_s": ratio,
            "limit_compute_per_audio_s": LIMIT}


def make_record(paths, words, passages, rate, samples, load_s, compute_s, packages, output, command):
    verdict = trial_verdict(compute_s, samples / rate)
    layout = {"version": 1, "sample_rate": rate,
              "passages": [{k: p[k] for k in ("start_sample", "end_sample", "first_word", "last_word")}
                           for p in passages]}
    return {"version": 1, "command": command, "engine": {"name": "Chatterbox", "model": MODEL,
            "revision": REVISION, "packages": packages, "requirements_sha256": sha256(TOOL / "requirements.lock")},
            "inputs": {k[2:]: {"path": str(paths[k]), "sha256": sha256(paths[k])}
                       for k in ("--text", "--words", "--reference")},
            "settings": SETTINGS, "watermark": WATERMARK, "words": words, "passages": passages,
            "layout": layout, "output": {"path": str(output), "bytes": output.stat().st_size,
            "sha256": sha256(output), "sample_rate": rate, "samples": samples, "channels": 1,
            "subtype": "PCM_24", "seconds": samples / rate},
            "timing": {"load_s": load_s, "compute_s": compute_s, "audio_s": samples / rate,
                       "compute_per_audio_s": verdict["compute_per_audio_s"]},
            "trial": verdict if command == "trial" else None}


def run_engine(command, opts, base, validated):
    paths, record_path, words, pieces = validated
    # Inference opens no connection and consumes no download reserve. Recheck
    # hardware/interpreter/FFmpeg without demanding the already installed bytes again.
    result = assess(survey(base), download=False)
    if result["status"] != "supported":
        raise ToolError("machine check is %s: %s; resolve it before synthesis." %
                        (result["status"], "; ".join(result["reasons"])))
    packages = package_state()
    if packages["status"] != "complete":
        raise ToolError("Chatterbox packages are %s; run check, then install --route-chosen under install consent."
                        % packages["status"])
    output = paths["--output"]
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="chatterbox-runtime-", dir=output.parent) as temp:
        env = cache_env(base / ENGINE_FOLDER, Path(temp))
        if Path(sys.prefix).resolve() != VENV.resolve():
            return subprocess.run([str(venv_python()), "-I", "-B", str(Path(__file__).resolve()), command] +
                                  [v for pair in opts.items() for v in pair], env=env).returncode
        weights = weight_state(base)
        if weights["status"] != "complete":
            raise ToolError("Chatterbox weights are %s; run install --route-chosen with consent to restart/repair; nothing downloaded."
                            % weights["status"])
        # Package notices, warnings and sampling output must not precede the
        # refusal JSON. Keep the protocol streams for this tool's result only.
        with open(os.devnull, "w") as noise, contextlib.redirect_stdout(noise), \
                contextlib.redirect_stderr(noise), offline_runtime(env):
            started = time.perf_counter()
            model = load_model(Path(weights["snapshot"]))
            import numpy as np
            import soundfile as sf
            import torch
            load_s = time.perf_counter() - started
            torch.mps.synchronize()
            started, at, audio_parts, passages = time.perf_counter(), 0, [], []
            for piece in pieces:
                torch.manual_seed(piece["seed"])
                wave = model.generate(piece["text"], audio_prompt_path=str(paths["--reference"]),
                                      **{k: SETTINGS[k] for k in ("exaggeration", "cfg_weight", "repetition_penalty",
                                                                  "min_p", "top_p", "temperature")})
                torch.mps.synchronize()
                audio = wave.squeeze(0).cpu().numpy().astype(np.float32)
                if audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
                    raise ToolError("engine returned invalid audio; no take published.")
                loud = np.flatnonzero(np.abs(audio) > 10 ** (SETTINGS["trim_db"] / 20))
                if not len(loud):
                    raise ToolError("engine returned silence; no take published.")
                left, right = int(loud[0]), int(loud[-1]) + 1
                trimmed = audio[left:right]
                gap = int(round(piece["gap_after_s"] * model.sr))
                passages.append({k: v for k, v in piece.items() if k != "words"})
                passages[-1].update({"start_sample": at, "end_sample": at + len(trimmed),
                                     "trim_start_samples": left, "trim_end_samples": len(audio) - right,
                                     "gap_after_samples": gap})
                at += len(trimmed) + gap
                audio_parts.extend((trimmed, np.zeros(gap, dtype=np.float32)))
            audio = np.concatenate(audio_parts)
            torch.mps.synchronize()
            compute_s = time.perf_counter() - started
            # Stage only beside the named output. Exclusive publication protects existing files.
            staged_audio = Path(temp) / "take.wav"
            sf.write(str(staged_audio), audio, model.sr, subtype="PCM_24")
            info = sf.info(str(staged_audio))
            if info.frames != len(audio) or info.samplerate != model.sr or info.channels != 1:
                raise ToolError("written WAV failed its sample check; no take published.")
            versions = {name: importlib.metadata.version(name) for name in pins()}
            record = make_record(paths, words, passages, model.sr, len(audio), load_s, compute_s,
                                 versions, staged_audio, command)
            record["output"]["path"] = str(output)
            publish_pair(staged_audio, output, record_path, record)
    summary = {"ok": command != "trial" or record["trial"]["status"] == "accepted", "command": command,
               "file": str(output), "record": str(record_path), "timing": record["timing"], "trial": record["trial"]}
    if not summary["ok"]:
        print(json.dumps(dict(summary, error="route refused above 3.0 compute seconds per audio second; leave route unset")),
              file=sys.stderr)
        return 1
    print(json.dumps(summary))
    return 0


def publish_pair(staged, output, record_path, record):
    created = []
    try:
        with output.open("xb") as handle:
            created.append(output)
            with staged.open("rb") as source:
                shutil.copyfileobj(source, handle)
            handle.flush()
            os.fsync(handle.fileno())
        with record_path.open("x", encoding="utf-8") as handle:
            created.append(record_path)
            json.dump(record, handle, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        for path in reversed(created):
            path.unlink()
        raise


def main(argv=None):
    try:
        command, opts = parse(sys.argv[1:] if argv is None else argv)
        if command == "help":
            print(USAGE)
            return 0
        base = model_base(opts)
        if command == "check":
            print(json.dumps(check(base)))
            return 0
        if command == "install":
            return install(opts, base)
        validated = inputs(opts, command)
        return run_engine(command, opts, base, validated)
    except (ToolError, OSError, ValueError, subprocess.SubprocessError) as error:
        print("Error: %s" % error, file=sys.stderr)
        return 1
    except Exception as error:
        # Third-party exceptions can contain arbitrary input/provider bodies.
        print("Error: Chatterbox failed (%s); check the local reference, MPS support and installed artifacts. "
              "No speech-model CPU fallback or repair download was attempted." % type(error).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
