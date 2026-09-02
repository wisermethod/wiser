# video-edit Setup

Once per machine. Skip it if `ffmpeg -version` already succeeds and a short `edit` help run works.

Run every command below from this tool's directory when a Node command is shown. On Windows, use Git Bash for shell checks.

## 1. Node

```bash
node --version
```

18 or newer. Missing or older: install the current LTS from nodejs.org, open a new shell, and check again.

## 2. FFmpeg

```bash
ffmpeg -version
```

Any recent build is enough for trim, resize, speed, concat, frames, and GIF. This tool imports no npm package, so there is no `npm install` step.

When FFmpeg is missing, the agent follows the Script Contract's System dependencies clause: it reads FFmpeg's current documentation, runs whatever install the host can run itself, and hands you only the smallest step it cannot. Install steps are deliberately not written in this repository; they rot as platforms change.

## 3. Text overlay (optional)

Only needed if you will run `edit --text`:

```bash
ffmpeg -f lavfi -i color=c=black:s=32x32:d=1 -vf drawtext=text=x -frames:v 1 -f null -
```

Exit 0 means the build has drawtext and a resolvable font. Exit non-zero means every other command still works; only text overlay fails until a drawtext-capable build and a font are available. TOOL.md Dependencies names the same check.

## 4. Verify

```bash
node scripts/edit.js help
```

Usage text with nothing configured. On a correctly set up copy, help exits 0 and `ffmpeg -version` succeeds.

## Troubleshooting

**`ffmpeg: command not found`** FFmpeg is not on PATH. Install it for this OS, open a new shell, and check again.

**drawtext check fails** The FFmpeg build lacks freetype or no font is resolvable. Other commands remain usable; fix only when captions are required.
