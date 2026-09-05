# Tools

Deterministic operations that skills and experts call; `standards/primitives.md` owns the type. What a script does when you run it is `tools/RUNNING.md`; the contract its author followed is `standards/script-contract.md`.

## Installing

A tool ships its manifest and never its packages. The first run that needs them reports what it would fetch and stops; `--install` on the same command installs and finishes the work (`tools/RUNNING.md`). Packages land in the tool's own directory, per copy of the plugin, so the plugin directory has to be writable. Playwright for the six browser tools lands once in `tools/lib/browser-runtime/`. An install writes nothing this repository ships.

**Hosts an install reaches.** `registry.npmjs.org` for a Node tool; `cdn.playwright.dev`, with `playwright.download.prss.microsoft.com` as fallback, for a Chromium build; `pypi.org`, `files.pythonhosted.org` and `openaipublic.azureedge.net` for `Transcribe Audio`. At run time a deck or a diagram may name `cdn.jsdelivr.net` or `cdnjs.cloudflare.com` for its own assets.

## Everything a tool writes, and where

This is the one list; a tool's own pages point here rather than restating it.

| What | Where | Which tools |
|------|-------|-------------|
| Node packages | `node_modules/` in the tool's directory | the 9 tools whose `package.json` declares a dependency |
| npm's cache and logs | npm's configured cache, `~/.npm` by default, outside this plugin | the same 9, and the shared browser runtime |
| Python packages | `.venv/` in the tool's directory; pip's cache is switched off | `Transcribe Audio` |
| Playwright and its Chromium build | once, into `tools/lib/browser-runtime/` and Playwright's cache (`PLAYWRIGHT_BROWSERS_PATH` if set to a path; inside `tools/lib/browser-runtime/node_modules/` if set to `0`; otherwise `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux, `%LOCALAPPDATA%\ms-playwright` on Windows) | the six browser tools |
| Compatibility shims, compiled on a Linux host missing an X library | `tools/lib/browser-runtime/node_modules/.wiser-lib`; Linux only, untested there | the six browser tools |
| Speech model weights, 75MB to 3.1GB, a second authorised download | the `--model-cache` directory | `Transcribe Audio` |
| The deliverable | exactly the path the caller passes | every tool that writes one |
| A browser profile with live sign-ins, and a trace archive with cookies in it | exactly the `--profile` and `trace stop --output` paths | `Browser Control` |
| A session token | `~/.wiser/browser-control/<port>.token`, outside this plugin; left behind by a kill | `Browser Control` |
| An image written back onto its input | the `--base` path, only with `--confirm` | `image-overlay` |
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
| `tag-audit/TOOL.md` | One JSON report of which analytics and behavior tags a live page serves, with each tag's id where the served HTML exposes it; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before any fetch, the same screen `sitemap-fetch` applies |

### Media

| Tool | Description |
|------|-------------|
| `html-to-png/TOOL.md` | Renders one local HTML file to a PNG or JPEG image at a path the caller names, sized to a given viewport width, either a fixed height or the content's own, and a chosen device scale factor |
| `image-edit/TOOL.md` | Applies local edits to an existing image, rotate, center crop, resize, grayscale, blur, brightness, contrast, sharpen, and placement on a transparent canvas at a given offset, and writes the result as a new PNG, JPEG, or WEBP |
| `image-overlay/TOOL.md` | Composites an overlay image over a base image, stretched to the base's pixel dimensions, and writes the flattened result as a PNG or JPEG file |
| `mermaid-to-png/TOOL.md` | Renders a Mermaid diagram file to a PNG drawn at the diagram's own size up to a maximum width, in a chosen theme, background, and device scale factor |
| `svg-to-png/TOOL.md` | Renders an SVG file to a PNG at a caller-chosen scale or pixel width, sized from the SVG's own dimensions |
| `Transcribe Audio/TOOL.md` | Turns one audio file into a text transcript with a speech model that runs on this machine |
| `video-edit/TOOL.md` | Edits a video with FFmpeg and writes the result where the caller names, covering trim, resize, speed, text overlay, audio removal, concatenation, frame extraction, and GIF conversion |
| `web-screenshot/TOOL.md` | Captures a PNG of a live web page at a caller-named viewport size and scale, either the visible viewport or the whole scrollable page; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before the browser is launched, the same screen `sitemap-fetch` applies |

### Research

| Tool | Description |
|------|-------------|
| `Content Harvester/TOOL.md` | Turns one harvest request into a timeboxed, deduplicated, ranked bundle of source candidates with a record of what was rejected and what failed |

### SEO

| Tool | Description |
|------|-------------|
| `seo-audit/TOOL.md` | Consolidates the Search Console and Analytics results a caller supplies for one site and date range into one audit dataset of search and traffic totals, top queries, a merged page table, sitemap status, the organic trend, and target-keyword status |
| `seo-keywords/TOOL.md` | Turns Search Console query rows into a keyword report of top performers, position 5 to 20 opportunities, queries growing and declining against the previous window, pages competing for the same query, and the standing of named target keywords |
| `seo-page-analyzer/TOOL.md` | Reports one page's on-page SEO elements from caller-supplied HTML, each element with its measurements and the checks it failed |
| `sitemap-diff/TOOL.md` | One JSON report of what changed between two sitemap snapshots of the same site, naming the URLs added, the URLs removed, the URLs whose lastmod moved, and the path segments that are new |
| `sitemap-fetch/TOOL.md` | One deterministic snapshot of the URLs a site publishes in its sitemaps, with index files followed, gzip handled, each URL normalized, and every sitemap that failed recorded rather than raised |

<!-- /generated:index -->
