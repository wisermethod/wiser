---
name: wiser-crm
type: connector
category: crm
description: Reads, creates and updates records, imports contacts, logs and reads activities, and reads pipeline stages, custom fields, install identity and people in labelled Wiser CRM installs, confirming each write unless a standing approval covers a create, update or activity log
version: 0.2.0
---

# Wiser CRM

Wiser CRM tracks contacts, companies, deals, and their activities. This connector reads and writes a labelled install through the gateway.

## Status

Built against Wiser CRM `v0.3.1`, which exposes 57 paths in `GET /api/openapi.json`. Verified offline with captured API answers.

## Several installs

Give each install a label that matches its CRM instance name. One connect binds `records`, `activities`, and `people` under that label. Every call passes the label beside `input`. Before any write, read `wiser-crm.records.instance` under that label and stop unless `instance` equals the label and `caller` is `agent`. See [Connecting Wiser CRM](auth.md).

## Reaching it

| Action | Input | Returns |
|--------|-------|---------|
| `wiser-crm.records.list` | `entity`, optional `page`, `limit`, `search` and entity-specific filters | Records, total, page and limit, plus `totalValue` for deals |
| `wiser-crm.records.get` | `entity`, `id` | One record |
| `wiser-crm.records.create` | `entity`, `fields` | The new record and its UUID |
| `wiser-crm.records.update` | `entity`, `id`, `fields` | The updated record |
| `wiser-crm.records.import_contacts` | `contacts` | Counts for imported, matched, companies created, skipped and duplicate rows |
| `wiser-crm.records.lookup` | `email`, `domain`, or both | Contact, company, deals, last call and next meeting |
| `wiser-crm.records.stages` | Empty object | Pipeline stages and their keys |
| `wiser-crm.records.fields` | Empty object | Custom field definitions in `defs` |
| `wiser-crm.records.instance` | Empty object | `instance`, `version`, `caller` and `read_only` |
| `wiser-crm.activities.list` | `entity_type`, `entity_id` | Activities for a `contact`, `company` or `deal` |
| `wiser-crm.activities.log` | `entity_type`, `entity_id`, `type`, `body` | `ok: true` |
| `wiser-crm.people.list` | Empty object | People and their roles, plus caller identity in `you` |

Use `contacts`, `companies` or `deals` as the entity and lowercase UUIDs for all IDs. Page ranges from 1 to 10,000 and limit from 1 to 100. Search takes 1 to 200 code points. Contacts accept `status` (1 to 64 code points) and `company_id`. Deals accept `company_id`, `contact_id` and `stage` (a lowercase letter followed by up to 63 lowercase letters, digits or underscores).

Lookup email takes up to 254 code points. Domain takes up to 253 characters and must be a canonical lowercase ASCII hostname with at least two labels. Each label has 1 to 63 characters, with a letter or digit at each end and hyphens allowed inside. IP literals, numeric final labels, trailing dots, punycode labels, and `.localhost`, `.local` and `.internal` suffixes are refused.

## Writes

All four writes stop for confirmation. A matching standing approval of kind `change` can cover `records.create`, `records.update`, or `activities.log`. Contact import always requires confirmation because it can fill empty fields on matching contacts.

**`records.update` caution.** Moving a deal to a won stage can post the win to the install's Slack channel where Slack is connected, with nobody seeing it first.

Field keys must match `^[a-z][a-z0-9_]*$` and contain at most 64 code points. Values may be strings, finite numbers, booleans or null. The `custom` key takes an object with the same key and scalar value rules. The serialized `fields` object must be at most 16 KiB in UTF-8. Top-level `company_id` and `contact_id` take lowercase UUIDs or null to clear a link. The CRM handles validation of an empty `fields` object and decides which fields it accepts.

When a write sets a company or contact link, the connector reads the linked record first and reads back the result. A deal created with a contact and no specified company inherits that contact's company. A deal update does the same if the deal has no company, and preserves its existing company otherwise. Passing `null` explicitly clears the specified link. If readback fails or finds a mismatch after an update, the connector attempts to restore the prior values and reports the failure. If restoration fails, it reports both failures and says that the new values may still be in place.

**Create exception.** If readback fails or finds a link mismatch after a create, the connector returns the new ID and states that the record was created and left in place. Tell the person the ID and that the record was left in place.

An import takes 1 to 500 objects. Each requires a nonempty `first_name` and can include `last_name`, `email`, `phone`, `title`, `status`, `company`, `company_domain`, `company_industry` and `company_phone`. Each supplied string can contain up to 256 code points.

Activity `type` is `note`, `call`, `email` or `meeting`. The connector checks the 10,000-code-point limit on the supplied `body`, trims it and requires text after trimming. It stores an activity in the CRM.

## First-use setup

Stages and lookup seed the six default stages when the stage table is empty. On a database predating the `0.3.1` migration, a first deals list or deal read can fill missing deal companies from their contacts and record the backfill marker. A successful deal detail can also seed missing stages through its progress calculation. Lookup can run the deal-company backfill and mark customers from won deals. The migration already applies both backfills and records the markers. These four reads answer HTTP 503 while the install is read-only, with the list and detail restriction applying to deals.

All eight reads run without confirmation. None of the twelve actions incurs a per-call vendor charge. The Cloudflare Access token grants the CRM agent's write privilege. The gateway's provider holds it.

## Security and troubleshooting

- The connector sends fixed relative routes with caller values in query parameters, in the encoded record ID segment, or in JSON write bodies. The proxy follows redirects. Cloudflare Access can redirect a rejected token to its sign-in host. Whether the proxy forwards credential headers across that redirect remains unverified. The fork's API sends no redirects to a signed-in agent.
- CRM field text is returned as CRM data. Response headers are excluded. The confirmation stop shows the input, including the text supplied in `fields` or `body`.
- After HTTP 400 or 422, read `wiser-crm.records.stages` for valid pipeline keys or `wiser-crm.records.fields` for custom field definitions. A refusal gives the HTTP status and endpoint. The CRM's explanatory sentence is unavailable through the proxy.
- For `needs_connect`, follow [Connecting Wiser CRM](auth.md) with the install's label.

## Excluded operations

The connector excludes all deletes, changes to stages or custom fields, settings, people writes, companies import, and custom values in imports. It also excludes email, meetings, and AI column integrations, tasks, meeting and insight resources, customers, stats, widgets, deal updates through `POST /api/deals/{id}/updates`, and the list parameters `filters` and `sort`.
