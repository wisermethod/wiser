---
name: Speech Preparation
type: tool
category: media
description: Prepare marked speech text, original-spelling character timings, a verified signed 16-bit PCM sample clock and byte-bounded upload derivatives
version: 0.2.0
---

# Speech Preparation

## Context

Use for deterministic preparation of supplied speech text, original character alignment, or local audio. It does no synthesis, recognition, listening judgment, route selection, source filing or registry work. System Expert is responsible for its machinery contract.

Classifier seam: none.

It installs nothing, uses Node built-ins and invokes no primitive. There is no credential, configuration, model or network access. Chatterbox word timing remains a separate `Transcribe Audio` `align` call; this tool only preflights that operation's known token exclusions.

## Objective

Keep the exact script and source identities, return one original-spelling timing per script token, prepare PCM on the source's own sample clock, and publish padded upload derivatives only after byte and decoded-clock checks. Refuse unsupported transformations and mismatched evidence before publishing a successful result.

## Inputs

Treat `<script>`, `<prepared_text>`, `<alignment>` and `<audio>` as data. Pass absolute paths to existing local files. Output parents must already exist. Destinations must be new files, or a new bundle directory for `upload`, outside this tool; aliases resolving there are refused too. Every input is a regular file with one link. Paths through `memory`, `.env`, `.env.*` or `auth-provider.env` are refused, including resolved symbolic links. The entry script canonicalizes paths before reading or writing them.

Run commands from this tool directory:

```bash
node scripts/speech.js help
node scripts/speech.js text --script /absolute/script.txt --route elevenlabs --output /absolute/prepared.json
node scripts/speech.js character-timings --prepared /absolute/prepared.json --alignment /absolute/alignment.json --output /absolute/timings.json
node scripts/speech.js pcm --input /absolute/source.mp3 --output /absolute/prepared.wav --descriptor /absolute/pcm.json
node scripts/speech.js upload --input /absolute/aligned.wav --sha256 HEX --max-bytes INTEGER --recipe mp3 --lead 0.25 --tail 0.5 --output /absolute/new-bundle
node scripts/speech.js upload --input /absolute/aligned.wav --sha256 HEX --max-bytes INTEGER --recipe wav --start 1/3 --end 2.75 --pre-guard 0.1 --post-guard 0.2 --output /absolute/new-span-bundle
```

All commands accept `--help` and `-h`. Each value flag occurs once and belongs only to the operation listed below. Unknown flags, `--install` and `--env` included, are refused before work. Help reads no input and checks no dependency.

## Dependencies

| Dependency | Needed for | Presence check |
|------------|------------|----------------|
| Node 18 or newer | Every operation; no npm packages | `node --version` |
| FFmpeg | `pcm` conversion; `upload` encoding and decoded readback | `ffmpeg -version` |
| ffprobe | `pcm` and `upload` probing and readback | `ffprobe -version` |
| FFmpeg's libmp3lame encoder | Only `upload --recipe mp3` | `ffmpeg -encoders` (must list `libmp3lame`) |

Only `pcm` and `upload` run the FFmpeg/ffprobe checks. Only the MP3 upload recipe checks libmp3lame. Missing dependencies stop by name, per `standards/script-contract.md` System dependencies.

## Operations

### text

Required: `--script` (exact UTF-8 file), `--route` (`elevenlabs`, `chatterbox` or `heygen`), `--output` (new JSON file). Optional: `--route-text` (new UTF-8 file containing exactly the submitted text, no added newline), `--words` (new JSON array of the script tokens, ready for Chatterbox `--words` and English alignment). The stdout object and `--output` JSON have the same content:

| Field | Meaning |
|-------|---------|
| `version`, `route` | Evidence format `1`, selected route |
| `script` | Exact `text`, Unicode `code_points`, UTF-8 `sha256` |
| `submitted` | Route `text`, its `code_points` and UTF-8 `sha256` |
| `tokens`, `words` | Original-spelling tokens, in order; tags removed without adding spaces, then split on whitespace. `words` is the separate array artifact's content |
| `correspondence` | One entry per token, in order: `script_index`, `script_token`, `route_word`, `route_start`, `route_end`, `spoken_start`, `spoken_end` |

All offsets are zero-based Unicode code points in `submitted.text`, end-exclusive. Route ranges contain the transformed whitespace word, including its original attached punctuation and any added ellipsis. Spoken ranges run from its first letter/digit/combining mark through its last, excluding edge punctuation and any added pause punctuation. Repeated words retain separate indices; Chatterbox pause marks are outside the word ranges.

The script supports only `[pause]` and non-nested `<emphasis>…</emphasis>`. Emphasis can sit inside a token without splitting it. Route whitespace collapses to single spaces and trims its edges; script bytes never change. `elevenlabs` prepares `eleven_v4`: emphasis becomes capitals, a pause appends `...`, or `..` after a terminal period so that `word.` becomes `word...`. Other sentence punctuation stays before the ellipsis. `chatterbox` removes emphasis markup and inserts `<#0.5#>` between passages, keeping spoken spelling and punctuation unchanged.

`heygen` prepares plain words for the instant voice used by `heygen.speech.synthesize`: emphasis markup and `[pause]` marks are removed, with spoken spelling and punctuation unchanged and the same collapsed whitespace. It adds no SSML, pause punctuation or case changes. Its correspondence has the same fields and code-point offsets; Chatterbox's English-aligner token exclusions do not apply.

Refusals: invalid UTF-8/Unicode, unknown or malformed square/angle tags, unclosed/stray/nested/empty emphasis, no speech tokens, a token with no letter or digit, unsupported controls, NEXT LINE (U+0085) among them since a cue counter does not split on it, a pause inside a token, leading/trailing pauses or repeated pauses without intervening words, a script or submitted text over 5,000 code points. Chatterbox also refuses tokens the English aligner cannot represent: after its declared curly-quote and edge-punctuation normalization, only ASCII English letters and internal apostrophes remain. Digits, accents and hyphens are refused, never rewritten. This checks token eligibility, not the language of the passage; the caller still supplies English truthfully. Every validation refusal writes nothing, including optional artifacts.

### character-timings

Required: `--prepared` (the complete `text` result for `elevenlabs` or `heygen`), `--alignment` (the route's original character timing object), `--output` (new JSON array). For `elevenlabs`, use the connector's original `alignment` object with `characters`, `character_start_times_seconds` and `character_end_times_seconds` from `connectors/elevenlabs/CONNECTOR.md`, without a transport envelope or normalized alignment. For `heygen`, use only `{"original_characters":[{"text":"G","start_time":0,"end_time":0.1},…]}` from `connectors/heygen/CONNECTOR.md`, with one entry per character and times in seconds, without the rest of the synthesis result. Each entry has exactly those three keys.

The script regenerates preparation from its exact script and route and compares every field, including hashes and correspondence. The characters must be the submitted text's code points one for one, in order, so a surrogate half is refused. ElevenLabs' three arrays must be nonempty and equal in length; HeyGen's `original_characters` must be nonempty. Bounds must be actual finite nonnegative numbers, end at least start, with nondecreasing starts and ends. Extra alignment keys, missing words, changed characters, malformed preparation, duplicate JSON keys and invalid times are refused, with no output.

The file contains exactly one `{text, start, end}` per script token, in original spelling/order, in seconds. Its bounds come from the first/last spoken character, excluding pause punctuation. Stdout returns `ok: true`, `output`, `words` (count), and `timings` (the same array). These are supplied alignment bounds; the caller separately checks them against the actual audio duration and checks that speech was present.

### pcm

Required: `--input` (PCM `.wav` or `.mp3`) and `--output` (new `.wav`). Optional: `--descriptor` (new JSON file containing the stdout descriptor). There must be exactly one audio stream and no other media streams. The resolved extension chooses a forced local demuxer; FFmpeg/ffprobe protocols are limited to local files/pipes.

| Source evidence | `basis` | `removed` | `stated` | WAV |
|-----------------|---------|-----------|----------|-----|
| PCM WAV | `pcm` | `0` | `null` | Signed 16-bit PCM, original rate, channels and sample count |
| MP3 first packet has valid Skip Samples side data | `header_skip_samples` | `0` | Header `skip_samples` integer | FFmpeg applies the header skip; no manual trim |
| MP3 has no such header and bytes contain `LAME` followed by a digit | `lame_no_header` | `1105` | `null` | Trim 1105 samples at the source's own rate |
| MP3 has neither | `unknown` | `0` | `null` | None; `usable: false`, no successful audio preparation |

Malformed skip metadata is refused, never treated as a missing header. Conversion uses `-n -v error`, `-map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a pcm_s16le`, adding only `-af atrim=start_sample=1105` in the LAME-without-header arm. There is no resampling, level adjustment or other trim. Exit 0, empty stdout/stderr and an existing WAV are all required. Readback requires codec `pcm_s16le`, unchanged rate/channels, `time_base` exactly `1/<rate>`, and positive whole `duration_ts` as the sample count. A WAV source must retain its original count too.

The descriptor returns `ok: true`, `usable`, `basis`, `removed`, `stated`, `rate`, `channels`, `codec`, `time_base`, `sample_count`, `bytes`, `sha256`, `output`, and `source`. `source` contains the canonical `path` and `before`/`after` objects, each with measured `bytes` and `sha256`, which must agree. WAV measurements are read after conversion. For `unknown`, WAV fields (`codec`, `time_base`, `sample_count`, `bytes`, `sha256`, `output`) are null, and the source is still checked before/after. An optional descriptor may record that unusable result; no WAV is written. Does `usable` equal true? Yes: return the prepared WAV and measurements. No: return the unknown-delay evidence to the caller and stop work that needs aligned audio.

### upload

Required: `--input` (verified aligned signed 16-bit PCM `.wav`), `--sha256` (expected complete-source SHA-256, 64 hexadecimal digits), `--max-bytes` (positive safe integer, inclusive complete-upload byte ceiling), `--recipe` (`mp3` or `wav`) and `--output` (new bundle directory). Which interval is required? Whole source: supply both `--lead` and `--tail`. Half-open source span: supply all of `--start`, `--end`, `--pre-guard`, `--post-guard`. Mixing modes, omitting a padding value or passing an inapplicable flag is refused. The caller supplies the destination's ceiling; this tool holds no vendor limit, selects no take and performs no upload.

All seconds are nonnegative decimal strings (`0.125`) or integer fractions (`1/8`), at most 128 characters; exponents, signs and implicit defaults are refused. Every cut and silence uses exact integer rational arithmetic: round `seconds * source_rate` to the nearest sample, ties upward. The requested half-open span must be nonempty and inside the source before rounding, and its rounded sample bounds must also be nonempty and inside. No clipping to the source is allowed. Each requested time, reduced rational, actual sample count/time and signed rounding residual is recorded. Lead, tail and guards are inserted zero-valued PCM samples, never neighbouring source samples or spoken context. Span mode adds only its guards.

The supported source container is a complete little-endian RIFF WAV with one PCM16 format chunk (ordinary or extensible PCM), one nonempty data chunk and exactly one audio stream. Declared chunk lengths, file length, block alignment, sample count and decoder clock must agree. The padded WAV retains the original format chunk, including an extensible speaker mask; padded and WAV-upload readback must preserve the source's decoded channel layout as well as its rate/channels. Source and padded WAV are each bounded to 256 MiB, independently of the caller's upload ceiling; larger work is refused before staging. RF64, other bit depths/codecs and malformed/truncated files are refused. No resampling, normalization, split, truncation, recipe fallback or bitrate change is performed.

| Recipe | Fixed encoding |
|--------|----------------|
| `mp3` | FFmpeg `libmp3lame`, CBR 64 kbit/s (`-b:a 64k -abr 0`), mono (`-ac 1`), original rate, gapless Xing/Info header (`-write_xing 1`), no ID3v2 tag. Supported unchanged rates: 8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000 Hz. FFmpeg's channel-layout downmix is the recipe's sole mixdown. |
| `wav` | FFmpeg `pcm_s16le`, original rate and channels. Retained PCM and inserted silence must read back byte-for-byte. |

Both recipes strip input metadata and set FFmpeg's bitexact flags. The receipt records the full FFmpeg build/version and argument vector; the encoder version is that build's encoder, not a separately installed LAME binary. The fixed MP3 recipe is a mechanical quality policy, with a normalized correlation floor of 0.90. It makes no claim about perceptual speech quality or a vendor's interpretation. Byte repeatability is scoped to the same encoder build/settings.

The tool reopens the complete encoded file, verifies container, single stream, codec, rate and channels, then decodes it to PCM16 with local-only protocols and fatal decode errors. The actual decoded count must equal the padded count. MP3 packet durations minus measured header skip and discard padding must explain that count as a count identity only; position is established independently by the clock below, and readback bitrate must be 64000 bit/s. The first Xing/Info frame's LAME-compatible extension supplies its encoder identifier, encoder priming and encoder end padding. Subtract that measured encoder priming from the decoder's header skip to establish decoder priming; encoder end padding minus decoder priming must equal the decoder's end discard. Missing or inconsistent gapless metadata, or a total header skip outside any window's actual searched lags (in either direction, within the 4096-sample radius), is refused. The priming/end-padding reconciliation is also a count identity; it does not establish the position of samples. FFmpeg applies header corrections once; no manual 1105-sample correction is used. The receipt distinguishes all these readings, zero resampler delay and measured residual displacement. The decoder's first retained sample is normalized to upload sample zero; original stream timing metadata remains in the readback.

Clock verification is `thirds-normalized-xcorr-v2`. Use windows of at most 4096 samples whose start positions are inset by at least 4096 samples from the beginning and whose ends are inset by at least 4096 samples from the end. Keep each witness entirely inside the retained source span `[pre, pre + end - start)`, excluding inserted lead/tail/guards; intersect this span with the padded-buffer inset bounds above. Partition the resulting eligible integer start positions into three contiguous thirds; in the first third, take the earliest useful 512-sample onset window, stepping 512 samples from that third's first position; in the other two thirds, take the highest-energy 4096-sample block, stepping 4096 samples (earliest wins energy ties). The short onset witness prevents a later loud periodic block from concealing missing leading audio. Refuse fewer than three eligible positions (including every padded clock shorter than 12290 samples), or any selected window below RMS 16 PCM16 units: three distinct useful windows must score. Every scored window searches the full integer lag range [-4096,4096], using real decoded samples throughout, with no zero fill. Reference self-correlation at either search edge must be more than 0.000001 below its zero-lag peak of 1; a repeating reference cannot establish a clock merely by hiding a rival at the edge. Normalize by the two window energies. Each decoded peak must be at least 0.90 and exceed every other candidate, including its immediate +/-1 sample neighbours, by at least 0.000001. Its lag must be exactly zero: tolerance is **0 samples**. MP3 analysis uses the encoder's FFmpeg mono conversion; lossless multichannel WAV uses the highest-energy original channel and separately verifies every channel's bytes. Silence, phase cancellation, ambiguity, low peaks and displaced windows refuse. The correlation receipt retains `search_radius_samples`, maximum `window_samples: 4096`, new `onset_window_samples: 512`, per-window `sample_count`, thresholds, `ambiguity_exclusion_samples: 0`, and every window's measured `lag`, `peak`, `runner_up_peak`, new `search_lags` (actual inclusive first/last searched lag), `scored_lags` (actual candidate count), and new `reference_edge_peaks` array of `{lag, peak}`. The correlation also records `retained_span` as the half-open upload-sample bounds and `edge_checks`: the first and last 4096 padded samples, each compared at lag zero only. Each edge row records `start_sample`, `sample_count`, `reference_rms_pcm16`, `decoded_rms_pcm16`, normalized `peak` (null for zero energy), and `both_silent`. Both RMS values strictly below 16 pass; exactly one below 16 refuses; when both are at least 16, correlation must be at least 0.90. These checks prevent an out-of-radius period shift from hiding in uncovered leading or trailing samples. Summary `lag_samples` is the median of the three measured lags. MP3 waveform equality and perfectly zero amplitudes at lossy silence boundaries are not promised.

The receipt's mapping is `source_sample = upload_sample + start_sample - before_silence_samples - measured_lag_samples`, valid only inside `retained_upload_start <= upload_sample < retained_upload_end`; outside are synthetic silence. `source_zero_at_upload_sample` can be negative for a span. Requested rationals, actual cuts and the mapping preserve full-source zero. `placement_48000` records the exact rational before-padding length on a 48000 Hz grid, the ceiling of the requested before-padding on that grid, and their signed difference, as well as source-zero time. These are comparisons for a later placer, not a sample-rate conversion or a picture-frame rounding.

The final complete-file size, headers included, must be `<= --max-bytes`: equality passes; an over-budget refusal names the actual bytes and ceiling. It never retries at lower quality. After source before/after identity, decoded clock, size and independently recomputed receipt mapping/byte identity all pass, the bundle is published with:

| Artifact | Meaning |
|----------|---------|
| `upload.mp3` or `upload.wav` | Checked upload bytes, distinct from the aligned source |
| `padded.wav` | Exact PCM used as the encoder input, with original rate/channels |
| `receipt.json` | `schema: speech-upload`, `version: 1`, tool version; source expected/before/after identity and clock; requested/actual interval and silence; recipe, encoder build/settings; padded/upload identities; decoded stream/count/clock, gapless evidence and correlation; source mapping and rational placement comparison |
| `complete.json` | `schema: speech-upload-complete`, `version: 1`, `complete: true`, complete-file byte counts and SHA-256 for the upload, padded WAV and receipt |

Stdout is one `{ok, output, receipt, receipt_identity, completion, upload, bytes, sha256}` object. `receipt_identity` hashes the written receipt; the receipt contains no self-hash. Is a retained bundle reusable? Only a final caller-named directory with a valid completion marker whose three identities match, plus the matching source/policy recorded in its receipt: use it. A staging sibling, missing marker, changed identity or mismatched policy: treat as incomplete and choose a fresh destination. The command itself always refuses an existing destination, complete or incomplete. After writing `complete.json`, it reopens the source WAV, compares the retained PCM to the cut used for encoding, rechecks the source identity and re-hashes all three recorded bundle files. Publication claims the final directory with exclusive `mkdir` and creates exclusive hard links to the checked staged files, linking `complete.json` last. This avoids directory rename's empty-destination replacement race without adding a platform dependency. The final directory is reusable only after its marker appears; publication is not a single atomic directory rename. An ordinary publication error removes only this run's staging and retains any newly claimed destination as incomplete. No existing directory or file is replaced or deleted. Inspect it and choose a fresh path. Earlier preparation failures create no final directory.

## Pitfalls

- Missing or ambiguous input: ask the caller for the missing script/route, original alignment or audio/destination. Never infer a route or use normalized alignment in place of original alignment.
- A validation refusal: correct the named input and retry with fresh destinations. No fallback parser, timing list or guessed delay is produced.
- A `text`, `character-timings` or `pcm` write or decoder/readback failure after publication starts: stdout stays empty and the new files can remain incomplete. Inspect retained evidence and choose fresh paths; the tool never overwrites or removes an earlier artifact. A kill can leave the same state. Optional outputs are preflighted together but are not an atomic group.
- An `upload` failure: no successful bundle or success JSON is published, and only this run's staging is removed. If exclusive publication already claimed a destination, retain it as incomplete; a completion marker is published last. A kill may leave a staging sibling; treat it as incomplete and retain it for inspection. A later run never removes another run's staging. Use a fresh destination after a failure; no operation repairs an existing bundle in place.
- A changed source: stop with its before/after identities. Never use that WAV as verified preparation.

## Script Contract

The script follows `system/templates/Script Contract.md`; running it follows `tools/RUNNING.md`. What it writes, including upload staging and decoded scratch, is inventoried once in `tools/AGENTS.md`. It creates no cache or consent marker. Run `npm test` from this directory; its runner copies the unchanged existing suites and the new suite to system temporary storage, runs them there, and removes its test work on exit.

## Success

- Text preserves exact script identity, transforms only declared marks/case/route whitespace and returns a one-to-one token correspondence.
- Character timings match that exact submitted text and return all original script tokens once, in order.
- Usable PCM passes format/clock readback and source-identity checks; unknown delay writes no WAV.
- Upload bundles pass exact cut/silence, source identity, recipe, decoded count/correlation, mapping and inclusive byte checks before their completion marker is published.
- An existing destination is refused, and help and text/timing operations work without FFmpeg, packages or configuration.
