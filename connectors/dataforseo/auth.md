# Connecting DataForSEO

What you do, on which side, to make `dataforseo.*` actions run. Connect Account walks this in its own turn; this file is what it reads.

## On the platform's side, first

Have a DataForSEO account with API access. On the vendor's API Access page, copy the two credentials the vendor names API login and API password. Keep them in your own browser. Never paste either into chat. The same pair serves both modules.

Rate limits the vendor publishes: 2000 calls a minute, 30 simultaneous, and 12 a minute for Google Ads search volume.

## Through the gateway

1. Say "Connect DataForSEO" and name the module, `research` or `backlinks`.
2. The skill runs `start_connect` and hands you a hosted link.
3. Open that link in your own browser. Enter the API login and the API password on the hosted page. Nothing is typed into the conversation.
4. The skill runs `connect_status`. Only `ACTIVE` completes that module's grant.

Each module is its own connect. Both asks for the same API login and API password, so two hosted connects of one account. A grant on `research` does not unlock `backlinks`, and the reverse.

The gateway's provider holds the credentials. This connector holds none. There is no credential file here and no `secrets:dataforseo` key.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token. A personal token in chat is never a route.

The vendor's sandbox host is a different domain from the live API. The gateway's provider does not reach it. Contract fixtures are the gateway's fake provider, not the sandbox.

## Revoking

**The gateway does not revoke**; no shipped path calls it. Revoking is done at the vendor, and where the gateway's provider holds the grant, by deleting the connected account there. Regenerate the API password on the vendor's API Access page. Regenerating the password invalidates both modules' hosted grants. Afterwards run `connect_status` for each module you revoked: that is what updates the local record, and without it the row keeps reading ACTIVE.

## Last connected

Not yet
