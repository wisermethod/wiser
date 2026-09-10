# Connecting CourtListener

## Before connecting

Have a CourtListener account with API access and its API key available in your own browser. The gateway must be attached as described in `gateway/SETUP.md`. Rate limits apply; make deliberate requests and do not poll.

## Hosted connect

1. Request `start_connect` with service `courtlistener` and module `caselaw`. The gateway registers the custom toolkit before creating the hosted connection link.
2. Open that link in your own browser and enter the API key on the hosted page. Never paste the token in chat. Enter only the key: the custom toolkit supplies the `Token ` prefix and the `Authorization` header.
3. Request `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables the read actions.

The gateway's provider holds the key. Do not put a CourtListener key into an auth config or `auth-provider.env`.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

Revoke the connection through the gateway, then revoke or rotate the API key in your CourtListener account's API settings. If the account does not expose that control, request revocation from CourtListener support.

## Last connected

2026-09-08, `caselaw` ACTIVE. Hosted connect; the gateway's provider holds the key. Custom toolkit Token header injection confirmed: live proxy search and list_courts returned `{ count, next, previous, results }`. `get_cluster` and `get_docket` returned objects with `id`. No case names, docket numbers, or opinion text recorded here.
