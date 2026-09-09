# Connecting GitHub

What you do, on which side, to make `github.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## On the provider's side, first

The provider needs a blueprint for GitHub (OAuth, managed by the provider) before a connect link can work. Make that in the provider dashboard. The clicks are in the provider's own SETUP.md, the file `gateway/SETUP.md` points at. Do not connect a test account from that dashboard; that authenticates a playground user, not this gateway. Connecting is the next section.

## Through the gateway

1. Say "Connect GitHub" and name the module: `users`, `repos` or `issues`. Each is its own grant.
2. The skill runs `start_connect` and hands you a link. Open it in your own browser.
3. The provider's hosted page sends you to GitHub, which asks you to authorise the provider's application for the scopes that module needs. Approve.
4. The skill runs `connect_status`. On `ACTIVE`, the gateway writes a connection record and the module's actions run from then on.

No key is typed anywhere. If anything in this flow asks you for a token in the conversation, stop; that is not this flow.

## The route this connector does not use

A personal access token in a file is the local-file provider, and this connector is not on it. GitHub here is OAuth through the gateway's hosted link. A skill that asks you to paste a `ghp_` token, or to write one under `memory/secrets/`, is wrong; stop.

## On GitHub's side

Nothing to prepare. GitHub's authorisation page is the whole of it. If your account belongs to an organisation that restricts third-party applications, an owner has to approve the provider's application once for that organisation, and until they do a repository in it reads as absent.

## Revoking

Two places. Revoke the connection through the gateway, which asks the provider to drop it; then, at GitHub, Settings, Applications, Authorized OAuth Apps, revoke the provider's application. The gateway's `list_connections` shows every module you connected so nothing is missed.

## Last connected

2026-09-08, `repos` and `issues`, Grok harness with `wiser-gateway`. Catalog execute `github.repos.get` on `wisermethod/wiser` returned the repository. `github.repos.list_for_user` confirmed: `{ repositories }`. `github.issues.list` confirmed catalog execute 2026-09-08: `{ issues }`, empty on `wisermethod/wiser` open. `users` not connected.

2026-09-09, `github.issues.create` confirmed catalog execute on `wisermethod/wiser` via current-tree stdio (`--harness m3-connect`). Without `confirm`: `needs_confirmation`. With `confirm: true`: vendor issue object with `id`, `number`, `title`, `html_url`, `state`. Fake fixture already matches that object shape. `users` not connected.
