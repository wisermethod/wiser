---
name: dataforseo
type: connector
category: research
description: Reaches DataForSEO SERP, keyword, and backlink research through two grants, each recorded write because it spends
version: 0.4.0
---

# DataForSEO

DataForSEO provides SERP, keyword, and backlink research. This connector reaches live Google SERP, Labs keyword research, Google Ads search volume, and live backlink summaries through two modules. A billed action takes `confirmation: none` when its published input bounds one call's worst case and this file states that worst case; `search_volume` has no published price and `backlinks.summary` has no bound on returned rows, so both take `confirmation: always`. It does not queue tasks, crawl pages, or call any non-Google engine.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. The sandbox host is not reachable through the gateway; fake-provider tests are the contract fixtures. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway, by action id. Required fields, enums, and bounds are checked in the module before transport. Undeclared keys are refused with `invalid_arguments`. The schema is the spend boundary. The module returns the vendor envelope unchanged so the caller can read `cost` and per-task status. A task-level `status_code` other than 20000 is data, not an error.

List prices below were read 2026-09-19.

| Action | Inputs (? means optional) | Confirmation | List price 2026-09-19 |
|--------|---------------------------|--------------|------------------------|
| `dataforseo.research.serp` | `keyword` (at most 700 characters, no vendor operator tokens); exactly one of `location_code` or `location_name`; exactly one of `language_code` or `language_name`; `device?` desktop or mobile; `depth?` 10 to 200, multiple of 10 | none | SERP live: $0.002 per 10 results requested; depth multiplies it; worst case at depth 200 is $0.040 |
| `dataforseo.research.keyword_ideas` | `keywords` (1 to 200); location; language; `limit?`; `offset?`; `include_serp_info?`; `filters?`; `order_by?`; `closely_variants?` | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 |
| `dataforseo.research.related_keywords` | `keyword`; location; language; `depth?` 0 to 4; `limit?`; `offset?`; `filters?`; `order_by?`; `include_serp_info?` | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 |
| `dataforseo.research.search_volume` | `keywords` (1 to 1000, each max 80 chars); location?; language?; `date_from?`; `date_to?`; `search_partners?` | always | Google Ads search volume: billed per call; list price not read on 2026-09-19, so the first live call is the price reading |
| `dataforseo.research.keyword_difficulty` | `keywords` (1 to 1000); location; language | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at 1000 keywords is $0.132 |
| `dataforseo.research.search_intent` | `keywords` (1 to 1000); `language_code` | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at 1000 keywords is $0.132 |
| `dataforseo.research.ranked_keywords` | `target` (bare domain); location; language; `limit?`; `offset?`; `filters?`; `order_by?`; `item_types?`; `load_rank_absolute?` | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 |
| `dataforseo.research.competitors` | `target` (bare domain); location; language; `limit?`; `offset?`; `filters?`; `exclude_top_domains?`; `intersecting_domains?` | none | Labs: $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 |
| `dataforseo.research.locations` | `country?` two-letter code; when given, the module filters `tasks[0].result` by `country_iso_code` | none | Free of charge per https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/ |
| `dataforseo.backlinks.summary` | `target` (domain, subdomain, or absolute URL); `include_subdomains?`; `backlinks_status_type?` all, live, or lost | always | Backlinks: $0.024 per call plus $0.000036 per row; no `limit` field, so the row count is unbounded |
| `dataforseo.backlinks.referring_domains` | `target`; `limit?`; `offset?`; `filters?`; `order_by?`; `include_subdomains?`; `backlinks_status_type?` | none | Backlinks: $0.024 per call plus $0.000036 per row; worst case at limit 1000 is $0.060 |
| `dataforseo.backlinks.anchors` | `target`; `limit?`; `offset?`; `filters?`; `order_by?`; `backlinks_status_type?` | none | Backlinks: $0.024 per call plus $0.000036 per row; worst case at limit 1000 is $0.060 |

Location and language, where required, are exactly one of code or name. Both given, or neither, is refused; the manifest publishes that as a `oneOf` over the four combinations, and this module is what applies it. Every declared length bound, `serp` `keyword` at 700 and each `keywords` entry at 80, counts **code points**, so a 351-emoji keyword is 351 characters and not the 702 that `String.length` reports; `standards/script-contract.md` Published input schema is where that rule lives. `serp` `keyword` is refused when it contains a vendor operator token, case-insensitively, before and after one round of URL decoding: `allinanchor:`, `allintext:`, `allintitle:`, `allinurl:`, `cache:`, `define:`, `definition:`, `filetype:`, `id:`, `inanchor:`, `info:`, `intext:`, `intitle:`, `inurl:`, `link:`, `site:`. The vendor multiplies the task charge by five for these, so the module does not let such a call through until an estimate can represent that charge. An ordinary SERP call does not stop, so no confirmation summary appears. `serp` `depth` is 10 to 200, multiple of 10, per the vendor's live advanced endpoint page read 2026-09-19. `filters` is a vendor expression: either one condition, an array of exactly three (a non-empty string field path, an operator from the documented set, and a value), or a group whose elements alternate expression, `and` or `or`, expression, with no leading or trailing logical string. Conditions are counted, not array elements, and more than 8 are refused. `order_by` is at most 3 strings matching `field,asc` or `field,desc`. `include_clickstream_data` is not exposed. Live POST bodies are an array holding exactly one task object.

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
| `research.serp` | Spends SERP live credit; $0.002 per 10 results requested; depth multiplies it; worst case at depth 200 is $0.040 | none |
| `research.keyword_ideas` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 | none |
| `research.related_keywords` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 | none |
| `research.search_volume` | Spends Google Ads search volume credit; billed per call; list price not published | always |
| `research.keyword_difficulty` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at 1000 keywords is $0.132 | none |
| `research.search_intent` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at 1000 keywords is $0.132 | none |
| `research.ranked_keywords` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 | none |
| `research.competitors` | Spends Labs credit; $0.012 per call plus $0.00012 per returned item; worst case at limit 1000 is $0.132 | none |
| `backlinks.summary` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row; no `limit` field, so the row count is unbounded | always |
| `backlinks.referring_domains` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row; worst case at limit 1000 is $0.060 | none |
| `backlinks.anchors` | Spends Backlinks credit; $0.024 per call plus $0.000036 per row; worst case at limit 1000 is $0.060 | none |

## Troubleshooting

- `needs_connect`: follow `auth.md` for the named module. A `research` grant does not unlock `backlinks`.
- `needs_confirmation`: `research.search_volume` and `backlinks.summary` take `confirmation: always`. Review the action and input, then repeat with `confirm: true` if intended. Other billed research and backlink calls take `confirmation: none` at the bounded worst-case prices stated above.
- `invalid_arguments`: correct the named field; undeclared keys and clickstream flags are refused before transport.
- `vendor_error` 401: the vendor rejected the credential. **Do not reconnect to make the call pass.** An auth-class refusal refreshes provider status during execute, so a grant that had actually lapsed would have come back `needs_connect` rather than this; a `vendor_error` that survives means the grant is still ACTIVE and something else is wrong. `skills/Connection Troubleshooter/` owns the reading. The one case where connecting again is right is a rotation somebody asked for, because regenerating the API password at the vendor invalidates both modules' hosted grants, and that is a rotation rather than a retry.
- `vendor_error` 402, or a task status in the 40201 class: insufficient balance; top up at the vendor.
- `vendor_error` 404 on a task: the endpoint or its parameters.
- A task `status_code` in the 40501 class is invalid field data returned in the envelope, not a gateway error. Read `cost` and the task status from the object.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- Locations (free of charge): https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/
- Platform API: https://docs.dataforseo.com/v3/
