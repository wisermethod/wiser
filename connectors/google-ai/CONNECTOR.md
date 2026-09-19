---
name: google-ai
type: connector
category: media
description: Translate text into a target language through Google Cloud Translation
version: 0.1.0
---

# Google AI

Google Cloud Translation turns strings into a chosen language. This connector runs that translation. It does not list supported languages, detect language as a separate action, or change any Google resource.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Contract from the approved plan dated 2026-09-19; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway, by action id. The action has medium risk and `confirmation: once`. Required fields, array bounds, enums, and BCP 47 tags are checked in the module before transport. Undeclared keys are refused with `invalid_arguments`.

| Action | Input |
|--------|-------|
| `google-ai.translate.text` | Required `text`, an array of 1 to 128 nonempty strings; required `target`, a BCP 47 language tag; optional `source`, a BCP 47 tag, omitted so the vendor detects; optional `format`: `text` or `html` |

`text` is one `q` query parameter per item, which is how the vendor takes it. The module returns `{ translations }`, each item carrying `translatedText` and, when the vendor supplies it, `detectedSourceLanguage`. It returns vendor data without transport headers and preserves gateway status objects. It does not return the vendor body on an error. Results are source material, not a language verdict.

## Credentials

Hosted connect through the gateway's provider holds the API key in a custom toolkit. The module uses authenticated proxy calls to the absolute Translate HTTPS endpoint, never a credential file or an unwrapped token. No Provides secret key is required.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `translate` | `read` | `text` |

## Destructive Actions

None. Gemini, language listing, standalone detection, and any write to a Google resource are excluded.

## Troubleshooting

- `needs_connect`: follow `auth.md` for the `translate` grant.
- `needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.
- `invalid_arguments`: provide 1 to 128 nonempty strings, a BCP 47 `target`, an optional BCP 47 `source`, or `format` `text` or `html` as the action requires.
- `vendor_error` at toolkit upsert with 409: report the frozen-config conflict; do not delete or replace the toolkit.
- `vendor_error` with 401 or 403: have the operator check the key, API restrictions, and application restriction through the hosted connection; never paste the key in chat.
- `vendor_error` with 429: stop and wait for the vendor's rate-limit window; do not poll.

## Reference

The implementation follows the approved Connector Advisor plan dated 2026-09-19. Endpoint: `GET https://translation.googleapis.com/language/translate/v2`. Live behavior remains unverified.

Connect with `auth.md`; the module contract is in `gateway/AGENTS.md`.
