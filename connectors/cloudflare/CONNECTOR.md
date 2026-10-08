---
name: cloudflare
type: connector
category: development
description: Reaches Cloudflare DNS, the account's zones, D1 databases, Pages projects, domains, production deploys including Pages Functions, and rulesets, with every removal and every production deploy confirmed
version: 0.6.0
---

# Cloudflare

DNS on a named zone, every zone the token can see, D1 databases, Pages projects, and rulesets. Zone Publisher is the DNS consumer. Listing every domain is `cloudflare.zones.list`, not DNS.

Not for Workers scripts, R2, KV, cache, encryption mode, or mail routing. Those wait on later modules.

## Status

Shipped 2026-09-08. Four modules, each its own grant on toolkit `CLOUDFLARE_API_KEY` (API token, not Global API Key plus email). Verified live: `dns.get_record`, `list_records`, `create_record`, `update_record`, `export_zone` and `batch` all returned; record calls return `{ success, result, errors, messages }`, with `result` an object for one record and an array plus `result_info` for a list, and export returns `{ zone_file }`. Import JSON returned HTTP 400. Multipart via `binary_body` confirmed live. Import and batch return data only, never proxy headers. `pages.list_projects` returned `{ success, result, errors, messages, result_info }` with an empty `result` on every account reached at the time; `get_project` has since run live (below), and `list_deployments` has not been exercised here. `rulesets.create` and `rulesets.get` were not run, and `rulesets.get`'s live envelope is UNVERIFIED. Fake-provider tests cover the rest, including `pages.create_project`, `pages.add_domain`, and `pages.deploy`. Verified live 2026-09-24: `pages.create_project` created a throwaway project and `pages.get_project` read it back with the same name, id, subdomain and production branch, both returning `{ success, result, errors, messages }`. Verified live 2026-09-24 and 2026-09-25: `pages.add_domain` attached `wisermind.ai` and `wisermemory.com`, and `pages.deploy` ran five times across two projects, each returning ok, with `wisermemory.com` serving the uploaded files. That settles the asset route: the upload token rides the proxy as an `Authorization` header parameter on `/pages/assets/check-missing`, `/pages/assets/upload` and `/pages/assets/upsert-hashes`, and Pages accepts the sha256-derived keys. `pages.remove_domain` and `pages.delete_project` are covered by fake-provider tests; `delete_project` ran live 2026-09-26 on the throwaway project, and `remove_domain` has not run live. See [gateway/SETUP.md](../../gateway/SETUP.md). On 2026-10-07 a live deploy whose first upload request carried 4.94 MiB of base64 came back 413 through the provider's proxy, while requests of 2.08 MiB had uploaded and served since 2026-10-03; the proxy's documentation states no request-size limit. Since 0.5.1 each upload request is capped at 3 MiB of serialized body, a file whose upload entry alone exceeds that is refused before any call, and a 413 on the upload reports `reason: request too large` with the batch size. Verified live 2026-10-07 at 0.5.1: a 72-file deploy sent three upload requests of about 2.07, 2.88 and 1.84 MiB, each was accepted, the deployment succeeded, and the site served the uploaded files. The `pages.d1_*` actions, `pages.bind_d1` and `pages.deploy_with_functions` are covered by fake-provider tests. Verified live 2026-10-07 at 0.6.0 on a throwaway Pages project and D1 database: `pages.d1_create_database`, `d1_get_database` and `d1_list_databases` returned `{ success, result, errors, messages }`, the list with `result_info`; `d1_apply_migration` applied a one-table migration as two statements and recorded it in `d1_migrations`, and a second run returned `already_applied` with nothing run; `d1_query` read that record back, and a `SELECT` carrying a second statement was refused before any call; `d1_execute` created a table; `pages.bind_d1` bound the database as `DB` on both environments and then a second name on production alone, and the project read back held both, so the project PATCH merges rather than replaces; `pages.deploy_with_functions` deployed one static page with a Functions bundle from `tools/pages-functions/`, and on the deployment's `pages.dev` address the Function answered POST with 1 and then 2 and GET with 2, the count `d1_query` then read from the database, while the build files and the Function's source were not served. The first bind reported `env_vars` changing from null to empty on both environments, a rewrite of an empty setting that is no longer reported as a collateral change. `pages.delete_project` and `pages.d1_delete_database` then removed the project and the database, each returning `{ success, result, errors, messages }` with a null `result`, and neither appeared in the account's listings afterwards.


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
cloudflare.pages.bind_d1         { account_id, project_name, binding, database_id, environments? }  confirmation: always
cloudflare.pages.deploy_with_functions { account_id, project_name, dir, functions_build }  confirmation: always

cloudflare.pages.d1_list_databases { account_id, name?, page?, per_page? }
cloudflare.pages.d1_get_database { account_id, database_id }
cloudflare.pages.d1_query        { account_id, database_id, sql, params? }
cloudflare.pages.d1_create_database { account_id, name, primary_location_hint? }  confirmation: always
cloudflare.pages.d1_execute      { account_id, database_id, sql, params? }  confirmation: always
cloudflare.pages.d1_apply_migration { account_id, database_id, file }  confirmation: always
cloudflare.pages.d1_delete_database { account_id, database_id }  confirmation: always

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
| `pages` | write | Pages projects, domains, production deploys of static kit output, production deploys with Pages Functions, and the D1 databases a Pages site uses: list, get, create, a read-only query, confirmed writes and migrations, binding, and removal |
| `rulesets` | write | Rulesets |

Workers scripts, R2, KV, cache, encryption mode, and mail routing are later modules, never extra permissions on these four.

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
| `pages.d1_create_database` | Creates a D1 database | `pages.d1_delete_database` removes it |
| `pages.d1_execute` | Runs SQL that can change or delete rows | No |
| `pages.d1_apply_migration` | Runs a local `.sql` file and records it in `d1_migrations` | No. A later file can change the schema; this action does not undo one. A name already recorded does not run again |
| `pages.d1_delete_database` | Deletes the database and the data in it | No |
| `pages.bind_d1` | Sets or overwrites one D1 binding on the named environments | Bind a different database, or remove the binding in the dashboard |
| `pages.deploy_with_functions` | Replaces what production serves, including its Pages Functions | A later deploy can replace it; this action does not undo one |

Each is gated `always`. The Pages writes are `always` rather than `once` because the gateway remembers a `once` approval by action id for the life of the process, not by input, so after one approved domain a second, different domain would run unasked.

`pages.delete_project` reads the project first and refuses while any domain other than its own `pages.dev` subdomain (the read's `subdomain`) is attached, another `*.pages.dev` name included, or when the read carries no domain list, so a project serving a real hostname takes two confirmed calls to remove: `remove_domain`, then `delete_project`. That check is best effort: a domain someone attaches between the read and the delete is not caught. `remove_domain` and `delete_project` take a Cloudflare project name and, for `remove_domain`, a dotted hostname, published as patterns, because both values land in a DELETE path where `.` or `..` would address something else. Cloudflare may refuse to delete a project with many deployments.

`pages.add_domain` posts the hostname onto the project. It does not create the DNS CNAME. The domain stays pending until that record exists. The record is Zone Publisher's job, through the `dns` grant.

`pages.deploy` uploads static kit output only. `dir` must be a directory named `dist`, its parent must be named `site`, and that parent must contain a regular file `kit.json`. Neither `site` nor `dist` may be a symbolic link, so the path approved is the path deployed. A tree whose root contains `_worker.js` or a `functions/` directory is refused. Hidden names other than `.well-known`, names shaped like private keys or certificate bundles, `.env` files, `node_modules`, `_routes.json`, and links resolving outside `dir` are skipped and listed in the result's `skipped`; that is a screen for common shapes and nothing more. **The confirmation stop shows the input, not the file list**, so a secret under an ordinary name such as `config.json` passes the screen and is not visible before it publishes; the review that sees the files is Webmaster Job 3 over the payload, before the call, and the returned `manifest` and `skipped` lists report afterwards what was published. Each file is hashed during the walk and read again before the deployment is created, whether or not it needed uploading, as are `_headers` and `_redirects`; a file that changed in between stops the deploy. A directory inside `dist` swapped for a link while the deploy runs is not caught. Each upload request is capped at 3 MiB of serialized body. A file over roughly 2.25 MiB is refused before anything is sent and goes to Wrangler per `skills/Cloudflare Pages/SETUP.md`. A 2xx answer whose envelope says `success: false` stops the flow at that step as `vendor_error`. The file hash is `sha256(base64(content) + extension)` hex, first 32 characters, where extension is Node's `extname` including the leading dot. That substitutes for Wrangler's blake3 because Node has no blake3 built-in and a module may not add a dependency. The key is client-chosen.

`pages.deploy_with_functions` deploys a static directory that is not a kit site, together with a Pages Functions bundle from `functions_build`. It runs on the local gateway only. Both paths are absolute and in normal form: no `.` or `..` or empty segment, which is refused rather than normalized, and no symbolic link anywhere in the spelling, so pass the real path; on macOS that means `/private/tmp`, not `/tmp`. `dir` is not the home directory, not the credential directory, not the filesystem root, and not a kit payload: a `site/dist`, or any directory whose parent holds `kit.json`, goes through `pages.deploy`, so this action never carries a Function onto a kit site. Its root must not contain `functions`, `_worker.js`, `_worker.bundle`, `functions-filepath-routing-config.json`, `package.json`, or a wrangler config (`wrangler.toml`, `wrangler.json`, `wrangler.jsonc`), in any letter case. Below the root, `_worker.js`, `_worker.bundle` or `functions-filepath-routing-config.json` stops the deploy, and `package.json`, `package-lock.json` or a wrangler config is skipped and listed as `source file`. `functions_build` is a separate absolute directory whose entries are exactly `_worker.bundle`, `_routes.json`, `functions-filepath-routing-config.json` and `build.json`. `build.json`, which `tools/pages-functions/` writes, must be a JSON object whose `assets` is this `dir` and whose `functions` names a functions source outside it; it is returned as provenance and never sent. The bundle is at most 2 MiB and is parsed strictly: each part carries only `Content-Disposition` (form-data, a quoted `name` and an optional quoted `filename` equal to it) and `Content-Type`, each once; part names are unique; the one `metadata` part is JSON naming its `main_module` and carrying no bindings; module parts carry a module content type. **The bundle sent is rebuilt from what was screened**, under the connector's own boundary and headers, so no part two parsers could read differently reaches Cloudflare. `functions-filepath-routing-config.json` must be a JSON object with a `routes` array. Bindings are set on the project with `pages.bind_d1`. The whole deployment request, measured as base64 length, must be at most 3 MiB. A larger one is refused with `bytes` and a Wrangler fallback. The four build files are re-read before the deployment is created, and a change stops the deploy. None of them is an asset or a manifest entry. The same walk screens as `pages.deploy` apply to `dir`, and every skip is listed.

Every `pages.d1_*` action except `d1_apply_migration`, and `pages.bind_d1`, run on the hosted Wiser endpoint and on the local gateway. `pages.d1_apply_migration` and `pages.deploy_with_functions` run on the local gateway only, because each reads a local file. The bundle `deploy_with_functions` sends is built by `tools/pages-functions/`.

The connector neither sets nor changes `fail_open`. `pages.get_project` returns the project, which carries it, and `pages.bind_d1` reports the value it read back for each environment it patched. With `fail_open` on, which is the Pages default, a spent free quota makes requests skip the Function and receive the static files. With it off, those visitors get Cloudflare's 1027 page. An uncaught exception in a Function fails that request either way.

`pages.d1_query` is a read. After leading whitespace, `sql` must open with `SELECT` and a character that is not a letter, digit, underscore or semicolon, and the only semicolon allowed is an optional one as the last non-whitespace character. D1 splits on `;` with no regard for string literals, so `SELECT ';DROP TABLE x'` is refused rather than trusted. The rule is published as the pattern on `sql`, so the gateway refuses a non-matching statement before the module runs. `pages.d1_execute` is the write, and it is confirmed every time. `pages.d1_apply_migration` reads one local `.sql` file of at most 1 MiB (1048576 bytes), creates `d1_migrations` if needed, and skips a basename that is already recorded. A file over that limit goes to Wrangler: `wrangler d1 migrations apply`. A failed statement is reported with `statement_index`. Whether D1 rolls back the earlier statements in that file is not promised. The SQL text is not echoed.

## Troubleshooting

**`needs_connect` on `zones` while `dns` is ACTIVE** That is the design. Connect `cloudflare` / `zones` as its own turn.

**`vendor_error` 403 on `zones.list`** The token cannot list zones. Make a token with Zone / Zone / Read (or the account-wide list), connect `zones` with that token. Do not paste it into chat.

**`list_records` empty while `export_zone` has a file** Use `export_zone` or `list_records` through this build's proxy path, not an older catalog mapping.

**`vendor_error` 413 on `/pages/assets/upload` with `reason: request too large`** An upload request of that size came back 413 through the provider's proxy, and `batch` says how large it was; which hop refused it is not reported. No deployment was created, though files from earlier batches (`batches_sent`) may already be stored. A retry sends requests of about the same size and is likely to meet the same refusal, so report the batch size rather than retrying; Wrangler, per `skills/Cloudflare Pages/SETUP.md`, is the fallback.

**`vendor_error` 403 on a `pages.d1_*` call while other Pages calls work** The D1 actions ride the `pages` grant, so the token connected as `pages` needs Account / D1 / Read, and Account / D1 / Edit for a write, beside its Cloudflare Pages permission. Edit the token at Cloudflare to add it; its value does not change and nothing is reconnected.

**`invalid_arguments` on `sql` from `pages.d1_query`, or `not a single SELECT statement`** `pages.d1_query` accepts one SELECT and nothing else. Use `cloudflare.pages.d1_execute` for a write or for more than one statement. A semicolon inside a string is still a semicolon to D1.

**`bundle carries bindings`** `pages.deploy_with_functions` refuses a bundle whose metadata `bindings` array is not empty. Put the binding on the project with `cloudflare.pages.bind_d1`.

**`binding not applied`** The PATCH answer did not show the binding id that was sent. The result does not say the binding is in place.

**`kit payload: use cloudflare.pages.deploy`** `dir` is a kit site's `site/dist`. Deploy it with `pages.deploy`; a kit site does not carry a Function through this action.

**`build.json assets is not dir`, `functions source overlaps dir`, or `missing build.json`** The Functions build was made for another directory, or from a source inside the one being published, or not by `tools/pages-functions/`. Build again with `--assets` set to this `dir` and `--functions` outside it.

**`path is not in normal form`** The path holds `.`, `..` or an empty segment. Pass the resolved absolute path.

**`migration table not created` or `migration history unreadable`** A statement creating or reading `d1_migrations` failed, so the migration did not run. Nothing was applied.

**`deployment request over the 3 MiB limit`** The deployment multipart, as base64, is over 3 MiB. `bytes` is that length. Deploy with Wrangler: `wrangler pages deploy`.

## Reference

- How to connect: `auth.md`
- The gateway: `gateway/AGENTS.md`
- Cloudflare DNS records API: https://developers.cloudflare.com/api/resources/dns/subresources/records/
