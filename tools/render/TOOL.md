---
name: render
type: tool
category: media
description: Renders a local HTML file to a PNG or JPEG, an SVG or a Mermaid diagram to a PNG, and captures a PNG of a live web page
version: 0.2.0
---

# render

One tool for turning markup, a diagram, or a live page into an image file: a local HTML file to PNG or JPEG, an SVG to PNG, a Mermaid diagram to PNG, or a PNG of a live web page.

## Context

Use it whenever the answer has to be pixels rather than the source that produced them: a social card or certificate laid out in HTML, a logo or diagram that exists as SVG, a flowchart written as Mermaid, a live page a reviewer cannot open themselves. Reach for the matching subcommand instead of wrapping one input as another, which is where sizing and what the file can reach go wrong.

Do not use it to change an image that already exists, which is `image` `edit` and `image` `compose`, and do not reach for it to produce imagery from a description, which is generation, not rendering. A spreadsheet, a PDF, and a raster that is already an image are not among the inputs it reads.

`html`, `svg`, and `mermaid` authenticate to nothing, hold no credential, and after the packages described in `tools/AGENTS.md` are installed make no network request of their own; the page, SVG, or diagram may still fetch whatever it references. `url` reaches the one address `--url` names, logged out and unauthenticated, and every other request in that run is one the page itself issues. `check` surveys whether the Chromium build is present and, without `--install`, fetches nothing.

## Quick Start

```bash
node scripts/render.js help
```

Usage text listing the five subcommands, with nothing installed. `node scripts/render.js html help` (or `--help`) prints that subcommand's usage; the same form works for `svg`, `mermaid`, `url`, and `check`.

```bash
node scripts/render.js html --input /path/to/a/work/directory/card.html --output /path/to/a/work/directory/card.png --width 1200 --height 630
```

If this copy of the plugin has not yet authorised an install, the run reports that it would install Playwright into `tools/lib/browser-runtime/`, and stops. `--install` on that run is the answer (`tools/RUNNING.md`). It prints one JSON object:

```
{"output":"/path/to/a/work/directory/card.png","format":"png","width":1200,"height":630,"scale":1}
```

`svg` and `mermaid` stop the same way for Playwright; `mermaid` also names `mermaid` in this tool's directory. `url` stops the same way for Playwright. `check` without `--install` surveys and prints JSON with exit 0 either way. Anything else, see Troubleshooting.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. `html`, `svg`, `mermaid`, and `url` write one caller-named image outside this tool directory. `check` writes nothing without `--install`; with it, the install's own writes and no more. Every other write a run makes is a package install, and `tools/AGENTS.md` is the only place this repository lists those. Only `mermaid` checks for and installs `mermaid`. The contract's `--env` clause has nothing to bind here.

No command takes `--env`.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| The Chromium build Playwright drives | `html`, `svg`, `mermaid`, `url` | `node scripts/render.js check` exits 0 with `"chromiumLaunch":true` |
| `mermaid` | `mermaid` | `node_modules/mermaid/package.json` inside this tool directory |

Playwright and its Chromium build install once, into `tools/lib/browser-runtime/` and Playwright's cache (`tools/AGENTS.md`). Presence is a **trial launch** via the shared runtime at `tools/lib/browser-runtime/`, not a path on disk. A missing OS library is shimmed where a compiler is present, or named with one next step (`tools/AGENTS.md`). The `mermaid` package installs into this tool's directory, and only `mermaid` asks for it. Install steps are never written here. `tools/AGENTS.md` lists every write.

## html

One image file, written where the caller said, holding what a browser engine draws from one local HTML file.

Use it when HTML is already the artwork and an image is what has to ship: a social card, an email header, a chart or table laid out in markup, a certificate or badge built from a template. Do not use it to capture a live website (`url`), convert an SVG (`svg`), or render a Mermaid diagram (`mermaid`). Writing the HTML is the caller's job.

`--width` sets the viewport the page lays out in. Height works one of two ways: given, the image is the viewport exactly; omitted, the image is the body's own box, with the viewport grown to hold all of it. `--scale` is the device scale factor and does not touch the layout. The extension on `--output` chooses the format. `.png` keeps transparency; `.jpg` and `.jpeg` do not, and take `--quality` from 1 to 100, defaulting to 90.

The file is loaded through a `file://` address, so a relative `src` or `href` resolves against the HTML file's own directory. Loading waits for the network to go quiet. A reference that fails fast is drawn without; a reference that hangs spends the page's load budget and fails the run.

### Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/render.js html help` | Print usage and exit | No |
| `node scripts/render.js html --input <path> --output <path>` | Render the HTML and write the image | Yes, at `--output` |

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

### Output

One JSON object on stdout, exit 0, once the image is written.

| Field | Carries |
|-------|---------|
| `output` | The absolute path written |
| `format` | `png` or `jpeg`, from the output extension |
| `width` | The image's width in pixels, read from the file header |
| `height` | The image's height in pixels, read from the file header |
| `scale` | The device scale factor the image was drawn at |

## svg

One PNG written from one SVG, at the dimensions the SVG declares for itself multiplied by a scale factor, or at an exact pixel width the caller names.

Use it whenever vector artwork has to arrive as pixels. Do not use it for HTML (`html`), Mermaid (`mermaid`), or a live URL (`url`). An SVG that references a remote font or image causes the browser to fetch exactly those addresses; an SVG that references nothing outside itself puts no traffic on the network.

Output pixels come from the SVG's own dimensions. `sizedFrom` reports which of three answered: the root tag's `width` and `height` (`attributes`), its `viewBox`, or an 800 by 600 fallback (`default`). `--scale` defaults to 2. `--width` overrides it: the scale becomes whatever puts the SVG at that exact width, and the height follows. A copy handed to the browser gets a `viewBox` built from the measured dimensions when the root tag carries none; the file on disk is never touched.

### Usage

| Command | Purpose | Needs a browser |
|---------|---------|-----------------|
| `node scripts/render.js svg help` | Print usage and exit | No |
| `node scripts/render.js svg --file <path> --output <path>` | Render the SVG and write the PNG | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The SVG to render, an absolute path. Required | None; required |
| `--output <path>` | The PNG to write, absolute, ending in `.png`, outside this tool directory | None; required |
| `--scale N` | Multiply the SVG's own dimensions by N | `2` |
| `--width N` | Render at exactly N pixels wide, height following the ratio. Overrides `--scale` | None; `--scale` decides |
| `--timeout N` | Milliseconds the page may take to load whatever the SVG references | `30000` |
| `--overwrite` | Replace an existing file at `--output` | Off; an existing file is refused |
| `--help` | Print usage and exit | Off |

### Output

One JSON object on stdout and one PNG on disk, exit 0.

| Field | Carries |
|-------|---------|
| `output` | The absolute path written |
| `width`, `height` | The PNG's pixel dimensions |
| `scale` | The factor actually applied, which is the derived one when `--width` was given |
| `sizedFrom` | `attributes`, `viewBox`, or `default` |

## mermaid

One PNG of the diagram a Mermaid file describes, written where the caller says.

Use it whenever a Mermaid diagram has to become an image. Mermaid inside a fenced block in a markdown file is not an input: extract the diagram to its own file first. An SVG goes to `svg`, HTML to `html`, a live page to `url`.

A diagram is drawn at the size the renderer computes, then capped. Natural width above `--width` scales the whole drawing down; natural width below it leaves the drawing alone. `--scale` multiplies device pixels last and does not reflow text. The renderer loads from this tool's own `node_modules`, so a render of a diagram fetches nothing; an HTML page or an SVG may still load what it references. The diagram reaches the page as text through the DOM, so a diagram file cannot close an element or open a script of its own.

### Usage

| Command | Purpose | Launches a browser |
|---------|---------|--------------------|
| `node scripts/render.js mermaid help` | Print usage and exit | No |
| `node scripts/render.js mermaid --file <path> --output <path>` | Render the diagram and write the PNG | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The Mermaid diagram to render, an absolute path | None; required |
| `--output <path>` | Where to write the PNG, an absolute path ending in `.png` | None; required |
| `--width N` | Maximum diagram width in CSS pixels, before `--scale` | 800 |
| `--scale N` | Device scale factor: image pixels per CSS pixel | 2 |
| `--theme NAME` | `default`, `neutral`, `dark`, or `forest` | `neutral` |
| `--background C` | Background color, as a color word or a hex value, or `transparent` | `white` |
| `--timeout MS` | How long the diagram has to render before the run gives up | 10000 |
| `--overwrite` | Replace a file already at `--output` | Off; an occupied path is refused |
| `--help` | Print usage and exit | Off |

### Output

One JSON object on stdout, exit 0, when the PNG was written.

| Field | Carries |
|-------|---------|
| `path` | The absolute path of the PNG, as written |
| `width`, `height` | The PNG's pixel dimensions, read from the file |
| `scale` | The device scale factor applied |
| `maxWidth` | The `--width` cap the layout was given |
| `theme` | The theme rendered |
| `background` | The background rendered |

## url

One PNG of a web page as a browser renders it, plus a JSON record of the address that was actually reached, the status it returned, and the pixel dimensions written.

Use it when the page is live and the picture has to be of the real thing. A local HTML file is `html`, a Mermaid diagram `mermaid`, an SVG `svg`. It captures the page a stranger sees: no credential, no cookie, a fresh browser every run. A `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before the browser is launched, the same screen `sitemap` `fetch` applies.

`--width` and `--height` are the browser window the page lays itself out in; `--scale` multiplies the pixels written without changing that layout. `--timeout` is the budget for waiting for network silence, in milliseconds, minimum 1000. `--full-page` captures the whole scrollable page instead of the viewport.

### Usage

| Command | Purpose | Reaches the network |
|---------|---------|---------------------|
| `node scripts/render.js url help` | Print usage and exit | No |
| `node scripts/render.js url --url <address> --output <path>.png` | Load the page and write a PNG of it | Yes |

| Option | Effect | Default |
|--------|--------|---------|
| `--url <address>` | The page to capture, `http` or `https`. Required | None; required |
| `--output <path>` | Absolute path of the `.png` file to write | None; required |
| `--width <n>` | Viewport width in whole pixels | 1280 |
| `--height <n>` | Viewport height in whole pixels | 720 |
| `--scale <n>` | Device scale factor | 1 |
| `--timeout <n>` | Whole milliseconds to wait for network silence. Minimum 1000 | 30000 |
| `--full-page` | Capture the whole scrollable page instead of the viewport | Off; viewport only |
| `--overwrite` | Replace the file already at `--output` | Off; an existing file is refused |
| `--help` | Print usage and exit | Off |

### Output

One JSON object on stdout, exit 0, when an image was written.

| Field | Carries |
|-------|---------|
| `output` | Absolute path of the PNG written |
| `url` | The address navigated to, normalized |
| `finalUrl` | Where the browser ended up after redirects |
| `status` | HTTP status of the page's own response, `null` when none |
| `width`, `height` | Pixel dimensions of the PNG, read from the file header |
| `scale` | The device scale factor the image was written at |
| `fullPage` | Whether the whole document was captured or only the viewport |

## check

One JSON object surveying whether the packages and the Chromium build this tool renders with are present. Exit 0 either way; read `chromiumLaunch` for the verdict.

Without `--install` it fetches nothing and opens no connection. With `--install` it installs first and then reports on what it installed. It is this tool's own survey, and the troubleshooting row for a missing binary points at it.

### Usage

| Command | Purpose | Reaches the network |
|---------|---------|---------------------|
| `node scripts/render.js check help` | Print usage and exit | No |
| `node scripts/render.js check` | Report whether the Chromium build is present | Only with `--install` |

### Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `packages` | Whether Playwright's own manifest is present in the shared runtime |
| `chromiumLaunch` | Whether a trial launch of the Chromium build succeeded |
| `remediation` | The one next step when the trial launch did not succeed |
| `playwright`, `chromiumBinary` | Whether the package and the build's binary are present, the two facts behind `chromiumLaunch` |
| `failure` | Which of `artifact`, `host`, `permission` or `unknown` the trial launch's failure was; `null` when it launched |
| `launchPhase`, `unrunnablePath` | Where a failed launch stopped, and the binary a permission failure names for the `chmod +x` in `remediation`; `null` when they do not apply |
| `proxy`, `hostClass`, `missingLibs`, `shimmed` | Whether a proxy was in use, the host class the runtime detected, and the OS libraries found missing and shimmed, empty lists on macOS |

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails, and a path that is relative or inside this tool, are in `tools/RUNNING.md`; the rows below are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Chromium cannot launch` / `chromiumLaunch:false` | Binary missing, launch blocked, or OS library gap | Read `remediation` on the `check` JSON; follow that single step. Never a root-only install-deps recipe |
| `Error: --input is required` | `html` ran with nothing to render | Pass `--input <path>` |
| `Error: --file is required` | `svg` or `mermaid` ran with no source file | Pass `--file <path>` |
| `Error: --url is required` | `url` ran with no address | Pass `--url` with the full address, scheme included |
| `Error: --output is required` | No destination was named | Name the absolute path; this tool picks no location |
| `Error: --input must be absolute` / `--file must be absolute` / `--output must be absolute` | A relative path was passed | Pass the resolved absolute path |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --output must end .png, .jpg, or .jpeg` | `html` was named for a format it does not write | Rename the output; the extension is what chooses the format |
| `Error: --output must end in .png` | `svg`, `mermaid`, or `url` was named for a format it does not write | Name the file `.png` |
| `Error: a file already exists at <path>` / `<path> already exists` / `--output already exists` | The destination is taken, and replacing it is opt-in | Name a free path, or pass `--overwrite` to replace that one |
| `Error: --url must use http or https` | A `file:`, `data:`, or other scheme was passed | Those are other subcommands' inputs: `html` for an HTML file, `mermaid` for a diagram, `svg` for an SVG |
| `Error: --url <address> points at a loopback address` (or private-range, link-local, cloud-metadata) | The address is inside the machine or its network | This tool does not fetch those; capture a public page, or use `html` on a local file |
| `Error: --width must be a whole number` / `--scale must be a positive number` / `--timeout` unit mistakes | A non-numeric, zero, negative, or unit-carrying value | Pass a bare positive number in the unit that subcommand documents |
| `Error: --timeout is in milliseconds and must be at least 1000` | `url` was given a seconds-shaped value | Multiply by a thousand; thirty seconds is `30000` |
| `the diagram did not parse; the renderer stopped at line N` | Mermaid syntax the renderer rejected | Fix that line. Only the line number is reported, by design |
| `the page did not finish loading within <N> ms` | A reference hangs, or the page never goes network-quiet | Inline or keep assets beside the file for `html` and `svg`; raise `--timeout` if the page is slow rather than never quiet |
| The image is a cookie banner or a login page | Expected for `url`: a fresh browser with no stored consent | The page a stranger sees is what `url` captures |

## Success

- `help` prints usage listing the five subcommands to stdout and exits 0 on a copy with no `node_modules/`. `html help` and `html --help` print that subcommand's usage; the same form works for every subcommand.
- `html` against an HTML file exits 0 with one parseable JSON object on stdout carrying `output`, `format`, `width`, `height`, and `scale`, and an image exists at the path in `output`.
- `svg` against a well-formed SVG exits 0 with one parseable JSON object on stdout carrying `output`, `width`, `height`, `scale`, and `sizedFrom`, and a PNG at `--output`.
- `mermaid` against a well-formed diagram exits 0 with one parseable JSON object on stdout carrying `path`, `width`, `height`, `scale`, `maxWidth`, `theme`, and `background`, and a PNG at `--output`.
- `url` against a reachable page exits 0 with one parseable JSON object on stdout carrying `output`, `finalUrl`, `status`, `scale`, and the PNG's real dimensions.
- `check` exits 0 with one JSON object surveying `packages` and `chromiumLaunch`. The exit code is 0 either way. Without `--install` it fetches nothing; with `--install` it installs first, then reports.
- A required flag omitted, a path that does not exist or is a directory, a bad number, an occupied `--output` without `--overwrite`, a non-http `--url`, or an unknown option exits 1 with the cause on stderr and stdout empty, and triggers no dependency install when the mistake is a usage one.
- An unknown option is refused by name before any install, read, or write.
- A `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before any install and before a browser is launched.
- Only `mermaid` checks for and installs `mermaid`. `html`, `svg`, `url`, and `check` never stop for a mermaid install.
- No run reads a credential. The writes are what `tools/AGENTS.md` lists an install writing, and the image at the caller-named `--output`.
