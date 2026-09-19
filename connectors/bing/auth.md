# Connecting Bing Webmaster Tools

What you do, on which side, to make `bing.*` actions run. Connect Account walks this in its own turn; this file is what it reads.

## On the platform's side, first

Have a Bing Webmaster Tools account with at least one verified site. Generate the API key in Bing Webmaster Tools under Settings, API Access. The vendor issues one key per user, valid for every site that user has verified. Keep it in your own browser. Never paste it into chat.

## Through the gateway

1. Say "Connect Bing" and name the module, `webmaster`.
2. The skill runs `start_connect` and hands you a hosted link.
3. Open that link in your own browser. Paste the API key on the hosted page. Nothing is typed into the conversation.
4. The skill runs `connect_status`. Only `ACTIVE` completes the grant.

The gateway's provider holds the key. This connector holds none. There is no credential file here and no `secrets:bing` key.

A site missing from `list_sites` is a verification task at the vendor, not a connection fault.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token. A personal token in chat is never a route.

## Revoking

Revoke the module through the gateway, then delete the API key at Bing Webmaster Tools under Settings, API Access.

## Last connected

Not yet
