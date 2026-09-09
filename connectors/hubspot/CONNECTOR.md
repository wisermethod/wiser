---
name: hubspot
type: connector
category: crm
description: Reads and searches contacts
version: 0.1.0
---

# HubSpot

Reads and searches contacts.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `hubspot.crm.get_contact` | `contact_id`: string, `archived?`: boolean, `properties?`: string[], `associations?`: string[] | none |
| `hubspot.crm.search_contacts` | `query?`: string, `limit?`: integer, `after?`: string, `properties?`: string[], `filter_groups?`: object[] | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `crm` | read | `get_contact`, `search_contacts` |

## Excluded

Create, update, archive, merge, property history, companies, deals, tickets, marketing email, and workflows.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `hubspot` / `crm` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
