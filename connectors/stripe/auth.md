# Connecting Stripe

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Prepare a Stripe secret or restricted API key for the intended account with customer and charge read access. Prepare an API Key blueprint through the gateway's provider. The hosted page collects the API key, never chat. This connector selects API_KEY.

## Through the gateway

1. Request "Connect Stripe" for `stripe` / `billing`.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Paste the API key only on the hosted page, never in chat.
4. The skill runs `connect_status`. Only ACTIVE unlocks the module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Grant

`billing` has read privilege. Both customer and charge reads use this one grant.

## Revoking

Revoke the module through the gateway, then revoke the key at Stripe Dashboard API keys.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

Not yet. Operator 2026-09-09: skipped. No Stripe key entered.
