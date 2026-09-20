# Connecting Google APIs

## Before connecting

Have a Google Cloud project with every API this connector calls enabled, and one API key for that project available in your own browser. Create the key under APIs and Services, Credentials. The gateway must be attached as described in `gateway/SETUP.md`. Rate limits apply on PageSpeed Insights; rate limits and per-character charges apply on Translation. Make deliberate requests and do not poll.

One key covers both modules. Two restrictions on that key, and the second one is the one that catches people.

The **API restriction** names every service the connector calls: `pagespeedonline.googleapis.com` and `translate.googleapis.com` today, growing to `texttospeech.googleapis.com`, `speech.googleapis.com` and `language.googleapis.com` as modules ship. Console's API-restriction picker offers only APIs already enabled on the project, so enable first, then restrict. A key restricted to fewer services than the connector calls returns `API_KEY_SERVICE_BLOCKED` at the first call to an unnamed one.

The **application restriction** must be **None**, not HTTP referrers. A server-side call sends no HTTP referrer, so a referrer-restricted key fails with 403 `API_KEY_HTTP_REFERRER_BLOCKED` even though the key is valid and the API is enabled. An IP allowlist is not the alternative: the provider's egress addresses are not published and not stable. This is measured rather than cautionary: it is exactly how the first live run failed on 2026-09-19.

## Hosted connect

Each module is its own grant. Both ask for the same key, so two hosted connects of one key. A grant on `insights` does not unlock `translate`, and the reverse.

1. Request `start_connect` with service `google-apis` and the module, `insights` or `translate`. The gateway registers the custom toolkit before creating the hosted connection link.
2. Open that link in your own browser and enter the API key on the hosted page. Never paste the key in chat. Enter only the key: the custom toolkit supplies the `X-Goog-Api-Key` header with the key only, without a prefix.
3. Request `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables that module's read action.

The gateway's provider holds the key. Do not put a Google APIs key into an auth config or `auth-provider.env`.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

Revoke each module through the gateway, then revoke or rotate the API key in the Google Cloud project's Credentials page. If the project does not expose that control, restrict or delete the key there. Rotating the key invalidates both modules' hosted grants.

## Last connected

Not yet. The old pagespeed grant is on the retired toolkit and does not carry over.
