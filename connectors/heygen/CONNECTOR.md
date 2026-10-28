---
name: heygen
type: connector
category: media
description: Synthesizes timestamped WAV speech to a local file, lists and manages instant voice clones, discovers avatar groups and looks, and reads API wallet and key permissions, confirming clone creation and deletion
version: 0.1.0
---

# HeyGen

Part 1 provides speech, voices, avatars and account reads. Part 2 adds assets and videos, including Avatar IV rendering and its standing approval. Those modules and actions are not shipped here.

## Status

Unreleased. Verified with offline fake-provider tests and gateway integration checks.

## Reaching it

Use the gateway's `execute` with these action ids. Inputs are closed objects. All lengths count Unicode code points; no text is trimmed, normalized or truncated. IDs match `^[A-Za-z0-9_-]{1,128}$`. Optional language tags match `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$`, at most 32 code points. Tokens contain 1 to 2,048 code points. Every request, including internal reads, has an inclusive 4,100,000-byte serialized proxy-envelope budget, measured before transport and enforced again on the exact serialization at send time.

| Action | Input | Confirmation | Result |
|--------|-------|--------------|--------|
| `heygen.speech.synthesize` | `text` (1 to 5,000), `voice_id`, explicit `model`; optional `language`, `expressiveness_boost` (0 to 1) | none | Voice/model ids, `characters`, vendor `duration`, WAV `sample_duration`, projected `original_characters`, gateway `file` |
| `heygen.voices.list` | Optional `type` (`private`, `public`), `limit` (integer 1 to 100), `token` | none | `voices`, `has_more`, `next_token` |
| `heygen.voices.get` | `voice_id` | none | Metadata under `voice` |
| `heygen.voices.add` | `name` (1 to 64), `path` (1 to 4,096), `idempotency_key`; optional `language`, `similarity`, `remove_background_noise` | always | `voice_id`, `accepted:true`, never readiness |
| `heygen.voices.delete` | `voice_id` | always | `deleted:true`, `voice_id`, only after vendor `data.status:ok` |
| `heygen.avatars.list` | Optional `ownership` (`public`, `private`), `limit` (integer 1 to 50), `token` | none | `groups`, `has_more`, `next_token` |
| `heygen.avatars.list_looks` | Optional `group_id`, `ownership`, `avatar_type`, `limit` (integer 1 to 50), `token` | none | `looks`, `has_more`, `next_token` |
| `heygen.account.wallet` | `{}` | none | Only `billing_type` and typed `wallet` currency/remaining balance, or null when unavailable |
| `heygen.account.permissions` | `{}` | none | Only non-secret `scope_mode` and string `scopes` |

Speech models: `heygen-voice-1`, `heygen-voice-1-turbo`, `heygen-voice-1-turbo-free`. One exact scene goes to `POST /v3/models/audio/tts`, with explicit model, `with_timestamps:true`, expressiveness supplied or 0.5, and language only when supplied. No chunking, speed, pitch, seed, SSML, dialogue, streaming, model inference, retry or fallback. The connector follows private voice pages, reads that id, and requires instant mode and ACTIVE state before the billed POST. Professional, missing, non-private or non-ready voices stop. Malformed or repeated pagination cannot prove membership.

Speech requires positive finite duration and nonempty original character timings: string text, finite nonnegative starts/ends, end at least start, nondecreasing starts, and concatenation equal to the submitted scene. It downloads once through the gateway, only from exact `files2.heygen.ai` or `resource2.heygen.ai`, at most 67,108,864 bytes. It validates the complete RIFF/WAVE container, PCM16 mono 44,100 Hz and aligned nonempty samples. Vendor and sample-derived durations remain separate. The gateway writes bytes unchanged and returns path, bytes, SHA-256 and media type. No audio address, preview, thumbnail, raw response, binary or base64 is returned. Grouping characters into words, resampling, alignment and take filing belong to the calling workflow.

Speech without local output returns `local_only` before connection or provider access. A download failure can follow a charged generation; no recoverable speech job id is established. Stop without an address or automatic resynthesis. Protected downloader failures retain fixed detail codes; proxy budget refusal retains `proxy_body_too_large`.

## Instant cloning and file safety

`path` names exactly one absolute physical, readable regular MP3 or WAV, 1 to 3,000,000 bytes inclusive. Relative paths, URLs, links at any ancestor, hard links, nonregular files, `.env`/`.env.*` components, any `memory` component and the person-scoped Wiser credential directory are refused before protected content is opened. Screening, descriptor identity/size/timestamps, reading and rechecking must agree. Use the physical path where the system temporary directory has an alias. The resolved extension must match a complete RIFF/WAVE container with aligned audio data or complete MPEG Layer III frames (optionally ID3-tagged); a tag alone is not audio. Changed or unreadable files stop. No local path is transmitted.

Clone creation sends `mode:instant`, the exact Unicode name, one inline base64 audio item with matching audio MIME, similarity supplied or `max`, noise removal supplied or false, and language only when supplied. Similarity is `medium`, `high`, `extra_high` or `max`. The required idempotency key matches `^[A-Za-z0-9-]{8,64}$` and is sent as the `Idempotency-Key` header. Exactly HTTP 202 with a valid voice id means accepted. Poll `voices.get`: PENDING, ACTIVE and FAILED stay distinct. Language can be absent/null while pending. Recognized failure codes are projected; raw failure messages and unknown codes are omitted. A failed clone remains until explicitly deleted.

The calling workflow owns the single consent ask and its record. This connector adds no consent boolean, repeated ask or proof upload. Capacity and preview pricing can change; never delete an existing clone to make room. Before deletion, read and identify the clone being lost by id. The action proves private membership, requires `data.status:ok` with no embedded error, and does not alter the account credential. A 2xx alone, empty object or 404 is not success.

Clone upload requires the local gateway. The gateway has no automatic local-only gate for file-reading actions: a hosted service must withhold `heygen.voices.add` in discovery and execution before filesystem/provider access. That integration is separate release work and is not claimed here. Speech retains its built-in file-output gate. The other seven JSON actions need no local files.

## Avatar discovery

Group and look lists return one page; omission of ownership requests both. Follow every `has_more`/`next_token`, then choose the character and its look by name. Resolve duplicate names with ids. Never select the first group/look or infer one id from another: a look id may equal its group's id. `list_looks` checks returned group/type relationships against supplied filters. Empty lists and nullable optional metadata are valid; malformed fields, missing pages and contradictory pagination stop.

Groups carry id, name, look count, preview presence and state/consent/default voice when present. Looks carry id, name, nullable group id, avatar type, status, nullable default voice, supported engines and preview-presence flags. Types are `studio_avatar`, `digital_twin`, `photo_avatar`. Engine metadata is discovery only: part 2 sends only Avatar IV after readiness/consent/engine checks. Vendor consent state is not another Wiser consent ask. No avatar or look creation, training, editing, deletion or likeness consent collection is included.

## Credentials and billing

**This key bills HeyGen's API wallet, separate from any HeyGen web subscription.** It uses the member's own workspace and quota, without shared OAuth credits. Wiser supplies no balance, upgrades no plan and changes no top-up setting.

| Module | Intended grant privilege | Actions |
|--------|--------------------------|---------|
| `speech` | write | `synthesize` |
| `voices` | write | `list`, `get`, `add`, `delete` |
| `avatars` | write | `list`, `list_looks` |
| `account` | write | `wallet`, `permissions` |

Every module uses the built-in API-key toolkit, authenticated proxy, no credential unwrap and no fallback. No credential file or `secrets:heygen` binding exists. The gateway's provider holds the key and injects `X-Api-Key`. The intended shared key has exactly `voices:write`, `videos:write`, `assets:write`, `avatars:read`, `account:read`; the two future resources prepare part 2. No `avatars:write` or wildcard. Read-action risk does not reduce the key's write privilege. During human connect check custom mode and that exact scope set; full, read-only, missing and broader grants do not establish it. `permissions` reports metadata so the human workflow can decide, without pretending to enforce vendor grant restriction itself.

Before paid synthesis, the caller establishes self-serve USD API pricing for the key's workspace, reads the wallet and discloses the estimate. The implementation also checks that same credential's wallet type/currency and sufficient balance. This read is advisory, not a reservation; concurrent use and delayed settlement apply. An unchanged balance never proves a paid call was free. Missing wallet means unavailable, never zero. Unknown/contract/minute-priced billing is outside the bounded synthesis exemption and stops paid use.

| Action | Effect and worst case | Confirmation |
|--------|-----------------------|--------------|
| `speech.synthesize` | Instant voices only, at most 5,000 characters: self-serve `heygen-voice-1` USD 0.075 or paid Turbo USD 0.020 per call, excluding taxes, at USD 15 or 4 per million characters read 2026-10-28. Turbo Free is USD 0 during its offer ending 2026-11-30, with no promised future free entitlement. | none; required model enum and text bound cap priced inputs |
| `voices.add` | Sends one recording and creates a resource; preview cloning has no permanent free-price promise, and capacity can refuse it. No automatic retry or ready claim. | always |
| `voices.delete` | Permanent clone deletion; no restore supplied. | always |

No part 1 action declares standing approval. An always-confirmed call needs matched single-use approval for the identical input, account and label. Changed file content remains a caller duty: an unchanged path in a gateway approval does not fingerprint the file. Reads and bounded synthesis have no manifest stop. A policy denial wins. Explicitly chosen retries preserve both idempotency key and body for the same logical creation; changed work needs a new key. HeyGen documents 24-hour replay and in-flight 409. No action retries automatically after 429, timeout, 5xx or ambiguous failure.

## Boundaries and troubleshooting

Assets and videos, their upload and download paths, video alternatives and standing approval are part 2. Also excluded: professional voice training/retraining, arbitrary URLs, transcode, chunking, speech-to-speech, voice design, publishing, callbacks, batches, billing/key administration, v1/v2 endpoints and a bare `voice` alias. Commercial entitlement and three-varied-input live verification remain separate human checks.

`needs_connect`: Connect Account for the required module with `auth.md`, in its own human turn. `invalid_arguments`: fix the field or filesystem/state condition. `local_only`: use local stdio. `needs_provider_capability`: update/check the provider's measurement/download capability. `proxy_body_too_large`: reduce the request without splitting/truncating the recording. `unexpected answer`: stop and report sanitized endpoint/method. 401/403 require a workspace/permissions check; 402 a wallet check; 409 an idempotency review; 413 a request-size check; 422 an input/vendor-state check; 429 or 5xx require inspection before any explicitly chosen retry. No raw exception text is returned.

## Reference

- `auth.md`, separate human grant and revocation
- `gateway/AGENTS.md`, byte output, download and request budgets
- `standards/script-contract.md`, published schemas
- [HeyGen API](https://developers.heygen.com/llms.txt)
- [Speech](https://developers.heygen.com/reference/generate-model-speech)
- [Instant clones](https://developers.heygen.com/docs/voices/heygen-voice-instant-clone)
- [Key permissions](https://developers.heygen.com/docs/api-key-permissions)
