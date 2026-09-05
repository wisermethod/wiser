# Tools

Deterministic operations that skills and experts call; `standards/primitives.md` owns the type. Running one is `tools/RUNNING.md`; the contract is `standards/script-contract.md`.

## Installing

A tool ships its manifest and never its packages. The plugin asks once, on the first install in this copy; `--install` on that run is the answer, and later tools install without asking (`tools/RUNNING.md`). Packages land in the tool's own directory, per copy of the plugin, so the plugin directory has to be writable. Playwright for the three browser tools lands once in `tools/lib/browser-runtime/`. An install writes nothing this repository ships.

**Hosts an install reaches.** `registry.npmjs.org` for a Node tool; `cdn.playwright.dev`, with `playwright.download.prss.microsoft.com` as fallback, for a Chromium build; `pypi.org`, `files.pythonhosted.org` and `openaipublic.azureedge.net` for `Transcribe Audio`. At run time a deck or a diagram may name `cdn.jsdelivr.net` or `cdnjs.cloudflare.com` for its own assets.

## Everything a tool writes, and where

The one list; a tool's pages point here.

| What | Where | Which tools |
|------|-------|-------------|
| Plugin consent marker | `.wiser-consent` at the plugin root | every tool that installs |
| Node packages | `node_modules/` in the tool's directory | the 8 tools whose `package.json` declares a dependency |
| npm's cache and logs | npm's configured cache, `~/.npm` by default, outside this plugin | the same 8, and the shared browser runtime |
| Python packages | `.venv/` in the tool's directory; pip's cache is switched off | `Transcribe Audio` |
| Playwright and its Chromium build | once, into `tools/lib/browser-runtime/` and Playwright's cache (`PLAYWRIGHT_BROWSERS_PATH` if set to a path; inside `tools/lib/browser-runtime/node_modules/` if set to `0`; otherwise `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux, `%LOCALAPPDATA%\ms-playwright` on Windows) | the three browser tools |
| Compatibility shims, compiled on a Linux host missing an X library | `tools/lib/browser-runtime/node_modules/.wiser-lib`; Linux only, untested there | the three browser tools |
| Speech model weights, 75MB to 3.1GB, a second authorised download | the `--model-cache` directory | `Transcribe Audio` |
| The deliverable | exactly the path the caller passes | every tool that writes one |
| A browser profile with live sign-ins, and a trace archive with cookies in it | exactly the `--profile` and `trace stop --output` paths | `Browser Control` |
| A session token | `~/.wiser/browser-control/<port>.token`, outside this plugin; left behind by a kill | `Browser Control` |
| An image written back onto its input | the `--base` path, only with `--confirm` | `image compose` |
| A dated copy of a deck before an in-place edit | `--archive-dir`, or `zArchive/` beside the deck | `keynote-render` |
| A harvest bundle | the `output.directory` inside the request file, absent `--output` | `Content Harvester` |

<!-- generated:index -->

### Automation

| Tool | Description |
|------|-------------|
| `Browser Control/TOOL.md` | Drives a persistent Chromium session to read, navigate, and act on pages that need a real browser, answering every command with the page state that followed |

### Data

| Tool | Description |
|------|-------------|
| `data/TOOL.md` | Parses, describes, aggregates, joins, and charts a CSV, JSON, or TSV file, and computes a percentage, difference, or rate from two numeric fields of a JSON object |

### Documents

| Tool | Description |
|------|-------------|
| `deck-export/TOOL.md` | Writes a new reveal.js deck project on disk, from a brand template or as a self-contained starter, and renders a finished deck to a PDF or to one PNG per slide |
| `keynote-render/TOOL.md` | Builds and edits native Keynote decks from JSON or markdown SSOT, with zArchive safety before every in-place mutation |

### Marketing

| Tool | Description |
|------|-------------|
| `tag-audit/TOOL.md` | One JSON report of which analytics and behavior tags a live page serves, with each tag's id where the served HTML exposes it; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before any fetch, the same screen `sitemap` `fetch` applies |

### Media

| Tool | Description |
|------|-------------|
| `image/TOOL.md` | Applies local edits to an existing image or composites an overlay over a base image, and writes the result as a PNG, JPEG, or WEBP |
| `render/TOOL.md` | Renders a local HTML file to a PNG or JPEG, an SVG or a Mermaid diagram to a PNG, and captures a PNG of a live web page; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before the browser is launched, the same screen `sitemap` `fetch` applies |
| `Transcribe Audio/TOOL.md` | Turns one audio file into a text transcript with a speech model that runs on this machine |
| `video-edit/TOOL.md` | Edits a video with FFmpeg and writes the result where the caller names, covering trim, resize, speed, text overlay, audio removal, concatenation, frame extraction, and GIF conversion |

### Research

| Tool | Description |
|------|-------------|
| `Content Harvester/TOOL.md` | Turns one harvest request into a timeboxed, deduplicated, ranked bundle of source candidates with a record of what was rejected and what failed |

### SEO

| Tool | Description |
|------|-------------|
| `seo-data/TOOL.md` | Consolidates Search Console and Analytics results for one site and date range into one audit dataset, and turns Search Console query rows into a keyword report of top performers, opportunities, trends, cannibalization, and target-keyword standings |
| `seo-page-analyzer/TOOL.md` | Reports one page's on-page SEO elements from caller-supplied HTML, each element with its measurements and the checks it failed |
| `sitemap/TOOL.md` | One deterministic snapshot of the URLs a site publishes in its sitemaps, and one JSON report of what changed between two snapshots of the same site |

<!-- /generated:index -->
