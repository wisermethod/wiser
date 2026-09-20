# Connecting Google Vision

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Enable Cloud Vision API and billing on the intended Google Cloud project, and create an API key restricted to that API. Prepare an API Key blueprint through the gateway's provider. Authentication is API_KEY, confirmed from its toolkit page 2026-09-08. Paste the key only on the hosted page.

## Through the gateway

1. In a human turn, request "Connect Google Vision" and name the module.
2. Run `start_connect` for `google-vision` and that module, then open the hosted link in your own browser.
3. Paste the API token on the hosted page, never in chat.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `images`: separate connect, read privilege; Last connected: 2026-09-08.

## The route this connector does not use

A local credential file or a key pasted into chat is not a route. Use the hosted page through the gateway's provider.

## Revoking

**The gateway does not revoke**; no shipped path calls it. Revoking is done at the vendor, and where the gateway's provider holds the grant, by deleting the connected account there. Revoke or rotate the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform. Afterwards run `connect_status` for each module you revoked: that is what updates the local record, and without it the row keeps reading ACTIVE.

## Last connected

2026-09-08, `images`, Grok session via the current gateway tree. Grant ACTIVE. `detect_faces` not run; that call bills and needs an image URI or base64 the operator supplies.
