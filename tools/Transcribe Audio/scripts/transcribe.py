#!/usr/bin/env python3
"""
Transcribe Audio - turns one audio file into a text transcript on this machine.

Usage:
  python3 scripts/transcribe.py help
  python3 scripts/transcribe.py check
  python3 scripts/transcribe.py transcribe --audio [path] --output [dir] --model-cache [dir]
      [--model base]

The rules this file follows are stated once, in
system/templates/Script Contract.md. This script runs under Python rather than
Node, which that contract's Runtimes clause allows because TOOL.md declares the
interpreter under Dependencies.
"""

# Standard library only above the package cache check below. Nothing here
# imports from outside this tool directory.
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TOOL_DIR = SCRIPT_DIR.parent

# The first-run package cache: a virtual environment beside the scripts, which
# is the one thing this script writes inside its own directory.
CACHE_DIR = TOOL_DIR / ".venv"

CORE_REQUIREMENTS = TOOL_DIR / "requirements.txt"

# One installed package's own directory, not the cache directory itself: an
# install that dies partway leaves the cache in place and the packages absent.
CORE_MARKER = "whisper"

SUPPORTED_FORMATS = (
    ".flac", ".m4a", ".mp3", ".mp4", ".mpeg", ".mpga", ".ogg", ".wav", ".webm",
)
MODELS = ("tiny", "base", "small", "medium", "large")
DEFAULT_MODEL = "base"

# The transcription language the engine is pinned to. TOOL.md states the limit.
LANGUAGE = "en"

COMMANDS = ("check", "transcribe")

USAGE = """Transcribe Audio - turns one audio file into a text transcript on this machine.

Usage:
  python3 scripts/transcribe.py help
  python3 scripts/transcribe.py check
  python3 scripts/transcribe.py transcribe --audio [path] --output [dir] --model-cache [dir]
      [--model [name]]

Commands:
  check            Report the interpreter, FFmpeg, and whether the speech packages are installed
  transcribe       Write a transcript of one audio file
  help             Print this message

Options:
  --audio [path]        The audio file, absolute. One of: {formats}
  --output [dir]        Directory the transcript is written into, absolute and
                        outside this tool directory
  --model-cache [dir]   Directory model weights are downloaded into, absolute and
                        outside this tool directory. Pass the same one every run
  --model [name]        Speech model: {models}. Default {default}
  --help                Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.""".format(
    models=", ".join(MODELS), formats=", ".join(SUPPORTED_FORMATS), default=DEFAULT_MODEL
)


def stop(message):
    """Stop the run: stderr only, stdout empty, exit 1."""
    sys.stderr.write(message + "\n")
    sys.exit(1)


def fail(message):
    """A failure, which is every stop but the first-run install's re-run notice."""
    stop("Error: " + message)


def note(message):
    """Progress: stderr, so stdout carries only the final JSON object."""
    sys.stderr.write(message + "\n")


# Options that take a value, and options that are their own value.
VALUE_OPTIONS = ("--audio", "--output", "--model-cache", "--model")
FLAG_OPTIONS = ()


# Arguments. Parsed first so help costs nothing: no install, no configuration.
argv = sys.argv[1:]
command = argv[0] if argv else "help"

if command in ("help", "--help", "-h") or "--help" in argv or "-h" in argv:
    sys.stdout.write(USAGE + "\n")
    sys.exit(0)

if command not in COMMANDS:
    fail('unknown command "%s". Run "python3 scripts/transcribe.py help" for usage.' % command)


def parse(args):
    """Every word is claimed by name or refused by name; nothing is ignored."""
    index = 0
    while index < len(args):
        word = args[index]
        if word in VALUE_OPTIONS:
            value = args[index + 1] if index + 1 < len(args) else None
            if value is None or value.startswith("-"):
                fail('%s needs a value. Run "python3 scripts/transcribe.py help" for usage.' % word)
            index += 2
            continue
        if word in FLAG_OPTIONS:
            index += 1
            continue
        if word.startswith("-"):
            fail('unknown option "%s". Run "python3 scripts/transcribe.py help" for usage.' % word)
        fail(
            'unexpected argument "%s". Run "python3 scripts/transcribe.py help" for usage.' % word
        )


parse(argv[1:])


def flag(name):
    if name not in argv:
        return None
    index = argv.index(name)
    value = argv[index + 1] if index + 1 < len(argv) else None
    if value is None or value.startswith("--"):
        fail('%s needs a value. Run "python3 scripts/transcribe.py help" for usage.' % name)
    return value


def present(executable, arguments):
    """A system dependency's presence check: local, and it opens no connection."""
    binary = shutil.which(executable)
    if binary is None:
        return False
    try:
        subprocess.run(
            [binary] + arguments,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except Exception:
        return False


def cache_python():
    if os.name == "nt":
        return CACHE_DIR / "Scripts" / "python.exe"
    return CACHE_DIR / "bin" / "python3"


def package_installed(package):
    roots = list(CACHE_DIR.glob("lib/python*/site-packages"))
    roots.append(CACHE_DIR / "Lib" / "site-packages")
    for root in roots:
        package_dir = root / package
        if (package_dir / "__init__.py").exists():
            return True
    return False


def emit(result):
    """One JSON object on stdout, and nothing else ever reaches stdout."""
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")


if command == "check":
    emit(
        {
            "python": "%d.%d.%d" % sys.version_info[:3],
            "ffmpeg": present("ffmpeg", ["-version"]),
            "packages": package_installed(CORE_MARKER),
        }
    )
    sys.exit(0)


def same_file(left, right):
    """True when two paths name one file, however each of them is spelled.

    Device and inode are the file's own identity, which is the thing a
    comparison of resolved strings cannot see. Path.resolve preserves the case
    it was handed, so on a case insensitive filesystem, which is where this root
    ships, two spellings of one file canonicalize to two different strings and a
    string comparison misses. A hard link is not a link to a path either: it is a
    second name for one inode and it canonicalizes to itself, so resolving both
    sides is not enough on its own. A path that does not exist has no identity to
    compare, so this answers False there and the caller compares the deepest
    ancestor that does exist instead.
    """
    try:
        here = os.stat(left)
        there = os.stat(right)
    except OSError:
        return False
    return (here.st_dev, here.st_ino) == (there.st_dev, there.st_ino)


def unresolvable(option, where):
    return (
        "%s could not be resolved to a real path at %s. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself."
        % (option, where)
    )


def canonical(option, candidate):
    """The path with every component that exists resolved through symbolic links.

    Path.resolve follows links on the components present on disk and appends the
    rest, so a link standing in for the file itself, or for any ancestor of it,
    collapses onto the one real path that a lexical comparison would spell
    differently and let through. Resolving a path opens nothing, so this runs
    before any file is read or written.

    Absence is the only reason resolution may keep going. Any other refusal from
    the filesystem, an unreadable ancestor or a loop of symbolic links, means the
    real path cannot be known, and a screen that cannot know which file it is
    looking at refuses by name rather than letting the interpreter report a
    traceback carrying host paths.
    """
    try:
        return Path(candidate).resolve()
    except (OSError, RuntimeError):
        fail(unresolvable(option, candidate))


def deepest_existing(option, path):
    """The deepest component of a path that exists on disk.

    A directory named for the first time does not exist yet, and a path that does
    not exist has no inode to compare, so the screen compares the identity of the
    deepest ancestor that does exist: that is the directory the write would land
    in. Absence is the only reason to keep climbing; any other refusal means the
    real path cannot be known, and the run refuses.
    """
    probe = path
    while True:
        try:
            os.stat(probe)
            return probe
        except (FileNotFoundError, NotADirectoryError):
            pass
        except OSError:
            fail(unresolvable(option, probe))
        parent = probe.parent
        if parent == probe:
            return probe
        probe = parent


def inside_tool_dir(existing):
    """True when an existing path is this tool's directory or sits beneath it.

    Identity, not spelling: every step of the climb is compared to the tool
    directory by device and inode, so a case variant of any component, a
    symbolic link standing in for an ancestor, and a hard link are all refused
    exactly as the direct spelling is.
    """
    probe = existing
    while True:
        if same_file(probe, TOOL_DIR):
            return True
        parent = probe.parent
        if parent == probe:
            return False
        probe = parent


# Validation, before the first-run install: a malformed command or a missing
# system dependency costs no download.

audio_argument = flag("--audio")
if not audio_argument:
    fail('--audio is required. Run "python3 scripts/transcribe.py help" for usage.')

audio_given = Path(audio_argument)
if not audio_given.is_absolute():
    fail('--audio must be absolute; got "%s". Pass the full path, not one relative to the current directory.' % audio_argument)
if not audio_given.is_file():
    fail("no file at %s. Check the path." % audio_given)

# Canonical from here on, so every test below and every read further down is a
# test of the file the caller actually named rather than of the name they typed.
audio_path = canonical("--audio", audio_given)

if audio_path.suffix.lower() not in SUPPORTED_FORMATS:
    fail(
        "unsupported audio format %s. This tool reads: %s."
        % (audio_path.suffix or "(none)", ", ".join(SUPPORTED_FORMATS))
    )


def directory_outside_tool(value, option):
    if not value:
        fail('%s is required. Run "python3 scripts/transcribe.py help" for usage.' % option)
    path = Path(value)
    if not path.is_absolute():
        fail('%s must be absolute; got "%s". Pass a work directory in the owning root.' % (option, value))
    resolved = canonical(option, path)
    if inside_tool_dir(deepest_existing(option, resolved)):
        fail(
            "%s resolves inside this tool directory (%s). Scripts write only to a work directory in the owning root; pass that path instead."
            % (option, TOOL_DIR)
        )
    return resolved


output_dir = directory_outside_tool(flag("--output"), "--output")
model_cache = directory_outside_tool(flag("--model-cache"), "--model-cache")

model = flag("--model") or DEFAULT_MODEL
if model not in MODELS:
    fail('unknown model "%s". One of: %s.' % (model, ", ".join(MODELS)))

# System dependencies, per TOOL.md's Dependencies section: checked after help
# parsing, only on a command that needs them, and never with install steps.
if not present("ffmpeg", ["-version"]):
    fail("missing ffmpeg; check: ffmpeg -version. See the Dependencies section of TOOL.md.")


# Packages. Runs before any package import; the cache is this tool's own and
# nothing installs into the machine or the user's environment. That is enforced
# by install_env() and the pip flags below, not asserted.
#
# That second clause is enforced below rather than asserted. pip's own download
# cache is not part of the virtual environment: by default it is
# ~/Library/Caches/pip on macOS and ~/.cache/pip on Linux, it survives deleting
# .venv, and on this tool's own dependency set it reached several hundred
# megabytes outside the tool directory. So the install runs with pip's cache
# switched off and every cache-shaped variable pip reads pointed inside .venv,
# and pip's version self-check, which also writes into that cache, disabled.
# The cost is that a second install re-downloads; the gain is that the sentence
# above is true, and `install_env()` is what makes it true.
def install_env():
    env = dict(os.environ)
    env["PIP_NO_CACHE_DIR"] = "1"
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    # Belt and braces: if a future pip reads these rather than the flags, they
    # still resolve inside this tool's own cache directory.
    env["PIP_CACHE_DIR"] = str(CACHE_DIR / "pip-cache")
    env["XDG_CACHE_HOME"] = str(CACHE_DIR / "cache")
    return env


def install(requirements, marker, label):
    if not CACHE_DIR.exists():
        note("First run: creating the package cache in %s" % CACHE_DIR)
        try:
            subprocess.run(
                [sys.executable, "-m", "venv", str(CACHE_DIR)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            fail(
                "could not create the package cache at %s. Confirm python3 -m venv works and that this tool directory is writable. See SETUP.md."
                % CACHE_DIR
            )
    if not cache_python().exists():
        fail(
            "the package cache at %s holds no interpreter. Delete that directory and run the command again. See SETUP.md."
            % CACHE_DIR
        )
    note("Installing %s packages into %s. The first run downloads several hundred megabytes." % (label, CACHE_DIR))
    try:
        # stderr only: install output on stdout would break the one-JSON-object rule.
        subprocess.run(
            [
                str(cache_python()),
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--disable-pip-version-check",
                "-r",
                str(requirements),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            env=install_env(),
        )
    except Exception:
        fail(
            "installing %s packages failed. Delete %s, confirm python3 --version is 3.8 or newer, then run the command again. See SETUP.md."
            % (label, CACHE_DIR)
        )
    if not package_installed(marker):
        fail(
            "the install finished but %s is still missing from %s. Check that %s lists every package this script imports."
            % (marker, CACHE_DIR, requirements.name)
        )
    stop("%s packages installed. Re-run the command." % label.capitalize())


if not package_installed(CORE_MARKER):
    install(CORE_REQUIREMENTS, CORE_MARKER, "transcription")

# The packages live in the cache, so the work runs under the cache's own
# interpreter. sys.prefix, not sys.executable: the cache's interpreter is a link
# to the machine's, so the two resolve to one path and prove nothing.
if Path(sys.prefix).resolve() != CACHE_DIR.resolve():
    if not cache_python().exists():
        fail(
            "the package cache at %s holds no interpreter. Delete that directory and run the command again. See SETUP.md."
            % CACHE_DIR
        )
    if os.environ.get("TRANSCRIBE_AUDIO_CACHE_RUN") == "1":
        fail(
            "the package cache at %s did not take over the run. Delete that directory and run the command again. See SETUP.md."
            % CACHE_DIR
        )
    os.environ["TRANSCRIBE_AUDIO_CACHE_RUN"] = "1"
    target = str(cache_python())
    os.execv(target, [target, str(Path(__file__).resolve())] + argv)

# Model weights are downloaded into the caller's directory, never into this tool
# and never into the user's home. Both variables below are paths, not values from
# a bound file.
model_cache.mkdir(parents=True, exist_ok=True)
os.environ["XDG_CACHE_HOME"] = str(model_cache / "cache")

# Packages import only below this line. A static import at the top would run
# before the check above and crash instead of installing.
import torch  # noqa: E402
import whisper  # noqa: E402


def device():
    """CUDA when present, otherwise CPU. MPS stays off: the speech model uses
    sparse tensors that backend does not fully support."""
    if torch.cuda.is_available():
        note("Using GPU (CUDA)")
        return "cuda"
    note("Using CPU")
    return "cpu"


def as_paragraphs(text):
    return re.sub(r'([.!?])\s+(?=[A-Z"\'])', r"\1\n\n", text.strip())


selected = device()
note("Loading the %s speech model (the first run of a model downloads it)" % model)
try:
    engine = whisper.load_model(model, device=selected, download_root=str(model_cache / "speech-models"))
except Exception:
    fail(
        "could not load the speech model %s. A model absent from %s is downloaded on first use, so this usually means the machine is offline or the download was interrupted."
        % (model, model_cache)
    )

try:
    duration_minutes = len(whisper.load_audio(str(audio_path))) / whisper.audio.SAMPLE_RATE / 60
except Exception as error:
    fail("could not decode %s: %s" % (audio_path, error))

note("Transcribing %.1f minutes of audio" % duration_minutes)
try:
    result = engine.transcribe(
        str(audio_path),
        verbose=False,
        language=LANGUAGE,
        fp16=(selected == "cuda"),
        condition_on_previous_text=True,
        compression_ratio_threshold=2.4,
        logprob_threshold=-1.0,
        no_speech_threshold=0.6,
    )
except Exception as error:
    fail("transcription failed: %s" % error)

segments = result.get("segments", [])
body = as_paragraphs(result.get("text", ""))

output_dir.mkdir(parents=True, exist_ok=True)
transcript = output_dir / ("%s-transcript-%s.txt" % (audio_path.stem, datetime.now().strftime("%Y-%m-%d")))

header = [
    "TRANSCRIPT",
    "",
    "Audio file: %s" % audio_path.name,
    "Transcribed: %s" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "Model: %s" % model,
]
header.append("")
header.append("")

with open(transcript, "w", encoding="utf-8") as handle:
    handle.write("\n".join(header))
    handle.write(body.rstrip() + "\n")

summary = {
    "ok": True,
    "file": str(transcript),
    "model": model,
    "language": LANGUAGE,
    "segments": len(segments),
    "duration_minutes": round(duration_minutes, 2),
}
emit(summary)
