---
name: html-to-png
type: tool
category: media
description: Renders one local HTML file to a PNG or JPEG image at a path the caller names, sized to a given viewport width, either a fixed height or the content's own, and a chosen device scale factor
version: 0.2.0
---

# html-to-png

One image file, written where the caller said, holding what a browser engine draws from one local HTML file.

## Context

Use it when HTML is already the artwork and an image is what has to ship: a social card, an email header, a chart or table laid out in markup, a certificate or badge built from a template, a title slide, a screenshot-shaped figure for a document. Anything a caller can express in HTML and CSS, it can hand over as a PNG or a JPEG.

Do not use it to capture a live website; that is `web-screenshot`, which takes an address and this one takes a file. Do not use it to convert an SVG (`svg-to-png`) or a Mermaid diagram (`mermaid-to-png`); each is its own tool, and wrapping either in HTML to come through here loses the sizing those tools do. Do not use it to change an image that already exists, which is `image-edit` and `image-overlay`, and do not reach for it to produce imagery from a description, which is the `Media Generator` skill's generation, not rendering.

Writing the HTML is the caller's job. This tool renders what it is handed, at the size it is told, and reports what it wrote.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install it opens no network connection of its own. The page is loaded from disk: whatever that page references is fetched, and nothing else is. The install itself reaches `registry.npmjs.org` and `cdn.playwright.dev`, per `tools/AGENTS.md`.

## Quick Start

```bash
node scripts/render.js help
```

Usage text, with nothing installed.

```bash
node scripts/render.js render \
  --input /path/to/a/work/directory/card.html \
  --output /path/to/a/work/directory/card.png \
  --width 1200 --height 630
```

The first real run reports that it would install Playwright into `tools/lib/browser-runtime/`, and stops. With `--install` it installs and does the work in the same run and prints one JSON object:

```
{"output":"/path/to/a/work/directory/card.png","format":"png","width":1200,"height":630,"scale":1}
```

Anything else, see Troubleshooting.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| The Chromium build Playwright drives | `render` | `npm run check:chromium` exits 0 with `"chromiumLaunch":true` |

The Playwright package and the Chromium build it drives both install on the run that authorises them with `--install`, into `tools/lib/browser-runtime/` and Playwright's cache. Presence is a **trial launch** via the shared browser runtime at `tools/lib/browser-runtime/`, not a path on disk. Missing OS libraries are self-healed in userspace where a C compiler is present; otherwise the check names the library and the one next step. Install steps are never written here. `tools/AGENTS.md` lists every write.

## Sizing

`--width` sets the viewport the page lays out in, so it is the width the CSS sees, not a resize applied afterwards. A media query written for 640 pixels fires at `--width 640` and not at `--width 1200`. Height works one of two ways.

| `--height` | What the image is | Use it for |
|------------|-------------------|------------|
| Given | The viewport exactly, at `--width` by `--height` CSS pixels, whatever the content does inside it | A target the platform fixes: a card, a thumbnail, a slide |
| Omitted | The body's own box, with the viewport grown to hold all of it | Content whose length is not known in advance: a table, an invoice, a long article |

Omitted is the default, and what it measures is the body element's own box. Height follows the content however far it runs, so a page four screens long comes out as one tall image. Width follows the body, which by default is exactly as wide as the viewport, so the image comes out at `--width`; a body whose own CSS makes it wider widens the image to match. What fit mode does not do is chase content that spills sideways out of a default-width body: that is cropped at `--width` like anything else outside the viewport. Content wider than the viewport needs `--width` raised to hold it, or a body sized to hold it.

Content taller than a given `--height` is cropped at the fold, which is the point of asking for a fixed size. Either way the reported `width` and `height` are read back out of the written file's own header rather than calculated, which is the pair worth reading.

`--scale` is the third size control and the one that does not touch the layout. It is the device scale factor: the number of image pixels the page draws per CSS pixel, defaulting to 1. At `--scale 2` a 1200 by 630 card lays out at exactly the same 1200 by 630 CSS pixels, every media query fires where it did before, and the file comes out 2400 by 1260, which is what a retina display or a print at twice the size wants. Fractions are allowed. Because the reported dimensions come from the file, they carry the scale: divide by `scale` for the CSS size the page laid out at.

The extension on `--output` chooses the format. `.png` keeps transparency; `.jpg` and `.jpeg` do not, and take `--quality` from 1 to 100, defaulting to 90. `--quality` is ignored for a PNG rather than refused.

## What The Page Can Reach

The file is loaded through a `file://` address, so a relative `src` or `href` in the HTML resolves against the HTML file's own directory. An image sitting beside the HTML needs no absolute path.

Loading waits for the network to go quiet, not for every reference to arrive, and the two ways a reference can fail part there. One fails fast: a local file that is not there, or a connection that is refused. That goes quiet almost at once, so the load completes, the run exits 0, and the page is drawn without it; a stylesheet or picture that never arrived comes back as a half-drawn image rather than an error. The other hangs instead of answering, and that is the case that spends the page's load budget and then fails the run, writing nothing. That budget is five seconds unless `--timeout` names another number of milliseconds, which is the flag for a page whose assets are genuinely slow rather than genuinely unresponsive. Confirm the references resolve before rendering, because this tool renders whatever loads. A page that must render identically on a machine with no network, or years from now, inlines its assets or keeps them beside the HTML.

Nothing else is reached. The tool contacts no address the page did not name.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/render.js help` | Print usage and exit | No |
| `node scripts/render.js render --input <path> --output <path>` | Render the HTML and write the image | Yes, at `--output` |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--input <path>` | HTML file to render, absolute. Required | None; required |
| `--output <path>` | Image file to write, absolute, ending `.png`, `.jpg`, or `.jpeg`. Required | None; required |
| `--width N` | Viewport width in pixels | 1200 |
| `--height N` | Viewport height in pixels; omit to fit the content | None; fit the content |
| `--scale N` | Device scale factor: image pixels per CSS pixel | 1 |
| `--quality N` | JPEG quality, 1 to 100 | 90 |
| `--timeout MS` | Milliseconds the page gets to finish loading | 5000 |
| `--overwrite` | Replace a file already at `--output` | Off; a run that would replace one refuses |
| `--help` | Print usage and exit | Off |

One file per run. `--output` is the path of the image file itself, never a directory to put one in. Both paths are absolute because a relative one resolves against whichever directory the caller happened to be in. This tool never picks an output location and never falls back to one: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the file inside it.

Missing parent directories on that path are created. A file already at `--output` is not: the run refuses, naming the path and `--overwrite`, and refuses before anything is installed and before a browser opens, so nothing about the existing file is touched. `--overwrite` replaces it.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. The one thing it can destroy is a file the caller already had at `--output`, which `--overwrite` gates, so no command takes `--confirm`.

## Script Contract

The one script this tool ships follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the consent-gated dependency install, the system-dependency check on the one command that needs it, and the stdout and stderr rules. The sections above state what the command does; the contract states how the script behaves getting there.

Every usage mistake is caught before the dependency check runs, so a bad path, a bad number, or an occupied `--output` never triggers an install and never opens a browser. No message repeats the browser engine's own text, which quotes the page, the full path, and whatever the page wrote to its console; a run that fails names what to look at instead. Nothing is read from stdin, so a run with nobody watching fails loudly rather than waiting.

## Output

One JSON object on stdout, exit 0, once the image is written.

| Field | Carries |
|-------|---------|
| `output` | The absolute path written |
| `format` | `png` or `jpeg`, from the output extension |
| `width` | The image's width in pixels |
| `height` | The image's height in pixels |
| `scale` | The device scale factor the image was drawn at |

`width` and `height` are read out of the written file's own header, so they are what the image holds rather than what the arithmetic predicted, and a caller sizing a layout around them is never told a number the file does not have. They are therefore in image pixels, not CSS pixels: at `--scale 2` they are twice what the page laid out at, and dividing by `scale` gives the layout back.

Fitting rather than fixing a height, they are what the content measured, which is the pair worth reading: a card that came out 1200 by 4400 is a stylesheet problem, not a render problem.

Failure prints to stderr, leaves stdout empty, and exits 1.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `Chromium cannot launch` / `chromiumLaunch:false` | Binary missing, launch blocked, or OS library gap | Follow the `remediation` line from `npm run check:chromium`; never a root-only install-deps recipe |
| `Error: --input is required` | `render` ran with nothing to render | Pass `--input <path>` |
| `Error: --input must be absolute` | A relative path resolves against the caller's directory | Pass the resolved absolute path |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --output is required` | No destination was named | Resolve a work directory in the owning root and name the file; this tool picks no location |
| `Error: --output resolves inside this tool directory` | The path landed in the shared root | Pass a work directory in the owning root |
| `Error: --output must end .png, .jpg, or .jpeg` | An extension the format table does not carry | Rename the output; the extension is what chooses the format |
| `Error: a file already exists at <path>` | The destination is taken, and replacing it is opt-in | Name a free path, or pass `--overwrite` to replace that one |
| `Error: <path> is a directory` | `--output` names a folder rather than the image file | Name the file inside it; `--output` is always a file path |
| `Error: --width must be a whole number of 1 or more` | A non-numeric, zero, or negative size | Pass a positive whole number of pixels |
| `Error: --scale must be a number above zero` | A non-numeric, zero, or negative scale factor | Pass a positive number; 1 is the page's own size, 2 is retina |
| `Error: --quality must be 100 or less` | A JPEG quality outside 1 to 100 | Pass a value in range, or omit it for 90 |
| `Error: could not create the directory for <path>` | A parent directory cannot be made, usually permissions | Pass a work directory in the owning root this process may write to |
| `Error: the page did not finish loading within <N> ms` | A reference hangs instead of answering: a remote font, stylesheet, or image that is slow or never responds | Inline the remote references or keep them beside the HTML, or raise `--timeout` if the asset is slow rather than unresponsive |
| `Error: the render finished but <path> could not be measured` | The written file carries no readable image header | Re-run; a repeat means the page produced nothing drawable |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: the page rendered nothing with a size to capture` | The body is empty or collapsed to zero height, often CSS on a body with only absolutely positioned children | Give the body visible content and a height, or pass `--height` to shoot a fixed viewport |
| `Error: the browser engine could not render <path>` | The page failed in a way this tool cannot name | Open that file in a browser; whatever it does there is what happened here |
| The image is taller than expected | Fit mode measured the body, and something in it is longer than it looks | Read `height` in the output, then pass `--height` for a fixed frame or fix the layout |
| The right edge is cut off | Content is wider than the viewport, and fit mode measures the body, not what overflows it | Raise `--width` to the content's width, or give the body a CSS width that holds it |
| The image is missing a picture or a stylesheet | A reference failed fast, so the load went quiet and the page drew without it; a fast failure never fails the run | Confirm every reference resolves before rendering, since this tool renders whatever loads |
| Fonts look wrong | A webfont was not reachable, so the page fell back | Keep the font file beside the HTML and reference it relatively, or accept the fallback deliberately |
| Transparency is lost | The output is a JPEG, which has no alpha channel | Write `.png` instead |
| The image is twice the size it should be | `--scale` multiplies the pixels without touching the layout | Read `scale` in the output; divide the dimensions by it for the CSS size, or pass `--scale 1` |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `render` against an HTML file exits 0 with one parseable JSON object on stdout, and an image exists at the path in `output`.
- `--input` or `--output` omitted, relative, non-existent, or carrying an extension the format table does not have exits 1 with the cause on stderr and stdout empty, before any dependency install and before a browser opens.
- An `--output` resolving inside this tool directory is refused rather than written.
- An `--output` that already exists is refused, naming the path and `--overwrite`, before any install and before a browser opens, and the existing file is byte-identical afterwards; the same run with `--overwrite` replaces it.
- An `--output` whose parent directories do not exist yet has them created, and the image lands there.
- `--width 1200 --height 630` produces an image of exactly those pixel dimensions; the same page with `--height` omitted produces one whose reported height is the body's own.
- The reported `width` and `height` equal the dimensions in the written file's own header, at more than one `--width` and at `--scale 1` and `--scale 2`; the same page at `--scale 2` writes exactly twice the pixels of `--scale 1` in each direction, and no width is capped at an intrinsic default.
- `--timeout` omitted gives the page five seconds; a lower `--timeout` fails sooner and a higher one waits longer, each naming its own budget.
- A page referencing only files beside it renders with no network connection open; a page referencing a remote asset reaches that address and no other.
- No failure message repeats the browser engine's own text, and no run writes any file other than the image at `--output` and what `tools/AGENTS.md` lists a first run installing, the parent directories that image needed, and what `tools/AGENTS.md` lists a first run installing.
