# Screen Capture Setup

System dependencies are once per macOS machine, packages once per plugin copy (`tools/RUNNING.md`). Run commands from this tool's directory. Before desktop work, apply TOOL.md's Quick Start host decision; a sandbox such as Cowork or an unidentified launching app stops as untested.

## 1. Interpreter and system programs

```bash
python3 -c 'import sys; print(sys.version.split()[0]); sys.exit(sys.version_info < (3, 9))'
python3 -m venv --help
python3 scripts/capture.py help
python3 scripts/capture.py check
```

The version command must print 3.9 or newer and exit 0; `python3 -m venv --help` must print usage. Use compatible wheels for that interpreter. The measured copies use Python 3.9.6, 3.11.15 and 3.14.7. `check` surveys the interpreter, required pins in this interpreter's `.venv`, programs on PATH and both permissions, without installing, capturing, driving an app or asking macOS for permission. Its `programs` booleans mean presence on PATH, except `ffmpeg_libx264`, which asks FFmpeg for its encoders.

TOOL.md's Dependencies section names the system checks: Python, FFmpeg with ffprobe, Tesseract, and screencapture (which ships with macOS). For redacted video, `ffmpeg -hide_banner -encoders` must list `libx264`; a video redaction refuses without it before installing packages. Tesseract checks stills as well as recordings. FFmpeg decodes recordings; ffprobe reads their encoded colour tags. The tool installs none of these programs.

When a check fails, the agent follows `standards/script-contract.md` System dependencies: consult the dependency's own current documentation, run what the host can run, and hand the person only the smallest step the host cannot. Machine-level changes need the person's approval. Install walkthroughs are deliberately not kept here.

## 2. Packages

The first command needing packages reports their pins, roughly 100 MB, the hosts `pypi.org` and `files.pythonhosted.org`, and this tool's `.venv`, then stops unless this copy already has install consent. Put that report to the person; their answer is `--install` on the same command, or `WISER_ALLOW_INSTALL=1` for an unattended run. The authorized run installs and finishes the work. `check` and `help` take no install flag; `size` takes one like the other desktop commands, since it needs the packages to read the window back.

The pins are PyObjC core and its Cocoa, Quartz, CoreML and Vision frameworks at 11.1, Pillow at 11.3.0, and NumPy at 2.0.2 below Python 3.11 or 2.3.5 from Python 3.11 onward. `NOTICE.md` records the three measured resolutions. Only wheels are accepted; nothing is compiled. pip's download cache is off, so deleting `.venv` requires a new download. No packages are installed into the machine's Python environment. Use one interpreter consistently per copy; the `.venv` check looks only in that interpreter's site-packages.

An install failure names the incomplete `.venv`. Remove that `.venv`, check `python3 -m venv --help`, pinned wheel support and directory permissions, then retry with consent. Before replacing any existing `.venv`, apply the constitution's Irreversibles. The inventory of package and temporary writes is `tools/AGENTS.md`.

## 3. macOS permissions

Screen Recording belongs to the app that launched the tool, such as the terminal or editor. Accessibility belongs to that same launching app. They do not belong to the app being captured. When either is missing, `check` returns its `granted:false`, the launching `app` (or `unknown` if it could not identify one), and its `pane`:

- System Settings > Privacy & Security > Screen Recording
- System Settings > Privacy & Security > Accessibility

The person grants these in System Settings. Re-run `check` from the same host afterward and confirm both `granted` fields are true. Screen Recording is used for window inventory and capture; pointer and key actions need both permissions; window sizing needs both before it changes the window, since it reads the window back, and may also need macOS Automation permission for System Events. File-only redaction and verification need neither screen permission.

## 4. Verify

Run TOOL.md's Success checks. `check` exits 0 even when requirements are absent: read each program boolean, package `installed` and permission `granted`. `help` and `check` should work before packages install. A synthetic PNG redaction with supplied terms should write a checked PNG and JSON report, and a separate verify with the same terms should report zero hits for both engines. Check a synthetic recording too when video is needed.

Only when desktop capture is part of the authorized work, test it on the intended window, in the person's prepared state, using the Quick Start in TOOL.md. Pass the person's declared email addresses, names and short name parts as TOOL.md's Inputs requires on every redaction. Keep raw artifacts private and apply TOOL.md's visual and colour-tag decisions before sharing. Missing permissions are the person's step; the setup check never grants them.

## Troubleshooting

`python3: command not found`: confirm the interpreter is installed and on PATH, using the Dependencies procedure above. `wheel install failed` or an incomplete interpreter: use the `.venv` repair in step 2. A permission refusal: grant the launching app the named permission in step 3 after the host decision passes. A sizing failure: also inspect macOS Automation for that launching app and apply TOOL.md's app-name decision when inventory succeeded with that name. TOOL.md's Troubleshooting table covers the command-specific stops.
