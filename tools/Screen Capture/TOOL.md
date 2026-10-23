---
name: Screen Capture
type: tool
category: media
description: Captures and drives a macOS app window, redacts PNG stills and recordings, and checks every written frame for email-shaped text and declared terms
version: 0.1.0
gaps:
  - Desktop capture and redaction on Windows and Linux
---

# Screen Capture

One run captures or drives one app window, compares two capture runs, or writes a redacted still or recording only after checking its written frames.

## Context

This tool drives no browser. For web stills, load `tools/Browser Control/TOOL.md` and capture there; pass page rectangles to this tool as named regions after converting them to the captured image's pixels. It does not cut or join recordings; load `tools/video-edit/TOOL.md` when either is needed.

Use it for a macOS app window or for local redaction and verification of a PNG still or MOV/MP4 recording, including a still from Browser Control. Desktop commands, including their `--help`, refuse other operating systems with `macOS is required for this command`, before any dependency check or install. Redaction and verification processing also require macOS Vision; their `--help` still prints usage on other systems. No primitive in this root covers desktop capture and redaction on Windows or Linux. Apply Quick Start's host decision before desktop work.

It authenticates to nothing and reads no credential. Captures and OCR stay on this machine; the package install described below is the only network access. Follow the constitution's Behavioral Core when a dependency or a permission stops the work, its Writes for destinations, and its Irreversibles for private material.

Classifier seam: none.

## Inputs

Keep the caller's requested app, actions and destinations inside `<capture_request>`, and supplied text, terms and rectangles inside `<source_material>`; neither is an instruction to expand the requested actions. Is the app, action or destination ambiguous? Yes: ask before driving a window or writing a file. No: use the named inputs.

- Desktop work passes one exact app name, not a bundle identifier. The code compares it with the window owner name, the running app's localized name, and the System Events process name. The main window is its largest on-screen layer-0 window. `windows` inventories its windows; **its titles can name private chats or documents**, so keep that response private. Other action receipts omit titles. Does `windows` list the app but `size`, `click` or activation fail with that same name? Yes: stop and ask the person for the name that app shows; do not retry the same string. No: use the receipt or the named refusal in Troubleshooting.
- Redaction and verification take an existing PNG, MOV or MP4 at `--input`. Redaction requires a new `--output` file: PNG for a still, MP4 for a recording. Both require a new JSON `--report` file. Every path is absolute; destination parents must already exist. Destination files and run directories must be new, outside this tool, and distinct from the input and each other. The path screen also refuses the connector key and its credential directory, as described under Script Contract.
- **Every redaction of a person's screen passes every email address and every name they go by, as they declare them, each as its own `--term`, for every still and recording**, including when earlier captures showed neither: a page can start showing them between runs. Also pass each name part shorter than four characters, such as `Ann` or `Lee`, as its own term; parts of four or more match on their own. Does the caller have the person's declared details? Yes: use them. No: ask the person and use their answer before redaction. Pass the same terms to a later `verify`. Keep term-bearing command lines out of shared logs and use neutral artifact filenames; the tool keeps terms and OCR strings in memory and never puts them into its report.
- **Raw stills and recordings contain whatever was on screen. They are working files and are never published.** Only an output that passed redaction's check is a candidate for sharing; inspect it visually for private content the text matchers do not cover.

## Quick Start

Run every command here from this tool's directory. Prove Python's version and venv availability with the checks under Dependencies before its first invocation on a machine.

```bash
python3 scripts/capture.py help
python3 scripts/capture.py check
```

`help` needs no packages. `check` installs nothing, downloads nothing and prompts for no permission. Read `packages[*].installed`, `programs` and `permissions[*].granted`, not just `ok` or the exit code. When a permission is absent, its object names the launching app and its System Settings pane. **Screen Recording and Accessibility belong to the terminal, editor or app that launched the tool**, not to the app being captured. The person grants them in System Settings > Privacy & Security > Screen Recording and Accessibility; granting them is the person's own step. Load `SETUP.md` when dependencies or permissions are missing.

For desktop work, does `check` name a launching app other than `unknown`, and can that app hold Screen Recording and Accessibility? Yes, on a native macOS host: continue with setup. No, because it names no app, names `unknown`, the app cannot hold both permissions, or the host is a sandbox such as Cowork: stop and say this host is untested for this tool.

With that setup complete, capture a raw still, then redact it. Replace the example paths with fresh absolute paths in the owning root, filed per `standards/conventions.md`, and replace the made-up terms with the person's own.

```bash
python3 scripts/capture.py still --app TextEdit --output /path/to/work/raw.png
python3 scripts/capture.py redact --input /path/to/work/raw.png \
  --output /path/to/work/redacted.png --report /path/to/work/redaction.json \
  --term 'riley.q@example.org' --term 'Riley Quintero'
python3 scripts/capture.py verify --input /path/to/work/redacted.png \
  --report /path/to/work/verification.json \
  --term 'riley.q@example.org' --term 'Riley Quintero'
```

Does the run stop with `packages missing`? Yes: put its consent report to the person, then re-run that command with `--install` on their yes, per `tools/RUNNING.md`. No: read its JSON result or the named refusal in Troubleshooting. A failed redaction check leaves no file at `--output`; inspect the report's `hits` and follow the repair decision under Redaction and its limits.

## Dependencies

Python is this tool's declared interpreter under the Script Contract's Runtimes clause. These dependencies are system programs, not installed by the tool. For a failed check, follow `standards/script-contract.md` System dependencies; load `SETUP.md` for preparation and `NOTICE.md` for the resolved package snapshot.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Python 3.9 or newer with venv and compatible pinned wheels | Every command; the measured interpreter copies are 3.9.6, 3.11.15 and 3.14.7 | `python3 -c 'import sys; print(sys.version.split()[0]); sys.exit(sys.version_info < (3, 9))'` prints the version and exits 0, and `python3 -m venv --help` prints usage |
| FFmpeg | Decode video for redact/verify; encode redacted video, with `libx264` support | `ffmpeg -version` succeeds; for video redaction, `ffmpeg -hide_banner -encoders` lists `libx264` |
| ffprobe, supplied with FFmpeg | Read back colour tags after video redaction | `ffprobe -version` succeeds |
| Tesseract | Second OCR engine for redact/verify, stills included | `tesseract --version` succeeds |
| screencapture, shipped with macOS | Still and recording capture | `command -v screencapture` succeeds |

`check`'s `programs` booleans report presence on PATH, except `ffmpeg_libx264`, which asks FFmpeg for its encoders. A video redaction refuses before package installation when that encoder is absent. The survey does not try a decode or OCR run. It also reports each required package pin in this interpreter's tool-local `.venv`. The packages are PyObjC 11.1 (core, Cocoa, Quartz, CoreML, Vision), Pillow 11.3.0, and NumPy 2.0.2 below Python 3.11 or 2.3.5 from Python 3.11 onward. Desktop commands other than `check` and `size`, and both file-processing commands, require this cache, including `compare`.

## Configuration

None: no account, credential file or sign-in. Permissions are described at Quick Start. Package consent follows `tools/RUNNING.md`: `--install` answers for this plugin copy, and `WISER_ALLOW_INSTALL=1` authorizes an unattended install. It fetches roughly 100 MB from `pypi.org` and `files.pythonhosted.org`, into this tool's `.venv`, with pip's download cache off. It accepts binary wheels only; an unsupported interpreter stops rather than compiling. Use the same interpreter for the copy's checks and commands. The full write inventory is `tools/AGENTS.md`.

## Usage

Prefix each command below with `python3 scripts/capture.py`. Each flag belongs only to the commands named. Values follow their flag as a separate argument; unknown flags, positional extras and repeated single-use flags are refused. Only `--term` and `--region` repeat.

| Command | Required arguments and purpose |
|---------|--------------------------------|
| `help` | Print the complete usage; no extra arguments |
| `check` | Survey this interpreter, packages, programs and permissions; never install |
| `windows --app [name]` | List that app's on-screen windows and its main window id |
| `size --app [name] --width [n] --height [n]` | Size its front window; optionally position it with both `--x` and `--y`; read back bounds and confirm it is the main window |
| `click --app [name] --x [n] --y [n]` | Move, pause 0.12 seconds, press the left button, pause 0.06 seconds and release |
| `move --app [name] --x [n] --y [n]` | Move the pointer; use `--park` instead of both coordinates to park it |
| `key --app [name] --key [name]` | Send one supported key without modifiers |
| `still --app [name] --output [file.png]` | Capture the main window by its id, without a shadow |
| `record --app [name] --seconds [n] --output [file.mov]` | Record one window by its id, pointer shown, at the rate screencapture writes |
| `run --recipe [file.json] --output [new directory]` | Validate and execute one recipe, writing raw stills and a receipt |
| `compare --a [run directory] --b [run directory]` | Compare matching raw still ids in two existing run directories; write no artifact |
| `redact --input [file] --output [file] --report [file.json]` | Redact a PNG or MOV/MP4, then check the written candidate before releasing the output |
| `verify --input [file] --report [file.json]` | Check a PNG or every frame of a MOV/MP4 as written; change no input |

| Flag | Commands and effect | Default / bounds |
|------|---------------------|------------------|
| `--app [name]` | windows, size, click, move, key, still, record: exact app name | Required; nonblank, no control characters |
| `--width [n]`, `--height [n]` | size: window dimensions in points | Both required; positive integers |
| `--x [n]`, `--y [n]` | size: global position in points; click/move: window-relative point | size: omitted keeps position, or give both signed integers. click/move: both finite and nonnegative, strictly below width/height |
| `--park` | move: pointer 60 points left of the window at its vertical middle | Off; mutually exclusive with coordinates |
| `--key [name]` | key: one of `escape`, `return`, `tab`, `space`, `up`, `down`, `left`, `right` | Required; lowercase; no modifiers or arbitrary typing |
| `--seconds [n]` | record: native recording duration | Required; finite number greater than 0, at most 600 seconds |
| `--recipe [path]` | run: readable JSON file | Required; absolute, resolved extension `.json` |
| `--a [path]`, `--b [path]` | compare: existing run directories, each containing `raw/` | Both required; absolute |
| `--input [path]` | redact, verify: existing source file | Required; absolute, resolved extension `.png`, `.mov` or `.mp4` |
| `--output [path]` | still: new PNG; record: new MOV; run: new directory; redact: new PNG for a still or MP4 for video | Required for those commands; absolute; parent exists; outside this tool |
| `--report [path]` | redact, verify: new JSON report | Required; absolute; parent exists; outside this tool |
| `--term [text]` | redact, verify: email address or name to find; repeat as Inputs requires | None; each nonblank; matching described below |
| `--region [x,y,w,h]` | redact only: exact rectangle in the decoded frame's pixels, bypassing fitting, on every frame; a still uses the image's own pixels | None; repeatable; nonnegative integer x/y, positive integer width/height, entirely within the input frame |
| `--fps [n]` | redact only, recordings only: decode and output rate | 30; finite positive number. verify takes no rate flag |
| `--install` | windows, click, move, key, still, record, run, compare, redact, verify: authorize the pinned package install and finish the command | Off; refused by check, size and help |
| `--help` | Print full usage before dependency checks; a desktop command on another operating system gives the macOS refusal first | Off; top-level alias for help; extra unknown flags are still refused |

### Driving a window

Coordinates for clicks and moves are **window-relative points**, measured from its current top-left corner after activation. To convert a window-relative rectangle to captured-image pixels, multiply its x and width by the image's pixel width divided by the capture receipt's `bounds.width`, and its y and height by the image's pixel height divided by `bounds.height`. Supply integer pixel rectangles to `--region`. `size` alone uses global coordinates for position. Width and height exclude points on the right and bottom edges.

The tool activates the app before pointer and key actions. Before each pointer event inside the window, it reads the app's focus again and hit-tests that point against the front-to-back window list, including the menu bar, Dock and notifications. A covering window refuses the action. Parking is outside the window by design and checks focus only. A pressed mouse button or key is always released, including on interruption or lost focus, with a fallback release sent to that app alone.

A recipe key is refused when the selected window is no longer the app's largest layer-0 window. Otherwise it goes to the app's **focused window**, a dialog included, while the app is frontmost; a key has no coordinate hit test. A click requires that selected window to be on top at the point, so a menu or sheet the app opened over it refuses the click. Has a menu, sheet or dialog opened by the app changed the main window or covered the click point? Yes: stop and ask the person to operate that window, or change the recipe before retrying. No: continue with the selected window and the current bounds. Use `move --park` or a recipe's `park` step before a capture to keep the pointer outside the captured window; recordings otherwise show it.

### Recording a walkthrough

Does the job need the window driven while it is recorded? Yes, and the steps can be scripted: start `record` in the background for the walkthrough's length, drive the window with a `run` recipe or single commands while it records, then wait for `record` to exit and read its result before redaction. Yes, and a person will drive: tell them the duration first, then run `record` while they drive and wait for it to exit. No: capture stills with a `run` recipe. A recipe itself has no recording step.

### Recipe JSON

```json
{
  "app": "TextEdit",
  "window": {"width": 900, "height": 650, "x": 100, "y": 80},
  "steps": [
    {"click": [120, 90]},
    {"move": [140.5, 100]},
    {"key": "escape"},
    {"park": true},
    {"wait_ms": 250},
    {"still": "after-dialog"}
  ]
}
```

The top-level object requires `app` and `steps`, accepts only optional `window`, and forbids duplicate JSON keys. `steps` is a list, which may be empty. Optional `window` requires numeric positive integer `width` and `height`; signed integer `x` and `y` are optional together. No strings or booleans stand in for numbers. When `window` is present, sizing runs before the listed steps and counts as step 1 in `run.json`, in the receipt's `steps` count, and in `recipe stopped at step N`. Without `window`, step 1 is the first listed step.

Each step has exactly one of these keys, with no other fields:

| Step | Value and bounds |
|------|------------------|
| `click` | Two numeric, finite, nonnegative window-relative points `[x,y]`; current bounds checked at execution |
| `move` | Same coordinate format and bounds as click |
| `park` | Literal `true` |
| `key` | One lowercase key from the flag's closed set |
| `wait_ms` | Integer from 0 to 60000 inclusive, not a boolean |
| `still` | Unique id, case-insensitive across the recipe; 1 to 80 ASCII letters, digits, hyphens or underscores, starting with a letter or digit |

The whole recipe is validated before any install, directory creation or action. During execution, it writes `raw/<id>.png` and `run.json`. Each attempted step records its kind, status and result; still steps also record file and RGBA-pixel hashes and window geometry. The recipe's window id is the one selected by sizing, or by the first window action when sizing is absent; a later window action refuses when that id changes. A refused step stops later steps and leaves the receipt and any earlier raw captures for diagnosis; correct the recipe or app state and retry in a new directory.

### Redaction and its limits

Vision reads every decoded frame in English (`en-US`), finding email-shaped text and the declared terms. Unknown email addresses tolerate some OCR punctuation confusion. A shortened email address with its ending cut off is found only when a cut-off mark remains: an ellipsis, two or more dots, or one dot ending the line. A bare line ending is not a cut-off mark.

Terms fold case and whitespace, and fold `0` to `o` and `1`/`|` to `l`. An email address term matches whole and as its local part, domain and `@` plus the first domain component. A fragment shorter than four characters matches only as a word of its own; fragments of four or more can match inside words. A name matches whole and as whitespace-separated parts of at least four characters, with word boundaries. This is not general name recognition. Postal addresses, phone numbers and pictures are not automatically found; cover them with `--region` or the visual check. Undisclosed names, other private text and OCR misses may remain. A `name@marketplace` plugin identifier can be read as an address and blurred when it has a dotted ending, such as `name@marketplace.example`, or a cut-off mark. A bare `name@marketplace` is not automatically an address match; pass it as `--term` or cover it with `--region` when it must be hidden.

The tool carries a found box forward and backward while the share of its ink that changed stays below 0.35, merges boxes when their overlap is at least half the smaller box, fits them to ink, and extends coverage three frames on either side. A pointer that changes a box past that limit ends the carry. Will the planned pointer motion cross private text? Yes, and that motion can be omitted: use `move --park` before recording. Yes, and the walkthrough needs that motion: cover the text with `--region`. No: proceed with the planned capture. The tool replaces each run with letter-like strokes generated from the box's size and colours alone, then softly blurs that replacement; original letter shapes do not seed those strokes. Named regions bypass fitting and apply on every frame in the decoded input frame's pixels; for a still, these are the image's own pixels. Use the conversion under Driving a window for rectangles measured in window-relative points.

Recordings are resampled to `--fps` for redaction. The output is silent H.264 MP4, padded on the right/bottom to even dimensions if needed, with square pixels. The encoder asks for BT.709; `colour_tags` reports what was read back after encoding and any re-tag, even if the final tags still differ. Do `color_space`, `color_transfer` and `color_primaries` all read `bt709`? Yes: the video can proceed to the visual check before publishing. No: stop, report the tags and publish nothing. Resampling changes frame sampling and removes audio; it does not preserve a source recording's native rate or audio track.

Before releasing the candidate, **both Vision and Tesseract check every frame of what was written**, including encoded video artifacts. Pixel-identical frames share a reading, but every frame index remains represented. `verify` likewise reads every frame as written and takes neither `--fps` nor `--region`. On any hit, redaction writes its report and withholds `--output`; verification writes a failed report and exits 1. The report's `hits` contain zero-based frame indexes, engine, numbered match class and Vision boxes, never recognized text or terms. A Tesseract hit has no box. Can the agent see the frame a hit names? Yes: inspect it privately, draw a rectangle around the private content in the decoded input frame's pixels, and re-redact from the raw source with `--region` and fresh output and report names. No: stop, ask the person to look at that frame, and publish nothing.

## Script Contract

`scripts/capture.py` is the only entry point; the other modules are its implementation. It follows `system/templates/Script Contract.md`; the governing standard is `standards/script-contract.md` and the user's running contract is `tools/RUNNING.md`. This typed file's frontmatter and seam follow `standards/primitives.md`; instruction wording follows `standards/instruction-quality.md`.

Flags, numeric bounds, paths and complete recipe structure are checked before an install. Redact/verify check their system programs before packages; desktop capture checks screencapture when it captures. `size` uses macOS System Events through osascript without packages; macOS may additionally require Automation permission for that operation. `check` probes permissions without requesting them.

The path screen resolves symbolic links and compares hard links by filesystem identity, then uses the resolved paths. A Finder alias is its own file and is not followed. The screen does not accept existing destinations. Redaction keeps decoded frames and unchecked candidates in the temporary workspace listed in `tools/AGENTS.md`; ordinary completion, failure and handled interruption remove it, while a kill can leave it. Publishing copies a checked candidate to a `.wiser-screen-capture-*` sibling beside `--output`, then gives the output its name by a link that refuses an existing file. On a volume without link support, an exclusive create and copy also refuses an existing file. The sibling is removed once the output has its name; failure and handled interruption remove it too, while a kill can leave it. No unchecked candidate is published at the caller's output path.

## Output

Except for help text, success is one JSON object on stdout and exit 0. Failure is stderr only, stdout empty, exit 1. A check finding is a refusal for redact/verify, whereas the dependency survey `check` still exits 0 with false fields.

| Command | Receipt or artifact |
|---------|---------------------|
| `check` | `ok`, `python`, package records (`required`, `version`, `installed`), `programs`, permission objects; absent permissions also name `app` and `pane` |
| `windows` | `ok`, `windows` (id, title, layer, bounds), `main` id or null |
| `size` | `ok`, actual `bounds` in points |
| `click`, `move` | `ok`, global `point` actually used |
| `key` | `ok`, `key` sent |
| `still`, `record` | `ok`, window `id`, `bounds`, absolute `output`; raw PNG or MOV |
| `run` | `ok`, `output`, `steps` count, `recipe_sha256`; `run.json` records the steps, hashes, geometry and refusals described under Recipe JSON, whose numbering includes sizing |
| `compare` | `ok`, per-id `stills` with `same_size`, `identical`, `differing_pixels`, `box`; `only_a`, `only_b`. It compares RGBA pixels, not file hashes. Unequal sizes yield null count/box and both sizes; identical images yield zero and null box |
| `redact` | `ok`, `output`, `kind`, `frames`, `frames_with_found_box`, `frames_added_by_tracking`, region count, `check`, stage `seconds`, video `colour_tags` (null for stills), `report`, engine `versions` |
| `verify` | `ok`, `kind`, `check`, `report`, stage `seconds`, engine `versions`; no changed image/video |

A file-processing report has `ok`, `kind`, `frames`, `distinct_frames`, `hits_per_engine` and `hits`. A check with no readable match has zero counts for `vision` and `tesseract` and an empty hits list. It is a check of these matchers, not proof that all private content is absent. Report and comparison boxes are exclusive `[left, top, right, bottom]`; `--region` instead takes `x,y,width,height`. All writes are inventoried in `tools/AGENTS.md`.

## Troubleshooting

Message fragments below identify the code's stops; variable paths, flags, steps and dependency names fill the indicated placeholders. Shared running behavior is defined in `tools/RUNNING.md`.

| Message | Cause | Fix |
|---------|-------|-----|
| `unknown command` | Command is outside the command table | Read help and use a listed command |
| `unknown option` | Flag belongs to another command, an extra positional argument was supplied, or help received extras | Read that command's flags; remove the extra argument |
| `[flag] was repeated` | A single-use flag occurred twice | Give it once; only term and region repeat |
| `[flag] needs a value` | A value was absent | Supply a separate value argument |
| `[flag] is required` | A required argument was omitted | Supply it from the command table |
| `macOS is required for this command` | A command other than help ran on another operating system | Run on macOS; see the declared platform gap |
| `--app must be a nonblank app name without control characters` | Invalid app name | Use the exact macOS app name |
| `[field] has an invalid numeric value` | Nonfinite, nonnumeric, boolean or out-of-range number; for `--seconds`, this includes a negative value or one over 600 | Use the flag or recipe bounds above |
| `move needs either --x and --y or --park` | Mixed or incomplete move mode | Give both coordinates or park alone |
| `unsupported --key` | Key is outside the closed set | Use a listed lowercase key without modifiers |
| `--seconds must be greater than 0 and at most 600` | Recording duration is zero | Choose a finite duration greater than zero and at most 600 |
| `--output must resolve to .png` | Raw still destination has another extension | Use a new PNG path |
| `--output must resolve to .mov` | Raw recording destination has another extension | Use a new MOV path |
| `--recipe must resolve to JSON` | Recipe's resolved suffix is not JSON | Use a readable `.json` file |
| `recipe is not readable JSON` | Unreadable, malformed or incorrectly encoded recipe | Correct the JSON and its file permissions |
| `JSON repeats a key` | A JSON object repeats a member | Give every key once |
| `recipe needs app and steps, with optional window only` | Top-level fields do not match the schema | Use only the required fields and optional window |
| `window needs width and height, with optional x and y only` | Window shape is wrong | Give dimensions and no other fields beyond optional x/y |
| `window x and y must be given together` | One position coordinate is missing | Give both or omit both |
| `recipe window values must be numbers` | Numeric strings were used in JSON | Use JSON numbers within the stated integer bounds |
| `recipe steps must be a list` | Steps is another JSON type | Use a JSON array |
| `each recipe step must have exactly one known key` | A step has zero or several members | Use one step kind per object |
| `recipe click and move need two numbers` | Point is not a two-number array | Use `[x,y]` with numeric values |
| `recipe park must be true` | Park is false or another type | Use literal `true` |
| `recipe wait_ms must be an integer from 0 to 60000` | Wait is not a bounded integer | Use a JSON integer in range |
| `still id must be unique (case-insensitive)` | Duplicate, malformed or too-long id | Follow the id bounds and choose a new id |
| `unknown recipe step` | Step kind is unsupported | Use click, move, park, key, wait_ms or still |
| `--term is empty` | Term is blank | Supply nonblank text, or omit that term |
| `--fps must be finite and positive` | Invalid decode rate | Use 30 unless another positive rate is needed |
| `--fps applies to recordings` | A PNG was given a frame rate | Omit fps for stills |
| `--region must be x,y,w,h` | Rectangle shape or integer bounds are invalid | Use nonnegative integer x/y and positive width/height |
| `--region falls outside the image` | Rectangle exceeds the decoded input frame's dimensions | Use the input's pixels, which for a still are the image's own pixels; apply Driving a window's conversion for points |
| `--input must resolve to PNG, MOV or MP4` | Source's resolved extension is unsupported | Convert to a supported format first |
| `--output must be PNG for a still or MP4 for a recording` | Redacted destination has the wrong extension | Match the output format to the input kind |
| `input, output and report must be different files` | Paths alias one another | Choose distinct new destinations |
| `[path] must be absolute` | Relative path | Pass a full absolute path |
| `path cannot be resolved` | Unreadable ancestor or symbolic-link loop | Repair permissions or the loop, then retry |
| `path cannot be screened` | Ancestor identity cannot be inspected | Check folder permissions |
| `[path] names the connector key` | A path or hard link identifies the key | Choose a work file outside credential storage |
| `[path] is in the credential directory` | Path resolves into credential storage | Choose a work file outside it |
| `[path] identifies a file in the credential directory` | Hard link identifies a reserved file | Choose a different work file |
| `[path] cannot screen the credential directory` | Reserved directory cannot be inspected | Repair its permissions; do not bypass the screen |
| `[path] resolves inside the tool` | Destination aliases this tool | Choose a work destination in the owning root |
| `[path] already exists` | File or run directory is taken | Use a new destination; nothing is overwritten |
| `[path] parent is absent` | Destination parent does not exist | Create the declared work directory first |
| `[path] is not a readable file or directory` | Required source is absent or the wrong type | Check the source path and permissions |
| `packages missing` | This interpreter's pinned cache is absent or incomplete without consent | Show the install report and answer with install consent per Quick Start |
| `wheel install failed` | venv creation, wheel availability, permissions or install failed | Remove the named incomplete `.venv`, check `python3 -m venv`, wheel support and writability, then retry with consent |
| `the .venv interpreter is incomplete` | Cache cannot re-execute its interpreter | Remove the incomplete cache and retry an authorized install |
| `missing tesseract` | OCR program absent or version check fails | Make `tesseract --version` pass per Dependencies |
| `missing ffmpeg` | Video program absent or version check fails | Make `ffmpeg -version` pass per Dependencies |
| `ffmpeg has no libx264 encoder` | FFmpeg cannot encode redacted video with libx264 | Make `ffmpeg -hide_banner -encoders` list `libx264`, then retry |
| `missing ffprobe` | Colour readback program absent or version check fails | Make `ffprobe -version` pass per Dependencies |
| `missing screencapture` | macOS capture program is not on PATH | Make `command -v screencapture` pass |
| `Screen Recording permission is required` | Launching app lacks capture permission | The person grants the named app that permission in the named pane |
| `Accessibility permission is required` | Launching app lacks event/sizing permission | The person grants the named app that permission in the named pane |
| `window list unavailable` | macOS did not supply windows | Grant Screen Recording and retry |
| `no on-screen layer-0 window for the named app` | App has no eligible window or its name is wrong | Open its window and confirm the exact app name |
| `System Events sizing failed` | Sizing failed or macOS denied it | Apply Inputs' app-name decision first; for a permission failure, grant Accessibility and, when requested, Automation to the launching app |
| `System Events returned invalid bounds` | Sizing readback is malformed | Check Accessibility and retry |
| `window bounds differ from the requested size or position` | App rejected size/position, often its minimum size | Use dimensions the app supports |
| `the sized window is not the app's main window` | Front window and largest window differ | Close the app's other windows and retry |
| `app could not be activated` | App is not running or activation failed | Apply Inputs' app-name decision before opening the named app or retrying |
| `named app is not frontmost` | Focus changed or activation failed | Bring it forward and retry after checking state |
| `the app's main window changed during the recipe` | Another largest layer-0 window replaced the chosen id; a key is refused before sending | Follow Driving a window's menu, sheet and dialog decision; retry only with a corrected recipe or app state in a new directory |
| `another window covers that point` | Menu bar, Dock, notification or window, including the app's own menu or sheet, won the hit test | Follow Driving a window's menu, sheet and dialog decision for the app's own window; for another obstruction, clear it and recheck the target |
| `point is outside the window` | Coordinates exceed freshly read bounds | Recalculate window-relative points |
| `mouse event could not be created` | macOS failed to create an event | Check Accessibility and retry |
| `keyboard event could not be created` | macOS failed to create a key event | Check Accessibility and retry |
| `screencapture failed` | Capture program returned failure | Check Screen Recording, the window and destination |
| `screencapture wrote no file` | Capture returned no nonempty file | Check Screen Recording and retry |
| `recipe stopped at step N` | A step failed or was interrupted; numbering includes sizing as Recipe JSON states | Inspect run.json at that step, correct state or recipe, retry in a new directory; earlier actions are not undone |
| `run has no raw directory` | Compare input is not a capture run | Select a directory containing raw stills |
| `run has an invalid still id` | A raw filename violates recipe id rules | Use an unmodified run |
| `Vision cannot open a frame` | Unsupported or unreadable image bytes | Check the input image |
| `Vision OCR failed` | macOS Vision request failed | Confirm macOS supports Vision and retry |
| `Tesseract OCR failed` | Second engine could not read a frame | Check `tesseract --version` and that the frame is readable |
| `parallel OCR failed` | A worker error other than the tool's own refusal; a worker's Vision, Tesseract or frame-size refusal reaches the caller by its own message | Check pinned packages and readable input frames; use the specific message's row for the tool's own refusal |
| `[operation] could not start` | Video decode, encode or colour operation could not launch | Check `ffmpeg -version` and `ffprobe -version` |
| `[operation] failed` | Decode, encode, colour-tag readback or re-tag returned failure | Check format, directory permissions, disk space and FFmpeg's libx264 support |
| `video decoded to zero frames` | Empty video or unsuitable decode rate | Check duration and redaction fps; verify accepts no fps |
| `frame dimensions changed` | Recording dimensions vary | Normalize dimensions before redaction |
| `encoded video frame count changed during decode` | Written candidate lost or gained frames | Output is withheld; check FFmpeg and retry |
| `redaction check found readable content` | Written candidate still matched | Output is withheld; inspect report `hits` and follow the repair decision under Redaction and its limits |
| `output check found readable content` | Verify found a match | Inspect report `hits` and follow the repair decision under Redaction and its limits |
| `--output appeared during the run` | Another writer took the name | Choose a fresh output and report name |
| `processing failed or was interrupted` | Unhandled file, native or interruption error; its body is suppressed | Check input, package cache, permissions and disk space, then retry |

## Success

- `help` prints complete usage and exits 0 without packages or configuration.
- `check` exits 0 with one JSON object, creates no cache or permission prompt, and identifies every absent permission's app and pane. Read its booleans to judge readiness.
- A capture writes a nonempty new raw file; a recipe's `run.json` contains the attempted steps and still hashes and geometry described under Recipe JSON, and a refusal records the failed step without running later ones.
- A compare reports zero differing pixels and null box for identical stills, a pixel count and exclusive box for changed stills, null counts for changed sizes, and missing ids separately.
- A redaction of a synthetic still or recording containing the supplied address and names writes a new output, exits 0 with parseable JSON, and reports zero hits from both engines on every written frame. A subsequent verify with the same terms also passes.
- A positive-control input whose private text is left readable makes verify exit 1 with stdout empty and a failed report; a failed redaction check withholds the output. Neither report persists recognized text or terms.
- An unknown flag, invalid recipe or invalid path refuses before install or action. An existing destination is never replaced, and a focus or hit-test failure never proceeds with the intended press; a button already pressed is released.
- Raw captures stay private. Can the agent inspect the checked output visually? Yes: inspect it for private content outside text matching before sharing. No: stop, ask the person to look, and publish nothing.
