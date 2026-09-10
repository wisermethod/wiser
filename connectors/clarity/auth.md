# Connecting Microsoft Clarity

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Create a Clarity API token for the intended project in Clarity settings. Prepare an API Key blueprint through the gateway's provider. The hosted page has one token field, no email. Paste the Clarity API token on that page, never in chat.

## Through the gateway

1. In a human turn, request "Connect Microsoft Clarity" and name the module.
2. Run `start_connect` for `clarity` and that module, then open the hosted link in your own browser.
3. Paste the API token on the hosted page, never in chat.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `analytics`: separate connect, read privilege; Last connected: Not yet.

## The route this connector does not use

A local credential file or a key pasted into chat is not a route. Use the hosted page through the gateway's provider.

## Revoking

Revoke each module through the gateway, then revoke the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform.

## Last connected

Not yet. Record the date here after the operator completes each module's connect.
