---
name: elevenlabs
type: connector
category: media
description: Synthesizes timestamped MP3 speech to a local file, lists voices and models, and creates and deletes instant voice clones, confirming every write unless a standing approval covers narration
version: 0.1.1
---

# ElevenLabs

ElevenLabs supplies speech synthesis and voice cloning. This connector sends one scene whole to timestamped text-to-speech, reads voices and models, and uploads or deletes an instant clone.

## Status

Unreleased. Verified by offline fake-provider tests and the gateway's integration checks.

## Reaching it

Call through the gateway, by action id. Every input is a closed object; undeclared fields are refused. Lengths count Unicode code points, without trimming or normalization.

| Action | Input | Confirmation | Result |
|--------|-------|--------------|--------|
| `elevenlabs.speech.synthesize` | `text` (1 to 5,000 code points), `voice_id`, `model_id` | always | Voice and model ids, `characters` input count, original `alignment`, optional `normalized_alignment`, and gateway `file` metadata |
| `elevenlabs.voices.list` | `{}` | none | `voices` with string `voice_id`, `name`, `category` |
| `elevenlabs.voices.add` | `name` (1 to 100 code points), `path` (1 to 4,096 code points) | always | Nonempty `voice_id` and boolean `requires_verification` |
| `elevenlabs.voices.delete` | `voice_id` | always | `deleted:true` and the named id, only after vendor `status:"ok"` |
| `elevenlabs.models.list` | `{}` | none | `models` with id, name, TTS capability and valid optional text limits and rate multipliers |

Voice ids match `^[A-Za-z0-9_-]{1,128}$`. Select a model explicitly: `eleven_v4`, `eleven_v4_turbo`, `eleven_v3`, or `eleven_multilingual_v2`. Listing a new model does not add it to this enum. Check `can_do_text_to_speech` rather than inferring capability from its name.

Synthesis sends exactly `text` and `model_id` to `POST /v1/text-to-speech/{voice_id}/with-timestamps`, with fixed query `output_format=mp3_44100_128`. It performs one request for the whole scene, including scenes longer than 2,000 characters. There is no chunking, retry, fallback model, dialogue, optional voice settings, dictionary, or previous/next text in this slice. Whitespace-only nonempty text is passed to the vendor.

The module validates canonical standard base64 before decoding, with a decoded cap of 16,777,216 bytes, and validates nonempty equal-length alignment arrays, string characters, finite nonnegative times, end at least start and nondecreasing starts. Original characters joined must equal the exact submitted text. Present non-null normalized alignment meets the same internal rules and may have different text. Missing or null normalized alignment is omitted. Malformed answers return sanitized `vendor_error`, reason `unexpected answer`, with no file slot. Audio base64, previews, arbitrary metadata and raw envelopes are never returned. The local stdio gateway writes the original bytes and returns path, byte count, SHA-256 and media type. Without local file output, speech returns `local_only` before connection or provider access. Probe the actual MP3 for duration, channels and encoder delay; do not subtract an assumed delay from its samples.

## Local clone upload

`path` must be an absolute platform path to one readable, regular, nonempty MP3, **at most 3,000,000 bytes inclusive**. URLs, relative paths, wrong extensions, symbolic links at any ancestor, multiply linked files, `.env` or `.env.*` components, any `memory` component and the person-scoped Wiser credential directory and its files are refused before opening. Extension checks use the resolved basename. The file is screened, opened without following a link, checked by descriptor identity and size, read through that descriptor and checked again for change. A syntactically valid path may fail this filesystem screen. Supply its physical path where a platform's temporary directory alias is a symbolic link.

One multipart body uses a random boundary absent from the field/file bytes, the literal field `name`, one `files` part with fixed filename `sample.mp3` and media type `audio/mpeg`, and `remove_background_noise=false`. The local source path is never transmitted. Unicode, quotes and newlines in the clone name are preserved as field data. Nothing is split or truncated. An over-cap refusal names the file size before any request is built.

The upload cap leaves room for encoding: file plus boundary, headers and fields is below 3,002,000 bytes; base64 is at most 4,002,668 bytes; the proxy envelope adds less than 2,000 bytes for a connected-account id of up to 1,024 characters, below the 4,100,000-byte transport budget.

Upload requires the local gateway, because it reads a file on the member's own computer, and speech needs the local gateway's file output, refusing without it. The gateway does not refuse an upload by itself: a gateway that serves other people withholds both `elevenlabs.voices.add` and `elevenlabs.speech.synthesize`, as the Wiser endpoint does. Listing and deleting work anywhere.

`requires_verification:true` reports a vendor requirement, not a ready clone. The cloning workflow owns the person's single consent ask; the connector adds no consent field or proof requirement. Gateway action approval is separate. Never retry a creation after an ambiguous failure.

## Credentials and modules

This connector holds no credential and has no credential input, local vendor-key file or `secrets:elevenlabs` binding. Hosted connect collects the API key; the gateway's provider holds it and injects `xi-api-key`. No custom toolkit, unwrap or direct vendor HTTP route is used.

| Module | Grant privilege | Actions |
|--------|-----------------|---------|
| `speech` | write | `synthesize` |
| `voices` | write | `list`, `add`, `delete` |
| `models` | write | `list` |

All three bindings use the built-in toolkit. You may be asked to connect ElevenLabs for the required modules. See `auth.md` for the separate human connect. Read risk does not change the intended grant's write privilege; restricted-key scope still requires verification during human connect.

Voice listing uses `GET /v1/voices` and includes categories other than clones. Duplicate names are possible; choose the intended clone by id and category. Listing drops samples, owner details, settings and URLs. Model listing uses `GET /v1/models`, projects boolean `can_do_text_to_speech`, and retains optional positive integer `maximum_text_length_per_request` and finite nonnegative `model_rates.character_cost_multiplier` and `cost_discount_multiplier`. Empty lists are valid. Missing arrays or malformed projected fields fail rather than inventing defaults.

## Billing and destructive actions

**The key charges the ElevenLabs workspace it was created in; connecting through Wiser does not supply a separate ElevenLabs plan.** Before paid use, identify the key's workspace, plan, billing basis, applicable model rate, included allowance and whether PAYG or legacy overage can draw money. An unidentified billing basis stops paid use. Do not enable billing, upgrade a plan or infer clone/commercial entitlement during connect.

Estimated base API prices from [ElevenAPI pricing](https://elevenlabs.io/pricing/api), read 2026-10-27, excluding taxes:

| Model | USD per 1,000 API characters | USD per character | Estimated 5,000-character base charge |
|-------|------------------------------|-------------------|---------------------------------------|
| `eleven_v4` | 0.08 | 0.00008 | USD 0.40 |
| `eleven_v4_turbo` | 0.04 | 0.00004 | USD 0.20 |
| `eleven_v3` | 0.08 | 0.00008 | USD 0.40 |
| `eleven_multilingual_v2` | 0.08 | 0.00008 | USD 0.40 |

The same page lists API Starter at USD 6/month with 75,000 base v4 characters or 150,000 v4 Turbo characters, alternative uses of one allowance. The [creative subscription page](https://elevenlabs.io/pricing) instead lists 30,000 credits and Instant Voice Cloning at USD 6/month; an introductory promotion is not the recurring price. These do not identify the member's workspace or settle model-by-model subscription-credit conversion. Custom voice multipliers and legacy overage can differ. **Not available: the actual maximum debit for account-specific subscription/legacy billing and every accessible voice is unestablished.** USD 0.40 is a base estimate, not a guaranteed ceiling. Synthesis stops for gateway confirmation unless a standing approval covers the call.

| Action | Effect and recovery | Confirmation |
|--------|---------------------|--------------|
| `speech.synthesize` | Sends text for billed synthesis; no refund or retake is promised | always; eligible for a standing approval |
| `voices.add` | Uploads a recording and creates a vendor resource; no automatic retry or readiness claim | always |
| `voices.delete` | Permanently deletes the identified voice; no restore is supplied | always |

First list and name the clone being lost before deletion. Deleting a voice does not revoke the account credential.

Only `elevenlabs.speech.synthesize` is eligible for a standing approval, of kind `pay`, lasting at most 7 days. It keeps `confirmation: always`. Under a matching grant each call spends the member's own ElevenLabs plan credits, or money where pay-as-you-go or overage is on, without asking each time; the gateway does not know the account's maximum charge. Voice creation and deletion remain ineligible and stop every time.

Before any paid use, the caller still establishes the billing basis above and gets the member's cost approval. A standing approval never replaces either duty. Use `skills/Standing Approval/` to propose the scope and show the gateway's exact warning before the member grants it. Every synthesis the grant should cover declares its `root` on the gateway call, and its `playbook` when the grant names one. An answer carrying `standing_approval` ran without a stop and is reported to the member. A call without `root`, outside the scope or after the grant ends stops as before.

## Boundaries

Excluded: text-to-dialogue, streaming/WebSockets, batches, professional-clone training or verification automation, voice editing/sharing, pronunciation dictionaries, account/key administration, billing changes, non-MP3 input/output, a bare `voice` module and compatibility aliases.

## Troubleshooting

| Stop | One next step |
|------|---------------|
| `needs_connect` | Use Connect Account for the named module in its own human turn, with `auth.md` |
| `invalid_arguments` | Fix the named field or file condition |
| `local_only` | Use the local stdio gateway |
| `needs_provider_capability` | Check the gateway's provider capability |
| `vendor_error`, 401/403 | Check the workspace and key's permissions |
| 413 | ElevenLabs or the provider's proxy refused a request that was sent. A file over the 3,000,000-byte cap never gets that far: it returns `invalid_arguments` naming its size |
| 422 | Check the vendor's current model and file requirements |
| 429 | Inspect the workspace/provider quota before deciding on another call |
| 5xx or transport failure | Inspect the failure before deciding whether another call is safe |
| `unexpected answer` | Stop with no file or claimed mutation success and report the sanitized endpoint/method |

No paid synthesis or clone creation is retried automatically.

## Reference

- `auth.md`, human setup, billing and revocation
- `gateway/AGENTS.md`, gateway writes and local file output
- `standards/script-contract.md`, published input schema
- [Timestamped speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [Instant voice cloning](https://elevenlabs.io/docs/api-reference/voices/ivc/create)
- [Voice deletion](https://elevenlabs.io/docs/api-reference/voices/delete)
- [Model listing](https://elevenlabs.io/docs/api-reference/models/list)
