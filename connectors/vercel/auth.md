# Connecting Vercel

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Create a Vercel API token limited to the intended account or team. Prepare an API Key blueprint through the gateway's provider. Paste the token only on its hosted page. This connector selects API_KEY even where other authentication options are listed.

## Through the gateway

1. In a human turn, request "Connect Vercel" and name the module.
2. Run `start_connect` for `vercel` and that module, then open the hosted link in your own browser.
3. Paste the API token on the hosted page, never in chat.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `projects`: separate connect, write privilege; Last connected: 2026-09-08.
- `deployments`: separate connect, write privilege; Last connected: 2026-09-08.

## The route this connector does not use

A local credential file or a key pasted into chat is not a route. Use the hosted page through the gateway's provider.

## Revoking

Revoke each module through the gateway, then revoke the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform.

## Last connected

2026-09-08, `projects` and `deployments` ACTIVE. Catalog projects.list `{ projects, pagination }`. Catalog deployments.list `{ deployments, pagination }`. No project or deployment names recorded. `create` not run.
