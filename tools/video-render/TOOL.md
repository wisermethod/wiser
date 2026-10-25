---
name: video-render
type: tool
category: media
description: Renders one local HTML page whose motion answers the tool's seek to a picture-only MP4, a PNG sequence, or stills at named times, the same frames on every run, under one pinned HyperFrames, with a cache keyed over every input
version: 0.1.0
gaps:
  - rendering on Windows or Linux, which no run has tested
---

# video-render

One run turns one local page into video frames: a picture-only MP4 in one of two profiles, a numbered PNG sequence, or stills at named times. The same inputs give the same bytes on this machine.

## Context

Use it when an HTML animation has to become a video file frame for frame: an explainer for a feed, an email or a slide tool that cannot run scripts, or one scene of a narrated video. It renders through HyperFrames 0.8.134, which it pins, and it sets every switch that version has: no telemetry, no update check, no self-install, no agent skills, its pinned Chrome passed by path, and a home directory of its own for each run, removed at the end.

Not for a still of a page, which is `tools/render/`. Not for editing a recording that exists, which is `tools/video-edit/`. Not for sound: it writes picture only, and narration, music, loudness and joining are the caller's, `tools/video-edit/` among them. Not for a page that animates on the browser's own clock, since its frames would depend on how fast the machine draws: the page answers this tool's seek, under The project below. Not for generating imagery, which is `skills/Media Generator/`.

It authenticates to nothing and reads no credential. After its install, a render reaches no other origin: the screen below refuses one where the page would load it, and the browser it launches reaches only this machine.

Classifier seam: none.

## The project

This section is the one home of what a page must be for this tool to render it.

- **One directory**, absolute, holding `index.html` and every file the page loads, as local files.
- **One root.** `index.html` has exactly one element carrying `data-video-root`, laid out at the frame's size in CSS pixels. The tool sets the renderer's own attributes on that element in its copy of the project; a page carries none of them.
- **The seek.** On every frame the tool dispatches, on `window`, a `CustomEvent` named `video-render:seek` whose `detail.time` is the frame's time in seconds: frame n shows time n / fps. The page's listener sets the frame for that time before it returns. Frames are drawn in any order and split across several browser processes, so a frame depends on its time alone, never on an earlier seek, the browser's clock, or `requestAnimationFrame` and timers, which do not advance between seeks.
- **Nothing animating at capture.** A page that drives CSS transitions or animations from the seek sets them to the time and freezes them into its elements' styles before returning, as `skills/Animated Explainer/`'s two engines do on their render clock. A page that seeks a library's own timeline seeks it to the time. Neither uses `element.animate()` for motion the frame depends on.
- **Nothing from another origin.** A value that loads, in `src`, `href`, `xlink:href`, `srcset`, `poster`, `data`, an inline `style`'s `url(...)`, or a stylesheet's `url(...)` and `@import`, may not name another origin: a scheme other than `data:` or `blob:`, or `//`. A refusal names the file, the attribute or rule, and the value. An XML namespace and a script's text are not screened; the browser itself reaches nothing but this machine.
- **A library is the page's own.** The tool installs no animation, 3D or font library for a page; a page that uses one carries its local copy and that library's own terms.

## Quick Start

Run from this tool's directory. Check Node and FFmpeg as Dependencies says before the first run on a machine.

```bash
node scripts/video-render.js help
node scripts/video-render.js check
node scripts/video-render.js render --project /path/to/work/scene --output /path/to/work/scene.mp4 \
  --width 1920 --height 1080 --fps 30 --duration 11 --cache /path/to/work/render-cache
```

`help` needs nothing installed. `check` installs nothing; read `ready` and its parts, not the exit code. Does a render stop with an install report? Yes: put that report to the person, then re-run the same command with `--install` on their yes, per `tools/RUNNING.md`; the run installs and finishes. No: read its JSON result, or the refusal under Troubleshooting. `SETUP.md` covers a first install.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Node 22 or later | every command but `help` | `node --version` prints 22 or later |
| FFmpeg | `sequence`, `render`, `frames` | `ffmpeg -version` exits 0 |
| ffprobe | `render`, which reads every MP4 back | `ffprobe -version` exits 0 |
| HyperFrames 0.8.134 and its packages | every command but `help` | `node_modules/hyperframes/package.json` in this tool's directory reads 0.8.134 |
| HyperFrames' pinned `chrome-headless-shell` 152.0.7977.30 | `sequence`, `render`, `frames` | `check` reports `chrome.launches: true`, from a headless trial launch |

The packages install into this tool's `node_modules/` with `npm ci` from the committed lockfile, and the Chrome by HyperFrames' own installer into its own cache, `~/.cache/hyperframes/chrome/`, under one consent (`tools/RUNNING.md`). Install steps for Node and FFmpeg are never written here. `tools/AGENTS.md` lists every write.

## Commands

Every path is absolute. Every output path is new, outside this tool's directory and outside the project.

| Command | What it writes |
|---------|----------------|
| `help` | Nothing |
| `check [--install]` | Nothing without `--install`; with it, the install |
| `sequence --project <dir> --output <dir> --width N --height N --fps N --duration S` | A new directory holding `frames/frame_000001.png` onward, `frames/frames.sha256` (one SHA-256 of each frame's decoded RGBA pixels) and `render.log` |
| `render --project <dir> --output <file.mp4> --width N --height N --fps N --duration S [--profile publish\|intermediate] [--frame-hashes <file>] [--cache <dir>]` | The MP4, and only with `--frame-hashes` its decoded-frame hash list; with `--cache`, an entry in that directory |
| `frames --project <dir> --output <dir> --width N --height N --fps N --duration S --times T1,T2,...` | A new directory with one PNG per frame named and `frames.json` |

`sequence`, `render` and `frames` also take `--workers N|auto` (default `auto`), `--gpu hardware|software` (default `hardware`), `--capture screenshot|fast` (default `screenshot`) and `--install`. Each command answers `help` and `--help` before any dependency check, its help lists every flag, and an unknown flag is refused by name.

- **Frame count.** Every output holds exactly round(duration × fps) frames.
- **`frames`.** A time names frame floor(t × fps), the last frame drawn at or before it; a time at or past the end names the last frame. At most 60 times, none twice.

## Profiles

- **`publish`**, the default: H.264 High at CRF 16, a closed group of pictures of half the frame rate, a half rounded up (15 frames at 30 fps, 13 at 25), with 2 B-frames, converted to BT.709 at TV range and tagged so, square pixels, `faststart`, and no edit list. These are the upload settings a measured proof met for YouTube. Use it for a video that stands alone.
- **`intermediate`**: H.264 at CRF 0 in `yuv420p`, BT.709 at TV range, the arguments a cutting tool uses for segments it joins. It is exact to its `yuv420p` frames, not to the page's RGB pixels. Use it for a scene that will be joined with other footage and encoded once, at the end.

Before an MP4 is given its name, `render` reads it back: its frame count; one video stream and no audio; H.264 in `yuv420p`; BT.709 at TV range; square pixels; the requested size; no edit list; and for `publish`, every keyframe an IDR picture at exactly the group spacing, a shorter last group allowed. A file failing any check is removed, and the refusal names the check.

## The cache

`--cache` names a directory in the caller's own work area. Each entry's key is the SHA-256 of every input that can change the MP4's bytes:

- this tool's render version;
- HyperFrames' version, the Chrome build a launch reports, and FFmpeg's version line;
- the GPU and capture modes;
- the size, rate, duration and frame count;
- the profile and its full encoder arguments;
- every project file's path and SHA-256.

The number of workers is not in the key, since the frames do not depend on it. A hit re-hashes the cached MP4 against its record before it is used. A mismatch, or a record that cannot be read, is a miss that replaces the entry, and the result says why. A change to one scene of a video therefore re-renders that scene alone.

## Same frames, and their scope

On one machine, with one GPU mode and one Chrome build, the same project gives the same decoded frames on every run, however the work is split across workers. The defaults are the modes the measured proofs ran: the hardware GPU and screenshot capture. Fast capture and the software GPU draw frames that differ from them, so a frame hash recorded in one mode holds only in that mode. Another machine is not promised the same bytes. A reference set made for comparing frames is made again whenever the machine, the mode or the Chrome changes.

## Output

Success is one JSON object on stdout and exit 0; failure is stderr only, stdout empty, exit 1. `check` exits 0 either way.

| Command | Fields |
|---------|--------|
| `check` | `node`, `ffmpeg`, `hyperframes`, `chrome` (`build`, `launches`, and on a failure `failure` and `remediation`), `ready` |
| `sequence` | `hyperframesVersion`, `chromeBuild`, `gpu`, `capture`, `frameCount`, `hashesPath`, `hashesSha256`, `logPath`, `lintFindings`, `seconds` |
| `render` | the above but the sequence's paths, which are temporary and null, plus `output`, `profile`, `bytes`, `sha256`, `checks`, `sequenceHashesSha256`, `cache` (`hit`, `miss` or `off`), `key`, and on a replaced entry the reason |
| `frames` | the above, `output`, and `frames`: for each requested time, `requestedTime`, `frame`, `time`, `file` and `sha256` |

`lintFindings` repeats what HyperFrames' own lint printed. A page whose motion is driven from the seek draws its `css_transition_used` warning, which is expected there: the transitions are set to the time on every frame. This tool never renders with HyperFrames' strict lint.

## Script Contract

`scripts/video-render.js` is the only entry point; the other modules are its implementation. It follows `system/templates/Script Contract.md`; the governing standard is `standards/script-contract.md`, and the user's running contract is `tools/RUNNING.md`. Help and flag refusals come before any dependency check. Paths are canonicalised, compared by device and inode, and refused inside this tool's directory, inside the project, beside a credential file, or under a memory directory. Every write it makes is listed in `tools/AGENTS.md`.

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails and a relative path, are in `tools/RUNNING.md`. These are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Node … is too old; video-render requires Node >=22` | An older Node is first on `PATH` | Put Node 22 or later first on `PATH`, per Dependencies |
| `FFmpeg is missing or cannot run` | No `ffmpeg` on `PATH` | Make `ffmpeg -version` succeed, per Dependencies |
| `index.html has N data-video-root elements` | The page marks no root, or more than one | Mark exactly one element at the frame's size |
| `Project file … references …` | A loading attribute or rule names another origin | Copy that asset into the project and refer to it locally |
| `HyperFrames wrote N frames; expected …` | The render stopped early, or the page failed to load | Read `render.log` in the run's output for the page's error, fix it, and render to a new path |
| `MP4 check … failed` | The encoded file broke a profile's rule | The named check says which; render again to a new path, and report it if it repeats |
| `chrome-headless-shell … failed during launch` | The pinned Chrome cannot start | Read `remediation` in `check`'s JSON and take that one step; a launch failure that is not a missing file never earns a fresh download |

## Success

- `help` prints usage, exits 0, and installs nothing on a copy with no `node_modules/`.
- `check` exits 0 with one JSON object whose `ready` is true only when Node, FFmpeg, HyperFrames 0.8.134 and the pinned Chrome's launch all hold.
- `render` writes one MP4 at `--output` that passed every check its profile names, and its JSON names the frame count, the SHA-256 and whether the cache hit.
- Two runs of the same project with the same flags give the same decoded frames.
- A project naming another origin where it loads is refused before anything renders, and a render reaches no other origin.
- No run reads a credential, and every write is one `tools/AGENTS.md` lists.
