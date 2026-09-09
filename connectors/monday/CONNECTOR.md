---
name: monday
type: connector
category: development
description: Lists boards and reads a page of board items
version: 0.1.0
---

# monday.com

Lists boards and reads a page of board items.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `monday.boards.list` | `ids?`: integer[], `page?`: integer, `limit?`: integer, `workspace_ids?`: integer[] | none |
| `monday.boards.list_items` | `board_id`: integer, `limit?`: integer, `cursor?`: string, `group_id?`: string | none |

`board_id` is an integer, and `ids` and `workspace_ids` are integer arrays.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `boards` | read | `list`, `list_items` |

## Excluded

Create boards or items, archive, delete, updates, docs, and workspace writes.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `monday` / `boards` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
