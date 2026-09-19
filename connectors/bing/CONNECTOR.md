---
name: bing
type: connector
category: analytics
description: Reads Bing Webmaster Tools verified sites, search and page performance, crawl diagnostics, URL inspection, feeds, inbound links, and keyword research through one grant
version: 0.1.0
---

# Bing Webmaster Tools

Bing Webmaster Tools reports how Bing sees a verified site. This connector reads the verified site list, search and page performance, crawl diagnostics, URL inspection, feeds, inbound links, and keyword research. It does not submit URLs, submit feeds, or change site settings.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-19; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway, by action id. Enums, required fields, URL shape, and per-report conditionals are checked in the module before catalog execution. Undeclared keys are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `bing.webmaster.list_sites` | none | none |
| `bing.webmaster.search_performance` | `site_url`; `report` in daily_totals, top_queries, top_pages | none |
| `bing.webmaster.query_performance` | `site_url`; `query`; `report` in daily, pages, page_daily; `page_url?`; `start_date?`; `end_date?` | none |
| `bing.webmaster.page_performance` | `site_url`; `page_url`; `report` in summary, queries, children; `page_number?` | none |
| `bing.webmaster.crawl_diagnostics` | `site_url`; `report` in issues, stats | none |
| `bing.webmaster.inspect_url` | `site_url`; `url` | none |
| `bing.webmaster.feeds` | `site_url`; `feed_url?` | none |
| `bing.webmaster.inbound_links` | `site_url`; `target_url?`; `page_number?` | none |
| `bing.webmaster.research_keywords` | `query`; `country`; `language`; `report` in impressions, history, related; `start_date?`; `end_date?` | none |

`query_performance` with `report` `page_daily` or `pages` requires `page_url`. `page_performance` accepts `page_number` only when `report` is `children`. `research_keywords` with `report` `impressions` or `history` requires both dates; `related` refuses them. Dates are `YYYY-MM-DD` and start is not after end. `site_url`, `page_url`, `url`, `target_url`, and `feed_url` are absolute http or https URLs.

A site absent from `list_sites` is a verification task at the vendor, not a connection fault.

## Credentials

This connector holds none. The grant lives with the gateway's provider. Hosted connect collects the API key generated in Bing Webmaster Tools. There is no credential file here and no `secrets:bing` key.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `webmaster` | `write` | `list_sites`, `search_performance`, `query_performance`, `page_performance`, `crawl_diagnostics`, `inspect_url`, `feeds`, `inbound_links`, `research_keywords` |

The vendor issues one key per user that can submit URLs, add and remove sites, and change settings. Excluding those actions from the manifest does not narrow the key, so the grant is recorded as write.

## Excluded

`SUBMIT_URLS` and `SUBMIT_FEED` mutate a property. `GET_SUBMISSION_QUOTAS` and `LIST_CHILD_URLS` are not audit readings. Those four catalog operations are not shipped.

## Destructive Actions

None. This slice only reads. URL submission and feed submission are excluded.

## Troubleshooting

- `needs_connect`: follow `auth.md` for `bing` / `webmaster`.
- `invalid_arguments`: correct the named field using the input table above; unsupported fields and report values are refused.
- `vendor_error`: inspect the sanitized status and endpoint, then check the key, the verified site list, and quota at the vendor. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- Platform API: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
