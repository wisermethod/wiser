---
name: image-edit
type: tool
category: media
description: Applies local edits to an existing image, rotate, center crop, resize, grayscale, blur, brightness, contrast, sharpen, and placement on a transparent canvas at a given offset, and writes the result as a new PNG, JPEG, or WEBP
version: 0.2.0
---

# image-edit

One new image file, edited from one existing image file by local pixel operations, in the format its own extension names. The input is left exactly as it was.

## Context

Use it whenever a raster image that already exists has to arrive somewhere in a different shape: a photograph cropped to a fixed frame, a screenshot resized to the dimensions a template expects, a PNG converted to WEBP or JPEG to cut its weight, a background image dimmed or desaturated so text can sit on it, a scan turned upright, a cutout set at a measured place in a fixed frame so a set of them line up. It costs nothing per run, needs no account, and answers in the time a file takes to read and write, so it is the first thing to reach for before any paid service.

Do not use it to change what the picture shows. Removing an object or a background, restyling, extending a scene, and anything else that has to understand the content are generative work, and they belong to `skills/Media Generator/` and the generation connector behind it, which this release does not ship. Do not use it for a different kind of input either: vector artwork is rendered by `svg-to-png`, an HTML page by `html-to-png`, a Mermaid diagram by `mermaid-to-png`, and a live page by `web-screenshot`, each of which sizes its input properly; an SVG handed here is refused rather than quietly flattened at whatever size it declares. Compositing two images into one is `image-overlay`; what is here is one image on an empty canvas, at a position the caller computes, which is a placement rather than a blend.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install described in `tools/AGENTS.md` it makes no network request. It reads the one file the caller names and writes the one file the caller names.

## Operations

Every operation is optional, and a run with none is a format conversion. They apply in this order whatever order the flags are typed in, because each one measures what the one before it left:

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

## Quick Start

```bash
node scripts/edit.js help
```

Usage text, with nothing installed.

```bash
node scripts/edit.js edit --file /path/to/a/work/directory/photo.png --output /path/to/a/work/directory/photo-card.jpg --crop 1200x1200 --resize 600x600
```

The first real run reports that it would install the imaging library in this tool's directory, and stops. With `--install` it installs and does the work in the same run and prints one JSON object:

```
{"output":"/path/to/a/work/directory/photo-card.jpg","format":"jpeg","width":600,"height":600,"sourceWidth":1800,"sourceHeight":1400,"bytes":48213}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/edit.js help` | Print usage and exit | No |
| `node scripts/edit.js edit --file <path> --output <path> [operations]` | Apply the operations and write the result | Yes |

Options:

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

A size is written `WxH` and a position `X,Y`: the comma marks a coordinate, which can be negative, apart from a size, which cannot. One file per run, and no default output location: the caller decides where the result lands, per the work-directory rule in `standards/conventions.md`. Both paths are absolute, because a relative one resolves against whichever directory the caller happened to be in. An option this tool does not know is refused rather than ignored, so a misspelled operation never returns a file that silently skipped it, and a flag written without its value is refused too rather than falling back to a default the caller never asked for.

Reads PNG, JPEG, WEBP, GIF, AVIF, and TIFF, and writes the four formats above.

Every path the caller names is screened against its real location, not its spelling: both the path and what it is being compared to are resolved through their symbolic links, walking up to the deepest folder that exists and rejoining the parts that do not yet, so a link standing in for any folder on the way cannot hide where the write lands. A path whose real location cannot be established at all, because a folder on the way is unreadable or a link on it points at itself, is refused rather than compared as typed.

`--output` names the file to write, never a folder to drop a file into, and a folder already sitting at that path is refused rather than written into. Folders the file needs and does not have are created, so pointing a run at a fresh work directory costs no separate step. What is never automatic is destruction: a file already at that path stops the run, which names the path and `--overwrite`, and only that flag replaces it. The check runs before anything is installed and before the image is opened, so a refused run downloads nothing and reads nothing. Editing in place is not offered at all: an `--output` equal to `--file` is refused whatever else is passed, and `--overwrite` does not change that.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the first-run install, and the stdout and stderr rules. Argument checks that need nothing installed run before the install too, so a mistyped path or an out-of-range amount costs no download. No message repeats the imaging library's own text, which can quote bytes of the file it was reading. The sections above state what the command does; the contract states how the script behaves getting there.

The tool carries no Dependencies section because the imaging library arrives through the first-run install and Node covers the rest.

`node --test` runs the decisions a run makes before a pixel is touched against their own cases, with nothing installed: the rotation, cropping, resizing, and placement geometry and the output path's own rules live together in a module that reads no file and touches no pixels.

## Output

One JSON object on stdout and one image on disk, exit 0.

| Field | Carries |
|-------|---------|
| `output` | The absolute path written |
| `format` | `png`, `jpeg`, or `webp`, whichever the extension named |
| `width`, `height` | The written file's pixel dimensions, as the library reports them |
| `sourceWidth`, `sourceHeight` | The input's dimensions before any operation |
| `bytes` | The written file's size |

A run that cannot produce the image leaves no image behind, prints nothing to stdout, and exits 1. The two dimension pairs are what to read when a result surprises: they show what came in, what went out, and therefore which operation moved it. On a `--canvas` run the written pair is the canvas, so it will not match the source even when no other operation ran; that is the placement, not a resize.

One thing reaches stderr on a run that succeeds: a `Note:` naming what a placement clipped, when it clipped anything. It is not an error, stdout still carries the one JSON object, and the exit code is still 0. Read it as the answer to a question the JSON cannot hold, which is how much of the image survived the frame.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Error: --file is required.` | `edit` ran with no image to read | Pass `--file <path>` |
| `Error: --file must be absolute` or `--output must be absolute` | A relative path was passed | Pass the absolute path; do not rely on the working directory |
| `Error: no file at <path>` | The input path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --file is an SVG` | Vector artwork was passed to a raster editor | Render it with `svg-to-png` first, then edit the PNG |
| `Error: could not read <path> as an image` | The file is not image data, or is a format the library does not read | Confirm the file opens as an image elsewhere; an extension is not evidence |
| `Error: --output must end in .png, .jpg, .jpeg, or .webp` | The output was named for a format this tool does not write | Rename the target, or convert with another tool after this one |
| `Error: --output must name a different file than --file` | An in-place edit was attempted | Write to a new path; keep the original until the result is checked. `--overwrite` does not apply here |
| `Error: --output resolves inside this tool directory` | The output path landed in the shared root | Pass a work directory in the owning root |
| `Error: a file already exists at <path>` | The output path is taken, and replacing a file is never the default | Pass `--overwrite` to replace it once you know what is there, or name a path that is free |
| `Error: --output names an existing directory` | A folder was passed where the file to write belongs | Name the file inside it, extension and all; this tool does not choose filenames |
| `Error: could not create <path>` | The output's folders could not be made | Confirm the path is writable by this account; a file part way along the path blocks the folder that would sit there |
| `Error: --crop must be two whole positive numbers as WxH` | A dimension pair was given as one number or carried units | Pass `1440x810`; a single number is not a size |
| `Error: --rotate must be one of 90, 180, 270` | An angle this tool does not turn by | Use a quarter turn; arbitrary angles would need a background color this tool has no way to choose |
| `Error: --sharpness must be a number from 1 to 11` | A softening value, or an amount past what the library sharpens by | Sharpen above 1; soften with `--blur` |
| `Error: --canvas must be two whole positive numbers as WxH` | A canvas given as one number, with units, or with a zero side | Pass `1000x1000`; a canvas with no area is not a canvas |
| `Error: --at must be two whole numbers as X,Y` | An offset written as `WxH`, with a fraction, with units, or as one number | Pass `120,-40`. Sizes use `x` and positions use a comma, because a position can be negative |
| `Error: --at needs --canvas` | An offset with nothing to be an offset on | Add `--canvas WxH`, or drop `--at` |
| `Error: --canvas lays the image on a transparent background, and jpeg has no alpha channel` | A canvas run aimed at a `.jpg` or `.jpeg` output | Name a `.png` or `.webp` output. Converting afterwards is a second run, and it is where the background gets filled in on purpose |
| `Error: --at <x>,<y> starts the image past the right or bottom edge` | An x at or past the canvas width, or a y at or past its height | Nothing of any image could land there. Check the numbers against the canvas; this one is caught before the image is opened |
| `Error: --at <x>,<y> places a <W>x<H> image entirely outside a <W>x<H> canvas` | A negative offset larger than the image, so every pixel falls off the left or top | Check the offset's sign, and check the size the operations above left rather than the size of the file on disk |
| `Error: --output could not be resolved to a real path at <path>` | A folder on the way is unreadable by this account, or a symbolic link on it points at itself | Fix the permission or the link. A screen that cannot tell where a write lands refuses rather than trusting the path as typed |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: could not write <path>` | The folder is not writable, or the requested size is past what the library will allocate | Confirm the folder is writable by this account; lower the `--resize` dimensions |
| The result is smaller than the `--crop` asked for | The crop was larger than the image, so it clamped | Compare `width` and `height` in the JSON against what you asked for; crop within the source's dimensions |
| `Note: the placement clipped the image` | Expected: part of the image fell outside the canvas, and the canvas is never grown to fit | Nothing to fix if the frame is what was wanted. Otherwise enlarge `--canvas`, move `--at`, or `--resize` the image smaller first; the note names all three numbers |
| The placed image is not where the offset said | The operations above it changed the image's size, and `--at` is measured against what they left | Read `sourceWidth` and `sourceHeight` for what came in and compute the offset against the size after `--crop` and `--resize`, not before |
| The image looks stretched after `--resize` | Expected: resize sets exact dimensions and does not preserve the aspect ratio | Crop to the target ratio first, then resize |
| The JPEG lost its transparency | Expected: JPEG has no alpha channel | Write `.png` or `.webp` to keep transparency |
| A grayscale WEBP still reports three channels | Expected: WEBP has no single-channel mode | Every pixel is neutral gray all the same; PNG and JPEG keep the single channel |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `edit` against a readable image exits 0 with one parseable JSON object on stdout and a file at `--output` whose format and pixel dimensions match the `format`, `width`, and `height` it reported.
- Operations compose in the documented order: a quarter turn swaps the frame, and a crop after it is centered on the turned image, not on the original.
- A crop larger than the image returns the image's own dimensions rather than failing, and the JSON says so.
- `--canvas WxH` returns a file of exactly W by H whose every pixel outside the placed image is fully transparent, alpha zero, not white and not black, and `--at X,Y` puts the image's top left pixel at exactly column X and row Y of it. Omitting `--at` places it at `0,0`.
- A placement that hangs off any edge, from a negative `--at` or from an image larger than the canvas, writes the part that falls on the canvas, leaves the canvas at the size asked for, and names on stderr what it clipped, while stdout still carries the one JSON object and the exit code is still 0.
- A placement with no pixel on the canvas exits 1 and writes nothing. So does `--at` without `--canvas`, an offset that is not two whole numbers, and `--canvas` aimed at a JPEG output.
- `edit` pointed at an output whose folders do not exist creates them and writes the file. A run that refuses creates none of them, because every refusal is settled before the folder is made.
- `edit` with `--file` or `--output` omitted, with a relative path, with a path that does not exist, with an output whose extension names a format this tool does not write, with an output equal to the input, with an output that is an existing folder, with an output resolving inside this tool directory, with an out-of-range amount, with a flag written without its value, or with an unknown flag exits 1 with the cause on stderr and stdout empty, triggers no dependency install, and writes no file. Each of those refusals is one line: no stack trace, and none of the imaging library's own text.
- An output that reaches this tool directory through a symbolic link is refused exactly as the direct spelling is, and so is one that reaches the input file that way.
- `edit` onto a path a file already occupies exits 1 naming the path and `--overwrite`, leaves that file byte-identical, and installs nothing; the same run with `--overwrite` replaces it. `--overwrite` never makes an `--output` equal to `--file` succeed, and never writes into a folder.
- The input file is byte-identical after every run, successful or failed.
- No run reads a credential, reads stdin, or writes anything other than the caller's output and the folders that output needed; and after the first-run install no run opens a network connection. The install itself reaches `registry.npmjs.org` and writes what `tools/AGENTS.md` lists.
