# Transcribe Audio Setup

System preparation is once per machine; each operation has its own package and weight needs.

System dependencies are once per machine, packages once per copy (`tools/RUNNING.md`).

Run every command below from this tool's directory. On Windows, use Git Bash; PowerShell and cmd quote arguments differently.

## 1. Interpreter and decoder

```bash
python3 scripts/transcribe.py check
```

It reports the Python version it is running under, whether FFmpeg is present, and whether the speech packages are installed. TOOL.md's Dependencies section names what each dependency is for and the single command that proves it present. When one is missing, the agent follows the Script Contract's System dependencies clause: it reads that dependency's own current documentation, runs whatever install the host can run itself, and hands the user only the smallest step it cannot. Install steps are deliberately not written in this repository; they rot as the tools change.

## 2. Packages

Once the install is authorized with `--install`, a `transcribe` creates a virtual environment in this tool's directory, installs the speech packages into it, and finishes the run. That install downloads several hundred megabytes, so run it once before the machine is needed under time pressure. Nothing is installed into the machine or the user's environment: the install runs with pip's own download cache switched off, so the several hundred megabytes land in the virtual environment and nowhere else, and a re-install after deleting `.venv` downloads them again rather than finding them in a cache outside this tool. A deployment that never transcribes never installs anything.

## 3. Model weights

Model weights are not part of setup. Omit `--model-cache` and the run uses the person-scoped `models/` folder named in `tools/AGENTS.md` (under the platform user-config directory `gateway/SETUP.md` names). A model absent from that folder, or from an explicit `--model-cache` you pass instead, is **reported and refused, not downloaded**: `--install` or `WISER_ALLOW_INSTALL=1` authorizes that download and the same run then does the work. One download per model, reused from then on. Do not put weights in a root. An explicit absolute path still wins. A destination that is the connector key file is refused.

## 4. Verify

Run the checks in TOOL.md's Success section. On a correctly set up copy, `help` and `check` pass with nothing installed, and a `transcribe` over a short recording writes a transcript file and prints the JSON object naming it.

## Known-word alignment

`align` requires **CPython 3.9–3.13**, **torch 2.8.0** and **torchaudio 2.8.0** in this tool's `.venv`, with FFmpeg and FFprobe on PATH. Both pinned releases list those Python minors in their installed `METADATA` Programming Language classifiers; the host also needs wheels matching its platform and architecture. Check the interpreter with `.venv/bin/python3 --version` (Windows: `.venv/Scripts/python.exe --version`). If no environment exists, invoke the command with a supported CPython to create it. An unsupported `.venv` interpreter is refused before installation; the agent follows TOOL.md's Dependencies and the Script Contract to prepare the interpreter. This tool never installs a machine-level interpreter. CPython 3.9.6 on macOS arm64 was used for the timing proof, not required for other runs.

Pass absolute `--audio`, `--words` (JSON word array), `--output` (new JSON file) and optionally `--layout`; TOOL.md defines the version-1 layout. `--language en` is optional. The same command with `--install` authorizes `requirements-align.txt` and finishes alignment; it leaves transcription's requirements unchanged and does not fetch Whisper. `check` remains an offline transcription survey, not an alignment version check.

The MIT English `WAV2VEC2_ASR_BASE_960H` weights are about 378 MB from download.pytorch.org, in `alignment-models/` under the person-scoped model-cache base or an explicit absolute `--model-cache`. They use the same plugin consent as other downloads. A usable cache is reused offline. Any engine load failure except a permission or out-of-memory error is treated as incomplete weights, including a corrupt body rejected as not a checkpoint. Without consent the original file stays untouched and nothing is fetched; an authorized retry renames it to `.incomplete-<id>` before fetching a replacement. Permission or memory failures stop without a repair download. MMS_FA is never used.

Run `python3.11 -m unittest discover -s tests -v` from this tool's directory for the offline suite. It uses only the standard library and loads no model. Alignment decodes the whole file with Whisper's FFmpeg command to mono 16 kHz signed 16-bit PCM, scaled by 1/32768; passage bounds are converted from layout samples to that waveform with `int(seconds * 16000)` at each end, without per-passage resampling. A real alignment should produce one original-spelling span per supplied word; layout first-word starts must equal the sample positions divided by the source rate. Forced alignment does not verify spoken content; retain the caller's independent presence check.

## Troubleshooting

**`python3: command not found`** The interpreter is absent or not on this shell's PATH. Open a new shell; if it persists, the agent installs Python per the Dependencies section of TOOL.md.

**`could not create the package cache`** Usually a directory this account cannot write to, or an interpreter too old for the packages. Confirm both, then run the command again.

**`installing ... packages failed`** Usually no network, or a Python version the speech packages do not publish for. Delete the `.venv` directory in this tool so a half finished install cannot mask the retry, then try again.

**`missing ffmpeg; check: ffmpeg -version`** The audio decoder is absent. Let the agent install it per the Script Contract's System dependencies clause.

