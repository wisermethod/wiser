"""Known-word CTC alignment. Standard library only until validated inputs and consent.

Entry point: transcribe.py align. Importing this module performs no work.
"""
import array
import contextlib
import errno
import importlib.metadata
import json
import math
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid
from datetime import date, datetime
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

INSTALL_ONCE = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates."
INSTALL_HELP = "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates."
INSTALL_COPY_ONLY = "Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: "
INSTALL_NOT_SAVED = "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: "


def install_question(what, purpose, size=None):
    return ("This Wiser skill needs to download and install " + what + " on your machine in order to " + purpose + "."
            + (" It's about " + size + "." if size else "") + " " + INSTALL_ONCE)


def install_size(size_bytes):
    def rounded(divisor):
        return int(size_bytes / divisor + 0.5)
    if size_bytes < 1000000:
        kb = max(1, rounded(1000))
        return "%d KB" % kb if kb < 1000 else "1.0 MB"
    if size_bytes < 10000000:
        tenths = rounded(100000)
        return "%.1f MB" % (tenths / 10) if tenths < 100 else "10 MB"
    mb = rounded(10000000) * 10 if size_bytes >= 100000000 else rounded(1000000)
    return "%.1f GB" % (rounded(100000000) / 10) if mb >= 1000 else "%d MB" % mb



TOOL_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = TOOL_DIR / ".venv"
# Both installed 2.8.0 releases' METADATA declare Python 3.9 through 3.13
# (Programming Language :: Python :: 3.x); patch versions are not pinned.
PYTHONS = {(3, minor) for minor in range(9, 14)}
ENGINES = {"torch": "2.8.0", "torchaudio": "2.8.0"}
MODEL = "WAV2VEC2_ASR_BASE_960H"
SAMPLE_RATE = 16000
LEAD = 0.3
FORMATS = {".flac", ".m4a", ".mp3", ".mp4", ".mpeg", ".mpga", ".ogg", ".wav", ".webm"}
USAGE = """Transcribe Audio: align supplied English words on the audio's decoded sample clock.
Usage: python3 scripts/transcribe.py align --audio [path] --words [json] --output [json]
       [--layout [json]] [--language en] [--model-cache [dir]] [--install]
  --audio [path]       Absolute audio path (same formats as transcribe).
  --words [json]       Absolute JSON file: nonempty array of spoken word strings.
  --output [json]      Absolute new JSON file outside this tool: array of {text,start,end}.
  --layout [json]      Optional version-1 JSON: sample_rate and passages, each with
                      start_sample, end_sample (exclusive), first_word, last_word (inclusive).
  --language [code]    en only (default en); no language detection.
  --model-cache [dir]  Absolute directory, default person-scoped models/ (tools/AGENTS.md).
  --install          Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.
                      WISER_ALLOW_INSTALL=1 also authorizes an unattended install.
  --help, -h          Print usage without packages, configuration or network.
Requires CPython 3.9-3.13 and torch==2.8.0, torchaudio==2.8.0 in this tool's .venv.
Refuses words outside A-Z/apostrophe after case and edge-punctuation normalization.
No recognition, word substitution, uniform timing or fallback. See TOOL.md.
"""


class AlignmentError(Exception):
    pass


def parse(args):
    values = {"--audio", "--words", "--output", "--layout", "--model-cache", "--language"}
    opts = {}
    i = 0
    while i < len(args):
        key = args[i]
        if key not in values | {"--install"}:
            raise AlignmentError('unknown option or argument "%s"; run align --help.' % key)
        if key in opts:
            raise AlignmentError("%s was given more than once; run align --help." % key)
        if key == "--install":
            opts[key] = True
            i += 1
        else:
            if i + 1 == len(args) or args[i + 1].startswith("-"):
                raise AlignmentError("%s needs a value; run align --help." % key)
            opts[key] = args[i + 1]
            i += 2
    for key in ("--audio", "--words", "--output"):
        if key not in opts:
            raise AlignmentError("%s is required; run align --help." % key)
    if opts.get("--language", "en") != "en":
        raise AlignmentError('unsupported language "%s": %s aligns English (en) only.'
                             % (opts["--language"], MODEL))
    return opts


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


def screen(value, option, destination=False):
    path = Path(value)
    if not path.is_absolute():
        raise AlignmentError("%s must be absolute; pass the full path." % option)
    try:
        resolved = path.resolve()
        # stat every existing ancestor, including paths with case variants.
        for p in (resolved, *resolved.parents):
            try:
                p.stat()
            except FileNotFoundError:
                continue
            if same_file(p, config_dir() / "auth-provider.env"):
                raise AlignmentError("%s is the connector key file and is refused." % option)
            if destination and same_file(p, TOOL_DIR):
                raise AlignmentError("%s resolves inside this tool directory; use an external path." % option)
        if same_file(resolved, config_dir() / "auth-provider.env"):
            raise AlignmentError("%s is the connector key file and is refused." % option)
        return resolved
    except (OSError, RuntimeError) as error:
        raise AlignmentError("%s could not be resolved to a real path; check permissions and links." % option) from error


def read_json(path, option):
    try:
        def unique(pairs):
            out = {}
            for key, value in pairs:
                if key in out:
                    raise ValueError("duplicate key")
                out[key] = value
            return out
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique,
                          parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    except (OSError, UnicodeError, ValueError) as error:
        raise AlignmentError("%s must name readable, strict JSON; check the file." % option) from error


def normalize_words(words):
    if not isinstance(words, list) or not words:
        raise AlignmentError("--words must contain a nonempty JSON array of word strings.")
    normalized = []
    for i, word in enumerate(words):
        if not isinstance(word, str) or not word or any(c.isspace() for c in word):
            raise AlignmentError("unsupported word at index %d: %r; supply one spoken word per string." % (i, word))
        # Only case, curly apostrophes/quotes, and named edge punctuation change.
        # No filter drops interior characters, digits, accents, tags or symbols.
        token = word.translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'}))
        token = token.strip('.,!?;:"()').strip("'")
        if not re.fullmatch(r"[A-Za-z]+(?:'[A-Za-z]+)*", token):
            raise AlignmentError("unsupported word at index %d: %r; spell it with English A-Z and apostrophes." % (i, word))
        normalized.append(token.upper())
    return normalized


def integer(value):
    return type(value) is int


def validate_layout(layout, rate, samples, word_count):
    if layout is None:
        return [{"start_sample": 0, "end_sample": samples, "first_word": 0, "last_word": word_count - 1}]
    if (not isinstance(layout, dict) or set(layout) != {"version", "sample_rate", "passages"}
            or not integer(layout["version"]) or layout["version"] != 1):
        raise AlignmentError("--layout requires version 1, sample_rate and passages, with no other keys.")
    if not integer(layout["sample_rate"]) or layout["sample_rate"] != rate:
        raise AlignmentError("--layout sample_rate must equal the decoded audio sample rate (%d)." % rate)
    passages = layout["passages"]
    if not isinstance(passages, list) or not passages:
        raise AlignmentError("--layout passages must be a nonempty array.")
    next_word, previous_end = 0, 0
    keys = {"start_sample", "end_sample", "first_word", "last_word"}
    for i, p in enumerate(passages):
        if not isinstance(p, dict) or set(p) != keys or not all(integer(v) for v in p.values()):
            raise AlignmentError("--layout passage %d requires integer sample bounds and word indices only." % i)
        if not (previous_end <= p["start_sample"] < p["end_sample"] <= samples):
            raise AlignmentError("--layout passage %d has overlapping, reversed or out-of-audio sample bounds." % i)
        if not (p["first_word"] == next_word <= p["last_word"] < word_count):
            raise AlignmentError("--layout passage %d must continue the contiguous word ranges in order." % i)
        next_word = p["last_word"] + 1
        previous_end = p["end_sample"]
    if next_word != word_count:
        raise AlignmentError("--layout word ranges must cover every supplied word exactly once.")
    return passages


def decode_audio(path):
    for binary in ("ffmpeg", "ffprobe"):
        if shutil.which(binary) is None:
            raise AlignmentError("missing %s; check: %s -version. See TOOL.md Dependencies." % (binary, binary))
    try:
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                                "stream=sample_rate,duration_ts,time_base", "-of", "json", str(path)],
                               check=True, capture_output=True)
        stream = json.loads(probe.stdout)["streams"][0]
        rate = int(stream["sample_rate"])
        if rate <= 0:
            raise ValueError("sample rate")
        # Match whisper.audio.load_audio: decode/resample the whole file once,
        # with the same signed-16-bit quantization and mono downmix.
        decoded = subprocess.run(["ffmpeg", "-nostdin", "-threads", "0", "-i", str(path),
                                  "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le",
                                  "-ar", str(SAMPLE_RATE), "-"],
                                 check=True, capture_output=True)
        pcm = array.array("h")
        pcm.frombytes(decoded.stdout)
        if sys.byteorder != "little":
            pcm.byteswap()
        if not pcm:
            raise ValueError("empty audio")
        pcm = array.array("f", (sample / 32768.0 for sample in pcm))
        # Retain exact source sample bounds when container duration agrees
        # within one decoded sample (e.g. PCM WAV). Compressed durations can
        # include padding absent from decoded audio; use decoded length then.
        samples = len(pcm) * rate // SAMPLE_RATE
        try:
            source_samples = Fraction(stream["duration_ts"]) * Fraction(stream["time_base"]) * rate
            decoded_samples = source_samples * SAMPLE_RATE / rate
            if (source_samples.denominator == 1 and source_samples > 0
                    and abs(decoded_samples - len(pcm)) < 1):
                samples = int(source_samples)
        except (KeyError, TypeError, ValueError, ZeroDivisionError, OverflowError):
            # Container duration is optional metadata, not a decode verdict.
            pass
        return rate, samples, pcm
    except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError) as error:
        raise AlignmentError("could not decode --audio as finite PCM; check the audio with ffprobe.") from error


def plugin_root():
    return TOOL_DIR.parent.parent


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
    message = INSTALL_COPY_ONLY if saved else INSTALL_NOT_SAVED
    sys.stderr.write(message + reason + ".\n")


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


def authorized(opts):
    if opts.get("--install") or os.environ.get("WISER_ALLOW_INSTALL") == "1":
        return True
    if person_marker_grants():
        return True
    try:
        fd = os.open(plugin_root() / ".wiser-consent", os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise OSError("the copy marker is not a regular file")
            marker = json.load(stream)
        return isinstance(marker, dict) and marker.get("realpath") == str(plugin_root().resolve())
    except (OSError, ValueError):
        return False


def consent(opts, reason, libraries=True):
    if not authorized(opts):
        raise AlignmentError(install_question("the code libraries word timing needs (and the word-timing model, if you don't have it yet)" if libraries else "the word-timing model", "line up known words with the moments they're spoken in a recording", install_size(377664473) + " for the model, if it's needed, plus the code libraries" if libraries else install_size(377664473)) + "\n\nDetails for the assistant: " + reason + " Re-run with --install or WISER_ALLOW_INSTALL=1 to authorize it.")
    if not (opts.get("--install") or os.environ.get("WISER_ALLOW_INSTALL") == "1"):
        warn_copy_consent()
    if opts.get("--install") or os.environ.get("WISER_ALLOW_INSTALL") == "1":
        payload = {"date": datetime.now().strftime("%Y-%m-%d"), "tool": "Transcribe Audio"}
        write_person_consent(payload, plugin_root() / ".wiser-consent", str(plugin_root().resolve()))


def environment_info():
    info = {"python": list(sys.version_info[:3]), "implementation": sys.implementation.name}
    for package in ENGINES:
        try:
            info[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            info[package] = None
    return info


def cached_environment_info(interpreter):
    if Path(sys.prefix).resolve() == CACHE_DIR.resolve():
        return environment_info()
    if not interpreter.is_file():
        return {}
    query = ("import sys, json, importlib.metadata as m; "
             "installed={d.metadata['Name']: d.version for d in m.distributions()}; "
             "print(json.dumps({'python':list(sys.version_info[:3]),'implementation':sys.implementation.name,"
             "'torch':installed.get('torch'),'torchaudio':installed.get('torchaudio')}))")
    result = subprocess.run([str(interpreter), "-I", "-c", query], capture_output=True, text=True)
    if result.returncode != 0:
        raise AlignmentError("could not survey the alignment package cache; check %s --version and SETUP.md." % interpreter)
    return json.loads(result.stdout)


def engines_ready(info):
    roots = [*CACHE_DIR.glob("lib/python*/site-packages"), CACHE_DIR / "Lib" / "site-packages"]
    return all(info.get(package) == version and
               any((root / package / "__init__.py").is_file() for root in roots)
               for package, version in ENGINES.items())


def ensure_environment(opts, args):
    interpreter = CACHE_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python3")
    in_cache = Path(sys.prefix).resolve() == CACHE_DIR.resolve()
    info = cached_environment_info(interpreter)
    runtime = info if interpreter.exists() else environment_info()
    if (tuple(runtime.get("python", [])[:2]) not in PYTHONS
            or runtime.get("implementation") != "cpython"):
        raise AlignmentError("align requires CPython 3.9-3.13 in %s; check: %s --version. See SETUP.md."
                             % (CACHE_DIR, interpreter))
    if not engines_ready(info):
        consent(opts, "Alignment needs torch==2.8.0 and torchaudio==2.8.0 from pypi.org and "
                "files.pythonhosted.org into %s (pip cache disabled). If needed, this run also fetches the word-timing model from download.pytorch.org into %s." % (CACHE_DIR, Path(opts.get("--model-cache", str(config_dir() / "models"))) / "alignment-models"))
        if not interpreter.exists():
            subprocess.run([sys.executable, "-m", "venv", str(CACHE_DIR)], check=True,
                           stdout=sys.stderr)
        env = dict(os.environ, PIP_NO_CACHE_DIR="1", PIP_DISABLE_PIP_VERSION_CHECK="1",
                   PIP_CACHE_DIR=str(CACHE_DIR / "pip-cache"), XDG_CACHE_HOME=str(CACHE_DIR / "cache"))
        subprocess.run([str(interpreter), "-m", "pip", "install", "--no-cache-dir", "--disable-pip-version-check",
                        "-r", str(TOOL_DIR / "requirements-align.txt")], check=True, stdout=sys.stderr, env=env)
        if not engines_ready(cached_environment_info(interpreter)):
            raise AlignmentError("alignment package install is incomplete; check requirements-align.txt and retry.")
    if not in_cache:
        os.execv(str(interpreter), [str(interpreter), str(TOOL_DIR / "scripts" / "transcribe.py"), "align", *args])


class DownloadNeeded(Exception):
    pass


def incomplete_weights(error):
    if isinstance(error, (PermissionError, MemoryError)):
        return False
    if isinstance(error, OSError) and error.errno in (errno.EACCES, errno.EPERM, errno.ENOMEM):
        return False
    if isinstance(error, RuntimeError) and (
            "outofmemory" in type(error).__name__.lower() or
            any(message in str(error).lower() for message in
                ("out of memory", "not enough memory", "can't allocate memory", "cannot allocate memory",
                 "could not allocate memory"))):
        return False
    return True


def load_model(torch, bundle, cache, opts):
    # The pinned bundle names its own artifact; torch.hub's torch.load and the
    # bundle's load_state_dict decide usability. Block its downloader on the
    # first attempt, including when a partial cache is present.
    folder = screen(str(cache / "alignment-models"), "alignment cache", True)
    weight = screen(str(folder / Path(bundle._path).name), "alignment weights", True)
    kwargs = {"model_dir": str(folder), "map_location": "cpu", "weights_only": True, "progress": False}
    repair = False
    try:
        with patch.object(torch.hub, "download_url_to_file", side_effect=DownloadNeeded), contextlib.redirect_stdout(sys.stderr):
            return bundle.get_model(dl_kwargs=kwargs)
    except DownloadNeeded:
        pass
    except Exception as error:
        if not incomplete_weights(error):
            raise AlignmentError("could not load alignment model; check cache permissions and available RAM; no download attempted.") from error
        repair = True
    consent(opts, "%s weights are absent or incomplete: about %s (377,664,473 bytes), MIT, "
            "from download.pytorch.org into %s." % (MODEL, install_size(377664473), folder), libraries=False)
    aside = None
    if repair:
        # Retain the unusable artifact; the native downloader only fetches when
        # the destination is absent. Permission and RAM failures never reach here.
        aside = weight.with_name(weight.name + ".incomplete-" + uuid.uuid4().hex)
        weight.rename(aside)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            return bundle.get_model(dl_kwargs=kwargs)
    except Exception as error:
        # Nothing replaced it: put the set-aside file back where later runs look.
        if aside is not None and not weight.exists():
            aside.rename(weight)
        raise AlignmentError("could not load or download alignment weights from download.pytorch.org; check the connection and retry with --install.") from error


def word_spans(spans, targets, separator):
    if len(spans) != len(targets) or any(span.token != target for span, target in zip(spans, targets)):
        raise AlignmentError("alignment token identity/count differs from supplied words; no timings written.")
    grouped, current = [], []
    for span, target in zip(spans, targets):
        if target == separator:
            if not current:
                raise AlignmentError("alignment returned an empty word; no timings written.")
            grouped.append(current)
            current = []
        else:
            current.append(span)
    if not current:
        raise AlignmentError("alignment returned an empty final word; no timings written.")
    return grouped + [current]


def validate_output(words, timings, rate, samples):
    if len(words) != len(timings):
        raise AlignmentError("alignment did not return one timing per supplied word.")
    previous = 0.0
    for word, timing in zip(words, timings):
        if set(timing) != {"text", "start", "end"} or timing["text"] != word:
            raise AlignmentError("alignment changed supplied word identity or output shape.")
        start, end = timing["start"], timing["end"]
        if (any(type(x) not in (float, int) or not math.isfinite(x) for x in (start, end))
                or not 0 <= previous <= start <= end <= samples / rate):
            raise AlignmentError("alignment returned invalid or out-of-audio word spans; no timings written.")
        previous = start


def passage_timings(words, groups, passage, rate, ratio, anchored):
    s0, s1 = passage["start_sample"] / rate, passage["end_sample"] / rate
    timings = []
    for i, (word, group) in enumerate(zip(words, groups)):
        start = max(s0, s0 - LEAD + group[0].start * ratio)
        end = min(s1, s0 - LEAD + group[-1].end * ratio)
        if anchored and i == 0:
            start = s0
        timings.append({"text": word, "start": start, "end": end})
    return timings


def infer(torch, audio, words, tokens, passages, rate, bundle, model, anchored):
    import torchaudio.functional as functional
    labels = {label: i for i, label in enumerate(bundle.get_labels())}
    separator = labels["|"]
    if bundle.sample_rate != SAMPLE_RATE:
        raise AlignmentError("alignment model must use the decoded 16 kHz audio clock.")
    timings = []
    for p in passages:
        first, last = p["first_word"], p["last_word"]
        s0, s1 = p["start_sample"] / rate, p["end_sample"] / rate
        segment = torch.tensor(audio[int(s0 * SAMPLE_RATE):int(s1 * SAMPLE_RATE)], dtype=torch.float32)
        lead_samples = int(LEAD * bundle.sample_rate)
        segment = torch.cat((torch.zeros(lead_samples), segment)).unsqueeze(0)
        targets = []
        for token in tokens[first:last + 1]:
            if targets:
                targets.append(separator)
            targets.extend(labels[c] for c in token)
        with torch.inference_mode():
            emission, _ = model(segment)
            aligned, scores = functional.forced_align(emission.log_softmax(-1),
                torch.tensor([targets], dtype=torch.int32), blank=0)
            spans = functional.merge_tokens(aligned[0], scores[0].exp())
        groups = word_spans(spans, targets, separator)
        if len(groups) != last - first + 1:
            raise AlignmentError("alignment word count differs from the passage; no timings written.")
        ratio = segment.size(1) / emission.size(1) / bundle.sample_rate
        timings.extend(passage_timings(words[first:last + 1], groups, p, rate, ratio, anchored))
    validate_output(words, timings, SAMPLE_RATE, len(audio))
    return timings


def write_output(output, timings):
    output.parent.mkdir(parents=True, exist_ok=True)
    # Link when available; an exclusive create protects existing artifacts on
    # volumes without hard links. Keep a finished sibling if publication fails.
    temporary = None
    ready = published = refused = False
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=".wiser-align-", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(timings, handle, ensure_ascii=False, allow_nan=False, indent=2)
            handle.write("\n")
            handle.flush()
            # The bytes are written; a failed sync or close keeps this copy for recovery.
            ready = True
            os.fsync(handle.fileno())
        try:
            os.link(temporary, output)
        except FileExistsError:
            refused = True
            raise
        except OSError:
            try:
                descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            except FileExistsError:
                refused = True
                raise
            try:
                with os.fdopen(descriptor, "wb") as target, temporary.open("rb") as source:
                    shutil.copyfileobj(source, target)
                    target.flush()
                    os.fsync(target.fileno())
            except BaseException:
                output.unlink(missing_ok=True)
                raise
        published = True
    finally:
        if temporary is not None and (not ready or published or refused):
            temporary.unlink(missing_ok=True)


def main(args=None):
    args = list(sys.argv[1:] if args is None else args)
    if not args or any(x in args for x in ("help", "--help", "-h")):
        print(USAGE)
        return 0
    try:
        opts = parse(args)
        paths = {k: screen(opts[k], k, k == "--output") for k in ("--audio", "--words", "--output")}
        layout_path = screen(opts["--layout"], "--layout") if "--layout" in opts else None
        cache = screen(opts.get("--model-cache", str(config_dir() / "models")), "--model-cache", True)
        if paths["--output"].exists():
            raise AlignmentError("--output already exists; name a new file to preserve the existing artifact.")
        if cache.exists() and not cache.is_dir():
            raise AlignmentError("--model-cache must name a directory.")
        audio = paths["--audio"]
        if not audio.is_file() or audio.suffix.lower() not in FORMATS:
            raise AlignmentError("--audio must name an existing supported audio file; run align --help.")
        words = read_json(paths["--words"], "--words")
        tokens = normalize_words(words)
        layout = read_json(layout_path, "--layout") if layout_path else None
        rate, samples, pcm = decode_audio(audio)
        passages = validate_layout(layout, rate, samples, len(words))
        for p in passages:
            start = int(p["start_sample"] / rate * SAMPLE_RATE)
            end = int(p["end_sample"] / rate * SAMPLE_RATE)
            if not start < end <= len(pcm):
                raise AlignmentError("passage is empty or exceeds the decoded 16 kHz audio bounds.")
        ensure_environment(opts, args)
        import torch
        from torchaudio.pipelines import WAV2VEC2_ASR_BASE_960H as bundle
        model = load_model(torch, bundle, cache, opts)
        timings = infer(torch, pcm, words, tokens, passages, rate, bundle, model, layout is not None)
        write_output(paths["--output"], timings)
        print(json.dumps({"ok": True, "file": str(paths["--output"]), "model": MODEL,
                          "language": "en", "words": len(timings), "sample_rate": rate, "samples": samples}))
        return 0
    except (AlignmentError, OSError, RuntimeError, ValueError, ImportError, subprocess.SubprocessError) as error:
        # Never print decoder output or package/model exceptions, which can
        # carry arbitrary bytes from inputs; user-facing errors above are ours.
        message = str(error) if isinstance(error, AlignmentError) else "alignment failed; check audio, engine versions, output permissions and available RAM; no timings written."
        print(("" if message.startswith("This Wiser skill needs to download and install ") else "Error: ") + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
