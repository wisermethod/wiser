# Connecting Bouncer

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Obtain an API key from Bouncer. In a file outside this plugin, set the variable named `API_KEY` yourself. The module never reads that file or sees its value.

## Through the gateway

1. Bind `--secret usebouncer=<abs file>` when attaching the gateway, or supply the owning root's Provides `secrets:usebouncer` path. There is no default credential directory, and `memory/secrets/` is not one.
2. In a human turn, request connect for `usebouncer` / `verify`. The gateway names the file and variable `API_KEY`, never its value.
3. Run `connect_status`; only ACTIVE unlocks actions.

## Per-module notes

- `verify`: separate connect, write privilege.

## The route this connector does not use

A hosted catalog grant is not a route for this service; it has no catalog toolkit. Bind the local file. Never paste a key into chat.

## Revoking

**This connector holds no grant the gateway can revoke, so `disconnect` cannot take it down.** Its modules use the `local-file` provider: the credential is a file you wrote and bound, and the gateway never holds it.

`disconnect` still stops for confirmation first, as it does everywhere, and only the confirmed call reaches the provider. That call answers `needs_provider_capability` with `capability: revoke` and `how: "delete the file"`, **the adapter's fixed words, which name no file**; the file is the one this guide's Connecting section binds. It removes nothing, and that is correct rather than a defect to report.

**Revoke at the vendor, then remove the file.** Revoke or rotate the API key at the platform, then remove its binding so nothing here can read the old value. **Both steps are needed and they do different things**: the first ends the key, the second ends this machine's use of it.

**Then run `connect_status` for each module and read what it returns.** For this provider that check reads the bound file and asks no vendor. It answers `connected` while the file is readable and holds the named variables, and `needs_connect` with `provider_status: INACTIVE` once it is not, which covers a file that is missing, empty, unreadable, or short of a variable, without distinguishing them. **So a row turning INACTIVE means this machine can no longer read a usable credential, and says nothing about whether the key still works at the vendor.**

**There is no ABSENT here, deliberately.** `gateway/providers/AGENTS.md` records why: a file that is not on this disk establishes nothing about what was revoked upstream, so `local-file` reports INACTIVE and never the word that permits the gateway to remove a record. **So a record for this connector is removed by no shipped path.** That is the cost of a credential the gateway does not hold, and it is the reason the row survives after you have revoked the key.

## Last connected

Not yet.
