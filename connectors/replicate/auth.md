# Connecting Replicate

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Create a Replicate API token for the account that will pay for predictions. The gateway creates the API Key blueprint on first connect. Paste the token only on the hosted connect page, never into the blueprint and never into chat.

## Through the gateway

1. In a human turn, request "Connect Replicate" and name the module.
2. Run `start_connect` for `replicate` and that module, then open the hosted link in your own browser.
3. Paste the API token on the hosted page, never in chat.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `models`: separate connect, write privilege; Last connected: 2026-09-08.

## The route this connector does not use

A local credential file or a key pasted into chat is not a route. Use the hosted page through the gateway's provider.

## Revoking

Revoke each module through the gateway, then revoke the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform.

## Last connected

2026-09-08, `models`, Grok session via the current gateway tree. Catalog `list_collections` returned `{ results, next, previous }`; items have `name`, `slug`, `description`. `create_prediction` not run (billed). No collection names recorded here.
