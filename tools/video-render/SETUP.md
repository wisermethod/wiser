# video-render Setup

System dependencies are once per machine, packages once per copy of the plugin (`tools/RUNNING.md`). Run commands from this tool's directory.

## 1. System programs

```bash
node --version
ffmpeg -version
ffprobe -version
node scripts/video-render.js check
```

Node must print 22 or later; `ffmpeg` and `ffprobe` must exit 0. `check` surveys all of them, the installed HyperFrames version and a headless trial launch of its pinned Chrome, and installs nothing. Its `ready` is true only when every part holds. When a program is missing, follow `standards/script-contract.md` System dependencies: read the program's own current documentation, run what the host can run, and hand the person only the smallest step it cannot. Machine-level changes need the person's approval. Install walkthroughs are not kept here.

## 2. Packages and the pinned Chrome

The first command that needs them reports what an install fetches and stops: HyperFrames 0.8.134 and its dependencies from `registry.npmjs.org`, into this tool's `node_modules/`, and HyperFrames' pinned `chrome-headless-shell` 152.0.7977.30 from Google's Chrome for Testing storage, into `~/.cache/hyperframes/chrome/`, with each one's measured size. Put that report to the person; their answer is `--install` on the same command, or `WISER_ALLOW_INSTALL=1` for an unattended run. The authorised run installs with `npm ci` from the committed lockfile, then runs HyperFrames' own `browser ensure`, then finishes the work it was asked for. `check --install` installs and then surveys.

An install that fails names its cause. Delete this tool's `node_modules/` before retrying a failed package install, so a half-finished tree cannot mask the result. A Chrome that is present but fails its trial launch is diagnosed from the failure, never replaced by a new download. `tools/AGENTS.md` lists every write an install makes.

## 3. A first render

```bash
node scripts/video-render.js render --project /path/to/work/scene --output /path/to/work/scene.mp4 \
  --width 1920 --height 1080 --fps 30 --duration 4
```

The project is shaped as `TOOL.md` The project says. A render that succeeds prints one JSON object naming the MP4's SHA-256 and the checks it passed.
