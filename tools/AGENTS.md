# Tools

Deterministic operations that skills and experts call; `standards/primitives.md` owns the type's definition, invocation rules, and frontmatter. The directory is flat, and the index below is grouped by category.

The index is **hand-maintained**. `standards/primitives.md` says a family index is generated from primitive frontmatter at release. This root carries no generator, so nothing generates this file: it is written by hand from the frontmatter of what actually shipped, and it is corrected by hand when a primitive is added, removed, renamed, or recategorized.

## What a tool installs, and where

A tool ships its manifest and never its packages. Dependencies install on the machine that calls the tool, at the moment that tool is first used, into that tool's own directory: `node_modules/` for a Node tool, a virtual environment for a Python one. Installing the plugin installs none of it, and a tool nobody calls costs nothing.

Two consequences a caller should expect. The first use of a tool is slower than the rest, and a tool whose dependencies are large enough to need a system component, a browser build, an audio decoder, a speech model or Keynote, says so in its own `SETUP.md`. And a tool that needs something npm cannot install, an audio decoder or a browser build, names that dependency and the one command that proves it present, rather than carrying install steps that rot.

**This plugin's directory has to be writable.** A tool that carries dependencies installs them beside its own scripts, so a copy of this plugin installed where the user cannot write can answer `help` and nothing else. A tool that declares no dependency runs anywhere; each tool's own `package.json` or `requirements.txt` says which is which, and the index below names the tools rather than their dependencies. Installing through a plugin manager into the user's own space satisfies this, and a tool that cannot write says so in as many words rather than reporting a broken install.

**Dependencies are per copy, not per machine.** A tool installs into the copy of the plugin it was called from, so a second copy installs again, and a plugin manager that keeps each version in its own directory means an update starts from nothing. The cost is paid in download time on the first use after an update, not in disk, since the manager removes the version it replaced.

**A browser tool writes outside this plugin as well.** `Browser Control`, `deck-export`, `html-to-png`, `mermaid-to-png`, `svg-to-png` and `web-screenshot` drive Chromium through Playwright, which downloads a browser build of several hundred megabytes into the user's own cache, `PLAYWRIGHT_BROWSERS_PATH` or `~/.cache/ms-playwright`, and the shared launch runtime writes its compatibility shims into a `.wiser-lib` directory beside it. That is the user's cache rather than this plugin, it is shared across copies of the plugin, and it is the one write that does not land under this root.

**An install writes nothing this repository ships.** A Node tool installs with `npm ci`, which builds `node_modules/` from the lockfile exactly as recorded and never rewrites it; `npm install` does rewrite it, and every lockfile here is a file this repository ships, so a tool that installed with `npm install` would dirty a tracked file in your own clone merely by being called. Install every tool and `git status` stays clean. That is a guarantee rather than an observation, and `SETUP.md` names `npm ci` for the same reason wherever it gives the command by hand.

`system/templates/Script Contract.md` is the contract every one of these scripts follows, and it is the file to read before writing or changing one.

<!-- generated:index -->

### Automation

| Tool | Description |
|------|-------------|
| `Browser Control/TOOL.md` | Drives a persistent Chromium session to read, navigate, and act on pages that need a real browser, answering every command with the page state that followed |

### Data

| Tool | Description |
|------|-------------|
| `data-aggregate/TOOL.md` | Groups a CSV, JSON, or TSV file's rows by one or more columns and computes sum, mean, median, min, max, or count over named metric columns, one result row per group |
| `data-chart/TOOL.md` | Builds a self-contained HTML file with an SVG bar or line chart from a CSV, JSON, or TSV file's named x and y columns |
| `data-describe/TOOL.md` | Computes count, mean, median, min, max, standard deviation, and 25th and 75th percentiles for each numeric column of a CSV, JSON, or TSV file, with the count of values that held no number and the columns it skipped |
| `data-join/TOOL.md` | Joins two CSV, JSON, or TSV files on a shared key column with an inner or left join, returning the joined rows and match counts as JSON |
| `data-parse/TOOL.md` | Parses a CSV, JSON, or TSV file into a column profile with each column's detected type, non-null count, and sample values, plus the row count, the count of uneven delimited rows, and any parse errors |

### Documents

| Tool | Description |
|------|-------------|
| `deck-export/TOOL.md` | Writes a new reveal.js deck project on disk, from a brand template or as a self-contained starter, and renders a finished deck to a PDF or to one PNG per slide |
| `keynote-render/TOOL.md` | Builds and edits native Keynote decks from JSON or markdown SSOT, with zArchive safety before every in-place mutation |

### Marketing

| Tool | Description |
|------|-------------|
| `tag-audit/TOOL.md` | One JSON report of which analytics and behavior tags a live page serves, with each tag's id where the served HTML exposes it |

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
| `web-screenshot/TOOL.md` | Captures a PNG of a live web page at a caller-named viewport size and scale, either the visible viewport or the whole scrollable page |

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
