---
name: mermaid-to-png
type: tool
category: media
description: Renders a Mermaid diagram file to a PNG drawn at the diagram's own size up to a maximum width, in a chosen theme, background, and device scale factor
version: 0.1.1
---

# mermaid-to-png

One PNG of the diagram a Mermaid file describes, written where the caller says.

## Context

Use it whenever a Mermaid diagram has to become an image: a flowchart bound for a deck or a document, a sequence diagram in a report, a Gantt chart in a plan, a diagram regenerated because its source text changed. It takes diagram source and gives back pixels; deciding which diagram to draw, and writing the Mermaid for it, belongs to whatever skill called for the picture.

Do not use it on markup that is not Mermaid. An SVG file goes to `svg-to-png`, an HTML page to `html-to-png`, and a page that is live on the web to `web-screenshot`. Mermaid inside a fenced block in a markdown file is not an input either: extract the diagram to its own file first, because this tool reads the whole file as one diagram. Do not reach for it to change an image that already exists; that is `image-edit` and `image-overlay`.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the one file the caller names and writes the one file the caller names.

## Sizing

A diagram is drawn at the size the renderer computes for it, then capped. Natural width above `--width` scales the whole drawing down to fit, proportions intact; natural width below it leaves the drawing alone, and the PNG comes out only as wide as the diagram rather than padded to the cap. Diagram types that lay themselves out against the space they are given, a Gantt chart most visibly, take the full `--width`, so that option sets the shape of the result and not only its ceiling.

`--scale` is separate and applies last: it multiplies device pixels, never layout. At the default of 2, every CSS pixel becomes two image pixels, so a diagram measuring 450 by 355 writes a 900 by 710 PNG of the same drawing at twice the resolution. Text does not reflow and nothing moves when `--scale` changes; only the pixel count does. The `width` and `height` in the result are read back out of the written PNG, so they are what the file holds.

## Quick Start

```bash
node scripts/render.js help
```

Usage text, with nothing installed.

```bash
node scripts/render.js render --file /path/to/a/work/directory/flow.mmd --output /path/to/a/work/directory/flow.png
```

The first real run installs this tool's dependencies and asks for a re-run; the second does the work and prints one JSON object:

```
{"path":"/path/to/a/work/directory/flow.png","width":312,"height":996,"scale":2,"maxWidth":800,"theme":"neutral","background":"white"}
```

Anything else, see Troubleshooting.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Chromium | `render`, which draws the diagram in a browser engine | `npm run check:chromium` exits 0 with `"chromiumLaunch":true` |

Presence is a **trial launch** via the shared browser-runtime (`scripts/lib/browser-runtime.js`), not a path on disk. Missing OS libraries are self-healed in userspace where a C compiler is present; otherwise the check names the library and the one next step. Install steps are never written here. The Mermaid renderer itself is an npm package and installs with the rest.

## Usage

| Command | Purpose | Launches a browser |
|---------|---------|--------------------|
| `node scripts/render.js help` | Print usage and exit | No |
| `node scripts/render.js render --file <path> --output <path>` | Render the diagram and write the PNG | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--file <path>` | The Mermaid diagram to render, an absolute path | None; required |
| `--output <path>` | Where to write the PNG, an absolute path ending in `.png`, outside this tool's directory | None; required |
| `--width N` | Maximum diagram width in CSS pixels, before `--scale` | 800 |
| `--scale N` | Device scale factor: image pixels per CSS pixel | 2 |
| `--theme NAME` | `default`, `neutral`, `dark`, or `forest` | `neutral` |
| `--background C` | Background color, as a color word or a hex value, or `transparent` for none | `white` |
| `--timeout MS` | How long the diagram has to render before the run gives up | 10000 |
| `--overwrite` | Replace a file already at `--output` | Off; an occupied path is refused |
| `--help` | Print usage and exit | Off |

One diagram per run. Both paths are file paths, absolute and named: `--file` is the diagram to read and `--output` is the PNG to write, never a directory either way, since a relative path resolves against whatever directory the caller happened to be in. There is no default output location: ask which directory the result belongs in rather than choosing one, and pass a work directory in the owning root per `standards/conventions.md`.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help and argument checks answered before the dependency install, the system dependency check on the command that needs it, and the stdout and stderr rules. The sections above state what the command does; the contract states how the script behaves getting there.

Two of its rules do visible work here. Nothing is written but the PNG the caller named and the first-run install, so an `--output` resolving inside this tool's own directory is refused rather than written. And no message repeats the renderer's or the browser engine's own text: a Mermaid parse error quotes the file it was given, which is a file this tool will read wherever it is pointed, so only the line number crosses back out to the caller.

The diagram reaches the page as text through the DOM and the renderer is attached from this tool's own `node_modules`, so a diagram file cannot close an element or open a script of its own, and a render fetches nothing from anywhere.

## Output

One JSON object on stdout, exit 0, when the PNG was written.

| Field | Carries |
|-------|---------|
| `path` | The absolute path of the PNG, as written |
| `width` | The PNG's width in pixels, read from the file |
| `height` | The PNG's height in pixels, read from the file |
| `scale` | The device scale factor applied |
| `maxWidth` | The `--width` cap the layout was given |
| `theme` | The theme rendered |
| `background` | The background rendered |

Missing parent directories of the output path are created, so a dated folder that does not exist yet is not a reason to fail. A file already at that path is not replaced: the run refuses, naming the path and `--overwrite`, and refuses early enough that nothing is installed and no browser opens. Passing `--overwrite` replaces it. A run that fails writes no PNG at all, so a stale file never masquerades as a fresh render.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `npm ci failed` | Node missing or older than 18, or the directory is not writable | Confirm `node --version` is 18 or newer, delete `node_modules/`, run `npm ci` here by hand |
| `the Mermaid renderer is missing at <path>` | The install ran but left the renderer out | Confirm `package.json` lists `mermaid`, then run `npm ci` in this directory |
| `Chromium cannot launch` | Binary missing, launch blocked, or OS library gap | Follow the `remediation` line from `npm run check:chromium` |
| `the diagram did not parse; the renderer stopped at line N` | Mermaid syntax the renderer rejected | Fix that line in the source file. Only the line number is reported, by design; the renderer's own message quotes the file back |
| `the diagram did not parse` with no line | The file holds no recognizable diagram type | Confirm the first line names one, such as a graph, sequence, or gantt declaration |
| `the diagram parsed but did not finish rendering within <n> ms` | The render budget ran out | Raise `--timeout`; if a Mermaid preview draws the diagram at once, re-run the Dependencies check |
| `rendering <path> failed in the browser` | The engine failed after the diagram parsed | Confirm the diagram renders in a Mermaid preview; if it does, re-run the Dependencies check |
| `<path> already exists` | A file is at `--output` and replacing it was not asked for | Pass `--overwrite` to replace it, or name a path nothing holds yet |
| `the diagram rendered but <path> could not be written` | The output path is not writable by this process | Pass a work directory in the owning root |
| `--output resolves inside this tool directory` | The output path landed in the shared root | Pass a work directory in the owning root |
| `--output must end in .png` | An extension that does not match what is written | Name the file `.png`; only PNG is produced |
| `--file must be absolute` or `--output must be absolute` | A relative path was passed | Pass the absolute path |
| `unexpected argument "<value>"` | A path was passed positionally | Every value is passed by name: `--file` and `--output` |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `no file at <path>` | The path given to `--file` does not exist | Check the path; an absolute one cannot be misread |
| `<path> is empty` | The file holds no diagram | Point `--file` at the file that has the source in it |
| The PNG is narrower than `--width` | Expected: the diagram's natural width was below the cap | `--width` is a ceiling, not a target; a padded frame would be whitespace |
| The PNG is larger than `--width` in pixels | Expected: `--scale` multiplies afterwards | Divide by `--scale` to compare against the cap, or pass `--scale 1` |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- A render exits 0 with one parseable JSON object on stdout, and the `width` and `height` in it are the written PNG's own.
- A missing, relative, non-PNG, or inside-the-tool path, and an unnamed positional argument, each exit 1 with the cause on stderr and stdout empty, and trigger no dependency install.
- An `--output` that already exists exits 1 naming the path and `--overwrite`, before any install and before a browser opens, and leaves that file untouched; the same run with `--overwrite` replaces it.
- A missing parent directory of `--output` is created rather than refused.
- `--timeout` bounds the wait for the diagram to appear, defaults to the 10 second budget, and a run that exhausts it says so and names the flag rather than reporting a browser failure.
- A diagram that does not parse exits 1 naming the line number and nothing else from the renderer, and writes no file.
- `--scale` changes resolution only: the same diagram at 1 and at 2 differs in pixel count and in nothing else. `--width` changes layout: a diagram wider than the cap scales down, a narrower one is not padded out to it.
- No run opens a network connection; the renderer loads from this tool's own `node_modules`.
- No run writes any file other than the PNG the caller named and the first-run dependency install in this tool's own directory.
