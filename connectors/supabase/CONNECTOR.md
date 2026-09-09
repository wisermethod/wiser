---
name: supabase
type: connector
category: development
description: Lists projects and reads one project
version: 0.1.0
---

# Supabase

Lists projects and reads one project.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `supabase.projects.list` | No inputs | none |
| `supabase.projects.get` | `ref`: string | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `projects` | read | `list`, `get` |

## Excluded

Tables, SQL, secrets, API keys, branches, functions, auth configuration, and backups.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `supabase` / `projects` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
