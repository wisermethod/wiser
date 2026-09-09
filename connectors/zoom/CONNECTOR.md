---
name: zoom
type: connector
category: communication
description: Lists meetings for a user and reads one meeting
version: 0.1.0
---

# Zoom

Lists meetings for a user and reads one meeting.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `zoom.meetings.list` | `user_id`: string, `type?`: string, `from?`: string, `to?`: string, `page_size?`: integer, `page_number?`: integer, `next_page_token?`: string | none |
| `zoom.meetings.get` | `meeting_id`: string, `occurrence_id?`: string | none |

`user_id` is required for list, typically `me`. `meeting_id` is a string.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `meetings` | read | `list`, `get` |

## Excluded

Create, update, delete, registrants, recordings, webinars, whiteboards, and IQ.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `zoom` / `meetings` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
