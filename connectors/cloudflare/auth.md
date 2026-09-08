# Connecting Cloudflare DNS

What you do, on which side, to make `cloudflare.dns.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## On Cloudflare's side, first

Cloudflare authenticates with an API token you make, and the token's permissions are fixed when you make it. Make one for this purpose and nothing else.

1. Sign in at Cloudflare. Open your profile, then API Tokens, then Create Token.
2. Start from the "Edit zone DNS" template.
3. Permissions: Zone, DNS, Edit. Nothing else.
4. Zone Resources: Include, Specific zone, and pick the zone or zones this connection is for. Do not choose all zones unless you mean every zone this account will ever hold.
5. Create the token and keep the page open; the value is shown once.

The token reaches exactly the zones you named and can do exactly DNS. A token that can also purge cache, change encryption, or touch Workers is the wrong token for this module.

## Through the gateway

1. Say "Connect Cloudflare DNS."
2. The skill runs `start_connect` and hands you a link. Open it in your own browser.
3. The provider's hosted page asks for the API token. Paste it there, on that page, and nowhere else. The skill never sees it, and if it asks you to paste the token into the conversation instead, stop.
4. The skill runs `connect_status`. On `ACTIVE`, the gateway writes a connection record and the module's actions run from then on.

If the provider's hosted page does not offer a field for an API token, this connector moves to the local-file provider and this section is rewritten to say where the file goes. That is a Solve item in the build Playbook as of 2026-09-05.

## Finding your zone id

Every action takes `zone_id`. It is on the zone's Overview page at Cloudflare, in the right-hand column, and `list_records` with a guessed id answers with a 403 rather than another zone's records.

## Revoking

Two places. Revoke the connection through the gateway; then, at Cloudflare, API Tokens, roll or delete the token. Deleting the token is the one that matters: the provider holding a dead token can do nothing.

## Last connected

Not yet. This connector has not been run against a live zone; the first successful connect is recorded here with its date.
