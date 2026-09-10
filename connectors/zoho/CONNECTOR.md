---
name: zoho
type: connector
category: crm
description: Reads mail, Books and Invoice invoices, Desk tickets, Inventory and Bigin contacts through six read grants, and reads, searches, and creates CRM leads with confirmation
version: 0.2.0
---

# Zoho

Reads mail, Books and Invoice invoices, Desk tickets, Inventory and Bigin contacts through six read grants, and reads, searches, and creates CRM leads with confirmation.

## Status

Shipped 2026-09-09. Live connect 2026-09-09: `crm`, `mail`, `books`, `inventory`, and `invoice` ACTIVE, envelopes UNVERIFIED. `desk` skipped (no access). `bigin` skipped (no access). Verification otherwise fake-provider only. Catalog contract from the approved plan dated 2026-09-09. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `zoho.crm.get` | `id`: string, `fields?`: string, `page?`: integer, `per_page?`: integer, `page_token?`: string | none |
| `zoho.crm.search` | `word?`: string, `email?`: string, `phone?`: string, `criteria?`: string, `fields?`: string, `page?`: integer, `per_page?`: integer | none |
| `zoho.crm.create` | `last_name`: string, `first_name?`: string, `email?`: string, `company?`: string, `phone?`: string, `description?`: string, `lead_source?`: string, `lead_status?`: string, `website?`: string | once |
| `zoho.mail.list` | `account_id`: string, `status?`: string, `sort_by?`: string, `folder_id?`: string, `search_key?`: string, `limit?`: integer, `start?`: integer, `flagged?`: boolean, `sort_order?`: boolean, `threaded_mails?`: boolean, `only_attachment?`: boolean | none |
| `zoho.mail.get` | `folder_id`: string, `account_id`: string, `message_id`: string, `include_block_content?`: boolean | none |
| `zoho.books.list` | `status?`: string, `date_end?`: string, `page?`: integer | none |
| `zoho.books.get` | `invoice_id`: string, `print?`: boolean, `accept?`: string (json, pdf, html) | none |
| `zoho.desk.list` | `orgId?`: string, `viewId?`: string, `from?`: integer, `limit?`: integer | none |
| `zoho.desk.get` | `orgId?`: string, `include?`: string, `ticket_id`: integer | none |
| `zoho.inventory.list` | `organization_id?`: string | none |
| `zoho.inventory.get` | `contact_id`: string, `organization_id?`: string | none |
| `zoho.invoice.list` | `date?`: string, `email?`: string, `organization_id?`: string, `page?`: integer | none |
| `zoho.invoice.get` | `invoice_id`: string, `organization_id`: string | none |
| `zoho.bigin.list` | `fields`: string, `cvid?`: string, `page_token?`: string, `page?`: integer, `per_page?`: integer | none |
| `zoho.bigin.get` | `record_id`: string | none |

Get is fixed to Leads. The CRM grant is write privilege, so readonly is denied even for get and search. Create requires `confirm: true` on the first approved call in a session.

Bigin list and get are fixed to Contacts; caller-supplied `module` and `module_api_name` are refused. Listing requires `fields`. Mail refuses `region`, `accept_language`, and `use_bearer_auth`. Desk `ticket_id` must be an integer. Inventory reads contacts. Optional filters are limited to the declared manifest properties.

## Modules

| Module | Privilege | Actions | Last connected |
|--------|-----------|---------|----------------|
| `crm` | write | `get`, `search`, `create` | Not yet |
| `mail` | read | `list`, `get` | Not yet |
| `books` | read | `list`, `get` | Not yet |
| `desk` | read | `list`, `get` | Not yet |
| `inventory` | read | `list`, `get` | Not yet |
| `invoice` | read | `list`, `get` | Not yet |
| `bigin` | read | `list`, `get` | Not yet |

Each module has its own hosted OAuth grant. A grant unlocks only its module.

## Excluded

Send email, drafts, domain administration, and new create, update, delete, or upsert actions. CRM retains only its shipped lead get, search, and confirmed create slice; other CRM record modules are excluded. Inventory items and item groups are excluded. Bigin modules other than Contacts are excluded.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. Lead creation is a medium-risk write with confirmation once.

## Troubleshooting

- `needs_connect`: use Connect Account for `zoho` and the module named by the status in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.
- `needs_confirmation`: review the intended lead, then repeat with `confirm: true`.
- `denied` under readonly: use a runtime session authorized for the write grant.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Standards index: [standards/AGENTS.md](../../standards/AGENTS.md)
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
