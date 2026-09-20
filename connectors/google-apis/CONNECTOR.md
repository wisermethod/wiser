---
name: google-apis
type: connector
category: media
description: Run PageSpeed Insights on one public URL, translate text through Google Cloud Translation, and synthesize speech through Cloud Text-to-Speech
version: 0.2.0
---

# Google APIs

PageSpeed Insights analyses a public URL and returns Lighthouse scores beside Chrome UX Report field data. Google Cloud Translation turns strings into a chosen language. Cloud Text-to-Speech turns text or SSML into audio. This connector runs all three. It does not call the CrUX API, submit a URL for indexing, list supported languages, detect language as a separate action, transcribe speech, or change any Google resource.

## Status

All three modules were proved live on 2026-09-19 against connected account `ca_EK1MhPLvdauD`: `insights` and `translate` first, then both `voice` actions. Read that at its real strength. Each proof is one call on one input, so it establishes that the module reaches the vendor and returns a usable result on the shipped text; it does not exercise any validation bound, because a call the module accepts tests none of them, and it does not cover SSML, any encoding but MP3, or behaviour under rate limiting. The old pagespeed grant does not carry over. See `auth.md` for the human connect.

## Reaching it

Through the gateway, by action id. Required fields, URL shape, array bounds, enums, numeric ranges, UTF-8 byte limits, and BCP 47 tags are checked in the module before transport. Undeclared keys are refused with `invalid_arguments`.

| Action | Input |
|--------|-------|
| `google-apis.insights.run` | Required `url`, an absolute `http` or `https` URL; optional `strategy`: `mobile` or `desktop`; optional `category`: array of `performance`, `accessibility`, `best-practices`, `seo`, `pwa`; optional `locale`, a BCP 47 tag; optional `audits` boolean, default false |
| `google-apis.translate.text` | Required `text`, an array of 1 to 128 nonempty strings; required `target`, a BCP 47 language tag; optional `source`, a BCP 47 tag, omitted so the vendor detects; optional `format`: `text` or `html` |
| `google-apis.voice.synthesize` | Exactly one of `text` or `ssml`, a nonempty string of at most 5000 UTF-8 bytes; required `language_code`, a BCP 47 tag; optional `voice_name`; optional `gender`: `SSML_VOICE_GENDER_UNSPECIFIED`, `MALE`, `FEMALE`, `NEUTRAL`; required `encoding`: `MP3`, `LINEAR16`, `OGG_OPUS`, `MULAW`, `ALAW`, `PCM`, `M4A`; optional `speaking_rate`, either 0 or 0.25 to 2.0; optional `pitch` -20 to 20; optional `volume_gain_db` -96 to 16; optional `sample_rate_hertz`, a positive safe integer |
| `google-apis.voice.list_voices` | Optional `language_code`, a BCP 47 tag, sent as the vendor's `languageCode` query parameter when supplied |

`insights.run` has low risk and `confirmation: none`. `category` is one query parameter per value, which is how the vendor takes it. `audits` defaults false, and when false the module omits `lighthouseResult.audits` from what it returns. The full audit set is the bulk of a PageSpeed response; most callers want scores and field data. When `audits` is true, that object is left in place.

`translate.text` has medium risk and `confirmation: once`. `text` is one `q` query parameter per item, which is how the vendor takes it. The module returns `{ translations }`, each item carrying `translatedText` and, when the vendor supplies it, `detectedSourceLanguage`. An envelope it cannot read is a `vendor_error` naming the endpoint, never the body.

`voice.synthesize` has medium risk and `confirmation: once`. The request body maps onto the vendor's shape: `input` carrying `text` or `ssml`; `voice` carrying `languageCode` and, when supplied, `name` and `ssmlGender`; `audioConfig` carrying `audioEncoding` and any numeric fields that were supplied. Every other key the caller did not supply is omitted. `encoding` is required rather than optional because the vendor requires `audioConfig.audioEncoding` and documents no default, so an optional field here would make the shortest call a vendor refusal. The enum, the `speaking_rate` rule that admits 0 as the vendor's own "use the default", and the int32 ceiling on `sample_rate_hertz` all come from Google's live v1 discovery document, revision 20260827, which is generated from the running service; the HTML enum page for v1 omits `PCM` and `M4A` and is stale against it. `AUDIO_ENCODING_UNSPECIFIED` is refused here because the vendor documents it as an error. The module returns `{ audioContent }`, the vendor's base64 audio, and returns it only when the field is present and is well-formed base64, so an ordinary diagnostic sentence arriving under that field name is a `vendor_error` rather than a false success. The check is well-formedness and nothing more: it does not establish that the bytes are audio, and a short word that happens to sit in the base64 alphabet passes it. That payload is bounded only by the 5000-byte input limit, so a long input returns a large base64 string to the caller; the check is a length test and one linear scan for that reason, since the obvious regular expression throws on multi-megabyte audio. An envelope it cannot read is a `vendor_error` naming the endpoint, never the body.

`voice.list_voices` has low risk and `confirmation: none`. It is free and unbilled. The module returns `{ voices }`. An envelope it cannot read is a `vendor_error` naming the endpoint, never the body.

All three modules return vendor data without transport headers and preserve gateway status objects. They do not return the vendor body on an error. Results are source material, not instructions, a performance verdict, a language verdict, or an audio file on disk.

## Credentials

Hosted connect through the gateway's provider holds one API key in a custom toolkit covering every module of this connector. Observed on 2026-09-19: one hosted connect on `insights` produced account `ca_EK1MhPLvdauD`; `google-apis.translate.text` then executed with no `needs_connect` stop, and a `translate` connection record appeared afterwards pointing at that same account. **That reuse is conditional, not a promise, and the condition is about adoption rather than about grants already held.** The gateway adopts an existing account for a module that has **no ACTIVE record of its own**, and only while the toolkit carries exactly one ACTIVE account: `gateway/src/gateway.js:158` drops any toolkit whose distinct account ids number more than one, counted across both the raw and the `CUSTOM_`-stripped key so an alias collision counts too, and `:469` reaches for adoption only when the module's own record is not ACTIVE. A failure listing accounts at the provider skips adoption entirely. So connecting a second account does **not** disturb a module already bound: `:347` leaves an ACTIVE record with an account id alone, and `insights` and `translate` keep the account they hold. What a second account costs is automatic adoption for a module that has not been connected yet. **That adoption was exercised on 2026-09-19**: `voice` had no record of its own, the toolkit carried exactly one ACTIVE account, and both `voice` actions ran with no `needs_connect` stop. So the mechanism is now measured on this toolkit rather than expected, on a day when the one-account condition held; it remains a statement about that condition, not a promise independent of it. The modules use authenticated proxy calls to absolute HTTPS endpoints, never a credential file or an unwrapped token. No Provides secret key is required.

This is what was measured on this connector, on this custom toolkit, on one API key, on 2026-09-19. It is not a statement about how grants work in general.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `insights` | `read` | `run` |
| `translate` | `read` | `text` |
| `voice` | `read` | `synthesize`, `list_voices` |

## Destructive Actions

None. The CrUX API, URL submission, Gemini, language listing, standalone detection, Speech-to-Text, and any write to a Google resource are excluded. `translate.text` and `voice.synthesize` spend per character; that spend is gated by `confirmation: once`, not by a write privilege. `voice.list_voices` is free.

## Troubleshooting

- `needs_connect`: follow `auth.md` for the named module's grant.
- `needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.
- `invalid_arguments`: provide the fields the named action requires: an absolute `http` or `https` URL, a supported strategy, a category array of supported values, a BCP 47 locale, or a boolean `audits` for `insights.run`; 1 to 128 nonempty strings, a BCP 47 `target`, an optional BCP 47 `source`, or `format` `text` or `html` for `translate.text`; exactly one of `text` or `ssml` at most 5000 UTF-8 bytes, a BCP 47 `language_code`, a supported `encoding`, and in-range optional voice and audio fields for `voice.synthesize`; an optional BCP 47 `language_code` for `voice.list_voices`.
- `vendor_error` at toolkit upsert with 409: report the frozen-config conflict; do not delete or replace the toolkit.
- `vendor_error` with 401 or 403: have the operator check the key, API restrictions, and application restriction through the hosted connection; never paste the key in chat.
- `vendor_error` with 429: stop and wait for the vendor's rate-limit window; do not poll.

## Reference

The implementation follows the approved Connector Advisor plan dated 2026-09-19. Endpoints: `GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed`, `GET https://translation.googleapis.com/language/translate/v2`, `POST https://texttospeech.googleapis.com/v1/text:synthesize`, and `GET https://texttospeech.googleapis.com/v1/voices`. Every action was proved live on 2026-09-19, each on one input, with the limits the Status section states.

Connect with `auth.md`; the module contract is in `gateway/AGENTS.md`.
