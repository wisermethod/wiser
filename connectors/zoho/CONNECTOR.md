---
name: zoho
type: connector
category: crm
description: Reads and searches leads and creates a lead with confirmation
version: 0.1.0
---

# Zoho

Reads and searches leads and creates a lead with confirmation.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `zoho.crm.get` | `id`: string, `fields?`: string, `page?`: integer, `per_page?`: integer, `page_token?`: string | none |
| `zoho.crm.search` | `word?`: string, `email?`: string, `phone?`: string, `criteria?`: string, `fields?`: string, `page?`: integer, `per_page?`: integer | none |
| `zoho.crm.create` | `last_name`: string, `first_name?`: string, `email?`: string, `company?`: string, `phone?`: string, `description?`: string, `lead_source?`: string, `lead_status?`: string, `website?`: string | once |

Get is fixed to Leads. The CRM grant is write privilege, so readonly is denied even for get and search. Create requires `confirm: true` on the first approved call in a session.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `crm` | write | `get`, `search`, `create` |

## Excluded

Upsert, update, convert, delete, contacts, deals, accounts, notes, tasks, events, calls, tags, email drafts, and attachments.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. Lead creation is a medium-risk write with confirmation once.

## Troubleshooting

- `needs_connect`: use Connect Account for `zoho` / `crm` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.
- `needs_confirmation`: review the intended lead, then repeat with `confirm: true`.
- `denied` under readonly: use a runtime session authorized for the write grant.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
