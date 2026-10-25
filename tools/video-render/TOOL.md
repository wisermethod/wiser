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

One run turns one local page into video frames: a picture-only MP4 in one of two profiles, a numbered PNG sequence, or stills at named times. The same inputs give the same decoded frames on this machine, and a cache hit gives the same bytes.

## Context

Use it when an HTML animation has to become a video file frame for frame: an explainer for a feed, an email or a slide tool that cannot run scripts, or one scene of a narrated video. It renders through HyperFrames 0.8.134, which it pins, and it sets every switch that version has: no telemetry, no update check, no self-install, no agent skills, its pinned Chrome passed by path, and a home directory of its own for each run, removed at the end.

Not for a still of a page, which is `tools/render/`. Not for editing a recording that exists, which is `tools/video-edit/`. Not for sound: it writes picture only, and narration, music, loudness and joining are the caller's, `tools/video-edit/` among them. Not for a page that animates on the browser's own clock, since its frames would depend on how fast the machine draws: the page answers this tool's seek, under The project below. Not for generating imagery, which is `skills/Media Generator/`.

It authenticates to nothing and reads no credential. After its install, a render reaches no other origin: the screen in The project refuses one where the page would load it, and neither the browser it launches nor HyperFrames' own Node process reaches anything but this machine: the browser sends HTTP to a dead proxy, resolves no name but this machine's and sends no UDP off it, and HyperFrames' process has every outside connection and name lookup refused.

Classifier seam: none.

## The project

This section is the one home of what a page must be for this tool to render it.

- **One directory**, absolute, holding `index.html` and every file the page loads, as local files.
- **One root.** `index.html` has exactly one element carrying `data-video-root`, laid out at the frame's size in CSS pixels. The tool sets the renderer's own attributes on that element in its copy of the project; a page carries none of them.
- **The seek.** On every frame the tool dispatches, on `window`, a `CustomEvent` named `video-render:seek` whose `detail.time` is the frame's time in seconds: frame n shows time n / fps. The page's listener sets the frame for that time before it returns. Frames are drawn in any order and split across several browser processes, so a frame depends on its time alone, never on an earlier seek, the browser's clock, or `requestAnimationFrame` and timers, which do not advance between seeks.
- **Nothing animating at load or at capture.** A page that drives CSS transitions or animations from the seek sets them to the time and freezes them into its elements' styles before returning, as `skills/Animated Explainer/`'s two engines do on their render clock, and a page that seeks a library's own timeline seeks it to the time and writes styles, as GSAP does. A page leaves no CSS animation or Web Animation running or paused at load or when its listener returns: the renderer's own adapters re-time any they find by their own clock, so the frame would not be the page's, measured on HyperFrames 0.8.134. The browser runs with reduced motion forced off, so a page's motion rules always apply.
- **Nothing from another origin.** A value that loads may not name another origin, a scheme other than `data:` or `blob:`, or `//`: in `src`, `href`, `xlink:href`, `srcset`, `imagesrcset`, `poster`, `data`, `action`, `formaction`, `background` and `ping`; in any attribute or stylesheet's `url(...)`, `@import` and `image-set()`; in a refresh's URL; in an `iframe`'s `srcdoc`; and in the content of a `data:` URL holding CSS, HTML or SVG, to three levels. A refusal names the file, the attribute or rule, and the value. An XML namespace and a script's text are not screened; the browser itself reaches nothing but this machine.
- **A library is the page's own.** The tool installs no animation, 3D or font library for a page; a page that uses one carries its local copy and that library's own terms.
- **Fonts in a linked stylesheet.** Name a page's fonts in a stylesheet `index.html` links, or declare each with `@font-face` from the project's own files. For a font named in a `<style>` element or a `style` attribute with no `@font-face`, HyperFrames substitutes its own: a system font such as `system-ui` becomes Inter, and a family it knows takes the copy it ships. It would also ask Google Fonts for more faces; the tool refuses that request inside HyperFrames' process, as a machine with no network would, so the frames are the same online or off and the render log names the refusal. Measured on HyperFrames 0.8.134.

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
| `sequence --project <dir> --output <dir> --width N --height N --fps N --duration S` | A new directory holding `frames/frame_000001.png` onward, the first being frame 0, `frames/frames.sha256` (one SHA-256 of each frame's decoded RGBA pixels) and `render.log` |
| `render --project <dir> --output <file.mp4> --width N --height N --fps N --duration S [--profile publish\|intermediate] [--frame-hashes <file>] [--cache <dir>]` | The MP4, and only with `--frame-hashes` its decoded-frame hash list; with `--cache`, an entry in that directory |
| `frames --project <dir> --output <dir> --width N --height N --fps N --duration S --times T1,T2,... [--select at\|after]` | A new directory with one PNG per frame named and `frames.json` |

`sequence`, `render` and `frames` also take `--workers N|auto` (default `auto`), `--gpu hardware|software` (default `hardware`), `--capture screenshot|fast` (default `screenshot`) and `--install`. Each command answers `help` and `--help` before any dependency check, its help lists every flag, and an unknown flag is refused by name.

- **Frame count.** Every output holds exactly round(duration × fps) frames.
- **`frames`.** Frame n is drawn at exactly n / fps, and a time names the last frame drawn at or before it, floor(t × fps) in exact arithmetic, chosen by that same division so 4.1 s at 30 fps is frame 123; a time at or past the last frame's time names the last frame. With `--select after`, each time names the frame after that one, the first drawn past it, which is where a moment timed at that time first shows; a time with no frame past it within the duration is refused. At most 60 times, none twice. Its files are named by frame number from 0, `frame_000000.png` for frame 0; read each still's file from `frames.json`.

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
- the profile and its full encoder arguments, the browser's switches, and the SHA-256 of the script that carries the seek to the page;
- every project file's path and SHA-256.

The number of workers is not in the key, since the frames do not depend on it, for a page that draws each frame from its time alone (`## Same frames, and their scope`). A hit re-hashes the cached MP4 against its record before it is used. A mismatch, or a record that cannot be read, is a miss that replaces the entry, and the result says why. A change to one scene of a video therefore re-renders that scene alone.

## Same frames, and their scope

On one machine, with one GPU mode and one Chrome build, the same project gives the same decoded frames on every run, however the work is split across workers. Each worker opens the page fresh and starts at its own first frame, so this holds where the page draws every frame from its time alone, as both of Animated Explainer's engines do; a page whose own script carries state from one seek to the next draws differently by split. The browser rasterizes on the CPU and redraws every changed tile in full. Measured on Chrome 152 with a counted figure at 1,280×720: with neither, 119 of its 150 frames differed between one worker and two, and between one and four; with the CPU raster alone, the first frame a worker drew mid-count differed; with partial redraws off alone, nothing changed; with both, one, two, four and the default worker counts drew the same frames, as they did for both engines' measured pieces. The defaults are the modes the measured proofs ran: the hardware GPU for compositing and screenshot capture. Fast capture and the software GPU draw frames that differ from them, so a frame hash recorded in one mode holds only in that mode. Another machine is not promised the same bytes. A reference set made for comparing frames is made again whenever the machine, the mode or the Chrome changes.

## Output

Success is one JSON object on stdout and exit 0; failure is stderr only, stdout empty, exit 1. `check` exits 0 either way.

| Command | Fields |
|---------|--------|
| `check` | `node`, `ffmpeg`, `ffprobe`, `hyperframes`, `chrome` (`build`, `launches`, and on a failure `failure` and `remediation`), `ready` |
| `sequence` | `hyperframesVersion`, `chromeBuild`, `gpu`, `capture`, `frameCount`, `hashesPath`, `hashesSha256`, `logPath`, `lintFindings`, `seconds` |
| `render` | the above, `hashesPath` being the `--frame-hashes` file when that flag is set and null otherwise, `logPath` null since the sequence is temporary, plus `output`, `profile`, `bytes`, `sha256`, `checks`, `sequenceHashesSha256`, `cache` (`hit`, `miss` or `off`), `key`, and on a replaced entry the reason |
| `frames` | the above, `output`, `select`, and `frames`: for each requested time, `requestedTime`, `frame`, `time`, `file` and `sha256` |

`lintFindings` repeats what HyperFrames' own lint printed. A page whose motion is driven from the seek draws its `css_transition_used` warning, which is expected there: the transitions are set to the time on every frame. This tool never renders with HyperFrames' strict lint.

## Script Contract

`scripts/video-render.js` is the only entry point; the other modules are its implementation. It follows `system/templates/Script Contract.md`; the governing standard is `standards/script-contract.md`, and the user's running contract is `tools/RUNNING.md`. Help and flag refusals come before any dependency check. Paths are canonicalised, compared by device and inode, and refused inside this tool's directory, inside the project, under a `memory` directory, or where a name is `.env`, `.env.*`, `*.env` or `credentials.json`; a project holding such a file is refused before any of its files is read. Every write it makes is listed in `tools/AGENTS.md`.

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails and a relative path, are in `tools/RUNNING.md`. These are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Node … is too old; video-render requires Node >=22` | An older Node is first on `PATH` | Put Node 22 or later first on `PATH`, per Dependencies |
| `FFmpeg is missing or cannot run` | No `ffmpeg` on `PATH` | Make `ffmpeg -version` succeed, per Dependencies |
| `check` reports `ffprobe.present: false` | No `ffprobe` on `PATH`; `render` reads every MP4 back with it | Make `ffprobe -version` succeed, per Dependencies |
| `… is a protected memory, .env or credential path` | A path, or a file in the project, is under a `memory` directory or is named `.env`, `.env.*`, `*.env` or `credentials.json` | Move the file out of the project, or name another path; the tool reads none of them |
| `video-render: refused a connection to fonts.googleapis.com:443` in `render.log` | A font is named in a `<style>` element or a `style` attribute, so HyperFrames substituted its own and asked Google Fonts for more | Name the font in the linked stylesheet, or declare it with `@font-face` from a file in the project; the render itself is unaffected |
| `index.html has N data-video-root elements` | The page marks no root, or more than one | Mark exactly one element at the frame's size |
| `Project file … references …` | A loading attribute or rule names another origin | Copy that asset into the project and refer to it locally |
| `HyperFrames wrote N frames; expected …` | The render stopped early, or the page failed to load | Read `render.log` in the run's output for the page's error, fix it, and render to a new path |
| `MP4 check … failed` | The encoded file broke a profile's rule | The named check says which; render again to a new path, and report it if it repeats |
| `chrome-headless-shell … failed during launch` | The pinned Chrome cannot start | Read `remediation` in `check`'s JSON and take that one step; a launch failure that is not a missing file never earns a fresh download |

## Success

- `help` prints usage, exits 0, and installs nothing on a copy with no `node_modules/`.
- `check` exits 0 with one JSON object whose `ready` is true only when Node, FFmpeg, ffprobe, HyperFrames 0.8.134 and the pinned Chrome's launch all hold.
- `render` writes one MP4 at `--output` that passed every check its profile names, and its JSON names the frame count, the SHA-256 and whether the cache hit.
- Two runs of the same project with the same flags give the same decoded frames.
- A project naming another origin where it loads is refused before anything renders, and a render reaches no other origin.
- No run reads a credential, and every write is one `tools/AGENTS.md` lists.
