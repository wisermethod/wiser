---
name: wiser-crm
type: connector
category: crm
description: Read records, CRM metadata, activities, and people from a member's Wiser CRM install
version: 0.1.0
---

# Wiser CRM

Wiser CRM tracks contacts, companies, deals, and their activities. This connector reads an install through the gateway.

## Status

Built against Wiser CRM `v0.3.1`, which exposes 57 paths in `GET /api/openapi.json`. Verified offline with captured API answers.

## Several installs

Give each install a label that matches its CRM instance name. One connect binds `records`, `activities`, and `people` under that label. Every call passes the label beside `input`. Before any write, read `wiser-crm.records.instance` under that label and stop unless `instance` equals the label and `caller` is `agent`. See [Connecting Wiser CRM](auth.md).

## Reaching it

| Action | Input | Returns |
|--------|-------|---------|
| `wiser-crm.records.list` | `entity`, optional `page`, `limit`, `search` and entity-specific filters | Records, total, page and limit, plus `totalValue` for deals |
| `wiser-crm.records.get` | `entity`, `id` | One record |
| `wiser-crm.records.lookup` | `email`, `domain`, or both | Contact, company, deals, last call and next meeting |
| `wiser-crm.records.stages` | Empty object | Pipeline stages and their keys |
| `wiser-crm.records.fields` | Empty object | Custom field definitions in `defs` |
| `wiser-crm.records.instance` | Empty object | `instance`, `version`, `caller` and `read_only` |
| `wiser-crm.activities.list` | `entity_type`, `entity_id` | Activities for a `contact`, `company` or `deal` |
| `wiser-crm.people.list` | Empty object | People and their roles, plus caller identity in `you` |

Use `contacts`, `companies` or `deals` as the entity and lowercase UUIDs for all IDs. Page ranges from 1 to 10,000 and limit from 1 to 100. Search takes 1 to 200 code points. Contacts accept `status` (1 to 64 code points) and `company_id`. Deals accept `company_id`, `contact_id` and `stage` (a lowercase letter followed by up to 63 lowercase letters, digits or underscores).

Lookup email takes up to 254 code points. Domain takes up to 253 characters and must be a canonical lowercase ASCII hostname with at least two labels. Each label has 1 to 63 characters, with a letter or digit at each end and hyphens allowed inside. IP literals, numeric final labels, trailing dots, punycode labels, and `.localhost`, `.local` and `.internal` suffixes are refused.

## First-use setup

Stages and lookup seed the six default stages when the stage table is empty. On a database predating the `0.3.1` migration, a first deals list or deal read can fill missing deal companies from their contacts and record the backfill marker. A successful deal detail can also seed missing stages through its progress calculation. Lookup can run the deal-company backfill and mark customers from won deals. The migration already applies both backfills and records the markers. These four reads answer HTTP 503 while the install is read-only, with the list and detail restriction applying to deals.

All eight actions run without confirmation and incur no per-call vendor charge. The Cloudflare Access token grants the CRM agent's write privilege. The gateway's provider holds it.

## Security and troubleshooting

- The connector sends fixed relative routes with caller values in query parameters or in the encoded record ID segment. The proxy follows redirects. Cloudflare Access can redirect a rejected token to its sign-in host. Whether the proxy forwards credential headers across that redirect remains unverified. The fork's API sends no redirects to a signed-in agent.
- CRM field text is returned as CRM data. Response headers are excluded.
- After HTTP 400 or 422, read `wiser-crm.records.stages` for valid pipeline keys or `wiser-crm.records.fields` for custom field definitions. A refusal gives the HTTP status and endpoint. The CRM's explanatory sentence is unavailable through the proxy.
- For `needs_connect`, follow [Connecting Wiser CRM](auth.md) with the install's label.

## Excluded operations

This version reads only. Record creation, updates, contact import, and logging activities are outside this version. The connector excludes all deletes, changes to stages or custom fields, settings, people writes, companies import, and custom values in imports. It also excludes email, meetings, and AI column integrations, tasks, meeting and insight resources, customers, stats, widgets, deal updates through `POST /api/deals/{id}/updates`, and the list parameters `filters` and `sort`.

In the CRM itself, a deal update that moves a deal to a won stage can post the win to the install's Slack channel, where Slack is connected, with nobody seeing it first.
