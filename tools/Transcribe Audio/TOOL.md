---
name: Transcribe Audio
type: tool
category: media
description: Transcribes an audio file or aligns known English words to its sample clock on this machine
version: 0.3.2
gaps:
  - Speaker labeling, which would say which speaker said each turn
---

# Transcribe Audio

One run transcribes an audio file or aligns supplied words to it, writing where the caller asks.

## Context

Classifier seam: none.

Use it when a recording has to become text: a call, an interview, a meeting, a voice memo, a piece of media whose words are needed for reading, quoting, or further work. The speech model runs here, so the audio is never uploaded anywhere and a run costs nothing per minute.

Use `align` when the ordered spoken words are already known and their times are needed. Alignment does not establish that the recording said those words; retain the caller's independent transcription/presence check. `transcribe` continues to produce plain text without word spans.

Do not use it to interpret what was said: no summary, analysis, decisions, or fact checking. Reading meaning out of a transcript is separate work.

Do not use it on audio that is not in English. Transcription is pinned to English, so a recording in another language transcribes as though it were English and produces nonsense that the run reports as a success.

It authenticates to nothing and holds no credential of its own.

It does not say who was speaking. Every turn arrives unattributed, so a recording with several voices transcribes as one stream of words. No primitive in this root labels speakers: the library that would has to be fetched from a hosted registry behind a read token, and one that needs no credential has to be found first.

A run reaches the network only to fetch what it needs to work, never to send audio: this tool's package install and the first use of a given speech model. The packages land in this tool's own cache and the models in the person-scoped `models/` folder named in `tools/AGENTS.md`, or in an explicit `--model-cache` if the caller passed one, so once each of those has happened, later runs on the same machine reach nothing.

## Inputs

One audio file, named by `--audio` as an absolute path, in one of these formats: `.flac`, `.m4a`, `.mp3`, `.mp4`, `.mpeg`, `.mpga`, `.ogg`, `.wav`, `.webm`. Processing time and RAM scale with its length. For alignment, long recordings should supply passage bounds so each inference fits memory.

For `transcribe`, `--output` is a required absolute directory outside this tool where the transcript is written. For `align`, its file and known-word inputs are specified under Align known words. `--model-cache` is optional: omit it and weights use the person-scoped `models/` folder in `tools/AGENTS.md`. An explicit absolute `--model-cache` still wins. A destination that is the connector key file is refused. Do not put weights in a root: the tool screens the key file, not a composed root, so the caller must not pass one.

## Quick Start

```bash
python3 scripts/transcribe.py help
```

Usage text, on a copy with nothing installed and nothing configured.

```bash
python3 scripts/transcribe.py check
```

Reports what the machine has, installing nothing and downloading nothing:

```
{"python":"3.11.9","ffmpeg":true,"packages":false}
```

Then transcribe. If install consent is absent, the run reports what it would install and stops; `--install` on that run is the answer: it creates this tool's package cache, installs the speech packages into it, and finishes the work. It prints one JSON object naming the file it wrote.

```bash
python3 scripts/transcribe.py transcribe --audio /path/to/call.m4a \
  --output /path/to/work/transcripts
```

```
{"ok":true,"file":"...","model":"base","language":"en","segments":142,"duration_minutes":18.4}
```

Anything else, see Troubleshooting.

## Dependencies

This tool's script runs under Python rather than Node, which the Script Contract's Runtimes clause allows once the interpreter is declared here. Each dependency below is checked after help parsing and only on a command that needs it, and a missing one fails the run by naming the dependency and its check command. Install steps are never written here; when a check fails the agent derives them from the dependency's own current documentation, per that contract's System dependencies clause.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Python 3.8 or newer | Help, check and transcription, unchanged | `python3 --version` succeeds |
| CPython 3.9–3.13 | Alignment's interpreter in the tool's `.venv`; another launcher can hand off to it | `.venv/bin/python3 --version` reports a supported minor version (Windows: `.venv/Scripts/python.exe --version`) |
| FFmpeg | Transcription and alignment decoding | `ffmpeg -version` succeeds |
| FFprobe | Alignment reads the source sample rate before decoding | `ffprobe -version` succeeds |

The interpreter is the one dependency a script cannot check from inside itself, so the agent runs its check before invoking the script the first time on a machine. The `check` command reports the rest at once, so a machine can be prepared before the first transcription.

## Configuration

None. No command takes `--env`, no key is read, and no credential is held. Each operation's local inputs are declared under Usage and Align known words.

## Usage

| Command | Purpose |
|---------|---------|
| `python3 scripts/transcribe.py help` | Print usage and exit |
| `python3 scripts/transcribe.py check` | Report the interpreter, FFmpeg, and whether the speech packages are installed |
| `python3 scripts/transcribe.py transcribe --audio [path] --output [dir] [--model-cache [dir]]` | Write a transcript of one audio file |
| `python3 scripts/transcribe.py align --audio [path] --words [json] --output [json] [--layout [json]] [--language en] [--model-cache [dir]] [--install]` | Write known-word timings; contract below |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--audio [path]` | The audio file, absolute | None; required |
| `--output [dir]` | Directory the transcript is written into, absolute and outside this tool directory | None; required |
| `--model-cache [dir]` | Directory model weights are downloaded into, absolute and outside this tool directory. Omit for the person-scoped `models/` folder in `tools/AGENTS.md`. The connector key file is refused. | that `models/` folder |
| `--model [name]` | Speech model: `tiny`, `base`, `small`, `medium`, `large` | `base` |
| `--help` | Print usage and exit | Off |
| `--install` | Authorize packages and weights under the plugin consent; `WISER_ALLOW_INSTALL=1` does the same | Off |
| `-h` | Short alias for `--help` | Off |

Model choice trades time for accuracy, and the weights are downloaded once per model into the person-scoped `models/` folder, or into `--model-cache` when that flag is passed:

| Model | Weights | Choose it when |
|-------|---------|----------------|
| `tiny` | Smallest, fastest | Only the gist is needed |
| `base` | Small | The default; ordinary speech, ordinary stakes |
| `small` | Larger | Accents, crosstalk, or domain vocabulary |
| `medium` | Large | The transcript will be quoted or acted on |
| `large` | Largest, slowest | Accuracy outranks time, or the audio is genuinely hard |

When the request states more than one of these, pass the first match in the order `large`, then `medium`, then `small`, then `tiny`, from what the request states rather than by listening. A `--model` name outside that list: ask, and do not substitute `base`.

## Align known words

Run `python3 scripts/transcribe.py align --help` for its closed flag set. `--model` belongs only to transcription; alignment always uses torchaudio's English `WAV2VEC2_ASR_BASE_960H`, never MMS_FA or Whisper.

Pass `--audio` in a format listed under Inputs and `--words` as an absolute path to a strict JSON array of spoken words, for example `["Here", "are", "your", "boards."]`. Each string is one word, with its original spelling and punctuation. No control/comparison tags are removed: the caller supplies spoken words without tags. Normalization uppercases ASCII letters, converts curly apostrophes/quotes, strips edge `.,!?;:"()` and quote apostrophes, and retains internal apostrophes. The result must contain English letters with optional internal apostrophes. Digits, accented letters, hyphens, symbols, whitespace, tags and empty tokens are refused by index and original word. Write numbers or abbreviations as spoken words when needed. Nothing is dropped or substituted. `--language` defaults to `en`; any other value is refused by name. The caller supplies the language truthfully; there is no language detector.

`--output` is an absolute **new JSON file** outside this tool, rather than the directory transcription takes. An existing output is refused. The file is an array with exactly one `{text, start, end}` per supplied word, in order and in the supplied spelling. Times are finite seconds relative to decoded audio time zero, within its actual sample count/rate, with `start <= end` and nondecreasing starts. No silence trim or encoder-delay correction is performed: pass the prepared audio the consumer reads. The tool writes no take registry. Success prints one object with `ok: true`, `file`, `model`, `language`, `words`, `sample_rate` and `samples`.

Optionally pass `--layout` as an absolute strict JSON file:

```json
{"version":1,"sample_rate":24000,"passages":[
  {"start_sample":0,"end_sample":24000,"first_word":0,"last_word":3}
]}
```

Only those keys are accepted. Rates, bounds and indices are integers, never booleans. Sample bounds are zero-based and end-exclusive; nonempty passages must fit the decoded audio and may have gaps but cannot overlap. Word indices are zero-based, `last_word` inclusive; ranges must cover all supplied words exactly once, contiguously and in order. The layout rate must equal the source rate read by FFprobe. Paths, words and layout are validated against the audio **before model loading or package installation**. Source sample counts use a positive whole container sample count agreeing within one 16 kHz sample, otherwise the decoded duration converted to that rate; absent or unusable duration metadata does not fail a successful decode. After conversion to 16 kHz, every passage, including the whole recording without a layout, must satisfy `start < end <= decoded length`.

FFmpeg decodes the whole file to mono 16 kHz signed 16-bit PCM, scaled by 1/32768, with the same command as `whisper.audio.load_audio`. Each passage is cut from that waveform at `int(start_sample / sample_rate * 16000)` and `int(end_sample / sample_rate * 16000)`, then led by 0.3 s of added silence for model context. There is no per-passage resampling. Timings subtract that lead and add the passage offset on the layout's source clock. Its first word starts exactly at the passage's start sample divided by the layout rate, retaining its aligned end. Without a layout, the recording is one passage with the same lead and no first-word anchor.

Alignment pins **torch 2.8.0 and torchaudio 2.8.0** and accepts **CPython 3.9–3.13**, the Python minors listed in both releases' installed `METADATA` Programming Language classifiers. A wheel must also match the host's platform and architecture. The timing proof ran on **CPython 3.9.6 on macOS arm64**; that patch version is evidence, not a requirement. `requirements-align.txt` installs only the two engine packages and their dependencies into this tool's `.venv`. Transcription's `requirements.txt` and install selection are unchanged; alignment neither installs nor imports Whisper. A shared `.venv` with other engine versions needs the pinned alignment versions under the existing install consent. Help and the existing offline `check` import no engine, load no model and neither install nor download anything. `check` retains its transcription survey shape; it does not certify alignment compatibility.

The model is wav2vec 2.0 base, fine-tuned on LibriSpeech 960 h, published by the wav2vec 2.0 authors and redistributed by torchaudio under **MIT**; see `NOTICE.md`. Its one weight file is **377,664,473 bytes, about 378 MB**, from **download.pytorch.org**, into `alignment-models/` under the person-scoped `models/` folder in `tools/AGENTS.md`, or under an explicit absolute `--model-cache`. It is separate from transcription weights. The pinned bundle supplies its filename; the tool first tries the engine's load with downloads blocked. Any load failure except a permission or out-of-memory error is treated as incomplete weights, including a body rejected as not a checkpoint. Without install consent, the original file stays untouched and nothing is fetched. With consent, the tool renames it to `.incomplete-<id>` before the native downloader fetches its replacement. Permission/RAM errors stop without a repair download. Usable weights require no connection. Alignment failure produces no substituted model, recognition, uniformly spaced spans or padded words.

Publication refuses an existing output. A volume without hard links uses an exclusive create and copy instead; the completed JSON is flushed to disk before its temporary sibling is removed. A failed copy removes its partial output and retains the finished `.wiser-align-*` sibling for recovery.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. No command takes `--env`, so that clause has nothing to bind here. What a run writes, and where, is in `tools/AGENTS.md`. Beyond those, three behaviors are worth knowing.

The package cache is this tool's own, per that contract's Runtimes clause. Once the install is authorized with `--install`, a transcription creates a virtual environment beside the scripts, installs the speech packages into it, and finishes the run; nothing is installed into the machine or the user's environment, because the install runs with pip's own download cache switched off rather than leaving it at pip's default outside this tool.

Arguments are validated before that package install, so a malformed command or a missing FFmpeg costs no download. Only Python's own standard library is used above the install; the speech packages import after it.

Progress goes to stderr and stdout carries only the final JSON object, so a caller parses a run without stripping log lines. `--output` is the caller's. Model weights land in the person-scoped default, or in `--model-cache` when passed; each is refused when it resolves inside this tool directory or onto the connector key file. Nothing else is written anywhere but the package cache.

Every caller named path is judged by the file it reaches rather than by the way it is spelled. The format test reads the resolved name, so an audio extension standing in front of another file carries nothing through. `--output` and `--model-cache` are held outside this tool's directory by the same identity comparison, climbing to the deepest ancestor that exists, so a case variant or a symbolic link standing in for an ancestor is refused exactly as the direct spelling is. Where a path cannot be resolved at all, an unreadable folder on the way or a symbolic link pointing at itself, the run refuses by name rather than reporting the interpreter's own error.

## Output

A successful `transcribe` prints one JSON object to stdout and exits 0: `ok`, the `file` written, the `model` used, the `language` transcribed, the number of `segments`, and the audio's `duration_minutes`.

`check` prints the interpreter version and one boolean per dependency.

The transcript file is plain text named `[audio file name without its extension]-transcript-YYYY-MM-DD.txt`, in the `--output` directory, and a second run on the same audio the same day replaces it. It opens with a short header naming the audio file, the date, and the model. The body is the words, in paragraphs broken at sentence boundaries; no turn carries a speaker.

A run that cannot finish prints nothing to stdout, names the cause on stderr, and exits 1.

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails, and a path that is relative or inside this tool, are in `tools/RUNNING.md`; the rows below are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `could not create the package cache` | Python is older than the script needs, or this tool directory is not writable | Confirm `python3 --version`, then that the directory is writable. See SETUP.md |
| `installing ... packages failed` | The install could not complete, usually no network or a Python the packages do not support | Delete the `.venv` directory in this tool, confirm the interpreter, then run the command again |
| `missing ffmpeg; check: ffmpeg -version` | The audio decoder is absent | The agent installs it per the Dependencies section. Install steps live nowhere in this tool |
| `--audio is required` | `transcribe` ran with no audio file | Pass `--audio [absolute path]` |
| `--audio must be absolute` | A relative path was passed, which resolves against the caller's directory | Pass the full path |
| `no file at ...` | The audio path does not exist | Check the path |
| `unsupported audio format` | The resolved file's extension is not one this tool reads | Convert it to a listed format first |
| `could not be resolved to a real path` | A folder on the way is unreadable by this account, or a symbolic link on it points at itself | Confirm the path's permissions and its links, then pass a path that resolves |
| `--model-cache resolves inside this tool directory` | The model directory landed in this tool | Pass an absolute directory outside this tool, or omit the flag for the default in `tools/AGENTS.md` |
| `--model-cache is the connector key file and is refused as a destination` | `--model-cache` resolved onto `auth-provider.env` | Omit the flag, or pass the `models/` folder in `tools/AGENTS.md`, never the key file |
| `could not load the speech model` | The model download failed, usually no network on the first use of that model | Re-run once the machine is online; a model already in `--model-cache` needs no network |
| The transcript reads as nonsense and the run reported success | The audio was not in English, which this tool is pinned to | The recording needs a transcriber that reads its language |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no package cache and nothing configured.
- `check` prints one JSON object and exits 0, installing nothing, downloading nothing, and opening no connection.
- A `transcribe` over a real audio file, on a copy whose packages are installed, exits 0 with one parseable JSON object on stdout naming a transcript file that exists and holds the words of the recording.
- A `transcribe` missing FFmpeg exits 1 naming the dependency and its check command, stdout empty, having installed nothing.
- An `--output` or `--model-cache` resolving inside this tool directory is refused before any work runs, whether it is spelled directly, as a case variant, or through a symbolic link standing in for an ancestor.
- A `transcribe` with no `--model-cache` uses the person-scoped `models/` folder in `tools/AGENTS.md`. A destination that is the connector key file is refused. Missing weights stop named, with no download, until `--install` or `WISER_ALLOW_INSTALL=1`.
- `align` returns one original-spelling timing per supplied word on the audio's sample clock; a layout anchors every passage's first word exactly to its start sample.
- Invalid layouts, unsupported words and non-English language codes fail before model loading, with no timing output or fallback.
- No run sends audio anywhere; outbound requests are only the declared downloads. Deliverable, package and weight writes are inventoried in `tools/AGENTS.md`.
