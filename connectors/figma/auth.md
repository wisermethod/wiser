# Connecting Figma

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Use a Figma account that can access the requested resources. If the organization restricts third-party apps, obtain its approval for the gateway's provider application. Prepare the OAuth blueprint through the gateway's provider as described by [gateway/SETUP.md](../../gateway/SETUP.md).

## Through the gateway

1. Request "Connect Figma" for `figma` / `files`.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Sign in to Figma and approve the requested access in your browser.
4. The skill runs `connect_status`. Only ACTIVE unlocks the module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Grant

`files` has read privilege. Only this module is included in this slice.

## Revoking

Revoke the module through the gateway, then remove the application's access at Figma account settings connected apps.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

Not yet.
