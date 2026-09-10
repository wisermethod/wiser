---
name: figma
type: connector
category: media
description: Reads file metadata and lists the files in a project
version: 0.1.0
---

# Figma

Reads file metadata and lists the files in a project.

## Status

Shipped 2026-09-09. Live connect 2026-09-09: `files` ACTIVE, envelope UNVERIFIED. Verification otherwise fake-provider only. Catalog contract from the approved plan dated 2026-09-09. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `figma.files.get` | `file_key`: string | none |
| `figma.files.list` | `project_id`: string, `branch_data?`: boolean | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `files` | read | `get`, `list` |

## Excluded

Full file JSON trees, comments, webhooks, variables, image rendering, team components, and writes.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `figma` / `files` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
