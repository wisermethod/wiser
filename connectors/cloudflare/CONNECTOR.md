---
name: cloudflare
type: connector
category: development
description: Reaches Cloudflare DNS, the account's zones, Pages, and rulesets, with every removal confirmed
version: 0.2.1
---

# Cloudflare

DNS on a named zone, every zone the token can see, Pages projects, and rulesets. Zone Publisher is the DNS consumer. Listing every domain is `cloudflare.zones.list`, not DNS.

Not for Workers, R2, cache, encryption mode, or mail routing. Those wait on later modules.

## Status

Four modules, each its own grant on toolkit `CLOUDFLARE_API_KEY` (API token, not Global API Key plus email). `dns`, `zones`, `pages`, and `rulesets` ACTIVE 2026-09-08. `pages.list_projects` is `{ success, result, errors, messages, result_info }` with an empty `result` on every account the zones grant listed (no Pages projects). `get_project` and `list_deployments` not run. `rulesets.create` not run (confirmation: once). `rulesets.get` live envelope UNVERIFIED. Supplied live evidence from 2026-09-08 confirms `dns.get_record`, `list_records`, `create_record`, `update_record`, `export_zone`, and `batch`. Record calls return `{ success, result, errors, messages }`, with `result` an object for one record and an array plus `result_info` for a list; export returns `{ zone_file }`. Import JSON returned HTTP 400. Multipart via `binary_body` confirmed live the same day. Import and batch now return data only, never proxy headers. Tests run against the fake provider. See [gateway/SETUP.md](../../gateway/SETUP.md).

## Reaching it

Through the gateway, by action id. DNS still takes `zone_id`. Listing domains is `cloudflare.zones.list` and does not invent a zone from the first row.

```
cloudflare.dns.list_records      { zone_id, type?, name? }
cloudflare.dns.get_record        { zone_id, record_id }
cloudflare.dns.export_zone       { zone_id }                                  proxy, BIND text
cloudflare.dns.create_record     { zone_id, type, name, content, ... }        confirmation: once
cloudflare.dns.update_record     { zone_id, record_id, ... }                  confirmation: once
cloudflare.dns.delete_record     { zone_id, record_id }                       confirmation: always
cloudflare.dns.import_zone       { zone_id, zone_file, proxied? }             confirmation: always
cloudflare.dns.batch             { zone_id, deletes?, patches?, puts?, posts? }  confirmation: always

cloudflare.zones.list            { name?, status?, account_id?, page? }
cloudflare.zones.get             { zone_id }
cloudflare.zones.list_accounts   { name?, page? }
cloudflare.zones.create          { name, account_id?, type? }                 confirmation: once
cloudflare.zones.delete          { zone_id }                                  confirmation: always

cloudflare.pages.list_projects   { account_id }
cloudflare.pages.get_project     { account_id, project_name }
cloudflare.pages.list_deployments { account_id, project_name }

cloudflare.rulesets.create       { accounts_or_zones, account_or_zone_id, kind, name, phase }
cloudflare.rulesets.get          { accounts_or_zones, ruleset_id }
cloudflare.rulesets.delete       { accounts_or_zones, account_or_zone_id, ruleset_id }
cloudflare.rulesets.add_rule     { accounts_or_zones, ruleset_id, rule }
cloudflare.rulesets.remove_rule  { accounts_or_zones, account_or_zone_id, ruleset_id, rule_id }
```

## Credentials

This connector holds none. Each module is its own connect. The vendor secret is an API token on the provider's hosted page. A DNS-only token will list nothing on `zones` and 403 on Pages. A token that lists every zone is a different grant, not a wider `dns` row.

## Modules

| Module | Privilege | What it is for |
|--------|-----------|----------------|
| `dns` | write | Records in a named zone |
| `zones` | write | Every zone the token can see, plus accounts |
| `pages` | write | Pages projects and deployments |
| `rulesets` | write | Rulesets |

Workers and R2 are later modules, never extra permissions on these four.

## Destructive Actions

| Action | Effect | Undoable there? |
|--------|--------|-----------------|
| `dns.delete_record` | Removes the record | No |
| `dns.batch` | Mixed deletes and writes | No |
| `dns.import_zone` | Bulk create from BIND | No |
| `zones.delete` | Deletes the zone | No |
| `rulesets.delete` / `remove_rule` | Removes the ruleset or rule | No |

Each is gated `always`.

## Troubleshooting

**`needs_connect` on `zones` while `dns` is ACTIVE** That is the design. Connect `cloudflare` / `zones` as its own turn.

**`vendor_error` 403 on `zones.list`** The token cannot list zones. Make a token with Zone / Zone / Read (or the account-wide list), connect `zones` with that token. Do not paste it into chat.

**`list_records` empty while `export_zone` has a file** Use `export_zone` or `list_records` through this build's proxy path, not an older catalog mapping.

## Reference

- How to connect: `auth.md`
- The gateway: `gateway/AGENTS.md`
- Cloudflare DNS records API: https://developers.cloudflare.com/api/resources/dns/subresources/records/
