---
name: deck-export
type: tool
category: documents
description: Writes a new reveal.js deck project on disk, from a brand template or as a self-contained starter, and renders a finished deck to a PDF or to one PNG per slide
version: 0.2.9
runs: both
hosted:
  - pdf 8MiB 60s
  - png 8MiB 60s
---

# deck-export

One run either lays down a deck project ready for slides to be written into, or takes a finished deck's HTML and hands back a PDF or one image per slide.

## Context

Use it at the two mechanical ends of deck work. At the start, when a deck project has to exist before any slide is written: a brand template copied and retitled, or an offline starter with the reveal.js runtime bundled beside it. At the end, when the deck is finished and something other than a browser has to receive it: a PDF to attach or print, or per-slide images to drop into a document, a page, or a thread.

Do not use it to write the deck. Choosing the arc, the slides, and the words is `skills/Create Presentation/`; this tool lays the project down and renders the finished file, and a caller composes the two. Do not use it for a single HTML page rendered to one image, which is `render` `html`, nor for a long-form document such as a book, headed to print or to an EPUB, which is `tools/Book Publisher/`. It holds no opinion about a deck's content: it copies, writes, and renders exactly what it is pointed at.

It authenticates to nothing, holds no credential, and reaches no other primitive. After packages are installed, deck HTML and assets are served from upload bytes in an offline browser context. A CDN reference whose basename is a pinned reveal.js asset is fulfilled with the host's package bytes; every other external reference is refused. Rendering fetches no CDN. The install itself reaches `registry.npmjs.org` and `cdn.playwright.dev`, per `tools/AGENTS.md`.

## Hosted mode

`pdf` and `png` run on both hosts through `scripts/export-core.js`. `scaffold` stays local because it creates and copies a project on disk, including a template's assets folder. `check` stays local because it surveys and installs this machine's browser and packages.

Call `exportPdf(input, files, capabilities)` or `exportPng(input, files, capabilities)` with one ZIP upload `{ name, mediaType, bytes: Uint8Array }`. Its HTML and assets stay in memory, read with `tools/lib/archive-core.js`; no file is extracted to disk. Choose the HTML with `input.entry` when ambiguous (otherwise root `index.html`, or the only HTML file). JSON options are `width`, `height`, `scale`, `timeout`, and optional simple output filename `output`. PDF returns `{ answer, files }` with one PDF; PNG returns the same shape with one ZIP containing `slide-001.png` upward. Each output file carries `name`, `mediaType`, and `bytes`.

The host passes `{ browser, revealAssets, responseBody }` as capabilities; `fetch` and `lookup` are unused. The browser is its already-open Playwright Browser, local or Cloudflare's Browser Rendering. Every job closes its context and leaves the browser to its host. `revealAssets` maps package basenames to bytes: `reveal.js`, `reveal.css`, `reset.css`, and, when the deck uses them, `highlight.js` and `notes.js`. These come from this tool's pinned reveal.js 5.2.1 package (`dist/` and `plugin/`), never a CDN. The core seeds the pinned runtime before the deck runs and retains its global constructor, so inline bundled code cannot replace it. An intercepted reference to these basenames also uses the host's pinned bytes even if the upload carried another runtime. `scripts/package-assets.js` is the CLI's disk adapter. The core imports no Node module or browser package. `responseBody(bytes)` adapts binary assets to Playwright's body type; Node or a Worker with Node compatibility supplies `bytes => Buffer.from(bytes)` outside the core. Text assets work without it; binary assets refuse if it is absent.

The CLI calls those same cores. `--input` accepts a ZIP, or the original local HTML file; for local HTML it packages that file and its own `<HTML basename> Assets` folder into upload bytes. It reads no other folder, ignores hidden files, refuses symbolic links, and caps that local packaging at 8 MiB and 1,000 files. `png --output <path>.zip` saves the ZIP; a directory keeps the original one-file-per-slide behavior and JSON with absolute image paths. The whole render is checked before any PDF, ZIP or image is written.

Each upload and JSON input is at most 8 MiB. ZIPs allow at most 1,000 entries and 32 MiB expanded, refusing traversal, links, encryption and unsupported archive formats. Each deck has 1 to 24 slides and a PDF has at most 24 printed pages, including fragment expansion. Each image is at most 8,192 pixels per side and 16,777,216 pixels in total; PNG scale is an integer from 1 to 4. `timeout` is at most 45,000 ms and the complete browser job has a 60-second wall budget. A serialized answer reaching 48,000 characters, or output files reaching 4 MiB in total (ZIP framing included), is refused whole. Nothing is silently truncated or partly delivered. The context is offline before navigation; HTTP routing allows uploaded assets and pinned package assets only. Service workers are blocked, and an init script in every frame removes WebRTC and WebSocket constructors even when WebSocket routing is unavailable.

Compatibility refusals: missing assets, references to files outside the named assets folder, and external addresses outside the pinned package-asset overrides now refuse the entire export; put those assets in the ZIP or embed them. Uploaded scripts may attempt external requests; the offline context, HTTP allowlist and disabled socket constructors prevent those connections, and a refused HTTP asset fails the export. The limits above apply to the CLI too. PNG export explicitly disables reveal.js's responsive scroll view, so decks narrower than 435 pixels still yield every slide. Ordinary slide-view PNG bytes, CLI answer/progress bytes, and PDF page pixels are checked against the baseline. The 24-slide measurement on this Mac and its local browser is in the build report; the service still owes Browser Rendering verification.

A deadline or failed context close raises an error with `code: "browser_abandoned"` and `cleanup: Promise<{ closed: boolean }>`; cleanup also waits for context creation that completes after the deadline. The host must retain that promise with `waitUntil(error.cleanup)` (or await it outside a request lifetime). If it hangs or resolves with `closed: false`, discard the host browser. A pending close is never reported as completed.

## Quick Start

```bash
node scripts/deck.js help
```

Usage text, with nothing installed.

```bash
node scripts/deck.js check
```

Reports what is present, installing nothing (with `--install` it installs first and then reports on what it installed):

```
{"reveal.js":true,"playwright":true,"chromium":true}
```

Then scaffold, and later render. Scaffolding from a template installs nothing; a starter scaffold needs the reveal.js package and a render needs the browser driver, so for a person who has not yet authorized a Wiser install the first such command reports what it would install and stops, and `--install` on that run is the answer. Later tools in every copy install without asking.

```bash
node scripts/deck.js scaffold --output "/path/to/a/work/directory/Board Review" --title "Board Review"
node scripts/deck.js pdf --input "/path/to/a/work/directory/Board Review/Board Review.html" \
  --output "/path/to/a/work/directory/exports/Board Review.pdf"
```

```
{"output":"...Board Review.pdf","format":"pdf","width":1920,"height":1080,"slides":14}
```

Anything else, see Troubleshooting.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| The Chromium build Playwright drives | `pdf` and `png` | `node scripts/deck.js check` reports `"chromium":true` (trial launch), or `npm run check:chromium` exits 0 |

The packages install on the run that authorizes them with `--install`, `reveal.js` into this tool's directory and Playwright into the active browser runtime (`tools/AGENTS.md`), and that same run fetches the version-matched browser as a separate download if needed. If its own build is absent, the runtime first tries the newest complete build of the same artifact already in that browsers directory. Only if that trial cannot succeed does the authorised download run. Presence is a **trial launch**, not a path on disk: a binary that cannot start reports false. Missing OS libraries are self-healed in userspace where a C compiler is present (shims in `node_modules/.wiser-lib` inside the active browser runtime, per `tools/AGENTS.md`); otherwise `check` names the library and the one next step. Install steps are never written here. The shared runtime forwards `HTTPS_PROXY` / `HTTP_PROXY` at browser launch; exports keep that context offline and fulfill pinned CDN references from package bytes. `scaffold` and `check` never need a successful launch for non-browser work; `check` surveys Chromium without installing packages unless the run authorizes an install with `--install`, in which case it installs the packages and the browser and then reports on them. `tools/AGENTS.md` lists every write.

## Scaffolding

A deck project is one HTML file beside one assets folder named for it, so the whole deck moves as a folder and presents by opening the HTML. `--title` names both; characters a filesystem forbids are dropped from the two names per `standards/conventions.md`, while the title inside the deck keeps them. `--title` omitted, the `--output` directory's own name is the title.

| `--template` | What is written | Presenting needs |
|--------------|-----------------|------------------|
| Given | The template deck and its assets folder, copied and retitled | Only what the template itself references |
| Omitted | A starter deck with the reveal.js runtime copied in beside it | Nothing; it opens offline |

Pass `--template` when the caller named a template path and that path is a file. Omit `--template` and write the starter when none was named. A named template whose assets are all local satisfies a deck that must present with no network. When that template loads anything from the network, or you cannot tell, ask which of the two to write, and do not pick. A named template path that is not a file: stop, and do not substitute the starter.

A brand template is a complete working deck: an HTML file, and beside it a folder named for that file plus ` Assets` holding everything the file references. Copying it whole is what makes a template verifiable: what it shows when opened is what a deck made from it looks like. Two substitutions happen and no others: `{{TITLE}}` and the `<title>` tag take the new title, and references to the template's assets folder become references to the new one. Whatever else the template carries, layout classes, fonts, logos, slide markers, arrives untouched.

Without a template, the starter in this tool's `templates/` is written instead, carrying layout utilities, the slide markers `<!-- SLIDES START -->` and `<!-- SLIDES END -->`, and a reveal.js configuration at the chosen size and transition. Its slides are three placeholders to be replaced. The runtime is copied from this tool's own installed copy of reveal.js, so the deck has no CDN to reach and no build step, which is why a deck that must present with no network, and that named no template, takes the starter. **The theme is copied with its remote `@import` rules removed**, because eight of the fifteen themes reveal.js ships open by importing a Google Fonts stylesheet, and a theme copied whole would fetch it on every load and hang behind a captive portal. `fontsStripped` in the result says whether that happened; when it did, the theme's own `font-family` declarations stay and the faces fall back to the host's.

Scaffolding refuses rather than overwrites. A deck or an assets folder already at the target path stops the run, so a deck someone has worked on cannot be replaced by a fresh starter.

## Rendering

Both render commands load an intercepted upload address. Relative references resolve against the HTML entry inside the ZIP. Local HTML input is packaged with its named assets folder first. Loading waits for network silence and for the pinned reveal.js runtime to report itself ready. A missing asset or external reference refuses the whole export.

Size comes from the deck. After the deck initializes, its own reveal.js configuration supplies the slide width and height, and the export is made at that size, so a 4:3 deck exports 4:3 without being told. Pass `--width` and `--height` when the request names a pixel size. Otherwise omit them, including when the deck's configuration is a percentage; the tool uses its own fallback. Do not invent a size. The reported `width` and `height` are what the export was made at, which is the pair worth reading back.

`pdf` writes one file: reveal.js's own print layout, one page per slide, backgrounds included, at the deck's pixel size. `png` opens the deck with `?export=png`, turns every slide transition off for the capture, the deck's own and any slide's, so each image is its slide at rest, and writes one image per slide into the directory named, `slide-001.png` upward in presentation order, vertical slide stacks included, at `--scale` times the deck's size (2 by default, so a 1920 by 1080 deck yields 3840 by 2160 images). Files already in that directory are left alone unless a new image takes the same name; the output names every file written. The query is the deck's signal that it is being exported: reveal.js ignores it, and a slide whose own script honours it, such as an animated explainer, holds its finished picture in the image instead of a frame of its motion.

## Usage

| Command | Purpose | Needs the browser |
|---------|---------|-------------------|
| `node scripts/deck.js help` | Print usage and exit | No |
| `node scripts/deck.js check` | Report which dependencies are present; installs nothing unless `--install` is given, and then installs first | Yes: it proves Chromium by a trial launch |
| `node scripts/deck.js scaffold --output <dir>` | Write a new deck project | No |
| `node scripts/deck.js pdf --input <deck.html> --output <file.pdf>` | Render the deck to one PDF | Yes |
| `node scripts/deck.js png --input <deck.html> --output <dir>` | Render the deck to one PNG per slide | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--output <path>` | Where to write, absolute: a project directory for `scaffold`, a `.pdf` file for `pdf`, a directory or `.zip` file for `png`. It may not sit inside this tool directory | None; required |
| `--title <text>` | The deck's title, and the base of both project names | The `--output` directory's name |
| `--template <path>` | A brand template deck to copy, absolute | None; a starter is written |
| `--theme <name>` | reveal.js theme for a starter deck; the run lists what the installed version ships | `white` |
| `--ratio <ratio>` | `16/9`, `4/3`, or `1/1` for a starter deck | `16/9` |
| `--transition <name>` | `slide`, `fade`, `convex`, `concave`, `zoom`, or `none` for a starter deck | `slide` |
| `--input <path>` | Deck HTML file or ZIP to render, absolute | None; required by `pdf` and `png` |
| `--entry <name>` | HTML path inside the ZIP | Root `index.html` or the only HTML |
| `--width N`, `--height N` | Override the deck's own slide size, in pixels | The deck's configuration |
| `--scale N` | Pixel density for `png`, 1 to 4 | 2 |
| `--timeout MS` | How long the deck gets to load and initialize | 30000 |
| `--help` | Print usage and exit | Off |

Every path is absolute, because a relative one resolves against whichever directory the caller happened to be in. This tool picks no location: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the path inside it. It needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. Nothing it does destroys anything, since scaffolding refuses an occupied path and rendering writes only what the caller named, so no command takes `--confirm`.

## Script Contract

The one script this tool ships follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. The sections above state what each command does; the contract states how the script behaves getting there.

Two behaviors are worth knowing beyond it. Every usage mistake the script can judge on its own is caught before the dependency check, so a bad path, a bad size, a bad ratio, or a bad transition never triggers an install and never opens a browser; `--theme` is the one exception, since only the installed package knows which themes it ships, so an unknown theme refuses after that install and still before any browser. And `check` installs nothing at all unless the run authorizes an install with `--install`, so a machine can be surveyed before anything is committed to it and repaired by the same command once someone has answered for the download: for Chromium it runs a trial launch through the shared browser-runtime, not only a path check. Content and render failures still withhold the engine's own text, which quotes the deck; launch failures name the runtime's remediation (never a root-only install-deps wall); initialization timeouts name the requested budget without quoting the deck. Per-slide progress goes to stderr, so stdout carries only the final JSON object. Nothing is read from stdin, so a run with nobody watching fails loudly rather than waiting.

## Output

One JSON object on stdout, exit 0.

| Command | Carries |
|---------|---------|
| `scaffold` | `deck` and `assets`, the two absolute paths written; the `title`; `source`, either `template` or `starter`; the template path, or the starter's `theme`, `width`, `height`, `transition`, and `fontsStripped` |
| `pdf` | `output`, `format`, the `width` and `height` it rendered at, and `slides`, the page count |
| `png` | `output`, the directory or ZIP; `format`; `width`, `height`, and `scale`; `slides`; and `files`, every image path in order |
| `check` | A boolean per dependency: the two packages, and Chromium after a successful trial launch |

Failure prints to stderr, leaves stdout empty, and exits 1.

## Troubleshooting

The stops every tool shares, an unknown flag, the install consent, an install that fails, and a path that is relative or inside this tool, are in `tools/RUNNING.md`; the rows below are this tool's own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Chromium cannot launch` / `chromium:false` on `check` | Binary missing, launch blocked, or OS library gap | Read `remediation` on the check JSON (or the error line); it names the dependency, the check, and one next step. Never `sudo install-deps` |
| `--output is required` | No destination was named | Resolve a work directory in the owning root and name the path; this tool picks no location |
| `--output must end .pdf` | `pdf` was pointed at something else | Name the PDF file to write |
| `--output must be a directory for png` | `png` was pointed at a file | Name the directory the slide images go into |
| `a deck already exists at <path>` | Scaffolding would overwrite work | Pass a different `--output` or `--title`, or move the existing deck aside |
| `no assets folder at <path>` | The template's assets folder is missing or misnamed | A template is `<name>.html` beside `<name> Assets`; rename the folder to match |
| `--theme "<name>" is not one this reveal.js version ships` | A theme that does not exist here | Pick one from the list the message prints |
| `the deck did not initialize within the requested timeout` | The entry did not initialize reveal.js within the budget | Confirm it is a reveal.js deck and include its assets in the ZIP; `--timeout` is capped at 45000 |
| `an asset is missing from the upload or uses an external address` | A reference is outside the ZIP or named assets folder | Include or embed that asset and rerun |
| `Chromium cannot launch` | Binary missing, launch blocked, or OS library gap; `check` reports `chromium:false` with `remediation` | Follow the single remediation line; do not chase allowlist or CDN for a launch failure |
| `deck must contain 1 to 24 slides.` | The deck has no slides or exceeds the 24-slide cap | Point `--input` at the deck, not at a page that merely loads reveal.js |
| `the browser could not export this deck; engine text is withheld because it can quote the page.` | The deck failed in a content/render way this tool cannot name without quoting the deck | Open that file in a browser; whatever it does there is what happened here |
| Dark deck PDF is white pages / white text invisible | reveal.js `?print-pdf` wraps slides in `.pdf-page` boxes that default to white; a dark background on `.reveal` does not carry onto those boxes | Authoring fix: dark templates and decks need the `@media print` block in `skills/Create Presentation/starter-deck.html` (and every dark brand template), painting the on-screen background onto `.pdf-page`. `printBackground: true` alone is not enough |
| Navigation arrows or a slide number appear in the images | They are part of the deck, not of the export | Turn them off in the deck's own reveal.js configuration before rendering |
| A slide with a progressive reveal exports in its first state | Fragments advance on a click nobody makes here | When the request needs each fragment state as its own image, split the slide so each state is its own section, then render. When it needs one image of the final state, drop the fragments, then render. When the request does not say, ask, and do not ship the first state as the whole reveal |
| Fonts look wrong | A webfont the deck names was not reachable | Keep the font file beside the deck and reference it relatively when you can place it there, then re-render. When you cannot, deliver the fallback and say the webfont was not reachable. When you cannot tell, ask. Do not fetch the webfont as a substitute |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`, and `check` prints one JSON object of booleans on the same copy, installing nothing and opening no connection; `chromium` is true only after a trial launch succeeds, not merely because the binary path exists. `check --install` on that same copy installs the packages and the browser first and then reports on them.
- Every usage mistake exits 1 with the cause on stderr and stdout empty, and none of them opens a browser: a missing, relative, non-existent, or wrong-shaped path, an unknown ratio, or an unknown transition refuses before any install; an unknown theme refuses against the list the installed package really ships, which on a fresh copy is after that install.
- An `--output` resolving inside this tool directory is refused rather than written.
- `scaffold` writes exactly one HTML file and one assets folder under `--output`, and a second run at the same path refuses instead of overwriting.
- A starter deck opens and presents with no network connection available; a deck scaffolded from a template carries that template's own structure with only the title and the assets-folder references changed.
- `pdf` exits 0 with one parseable JSON object and a PDF at the named path whose page count equals the reported `slides`; `png` exits 0 having written `slides` images, `slide-001.png` upward, and no other file.
- A deck whose reveal.js configuration sets a size exports at that size with no `--width` or `--height` given.
- No run reads a credential or takes `--env`; exports fulfill only uploaded assets and the pinned reveal.js files; references outside the upload refuse the export. Content/render failures withhold the engine's own text; a launch throw directs the member to `node scripts/deck.js check` for runtime remediation.
