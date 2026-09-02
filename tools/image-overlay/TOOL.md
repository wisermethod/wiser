---
name: image-overlay
type: tool
category: media
description: Composites an overlay image over a base image, stretched to the base's pixel dimensions, and writes the flattened result as a PNG or JPEG file
version: 0.1.1
---

# image-overlay

Two images written out as one: the overlay stretched to the base's pixel dimensions, laid over it, and encoded as PNG or JPEG.

## Context

Use it when both images already exist and the result is one file: a prepared watermark, frame, border, badge, or texture stamped over a photograph or a render; a transparent label plate dropped onto a generated image; one prepared treatment applied across a set of images, a run per image.

Do not use it to make the overlay. It draws no text, no shape, and no gradient of its own, so the artwork and its transparency arrive already made; a caller holding only the words for a watermark renders that artwork first, from vector source with `svg-to-png` or from markup with `html-to-png`, and composites the PNG here. Do not use it to place the overlay: it takes no position, no offset, no scale, no opacity, and no blend mode, because the overlay covers the base edge to edge every time. Do not use it on one image: resizing, cropping, converting a format, and adjusting color are single-image edits, and they belong to `image-edit`.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the two files the caller names and writes the one file the caller names.

## Composition

| Stage | What happens |
|-------|--------------|
| Sizing | The overlay is stretched to the base's exact width and height. Aspect ratio is not preserved, so an overlay of another shape distorts; a run where the two differed says so on stderr and reports `overlayResized` |
| Layering | The overlay goes over the base at full strength. What the base keeps is whatever the overlay's own transparency lets through, so an opaque overlay hides the base entirely |
| Encoding | The destination extension picks the format: `.png` writes PNG at maximum compression, `.jpg` and `.jpeg` write JPEG at quality 90. No other extension is accepted |
| Destination | `--output` when the caller names one; the base image itself when nobody does |

PNG output carries an alpha channel whenever either image did, and a pixel comes out transparent only where the base and the overlay both were. JPEG carries no transparency at all: any pixel still transparent after the composite encodes as opaque black, so a base with transparent regions belongs in a PNG unless that black is wanted.

Nothing on disk changes until the new image is fully encoded: an in-place run replaces the base only then, so a failure at any earlier point leaves the original as it was, and the destination's missing parent directories are made in that same last step, so a run that fails earlier leaves none of them behind.

## Quick Start

```bash
node scripts/overlay.js help
```

Usage text, with nothing installed.

```bash
node scripts/overlay.js compose \
  --base /path/to/a/work/directory/render.png \
  --overlay /path/to/a/work/directory/frame.png \
  --output /path/to/a/work/directory/framed.png
```

The first real run installs `sharp` in this tool's directory and asks for a re-run; the second does the work and prints one JSON object:

```
{"base":"...","overlay":"...","output":"...","inPlace":false,"format":"png","width":1600,"height":900,"overlayResized":false,"bytes":412903}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/overlay.js help` | Print usage and exit | No |
| `node scripts/overlay.js compose --base <path> --overlay <path> [--output <path>]` | Composite the two images and write the result | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--base <path>` | The image underneath, an absolute path. Its dimensions set the result's | None; required |
| `--overlay <path>` | The image on top, an absolute path. Its transparency is what shows the base | None; required |
| `--output <path>` | The file to write, an absolute path ending `.png`, `.jpg`, or `.jpeg`. Missing parent directories are created | None; the base image is written over in place |
| `--overwrite` | Permits replacing a file that already exists at `--output` | Off; the run is refused instead |
| `--confirm` | Permits an in-place run, which destroys the base image | Off; the run is refused instead |
| `--help` | Print usage and exit | Off |

One composite per run: a set of images means a run each, and a stack of overlays means a run per layer, feeding each result in as the next base.

Every path is absolute, because a relative one resolves against whatever directory the caller happened to be in. `--output` names a file, never a directory: there is no default filename and nothing is derived from the base's name. The destination may not resolve inside this tool's own directory; results belong in a work directory in the owning root, per `standards/conventions.md`. An argument this tool does not know is refused rather than ignored, because a dropped destination flag would silently turn a run that named an output into an in-place one.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## The Two Gates

A run can cost the caller a file two different ways, and the two are not the same act, so each carries its own opt-in flag.

| Flag | Permits | What it costs |
|------|---------|---------------|
| `--overwrite` | Replacing a file that already sits at a separate `--output` | That file. The base and the overlay are untouched, so the result can be made again |
| `--confirm` | An in-place run, which writes the composite back onto the base | The original base image, irrecoverably. Nothing is left to composite again, and the flattened result cannot be taken apart |

Without the flag it needs, a run is refused before the first image is opened and before any dependency is installed, naming the path at stake and the flag that would permit it. Nothing is read from the keyboard, and a refusal reads the same non-interactively as it does in front of a person.

A run is in place whenever the write lands on the input: omitting `--output` does that by definition, and so does an `--output` naming the base itself, which is matched by identity rather than by spelling, so a symlink or a differently cased path to the same file is caught too. In place needs `--confirm` alone; `--overwrite` is not part of it.

Neither flag stands in for the other. `--overwrite` on an in-place run is refused naming `--confirm`, and `--confirm` on a separate destination that already holds a file is refused naming `--overwrite`. A caller who has granted the cheap permission has not granted the expensive one.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run install, and the stdout and stderr rules. It carries no Dependencies section, because `sharp` ships its own imaging binaries through that first-run install and Node covers the rest; nothing here needs a runtime installed on the machine beforehand.

Beyond the contract, two behaviors are worth knowing.

Every message is the tool's own. The imaging library's text is never repeated, because it quotes paths and, on a file that will not decode, bytes of the input; a file that cannot be read is reported by naming which argument pointed at it.

The result is encoded in memory and then written in one step. That is what makes an in-place run possible at all: an imaging pipeline cannot stream a file onto its own input, and encoding first also means a failed run leaves the destination untouched.

## Output

One JSON object on stdout, exit 0, once the file is written.

| Field | Carries |
|-------|---------|
| `base`, `overlay` | The two paths that were read, as given |
| `output` | The path written, resolved, which equals `base` on an in-place run |
| `inPlace` | Whether the write landed on the base image itself |
| `format` | `png` or `jpeg`, as the destination extension selected |
| `width`, `height` | The result's pixel dimensions, which are the base's |
| `overlayResized` | Whether the overlay had to be stretched to reach them |
| `bytes` | Size of the file written |

A stretch also prints a note to stderr naming both dimensions; stdout stays one parseable object either way. A usage mistake, a run stopped at either gate, an image that will not decode, and a destination that cannot be written each print to stderr, leave stdout empty, and exit 1.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --base is required.` | `compose` ran with nothing to composite | Pass both `--base` and `--overlay` |
| `Error: --base must be absolute` | A relative path was passed | Pass the full path |
| `Error: no file at <path>` | One of the two images is not where the command said | Check the path; an absolute one cannot be misread |
| `so this run needs --confirm` | The write lands on the base image: `--output` was omitted, or it names the base | Re-run with `--confirm` to accept losing the original, or pass `--output` with a path of its own |
| `so this run needs --overwrite` | A file already sits at the separate path `--output` names | Re-run with `--overwrite` to replace that file, or pass an `--output` path that does not exist yet |
| `this tool writes PNG and JPEG only` | The destination ends in something else, or the base does on an in-place run | Pass `--output` ending `.png`, `.jpg`, or `.jpeg` |
| `Error: --output names a file, and <path> is a directory` | A folder was passed where the file to write belongs | Add the filename; this tool derives no name from the base |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: unexpected argument` | A path passed with no flag in front of it | Check `help`; every value is passed by name |
| `Error: could not create <path> for the result` | Part of the destination's parent path names an existing file, or the location is not writable | Point `--output` at a path whose parents are directories, in a work directory this account can write |
| `the destination resolves inside this tool directory` | The result was aimed at the shared root | Pass a work directory in the owning root |
| `Error: could not read <path> as an image` | The file is not an image, or is an encoding this build cannot decode | Confirm the file opens in a viewer; convert it first if it does not |
| `reports no pixel dimensions` | The base decoded, but its metadata carries no width or height, which a few container formats do not state | Convert the base to PNG or JPEG first, then composite onto that |
| The overlay looks squashed | It was stretched to the base's shape; `overlayResized` is true and stderr said so | Prepare the overlay at the base's dimensions, or at least at its aspect ratio |
| Transparent areas came out black | The destination was a `.jpg`, which cannot carry transparency | Write to `.png` instead |
| The overlay hid the whole base | The overlay has no transparency where the base should show | Use an overlay whose alpha channel is the pattern to be kept |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `compose` over two readable images exits 0 with one parseable JSON object on stdout, and the file named by `output` exists at the base's dimensions.
- A separate `--output` that already holds a file is refused without `--overwrite`, naming that path and the flag, and the same run with `--overwrite` replaces it; the base and the overlay are byte-identical afterward either way.
- An in-place run, whether by omitting `--output` or by naming the base with it, is refused without `--confirm`, naming the base and the flag, before any image is opened and before any dependency is installed; the same run with `--confirm` replaces the base image and reports `inPlace` true.
- Neither flag stands in for the other: `--overwrite` alone on an in-place run and `--confirm` alone on an existing separate destination are both refused.
- An `--output` whose parent directories do not exist writes the file and creates them, and a run that fails before the write creates none.
- A missing argument, a relative path, a missing file, an unsupported extension, a directory passed as `--output`, an unknown argument, and a destination inside this tool directory are each refused with the cause on stderr, stdout empty, exit 1.
- An overlay of different dimensions is stretched to the base's, reported as `overlayResized`, and noted on stderr.
- No run reads a credential, takes `--env`, reads from the keyboard, opens a network connection, or writes any file other than the destination and what `tools/AGENTS.md` lists a first run installing.
