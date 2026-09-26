---
name: cloudflare
type: connector
category: development
description: Reaches Cloudflare DNS, the account's zones, Pages projects, domains and production deploys, and rulesets, with every removal and every production deploy confirmed
version: 0.5.0
---

# Cloudflare

DNS on a named zone, every zone the token can see, Pages projects, and rulesets. Zone Publisher is the DNS consumer. Listing every domain is `cloudflare.zones.list`, not DNS.

Not for Workers, R2, cache, encryption mode, or mail routing. Those wait on later modules.

## Status

Shipped 2026-09-08. Four modules, each its own grant on toolkit `CLOUDFLARE_API_KEY` (API token, not Global API Key plus email). Verified live: `dns.get_record`, `list_records`, `create_record`, `update_record`, `export_zone` and `batch` all returned; record calls return `{ success, result, errors, messages }`, with `result` an object for one record and an array plus `result_info` for a list, and export returns `{ zone_file }`. Import JSON returned HTTP 400. Multipart via `binary_body` confirmed live. Import and batch return data only, never proxy headers. `pages.list_projects` returned `{ success, result, errors, messages, result_info }` with an empty `result` on every account reached at the time; `get_project` has since run live (below), and `list_deployments` has not been exercised here. `rulesets.create` and `rulesets.get` were not run, and `rulesets.get`'s live envelope is UNVERIFIED. Fake-provider tests cover the rest, including `pages.create_project`, `pages.add_domain`, and `pages.deploy`. Verified live 2026-09-24: `pages.create_project` created a throwaway project and `pages.get_project` read it back with the same name, id, subdomain and production branch, both returning `{ success, result, errors, messages }`. Verified live 2026-09-24 and 2026-09-25: `pages.add_domain` attached `wisermind.ai` and `wisermemory.com`, and `pages.deploy` ran five times across two projects, each returning ok, with `wisermemory.com` serving the uploaded files. That settles the asset route: the upload token rides the proxy as an `Authorization` header parameter on `/pages/assets/check-missing`, `/pages/assets/upload` and `/pages/assets/upsert-hashes`, and Pages accepts the sha256-derived keys. A single file near the 25 MiB limit has not been sent. `pages.remove_domain` and `pages.delete_project` are covered by fake-provider tests; `delete_project` ran live 2026-09-26 on the throwaway project, and `remove_domain` has not run live. See [gateway/SETUP.md](../../gateway/SETUP.md).


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
cloudflare.pages.create_project  { account_id, name, production_branch }     confirmation: always
cloudflare.pages.add_domain      { account_id, project_name, domain }        confirmation: always
cloudflare.pages.remove_domain   { account_id, project_name, domain }        confirmation: always
cloudflare.pages.delete_project  { account_id, project_name }                confirmation: always
cloudflare.pages.deploy          { account_id, project_name, dir }           confirmation: always

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
| `pages` | write | Pages projects, domains, and production deploys of static kit output, and their removal |
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
| `pages.deploy` | Replaces what production serves | A later deploy can replace it; this action does not undo one |
| `pages.create_project` | Creates a Pages project | `pages.delete_project` removes it |
| `pages.add_domain` | Attaches a domain to a project and does not create the DNS record | `pages.remove_domain` detaches it |
| `pages.remove_domain` | Detaches a custom domain; the hostname stops serving the project, and the DNS record stays | Only by adding it again |
| `pages.delete_project` | Deletes the project and every deployment in it | No |

Each is gated `always`. The Pages writes are `always` rather than `once` because the gateway remembers a `once` approval by action id for the life of the process, not by input, so after one approved domain a second, different domain would run unasked.

`pages.delete_project` reads the project first and refuses while any domain other than its own `pages.dev` subdomain (the read's `subdomain`) is attached, another `*.pages.dev` name included, or when the read carries no domain list, so a project serving a real hostname takes two confirmed calls to remove: `remove_domain`, then `delete_project`. That check is best effort: a domain someone attaches between the read and the delete is not caught. `remove_domain` and `delete_project` take a Cloudflare project name and, for `remove_domain`, a dotted hostname, published as patterns, because both values land in a DELETE path where `.` or `..` would address something else. Cloudflare may refuse to delete a project with many deployments.

`pages.add_domain` posts the hostname onto the project. It does not create the DNS CNAME. The domain stays pending until that record exists. The record is Zone Publisher's job, through the `dns` grant.

`pages.deploy` uploads static kit output only. `dir` must be a directory named `dist`, its parent must be named `site`, and that parent must contain a regular file `kit.json`. Neither `site` nor `dist` may be a symbolic link, so the path approved is the path deployed. A tree whose root contains `_worker.js` or a `functions/` directory is refused. Hidden names other than `.well-known`, names shaped like private keys or certificate bundles, `.env` files, `node_modules`, `_routes.json`, and links resolving outside `dir` are skipped and listed in the result's `skipped`; that is a screen for common shapes and nothing more. **The confirmation stop shows the input, not the file list**, so a secret under an ordinary name such as `config.json` passes the screen and is not visible before it publishes; the review that sees the files is Webmaster Job 3 over the payload, before the call, and the returned `manifest` and `skipped` lists report afterwards what was published. Each file is hashed during the walk and read again before the deployment is created, whether or not it needed uploading, as are `_headers` and `_redirects`; a file that changed in between stops the deploy. A directory inside `dist` swapped for a link while the deploy runs is not caught. One file up to 25 MiB travels in an upload request of its own, about 33 MiB of base64, and whether the provider's proxy accepts a request that size is unverified. A 2xx answer whose envelope says `success: false` stops the flow at that step as `vendor_error`. The file hash is `sha256(base64(content) + extension)` hex, first 32 characters, where extension is Node's `extname` including the leading dot. That substitutes for Wrangler's blake3 because Node has no blake3 built-in and a module may not add a dependency. The key is client-chosen.

## Troubleshooting

**`needs_connect` on `zones` while `dns` is ACTIVE** That is the design. Connect `cloudflare` / `zones` as its own turn.

**`vendor_error` 403 on `zones.list`** The token cannot list zones. Make a token with Zone / Zone / Read (or the account-wide list), connect `zones` with that token. Do not paste it into chat.

**`list_records` empty while `export_zone` has a file** Use `export_zone` or `list_records` through this build's proxy path, not an older catalog mapping.

## Reference

- How to connect: `auth.md`
- The gateway: `gateway/AGENTS.md`
- Cloudflare DNS records API: https://developers.cloudflare.com/api/resources/dns/subresources/records/
