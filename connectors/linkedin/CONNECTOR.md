---
name: linkedin
type: connector
category: communication
description: Reads the connected profile and one post
version: 0.1.0
---

# LinkedIn

Reads the connected profile and one post.

## Status

Shipped 2026-09-09. Live connect 2026-09-09: `profile` ACTIVE, envelope UNVERIFIED. Verification otherwise fake-provider only. Catalog contract from the approved plan dated 2026-09-09. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `linkedin.profile.me` | No inputs | none |
| `linkedin.profile.get_post` | `post_id`: string | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `profile` | read | `me`, `get_post` |

## Excluded

Search, create posts, comments, delete, ads targeting, image upload, and another person by id.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `linkedin` / `profile` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
