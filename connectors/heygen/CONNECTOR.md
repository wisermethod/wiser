---
name: heygen
type: connector
category: media
description: Synthesizes timestamped WAV speech, manages instant voice clones, discovers avatars and looks, uploads narration, renders Avatar IV video to MP4 and reads API wallet and key permissions, confirming uploads, clone changes and video creation unless a standing approval covers the render
version: 0.1.0
---

# HeyGen

Six modules and thirteen actions cover instant narration, existing avatar discovery, narration uploads and Avatar IV video, with local WAV/MP4 output.

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
| `heygen.assets.upload_audio` | `path` (1 to 4,096), `idempotency_key` | always | `asset_id`, `mime_type`, `size_bytes`; no asset URL |
| `heygen.videos.create` | `avatar_id`, `resolution` (`720p`, `1080p`), `aspect_ratio` (`16:9`, `9:16`, `4:5`, `5:4`, `1:1`, `auto`), `idempotency_key`; either `script` (1 to 5,000) and `voice_id`, or `audio_asset_id` alone; optional `title` (1 to 200), `background_color` (`#RRGGBB`) | always unless covered by a standing approval | `video_id`, `video_status`, `output_format:mp4` |
| `heygen.videos.get` | `video_id` | none | `video_id`, `video_status`, nullable `duration`, recognized `failure_code` |
| `heygen.videos.download` | `video_id` | none | Safe status; completed video adds gateway MP4 `file` |
| `heygen.account.wallet` | `{}` | none | Only `billing_type` and typed `wallet` currency/remaining balance, or null when unavailable |
| `heygen.account.permissions` | `{}` | none | Only non-secret `scope_mode` and string `scopes` |

Speech models: `heygen-voice-1`, `heygen-voice-1-turbo`, `heygen-voice-1-turbo-free`. One exact scene goes to `POST /v3/models/audio/tts`, with explicit model, `with_timestamps:true`, expressiveness supplied or 0.5, and language only when supplied. No chunking, speed, pitch, seed, SSML, dialogue, streaming, model inference, retry or fallback. The connector follows private voice pages, reads that id, and requires instant mode and ACTIVE state before the billed POST. Professional, missing, non-private or non-ready voices stop. Malformed or repeated pagination cannot prove membership.

Speech requires positive finite duration and nonempty original character timings: string text, finite nonnegative starts/ends, end at least start, nondecreasing starts, and concatenation equal to the submitted scene. It downloads once through the gateway, only from exact `files2.heygen.ai` or `resource2.heygen.ai`, at most 67,108,864 bytes. It validates the complete RIFF/WAVE container, PCM16 mono 44,100 Hz and aligned nonempty samples. Vendor and sample-derived durations remain separate. The gateway writes bytes unchanged and returns path, bytes, SHA-256 and media type. No audio address, preview, thumbnail, raw response, binary or base64 is returned. Grouping characters into words, resampling, alignment and take filing belong to the calling workflow.

Speech without local output returns `local_only` before connection or provider access. A download failure can follow a charged generation; no recoverable speech job id is established. Stop without an address or automatic resynthesis. Protected downloader failures retain fixed detail codes; proxy budget refusal retains `proxy_body_too_large`.

## Instant cloning and file safety

`path` names exactly one absolute physical, readable regular MP3 or WAV, 1 to 3,000,000 bytes inclusive. Relative paths, URLs, links at any ancestor, hard links, nonregular files, `.env`/`.env.*` components, any `memory` component and the person-scoped Wiser credential directory are refused before protected content is opened. Screening, descriptor identity/size/timestamps, reading and rechecking must agree. Use the physical path where the system temporary directory has an alias. The resolved extension must match a complete RIFF/WAVE container with aligned audio data or complete MPEG Layer III frames (optionally ID3-tagged); a tag alone is not audio. Changed or unreadable files stop. No local path is transmitted.

Clone creation sends `mode:instant`, the exact Unicode name, one inline `audio: [{type:"base64", media_type, data}]` item with matching `audio/mpeg` or `audio/wav` MIME and base64 data, similarity supplied or `max`, noise removal supplied or false, and language only when supplied. Similarity is `medium`, `high`, `extra_high` or `max`. The required idempotency key matches `^[A-Za-z0-9-]{8,64}$` and is sent as the `Idempotency-Key` header. A 2xx answer carrying a valid voice id means accepted, regardless of whether the provider exposes HeyGen's own HTTP status. Anything else is refused. Poll `voices.get`: PENDING, ACTIVE and FAILED stay distinct. Language can be absent/null while pending. Recognized failure codes are projected; raw failure messages and unknown codes are omitted. A failed clone remains until explicitly deleted.

The calling workflow owns the single consent ask and its record. This connector adds no consent boolean, repeated ask or proof upload. Capacity and preview pricing can change; never delete an existing clone to make room. Before deletion, read and identify the clone being lost by id. The action proves private membership, requires `data.status:ok` with no embedded error, and does not alter the account credential. A 2xx alone, empty object or 404 is not success.

The four local actions are `speech.synthesize`, `voices.add`, `assets.upload_audio` and `videos.download`. A hosted service must withhold them in discovery and execution before filesystem/provider access; that independent integration is separate release work and is not claimed here. Both file outputs retain the gateway's `local_only` gate. The other nine JSON actions, including both remote video-create alternatives, need no local files.

## Avatar discovery

Group and look lists return one page; omission of ownership requests both. Follow every `has_more`/`next_token`, then choose the character and its look by name. Resolve duplicate names with ids. Never select the first group/look or infer one id from another: a look id may equal its group's id. `list_looks` checks returned group/type relationships against supplied filters. Empty lists and nullable optional metadata are valid; malformed fields, missing pages and contradictory pagination stop.

Groups carry id, name, look count, preview presence and state/consent/default voice when present. Looks carry id, name, nullable group id, avatar type, status, nullable default voice, supported engines and preview-presence flags. Types are `studio_avatar`, `digital_twin`, `photo_avatar`. Video creation sends only Avatar IV after readiness/consent/engine checks. Vendor consent state is not another Wiser consent ask. No avatar or look creation, training, editing, deletion or likeness consent collection is included.

## Narration assets and Avatar IV video

`assets.upload_audio` uses the same safe local file screen and 3,000,000-byte limit as cloning. It sends one multipart `file` part named `narration.mp3` or `narration.wav`, with matching MIME and a boundary absent from the bytes, through base64 `binary_body`. It measures the entire proxy envelope and sends the required idempotency header. The acknowledgement must have a valid asset id, matching MIME and exact integer source-byte count. Its URL is discarded. Upload once, keep the asset id, then call `videos.create`. These are two writes and two confirmation stops; upload success is independent of video success. Assets remain at HeyGen; no deletion is included. Large WAV narration refuses before opening/sending; the caller may prepare and name a complete smaller MP3 through its normal workflow. No automatic transcode, compression, splitting or alternate hosting.

Video requires exactly script plus explicit voice id, or asset id with neither script nor voice id. It checks the selected look id by reading that look, requires `status:completed` and `avatar_iv` support, and checks the returned group relationship across pages when present. Explicit group status must be completed/ready/active and explicit consent status approved/accepted/consented/verified/completed (case insensitive); missing/null optional states are not invented. Malformed pages, repeated cursors, a missing group or unsupported engine stops before render. A null group id does not invent a group. Send `type:avatar`, the chosen look id, `engine:{type:"avatar_iv"}`, `output_format:mp4`, resolution, ratio, optional title and `background:{value:background_color}`. An instant clone id was accepted for script video once on 2026-10-28; compatibility is not promised for every voice. No default voice, retry or engine substitution.

Persist the accepted video id before polling. `get` performs one read; `download` rereads that same id. States are pending, waiting, processing, completed and failed; other safe provider states become `unknown`, which stops automatic polling. Both project `video_status` rather than a gateway `status`, nullable finite nonnegative duration and a recognized failure code, discarding every media/thumbnail/GIF/page URL and raw failure message. The connector's failure-code allowlist is AUDIO_INVALID, AVATAR_NOT_READY, INSUFFICIENT_CREDITS, VIDEO_GENERATION_FAILED and INTERNAL_ERROR; unexpected codes are omitted. Compatibility with live failure codes is unverified. A mismatched id or malformed metadata stops. Neither action sleeps, resubmits or renders again.

Completed download requires positive duration and immediately uses the gateway's private byte downloader, with exact hosts `files2.heygen.ai` and `resource2.heygen.ai` and an inclusive 268,435,456-byte MP4 cap. It checks complete ISO BMFF box boundaries, compatible ftyp brands, movie/track/media headers and nonempty mdat independent of HTTP content type, not codec playback. The gateway publishes unchanged bytes with hash/size metadata; pending, failed and unknown states carry no file. Failure leaves no partial file and never rerenders. A later explicit download rereads the same id; address expiry and renewal are not promised. No caller URL or destination is accepted. These output caps are resource limits, not vendor duration maxima; a failure after generation can follow a charge.

## Credentials and billing

**This key bills HeyGen's API wallet, separate from any HeyGen web subscription.** It uses the member's own workspace and quota, without shared OAuth credits. Wiser supplies no balance, upgrades no plan and changes no top-up setting.

| Module | Intended grant privilege | Actions |
|--------|--------------------------|---------|
| `speech` | write | `synthesize` |
| `voices` | write | `list`, `get`, `add`, `delete` |
| `avatars` | write | `list`, `list_looks` |
| `assets` | write | `upload_audio` |
| `videos` | write | `create`, `get`, `download` |
| `account` | write | `wallet`, `permissions` |

Every module uses the built-in API-key toolkit, authenticated proxy, no credential unwrap and no fallback. No credential file or `secrets:heygen` binding exists. The gateway's provider holds the key and injects `X-Api-Key`. The intended shared key has exactly `voices:write`, `videos:write`, `assets:write`, `avatars:read`, `account:read`. No `avatars:write` or wildcard. Read-action risk does not reduce the key's write privilege. During human connect check custom mode and that exact scope set; full, read-only, missing and broader grants do not establish it. `permissions` reports metadata so the human workflow can decide, without pretending to enforce vendor grant restriction itself.

Before paid synthesis or video creation, the caller establishes self-serve USD API pricing for the key's workspace, reads the wallet and discloses the estimate. The implementation checks that same credential's wallet type/currency and the calculated speech charge. Video requires a positive USD wallet, but its duration and full charge cannot be inferred from an asset id or script length: the caller estimates the charge and HeyGen enforces sufficiency. This read is advisory, not a reservation; concurrent use and delayed settlement apply. An unchanged balance never proves a paid call was free. Missing wallet means unavailable, never zero. Unknown/contract/minute-priced billing is outside the bounded synthesis exemption and stops paid use.

| Action | Effect and worst case | Confirmation |
|--------|-----------------------|--------------|
| `speech.synthesize` | Instant voices only, at most 5,000 characters: self-serve `heygen-voice-1` USD 0.075 or paid Turbo USD 0.020 per call, excluding taxes, at USD 15 or 4 per million characters read 2026-10-28. Turbo Free is USD 0 during its offer ending 2026-11-30, with no promised future free entitlement. | none; required model enum and text bound cap priced inputs |
| `voices.add` | Sends one recording and creates a resource; preview cloning has no permanent free-price promise, and capacity can refuse it. No automatic retry or ready claim. | always |
| `voices.delete` | Permanent clone deletion; no restore supplied. | always |
| `assets.upload_audio` | Sends and retains narration; no independent upload fee established. | always |
| `videos.create` | Avatar IV rates read 2026-10-28: USD 0.0385/second photo avatar; USD 0.0805/second custom video or studio avatar. Neither an asset id nor script length bounds billable duration. For scale, 30 minutes at the latter rate is USD 144.90, not a per-call guarantee. Separate script-voice debit is unmeasured. Disclose selected look/type, rate, expected duration and unestablished components. | always, or the granted production scope |
| Reads and `videos.download` | No new generation charge planned. | none |

Only `videos.create` declares a `pay` standing approval. An always-confirmed call needs matched single-use approval for the identical input, account and label. Changed file content remains a caller duty: an unchanged path in a gateway approval does not fingerprint the file. Reads and bounded synthesis have no manifest stop. A policy denial wins. Explicitly chosen retries preserve both idempotency key and body for the same logical creation; changed work needs a new key. HeyGen documents 24-hour replay and in-flight 409. No action retries automatically after 429, timeout, 5xx or ambiguous failure.

## Production standing approval

Keep `videos.create` confirmation always. A member may ask Standing Approval for one production, scoped to the root and optionally its Playbook, connection and this action. The gateway displays a heightened pay warning, refuses more than 7 days and requires the person's yes to that exact proposal. Its summary is "create HeyGen avatar video charged to your HeyGen API wallet". Its caution is:

> Each covered call spends wallet dollars with no stop per call. Avatar IV rates read 2026-10-28: $0.0805 a second for a custom video or studio avatar; $0.0385 for a photo avatar. The wallet's own balance is the only ceiling HeyGen applies.

Covered rooted calls run without a per-call stop until expiry or revocation. A call without root stops; another production/connection or a policy denial is not covered. No other HeyGen action declares standing approval. Speech remains confirmation none and needs no grant.

## Boundaries and troubleshooting

Excluded: asset deletion; avatar creation/training/editing/deletion; new looks; likeness consent collection; professional voice training/retraining, arbitrary URLs, transcode, chunking, speech-to-speech, voice design, publishing, callbacks, batches, billing/key administration, v1/v2 endpoints and a bare `voice` alias. Commercial entitlement and three-varied-input live verification remain separate human checks.

`needs_connect`: Connect Account for the required module with `auth.md`, in its own human turn. `invalid_arguments`: fix the field or filesystem/state condition. `local_only`: use local stdio. `needs_provider_capability`: update/check the provider's measurement/download capability. `proxy_body_too_large`: reduce the request without splitting/truncating the recording. `unexpected answer`: stop and report sanitized endpoint/method. 401/403 require a workspace/permissions check; 402 a wallet check; 409 an idempotency review; 413 a request-size check; 422 an input/vendor-state check; 429 or 5xx require inspection before any explicitly chosen retry. No raw exception text is returned.

## Reference

- `auth.md`, separate human grant and revocation
- `gateway/AGENTS.md`, byte output, download and request budgets
- `standards/script-contract.md`, published schemas
- [HeyGen API](https://developers.heygen.com/llms.txt)
- [Speech](https://developers.heygen.com/reference/generate-model-speech)
- [Instant clones](https://developers.heygen.com/docs/voices/heygen-voice-instant-clone)
- [Key permissions](https://developers.heygen.com/docs/api-key-permissions)
