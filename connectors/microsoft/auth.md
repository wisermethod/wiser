# Connecting Microsoft

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Use a Microsoft account that can access the requested resources. If the organization restricts third-party apps, obtain its approval for the gateway's provider application. Prepare an OAuth blueprint for each module through the gateway's provider as described by [gateway/SETUP.md](../../gateway/SETUP.md).

## Through the gateway

1. Request "Connect Microsoft" and name the module.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Sign in to Microsoft and approve the requested access in your browser.
4. The skill runs `connect_status`. Only ACTIVE unlocks that module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Per-module notes

- `outlook`: separate connect, read privilege; Last connected: Not yet.
- `calendar`: separate connect, read privilege; Last connected: Not yet.
- `onedrive`: separate connect, read privilege; Last connected: Not yet.
- `sharepoint`: separate connect, read privilege; Last connected: Not yet.
- `excel`: separate connect, read privilege; Last connected: Not yet.
- `teams`: separate connect, read privilege; Last connected: Not yet.

Outlook mail and Calendar require separate connects even though they share a catalog toolkit. Use the connected Microsoft account for every module; no action accepts another user's mailbox identifier.

Teams reads the connected account's joined teams and one team by group id. Word is not included.

## Revoking

Revoke each module through the gateway, then remove the application's access at Microsoft account application permissions or the organization My Apps portal.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

Not yet.
