# Transcribe Audio Setup

Once per machine. Skip it if a real `transcribe` already prints a JSON object.

System dependencies are once per machine; a tool's packages are per copy of the plugin, and `tools/AGENTS.md` says what every install writes (`tools/RUNNING.md`).

Run every command below from this tool's directory. On Windows, use Git Bash; PowerShell and cmd quote arguments differently.

## 1. Interpreter and decoder

```bash
python3 scripts/transcribe.py check
```

It reports the Python version it is running under, whether FFmpeg is present, and whether the speech packages are installed. TOOL.md's Dependencies section names what each dependency is for and the single command that proves it present. When one is missing, the agent follows the Script Contract's System dependencies clause: it reads that dependency's own current documentation, runs whatever install the host can run itself, and hands the user only the smallest step it cannot. Install steps are deliberately not written in this repository; they rot as the tools change.

## 2. Packages

Once `--install` has authorised this copy, a `transcribe` creates a virtual environment in this tool's directory, installs the speech packages into it, and finishes the run. That install downloads several hundred megabytes, so run it once before the machine is needed under time pressure. Nothing is installed into the machine or the user's environment: the install runs with pip's own download cache switched off, so the several hundred megabytes land in the virtual environment and nowhere else, and a re-install after deleting `.venv` downloads them again rather than finding them in a cache outside this tool. A deployment that never transcribes never installs anything.

## 3. Model weights

Model weights are not part of setup. A model absent from the directory the caller passes as `--model-cache` is **reported and refused, not downloaded**: `--install` or `WISER_ALLOW_INSTALL=1` authorises that download and the same run then does the work. One download per model, reused from then on. Pick one work directory in the owning root for this and pass it on every run; a different directory each time means a fresh download each time.

## 4. Verify

Run the checks in TOOL.md's Success section. On a correctly set up copy, `help` and `check` pass with nothing installed, and a `transcribe` over a short recording writes a transcript file and prints the JSON object naming it.

## Troubleshooting

**`python3: command not found`** The interpreter is absent or not on this shell's PATH. Open a new shell; if it persists, the agent installs Python per the Dependencies section of TOOL.md.

**`could not create the package cache`** Usually a directory this account cannot write to, or an interpreter too old for the packages. Confirm both, then run the command again.

**`installing ... packages failed`** Usually no network, or a Python version the speech packages do not publish for. Delete the `.venv` directory in this tool so a half finished install cannot mask the retry, then try again.

**`missing ffmpeg; check: ffmpeg -version`** The audio decoder is absent. Let the agent install it per the Script Contract's System dependencies clause.

