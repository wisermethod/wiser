---
name: xai
type: connector
category: media
description: Synthesizes MP3 speech to a local file with word or character timings, and lists built-in and team custom voices through xAI
version: 0.1.0
---

# xAI

Generate speech from text and list the voices available to the connected xAI team. One `voice` module uses an ordinary API key held by the gateway's provider.

## Status

Added 2026-10-20. Verified through fake-provider gateway tests, schema agreement, guide conformance, toolkit mapping and manifest/export checks.

## Reaching it

Invoke through the gateway's `execute` tool, by action id. Every action rejects undeclared input keys. Every action uses proxy execution, without token unwrapping or a catalog fallback.

| Action id | Input | Risk | Confirmation |
|-----------|-------|------|--------------|
| `xai.voice.synthesize` | `text`, `voice_id`, `language`; optional `speed`, `sample_rate`, `bit_rate`, `text_normalization`, `timings` | medium | none |
| `xai.voice.list_voices` | `{}` | low | none |
| `xai.voice.list_custom_voices` | Optional `limit`, `pagination_token` | low | none |

`synthesize` runs on the local gateway only because the gateway writes its audio to a file. A hosted call returns `local_only` before transport. The two listing actions need no file output and can run through either gateway route.

### Speech input and request

- `text` is required, from 1 to 5,000 Unicode code points, including tags and whitespace. The module refuses 5,001 code points before calling the proxy; a supplementary character counts once.
- `voice_id` is required, 1 to 64 lowercase ASCII letters or digits, matching `^[a-z0-9]{1,64}$`. A custom id is not assumed to be eight characters.
- `language` is required and matches `^(auto|[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*)$`. xAI decides which matching languages and voice ids it supports.
- `speed`, when supplied, is a number from 0.7 to 1.5 inclusive. When absent it is left to xAI.
- `sample_rate` is one of 22050, 24000, 44100 or 48000 Hz; absent means 48000.
- `bit_rate` is one of 64000, 96000, 128000 or 192000 bits per second; absent means 192000.
- `text_normalization` is an optional boolean, sent only when supplied, including `false`.
- `timings` is `words` (default), `characters` or `none`. It is a local projection option and is never sent to xAI.

The module calls `POST /v1/tts` on the toolkit's own API host, sending `text`, `voice_id`, `language`, `output_format: { codec: "mp3", sample_rate, bit_rate }`, and always `with_timestamps: true`. Only supplied `speed` and `text_normalization` are added. The envelope is required even with `timings: "none"`: the proxy does not reliably carry the default raw MP3 response.

### Answer and file

Before returning a file slot, the module requires an object containing nonempty strict standard base64 `audio` that decodes and re-encodes identically, `content_type: "audio/mpeg"`, a finite positive numeric `duration`, and equal-length `audio_timestamps.graph_chars` and `graph_times` arrays. Character entries must be strings and each time entry must be a pair of finite numbers. An unexpected answer returns exactly `{ status: 'vendor_error', endpoint: '/v1/tts', method: 'POST', reason: 'unexpected answer' }`, without a file slot or any vendor body.

A success returns `duration`, `content_type`, `voice_id`, `characters` (code points sent), optional `timings`, and `file: { path, bytes, sha256, media_type }`. The module passes decoded bytes only in `output_file: { media_type: 'audio/mpeg', data }`; the gateway consumes that slot and writes a new MP3 under its own `outputs/`. Neither audio bytes nor their base64 are returned in the result or audit. The manifest declares only `audio/mpeg` with a maximum of 16,777,216 bytes (16 MiB). Output naming, access modes and retention belong to `gateway/AGENTS.md`; file outputs must be filed elsewhere before their seven-day cleanup.

- `words`: `timings` is an array of `{ text, start, end }`. Complete square-bracket and angle-bracket tags, such as `[pause]`, `[breath]`, `<emphasis>` and `</emphasis>`, are dropped. Remaining whitespace separates words; punctuation stays attached. A tag inside a word does not split it. Start and end come from the first and last retained character's timing, in seconds.
- `characters`: `timings` is `{ graph_chars, graph_times }`, preserving the two arrays as xAI sent them, including tags.
- `none`: the result has no `timings` property.

The 5,000-character envelope's passage through the proxy has not been verified end to end. Fake tests prove the local cap and file contract; a live call at the cap remains a separate verification.

### Voice lists

`list_voices` calls `GET /v1/tts/voices` and returns `{ voices: [{ voice_id, name }] }`.

`list_custom_voices` calls `GET /v1/custom-voices`. Optional `limit` is an integer from 1 to 1000 inclusive, checked by the module; optional `pagination_token` is a nonempty string. Both are passed as query parameters, with their values encoded by the proxy. No default limit is added.

Custom voices retain `voice_id`, `name`, and language or creation fields whose values are plain strings. Those extra field names start with `language`, `created` or `creation`, followed by the end of the name, an underscore or a capital letter, covering `language`, `language_code`, `created_at` and `createdAt`. Other fields, nested data and non-string values are dropped. Either listing retains a string `pagination_token` when present. A non-object answer, missing voices array, or voice without string `voice_id` and `name` returns `vendor_error` with its endpoint, `method: 'GET'` and `reason: 'unexpected answer'`; no vendor body is returned.

## Credentials and module

| Module | Grant privilege | Actions |
|--------|-----------------|---------|
| `voice` | write | `synthesize`, `list_voices`, `list_custom_voices` |

Generation creates billed output, so the ordinary key's grant is `write`. Both reads share that key and module. This connector holds no credential and uses no local vendor-key file or Provides secret binding. `auth.md` describes hosted connect and revocation.

## Destructive Actions

| Action | Effect | Worst case per call | Confirmation |
|--------|--------|---------------------|--------------|
| `xai.voice.synthesize` | Creates billed speech and a new local output file; incurred charges cannot be undone | $0.075 for 5,000 characters at $15.00 per million characters | none |

The base rate and worst case use xAI's [pricing](https://docs.x.ai/developers/pricing), read 2026-10-20 in the approved plan's evidence. The action's published `maxLength: 5000` bounds its only cost-driving input and the module enforces that bound in code points. It deletes, overwrites, sends and publishes nothing. The voice-list reads have no confirmation stop.

## Excluded

Streaming, WebSockets, creating, editing or deleting custom voices, `replace`, codecs other than MP3, `optimize_streaming_latency`, speech to text, chat, images, video and every other xAI operation. Voice cloning is outside this connector; its consent decision belongs to the calling production workflow.

## Troubleshooting

- `needs_connect`: connect service `xai`, module `voice`, following `auth.md`.
- `local_only`: attach and use the local stdio gateway for `synthesize`.
- `invalid_arguments`: correct the named field against the input rules above.
- `needs_provider_capability`: the gateway's provider cannot proxy the request; have its setup checked.
- `vendor_error` with HTTP 401 or 403: check the key's team and Voice permissions, and reconnect if required.
- `vendor_error` with HTTP 429: wait for the team's current xAI rate limit to reset before deciding on another call.
- `vendor_error` with `reason: 'unexpected answer'`: stop and report the endpoint and reason; no audio was written.
- `vendor_error` with `reason: 'output_refused'`: follow the gateway's file-output detail; no file metadata or bytes are returned for that refusal.

## Reference

- How to connect: `auth.md`
- Gateway contract and file outputs: `gateway/AGENTS.md`
- Published input rules: `standards/script-contract.md`, Published input schema
- [xAI speech documentation](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
- [xAI pricing](https://docs.x.ai/developers/pricing)
