# video-edit Setup

Once per machine. Skip it if `ffmpeg -version` already succeeds and a short `edit` help run works; before the first `mux`, `loudness`, `finish`, `conform`, `exact-frames`, `composite` or `composite-alpha`, run the ffprobe check in section 2, and before the first `finish`, section 4. Before the first `composite-alpha`, also run its own checks in section 2.

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

Any recent build is enough for trim, resize, speed, concat, frames, and GIF. This tool imports no npm package, so there is no install step at all.

`mux`, `loudness`, `finish`, `conform`, `exact-frames`, `composite` and `composite-alpha` also need ffprobe, which ships with FFmpeg:

```bash
ffprobe -version
```

Only `composite-alpha` runs its own additional checks for the libx264 encoder, png decoder, and setsar and setparams filters:

```bash
ffmpeg -v error -encoders
ffmpeg -v error -decoders
ffmpeg -v error -filters
```

The lists must contain `libx264`, `png`, and both `setsar` and `setparams`, respectively. These requirements apply only to `composite-alpha`; other commands keep their own dependency checks. It installs no packages.

When FFmpeg is missing, the agent follows the Script Contract's System dependencies clause: it reads FFmpeg's current documentation, runs whatever install the host can run itself, and hands you only the smallest step it cannot. Install steps are deliberately not written in this repository; they rot as platforms change.

## 3. Text overlay (optional)

Only needed if you will run `edit --text`:

```bash
ffmpeg -f lavfi -i color=c=black:s=32x32:d=1 -vf drawtext=text=x -frames:v 1 -f null -
```

Exit 0 means the build has drawtext and a resolvable font. Exit non-zero means every other command still works; only text overlay fails until a drawtext-capable build and a font are available. TOOL.md Dependencies names the same check.

## 4. The final encode (optional)

Only needed if you will run `finish`:

```bash
ffmpeg -hide_banner -encoders | grep -E '^ [A-Z.]{6} (libx264|libopus) '
```

A line naming `libx264` and a line naming `libopus` mean the build can encode a finished video. A missing one prevents `finish`; conform separately needs libx264. Other operations retain their existing dependency checks. TOOL.md Dependencies names the same check.

For `conform`, libx264 alone is required; libopus is not probed. Its operation also checks scale, format, setsar, setparams, aresample and asetpts with `ffmpeg -filters`.

`composite` also requires libx264, with scale, setsar and setparams. `exact-frames` requires the png encoder, with scale, format, select and crop. Those commands check only their own encoder/filter names with `ffmpeg -encoders` and `ffmpeg -filters`; an unavailable one does not affect older operations.

## 5. Verify

```bash
node scripts/edit.js help
```

Usage text with nothing configured. On a correctly set up copy, help exits 0 and `ffmpeg -version` succeeds.

For `composite-alpha`, confirm that help lists its eight required flags and bounds, `ffprobe -version` succeeds, and the section 2 lists contain its libx264 encoder, png decoder and two filters. Help itself probes none of them; the command's own dependency check runs only when processing media. Missing one affects this command alone under these checks.

## Troubleshooting

**`ffmpeg: command not found`** FFmpeg is not on PATH. Install it for this OS, open a new shell, and check again.

**drawtext check fails** The FFmpeg build lacks freetype or no font is resolvable. Other commands remain usable; fix only when captions are required.

**`ffprobe: command not found`** The FFmpeg install did not put ffprobe on PATH. `edit`, `concat`, sampled `frames` and `gif` still run; make the ffprobe presence check succeed before using the other commands.

**The encoder check names only one of the two, or neither** The build lacks `libx264` or `libopus`. Fix only when the requested operation needs that encoder: both for `finish`, libx264 for `conform` or `composite`. Exact extraction separately checks png.
