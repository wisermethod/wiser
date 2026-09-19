---
name: dataforseo
type: connector
category: research
description: Reaches DataForSEO SERP, keyword, and backlink research through two grants, each recorded write because it spends, with every billed call confirmed
version: 0.1.0
---

# DataForSEO

DataForSEO provides SERP, keyword, and backlink research. This connector reaches live Google SERP, Labs keyword research, Google Ads search volume, and live backlink summaries through two modules. Every billed call is confirmed. It does not queue tasks, crawl pages, or call any non-Google engine.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. The sandbox host is not reachable through the gateway; fake-provider tests are the contract fixtures. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway, by action id. Required fields, enums, and bounds are checked in the module before transport. Undeclared keys are refused with `invalid_arguments`. The schema is the spend boundary. The module returns the vendor envelope unchanged so the caller can read `cost` and per-task status. A task-level `status_code` other than 20000 is data, not an error.

List prices below were read 2026-09-19.

| Action | Inputs (? means optional) | Confirmation | List price 2026-09-19 |
|--------|---------------------------|--------------|------------------------|
| `dataforseo.research.serp` | `keyword`; exactly one of `location_code` or `location_name`; exactly one of `language_code` or `language_name`; `device?` desktop or mobile; `depth?` 10 to 700, multiple of 10 | always | SERP live: $0.002 per 10 results requested; depth multiplies it |
| `dataforseo.research.keyword_ideas` | `keywords` (1 to 200); location; language; `limit?`; `offset?`; `include_serp_info?`; `filters?`; `order_by?`; `closely_variants?` | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.related_keywords` | `keyword`; location; language; `depth?` 0 to 4; `limit?`; `offset?`; `filters?`; `order_by?`; `include_serp_info?` | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.search_volume` | `keywords` (1 to 1000, each max 80 chars); location?; language?; `date_from?`; `date_to?`; `search_partners?` | always | Google Ads search volume: billed per call; list price not read on 2026-09-19, so the first live call is the price reading |
| `dataforseo.research.keyword_difficulty` | `keywords` (1 to 1000); location; language | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.search_intent` | `keywords` (1 to 1000); `language_code` | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.ranked_keywords` | `target` (bare domain); location; language; `limit?`; `offset?`; `filters?`; `order_by?`; `item_types?`; `load_rank_absolute?` | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.competitors` | `target` (bare domain); location; language; `limit?`; `offset?`; `filters?`; `exclude_top_domains?`; `intersecting_domains?` | always | Labs: $0.012 per call plus $0.00012 per returned item |
| `dataforseo.research.locations` | `country?` two-letter code; when given, the module filters `tasks[0].result` by `country_iso_code` | none | Free of charge per https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/ |
| `dataforseo.backlinks.summary` | `target` (domain, subdomain, or absolute URL); `include_subdomains?`; `backlinks_status_type?` all, live, or lost | always | Backlinks: $0.024 per call plus $0.000036 per row |
| `dataforseo.backlinks.referring_domains` | `target`; `limit?`; `offset?`; `filters?`; `order_by?`; `include_subdomains?`; `backlinks_status_type?` | always | Backlinks: $0.024 per call plus $0.000036 per row |
| `dataforseo.backlinks.anchors` | `target`; `limit?`; `offset?`; `filters?`; `order_by?`; `backlinks_status_type?` | always | Backlinks: $0.024 per call plus $0.000036 per row |

Location and language, where required, are exactly one of code or name. Both given, or neither, is refused. `filters` is at most 8 elements, each `and`, `or`, or a three-element array whose first two entries are non-empty strings. `order_by` is at most 3 strings matching `field,asc` or `field,desc`. `include_clickstream_data` is not exposed. Live POST bodies are an array holding exactly one task object.

The returned object is the vendor envelope `{ version, status_code, status_message, time, cost, tasks_count, tasks_error, tasks }` with no transport headers.

## Credentials

This connector holds none. Each grant lives with the gateway's provider. Hosted connect collects the vendor's API login and API password. There is no credential file here and no `secrets:dataforseo` key.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `research` | `write` | `serp`, `keyword_ideas`, `related_keywords`, `search_volume`, `keyword_difficulty`, `search_intent`, `ranked_keywords`, `competitors`, `locations` |
| `backlinks` | `write` | `summary`, `referring_domains`, `anchors` |

Both grants use the same API login and API password entered on hosted connect, so two connects of one account. The credential creates billable tasks and spends the account balance, so the grant is not read-only whatever the exposed actions do. A grant is per module.

## Excluded

Every task-queue (non-live) endpoint, OnPage, Content Analysis, Merchant, App Data, Business Data, clickstream data, and any non-Google engine. Not all DataForSEO products.

## Destructive Actions

None that mutate a property. Every billed action spends and cannot be undone; the charge stands.

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `research.serp` | Spends SERP live credit; $0.002 per 10 results requested; depth multiplies it | always |
| `research.keyword_ideas` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `research.related_keywords` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `research.search_volume` | Spends Google Ads search volume credit; billed per call; list price not read on 2026-09-19 | always |
| `research.keyword_difficulty` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `research.search_intent` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `research.ranked_keywords` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `research.competitors` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item | always |
| `backlinks.summary` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row | always |
| `backlinks.referring_domains` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row | always |
| `backlinks.anchors` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row | always |

## Troubleshooting

- `needs_connect`: follow `auth.md` for the named module. A `research` grant does not unlock `backlinks`.
- `needs_confirmation`: every billed call. Review the action, the price in the summary, and the input, then repeat with `confirm: true` if intended.
- `invalid_arguments`: correct the named field; undeclared keys and clickstream flags are refused before transport.
- `vendor_error` 401: credentials rejected at the vendor; reconnect through Connect Account.
- `vendor_error` 402, or a task status in the 40201 class: insufficient balance; top up at the vendor.
- `vendor_error` 404 on a task: the endpoint or its parameters.
- A task `status_code` in the 40501 class is invalid field data returned in the envelope, not a gateway error. Read `cost` and the task status from the object.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- Locations (free of charge): https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/
- Platform API: https://docs.dataforseo.com/v3/
