# Connecting Bouncer

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Obtain an API key from Bouncer. In a file outside this plugin, set the variable named `API_KEY` yourself. The module never reads that file or sees its value.

## Through the gateway

1. Bind `--secret usebouncer=<abs file>` when attaching the gateway, or supply the owning root's Provides `secrets:usebouncer` path. There is no default credential directory, and `memory/secrets/` is not one.
2. In a human turn, request connect for `usebouncer` / `verify`. The gateway names the file and variable `API_KEY`, never its value.
3. Run `connect_status`; only ACTIVE unlocks actions.

## Per-module notes

- `verify`: separate connect, write privilege; Last connected: Not yet.

## The route this connector does not use

A hosted catalog grant is not a route for this service; it has no catalog toolkit. Bind the local file. Never paste a key into chat.

## Revoking

Revoke each module through the gateway, then revoke the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform.

## Last connected

Not yet. Record the date here after the operator completes each module's connect.
