---
name: Transcribe Audio
type: tool
category: media
description: Turns one audio file into a text transcript with a speech model that runs on this machine
version: 0.2.0
gaps:
  - Speaker labeling, which would say which speaker said each turn
---

# Transcribe Audio

One run turns a single audio file into a plain text transcript written where the caller asks for it.

## Context

Use it when a recording has to become text: a call, an interview, a meeting, a voice memo, a piece of media whose words are needed for reading, quoting, or further work. The speech model runs here, so the audio is never uploaded anywhere and a run costs nothing per minute.

Do not use it to interpret what was said. It produces words and timings and nothing else: no summary, no analysis, no decisions, no fact checking. Reading meaning out of a transcript is separate work, done after this tool finishes and equally possible on a transcript this tool never produced.

Do not use it on audio that is not in English. Transcription is pinned to English, so a recording in another language transcribes as though it were English and produces nonsense that the run reports as a success.

It authenticates to nothing and holds no credential of its own.

It does not say who was speaking. Every turn arrives unattributed, so a recording with several voices transcribes as one stream of words. No primitive in this root labels speakers: the library that would has to be fetched from a hosted registry behind a read token, and one that needs no credential has to be found first.

A run reaches the network only to fetch what it needs to work, never to send audio: this tool's package install and the first use of a given speech model. The packages land in this tool's own cache and the models in the model directory the caller names, so once each of those has happened, later runs on the same machine reach nothing.

## Inputs

One audio file, named by `--audio` as an absolute path, in one of these formats: `.flac`, `.m4a`, `.mp3`, `.mp4`, `.mpeg`, `.mpga`, `.ogg`, `.wav`, `.webm`. Length is unbounded; processing time scales with it and with the model chosen.

Two directories, both absolute and both outside this tool's directory: `--output`, where the transcript file is written, and `--model-cache`, where downloaded model weights live. Pass the same model directory on every run in a workspace, or each run downloads its model again.

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

Then transcribe. If this copy of the plugin has not yet authorised an install, the run reports what it would install and stops; `--install` on that run is the answer: it creates this tool's package cache, installs the speech packages into it, and finishes the work, and later tools in this copy install without asking. It prints one JSON object naming the file it wrote.

```bash
python3 scripts/transcribe.py transcribe --audio /path/to/call.m4a \
  --output /path/to/work/transcripts --model-cache /path/to/work/models
```

```
{"ok":true,"file":"...","model":"base","language":"en","segments":142,"duration_minutes":18.4}
```

Anything else, see Troubleshooting.

## Dependencies

This tool's script runs under Python rather than Node, which the Script Contract's Runtimes clause allows once the interpreter is declared here. Each dependency below is checked after help parsing and only on a command that needs it, and a missing one fails the run by naming the dependency and its check command. Install steps are never written here; when a check fails the agent derives them from the dependency's own current documentation, per that contract's System dependencies clause.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Python 3.8 or newer | Every command; the script is written for this interpreter and creates its package cache with it | `python3 --version` succeeds |
| FFmpeg | Every transcription; the speech engine decodes audio through it | `ffmpeg -version` succeeds |

The interpreter is the one dependency a script cannot check from inside itself, so the agent runs its check before invoking the script the first time on a machine. The `check` command reports the rest at once, so a machine can be prepared before the first transcription.

## Configuration

None. No command takes `--env`, no key is read, and no credential is held: the audio file and the two directories are the whole input.

## Usage

| Command | Purpose |
|---------|---------|
| `python3 scripts/transcribe.py help` | Print usage and exit |
| `python3 scripts/transcribe.py check` | Report the interpreter, FFmpeg, and whether the speech packages are installed |
| `python3 scripts/transcribe.py transcribe --audio [path] --output [dir] --model-cache [dir]` | Write a transcript of one audio file |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--audio [path]` | The audio file, absolute | None; required |
| `--output [dir]` | Directory the transcript is written into, absolute and outside this tool directory | None; required |
| `--model-cache [dir]` | Directory model weights are downloaded into, absolute and outside this tool directory | None; required |
| `--model [name]` | Speech model: `tiny`, `base`, `small`, `medium`, `large` | `base` |
| `--help` | Print usage and exit | Off |

Model choice trades time for accuracy, and the weights are downloaded once per model into `--model-cache`:

| Model | Weights | Choose it when |
|-------|---------|----------------|
| `tiny` | Smallest, fastest | The audio is clean and only the gist is needed |
| `base` | Small | The default; ordinary speech, ordinary stakes |
| `small` | Larger | Accents, crosstalk, or domain vocabulary start costing accuracy |
| `medium` | Large | The transcript will be quoted or acted on |
| `large` | Largest, slowest | Accuracy outranks time, or the audio is genuinely hard |

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. No command takes `--env`, so that clause has nothing to bind here. What a run writes, and where, is in `tools/AGENTS.md`. Beyond those, three behaviors are worth knowing.

The package cache is this tool's own, per that contract's Runtimes clause. Once `--install` has authorised this copy, a transcription creates a virtual environment beside the scripts, installs the speech packages into it, and finishes the run; nothing is installed into the machine or the user's environment, because the install runs with pip's own download cache switched off rather than leaving it at pip's default outside this tool.

Arguments are validated before that package install, so a malformed command or a missing FFmpeg costs no download. Only Python's own standard library is used above the install; the speech packages import after it.

Progress goes to stderr and stdout carries only the final JSON object, so a caller parses a run without stripping log lines. The two directories a run writes into are the caller's, and each is refused when it resolves inside this tool directory; nothing else is written anywhere but the package cache.

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
| `--model-cache resolves inside this tool directory` | The model directory landed in the shared root | Pass a work directory in the owning root |
| `could not load the speech model` | The model download failed, usually no network on the first use of that model | Re-run once the machine is online; a model already in `--model-cache` needs no network |
| The transcript reads as nonsense and the run reported success | The audio was not in English, which this tool is pinned to | The recording needs a transcriber that reads its language |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no package cache and nothing configured.
- `check` prints one JSON object and exits 0, installing nothing, downloading nothing, and opening no connection.
- A `transcribe` over a real audio file, on a copy whose packages are installed, exits 0 with one parseable JSON object on stdout naming a transcript file that exists and holds the words of the recording.
- A `transcribe` missing FFmpeg exits 1 naming the dependency and its check command, stdout empty, having installed nothing.
- An `--output` or `--model-cache` resolving inside this tool directory is refused before any work runs, whether it is spelled directly, as a case variant, or through a symbolic link standing in for an ancestor.
- No run sends audio anywhere; the only outbound requests any run makes are the model downloads and the package install named in Context, and the only files written are the transcript, the model cache, and this tool's own package cache.
