# Connecting Google APIs

## Before connecting

Have a Google Cloud project with every API this connector calls enabled, and one API key for that project available in your own browser. Create the key under APIs and Services, Credentials. The gateway must be attached as described in `gateway/SETUP.md`. Rate limits apply on PageSpeed Insights; rate limits and per-character charges apply on Translation and on Text-to-Speech; rate limits and per-audio-duration charges apply on Speech-to-Text; rate limits and per-unit charges apply on Natural Language. Make deliberate requests and do not poll.

One key covers every module. Two restrictions on that key, and the second one is the one that catches people.

The **API restriction** names every service the connector calls, and today that is all five: `pagespeedonline.googleapis.com`, `translate.googleapis.com`, `texttospeech.googleapis.com`, `speech.googleapis.com` and `language.googleapis.com`. Check your key against that list and add any it is missing, rather than assuming a key made for an earlier version of this connector already covers them: each module was added in its own release, so a key restricted before one shipped will not name it. Console's API-restriction picker offers only APIs already enabled on the project, so enable first, then restrict. A key restricted to fewer services than the connector calls returns `API_KEY_SERVICE_BLOCKED` at the first call to an unnamed one, which is a late and opaque way to learn this.

The **application restriction** must be **None**, not HTTP referrers. A server-side call sends no HTTP referrer, so a referrer-restricted key fails with 403 `API_KEY_HTTP_REFERRER_BLOCKED` even though the key is valid and the API is enabled. An IP allowlist is not the alternative: the provider's egress addresses are not published and not stable. This is measured rather than cautionary: it is exactly how the first live run failed on 2026-09-19.

## Hosted connect

One hosted connect usually covers every module of this connector, because they share one custom toolkit and one key. Observed on 2026-09-19: one hosted connect on `insights` produced a single account; `google-apis.translate.text` then executed with no `needs_connect` stop, and a `translate` connection record appeared afterwards pointing at that same account. Both `voice` actions did the same later that day, on the same one account and with no connect turn. This is what was measured on this connector, on this custom toolkit, on one API key, on that day. It is not a statement about how grants work in general.

**The word "usually" is carrying a real condition.** The gateway adopts an existing account for a module that has no grant of its own, and only while this toolkit carries **exactly one** ACTIVE account; it skips adoption altogether if it cannot list accounts at the provider.

Adding a second account does **not** break the modules you have already connected. They keep the account they were bound to. What it costs is the automatic adoption a not-yet-connected module would otherwise get, so that module stops at `needs_connect` and needs its own hosted connect, which is the safe behaviour rather than a fault. If a module stops there when you expected it not to, check whether this toolkit has grown a second ACTIVE account before assuming anything is broken.

1. Request `start_connect` with service `google-apis` and a module, `insights`, `translate`, `voice`, `speech`, or `language`. The gateway registers the custom toolkit before creating the hosted connection link.
2. Open that link in your own browser and enter the API key on the hosted page. Never paste the key in chat. Enter only the key: the custom toolkit supplies the `X-Goog-Api-Key` header with the key only, without a prefix.
3. Request `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables the module's read actions.

The gateway's provider holds the key. Do not put a Google APIs key into an auth config or `auth-provider.env`.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

**The gateway does not revoke**; no shipped path calls it. Revoking is done at the vendor, and where the gateway's provider holds the grant, by deleting the connected account there. Revoke or rotate the API key in the Google Cloud project's Credentials page. If the project does not expose that control, restrict or delete the key there. Rotating the key invalidates every module's hosted grant. Afterwards run `connect_status` for each module you revoked: that is what updates the local record, and without it the row keeps reading ACTIVE.

## Last connected

2026-09-19, on this workspace's own grant. The old pagespeed grant is on the retired toolkit and does not carry over.
