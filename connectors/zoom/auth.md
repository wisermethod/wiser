# Connecting Zoom

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Use a Zoom account that can access the requested resources. If the organization restricts third-party apps, obtain its approval for the gateway's provider application. Prepare the OAuth blueprint through the gateway's provider as described by [gateway/SETUP.md](../../gateway/SETUP.md).

## Through the gateway

1. Request "Connect Zoom" for `zoom` / `meetings`.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Sign in to Zoom and approve the requested access in your browser.
4. The skill runs `connect_status`. Only ACTIVE unlocks the module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Grant

`meetings` has read privilege. Only this module is included in this slice.

## Revoking

**The gateway does not revoke**; no shipped path calls it. Revoking is done at the vendor, and where the gateway's provider holds the grant, by deleting the connected account there. Remove the application's access at Zoom App Marketplace added apps. Afterwards run `connect_status` for each module you revoked: that is what updates the local record, and without it the row keeps reading ACTIVE.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

2026-09-09, `meetings` ACTIVE. Hosted OAuth; live envelope UNVERIFIED.
