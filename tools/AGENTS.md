# Tools

Deterministic operations that skills and experts call; `standards/primitives.md` owns the type and the classifier seam every new typed file here, and any file whose seam changes, declares in its Context. Running one is `tools/RUNNING.md`; the contract is `standards/script-contract.md`.

## Installing

A tool ships its manifest and never its packages. The plugin asks once, on the first install in this copy; `--install` on that run is the answer, and later tools install without asking (`tools/RUNNING.md`). Packages land in the tool's own directory, per copy of the plugin, so the plugin directory has to be writable. Playwright for the three browser tools lands once in `tools/lib/browser-runtime/`. An install writes nothing this repository ships.

**Hosts an install reaches.** `registry.npmjs.org` for a Node tool; `storage.googleapis.com`, Google's Chrome for Testing storage, for the `chrome-headless-shell` build HyperFrames' installer fetches for `video-render`; `cdn.playwright.dev`, with `playwright.download.prss.microsoft.com` as fallback, for a Chromium build; `pypi.org` and `files.pythonhosted.org` for `Transcribe Audio` packages, `openaipublic.azureedge.net` for its transcription weights, and `download.pytorch.org` for its MIT English alignment weights (about 378 MB); `pypi.org` and `files.pythonhosted.org` for `Screen Capture` and `knowledge-memory` packages only. `github.com`, redirected to `release-assets.githubusercontent.com`, for Build Brand's pinned font pack and the single font files published beside it on the same release. At run time a deck or a diagram may name `cdn.jsdelivr.net` or `cdnjs.cloudflare.com` for its own assets.

`Chatterbox` reaches `pypi.org` and `files.pythonhosted.org` for its pinned packages, and `huggingface.co` with Hub storage redirects at `cas-bridge.xethub.hf.co`, `cdn-lfs.huggingface.co` or `cdn-lfs-us-1.hf.co` for its voice weights. Only its selected route's `install` opens these downloads, after a fresh supported machine check, explicit route choice and plugin install consent. Help, check, trial and synthesis never download.

## Everything a tool writes, and where

The one list; a tool's pages point here.

| What | Where | Which tools |
|------|-------|-------------|
| Build Brand's font pack | `skills/Build Brand/parts/fonts/`; download in an OS-temporary directory removed at the end, staging inside `fonts/` removed at the end | `skills/Build Brand/scripts/fonts.mjs` |
| Plugin consent marker | `.wiser-consent` at the plugin root | every tool that installs |
| Node packages | `node_modules/` in the tool's directory | the 12 tools whose `package.json` declares a dependency, Form included (development tests only); `pages-functions` is about 210 MB of them, Wrangler and its `workerd` runtime |
| npm's cache and logs | npm's configured cache, `~/.npm` by default, outside this plugin | the same 12, and the shared browser runtime |
| Python packages | `.venv/` in the tool's directory; pip's cache is switched off | `Screen Capture`, `Transcribe Audio`, `knowledge-memory` graph commands |
| Chatterbox's pinned Python environment, about 1.3 GiB | `Chatterbox/.venv/`, native CPython 3.11, including `chatterbox-tts` 0.1.7, `resemble-perth` 1.0.1 and torch/torchaudio 2.6.0, with the complete resolution in `requirements.lock`; pip cache is off and installer temporary files stay in `.venv/cache/`. An environment whose interpreter is unusable is retained under `Chatterbox/.venv-recovery/<id>/` before its replacement is created, never deleted automatically. | `Chatterbox` `install` |
| Chatterbox voice weights, about 3.0 GiB (3,191,966,992 bytes) | `chatterbox-0.1.7-5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18/` under the person-scoped `models/` base below, or under absolute `--model-cache`; all Hugging Face caches are inside that versioned folder. Hub resumes incomplete downloads; invalid completed files are fetched again with consent, never used. The whole route's disk check includes a separate 0.4 GiB caller alignment budget and an estimated 2.0 GiB install reserve. | `Chatterbox` `install` |
| Chatterbox WAV and synthesis/trial record, with runtime/JIT caches during generation | Caller-named absolute `--output` and `OUTPUT.wav.json`; a `chatterbox-runtime-*` temporary directory beside that output holds staged WAV and runtime caches, removed after success/failure. An install's local model probe uses an `install-probe-*` directory inside `.venv/`. A kill can leave temporary files or an incomplete output pair. No take registry or route setting is written. | `Chatterbox` `trial`, `synthesize`, and the `install` probe |
| Alignment engine packages, only when `align` needs them | `Transcribe Audio/.venv/`, CPython 3.9–3.13 with torch 2.8.0 and torchaudio 2.8.0 from `requirements-align.txt`; pip's cache is off. Transcription keeps its own existing requirements. | `Transcribe Audio` `align` |
| Decoded frames, redaction candidates and publish sibling | one directory in the platform's temporary directory, `wiser-screen-capture-<random>`, removed at the end of the run and after a failure; a `.wiser-screen-capture-*` sibling beside `--output`, removed once the output has its name and after a failure; either can be left by a kill | `Screen Capture` |
| HyperFrames' pinned `chrome-headless-shell` 152.0.7977.30, about 200 MB on disk | once, into HyperFrames' own cache, `~/.cache/hyperframes/chrome/`, by HyperFrames' installer, `browser ensure`, under the plugin's consent | `video-render` |
| HyperFrames' own settings, its default telemetry switch and a random install id, and its install record | `~/.hyperframes/config.json` and `~/.hyperframes/install-state.json`, written once by HyperFrames' installer when it installs the Chrome; a render never touches them, since each runs HyperFrames with a home of its own, and none sends telemetry | `video-render` |
| A run's working files: the project's copy, HyperFrames' home for that run, its PNG frames, the bridge script and the browser wrapper; the Chrome trial launch's profile | one directory in the platform's temporary directory, `wiser-video-render-<random>`, `wiser-video-frames-<random>` or `wiser-video-encode-<random>`, and `wiser-video-probe-<random>` for the trial launch, each removed at the end of the run and after a failure; a kill can leave one | `video-render` |
| An MP4 before its checks pass | a `.wiser-video-render-<random>.mp4` sibling beside `--output`, renamed to `--output` once every check passes and removed after a failure; a kill can leave it | `video-render` |
| A run's working files, its audio decoded and prepared, the joined picture and an Opus probe; and an MP4 before its checks pass | one directory in the platform's temporary directory, `wiser-video-edit-<random>`, removed at the end of the run and after a failure; a `.wiser-video-edit-<random>.mp4` sibling beside `--output`, renamed to `--output` once every check passes and removed after a failure; a kill can leave either | `video-edit` `mux`, `loudness` and `finish` |
| Speech preparation evidence, route text, words, character timings, PCM WAV and optional PCM descriptor | Only caller-named new absolute `--output`, optional `--route-text`, `--words` and `--descriptor` files outside the tool; no temporary or recovery paths are created. A failed or interrupted write may retain incomplete new files; choose fresh paths after inspecting them. | `Speech Preparation` `text`, `character-timings`, `pcm`; installs nothing |
| A render cache: each entry's MP4 and its record | the caller-named `--cache` directory, each entry written as `.wiser-video-cache-<random>` and renamed once complete | `video-render` |
| Playwright and its Chromium build | once, into `tools/lib/browser-runtime/` and Playwright's cache (`PLAYWRIGHT_BROWSERS_PATH` if set to a path; inside `tools/lib/browser-runtime/node_modules/` if set to `0`; otherwise `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux, `%LOCALAPPDATA%\ms-playwright` on Windows) | the three browser tools |
| Compatibility shims, compiled on a Linux host missing an X library | `tools/lib/browser-runtime/node_modules/.wiser-lib`; Linux only, untested there | the three browser tools |
| Person-scoped model weights (speech and Local Graph embeddings). Not work product. Not a secret. | `models/` under the platform user-config directory `gateway/SETUP.md` names (macOS `~/Library/Application Support/wiser/models/`). Transcribe Audio accepts an explicit absolute `--model-cache` and refuses the connector key file; its `--install` consent permits speech-weight downloads. A knowledge-set recipe names a basename inside models/. knowledge-memory reads files already there and never downloads them; missing graph weights stop as `missing-weights`, including with `--install`. Graph ingest on a `retrieval: embedding` recipe reads that folder too, for the tokenizer it cuts the corpus into passages with, and carries the same `missing-weights` stop on the same check, so a set whose weights are absent stops at ingest rather than at its first question. | `Transcribe Audio`, `knowledge-memory` graph embedding recall and graph ingest on `retrieval: embedding` |
| The deliverable | exactly the path the caller passes | every tool that writes one |
| English alignment weights, separate from transcription weights | `alignment-models/` under the person-scoped model base above, or under absolute `--model-cache`; the bundle supplies the filename. About 378 MB for `WAV2VEC2_ASR_BASE_960H`, MIT, from download.pytorch.org, under existing install consent. An authorized repair retains an unusable file as `.incomplete-<id>` in that folder; the native downloader's temporary file can remain after a kill. | `Transcribe Audio` `align` |
| Alignment JSON before publication | a `.wiser-align-<random>` sibling beside the caller's new `--output` file; removed after success, an existing-output refusal or a failure before its bytes are written; retained for recovery if publication fails after its bytes are written, including a failed sync or close. A kill can leave it. | `Transcribe Audio` `align` |
| A browser profile with live sign-ins, and a trace archive with cookies in it | exactly the `--profile` and `trace stop --output` paths | `Browser Control` |
| A browser profile and Browser Control's host error log for one form | one directory in the platform's temporary directory, `wiser-form-ask-<random>`, removed at the end, after failure and on SIGINT, SIGTERM or SIGHUP | `Form` `ask`, through `Browser Control` |
| A session token | `~/.wiser/browser-control/<port>.token`, outside this plugin; left behind by a kill | `Browser Control` |
| An image written back onto its input | the `--base` path, only with `--confirm` | `image compose` |
| A dated copy of a deck before an in-place edit | `--archive-dir`, or `zArchive/` beside the deck | `keynote-render` |
| A harvest bundle | the `output.directory` inside the request file, absent `--output` | `Content Harvester` |
| A knowledge store: databased SQLite or one native graph `graph.lbdb` file per dataset, at caller-named `--store` | exactly the path the caller passes as `--store`, by convention `memory/knowledge/store/` in the owning root; wiki writes no store | `knowledge-memory` |
| A classifier trial's per-run state: a trial gateway home per run, whose key file is a symbolic link to the person's key file or three empty lines, a copied synthetic root, an empty secrets directory, and a tree exported from a commit | one directory in the platform's temporary directory, `wiser-classifier-trial-<random>`, removed at the end of the run and after a stop unless `--keep-temp` | `tools/lib/classifier/trial.mjs` `run` |
| A classifier trial's records: spec, plan, runs, blind packets, scores, verdict, safety record | the caller-named `--work` directory in the owning root; a ceiling file at the caller-named `--ceiling-file` | `tools/lib/classifier/trial.mjs` |
| Wrangler's own working files while it compiles: a log, `.wrangler/tmp`, its preferences under a stand-in home directory, and its update check's cache under a stand-in temporary directory | one directory in the platform's temporary directory, `wiser-pages-functions-<random>`, removed when the run ends, including on failure | `pages-functions` |
| A knowledge set's own records: corpus, wiki or extraction, review items, reports | inside the set directory the caller passes as `--set`, at `corpus/`, `wiki/`, `extraction/`, `review/`, and `reports/` as the backend uses them | `knowledge-memory` |
| A delegate's run record: the prompt, the vendor's two output streams, the parsed report, and `status.json` (`started` with the vendor's process and group ids, then the final state) | one folder under the caller-named `--runs`, which may not sit inside this plugin; a refusal before the vendor starts writes none | `Subagent Runner` |

`copy-check` writes nothing and installs nothing: Node built-ins cover it, and every command prints one JSON object.

The gateway's writes are listed in `gateway/AGENTS.md`, Everything the gateway writes, and where.

<!-- generated:index -->

### Automation

| Tool | Description |
|------|-------------|
| `Browser Control/TOOL.md` | Drives a persistent Chromium session to read, navigate, and act on pages that need a real browser, answering every command with the page state that followed |
| `Form/TOOL.md` | Check and fill Wiser forms and draw their questions in a page that returns answers to the chat |
| `Subagent Runner/TOOL.md` | Run one builder or reviewer through a vendor command-line tool named by flags, or survey the boundary that run would use |

### Data

| Tool | Description |
|------|-------------|
| `data/TOOL.md` | Parses, describes, aggregates, joins, and charts a CSV, JSON, or TSV file, and computes a percentage, difference, or rate from two numeric fields of a JSON object |

### Documents

| Tool | Description |
|------|-------------|
| `copy-check/TOOL.md` | Count and match page copy against a ledger, a fact map, patterns, and a corpus, and return one JSON object |
| `deck-export/TOOL.md` | Writes a new reveal.js deck project on disk, from a brand template or as a self-contained starter, and renders a finished deck to a PDF or to one PNG per slide |
| `keynote-render/TOOL.md` | Builds and edits native Keynote decks from JSON or markdown SSOT, with zArchive safety before every in-place mutation |

### Knowledge

| Tool | Description |
|------|-------------|
| `knowledge-memory/TOOL.md` | Lints local knowledge wikis, builds and queries a dataset-scoped databased store (SQLite FTS5), and ingests and recalls a local LadybugDB graph, all from session-extracted knowledge with located provenance |

### Marketing

| Tool | Description |
|------|-------------|
| `tag-audit/TOOL.md` | One JSON report of which analytics and behavior tags a live page serves, with each tag's id where the served HTML exposes it; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before any fetch, the same screen `sitemap` `fetch` applies |

### Media

| Tool | Description |
|------|-------------|
| `Chatterbox/TOOL.md` | Synthesize local English speech from supplied text and a reference recording, with a sample layout and timed route trial |
| `Contact Sheet/TOOL.md` | Write one self-contained HTML page of numbered options to pick from or whole brand boards, from local assets and licensed fonts |
| `icon-set/TOOL.md` | Searches two pinned open-source sets, Phosphor 2.1.1 (MIT) and Health Icons 2.0.0 (CC0 icons, MIT package), and writes one icon recoloured at the caller's size as an SVG file or a fragment to place inside a drawing |
| `image/TOOL.md` | Applies local edits to an existing image or composites an overlay over a base image, and writes the result as a PNG, JPEG, or WEBP |
| `render/TOOL.md` | Renders a local HTML file to a PNG or JPEG, an SVG or a Mermaid diagram to a PNG, and captures a PNG of a live web page; a `--url` that points at a loopback, private-range, link-local, or cloud-metadata address is refused by name before the browser is launched, the same screen `sitemap` `fetch` applies |
| `Screen Capture/TOOL.md` | Captures and drives a macOS app window, redacts PNG stills and recordings, and checks every written frame for email-shaped text and declared terms |
| `Speech Preparation/TOOL.md` | Prepare marked speech text, original-spelling character timings and a verified signed 16-bit PCM sample clock |
| `Transcribe Audio/TOOL.md` | Transcribes an audio file or aligns known English words to its sample clock on this machine |
| `video-render/TOOL.md` | Renders one local HTML page whose motion answers the tool's seek to a picture-only MP4, a PNG sequence, or stills at named times, the same frames on every run at a set worker count, under one pinned HyperFrames, with a cache keyed over every input |
| `video-edit/TOOL.md` | Edits a video with FFmpeg and writes the result where the caller names, covering trim, resize, speed, text overlay, audio removal, concatenation, frame extraction, GIF conversion, narration laid onto a silent video, loudness set to a named level, and one encode of joined scenes to YouTube's recommended settings |

### Research

| Tool | Description |
|------|-------------|
| `Content Harvester/TOOL.md` | Turns one harvest request into a timeboxed, deduplicated, ranked bundle of source candidates with a record of what was rejected and what failed |

### SEO

| Tool | Description |
|------|-------------|
| `seo-data/TOOL.md` | Consolidates Search Console and Analytics results for one site and date range into one audit dataset, and turns Search Console query rows into a keyword report of top performers, opportunities, trends, cannibalization, and target-keyword standings |
| `seo-page-analyzer/TOOL.md` | Reports one page's on-page SEO elements from caller-supplied HTML, each element with its measurements and the checks it failed |
| `site-crawl/TOOL.md` | One JSON inventory of the URLs a bounded polite crawl can reach from one start URL |
| `sitemap/TOOL.md` | One deterministic snapshot of the URLs a site publishes in its sitemaps, and one JSON report of what changed between two snapshots of the same site |

### System

| Tool | Description |
|------|-------------|
| `reference-check/TOOL.md` | Return a JSON scan of path-shaped and family-name references under --root, or take and restore an approved structural snapshot |

<!-- /generated:index -->

### Web

| Tool | Description |
|------|-------------|
| `pages-functions/TOOL.md` | The three files Cloudflare Pages takes for a site's functions folder, compiled offline |

## Structural recovery writes

| Tool command | Writes |
|--------------|--------|
| `reference-check` snapshot `take` | Caller-named disjoint snapshot directory, manifest and eligible copies, outside the tool; `reference-check/snapshot.md` |
| `reference-check` snapshot `restore` | Approved paths under the caller-named target only; same contract |

`reference-check scan`, snapshot `verify`, snapshot `g3` and help write nothing and install nothing.
