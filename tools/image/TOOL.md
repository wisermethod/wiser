---
name: image
type: tool
category: media
description: Applies local edits to an existing image or composites an overlay over a base image, and writes the result as a PNG, JPEG, or WEBP
version: 0.1.0
---

# image

One tool for raster files that already exist: local pixel edits on one image, or an overlay composited over a base.

## Context

Use it whenever a raster image that already exists has to arrive somewhere in a different shape, or when two existing images have to become one file. A photograph cropped to a fixed frame, a screenshot resized to the dimensions a template expects, a PNG converted to WEBP or JPEG to cut its weight, a background dimmed or desaturated so text can sit on it, a scan turned upright, a cutout set at a measured place in a fixed frame, a prepared watermark, frame, border, badge, or texture stamped over a photograph. It costs nothing per run, needs no account, and answers in the time a file takes to read and write.

Do not use it to change what the picture shows. Removing an object or a background, restyling, extending a scene, and anything else that has to understand the content are generative work, and they belong to `skills/Media Generator/` and the generation connector behind it, which this release does not ship. Do not use it for a different kind of input either: vector artwork is rendered by `render` `svg`, an HTML page by `render` `html`, a Mermaid diagram by `render` `mermaid`, and a live page by `render` `url`, each of which sizes its input properly; an SVG handed to `edit` is refused rather than quietly flattened at whatever size it declares. A video is `video-edit`.

`edit` is one image on its own, including placement on an empty canvas at a position the caller computes. `compose` is two images, the overlay stretched over the base edge to edge. Reach for the matching subcommand instead of wrapping one job as the other.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the packages described in `tools/AGENTS.md` are installed it makes no network request.

## Quick Start

```bash
node scripts/image.js help
```

Usage text listing the two subcommands, with nothing installed. `node scripts/image.js edit help` (or `--help`) prints that subcommand's usage; the same form works for `compose`.

```bash
node scripts/image.js edit --file /path/to/a/work/directory/photo.png --output /path/to/a/work/directory/photo-card.jpg --crop 1200x1200 --resize 600x600
```

If this copy of the plugin has not yet authorised an install, the run reports that it would install the imaging library in this tool's directory, and stops. `--install` on that run is the answer (`tools/RUNNING.md`). It prints one JSON object:

```
{"output":"/path/to/a/work/directory/photo-card.jpg","format":"jpeg","width":600,"height":600,"sourceWidth":1800,"sourceHeight":1400,"bytes":48213}
```

`compose` stops the same way for the same library. Anything else, see Troubleshooting.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. `edit` writes one caller-named image outside this tool directory. `compose` writes one caller-named image, or writes back onto `--base` when `--output` is omitted and `--confirm` is passed. Every other write a run makes is a package install, and `tools/AGENTS.md` is the only place this repository lists those. Both subcommands check for and import `sharp`; `help` does not. The contract's `--env` clause has nothing to bind here, and the tool carries no Dependencies section because `sharp` installs by the consent-gated check and Node covers the rest. The sections below state what each command does; the contract states how the script behaves getting there.

No command takes `--env`.

## edit

One new image file, edited from one existing image file by local pixel operations, in the format its own extension names. The input is left exactly as it was.

Use it whenever one raster image has to change shape, format, or color. A run with no operations is a format conversion. Do not use it to composite two images; that is `compose`. Do not use it to place one picture over another picture; `--canvas` is one image on an empty transparent frame.

### Operations

Every operation is optional. They apply in this order whatever order the flags are typed in, because each one measures what the one before it left:

| Order | Operation | What it does |
|-------|-----------|--------------|
| 1 | `--rotate N` | Turns the image clockwise by 90, 180, or 270 degrees. A quarter turn swaps width and height, and everything below measures the turned image |
| 2 | `--crop WxH` | Takes a W by H region from the center. A crop larger than the image clamps to the image, because a crop cannot invent pixels |
| 3 | `--resize WxH` | Scales to exactly W by H. The aspect ratio is not preserved, so crop first when the shape has to change |
| 4 | `--grayscale` | Converts to a true single-channel gray, not a desaturated color image |
| 5 | `--blur N` | Gaussian blur of radius N, from 0.3 to 1000 |
| 6 | `--brightness N` | Multiplies brightness; 1 leaves it alone, below 1 darkens, above 1 lightens |
| 7 | `--contrast N` | Pivots each channel around mid-gray by a factor of N; 1 leaves it alone |
| 8 | `--sharpness N` | Sharpens by the amount N is above 1, up to 11. To soften instead, use `--blur` |
| 9 | `--canvas WxH` | Lays what every operation above produced onto a transparent canvas of W by H, with its top left corner at the offset `--at` names. The canvas is the finished frame, so this is what sets the result's dimensions |

The placement is last so that `--at` is measured against the image the operations above actually left, not against the one that came in. Two rules hold whatever the numbers say: the canvas comes out exactly the size asked for, and the image keeps exactly the size it had. Anything that lands outside the canvas, because `--at` is negative, because the image is larger than the canvas, or both, is clipped, and a run that clips says so on stderr while still writing the file. A placement that leaves no pixel at all on the canvas is refused instead of writing a blank one, because a fully transparent PNG is a wrong answer that looks like a finished file.

The output format is the extension on `--output`: `.png` writes PNG at maximum compression, `.jpg` and `.jpeg` write JPEG at quality 90, `.webp` writes WEBP at quality 90. JPEG has no transparency, so an image with an alpha channel arrives flattened, and `--canvas` therefore refuses a JPEG output rather than handing back a canvas whose transparent background has been filled in; PNG and WEBP both carry the alpha it needs.

### Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/image.js edit help` | Print usage and exit | No |
| `node scripts/image.js edit --file <path> --output <path> [operations]` | Apply the operations and write the result | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The image to read, an absolute path. Required by `edit` | None; required |
| `--output <path>` | The image to write: the path of the file itself, absolute, ending in `.png`, `.jpg`, `.jpeg`, or `.webp`, outside this tool's directory and different from `--file`. Folders on the way that do not exist are created | None; required |
| `--overwrite` | Replace a file already sitting at `--output` | Off; an occupied path is refused |
| `--rotate N` | Turn clockwise by 90, 180, or 270 | No turn |
| `--crop WxH` | Center crop to W by H | No crop |
| `--resize WxH` | Resize to exactly W by H | No resize |
| `--grayscale` | Convert to single-channel gray | Off |
| `--blur N` | Gaussian blur radius, 0.3 to 1000 | No blur |
| `--brightness N` | Brightness multiplier above 0 | `1` |
| `--contrast N` | Contrast multiplier above 0 | `1` |
| `--sharpness N` | Sharpen amount, 1 to 11 | `1` |
| `--canvas WxH` | Place the result on a transparent canvas of W by H. Needs an `--output` that carries alpha: `.png` or `.webp` | No canvas |
| `--at X,Y` | Where the image's top left corner sits on that canvas, in whole pixels, either number signed. Needs `--canvas` | `0,0` |
| `--help` | Print usage and exit | Off |

A size is written `WxH` and a position `X,Y`: the comma marks a coordinate, which can be negative, apart from a size, which cannot. One file per run, and no default output location: the caller decides where the result lands, per the work-directory rule in `standards/conventions.md`. Both paths are absolute, because a relative one resolves against whichever directory the caller happened to be in. An option this command does not know is refused rather than ignored, so a misspelled operation never returns a file that silently skipped it, and a flag written without its value is refused too rather than falling back to a default the caller never asked for.

Reads PNG, JPEG, WEBP, GIF, AVIF, and TIFF, and writes the four formats above.

Every path the caller names is screened against its real location, not its spelling. `--output` names the file to write, never a folder to drop a file into, and a folder already sitting at that path is refused rather than written into. What is never automatic is destruction: a file already at that path stops the run, which names the path and `--overwrite`, and only that flag replaces it. Editing in place is not offered at all: an `--output` equal to `--file` is refused whatever else is passed, and `--overwrite` does not change that.

### Output

One JSON object on stdout and one image on disk, exit 0.

| Field | Carries |
|-------|---------|
| `output` | The absolute path written |
| `format` | `png`, `jpeg`, or `webp`, whichever the extension named |
| `width`, `height` | The written file's pixel dimensions, as the library reports them |
| `sourceWidth`, `sourceHeight` | The input's dimensions before any operation |
| `bytes` | The written file's size |

A run that cannot produce the image leaves no image behind, prints nothing to stdout, and exits 1. On a `--canvas` run the written pair is the canvas, so it will not match the source even when no other operation ran; that is the placement, not a resize.

One thing reaches stderr on a run that succeeds: a `Note:` naming what a placement clipped, when it clipped anything. It is not an error, stdout still carries the one JSON object, and the exit code is still 0.

## compose

Two images written out as one: the overlay stretched to the base's pixel dimensions, laid over it, and encoded as PNG or JPEG.

Use it when both images already exist and the result is one file: a prepared watermark, frame, border, badge, or texture stamped over a photograph or a render; a transparent label plate dropped onto a generated image; one prepared treatment applied across a set of images, a run per image.

Do not use it to make the overlay. It draws no text, no shape, and no gradient of its own, so the artwork and its transparency arrive already made; a caller holding only the words for a watermark renders that artwork first, from vector source with `render` `svg` or from markup with `render` `html`, and composites the PNG here. Do not use it to place the overlay: it takes no position, no offset, no scale, no opacity, and no blend mode, because the overlay covers the base edge to edge every time. Do not use it on one image: resizing, cropping, converting a format, and adjusting color are `edit`.

### Composition

| Stage | What happens |
|-------|--------------|
| Sizing | The overlay is stretched to the base's exact width and height. Aspect ratio is not preserved, so an overlay of another shape distorts; a run where the two differed says so on stderr and reports `overlayResized` |
| Layering | The overlay goes over the base at full strength. What the base keeps is whatever the overlay's own transparency lets through, so an opaque overlay hides the base entirely |
| Encoding | The destination extension picks the format: `.png` writes PNG at maximum compression, `.jpg` and `.jpeg` write JPEG at quality 90. No other extension is accepted |
| Destination | `--output` when the caller names one; the base image itself when nobody does |

PNG output carries an alpha channel whenever either image did, and a pixel comes out transparent only where the base and the overlay both were. JPEG carries no transparency at all: any pixel still transparent after the composite encodes as opaque black, so a base with transparent regions belongs in a PNG unless that black is wanted.

Nothing on disk changes until the new image is fully encoded: an in-place run replaces the base only then, so a failure at any earlier point leaves the original as it was, and the destination's missing parent directories are made in that same last step, so a run that fails earlier leaves none of them behind.

### The Two Gates

A run can cost the caller a file two different ways, and the two are not the same act, so each carries its own opt-in flag.

| Flag | Permits | What it costs |
|------|---------|---------------|
| `--overwrite` | Replacing a file that already sits at a separate `--output` | That file. The base and the overlay are untouched, so the result can be made again |
| `--confirm` | An in-place run, which writes the composite back onto the base | The original base image, irrecoverably. Nothing is left to composite again, and the flattened result cannot be taken apart |

Without the flag it needs, a run is refused before the first image is opened and before any dependency is installed, naming the path at stake and the flag that would permit it. Nothing is read from the keyboard, and a refusal reads the same non-interactively as it does in front of a person.

A run is in place whenever the write lands on the input: omitting `--output` does that by definition, and so does an `--output` naming the base itself, which is matched by identity rather than by spelling, so a symlink or a differently cased path to the same file is caught too. In place needs `--confirm` alone; `--overwrite` is not part of it.

Neither flag stands in for the other. `--overwrite` on an in-place run is refused naming `--confirm`, and `--confirm` on a separate destination that already holds a file is refused naming `--overwrite`. A caller who has granted the cheap permission has not granted the expensive one.

### Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/image.js compose help` | Print usage and exit | No |
| `node scripts/image.js compose --base <path> --overlay <path> [--output <path>]` | Composite the two images and write the result | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--base <path>` | The image underneath, an absolute path. Its dimensions set the result's | None; required |
| `--overlay <path>` | The image on top, an absolute path. Its transparency is what shows the base | None; required |
| `--output <path>` | The file to write, an absolute path ending `.png`, `.jpg`, or `.jpeg`. Missing parent directories are created | None; the base image is written over in place |
| `--overwrite` | Permits replacing a file that already exists at `--output` | Off; the run is refused instead |
| `--confirm` | Permits an in-place run, which destroys the base image | Off; the run is refused instead |
| `--help` | Print usage and exit | Off |

One composite per run: a set of images means a run each, and a stack of overlays means a run per layer, feeding each result in as the next base.

Every path is absolute, because a relative one resolves against whatever directory the caller happened to be in. `--output` names a file, never a directory: there is no default filename and nothing is derived from the base's name. The destination may not resolve inside this tool's own directory; results belong in a work directory in the owning root, per `standards/conventions.md`. An argument this command does not know is refused rather than ignored, because a dropped destination flag would silently turn a run that named an output into an in-place one.

### Output

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

The stops every tool shares, an unknown flag, the install consent, an install that fails, and a path that is relative or inside this tool, are in `tools/RUNNING.md`; the rows below are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --file is required.` | `edit` ran with no image to read | Pass `--file <path>` |
| `Error: no file at <path>` | The input path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --file is an SVG` | Vector artwork was passed to `edit` | Render it with `render` `svg` first, then edit the PNG |
| `Error: could not read <path> as an image` | The file is not image data, or is a format the library does not read | Confirm the file opens as an image elsewhere; an extension is not evidence |
| `Error: --output must end in .png, .jpg, .jpeg, or .webp` | `edit` was named for a format it does not write | Rename the target, or convert with another tool after this one |
| `Error: --output must name a different file than --file` | An in-place `edit` was attempted | Write to a new path; keep the original until the result is checked. `--overwrite` does not apply here |
| `Error: a file already exists at <path>` | The output path is taken, and replacing a file is never the default | Pass `--overwrite` to replace it once you know what is there, or name a path that is free |
| `Error: --output names an existing directory` | A folder was passed where the file to write belongs | Name the file inside it, extension and all; this tool does not choose filenames |
| `Error: --crop must be two whole positive numbers as WxH` | A dimension pair was given as one number or carried units | Pass `1440x810`; a single number is not a size |
| `Error: --rotate must be one of 90, 180, 270` | An angle `edit` does not turn by | Use a quarter turn; arbitrary angles would need a background color this tool has no way to choose |
| `Error: --sharpness must be a number from 1 to 11` | A softening value, or an amount past what the library sharpens by | Sharpen above 1; soften with `--blur` |
| `Error: --canvas must be two whole positive numbers as WxH` | A canvas given as one number, with units, or with a zero side | Pass `1000x1000`; a canvas with no area is not a canvas |
| `Error: --at must be two whole numbers as X,Y` | An offset written as `WxH`, with a fraction, with units, or as one number | Pass `120,-40`. Sizes use `x` and positions use a comma, because a position can be negative |
| `Error: --at needs --canvas` | An offset with nothing to be an offset on | Add `--canvas WxH`, or drop `--at` |
| `Error: --canvas lays the image on a transparent background, and jpeg has no alpha channel` | A canvas run aimed at a `.jpg` or `.jpeg` output | Name a `.png` or `.webp` output. Converting afterwards is a second run, and it is where the background gets filled in on purpose |
| `Error: --at <x>,<y> starts the image past the right or bottom edge` | An x at or past the canvas width, or a y at or past its height | Nothing of any image could land there. Check the numbers against the canvas; this one is caught before the image is opened |
| `Error: --at <x>,<y> places a <W>x<H> image entirely outside a <W>x<H> canvas` | A negative offset larger than the image, so every pixel falls off the left or top | Check the offset's sign, and check the size the operations above left rather than the size of the file on disk |
| `Error: --base is required.` | `compose` ran with nothing to composite | Pass both `--base` and `--overlay` |
| `so this run needs --confirm` | The write lands on the base image: `--output` was omitted, or it names the base | Re-run with `--confirm` to accept losing the original, or pass `--output` with a path of its own |
| `so this run needs --overwrite` | A file already sits at the separate path `--output` names | Re-run with `--overwrite` to replace that file, or pass an `--output` path that does not exist yet |
| `this tool writes PNG and JPEG only` | The `compose` destination ends in something else, or the base does on an in-place run | Pass `--output` ending `.png`, `.jpg`, or `.jpeg` |
| `Error: --output names a file, and <path> is a directory` | A folder was passed to `compose` where the file to write belongs | Add the filename; this command derives no name from the base |
| `Error: unexpected argument` | A path passed to `compose` with no flag in front of it | Check `help`; every value is passed by name |
| `the destination resolves inside this tool directory` | The `compose` result was aimed at the shared root | Pass a work directory in the owning root |
| `Note: the placement clipped the image` | Expected: part of the image fell outside the canvas, and the canvas is never grown to fit | Nothing to fix if the frame is what was wanted. Otherwise enlarge `--canvas`, move `--at`, or `--resize` the image smaller first |
| The overlay looks squashed | It was stretched to the base's shape; `overlayResized` is true and stderr said so | Prepare the overlay at the base's dimensions, or at least at its aspect ratio |
| Transparent areas came out black | The destination was a `.jpg`, which cannot carry transparency | Write to `.png` instead |
| The image looks stretched after `--resize` | Expected: resize sets exact dimensions and does not preserve the aspect ratio | Crop to the target ratio first, then resize |

## Success

- `help` prints usage listing the two subcommands to stdout and exits 0 on a copy with no `node_modules/`. `edit help` and `edit --help` print that subcommand's usage; the same form works for `compose`.
- `edit` against a readable image exits 0 with one parseable JSON object on stdout carrying `output`, `format`, `width`, `height`, `sourceWidth`, `sourceHeight`, and `bytes`, and a file at `--output` whose format and pixel dimensions match the `format`, `width`, and `height` it reported.
- Operations compose in the documented order: a quarter turn swaps the frame, and a crop after it is centered on the turned image, not on the original.
- A crop larger than the image returns the image's own dimensions rather than failing, and the JSON says so.
- `--canvas WxH` returns a file of exactly W by H whose every pixel outside the placed image is fully transparent, alpha zero, not white and not black, and `--at X,Y` puts the image's top left pixel at exactly column X and row Y of it. Omitting `--at` places it at `0,0`.
- A placement that hangs off any edge writes the part that falls on the canvas, leaves the canvas at the size asked for, and names on stderr what it clipped, while stdout still carries the one JSON object and the exit code is still 0.
- A placement with no pixel on the canvas exits 1 and writes nothing. So does `--at` without `--canvas`, an offset that is not two whole numbers, and `--canvas` aimed at a JPEG output.
- `edit` onto a path a file already occupies exits 1 naming the path and `--overwrite`, leaves that file byte-identical, and installs nothing; the same run with `--overwrite` replaces it. `--overwrite` never makes an `--output` equal to `--file` succeed, and never writes into a folder.
- The `edit` input file is byte-identical after every run, successful or failed.
- `compose` over two readable images exits 0 with one parseable JSON object on stdout carrying `base`, `overlay`, `output`, `inPlace`, `format`, `width`, `height`, `overlayResized`, and `bytes`, and the file named by `output` exists at the base's dimensions.
- A separate `--output` that already holds a file is refused without `--overwrite`, naming that path and the flag, and the same run with `--overwrite` replaces it; the base and the overlay are byte-identical afterward either way.
- An in-place run, whether by omitting `--output` or by naming the base with it, is refused without `--confirm`, naming the base and the flag, before any image is opened and before any dependency is installed; the same run with `--confirm` replaces the base image and reports `inPlace` true.
- Neither flag stands in for the other: `--overwrite` alone on an in-place run and `--confirm` alone on an existing separate destination are both refused.
- An overlay of different dimensions is stretched to the base's, reported as `overlayResized`, and noted on stderr.
- A required flag omitted, a relative path, a path that does not exist, an unsupported extension, a directory passed as `--output`, an unknown option, and a destination inside this tool directory each exit 1 with the cause on stderr and stdout empty, and trigger no dependency install when the mistake is a usage one.
- An unknown option is refused by name before any install, read, or write.
- No run reads a credential, and after packages are installed no run opens a network connection. The install itself reaches `registry.npmjs.org`. The writes are what `tools/AGENTS.md` lists an install writing, and the image at the caller-named destination; where `compose` omits `--output` that destination is `--base` itself, which needs `--confirm`.
