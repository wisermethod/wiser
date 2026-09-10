# Connecting Supabase

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Use a Supabase account that can access the requested resources. If the organization restricts third-party apps, obtain its approval for the gateway's provider application. Prepare the OAuth blueprint through the gateway's provider as described by [gateway/SETUP.md](../../gateway/SETUP.md).

## Through the gateway

1. Request "Connect Supabase" for `supabase` / `projects`.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Sign in to Supabase and approve the requested access in your browser.
4. The skill runs `connect_status`. Only ACTIVE unlocks the module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Grant

`projects` has read privilege. Only this module is included in this slice.

## Revoking

Revoke the module through the gateway, then remove the application's access at Supabase account authorized applications.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

2026-09-09, `projects` ACTIVE. Hosted OAuth; live envelope UNVERIFIED.
