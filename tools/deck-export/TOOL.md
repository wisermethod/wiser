---
name: deck-export
type: tool
category: documents
description: Writes a new reveal.js deck project on disk, from a brand template or as a self-contained starter, and renders a finished deck to a PDF or to one PNG per slide
version: 0.2.0
---

# deck-export

One run either lays down a deck project ready for slides to be written into, or takes a finished deck's HTML and hands back a PDF or one image per slide.

## Context

Use it at the two mechanical ends of deck work. At the start, when a deck project has to exist before any slide is written: a brand template copied and retitled, or an offline starter with the reveal.js runtime bundled beside it. At the end, when the deck is finished and something other than a browser has to receive it: a PDF to attach or print, or per-slide images to drop into a document, a page, or a thread.

Do not use it to write the deck. Choosing the arc, the slides, and the words is `skills/Create Presentation/`; this tool lays the project down and renders the finished file, and a caller composes the two. Do not use it for a single HTML page rendered to one image, which is `html-to-png`, nor for a long-form document headed to print, which this root does not ship. It holds no opinion about a deck's content: it copies, writes, and renders exactly what it is pointed at.

It authenticates to nothing, holds no credential, and reaches no other primitive. After the first-run install it opens no network connection of its own; a deck is loaded from disk, and whatever that deck references is fetched, which for a deck that loads reveal.js from a CDN means rendering needs network access. The install itself reaches `registry.npmjs.org` and `cdn.playwright.dev`, per `tools/AGENTS.md`.

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

Then scaffold, and later render. Scaffolding from a template installs nothing; a starter scaffold needs the reveal.js package and a render needs the browser driver, so in a fresh copy the first such command reports what it would install and stops, and the same command with `--install` installs and does the work in one run.

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

The packages install on the run that authorises them with `--install`, `reveal.js` into this tool's directory and Playwright into `tools/lib/browser-runtime/`, and that same run then fetches the browser, which is a separate download version-matched to the package that drives it. Presence is a **trial launch**, not a path on disk: a binary that cannot start reports false. Missing OS libraries are self-healed in userspace where a C compiler is present (shared runtime at `tools/lib/browser-runtime/`); otherwise `check` names the library and the one next step. Install steps are never written here. The shared runtime also forwards `HTTPS_PROXY` / `HTTP_PROXY` into Chromium for CDN-loaded decks. `scaffold` and `check` never need a successful launch for non-browser work; `check` surveys Chromium without installing packages unless the run authorises an install with `--install`, in which case it installs the packages and the browser and then reports on them. `tools/AGENTS.md` lists every write.

## Scaffolding

A deck project is one HTML file beside one assets folder named for it, so the whole deck moves as a folder and presents by opening the HTML. `--title` names both; characters a filesystem forbids are dropped from the two names per `standards/conventions.md`, while the title inside the deck keeps them. `--title` omitted, the `--output` directory's own name is the title.

| `--template` | What is written | Presenting needs |
|--------------|-----------------|------------------|
| Given | The template deck and its assets folder, copied and retitled | Only what the template itself references |
| Omitted | A starter deck with the reveal.js runtime copied in beside it | Nothing; it opens offline |

A brand template is a complete working deck: an HTML file, and beside it a folder named for that file plus ` Assets` holding everything the file references. Copying it whole is what makes a template verifiable: what it shows when opened is what a deck made from it looks like. Two substitutions happen and no others: `{{TITLE}}` and the `<title>` tag take the new title, and references to the template's assets folder become references to the new one. Whatever else the template carries, layout classes, fonts, logos, slide markers, arrives untouched.

Without a template, the starter in this tool's `templates/` is written instead, carrying layout utilities, the slide markers `<!-- SLIDES START -->` and `<!-- SLIDES END -->`, and a reveal.js configuration at the chosen size and transition. Its slides are three placeholders to be replaced. The runtime is copied from this tool's own installed copy of reveal.js, so the deck has no CDN to reach and no build step, which is the reason to choose it: a deck that must present on a machine with no network. **The theme is copied with its remote `@import` rules removed**, because eight of the fifteen themes reveal.js ships open by importing a Google Fonts stylesheet, and a theme copied whole would fetch it on every load and hang behind a captive portal. `fontsStripped` in the result says whether that happened; when it did, the theme's own `font-family` declarations stay and the faces fall back to the host's.

Scaffolding refuses rather than overwrites. A deck or an assets folder already at the target path stops the run, so a deck someone has worked on cannot be replaced by a fresh starter.

## Rendering

Both render commands load the deck from disk through a `file://` address, so relative references in the HTML resolve against the deck's own directory. Loading waits for the network to go quiet and then for reveal.js to report itself ready: a deck whose assets are missing, or whose CDN is unreachable, spends the timeout and then fails the run rather than producing a half-drawn export.

Size comes from the deck. After the deck initializes, its own reveal.js configuration supplies the slide width and height, and the export is made at that size, so a 4:3 deck exports 4:3 without being told. `--width` and `--height` override it, for a deck whose configuration sets a percentage rather than a pixel count, or when a specific export size is wanted. The reported `width` and `height` are what the export was made at, which is the pair worth reading back.

`pdf` writes one file: reveal.js's own print layout, one page per slide, backgrounds included, at the deck's pixel size. `png` writes one image per slide into the directory named, `slide-001.png` upward in presentation order, vertical slide stacks included, at `--scale` times the deck's size (2 by default, so a 1920 by 1080 deck yields 3840 by 2160 images). Files already in that directory are left alone unless a new image takes the same name; the output names every file written.

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
| `--output <path>` | Where to write, absolute: a project directory for `scaffold`, a `.pdf` file for `pdf`, a directory for `png`. It may not sit inside this tool directory | None; required |
| `--title <text>` | The deck's title, and the base of both project names | The `--output` directory's name |
| `--template <path>` | A brand template deck to copy, absolute | None; a starter is written |
| `--theme <name>` | reveal.js theme for a starter deck; the run lists what the installed version ships | `white` |
| `--ratio <ratio>` | `16/9`, `4/3`, or `1/1` for a starter deck | `16/9` |
| `--transition <name>` | `slide`, `fade`, `convex`, `concave`, `zoom`, or `none` for a starter deck | `slide` |
| `--input <path>` | Deck HTML file to render, absolute | None; required by `pdf` and `png` |
| `--width N`, `--height N` | Override the deck's own slide size, in pixels | The deck's configuration |
| `--scale N` | Pixel density for `png`, 1 to 4 | 2 |
| `--timeout MS` | How long the deck gets to load and initialize | 30000 |
| `--help` | Print usage and exit | Off |

Every path is absolute, because a relative one resolves against whichever directory the caller happened to be in. This tool picks no location: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the path inside it. It needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. Nothing it does destroys anything, since scaffolding refuses an occupied path and rendering writes only what the caller named, so no command takes `--confirm`.

## Script Contract

The one script this tool ships follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything else, the first-run package install, the system-dependency check on the commands that need it, and the stdout and stderr rules. The sections above state what each command does; the contract states how the script behaves getting there.

Two behaviors are worth knowing beyond it. Every usage mistake the script can judge on its own is caught before the dependency check, so a bad path, a bad size, a bad ratio, or a bad transition never triggers an install and never opens a browser; `--theme` is the one exception, since only the installed package knows which themes it ships, so an unknown theme refuses after that install and still before any browser. And `check` installs nothing at all unless the run authorises an install with `--install`, so a machine can be surveyed before anything is committed to it and repaired by the same command once someone has answered for the download: for Chromium it runs a trial launch through the shared browser-runtime, not only a path check. Content and render failures still withhold the engine's own text, which quotes the deck; launch failures name the runtime's remediation (never a root-only install-deps wall); network or navigation timeouts surface the engine detail an operator needs. Per-slide progress goes to stderr, so stdout carries only the final JSON object. Nothing is read from stdin, so a run with nobody watching fails loudly rather than waiting.

## Output

One JSON object on stdout, exit 0.

| Command | Carries |
|---------|---------|
| `scaffold` | `deck` and `assets`, the two absolute paths written; the `title`; `source`, either `template` or `starter`; the template path, or the starter's `theme`, `width`, `height`, `transition`, and `fontsStripped` |
| `pdf` | `output`, `format`, the `width` and `height` it rendered at, and `slides`, the page count |
| `png` | `output`, the directory; `format`; `width`, `height`, and `scale`; `slides`; and `files`, every image path in order |
| `check` | A boolean per dependency: the two packages, and Chromium after a successful trial launch |

Failure prints to stderr, leaves stdout empty, and exits 1.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand. See SETUP.md |
| `Chromium cannot launch` / `chromium:false` on `check` | Binary missing, launch blocked, or OS library gap | Read `remediation` on the check JSON (or the error line); it names the dependency, the check, and one next step. Never `sudo install-deps` |
| `--output is required` | No destination was named | Resolve a work directory in the owning root and name the path; this tool picks no location |
| `--output must be absolute` | A relative path resolves against the caller's directory | Pass the resolved absolute path |
| `--output resolves inside this tool directory` | The path landed in the shared root | Pass a work directory in the owning root |
| `--output must end .pdf` | `pdf` was pointed at something else | Name the PDF file to write |
| `--output must be a directory for png` | `png` was pointed at a file | Name the directory the slide images go into |
| `a deck already exists at <path>` | Scaffolding would overwrite work | Pass a different `--output` or `--title`, or move the existing deck aside |
| `no assets folder at <path>` | The template's assets folder is missing or misnamed | A template is `<name>.html` beside `<name> Assets`; rename the folder to match |
| `--theme "<name>" is not one this reveal.js version ships` | A theme that does not exist here | Pick one from the list the message prints |
| `the deck did not initialize within <n> ms` | Not a reveal.js deck, an asset missing beside it, a CDN-loaded deck with no network, or a **proxy-only-egress** host without `HTTPS_PROXY` / `HTTP_PROXY` in the environment | Open the file in a browser; if it presents there, raise `--timeout`. On a proxy-only machine, export `HTTPS_PROXY` (or `HTTP_PROXY`); the runtime forwards it into Chromium automatically |
| `the deck did not finish loading within <n> ms` | A reference the deck makes is slow or unreachable; same proxy-only egress case as above | Confirm every local file it names sits beside it, make remote ones reachable, or set the proxy env vars |
| `Chromium cannot launch` | Binary missing, launch blocked, or OS library gap; `check` reports `chromium:false` with `remediation` | Follow the single remediation line; do not chase allowlist or CDN for a launch failure |
| `no slides found in <path>` | The HTML has no `<section>` elements inside its slides container | Point `--input` at the deck, not at a page that merely loads reveal.js |
| `the browser engine could not render <path>` | The deck failed in a content/render way this tool cannot name without quoting the deck | Open that file in a browser; whatever it does there is what happened here |
| Dark deck PDF is white pages / white text invisible | reveal.js `?print-pdf` wraps slides in `.pdf-page` boxes that default to white; a dark background on `.reveal` does not carry onto those boxes | Authoring fix: dark templates and decks need the `@media print` block in `skills/Create Presentation/starter-deck.html` (and every dark brand template), painting the on-screen background onto `.pdf-page`. `printBackground: true` alone is not enough |
| Navigation arrows or a slide number appear in the images | They are part of the deck, not of the export | Turn them off in the deck's own reveal.js configuration before rendering |
| A slide with a progressive reveal exports in its first state | Fragments advance on a click nobody makes here | Split the slide, or drop the fragments before export |
| Fonts look wrong | A webfont the deck names was not reachable | Keep the font file beside the deck and reference it relatively, or accept the fallback deliberately |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`, and `check` prints one JSON object of booleans on the same copy, installing nothing and opening no connection; `chromium` is true only after a trial launch succeeds, not merely because the binary path exists. `check --install` on that same copy installs the packages and the browser first and then reports on them.
- Every usage mistake exits 1 with the cause on stderr and stdout empty, and none of them opens a browser: a missing, relative, non-existent, or wrong-shaped path, an unknown ratio, or an unknown transition refuses before any install; an unknown theme refuses against the list the installed package really ships, which on a fresh copy is after the first-run install.
- An `--output` resolving inside this tool directory is refused rather than written.
- `scaffold` writes exactly one HTML file and one assets folder under `--output`, and a second run at the same path refuses instead of overwriting.
- A starter deck opens and presents with no network connection available; a deck scaffolded from a template carries that template's own structure with only the title and the assets-folder references changed.
- `pdf` exits 0 with one parseable JSON object and a PDF at the named path whose page count equals the reported `slides`; `png` exits 0 having written `slides` images, `slide-001.png` upward, and no other file.
- A deck whose reveal.js configuration sets a size exports at that size with no `--width` or `--height` given.
- No run reads a credential or takes `--env`; the only network traffic after the first-run install, which reaches the npm registry and downloads a Chromium build per `tools/AGENTS.md`, is what the deck itself requests (and, when set, via the process proxy env vars). Content/render failures withhold the engine's own text; launch and timeout failures surface engine detail.
