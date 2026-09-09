# Connecting Tiny Fish

## Before connecting

Have a Tiny Fish account and an API key available in your own browser at `https://agent.tinyfish.ai/api-keys`. Attach the gateway as described in `gateway/SETUP.md`. The approved plan dated 2026-09-09 identifies Search and Fetch as free; live access and rate limits remain unverified. Make deliberate requests and do not poll.

## Hosted connect

1. Ask Connect Account to connect service `tinyfish`, module `web`. The gateway registers the custom toolkit and returns a hosted connection link.
2. Open the link in your own browser. Enter only the API key on the hosted page. The toolkit supplies `X-API-Key` with the key only, without a prefix. Never paste the key in chat.
3. Connect Account checks the connection status. Only `ACTIVE` completes the read grant for both search and fetch.

The gateway's provider holds the key. Do not put it into an auth config or a project-key file.

## The route this connector does not use

Local-file is not this connector's route. It does not read a vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

Revoke the connection through the gateway, then revoke or rotate the API key at `https://agent.tinyfish.ai/api-keys`. If that page offers no revocation control, contact Tiny Fish support.

## Last connected

Not yet.
