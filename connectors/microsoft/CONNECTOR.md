---
name: microsoft
type: connector
category: communication
description: Reads Outlook messages, Calendar events, OneDrive files, SharePoint lists, Excel values, and joined teams through six separate grants
version: 0.2.0
---

# Microsoft

Reads Outlook messages, Calendar events, OneDrive files, SharePoint lists, Excel values, and joined teams through six separate grants.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `microsoft.outlook.list_messages` | `folder?`: string, `search?`: string, `top?`: integer, `skip?`: integer, `page_token?`: string, `subject?`: string, `is_read?`: boolean | none |
| `microsoft.outlook.get_message` | `message_id`: string, `select?`: string[] | none |
| `microsoft.calendar.list_events` | `filter?`: string, `timezone?`: string, `page_token?`: string, `calendar_id?`: string, `top?`: integer, `skip?`: integer, `expand_recurring_events?`: boolean, `include_sensitivity_label?`: boolean, `select?`: string[] | none |
| `microsoft.calendar.get_event` | `event_id`: string, `include_sensitivity_label?`: boolean | none |
| `microsoft.onedrive.find` | `q`: string, `expand?`: string, `select?`: string, `orderby?`: string, `drive_id?`: string, `page_token?`: string, `top?`: integer, `search_scope?`: string (drive, root) | none |
| `microsoft.onedrive.get` | `item_id`: string, `drive_id?`: string, `select_fields?`: string[], `expand_relations?`: string[] | none |
| `microsoft.sharepoint.list` | `expand?`: string, `filter?`: string, `select?`: string, `orderby?`: string, `site_name?`: string, `top?`: integer, `skip?`: integer | none |
| `microsoft.sharepoint.get` | `list_title`: string, `site_name?`: string | none |
| `microsoft.excel.search` | `query`: string, `drive_id?`: string, `skip_token?`: string, `top?`: integer, `scope?`: string (drive, root) | none |
| `microsoft.excel.get_values` | `address`: string, `item_id`: string, `worksheet_id`: string, `drive_id?`: string, `session_id?`: string | none |
| `microsoft.teams.list` | `page_token?`: string | none |
| `microsoft.teams.get` | `group_id`: string, `expand?`: string, `select?`: string | none |

No action accepts caller-supplied `user_id`. Teams list injects `user_id: 'me'`. Calendar uses its own grant even though Outlook mail and Calendar share a catalog toolkit. Omit `calendar_id` for the connected account's default calendar; this module does not inject `primary` or a mailbox override.

## Modules

| Module | Privilege | Actions | Last connected |
|--------|-----------|---------|----------------|
| `outlook` | read | `list_messages`, `get_message` | Not yet |
| `calendar` | read | `list_events`, `get_event` | Not yet |
| `onedrive` | read | `find`, `get` | Not yet |
| `sharepoint` | read | `list`, `get` | Not yet |
| `excel` | read | `search`, `get_values` | Not yet |
| `teams` | read | `list`, `get` | Not yet |

Each module has its own hosted OAuth grant. A grant unlocks only its module.

## Excluded

Send, reply, draft, delete, move, create or cancel events, accept invitations, attachments, file download, upload, copy, share, checkout, list writes, role assignment, recycle bin, webhooks, workbook or cell writes, charts, tables, session mutation, worksheet deletion, Teams chats, team or channel creation, member changes, meetings, scheduling, presence, contacts, Power BI, Planner, To Do, and administration.

**Word: named skip.** The approved plan dated 2026-09-09 found no Word toolkit in the catalog index. No Word module is declared, and document-comment tools are not routed through OneDrive or Excel as Word.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `microsoft` and the module named by the status in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Standards index: [standards/AGENTS.md](../../standards/AGENTS.md)
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
