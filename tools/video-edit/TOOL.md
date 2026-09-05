---
name: video-edit
type: tool
category: media
description: Edits a video with FFmpeg and writes the result where the caller names, covering trim, resize, speed, text overlay, audio removal, concatenation, frame extraction, and GIF conversion
version: 0.1.2
---

# video-edit

One video, image sequence, or GIF, written where the caller said, holding what FFmpeg made of the video files the caller named.

## Context

Use it when a video already exists and has to come out different: cut to a range, resized to a platform's frame, sped up or slowed down, captioned with a line of text, stripped of its audio, joined end to end with other clips, sampled into stills, or turned into a GIF for somewhere that will not play video. It is the finishing pass after footage arrives, whatever produced it.

Do not use it to produce video from a description or from a still image; that is generation, it costs money per call, and it routes through `Media Generator`. Do not use it to pull words out of a recording, which is transcription, or to work on a still image, which the image tools do. It decides nothing about the edit: it applies the operations it was given, in the order below, and reports what it wrote.

It authenticates to nothing, holds no credential, reaches no other primitive, and opens no network connection. Every input is a local file that must already exist, which is also what keeps an address out of FFmpeg's hands.

## Quick Start

```bash
node scripts/edit.js help
```

Usage text, on a copy with nothing installed.

```bash
node scripts/edit.js edit \
  --input /path/to/a/work/directory/raw.mp4 \
  --output /path/to/a/work/directory/cut.mp4 \
  --trim-start 5 --trim-end 15 --width 1280 --height 720
```

```
{"output":"/path/to/a/work/directory/cut.mp4","operations":["trim","resize"],"audio":"kept","bytes":184320}
```

Anything else, see Troubleshooting.

## Dependencies

FFmpeg is a separate program, not an npm package, so it is checked rather than installed. Each check runs after help parsing and only on a command that needs it; missing, the run fails by naming the dependency and its check command. Install steps are never written here; when a check fails the agent derives them from FFmpeg's own current documentation, per the Script Contract's System dependencies clause.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| FFmpeg | Every command | `ffmpeg -version` succeeds |
| A drawtext-capable FFmpeg build with a resolvable font | `edit --text` only | `ffmpeg -f lavfi -i color=c=black:s=32x32:d=1 -vf drawtext=text=x -frames:v 1 -f null -` exits 0 |

The second row is the same program in a narrower condition: a build without freetype, or a machine with no font FFmpeg can resolve, runs every other command and fails only on the overlay. It is checked separately so that failure arrives before the pass rather than inside it.

This tool imports no npm package, so there is no package install and no consent prompt; Node and FFmpeg are the whole of what it needs.

## Operations

`edit` takes any combination of operations and applies them in one FFmpeg pass, in this fixed order. The order is what makes combinations predictable: a resize before an overlay means the text is drawn on the resized frame at a fixed size, not scaled with it.

| Order | Operation | Options | What it does |
|-------|-----------|---------|--------------|
| 1 | Trim | `--trim-start`, `--trim-end` | Keeps the range between the two, in seconds, and discards the rest |
| 2 | Resize | `--width`, `--height` | Scales the frame to exactly those pixels, aspect ratio not preserved |
| 3 | Speed | `--speed` | Multiplies playback rate; below 1 slows down, above 1 speeds up |
| 4 | Text | `--text`, `--text-position` | Draws one line in white with a black outline, at a fixed 50 pixel size |
| 5 | Remove audio | `--remove-audio` | Drops the audio track |

Trim selects the input window, so everything after it sees only the kept range: `--trim-start 0 --trim-end 10 --speed 2` gives about five seconds of output, not ten. Durations land within a frame or so of the arithmetic, because a container rounds to whole frames and an encoder pads its tail.

Audio follows the speed change while a factor stays between 0.5 and 2.0. Outside that range the audio filter cannot follow, and the track is dropped rather than left out of sync; the JSON reports `audio` as `removed` so a caller can see it happened.

Text is drawn horizontally centered, and `--text-position` chooses the vertical band: `top` sits 50 pixels down, `bottom` sits 100 pixels up from the bottom, `center` is the middle. A caller's text is escaped for both parsers FFmpeg runs it through, so a colon, an apostrophe, a comma, a percent sign, or a bracket is drawn rather than read as part of the filter.

The other three commands are single operations and take no part in this chain. `concat` joins whole files, `frames` samples stills, and `gif` converts; none of them trims, resizes, or captions on the way.

## Usage

| Command | Purpose | Writes |
|---------|---------|--------|
| `node scripts/edit.js help` | Print usage and exit | Nothing |
| `node scripts/edit.js edit --input <path> --output <path.mp4>` | Apply one or more operations to one video | One MP4 |
| `node scripts/edit.js concat --input <path> --input <path> [...] --output <path.mp4>` | Join two or more videos in the order given | One MP4 |
| `node scripts/edit.js frames --input <path> --output <dir>` | Sample stills into a directory | `frame_0001.png` onward |
| `node scripts/edit.js gif --input <path> --output <path.gif>` | Convert a video to an animated GIF | One GIF |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--input <path>` | Video to read, absolute, and it must exist. Repeat it for `concat` | None; required |
| `--output <path>` | File to write for `edit`, `concat`, and `gif`; the directory to fill for `frames`. Absolute | None; required |
| `--trim-start <s>` | Start of the range to keep, in seconds. Requires `--trim-end` | None |
| `--trim-end <s>` | End of the range to keep, in seconds. Requires `--trim-start` | None |
| `--width <px>` | Resize width. Requires `--height` | None |
| `--height <px>` | Resize height. Requires `--width` | None |
| `--speed <factor>` | Playback multiplier, above 0 | None |
| `--text <text>` | One line to draw over the video | None |
| `--text-position <pos>` | `top`, `center`, or `bottom` | `center` |
| `--remove-audio` | Drop the audio track | Off |
| `--fps <n>` | Sample rate for `frames` and `gif` | 10 |
| `--help` | Print usage and exit | Off |

`edit` needs at least one operation; the five are independent and any combination runs. Every option outside a command's own set is refused rather than ignored, so a caller who reaches for `--trim-start` on `gif` is told it does not apply instead of quietly getting an untrimmed GIF.

Outputs are MP4 for `edit` and `concat` and GIF for `gif`, and the extension has to say so; the video is re-encoded to H.264 with AAC audio every run. Paths are absolute because a relative one resolves against whichever directory the caller happened to be in. This tool never picks an output location and never falls back to one: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the file inside it. Missing parent directories are created; a file already there is replaced.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. Nothing it does is destructive beyond writing what it was told to write, so no command takes `--confirm`.

## Script Contract

The one script this tool ships follows `system/templates/Script Contract.md`: self-contained imports, help answered before any check, the system-dependency checks on the commands that need them, and the stdout and stderr rules. It imports no package, so the contract's dependency install clause has nothing to install and its `--env` clause has nothing to bind. The sections above state what each command does; the contract states how the script behaves getting there.

Every usage mistake is caught before FFmpeg is reached, so a bad path, a bad number, or an option that belongs to another command never starts a pass. No message repeats FFmpeg's own output, which quotes full paths and whatever the container's metadata holds; a run that fails names the operation and the input instead. When FFmpeg fails after opening a file destination (`edit`, `concat`, `gif`), any partial or zero-byte file left at `--output` is removed before the error is printed, so a failed concat does not leave a stub that looks like a finished product. A `frames` directory is left as it is. Nothing is read from stdin, and FFmpeg is run with stdin closed, so a run with nobody watching fails rather than waiting for a keystroke.

## Output

One JSON object on stdout, exit 0, once the work is written.

| Field | Carries | Commands |
|-------|---------|----------|
| `output` | The absolute path written, or the directory filled | All |
| `operations` | What was applied, in the order it ran | All |
| `audio` | `kept` or `removed` | `edit`, `concat` |
| `bytes` | Size of the file written | `edit`, `concat`, `gif` |
| `inputs` | How many videos were joined | `concat` |
| `fps` | The sample rate used | `frames`, `gif` |
| `frames` | How many `frame_NNNN.png` files sit in the output directory | `frames` |
| `width` | The GIF's width in pixels | `gif` |

`audio` is the field worth reading back after a speed change: it says `removed` whenever a factor outside 0.5 to 2.0 left the track behind. `frames` counts every frame file in the directory, including any an earlier extraction left there.

Failure prints to stderr, leaves stdout empty, and exits 1.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `missing FFmpeg; check: ffmpeg -version` | FFmpeg is absent or not on the path | The agent follows the Script Contract's System dependencies clause; install steps never live here |
| `missing a drawtext-capable FFmpeg build with a resolvable font` | The build lacks freetype, or no font resolves on this machine | Same clause; every command other than `edit --text` still runs |
| `Error: --input is required` | No video was named | Pass `--input <path>` |
| `Error: --input must be absolute` | A relative path, which resolves against the caller's directory, or a web address, which is not a path at all | Pass the resolved absolute path of a local file; this tool reads nothing over a network |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --output is required` | No destination was named | Resolve a work directory in the owning root and name the file; this tool picks no location |
| `Error: --output resolves inside this tool directory` | The path landed in the shared root | Pass a work directory in the owning root |
| `Error: --output must end .mp4 for edit` | An extension the command does not write | Rename the output; `edit` and `concat` write MP4, `gif` writes GIF |
| `Error: --output must be a directory for frames` | A filename was passed where a directory belongs | Pass the directory; the frame files are named inside it |
| `Error: edit needs at least one operation` | `edit` ran with paths and nothing to do | Pass one of the five operations, or use `concat`, `frames`, or `gif` |
| `Error: --trim-start and --trim-end go together` | Only one end of the range was given | Pass both; the range is what gets kept |
| `Error: --trim-end must be greater than --trim-start` | The range is empty or reversed | Put the earlier second first |
| `Error: --width and --height go together` | Only one dimension was given | Pass both; the frame is scaled to exactly that size |
| `Error: --speed must be a number above 0` | A zero, a negative, or a non-number | Pass a positive factor; 0.5 halves the speed and 2 doubles it |
| `Error: --text may not contain newlines, tabs, or other control characters` | A multi-line caption | Pass one line; run the command again for a second line |
| `Error: <option> does not apply to <command>` | An operation was passed to a command that does not run it | Move it to `edit`, or drop it |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: unexpected argument "<token>"` | A stray value not attached to a flag | Every value follows its own flag; check `help` |
| `Error: FFmpeg could not join N videos` | An input has no audio track, or the inputs disagree on frame size | Give every input a video and an audio stream at one size; `frames` and `edit` have no such constraint. The partial output file is removed on failure |
| `Error: FFmpeg could not apply ... to <path>` | The input is not a video FFmpeg can decode, or the output path is not writable | Open the input in a player; confirm the output directory exists and is writable. Any partial file at `--output` is removed on failure |
| `frames` reports more files than the video should yield | An earlier extraction left frame files in the same directory | Extract into an empty directory; the count is of what is there, not of what this run wrote |
| The GIF is 480 pixels wide when the video was larger | Expected: GIF output is scaled to 480 wide, height following the aspect ratio | Resize with `edit` first if a different width is wanted, then convert |
| The overlay is tiny on a large frame, or huge on a small one | Expected: the overlay is a fixed 50 pixels whatever the frame | Resize to the delivery size first, then add the text |
| Audio vanished after a speed change | Expected outside 0.5 to 2.0; the audio filter cannot follow that far | Read `audio` in the output; stay inside the range to keep the track |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/` and with nothing configured.
- `edit`, `concat`, `frames`, and `gif` each exit 0 with one parseable JSON object on stdout, and the file or directory named in `output` exists.
- `--input` or `--output` omitted, relative, non-existent, or carrying an extension the command does not write exits 1 with the cause on stderr and stdout empty, before FFmpeg is reached.
- An `--output` resolving inside this tool directory is refused rather than written.
- `--trim-start 0 --trim-end 10 --speed 2` yields about five seconds rather than ten, proving the trim bounded the input rather than the result.
- A `--text` carrying a colon, an apostrophe, a comma, a percent sign, or a bracket is drawn in full, and no part of the filter appears in the frame.
- A `--speed` outside 0.5 to 2.0 reports `audio` as `removed` rather than shipping a track out of sync.
- A failed FFmpeg pass for `edit`, `concat`, or `gif` leaves no partial or zero-byte file at `--output`.
- No run opens a network connection, reads stdin, repeats FFmpeg's own output, or writes anywhere other than the path the caller named: one file for every command but `frames`, and one PNG per extracted frame inside that directory for `frames`. A run that fails removes the partial file it had begun at that path, and never removes anything else.
