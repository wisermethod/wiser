---
name: video-edit
type: tool
category: media
description: Edits existing video with FFmpeg, including audio-correlated silent conform, exact decoded frame evidence, timed silent video composition, full-frame transparent composition, trim, resize, speed, text, audio removal, concatenation, sampled frames, GIF, narration mux, loudness and the final joined encode
version: 0.4.0
---

# video-edit

One video, image sequence, GIF or checked evidence bundle, written where the caller said, holding what FFmpeg made of the files the caller named.

## Context

Use it when a video already exists and has to come out different: cut to a range, resized to a platform's frame, sped up or slowed down, captioned with a line of text, stripped of its audio, joined end to end with other clips, sampled into stills, or turned into a GIF for somewhere that will not play video. Use it too when a silent video needs its narration laid on (`mux`), when a video's sound has to sit at a named loudness under a true-peak limit (`loudness`), and when scenes have to become one file encoded once to YouTube's recommended settings (`finish`). It is the finishing pass after footage arrives, whatever produced it.

Use `exact-frames` for chosen decoded pictures and crops from a delivered segment, and `composite` for a timed inset over a silent base. The caller chooses evidence ordinals, word associations, temporal neighborhoods and window placement. These operations make no mouth, performance, caption-occlusion or continuous synchronization judgment.

Do not use it to produce video from a description or from a still image; that is generation, it costs money per call, and it routes through `Media Generator`. Do not use it to pull words out of a recording, which is transcription, or to work on a still image, which the image tools do. An audio file enters as the track `mux` lays onto a video, or as the reference witness `conform` analyses against the video’s own audio before dropping that track. The conform reference is never written: no command edits an audio file on its own or writes one, and mixing two sounds, such as music under narration, is not here. It decides nothing about the edit: it applies the operations it was given, in the order below, and reports what it wrote.

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
| FFmpeg | Every media command | `ffmpeg -version` succeeds |
| A drawtext-capable FFmpeg build with a resolvable font | `edit --text` only | `ffmpeg -f lavfi -i color=c=black:s=32x32:d=1 -vf drawtext=text=x -frames:v 1 -f null -` exits 0 |
| ffprobe, which ships with FFmpeg | `mux`, `loudness`, `finish`, `conform`, `exact-frames`, `composite`, `composite-alpha` | `ffprobe -version` succeeds |
| FFmpeg's `libx264`, `png` and `libopus` encoders | `libx264` for `conform` and `composite`; `png` for `exact-frames`; libx264 and libopus for `finish` | `ffmpeg -hide_banner -encoders` lists the required names |
| FFmpeg's `libx264` encoder, `png` decoder, `setsar` and `setparams` filters | `composite-alpha` only, checked by its own dependency probe | `ffmpeg -v error -encoders` lists libx264, `ffmpeg -v error -decoders` lists png, and `ffmpeg -v error -filters` lists setsar and setparams |

The drawtext and encoder rows narrow the same program's requirements. Encoder/filter presence checks run only for the operation needing them. Each is checked separately so that failure arrives before the pass rather than inside it.

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

The other commands take no part in this chain. `concat` joins whole files, `frames` samples stills, and `gif` converts; none of them trims, resizes, or captions on the way. The separate exact operations follow.

## Audio-correlated conform

Use `conform` when one retained video must supply exactly the caller's picture grid, with its own audio establishing correspondence to an identified upload reference. It supplies no mouth judgment and changes no playback speed. It does not invoke another tool, select a take or interpret a production registry.

Every flag below is required, once. Supply all policy values; when any is missing, ask the caller for it. Times accept nonnegative exact decimal or integer-fraction seconds, at most 128 characters. There is no `--fps` alias or vendor preset.

| Flag | Meaning and bound |
|------|-------------------|
| `--input`, `--sha256` | Local MP4 and expected complete-file SHA-256 |
| `--reference`, `--reference-sha256` | Speech Preparation's PCM16 mono/stereo `padded.wav` and expected SHA-256; sample zero is upload sample zero |
| `--upload-receipt`, `--upload-receipt-sha256` | Its colocated JSON receipt and caller-pinned expected SHA-256 |
| `--output` | New bundle directory, outside this tool, with an existing parent; existing destinations, including incomplete ones, refuse |
| `--frames` | Exact positive count N, at most 100000 |
| `--rate` | Rational p/q, 1 through 240 fps, reduced numerator and denominator at most 1000000 |
| `--width`, `--height` | Even target dimensions, 2 through 8192 |
| `--origin` | Exact reference time shown by output frame 0: zero for a full padded scene; positive to start a window after its guard |
| `--correlation-floor` | Required normalized peak, greater than zero through one, inclusive at the upper bound |
| `--max-offset` | Maximum absolute measured timestamp-corrected lag, 0 through 1 second inclusive |
| `--drift-tolerance` | Maximum lag spread over whole-file and useful consecutive-window measurements, 0 through 1 second inclusive |
| `--window` | Consecutive analysis window length, 0.25 through 60 seconds; floor to whole 48000 Hz samples |
| `--max-hold-start`, `--max-hold-end` | Independent nonnegative integer budgets for output frames held outside available picture, inclusive |
| `--source-colour` | Explicit `bt709-tv` interpretation, required even for tagged input; no other interpretation or conversion is supported |

Only `conform` needs its additional checks: `ffmpeg -encoders` must list libx264, and `ffmpeg -filters` must list scale, format, setsar, setparams, aresample and asetpts. Neither new dependency check affects an older command. All input paths are canonical regular files with one link. Protected memory/credential paths and aliases are refused, as are output aliases inside this tool. MP4 and WAV use forced local demuxers and file/pipe protocols; no playlists or network protocols are accepted. Receipt paths are never followed or opened. Reference WAV is limited to 256 MiB, receipt JSON to 4 MiB, decoded audio to 360 seconds per input, and combined source/selected planar picture scratch to 64 GiB. Exceeding a bound refuses.

**Reference identity.** Read `speech-upload` version 1 as data only: the padded hash, bytes, rate, channels and sample count must match measured WAV bytes/decoding, and its decoded residual displacement must be zero. The receipt's source mapping is retained as provenance, never applied to picture time. No other receipt shape is accepted. No source or upload path in the receipt is reopened. No lead, guard or codec priming is added: the padded reference already includes it. A stale or mismatched identity refuses.

**Clock measurement, version 2.** Decode each audio track, retaining its first decoded PTS and native time base. Every decoded audio frame must continue the previous sample clock exactly and its PTS must agree with any reported best-effort timestamp; absent, multiple, unsupported, discontinuous or undecodable tracks refuse. FFmpeg resets analysis PTS with `asetpts=N/SR/TB`. At native 48000 Hz it inserts no resampler; at other rates it appends `aresample=48000:first_pts=0` with delay compensation, matching the audio placement path. Analyse floating-point samples using the arithmetic mean of mono/stereo channels; refuse stereo whose mean energy is below 1% of its strongest channel, and any whole track below RMS 16/32768. No gain or DC removal is applied.

`bounded-linear-fft-normalized-v2` computes whole-file linear cross-correlation within timestamp-corrected lag [-1,1] seconds, independently of the caller's acceptance bound. Each candidate needs at least 0.25 seconds of real decoded overlap. It also needs 95% of the reference interval overlapping real decoded samples, except when each uncovered reference edge separately has RMS strictly below 16/32768. Such uncovered silence may extend beyond the video's audio without failing the fractional overlap rule. An uncovered edge at or above that silence level receives no exemption: less than 95% real overlap still refuses, even if the covered samples correlate perfectly. The absolute 0.25-second minimum always applies. These rules apply to both whole-file and window measurements, and the bounded search is not pre-clipped by a 95% duration-only bound. Normalize the dot product by both overlapping energies. Floating-point FFT roundoff alone is clamped to [-1,1]. The best peak must meet the floor and exceed the next candidate outside its immediate +/-1 sample neighbourhood by at least 0.000001; ties and near-ties inside that bound refuse. The 0.000001 margin is the fixed ambiguity acceptance bound, not a claim about FFT roundoff or a one-frame timing tolerance: a legal second peak 0.001 below the best, even one frame away, is accepted by this rule. The same bounded search is repeated independently in consecutive reference windows. Silent windows below the same RMS, and a terminal remainder shorter than 0.25 seconds, are recorded as excluded evidence. Every other window must pass peak, ambiguity, overlap and offset checks. A reference longer than one requested window requires at least two useful windows; otherwise drift is unestablished and the run refuses. The largest minus smallest lag, including the whole-file lag, must be <= the drift tolerance. No excluded window is claimed to establish a clock. All floor comparisons are >=; offset, drift and hold comparisons are <= and recorded with actual and limit.

**Sign and selection.** Let k be the measured index shift for which video audio sample j+k matches reference sample j after analysis resampling. The source picture clock starts at its first displayed picture PTS V; its audio sample zero is decoded PTS A. The corrected lag is exactly `A - V + k/48000`. Positive lag selects later source picture. Reference sample zero is zero even if its container timestamps differ. Output frame n selects at exact rational time `origin + n/rate + lag`; it never adds the receipt's padding or encoder delay. Native audio/picture PTS, their normalization and this arithmetic are recorded.

Decode picture PTS in presentation order, including B-frames. Missing, unsafe, duplicate or non-increasing PTS refuse, as does disagreement with the best-effort PTS. Intervals are half-open, from a picture's PTS to the next PTS; an exact boundary takes the later picture. The last interval ends at its decoded positive duration; missing terminal duration refuses. Before the first interval or at/after the last interval's end, hold the first/last picture within the separate edge budgets. Exactly N selections are recorded, including every held range. There is no interpolation or rate/speed filter choosing pictures.

**Pixels and intermediate.** Input must be square-pixel H.264 yuv420p with no display matrix or rotation; a stream that states no sample aspect ratio (ffprobe's `N/A` or `0:1`) is read as square and recorded in the receipt's `treatment`, and any stated ratio but 1:1 refuses. Missing colour tags acquire only the caller's explicit BT.709 TV interpretation; any contradictory stream or decoded-frame tag refuses. The declared scale path is Lanczos with explicit BT.709 input/output matrix and TV input/output range, then yuv420p, square pixels and BT.709 parameters. Already interpreted BT.709 samples need no gamut/transfer conversion. Other interpretations require another operation. Encode H.264 libx264 CRF 0, preset medium, one thread, no B-frames, metadata stripped, bitexact flags, faststart, no edit list, target numerator as the MP4 timescale and a zero first-picture origin. This supplies `video-render/TOOL.md`'s intermediate profile. Repeatability is scoped to the same FFmpeg build/settings.

Before publication, independently decode the source again through that scale/colour path and decode every output frame. Readback independently walks probed source intervals at each probed output presentation time plus origin and measured lag; it never calls the construction selector. Each output planar YUV SHA-256 must equal that independently chosen source frame's, and the recorded source ordinal must agree, in addition to exact count, every rational grid interval, size, codec, tags, SAR, no matrix/edit list and silence. The unchanged `mux` accepts this silent segment; `loudness` and `finish` accept the file `mux` writes from it. On the bare segment, `loudness` refuses the missing audio track and `finish` refuses its all-silent program at the loudness gate.

**Bundle and completion.** Only after all checks, before/after input hashes and staged receipt readback pass, publish `segment.mp4`, `receipt.json` and `complete.json` together by renaming a unique staging sibling. `receipt.json` has `schema: video-conform`, `version: 1` and tool version, all three expected/measured input identities, decoded origins/clocks, reference provenance, policy and boundary comparisons, whole/window peaks/lags, actual `overlap_samples`, new `silent_uncovered_samples` (the uncovered count only when both edges are below the silence threshold, otherwise zero), the new correlation `overlap_rule` string, offset arithmetic, every output-to-source ordinal/PTS/interval and pixel hash, held ranges, scaling/colour settings, full captured FFmpeg/ffprobe version strings in `decoder.build`/`decoder.probe_build` and `encoder.ffmpeg_version`/`encoder.ffprobe_version`, encoder arguments, output identity and readback. It has no self-hash. `complete.json` has `schema: video-conform-complete`, `version: 1`, `complete: true` and the segment/receipt hashes and sizes. Reuse only a final directory whose marker identities and receipt inputs/policy all match; existence alone proves nothing. Ordinary failure removes only this run's staging, publishes nothing and leaves stdout empty. A kill may leave staging, always incomplete. A later run refuses any existing destination and removes no abandoned staging. Writes are inventoried in `tools/AGENTS.md`.

Success stdout contains `ok`, `output`, `operations: ["conform"]`, `segment`, `receipt`, `receipt_identity`, `completion`, segment `bytes/sha256`, exact `frames/fps`, measured `lag_seconds`, `peak`, `drift_seconds` and start/end `held` counts. Failure names the failing check and the need for corrected inputs or a fresh destination. Missing/ambiguous caller inputs: ask before running. Audio correlation establishes the audio clock; picture performance still needs its caller's judgment.

## Exact decoded frame evidence

`exact-frames` is separate from sampled `frames`; its flags, defaults, numbering and output remain unchanged. Use a delivered conformed segment as input, and a final composite as input when reviewing an inset. Sparse stills alone do not establish continuous lip synchronization. Which evidence is sufficient is the caller's judgment.

Every flag is required once:

| Flag | Meaning |
|------|---------|
| `--input`, `--sha256` | Local `.mp4` and caller-pinned complete-file SHA-256 |
| `--requests` | Inline JSON array of 1 through 60 objects, at most 16384 characters; each has only integer `ordinal` and optional `crop` |
| `--output` | Fresh bundle directory outside this tool, with an existing parent |

Request shape: `[{"ordinal":12},{"ordinal":12,"crop":[100,80,300,160]}]`. Ordinal 0 is the first **decoded displayed** picture, including with reordered B-frames, never packet order, a seek time or an fps-filter result. Unsorted requests retain their original order by `request_index`. An identical ordinal/crop pair is served once with every request row kept. A full frame and a crop of the same ordinal produce separate images. A full-frame rectangle and an omitted crop are distinct requests. Word/occurrence associations stay with the caller, keyed to request index; the decoder does not interpret words.

Crops use integer stored-pixel `[left,top,right,bottom]` coordinates, right/bottom exclusive, with positive area. Odd edges and a one-pixel crop are supported after RGB conversion. Fractional, negative, unsafe or out-of-range ordinals, empty/oversized lists, duplicate JSON keys, extra keys, malformed or out-of-frame crops refuse. There is no clipping, decimal seeking or `--fps` option. Paths, hashes and the operating bounds below are checked before staging.

The source must have exactly one progressive square-pixel H.264 yuv420p video stream, even stored dimensions 2 through 8192, tagged BT.709 primaries/transfer/matrix at TV range. Audio may be present and is ignored; other stream types refuse. Any display matrix, rotation, interlacing, changing geometry, missing/unsafe PTS, disagreement with best-effort PTS or duplicate/non-increasing displayed PTS refuses. All stored dimensions and timestamps come from decoded frames. At most 100000 decoded pictures and 64 GiB of whole-source RGB scratch are supported. A nonzero first PTS is retained and becomes the declared time origin; this operation does not need a constant rate or terminal duration.

**Image conversion and proof.** Disable autorotation and force the local MOV/MP4 demuxer, file/pipe protocols and disabled external data references. Convert with `scale=iw:ih:flags=bilinear+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24`; select by decoded `n`, then crop with `exact=1`, and encode PNG. A separate whole-source RGB decode has no select/crop filter. Decode every PNG to RGB and compare every byte with its ordinal's integer region in that independent source decode. This promises those decoded RGB samples, not the original pre-encode camera RGB. Fixed FFmpeg build/settings define repeatability.

**Manifest version 1.** `manifest.json`, schema `video-exact-frames`, binds tool version, expected source SHA-256, measured source SHA-256 and bytes before/after, full video stream, decoded count, dimensions, native rational time base, first displayed PTS and rational seconds, no-autorotation and conversion settings, and full FFmpeg/ffprobe builds. Each request carries requested/actual ordinal, native PTS, exact rational `presentation_time` from the first displayed picture, requested/applied crop, relative image path, file SHA-256/bytes, width/height, decoded RGB SHA-256 and independent verification. Files use unique `image_000000_frame_000012.png` names in the new bundle. Counts come from verified requests/images, never existing PNGs.

## Timed silent video composition

`composite` lays one silent inset over one retained silent base. It is independent of conform and does no correlation, speed change or synthesis. First conform the inset separately if its clock/format needs adjustment. No position is defaulted; the caller names all geometry and timing.

| Flag | Meaning |
|------|---------|
| `--base`, `--base-sha256` | Retained local `.mp4` base and expected SHA-256 |
| `--inset`, `--inset-sha256` | Distinct retained local `.mp4` inset and expected SHA-256 |
| `--output` | Fresh bundle directory with an existing parent |
| `--start`, `--end` | Integer base interval `[s,e)`, nonempty and entirely inside the decoded base |
| `--inset-start` | Nonnegative integer inset ordinal shown at base ordinal s; inset must cover all e-s pictures |
| `--rect` | Comma-separated stored-pixel `left,top,right,bottom`, exclusive right/bottom; the complete footprint, border included |
| `--fit` | Required `contain`; no other fit or crop policy is offered |
| `--border-colour` | Required planar TV-range `Y,U,V` integers, Y 16 through 235 and U/V 16 through 240; fills border and fit bars |
| `--border-width` | Optional even nonnegative integer pixels, default 0, drawn inside the rectangle |

Every required flag appears once. Audio in either source, extra streams, unequal rates, nonzero first displayed PTS, edit lists, nonconstant or unusable decoded clocks, unsupported orientation/colour/geometry, short inset and invalid intervals refuse. Both sources obey Exact decoded frame evidence's progressive/size/count/colour rules. Both must occupy the same exact rational CFR grid from zero, each decoded frame at `n/f` and each duration exactly `1/f`; native time bases may differ (for example 1/15360 and 1/30 at 30 fps). Compare presentation times by exact rational arithmetic, never time-base strings; a single off-grid frame refuses; rate 1 through 240 fps, reduced terms at most 1000000, time base with numerator 1. The output preserves the base's native time base as well as size, rate and decoded count. No implicit stretching, rounding of timestamps or edge hold occurs.

**Geometry, version 1.** Rectangle edges and border width must be even for the 2-by-2 yuv420p chroma grid; the rectangle must fit inside the base. Shrink its interior by the border on every edge. Reduce the inset aspect to a:b, choose the largest even multiplier k for which a*k by b*k fits that interior, and scale to exactly that size with Lanczos and explicit BT.709 TV input/output matrix/range. Refuse if no positive even multiplier fits. This preserves aspect exactly on the chroma grid; coprime dimensions can leave larger bars than approximate aspect fits. Center the fitted picture by rounding each left/top spare margin down to an even coordinate; surplus stays on the right/bottom. The receipt records the actual fitted rectangle. Fit bars and border use the same explicit YUV colour. Shadow, rounded corners, arbitrary shapes and antialiasing beyond the declared rectangle are not offered.

**Sample equality and intermediate.** Base n shows inset `inset_start+n-s` precisely when `s <= n < e`. Copy planar YUV samples without converting the base to RGB. Outside that interval every decoded output sample equals the base's. Inside, every sample outside the complete rectangle equals the base's; inside it, fitted samples equal the identically scaled inset and remaining samples equal the declared colour. Border is inside the footprint. No chroma sample spills outside it.

Encode as `video-render/TOOL.md`'s intermediate, with the same libx264 CRF 0, medium preset, yuv420p, one thread, no B-frames, BT.709 TV, square pixels, metadata stripping, bitexact flags, faststart and no edit list as conform. Decode base, scaled inset and output again independently of construction. Check every planar sample, output stream/grid/count/size and both source identities before publication. The unchanged `mux` accepts the silent result; `loudness` and `finish` accept the file `mux` writes from it. Combined planar scratch is limited to 64 GiB, computed as four base sequences plus two scaled-inset sequences.

**Receipt version 1.** `receipt.json`, schema `video-composite`, binds tool version, both expected and measured source hashes/bytes before/after, source streams/counts/clocks, exact exclusive active interval and inset-start mapping, rectangle/footprint, actual fitted geometry, border width and YUV colour, scaling/colour treatment, decoder/encoder builds and settings, output identity and every-frame decoded hash with equality/readback results. The retained base and inset are never written.

## Full-frame alpha composition

Use `composite-alpha` to lay a transparent picture sequence, such as drawn captions, over a video you already have. It takes one retained silent base and one full-frame PNG sequence, including the unchanged `frames/` directory `video-render` `sequence` writes. It reads general media, never caption text, styles or timing records.

Every flag is required once; there are no optional flags or defaults:

| Flag | Meaning |
|------|---------|
| `--base`, `--base-sha256` | Absolute local `.mp4` base and its expected complete-file SHA-256 |
| `--layer` | Absolute directory containing the layer sequence and `frames.sha256` |
| `--layer-manifest-sha256` | Expected SHA-256 of the `frames.sha256` file itself |
| `--layer-first-index` | Integer 0 through 999999 naming the layer file shown over base ordinal 0; use 1 for `sequence` |
| `--layer-alpha` | Required `straight`, the PNG specification's unassociated alpha |
| `--layer-colour` | Required `bt709`, interpreting stored full-range R'G'B' code values as BT.709 without transfer conversion |
| `--output` | Fresh bundle directory outside this tool and protected paths, with an existing parent |

**Base and layer.** The base is a regular file with one link, never a symbolic link, canonicalized before use: one progressive H.264 yuv420p stream, no audio or extra streams, square pixels, tagged BT.709 primaries/transfer/matrix at TV range, and no rotation or display matrix. It has an exact constant grid from displayed PTS 0, every frame duration exactly one frame, rate 1 through 240 fps with reduced terms at most 1000000, and a numerator-1 time base. No edit list is allowed except one identity edit: one track, one version-0 or version-1 entry, media time 0, rate 1.0, and segment duration exactly equal to the track's media duration after timescale conversion. This exception applies only to `composite-alpha`.

The canonical layer directory contains exactly `frames.sha256` and N files named `frame_NNNNNN.png`, six digits zero-padded, from the first index through first+N-1, where N is the decoded base count. Extra entries, hidden files, subdirectories and linked entries refuse. Each entry is a regular file with one link. Each PNG has the base's size, 8-bit colour type 6, no interlace, valid chunk CRCs, and only `IHDR`, `IDAT`, `IEND` and optional `pHYs`; ffprobe must report `rgba`. Colour chunks, palettes and other chunks refuse. The manifest contains exactly N ordered lines, each a 64-character lowercase decoded-RGBA SHA-256, two spaces, the expected frame name and a newline. Names are constructed from the index/count, never opened from record text. The manifest file's hash and structure are checked before staging; each decoded hash is checked during construction and again during read-back. Base, manifest, PNG byte identities and the directory listing are checked unchanged before publication.

Output ordinal n is layer index first+n over base frame n. Count, size, rate, grid and native time base stay exact. There is no fit, crop, offset, edge hold, retiming or audio.

**Blend and support, version 1.** `composite-alpha-policy/1` converts the layer's stored nonlinear BT.709 R'G'B' to TV-range Y'CbCr with exact rational coefficients and blends there, with alpha a/255. It applies no transfer conversion or PNG colour chunk. Luma is blended per pixel; chroma is the equal-weight box average of the four alpha-weighted layer contributions in each 2-by-2 block plus the base's remaining share. RGB under zero alpha contributes nothing. Each replaced sample is rounded once, half up, using exact integers, with no clipping, including no clipping of copied out-of-TV-range samples.

`composite-alpha-support/1` replaces luma only where alpha is positive and chroma only in a 2-by-2 block containing any positive alpha. Every stored sample outside that support equals the base byte for byte in the silent intermediate; a wholly transparent sequence returns the base's decoded samples exactly. This promises nothing about displayed colour beside a glyph: a transparent pixel can share replaced chroma with a touched pixel. It promises nothing after `finish`'s lossy encode.

**Streaming, bounds and read-back.** Decode the base through stdout and each layer frame to RGBA, one frame at a time. Composed frames reach the encoder through a named FIFO in staging; FFmpeg's stdin stays closed. Independent read-back uses new base/layer/output decoders through stdout and a verifier importing neither the blender nor its support builder. It checks every planar sample against the policy and protected base samples, plus the output's silent stream, geometry, count and clock, before publication. No decoded sequence is stored on disk.

Before staging, dimensions must be even, 2 through 8192 each, with at most 2073600 pixels (1920 by 1080, either orientation); count is 1 through 27000, and the final layer index is at most 999999. Each PNG is at most 64 MiB; the manifest is at most 27000 lines of 83 bytes. Construction and verification stream 14 bytes per pixel per frame in total, at most 784 GB at both bounds. Scratch beyond the segment is the FIFO and two records, under 64 MiB. The unique staging sibling holds only that FIFO while running, `segment.mp4`, `receipt.json` and `complete.json`.

**Intermediate and receipt.** Encode libx264 CRF 0, medium preset, yuv420p, one thread, no B-frames, square pixels, BT.709 TV stream/container tags, the base's timescale, faststart, metadata stripped, bitexact flags and no edit list. `receipt.json`, schema `video-composite-alpha`, version 1, binds tool version, both policy versions, alpha/colour/blend/rounding/clipping rules, expected and measured base/manifest identities before/after, each layer frame's encoded bytes/hash and decoded RGBA hash, base stream/count/origin/edit-list treatment, rate/time base, ordinal mapping, full FFmpeg/ffprobe builds, encoder/decoder settings, output identity and every output frame's decoded SHA-256 with all passed read-back checks. Encoder paths are recorded as `composite.fifo` and `segment.mp4`; no random staging name, elapsed time, process id or render log enters the receipt. Repeatability is scoped to the same inputs, caller paths and FFmpeg build/settings. Publication delivers exactly the segment, receipt and completion marker as one checked bundle under the recovery rules below.

## Exact-operation publication and recovery

`exact-frames`, `composite` and `composite-alpha` install nothing. Each probes only its own additional dependencies: exact frames needs the png encoder plus scale/format/select/crop; timed composition needs libx264 plus scale/setsar/setparams; alpha composition needs libx264, the png decoder, and setsar/setparams. These checks change no requirements on old operations. Unknown, duplicate and inapplicable flags refuse before dependency work. Each source-file path is canonicalized and thereafter used as resolved, must be a regular file with one link, and is refused under a protected `memory` or credential path, including through links. Alpha composition also canonicalizes and screens its layer directory and checks every entry itself. A destination inside this tool, input alias or preexisting destination, including incomplete bundles, refuses. All new media reads use forced demuxers and local protocols; no receipt input paths are opened.

Stage the bundle in a unique sibling and remove analysis scratch only after its checks; alpha composition uses `.wiser-video-composite-alpha-<random>` and removes its FIFO after encoding, with no decoded scratch to remove. After all checks and manifest/receipt and completion-marker readback, reserve the final name with exclusive directory creation and rename the checked bundle over that run's own empty reservation. A late destination collision refuses; an ordinary rename failure removes only this run's still-empty reservation. A kill can leave an empty reserved destination or staging; either is incomplete. `complete.json` has schema `video-exact-frames-complete`, `video-composite-complete` or `video-composite-alpha-complete`, version 1, `complete: true`, and `files` containing SHA-256/bytes for every image or segment and its manifest/receipt. Records contain no self-hash; stdout returns the record's identity. A resumed caller must verify every marker hash/size and the record's source/settings against its request before reusing a final bundle. Existence alone proves nothing. These operations always refuse an existing destination; they never resume, overwrite, repair or delete an earlier bundle or abandoned staging. Ordinary failure removes only its own staging and prints no success. `tools/AGENTS.md` inventories every final and scratch path.

`exact-frames` success returns `ok`, `output`, `operations: ["exact-frames"]`, `manifest`, `record_identity`, `completion`, verified unique-image `frames`, and every `requests` row. `composite` returns `ok`, `output`, `operations: ["composite"]`, `segment`, `receipt`, `record_identity`, `completion`, segment `bytes/sha256`, base `frames/fps`, `active_interval` and `footprint`. `composite-alpha` returns the success fields in Output, including its policy/support versions. Missing caller inputs: ask before running. A refused media or readback check: correct that cause and select a fresh destination. These operations select no evidence or tolerances for the caller.

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
- **The video:** exactly one video stream and no audio stream, with every frame's presentation time in display order within half a frame of `t(0) + n / fps`. A video that already carries audio is refused, since mixing is not here. Its stream is copied: the output's video packets and their times are the input's, bit for bit.
- **The audio file:** exactly one audio stream, mono or stereo, and no video stream. At 48 kHz its samples are used as they are. At another rate they are resampled to 48 kHz with the resampler's delay removed, so the first output sample is the first source sample.
- **The track:** it begins at `--audio-start` and runs exactly to the video's end. Narration that would run past that end is refused, never cut. It is written as 24-bit PCM, its channel count kept.

**`loudness`** sets one video's sound to `--target` and keeps its picture.
- **The input:** exactly one video stream and exactly one audio stream. The video stream is copied, and every audio sample keeps its time.
- **The measure:** integrated loudness and range on all channels together, and true peak as the maximum of each channel measured separately as mono, by EBU R128 (`ebur128` with true peak).
- **The level:** a gain alone, wherever the gained true peak stays at or under `--true-peak`. Otherwise the gain and a limiter run at four times the sample rate. Either way the gain is corrected until the 48 kHz working audio reads within 0.3 LU of the target, and the written file must then read within 0.5 LU, or it is refused.
- **The output:** 24-bit PCM at 48 kHz, its channel count kept.

Audio with no gated block, nothing above EBU R128's −70 LUFS floor, has no loudness to set and is refused. A caller matching several scenes runs `loudness` on each at one target. Each target applies to the file it writes, so a mono scene is measured as mono.

**`finish`** joins one or more videos in the order given and encodes them once.
- **Its inputs:** each has one video stream, `yuv420p` tagged BT.709 at TV range with no display matrix, and all share one size and one frame rate, with every frame's presentation time in display order within half a frame of `t(0) + n / fps`. Each has at most one audio stream, of one or two channels.
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
| `node scripts/edit.js conform <required flags above>` | Conform one audio-witnessed video to an exact silent grid | New segment/receipt/completion bundle |
| `node scripts/edit.js exact-frames <required flags above>` | Extract exact decoded ordinal images and crops | New PNG/manifest/completion bundle |
| `node scripts/edit.js composite <required flags above>` | Apply one timed silent inset | New segment/receipt/completion bundle |
| `node scripts/edit.js composite-alpha --base <local.mp4> --base-sha256 <HEX> --layer <frames-directory> --layer-manifest-sha256 <HEX> --layer-first-index <n> --layer-alpha straight --layer-colour bt709 --output <new-directory>` | Apply one full-frame RGBA sequence; even dimensions at most 8192 each and 2073600 pixels, 1–27000 frames, PNG at most 64 MiB, manifest at most 27000 lines of 83 bytes; streams 14 bytes/pixel/frame (at most 784 GB), scratch beyond segment under 64 MiB | New segment/receipt/completion bundle |
| `node scripts/edit.js mux --input <video.mp4> --audio <file> [--audio-start <seconds>] --output <path.mp4>` | Lay one audio file onto one silent video | One MP4 |
| `node scripts/edit.js loudness --input <path> --output <path.mp4> --target <LUFS> --true-peak <dBTP>` | Set one video's loudness, its picture copied | One MP4 |
| `node scripts/edit.js finish --input <path> [--input <path> ...] --output <path.mp4> --target <LUFS> --true-peak <dBTP>` | Join videos and encode them once to YouTube's recommended settings | One MP4 |

Options for the existing commands (the four exact operations have their complete flag tables above):

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

`conform`, `exact-frames`, `composite` and `composite-alpha` write the new bundles described above. Other outputs are MP4 for every command but `frames` and `gif`, GIF for `gif`, and the extension has to say so. `edit` and `concat` re-encode to H.264 with AAC audio every run; `mux` and `loudness` copy the picture; `finish` encodes as Sound and the final encode says. Paths are absolute because a relative one resolves against whichever directory the caller happened to be in. This tool never picks an output location and never falls back to one: the caller resolves a work directory in the owning root per `standards/conventions.md` and names the file inside it. Missing parent directories are created by older file-output commands, which replace a file already there. The four exact operations require existing parents and fresh bundles.

No command takes `--env`. Nothing it does is destructive beyond writing what it was told to write, so no command takes `--confirm`.

## Script Contract

The scripts this tool ships, `scripts/edit.js` and the modules it imports beside it, follow `system/templates/Script Contract.md`; what a user meets when running them is `tools/RUNNING.md`. They import no package, so the contract's dependency install clause has nothing to install and its `--env` clause has nothing to bind. The sections above state what each command does; the contract states how the script behaves getting there.

Flag and path mistakes are caught before FFmpeg is reached; decoded bounds are checked after reading the media. No message repeats FFmpeg's own output, which quotes full paths and whatever the container's metadata holds; a run that fails names the operation and the cause instead. When FFmpeg fails after opening a file destination (`edit`, `concat`, `gif`), any partial or zero-byte file left at `--output` is removed before the error is printed; `mux`, `loudness` and `finish` never write `--output` until their file has passed its checks. The four exact operations publish only their complete checked bundles. A sampled `frames` directory is left as it is. Nothing is read from stdin, and FFmpeg is run with stdin closed.

## Output

One JSON object on stdout, exit 0, once the work is written. For `composite-alpha`:

| Output | Carries |
|--------|---------|
| Success JSON | `ok: true`, `output`, `operations: ["composite-alpha"]`, `segment`, `receipt`, `record_identity` (receipt bytes/SHA-256), `completion`, segment `bytes` and `sha256`, exact `frames` and rational `fps`, `policy: composite-alpha-policy/1`, `support: composite-alpha-support/1` |
| `receipt.json` | `schema: video-composite-alpha`, `version: 1`, `tool_version`, `policy`, `inputs.base`, `inputs.layer` with `manifest` and `frames`, `clocks` with `base.stream`, `base.frames`, `base.first_pts`, `base.edit_list`, `rate` and `time_base`, `mapping`, `encoder`, `decoder`, `output`, and `readback.checks`, `readback.frames`, `readback.frame_sha256`, as Full-frame alpha composition specifies |

The other exact-operation result fields are specified above; this table covers the older commands.

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
| `missing … libx264 encoder`, `libopus encoder` or `png encoder` | The FFmpeg build lacks the encoder the requested operation needs | Same clause; use the operation-specific encoder requirements in Dependencies |
| `Error: --input is required` | No video was named | Pass `--input <path>` |
| `Error: --input must be absolute` | A relative path, which resolves against the caller's directory, or a web address, which is not a path at all | Pass the resolved absolute path of a local file; this tool reads nothing over a network |
| `Error: no file at <path>` | The path does not exist | Check the path; an absolute one cannot be misread |
| `Error: --output is required` | No destination was named | Resolve a work directory in the owning root and name the file; this tool picks no location |
| `Error: --output must end .mp4 for edit` | An extension the command does not write | Name an MP4 for `edit`, `concat`, `mux`, `loudness` or `finish`, a GIF for `gif`, or the directory the requested bundle/extraction command requires |
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
| `Error: <command>: input <path> is not at a constant frame rate; …` | `mux` or `finish` found frame presentation times outside half a frame of `t(0) + n / fps` | Pass a constant-rate video; container timestamp rounding within half a frame is accepted |
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

### Full-frame alpha composition refusals

These are the message bodies from `composite-alpha.js` and `evidence-media.js`. Each is wrapped by the shared error prefix and correction/help suffix. Expressions written as `${...}` below are the source's placeholders, replaced by the failing flag, field, chunk or sample in a run.

| Message body | Cause | Fix |
|--------------|-------|-----|
| `unknown or inapplicable option ${k}`, `${k} was given twice`, `${k} needs a value`, `--${k} is required` | An unknown, repeated, valueless or missing flag | Supply exactly the eight required flags once each, with values |
| `--${k} must be 64 hexadecimal digits` | An expected identity is malformed | Pass the complete base or manifest SHA-256 |
| `${label} must be an integer from ${min} to ${max}` | First index or a measured dimension is outside its integer range | Use index 0 through 999999 and a base within the declared dimension bounds |
| `--layer-alpha supports only straight`, `--layer-colour supports only bt709` | Unsupported alpha or colour declaration | Supply straight RGBA interpreted as BT.709, and declare both supported values |
| `paths must be absolute and outside protected memory or credential paths`, `--layer must be absolute and outside protected paths`, `--layer resolves to a protected path` | A path is relative or protected | Name absolute local media in an unprotected work directory |
| `path cannot be canonicalized or its parent does not exist` | A source is absent or a destination parent is missing | Correct the source path or supply an existing output parent |
| `path resolves to a protected path or inside this tool directory` | A resolved path reaches protected data or the output is inside this tool | Use an unprotected work directory outside the tool |
| `source must be a regular file with one link`, `source must be a regular file with one link, never a symbolic link`, `layer must be an unlinked directory` | An input or layer directory fails its file/link check | Supply the canonical regular one-link source files and a real layer directory with regular one-link entries |
| `--base must be a local .mp4` | The resolved base has another extension | Supply the retained local MP4 |
| `missing ${bin}; check: ${bin} -version`, `missing libx264 encoder; check: ffmpeg -encoders`, `missing png decoder; check: ffmpeg -decoders`, `missing ${name} filter; check: ffmpeg -filters` | FFmpeg, ffprobe, libx264, the png decoder, setsar or setparams is unavailable | Follow the Script Contract's System dependencies clause for the command's own checks |
| `source SHA-256 differs from expected identity` | The base or manifest differs from the pinned identity | Verify the intended retained input and pass its correct expected hash |
| `require one video stream; composite refuses audio and extra streams` | The base carries audio, another stream or no single video | Supply a base containing only its silent video stream |
| `only progressive square-pixel H.264 yuv420p is supported`, `stored dimensions must be even`, `changing or interlaced geometry is unsupported` | Unsupported format, geometry or interlacing | Prepare a progressive square-pixel H.264 yuv420p base at fixed even dimensions |
| `unsupported or unresolved ${k}; require tagged BT.709 TV`, `rotation or display matrix is unsupported` | Missing/contradictory colour tags or orientation metadata | Supply upright stored pixels with explicit BT.709 TV tags |
| `decoded frame count must be 1..100000` | Shared inspection found no frames or exceeded its own ceiling | Supply a decodable base within alpha composition's stricter 1 through 27000 frame bound |
| `missing or unsafe decoded presentation timestamp`, `missing, duplicate or non-increasing presentation timestamps`, `unusable time base`, `unsupported rate or clock`, `every decoded frame must occupy the exact constant grid` | An unusable timestamp, time base or nonexact frame grid | Supply the exact zero-origin rational CFR grid described above |
| `composite requires zero picture origin and no edit list`, `composite-alpha requires zero picture origin and no edit list but one identity edit` | The base has a nonzero origin or a nonidentity edit | Supply a zero-origin base with no edit list or the one permitted identity edit |
| `malformed or truncated MP4 edit-list structure`, `composite-alpha requires exactly one identity edit` | Malformed edit boxes or an edit list with another entry count | Supply a valid single-track base with no edit list or exactly the permitted identity entry |
| `picture, frame count, index or streamed-byte bound exceeded` | Pixel area, count, final index or total streamed bytes exceeds a bound | Shorten the sequence, reduce its dimensions or correct the first index within the stated limits |
| `layer directory must contain exactly frames.sha256 and the requested indexed PNG frames` | Missing, extra, hidden, duplicate-numbered or wrongly indexed entries | Supply only the manifest and exactly N six-digit indexed PNGs |
| `frames.sha256 exceeds 27000 lines of 83 bytes`, `frames.sha256 must contain exactly one 83-byte line per frame`, `frames.sha256 line syntax, order or frame name mismatch` | Oversized or malformed manifest, incorrect names/order/count | Use the exact ordered decoded-RGBA manifest format above and pin its file hash |
| `layer PNG exceeds 64 MiB`, `layer frame is not a bounded PNG` | An oversized frame or invalid PNG signature | Supply valid PNG frames of at most 64 MiB each |
| `invalid PNG chunk layout`, `truncated PNG chunk`, `PNG chunk CRC mismatch`, `PNG IHDR must be first`, `PNG IDAT chunks must be consecutive`, `invalid PNG pHYs chunk`, `invalid PNG IEND`, `PNG requires IHDR, IDAT and IEND` | Corrupt or malformed PNG structure | Regenerate valid frames with the accepted chunk structure |
| `unsupported PNG chunk ${type.replace(/[^A-Za-z]/g, '?')}` | A colour, palette or other unsupported chunk is present | Produce the declared straight RGBA sequence with only IHDR, IDAT, IEND and optional pHYs |
| `PNG must be same-size noninterlaced 8-bit straight RGBA`, `layer frame must probe as one same-size rgba PNG` | Wrong size, depth, colour type, interlace or decoded format | Supply noninterlaced 8-bit RGBA PNGs at the base's exact dimensions |
| `layer decoded RGBA SHA-256 differs from manifest` | A construction or verification decode disagrees with the line's hash | Verify the frame and decoded-RGBA manifest together, then rerun to a fresh destination |
| `receipt and completion scratch exceeds 64 MiB` | Record size exceeds the scratch bound | Reduce sequence length or unusually large path/record inputs |
| `media subprocess output exceeded its bound`, `decoder returned a partial frame`, `base decoded frame count increased`, `base decoded frame count decreased`, `independent decoded frame count decreased`, `independent decoded frame count increased` | A decode or subprocess returned unexpected size/count | Verify unchanged decodable inputs, then rerun to a fresh destination; report a repeat |
| `encoder closed before FIFO input was opened`, `encoder closed before all frames were written`, `FIFO write made no progress` | The encoder or FIFO failed during streaming | Check local encoder/FIFO support and writable storage, then rerun to a fresh destination |
| `output intermediate geometry/count/clock changed` | Encoded output no longer matches the base | Rerun to a fresh destination and report a repeated read-back failure |
| `independent readback ${mismatch.protected ? 'protected' : 'expected'} sample mismatch at frame ${n}, plane ${mismatch.plane}, ${mismatch.x},${mismatch.y}` | A stored sample differs from its protected base or independent policy expectation | Treat the run as refused; report the frame/plane/location and rerun only to a fresh destination |
| `source identity changed during operation` | A base, manifest or PNG changed before publication | Keep all retained sources unchanged for the entire run and verify their identities before retrying |
| `staged manifest/receipt readback failed`, `staged artifact identity changed`, `completion marker readback failed` | A staged record, segment or completion marker failed verification | Inspect local storage and retry to a fresh destination; report a repeat |
| `destination already exists (complete or incomplete)`, `destination collision or unusable publication directory`, `bundle publication failed; inspect any incomplete destination before choosing a fresh one` | A preexisting/late destination, unusable parent or failed publication | Inspect any incomplete destination and choose a fresh directory under an existing writable parent; never overwrite an earlier bundle |
| `${bin} could not complete media readback (decoder diagnostics withheld)`, `composite-alpha could not complete local media processing (diagnostics withheld)` | Local media probing, decoding, encoding or filesystem work failed; raw diagnostics are withheld | Verify the local inputs, command dependencies, FIFO support and storage, then retry to a fresh destination |

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
- `conform` publishes only a complete checked silent intermediate with every decoded frame matching its declared source interval, policy comparisons and input identities. Run `npm test` for the unchanged old suites and offline synthetic conform/negative-control suite, all fixtures in system temporary storage.
- `exact-frames` retains every requested association with independently verified ordinal/crop pixels, times and identities; stale PNGs cannot inflate success. `composite` preserves the exact base clock and every planar sample outside its interval/footprint and matches the declared scaled inset/border inside. `npm test` exercises full/crop evidence from conform and composite plus planted faults, cleanup and interruption recovery offline.
- `composite-alpha` exits 0 with one JSON object only after every frame's independent sample/clock/identity checks and publication of exactly `segment.mp4`, `receipt.json` and `complete.json` succeed. The segment keeps the base's exact clock and every stored sample outside `composite-alpha-support/1`, and matches `composite-alpha-policy/1` everywhere else; nothing is promised about displayed colour beside a glyph or after `finish`.
- Its receipt binds the expected/measured sources, decoded layer hashes, policy/support versions, mapping, builds/settings and every output frame hash; its completion marker binds both segment and receipt bytes/hashes. Every refusal leaves stdout empty and exits 1, cleaning only its own staging/reservation. `npm test` includes offline alpha fixtures, independent arithmetic checks, planted faults, bounds and cleanup checks in system temporary storage.
- No run opens a network connection, reads stdin, repeats FFmpeg's own output, or writes anywhere other than the caller's deliverable and the scratch/staging paths inventoried in `tools/AGENTS.md`. Ordinary failure removes only this run's partial file or staging, never retained sources or an earlier bundle.
