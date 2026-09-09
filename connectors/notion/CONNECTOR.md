---
name: notion
type: connector
category: research
description: Searches pages and databases and reads page properties
version: 0.1.0
---

# Notion

Searches pages and databases and reads page properties.

## Status

Shipped 2026-09-09. Live connect 2026-09-09: `pages` ACTIVE, envelope UNVERIFIED. Verification otherwise fake-provider only. Catalog contract from the approved plan dated 2026-09-09. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `notion.pages.search` | `query?`: string, `page_size?`: integer, `start_cursor?`: string, `filter_value?`: page or database | none |
| `notion.pages.get` | `page_id`: string | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `pages` | read | `search`, `get` |

## Excluded

Create, update, archive, blocks, comments, database inserts, and markdown replacement. Page get returns properties, not block content.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `notion` / `pages` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
