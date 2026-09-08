# Connecting GitHub

What you do, on which side, to make `github.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## Through the gateway

1. Say "Connect GitHub" and name the module: `users`, `repos` or `issues`. Each is its own grant.
2. The skill runs `start_connect` and hands you a link. Open it in your own browser.
3. The provider's hosted page sends you to GitHub, which asks you to authorise the provider's application for the scopes that module needs. Approve.
4. The skill runs `connect_status`. On `ACTIVE`, the gateway writes a connection record and the module's actions run from then on.

No key is typed anywhere. If anything in this flow asks you for a token in the conversation, stop; that is not this flow.

## On GitHub's side

Nothing to prepare. GitHub's authorisation page is the whole of it. If your account belongs to an organisation that restricts third-party applications, an owner has to approve the provider's application once for that organisation, and until they do a repository in it reads as absent.

## Revoking

Two places. Revoke the connection through the gateway, which asks the provider to drop it; then, at GitHub, Settings, Applications, Authorized OAuth Apps, revoke the provider's application. The gateway's `list_connections` shows every module you connected so nothing is missed.

## Last connected

Not yet. This connector has not been run against a live account; the first successful connect is recorded here with its date.
