# Connecting PageSpeed Insights

## Before connecting

Have a Google Cloud project with the PageSpeed Insights API enabled, and an API key for that API available in your own browser. Create the key under APIs and Services, Credentials. The gateway must be attached as described in `gateway/SETUP.md`. Rate limits apply; make deliberate requests and do not poll.

## Hosted connect

1. Request `start_connect` with service `pagespeed` and module `insights`. The gateway registers the custom toolkit before creating the hosted connection link.
2. Open that link in your own browser and enter the API key on the hosted page. Never paste the key in chat. Enter only the key: the custom toolkit supplies the `X-Goog-Api-Key` header with the key only, without a prefix.
3. Request `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables the read action.

The gateway's provider holds the key. Do not put a PageSpeed key into an auth config or `auth-provider.env`.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

Revoke the connection through the gateway, then revoke or rotate the API key in the Google Cloud project's Credentials page. If the project does not expose that control, restrict or delete the key there.

## Last connected

Not yet
