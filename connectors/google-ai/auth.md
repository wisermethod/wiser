# Connecting Google AI

## Before connecting

Have a Google Cloud project with the Cloud Translation API enabled, and an API key for that project available in your own browser. Create the key under APIs and Services, Credentials. The gateway must be attached as described in `gateway/SETUP.md`. Rate limits and per-character charges apply; make deliberate requests and do not poll.

**Two restrictions on that key, and the second one is the one that catches people.**

The **API restriction** names `translate.googleapis.com`, which is the only service this connector calls today. Console offers only APIs already enabled on the project, so enable Cloud Translation before creating the key. A key restricted to fewer services than the connector calls returns `API_KEY_SERVICE_BLOCKED` at the first call to an unnamed one. This connector will grow to Text-to-Speech, Speech-to-Text and Natural Language on the same key; when a module for one of those ships, enable that API and add it to this key's existing restriction rather than making a second key.

The **application restriction** must be **None**, not HTTP referrers. A server-side call sends no HTTP referrer, so a referrer-restricted key fails with 403 `API_KEY_HTTP_REFERRER_BLOCKED` even though the key is valid and the API is enabled. An IP allowlist is not the alternative, because the calls leave the gateway's provider from addresses that are not published and not stable. This is measured rather than cautionary: it is exactly how the PageSpeed key failed on 2026-09-19.

## Hosted connect

1. Request `start_connect` with service `google-ai` and module `translate`. The gateway registers the custom toolkit before creating the hosted connection link.
2. Open that link in your own browser and enter the API key on the hosted page. Never paste the key in chat. Enter only the key: the custom toolkit supplies the `X-Goog-Api-Key` header with the key only, without a prefix.
3. Request `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables the read action.

The gateway's provider holds the key. Do not put a Google AI key into an auth config or `auth-provider.env`.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

Revoke the connection through the gateway, then revoke or rotate the API key in the Google Cloud project's Credentials page. If the project does not expose that control, restrict or delete the key there.

## Last connected

Not yet
