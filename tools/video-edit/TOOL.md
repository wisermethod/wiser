---
name: video-edit
type: tool
category: media
description: Edits a video with FFmpeg and writes the result where the caller names, covering trim, resize, speed, text overlay, audio removal, concatenation, frame extraction, GIF conversion, narration laid onto a silent video, loudness set to a named level, and one encode of joined scenes to YouTube's recommended settings
version: 0.2.0
---

# video-edit

One video, image sequence, or GIF, written where the caller said, holding what FFmpeg made of the files the caller named.

## Context

Use it when a video already exists and has to come out different: cut to a range, resized to a platform's frame, sped up or slowed down, captioned with a line of text, stripped of its audio, joined end to end with other clips, sampled into stills, or turned into a GIF for somewhere that will not play video. Use it too when a silent video needs its narration laid on (`mux`), when a video's sound has to sit at a named loudness under a true-peak limit (`loudness`), and when scenes have to become one file encoded once to YouTube's recommended settings (`finish`). It is the finishing pass after footage arrives, whatever produced it.

Do not use it to produce video from a description or from a still image; that is generation, it costs money per call, and it routes through `Media Generator`. Do not use it to pull words out of a recording, which is transcription, or to work on a still image, which the image tools do. An audio file enters only as the track `mux` lays onto a video: no command edits an audio file on its own or writes one, and mixing two sounds, such as music under narration, is not here. It decides nothing about the edit: it applies the operations it was given, in the order below, and reports what it wrote.

It authenticates to nothing, holds no credential, reaches no other primitive, and opens no network connection. Every input is a local file that must already exist, which is also what keeps an address out of FFmpeg's hands.

Classifier seam: none.

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
| ffprobe, which ships with FFmpeg | `mux`, `loudness` and `finish` | `ffprobe -version` succeeds |
| FFmpeg's `libx264` and `libopus` encoders | `finish` only | `ffmpeg -hide_banner -encoders` lists both |

The drawtext and encoder rows are the same program in a narrower condition: a build without freetype, `libx264` or `libopus`, or a machine with no font FFmpeg can resolve, runs every other command and fails only on the one that needs it. Each is checked separately so that failure arrives before the pass rather than inside it.

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

Audio follows the speed change while a factor stays from 0.5 through 2.0, endpoints included. Outside that range the audio filter cannot follow, and the track is dropped rather than left out of sync; the JSON reports `audio` as `removed` so a caller can see it happened. When the factor is outside that range and the request requires the audio to survive, do not run it: ask for a factor from 0.5 through 2.0, or for a run with the track dropped. When the factor is outside that range and the request allows the audio to go, or does not mention audio, run it and say in the delivery that `audio` is `removed`. A requested speed change that names no factor: ask for one, and do not pick a factor. When no speed change is asked for, omit `--speed`.

Text is drawn horizontally centered, and `--text-position` chooses the vertical band: `top` sits 50 pixels down, `bottom` sits 100 pixels up from the bottom, `center` is the middle. A caller's text is escaped for both parsers FFmpeg runs it through, so a colon, an apostrophe, a comma, a percent sign, or a bracket is drawn rather than read as part of the filter.

The other commands take no part in this chain. `concat` joins whole files, `frames` samples stills, and `gif` converts; none of them trims, resizes, or captions on the way. `mux`, `loudness` and `finish` are the next section's.

## Sound and the final encode

**The audio clock.** One rule binds `mux`, `loudness` and `finish`, the three commands that write audio:
- **Writing.** The written audio stream starts at time 0, with no edit list, and every sample sits at its own time on the video's clock. The first shown frame's time `f`, read from that frame's own timestamp, falls on sample `floor(f × 48000)`.
- **Reading.** An input's sample `n` sits at its first decoded audio frame's own timestamp plus `n / rate`, or at the stream's start time where no first frame can be read. That timestamp is the stream's start only when nothing precedes the first sample: with no edit list, FFmpeg presents Opus's first decoded sample at Opus's pre-skip.
- **The arithmetic.** Every position is computed in exact integers.

**Sample counts.**
- **A video's length:** `N` frames at `p/q` frames per second hold `floor(N × 48000 × q / p)` samples.
- **A join:** each input starts at the floor of the running total of the frames before it, so a fractional rate such as 30000/1001 never drifts.
- **A start:** `--audio-start` is read as an exact decimal, never through a float. The narration's first sample lands `ceil(t × 48000)` samples after the first shown frame's.
- **A resampled length:** audio at another rate, `count` samples at `rate`, lasts `ceil(count × 48000 / rate)` samples at 48 kHz. That is the length `mux` and `finish` test against the time left.

**`mux`** lays one audio file onto one silent video.
- **The video:** exactly one video stream and no audio stream. A video that already carries audio is refused, since mixing is not here. Its stream is copied: the output's video packets and their times are the input's, bit for bit.
- **The audio file:** exactly one audio stream, mono or stereo, and no video stream. At 48 kHz its samples are used as they are. At another rate they are resampled to 48 kHz with the resampler's delay removed, so the first output sample is the first source sample.
- **The track:** it begins at `--audio-start` and runs exactly to the video's end. Narration that would run past that end is refused, never cut. It is written as 24-bit PCM, its channel count kept.

**`loudness`** sets one video's sound to `--target` and keeps its picture.
- **The input:** exactly one video stream and exactly one audio stream. The video stream is copied, and every audio sample keeps its time.
- **The measure:** integrated loudness and true peak, by EBU R128 (`ebur128` with true peak).
- **The level:** a gain alone, wherever the gained true peak stays at or under `--true-peak`. Otherwise the gain and a limiter run at four times the sample rate. Either way the gain is corrected until the 48 kHz working audio reads within 0.3 LU of the target, and the written file must then read within 0.5 LU, or it is refused.
- **The output:** 24-bit PCM at 48 kHz, its channel count kept.

Audio with no gated block, nothing above EBU R128's −70 LUFS floor, has no loudness to set and is refused. A caller matching several scenes runs `loudness` on each at one target. Each target applies to the file it writes, so a mono scene is measured as mono.

**`finish`** joins one or more videos in the order given and encodes them once.
- **Its inputs:** each has one video stream, `yuv420p` tagged BT.709 at TV range with no display matrix, and all share one size and one frame rate. Each has at most one audio stream, of one or two channels.
  - A video with no audio counts as silence of its length.
  - An input whose audio runs longer than its picture by more than one frame is refused. A shorter excess is trimmed.
- **Its picture** is encoded with the settings of `tools/video-render/TOOL.md`'s `publish` profile, which that page states, with one difference: `publish` converts its pages' pixels to BT.709, and `finish` converts nothing. It sets the tags on frames that already carry them, which is why it takes only tagged input. Its frames keep one constant grid from the first: `t(0) + n / fps`.
- **Its audio** is each input's track measured from that input's own first shown frame, placed on the running total.
  - A mono track is copied to both channels.
  - The whole is set to `--target` and `--true-peak` on the stereo it will be, by the same core `loudness` uses.
  - It is encoded as Opus at a fixed 384 kbps, stereo, 48 kHz.

  With no edit list, a player reading the file's timestamps presents Opus's first decoded sample at Opus's pre-skip. The program is therefore delayed by the first frame's time less that pre-skip, so its sample `k` plays at `k / 48000`.

**Read back before naming.** Each of the three writes a hidden sibling beside `--output`, `.wiser-video-edit-<random>.mp4`, and gives it its name only after reading it back. A file that fails is removed, and the refusal names the check. FFmpeg 8 exits 0 when it declines to overwrite a file, so its exit code is never taken as a write.
- **`mux`** reads back:
  - the copied packets' hashes and times;
  - one audio stream at 48 kHz, starting at 0, with no edit list;
  - the audio's format, channels and sample count.
- **`loudness`** reads back the copied picture's times and the audio clock, then the written loudness and true peak.
- **`finish`** reads back:
  - the copied picture's times;
  - the frame count, and the keyframe spacing with every keyframe an IDR picture;
  - the colour tags, square pixels, `faststart` and no edit list;
  - Opus stereo at 48 kHz, its pre-skip, and its length within one Opus frame of the picture's;
  - the loudness within 1 LU of the target, and the true peak at or under the limit, on the encoded file. A file outside the loudness tolerance is refused. When Opus overshoots the peak, the limiter's ceiling is lowered and the audio encoded again.

  The gain corrections and those encodes share one bound of 12 passes, for `loudness` and `finish` alike.

**The same bytes.** The same inputs and flags give byte-identical files on every run, through fixed thread counts and FFmpeg's `bitexact` flags.

## Usage

| Command | Purpose | Writes |
|---------|---------|--------|
| `node scripts/edit.js help` | Print usage and exit | Nothing |
| `node scripts/edit.js edit --input <path> --output <path.mp4>` | Apply one or more operations to one video | One MP4 |
| `node scripts/edit.js concat --input <path> --input <path> [...] --output <path.mp4>` | Join two or more videos in the order given | One MP4 |
| `node scripts/edit.js frames --input <path> --output <dir>` | Sample stills into a directory | `frame_0001.png` onward |
| `node scripts/edit.js gif --input <path> --output <path.gif>` | Convert a video to an animated GIF | One GIF |
| `node scripts/edit.js mux --input <video.mp4> --audio <file> [--audio-start <seconds>] --output <path.mp4>` | Lay one audio file onto one silent video | One MP4 |
| `node scripts/edit.js loudness --input <path> --output <path.mp4> --target <LUFS> --true-peak <dBTP>` | Set one video's loudness, its picture copied | One MP4 |
| `node scripts/edit.js finish --input <path> [--input <path> ...] --output <path.mp4> --target <LUFS> --true-peak <dBTP>` | Join videos and encode them once to YouTube's recommended settings | One MP4 |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--input <path>` | Video to read, absolute, and it must exist. Repeat it for `concat` and `finish` | None; required |
| `--output <path>` | File to write for every command but `frames`; the directory to fill for `frames`. Absolute | None; required |
| `--trim-start <s>` | Start of the range to keep, in seconds. Requires `--trim-end` | None |
| `--trim-end <s>` | End of the range to keep, in seconds. Requires `--trim-start` | None |
| `--width <px>` | Resize width. Requires `--height` | None |
| `--height <px>` | Resize height. Requires `--width` | None |
| `--speed <factor>` | Playback multiplier, above 0 | None |
| `--text <text>` | One line to draw over the video | None |
| `--text-position <pos>` | `top`, `center`, or `bottom` | `center` |
| `--remove-audio` | Drop the audio track | Off |
| `--fps <n>` | Sample rate for `frames` and `gif` | 10 |
| `--audio <path>` | The audio file `mux` lays on, absolute, with one mono or stereo stream and no video | None; required for `mux` |
| `--audio-start <seconds>` | Where `mux` starts the narration, after the first shown frame, as a decimal of 0 or more | 0 |
| `--target <LUFS>` | Integrated loudness for `loudness` and `finish`, a decimal from −40 to −5 | None; required |
| `--true-peak <dBTP>` | True-peak limit for `loudness` and `finish`, a decimal from −9 to 0 | None; required |
| `--help` | Print usage and exit | Off |

`edit` needs at least one operation; the five are independent and any combination runs. Every option outside a command's own set is refused rather than ignored, so a caller who reaches for `--trim-start` on `gif` is told it does not apply instead of quietly getting an untrimmed GIF. Before `frames`, pass an empty directory, or a new one when the directory cannot be listed: the reported count includes any `frame_NNNN.png` files already there, and do not treat the count as this run's alone while older frames may sit in it.

`--target` and `--true-peak` have no default, so the caller names the level: a scene matched at one level, and a finished video at another. Which levels a production uses is the caller's, not this tool's. Does the request name both numbers? Yes: pass them. Either one is missing: ask for it, and do not take a number from a platform's name; "for YouTube" names the picture settings `finish` writes, not a loudness or a peak.

Outputs are MP4 for every command but `frames` and `gif`, GIF for `gif`, and the extension has to say so. `edit` and `concat` re-encode to H.264 with AAC audio every run; `mux` and `loudness` copy the picture; `finish` encodes as Sound and the final encode says. Paths are absolute because a relative one resolves against whichever directory the caller happened to be in. This tool never picks an output location and never falls back to one: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the file inside it. Missing parent directories are created; a file already there is replaced.

No command takes `--env`. Nothing it does is destructive beyond writing what it was told to write, so no command takes `--confirm`.

## Script Contract

The scripts this tool ships, `scripts/edit.js` and the modules it imports beside it, follow `system/templates/Script Contract.md`; what a user meets when running them is `tools/RUNNING.md`. They import no package, so the contract's dependency install clause has nothing to install and its `--env` clause has nothing to bind. The sections above state what each command does; the contract states how the script behaves getting there.

Every usage mistake is caught before FFmpeg is reached, so a bad path, a bad number, or an option that belongs to another command never starts a pass. No message repeats FFmpeg's own output, which quotes full paths and whatever the container's metadata holds; a run that fails names the operation and the input instead. When FFmpeg fails after opening a file destination (`edit`, `concat`, `gif`), any partial or zero-byte file left at `--output` is removed before the error is printed, so a failed concat does not leave a stub that looks like a finished product; `mux`, `loudness` and `finish` never write `--output` until their file has passed its checks. A `frames` directory is left as it is. Nothing is read from stdin, and FFmpeg is run with stdin closed, so a run with nobody watching fails rather than waiting for a keystroke.

## Output

One JSON object on stdout, exit 0, once the work is written.

| Field | Carries | Commands |
|-------|---------|----------|
| `output` | The absolute path written, or the directory filled | All |
| `operations` | What was applied, in the order it ran | All |
| `audio` | `kept` or `removed` | `edit`, `concat` |
| `bytes` | Size of the file written | All but `frames` |
| `sha256` | The written file's SHA-256 | `mux`, `loudness`, `finish` |
| `inputs` | How many videos were joined | `concat`, `finish` |
| `fps` | The sample rate used; for `mux` and `finish`, the video's frame rate as a fraction such as `30000/1001` | `frames`, `gif`, `mux`, `finish` |
| `frames` | For `frames`, how many `frame_NNNN.png` files sit in the output directory; for `mux` and `finish`, the video's frame count | `frames`, `mux`, `finish` |
| `width` | The GIF's width in pixels, or the finished video's | `gif`, `finish` |
| `height` | The finished video's height in pixels | `finish` |
| `firstFrameSample`, `audioStartSample`, `narrationSamples`, `samples` | The first shown frame's sample, the narration's first sample, the narration's length, and the track's length, each counted at 48 kHz | `mux` |
| `resampled`, `channels` | Whether the audio file was resampled to 48 kHz, and its channel count | `mux` |
| `offsets` | One entry per input: its `firstFrame`, `firstSample`, `frames` and `samples` in the join | `finish` |
| `audioDelaySeconds` | The first shown frame's time, where the program's audio begins | `finish` |
| `checks` | The read-back checks the file passed | `finish` |
| `before`, `after` | The audio's `integrated` loudness, `truePeak` and `loudnessRange`, before the change and as written | `loudness`, `finish` |
| `gainDB`, `limiterEngaged`, `maximumGainReductionDB` | The gain applied, whether the limiter ran, and its largest reduction | `loudness`, `finish` |
| `passes`, `maxPasses`, `target`, `truePeakLimit`, `ceilingDBTP` | The correction passes used and allowed, the level asked for, and the limiter's last ceiling, or `null` when it did not run | `loudness`, `finish` |

`audio` is the field worth reading back after a speed change: it says `removed` whenever a factor outside 0.5 to 2.0 left the track behind. `frames` from the `frames` command counts every frame file in the directory, including any an earlier extraction left there.

Failure prints to stderr, leaves stdout empty, and exits 1.

## Troubleshooting

The stops every tool shares, an unknown flag and a path that is relative or inside this tool, are in `tools/RUNNING.md`; this tool installs nothing; the rows below are its own.

| Message | Cause | Fix |
|---------|-------|-----|
| `missing FFmpeg; check: ffmpeg -version` | FFmpeg is absent or not on the path | The agent follows the Script Contract's System dependencies clause; install steps never live here |
| `missing a drawtext-capable FFmpeg build with a resolvable font` | The build lacks freetype, or no font resolves on this machine | Same clause; every command other than `edit --text` still runs |
| `missing ffprobe` | ffprobe is absent or not on the path | Same clause; `edit`, `concat`, `frames` and `gif` still run |
| `missing FFmpeg's libx264 encoder` or `libopus encoder` | The FFmpeg build lacks the encoder `finish` needs | Same clause; every command but `finish` still runs |
| `Error: --input is required` | No video was named | Pass `--input <path>` |
| `Error: --input must be absolute` | A relative path, which resolves against the caller's directory, or a web address, which is not a path at all | Pass the resolved absolute path of a local file; this tool reads nothing over a network |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --output is required` | No destination was named | Resolve a work directory in the owning root and name the file; this tool picks no location |
| `Error: --output must end .mp4 for edit` | An extension the command does not write | Rename the output; every command but `frames` and `gif` writes MP4, `gif` writes GIF |
| `Error: --output must be a directory for frames` | A filename was passed where a directory belongs | Pass the directory; the frame files are named inside it |
| `Error: edit needs at least one operation` | `edit` ran with paths and nothing to do | Pass one of the five operations, or use another command |
| `Error: --trim-start and --trim-end go together` | Only one end of the range was given | Pass both; the range is what gets kept |
| `Error: --trim-end must be greater than --trim-start` | The range is empty or reversed | Put the earlier second first |
| `Error: --width and --height go together` | Only one dimension was given | Pass both; the frame is scaled to exactly that size |
| `Error: --speed must be a number above 0` | A zero, a negative, or a non-number | Pass a positive factor; 0.5 halves the speed and 2 doubles it |
| `Error: --text may not contain newlines, tabs, or other control characters` | A multi-line caption | Pass one line; run the command again for a second line |
| `Error: <option> does not apply to <command>` | An operation was passed to a command that does not run it | Move it to the command it belongs to, or drop it |
| `Error: unexpected argument "<token>"` | A stray value not attached to a flag | Every value follows its own flag; check `help` |
| `Error: FFmpeg could not join N videos` | An input has no audio track, or the inputs disagree on frame size | Give every input a video and an audio stream at one size; `frames` and `edit` have no such constraint. The partial output file is removed on failure |
| `Error: FFmpeg could not apply ... to <path>` | The input is not a video FFmpeg can decode, or the output path is not writable | Open the input in a player; confirm the output directory exists and is writable. Any partial file at `--output` is removed on failure |
| `Error: --target is required for loudness` (or `finish`), or `--true-peak is required` | No level was named | Pass both; this tool picks no level |
| `Error: --target must be a decimal from -40 to -5`, or `--true-peak … from -9 to 0` | The value is outside the range or not a number | Pass a decimal inside the range |
| `Error: --audio is required for mux` | No audio file was named | Pass `--audio <path>` |
| `Error: --audio-start must be a decimal of 0 or more` | A negative, a fraction like `1/2`, or a non-number | Pass seconds as a decimal, such as `0.25` |
| `Error: mux: video <path> already carries audio` | `mux` lays audio onto a silent video only | Pass the silent picture; mixing two sounds is not here |
| `Error: mux: --audio <path> holds a video stream` | The audio file holds a picture, often the two arguments swapped | Pass the video as `--input` and an audio-only file as `--audio` |
| `has more than two channels` | The audio has more than two channels | Pass mono or stereo |
| `Error: mux: narration <path> with --audio-start would run past the video's end` | The narration, from its start, is longer than the time left | Use an earlier start or a longer video; narration is never cut |
| `must have exactly one video stream; audio-only files are refused` | A WAV or other audio-only file was passed as `--input` | Lay it onto a video with `mux` first |
| `must have exactly one audio stream`, or `at most one` | `loudness` got a silent video, or an input holds several audio streams | Give `loudness` a video with its sound; give each input one track |
| `Error: Audio has no gated block` | The audio is silent, nothing above −70 LUFS | Pass audio with sound in it |
| `Error: Loudness did not converge in 12 passes` | The target cannot be reached under the limit, as with a few short clicks raised far | Choose a lower `--target` or a higher `--true-peak` |
| `Error: Written loudness is outside the target tolerance` | The encoded file missed the target by more than its tolerance | Choose a lower `--target` |
| `Error: finish: input <path> must be yuv420p tagged BT.709` | An untagged picture, or another colour space or range | Encode the input tagged BT.709 at TV range; guessing an untagged picture's colour would change its pixels |
| `Error: finish: input <path> carries a display matrix` | The input is meant to be shown rotated or flipped | Write the picture upright first |
| `differs in width or height` or `differs in frame rate` | The inputs do not share one size and one rate | Make them at one size and one rate where they are made, as `yuv420p` tagged BT.709 at TV range. `edit` and `concat` write none of those tags, so a file resized or joined there is refused by `finish` |
| `audio is longer than its picture by more than one frame` | An input's sound runs past its picture | Shorten the track, or give the picture its full length |
| `first-frame audio delay … is smaller than Opus pre-skip` | A frame rate so high that two frames last less than Opus's pre-skip | Use a frame rate below 307 fps |
| `read-back check <name> failed` or `read-back … failed; no output published` | The written file broke a rule its read-back checks | The check is named; run again to a new path, and report it if it repeats |
| `frames` reports more files than the video should yield | An earlier extraction left frame files in the same directory | Extract into an empty directory; the count is of what is there, not of what this run wrote |
| The GIF is 480 pixels wide when the video was larger | Expected: GIF output is scaled to 480 wide, height following the aspect ratio | `gif` always scales to 480 wide, so resizing with `edit` first does not change the width, and this tool has no other GIF width. When the request needs another width, say so and ask whether 480 is acceptable; run `gif` only if it is, and produce no GIF when it is not or there is no answer. Otherwise run `gif` |
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
- `mux` writes a file whose video packets and their times are the input's, whose narration's first sample and track length are those Sound and the final encode's sample counts give.
- `loudness` writes a file within 0.5 LU of `--target`, with its true peak at or under `--true-peak` and every audio sample at its time, its picture copied.
- `finish` writes a file within 1 LU of `--target` with its true peak at or under `--true-peak`, read on the encoded file. Every frame sits on its constant grid, and every input's narration lands where the running total puts it. The file meets the settings Sound and the final encode names.
- Run twice on the same inputs and flags, `mux`, `loudness` and `finish` each give byte-identical files.
- Every refusal of `mux`, `loudness` or `finish` exits 1 with stdout empty and writes nothing at `--output` or beside it.
- No run opens a network connection, reads stdin, repeats FFmpeg's own output, or writes anywhere other than the path the caller named: one file for every command but `frames`, and one PNG per extracted frame inside that directory for `frames`. `mux`, `loudness` and `finish` also write, while they run, the hidden sibling and one temporary directory `tools/AGENTS.md` names, and remove both. A run that fails removes the partial file it had begun at that path, and never removes anything else.
