---
name: cloudflare
type: connector
category: development
description: Reaches Cloudflare DNS, zones and their settings, the zone's configuration reads, D1 databases, Pages projects, domains and custom-domain status, production deploys of a kit site with its fingerprinted Pages Function, of a site with its Pages Functions, or of a plain static build output, Web Analytics on a Pages project, rulesets, redirect rules and Bulk Redirects, with every removal, setting change, analytics change, redirect write and production deploy confirmed
version: 0.10.3
---

# Cloudflare

DNS on a named zone, every zone the token can see, the settings on a zone, the zone's configuration reads, D1 databases, Pages projects and custom-domain status, Web Analytics sites, redirect rules, Bulk Redirects, rulesets, and signed Worker releases with their static assets, plain variables, custom domains, free addresses, version history, D1 restore points and explicit-version rollback, plus Access applications, reusable policies and staff emails. Zone Publisher is the DNS consumer. Listing every domain is `cloudflare.zones.list`, not DNS.

Not for arbitrary Worker code, Worker scheduled triggers, R2, KV, cache purging, or mail routing, and not for writes to Workers routes, certificates, Page Rules, or non-redirect phases. The SSL mode is one of the seven settings `zones.update_setting` changes.

## Status

Shipped 2026-09-08. Six modules on one toolkit, `CLOUDFLARE_API_KEY` (API token, not Global API Key plus email). Verified live 2026-10-19 through the Wiser endpoint: one account-owned, read-only token connected on `zones` bound `dns`, `pages` and `rulesets` to the same credential with no connect of their own; `dns.list_records`, `pages.list_projects` and `zones.list` answered, and `rulesets.list` reached Cloudflare and answered 403 for a permission that token did not hold; and an edit adding Access Read at Cloudflare served `zones.list_access_apps` with no reconnect. Verified live: `dns.get_record`, `list_records`, `create_record`, `update_record`, `export_zone` and `batch` all returned; record calls return `{ success, result, errors, messages }`, with `result` an object for one record and an array plus `result_info` for a list, and export returns `{ zone_file }`. Import JSON returned HTTP 400. Multipart via `binary_body` confirmed live. Import and batch return data only, never proxy headers. `pages.list_projects` returned `{ success, result, errors, messages, result_info }` with an empty `result` on every account reached at the time; `get_project` has since run live (below), and `list_deployments` has not been exercised here. `rulesets.create` and `rulesets.get` were not run, and `rulesets.get`'s live envelope is UNVERIFIED. Fake-provider tests cover the rest, including `pages.create_project`, `pages.add_domain`, and `pages.deploy`. Verified live 2026-09-24: `pages.create_project` created a throwaway project and `pages.get_project` read it back with the same name, id, subdomain and production branch, both returning `{ success, result, errors, messages }`. Verified live 2026-09-24 and 2026-09-25: `pages.add_domain` attached `wisermind.ai` and `wisermemory.com`, and `pages.deploy` ran five times across two projects, each returning ok, with `wisermemory.com` serving the uploaded files. That settles the asset route: the upload token rides the proxy as an `Authorization` header parameter on `/pages/assets/check-missing`, `/pages/assets/upload` and `/pages/assets/upsert-hashes`, and Pages accepts the sha256-derived keys. `pages.remove_domain` and `pages.delete_project` are covered by fake-provider tests; `delete_project` ran live 2026-09-26 on the throwaway project, and `remove_domain` has not run live. See [gateway/SETUP.md](../../gateway/SETUP.md). On 2026-10-07 a live deploy whose first upload request carried 4.94 MiB of base64 came back 413 through the provider's proxy, while requests of 2.08 MiB had uploaded and served since 2026-10-03; the proxy's documentation states no request-size limit. Since 0.5.1 each upload request is capped at 3 MiB of serialized body, a file whose upload entry alone exceeds that is refused before any call, and a 413 on the upload reports `reason: request too large` with the batch size. Verified live 2026-10-07 at 0.5.1: a 72-file deploy sent three upload requests of about 2.07, 2.88 and 1.84 MiB, each was accepted, the deployment succeeded, and the site served the uploaded files. The `pages.d1_*` actions, `pages.bind_d1` and `pages.deploy_with_functions` are covered by fake-provider tests. Verified live 2026-10-07 at 0.6.0 on a throwaway Pages project and D1 database: `pages.d1_create_database`, `d1_get_database` and `d1_list_databases` returned `{ success, result, errors, messages }`, the list with `result_info`; `d1_apply_migration` applied a one-table migration as two statements and recorded it in `d1_migrations`, and a second run returned `already_applied` with nothing run; `d1_query` read that record back, and a `SELECT` carrying a second statement was refused before any call; `d1_execute` created a table; `pages.bind_d1` bound the database as `DB` on both environments and then a second name on production alone, and the project read back held both, so the project PATCH merges rather than replaces; `pages.deploy_with_functions` deployed one static page with a Functions bundle from `tools/pages-functions/`, and on the deployment's `pages.dev` address the Function answered POST with 1 and then 2 and GET with 2, the count `d1_query` then read from the database, while the build files and the Function's source were not served. The first bind reported `env_vars` changing from null to empty on both environments, a rewrite of an empty setting that is no longer reported as a collateral change. `pages.delete_project` and `pages.d1_delete_database` then removed the project and the database, each returning `{ success, result, errors, messages }` with a null `result`, and neither appeared in the account's listings afterwards. The kit Function carried by `pages.deploy` from `site/dist-function/` (0.7.0) is covered by fake-provider tests. Verified live 2026-10-08 at 0.7.0 (`wiser` `e250120`) on a throwaway Pages project, `wiser-kitfn-livetest-20261008`, holding a kit site with one article due about 17 minutes after the deploy and one a month out: `pages.create_project` returned the project with `fail_open` true on production and preview; `pages.deploy` uploaded 39 files, skipped none, and returned `function` naming kit 0.5.0, the listed fingerprint, a 20,862-byte schedule, 23 route rules and both instants carried, and Pages accepted the deployment's Worker bundle with its binary module. Before the due instant, every surface on the production and deployment addresses showed the build-time view: both scheduled routes and their `.html` and trailing-slash spellings answered 404, and neither article was on the listing page, a tag page, a related list, RSS, the sitemap, `llms.txt` or the search index; `_worker.js`, `schedule.bin`, `function.json`, `_routes.json` and the `.astro` records answered 404 at every spelling tried. Eight seconds after the instant, with no rebuild and no redeploy, the due article answered 200, its two spellings answered 308 to it, and it was on the listing page, both tag pages, the related lists of both older articles, RSS, the sitemap and `llms.txt`, and not in the search index, by design; the month-out article stayed hidden. The live RSS response carried the ETag of the version `schedule.bin` holds, answered 304 to it and 200 to another; HEAD answered 200 and POST 405. Cloudflare sends no ETag on HTML, from the Function or from the static files alike. `pages.delete_project` then removed the project on the operator's go, returning `{ success, result, errors, messages }` with a null `result`, and the account's listing no longer held it.

On 2026-10-09 the new reads ran live at `4128c59`, 21 provider calls across two runs (20, then 1), and no write ran. `zones.get_settings` returned 56 settings. `zones.get_setting` returned `ssl` as `full` and `security_header` with HSTS off. `zones.list_workers_routes` and `rulesets.list_page_rules` returned empty lists. `pages.list_domains` returned `effectivesc.org` at status `pending`, verification `CNAME record not set`, validation `pending` by http, and `pages.get_domain` on that name returned the same. `pages.get_domain` on the project's own `effectivesc.pages.dev` name returned `vendor_error` 404: that name is not a custom domain. `vercel.projects.list_domains` returned three domains: `www.effectivesc.org` redirecting to the apex with status 308, the apex, and `effectivesc-zeta.vercel.app`. These answered 403: `zones.get_bot_management`, `zones.list_certificate_packs`, `zones.list_access_apps`, `rulesets.list` on the zone and on the account, `rulesets.get_phase_entrypoint` for `http_request_dynamic_redirect`, `http_config_settings` and `http_request_transform` on the zone and for `http_request_redirect` on the account, and `rulesets.list_lists`, `rulesets.list_list_items` and `rulesets.get_bulk_operation`. After the token connected for these modules was edited at Cloudflare to add the permissions `auth.md` now names, with no reconnect, the same reads ran again at `4128c59` and each one that had answered 403 returned, except `zones.list_access_apps`: Cloudflare answers that one 403 with code 9999, Access is not enabled on the account, which the gateway cannot tell from a missing permission (Troubleshooting). That run read the zone's `http_request_dynamic_redirect` entrypoint with one rule, no entrypoint in the other eight phases, no account `http_request_redirect` entrypoint and no lists. Verified live the same day on throwaway targets (a pending zone that serves no traffic, a throwaway list, Pages project and Vercel project), each restored or removed and read back: `zones.update_setting` changed and restored all five settings, `applied` true each time; `rulesets.put_phase_entrypoint` created an absent entrypoint with the PUT itself, on a zone and on the account, so the POST fallback did not run; `expected_version` null over an existing entrypoint, and a wrong version, were refused after the read and before any write; `add_rule` with `position`, `update_rule`, `reorder_rule` (which kept the rule's definition), a replace-all PUT with the matching version, and `remove_rule` each read back as intended; `rulesets.delete`, moved to the proxy after its catalog tool answered 400, removed both test entrypoints and answers with an empty body, reported as success (`4cf3c6e`); `create_list`, `add_list_items` (whose array body read back intact), `get_bulk_operation` (completed), `remove_list_items` and `delete_list`; `pages.add_domain`, `list_domains`, `get_domain`, `retry_domain_validation` and `remove_domain`, where `get_project` right after `add_domain` did not yet list the new name; and `vercel.projects.list_domains` and `remove_domain`. A read seconds after a write answered 503 or 504 three times (a list's items, and a new Pages domain twice) and succeeded when read again.

On 2026-10-09, after those live runs, the following changes were made and are not live-verified. The `expected_version` check on `put_phase_entrypoint` is best effort: it compares against a read taken just before the PUT, a write by anyone else in between is overwritten, and the guard does not make the replace atomic. `add_rule`, `update_rule`, `reorder_rule`, `remove_rule` and `delete` each read the ruleset before they write and refuse a phase other than the redirect phase for that scope, and `delete` also refuses a ruleset whose `rules` are not empty or absent. That read, and the narrower `delete`, change what the live rule writes and the live `delete` verified. `add_list_items` and `remove_list_items` keep `operation_id` when the one status read throws or returns `success: false`, which changes only a failure path. `get_phase_entrypoint` accepts every phase in its manifest enum, which widens the reads. `add_rule`, `update_rule` and `put_phase_entrypoint` refuse a rule object that carries `position`, which adds a refusal. `list_access_apps` keeps an application whose destination has no `uri` and returns those ids in `unresolved`. The Vercel `id_or_name` change, in that connector, refuses a leading dot, which adds a refusal on top of the live `remove_domain`. Then, after a second review: `put_phase_entrypoint`'s `expected_version` became a string, `none` where it had been null, and `update_setting` takes HSTS as its own `strict_transport_security` field instead of an object in `value`, because the gateway refuses at its confirmation stop a field with no single declared type, so neither write could run through the gateway; the live runs had called the module directly and could not show it. A gateway test now drives both through the confirmation stop and checks that every field of every confirmed action declares one type. `list_access_apps` matches partial and multi-label wildcards. These change the input shapes the live writes used. They were then verified live at `9c0fb6e`, through the gateway's own `execute` with its default policy, disclosure and confirmation, over the provider's real adapter, on the same kind of throwaway targets: every Cloudflare write this release adds or moves, `update_setting` on `ssl` and on HSTS through `strict_transport_security`, `put_phase_entrypoint` with `expected_version` `none` on a zone and on an account, `add_rule`, `update_rule`, `reorder_rule`, `remove_rule`, `delete`, `create_list`, `add_list_items`, `remove_list_items`, `delete_list`, `pages.retry_domain_validation`, and with them `pages.create_project`, `add_domain`, `remove_domain` and `delete_project`, each stopped with its whole input shown, ran once confirmed, and was undone and read back. `vercel.projects.remove_domain` ran live on the module path only; its fields are plain strings, which the gateway test checks for every confirmed action. Later on 2026-10-09 (0.8.1) the gateway began passing a refused answer's numeric error codes as `provider_codes`, and `list_access_apps` reads Cloudflare's code 9999 as `access_enabled: false`. Verified live at `0ab978c` through the gateway's own `execute`: on this account, where Access was never enabled, `list_access_apps` answered `access_enabled: false`, with and without a hostname, and a read of a zone the token cannot see stayed `vendor_error` 403 carrying Cloudflare's code as `provider_codes: [9109]`. Both ran again with the same answers at `f6abe78`, after two review rounds made the reading stricter: 9999 must be the only code, on the first page, before any application was read.

At 0.9.0, the four new `pages` actions are covered by fake-provider tests. Verified live 2026-10-10 at `62dad05`, through the gateway's own `execute` with its confirmation stop, on throwaway Pages projects created and deleted for the run: `pages.deploy_static` deployed a two-file static folder, `list_deployments` read the deployment back active, and both pages served 200; a second deploy of the same folder uploaded nothing and reported both files `already_present`. It refused, after the stop and before any call, a kit `site/dist` (`kit payload`), a folder holding `_worker.js` (`server code`), and folders holding `AGENTS.md`, `CLAUDE.md`, `.git`, `memory/`, `.env` and `zArchive`, each as `working folder:`. A folder holding one 170 KB `index.html`, four levels below a declared root, passed every screen in a run that sent nothing. `pages.list_web_analytics_sites` answered 403 with Cloudflare code 10000 until the token carried Account / Account Settings, then listed every site with no token or snippet; zone sites read `host` null and carry `zone_name`. `pages.enable_web_analytics` with no `site_tag` created a site for the project's `pages.dev` host (`auto_install` false), and Cloudflare's PATCH answer carried the tag and the token sent; `get_project` then read the tag and `[redacted]` for the token. The deployment made before the switch served no beacon and never did; the next `deploy_static` deployment served the beacon on every page at once, while the project's own address showed a mix of the two for a short while after that deploy. A second project attached that site by `site_tag` (`attached`), and its pages served a beacon with the same token; a second call answered `already_on` with nothing written, and naming another site was refused before any write. `delete_web_analytics_site` refused while either project named the site, listing both. **Deleting a Pages project with Web Analytics on deleted the Web Analytics site it sent to**: the site was gone after the project that had only attached it was deleted, while the project that created it still named it. So `delete_web_analytics_site`'s success path has not run live, since every site these actions create is deleted with a project; it is covered by fake-provider tests. Attaching a zone's own site, one with automatic setup, was not run live.

At 0.10.0, `zones.update_setting` also changes `email_obfuscation` and `browser_cache_ttl`, covered by fake-provider tests and driven through the gateway's confirmation stop in the gateway's own tests. Verified live 2026-10-12 at `4cd8d9c`, through the gateway's own `execute` with its default policy and confirmation stop, on a throwaway zone that was pending and served no traffic: `browser_cache_ttl` went from 14400 to 0, to 7 and to 31536000, each `applied` true and read back as sent, then back to 14400, and the stop showed the seconds as an integer. -1, 31536001, 3600.5 and `"3600"` were refused before the stop, and `value` given beside `browser_cache_ttl` was refused by the module after it, each with no call to Cloudflare. After review the manifest's `oneOf` also declares, in each setting's branch, the value fields that setting does not take as forbidden. Verified live again at `036ab4c` the same way on the same zone: `email_obfuscation` went from `on` to `off` and back, `browser_cache_ttl` from 14400 to 0 and 86400 and back, `always_use_https` from `off` to `on` and back, each `applied` true and read back as sent; a call naming `email_obfuscation` with `browser_cache_ttl` beside `value` reached the stop and was refused by the module with no call to Cloudflare, since the gateway's own check does not read `oneOf`.

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
cloudflare.zones.get_settings    { zone_id }                                  confirmation: none
cloudflare.zones.get_setting     { zone_id, setting_id }                      confirmation: none
cloudflare.zones.update_setting  { zone_id, setting_id, value | strict_transport_security | browser_cache_ttl }  confirmation: always
cloudflare.zones.get_bot_management { zone_id }                               confirmation: none
cloudflare.zones.list_certificate_packs { zone_id }                           confirmation: none
cloudflare.zones.list_workers_routes { zone_id }                              confirmation: none
cloudflare.zones.list_access_apps { account_id, hostname? }                   confirmation: none

cloudflare.access.create_app       { account_id, hostname, name, policy_ids }     confirmation: always
cloudflare.access.create_policy    { account_id, name, decision, emails? , service_token_id? } confirmation: always
cloudflare.access.set_staff        { account_id, policy_id, add? , remove? }      confirmation: always
cloudflare.access.get_app          { account_id, app_id }                         confirmation: none

cloudflare.workers.workers_subdomain { account_id }                            confirmation: none
cloudflare.workers.get_worker      { account_id, script_name }                  confirmation: none
cloudflare.workers.deploy_worker_release { account_id, script_name, app, version, database_id, vars } confirmation: always
cloudflare.workers.delete_worker   { account_id, script_name }                  confirmation: always
cloudflare.workers.set_vars      { account_id, script_name, app, version, vars } confirmation: always
cloudflare.workers.add_custom_domain { account_id, script_name, zone_id, hostname } confirmation: always
cloudflare.workers.remove_custom_domain { account_id, script_name, hostname }    confirmation: always
cloudflare.workers.set_workers_dev { account_id, script_name, enabled, previews_enabled } confirmation: always
cloudflare.workers.list_versions { account_id, script_name }                    confirmation: none
cloudflare.workers.d1_migrate   { account_id, database_id, app, version }        confirmation: always
cloudflare.workers.d1_adopt     { account_id, database_id, app, version }        confirmation: always
cloudflare.workers.d1_bookmark  { account_id, database_id }                      confirmation: none
cloudflare.workers.d1_restore   { account_id, database_id, bookmark, bookmark_time, window_days } confirmation: always
cloudflare.workers.rollback     { account_id, script_name, version_id }          confirmation: always
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
cloudflare.pages.deploy_static   { account_id, project_name, dir }           confirmation: always
cloudflare.pages.list_web_analytics_sites { account_id }                     confirmation: none
cloudflare.pages.enable_web_analytics { account_id, project_name, site_tag? } confirmation: always
cloudflare.pages.delete_web_analytics_site { account_id, site_tag }          confirmation: always

cloudflare.pages.d1_list_databases { account_id, name?, page?, per_page? }
cloudflare.pages.d1_get_database { account_id, database_id }
cloudflare.pages.d1_query        { account_id, database_id, sql, params? }
cloudflare.pages.d1_create_database { account_id, name, primary_location_hint? }  confirmation: always
cloudflare.pages.d1_execute      { account_id, database_id, sql, params? }  confirmation: always
cloudflare.pages.d1_apply_migration { account_id, database_id, file }  confirmation: always
cloudflare.pages.d1_delete_database { account_id, database_id }  confirmation: always
cloudflare.pages.list_domains    { account_id, project_name }                 confirmation: none
cloudflare.pages.get_domain      { account_id, project_name, domain }         confirmation: none
cloudflare.pages.retry_domain_validation { account_id, project_name, domain } confirmation: always

cloudflare.rulesets.create       { accounts_or_zones, account_or_zone_id, kind, name, phase }
cloudflare.rulesets.get          { accounts_or_zones, ruleset_id }
cloudflare.rulesets.delete       { accounts_or_zones, account_or_zone_id, ruleset_id }  confirmation: always, proxy
cloudflare.rulesets.list         { accounts_or_zones, account_or_zone_id }     confirmation: none
cloudflare.rulesets.get_phase_entrypoint { accounts_or_zones, account_or_zone_id, phase }  confirmation: none
cloudflare.rulesets.list_page_rules { zone_id }                                confirmation: none
cloudflare.rulesets.list_lists   { account_id }                                confirmation: none
cloudflare.rulesets.list_list_items { account_id, list_id }                    confirmation: none
cloudflare.rulesets.get_bulk_operation { account_id, operation_id }            confirmation: none
cloudflare.rulesets.put_phase_entrypoint { accounts_or_zones, account_or_zone_id, phase, rules, expected_version, description? }  confirmation: always
cloudflare.rulesets.add_rule     { accounts_or_zones, ruleset_id, rule, zone_id | account_id, position? }  confirmation: always, proxy
cloudflare.rulesets.update_rule  { accounts_or_zones, account_or_zone_id, ruleset_id, rule_id, rule }  confirmation: always
cloudflare.rulesets.reorder_rule { accounts_or_zones, account_or_zone_id, ruleset_id, rule_id, position }  confirmation: always
cloudflare.rulesets.remove_rule  { accounts_or_zones, account_or_zone_id, ruleset_id, rule_id }  confirmation: always, proxy
cloudflare.rulesets.create_list  { account_id, name, description? }            confirmation: always
cloudflare.rulesets.add_list_items { account_id, list_id, items }              confirmation: always
cloudflare.rulesets.remove_list_items { account_id, list_id, item_ids }        confirmation: always
cloudflare.rulesets.delete_list  { account_id, list_id }                       confirmation: always
```

`pages.deploy` takes the same input as before. When `site/dist-function/` exists beside `dir`, that deploy also carries the kit's Function; the action's input does not change.

The zone settings, the zone configuration reads, the Pages domain actions, `rulesets.delete`, and the ruleset actions below it run on the proxy. `rulesets.create` and `rulesets.get` stay on the catalog. `add_rule` and `remove_rule` run on the proxy, and `add_rule` is `confirmation: always`.

### How settings, redirects and lists behave

`zones.update_setting` changes one of `ssl`, `always_use_https`, `security_header`, `min_tls_version`, `automatic_https_rewrites`, `email_obfuscation` and `browser_cache_ttl`. Any other `setting_id` is `invalid_arguments`. `ssl` is `off`, `flexible`, `full` or `strict`. `always_use_https`, `automatic_https_rewrites` and `email_obfuscation` are `on` or `off`. `min_tls_version` is `1.0`, `1.1`, `1.2` or `1.3`. Those five take `value`, a string. `security_header` (HSTS) takes `strict_transport_security` instead, an object whose only keys are `enabled`, `max_age`, `include_subdomains`, `preload` and `nosniff`; `enabled`, `include_subdomains`, `preload` and `nosniff` are booleans and `max_age` is an integer from 0 to 31536000, and it is sent to Cloudflare as `{ value: { strict_transport_security } }`. `browser_cache_ttl` takes `browser_cache_ttl` instead, an integer number of seconds from 0 to 31536000, which is the range Cloudflare's API schema documents for the setting, with no list of durations; 0 means Respect Existing Headers, and it is sent as `{ value: <seconds> }`. A value that belongs to a different setting is refused on `value`; giving more than one of the three fields, or a field the setting does not take, is refused on the extra field, and a missing one on the field that is missing. Three typed fields rather than one `value` of any type, because the gateway withholds at its confirmation stop any field without one declared type, and such a call never runs. The stop also withholds a `browser_cache_ttl` outside 0 to 31536000, and the module refuses one too. The action reads the setting, PATCHes it, and reads it again. A failed first read does not PATCH. A refused PATCH returns `vendor_error`. On success the result carries `setting_id`, `before` (the value read first), `after` (the value read second) and `applied`. `applied` is whether `after` deep-equals the value sent, for `browser_cache_ttl` the number of seconds; for `security_header` it compares `after.strict_transport_security` to the `strict_transport_security` value that was sent. When the PATCH is accepted and the second read throws, or comes back with `success: false`, or is not an envelope, `success` stays true, `after` and `applied` are null, and `reason` is `read after write failed`.

`rulesets.get_phase_entrypoint` reads any phase in its manifest enum: `ddos_l4`, `ddos_l7`, `http_config_settings`, `http_custom_errors`, `http_log_custom_fields`, `http_ratelimit`, `http_request_cache_settings`, `http_request_dynamic_redirect`, `http_request_firewall_custom`, `http_request_firewall_managed`, `http_request_late_transform`, `http_request_origin`, `http_request_redirect`, `http_request_sanitize`, `http_request_sbfm`, `http_request_transform`, `http_response_cache_settings`, `http_response_compression`, `http_response_firewall_managed`, `http_response_headers_transform`, `magic_transit`, `magic_transit_ids_managed`, `magic_transit_managed` and `magic_transit_ratelimit`. Any other phase is `invalid_arguments`. It returns `exists: false`, with `success: true`, `result: null`, and the phase, scope and id it asked about, when that read is a 404. A 403, or any other error, is not turned into that answer. An entrypoint that exists comes back as the vendor envelope plus `exists: true`. Writing stays on `put_phase_entrypoint`, which accepts only the two redirect phases.

`rulesets.put_phase_entrypoint` accepts only `http_request_dynamic_redirect` on a zone and `http_request_redirect` on an account. `rules` is from 1 to 100 rules, and every `action` must be `redirect`. It reads the entrypoint first. `expected_version` is a string: `none` is accepted only when no entrypoint exists, and otherwise it is the version just read, digits only. `none` when one exists is refused as `invalid_arguments` on `expected_version`, `reason: entrypoint exists`, with `current_version` and `rule_count`. A version that is not the one just read, including a version when none exists, is `reason: version mismatch` and `current_version`, which is null when none exists. `current_version` is also null when an entrypoint exists and carries no version, and then no `expected_version` matches, so the call is refused. A missing `expected_version`, or one that is neither `none` nor digits, is `invalid_arguments` on that field and carries no `reason`. It is a string rather than a nullable value because the gateway withholds at its confirmation stop any field without one declared type. The PUT body is `{ rules }`, plus `description` when one was given, so the array replaces every rule in the phase. The `expected_version` check is best effort. It compares `expected_version` against a read taken just before the PUT. A write by anyone else in between is overwritten. The guard does not make the replace atomic. A rule object that has a `position` key is `invalid_arguments` on `rules`, and no call is made. When the PUT answers 404 and the read found no entrypoint, the action POSTs `/{accounts|zones}/{id}/rulesets` with `name` `default`, `kind` `zone` on a zone and `kind` `root` on an account, the phase, the same rules, and `description` when one was given. A successful PUT reports `created_with: put`. A successful POST reports `created_with: post`. Any other failure returns `vendor_error` and carries no `created_with`. Cloudflare's PUT created an absent entrypoint in both live runs on 2026-10-09, so the POST branch is a fallback that has not been needed.

`rulesets.delete` runs on the proxy and removes a redirect entrypoint left empty, nothing more. `accounts_or_zones` is `zones` or `accounts`. `account_or_zone_id` is 32 hex characters. `ruleset_id` is 1 to 64 letters, digits, underscores or hyphens. A value outside that is `invalid_arguments` and no call is made. Before the DELETE it reads `/{scope}/{id}/rulesets/{ruleset_id}`. The phase must be `http_request_dynamic_redirect` on a zone or `http_request_redirect` on an account. Any other phase is `invalid_arguments` on `ruleset_id`, `reason: not a redirect ruleset`, and the result carries the phase that was read. `rules` must be absent, null, or an empty array. A ruleset that still has rules is `invalid_arguments` on `ruleset_id`, `reason: ruleset not empty`, with `rule_count`. That check is best effort, like the version check: it uses the read taken just before the DELETE, Cloudflare's DELETE carries no precondition, and a rule someone else adds in between is deleted with the ruleset. Run it right after removing the last rule yourself. A read that throws propagates, and nothing is deleted. A read that returns `success: false`, or no ruleset object, is `vendor_error`, and nothing is deleted. The DELETE has no body. An empty answer, or any answer that is not an object whose `success` is `false`, comes back `{ success: true, errors: [], messages: [], result: null, deleted }`, and `deleted` is the ruleset id. An answer whose `success` is `false` is `vendor_error`. A refusal from the proxy is thrown.

`add_rule`, `update_rule` and `put_phase_entrypoint` accept only `action: redirect`. A different action is `invalid_arguments` on `rule`, or on `rules` for the entrypoint. A rule object that has its own `position` key is the same refusal, on `rule` or on `rules`. `add_rule` still takes `position` as its own field and sends that with the rule. `update_rule` sends the rule. Moving a rule is `reorder_rule`, which sends `{ position }` only, so it sends no action. `position`, where an action takes one, is an object with exactly one of `before`, `after` or `index`. `before` and `after` are strings and may be empty. `index` is an integer of 1 or more. On `add_rule`, `zones` requires `zone_id` and refuses `account_id` (the `reason` is `zones`); `accounts` requires `account_id` and refuses `zone_id` (the `reason` is `accounts`). Before `add_rule`, `update_rule`, `reorder_rule` and `remove_rule` send anything, each reads the ruleset. The phase must be `http_request_dynamic_redirect` on a zone or `http_request_redirect` on an account. Any other phase is `invalid_arguments` on `ruleset_id`, `reason: not a redirect ruleset`, and the result carries the phase that was read. `update_rule`, `reorder_rule` and `remove_rule` also refuse when `rule_id` is not one of `rules[].id`: `invalid_arguments` on `rule_id`, `reason: rule not in ruleset`. A read that throws propagates, and nothing is written. A read that returns `success: false`, or no ruleset object, is `vendor_error`, and nothing is written.

`rulesets.add_list_items` and `rulesets.remove_list_items` return `operation_id` and `operation`, which is one read of that bulk operation. `operation` is null when that read is a successful envelope with no result. Once the write has returned an `operation_id`, a status read that throws does not throw out of the action: the result is `{ success: true, operation_id, operation: null, operation_read }`, and `operation_read` is `{ status: 'vendor_error', http_status }`. `http_status` is copied from the thrown signal when that signal is a `vendor_error`, and is null for any other throw. A status read that returns `success: false` gives the same shape with `http_status` null. A `vendor_error` from the write itself is returned as that error, and so is a write that comes back with no `operation_id`. Then there is no `operation_id` in the result. Neither call waits until the operation finishes. `rulesets.get_bulk_operation` is the poll, and it returns the vendor envelope. Poll that operation rather than repeating the write. An item is exactly `{ redirect: { source_url, target_url } }`, with optional `status_code` of 301, 302, 307 or 308 and optional booleans `preserve_query_string`, `include_subdomains`, `subpath_matching` and `preserve_path_suffix`. From 1 to 1000 items, posted as the array. `remove_list_items` sends a DELETE whose body is `{ items: [{ id }] }`, for 1 to 1000 ids. `create_list` always sends `kind: redirect`.

`zones.list_access_apps` reads every page of the account's applications, 1000 at a time, while `result_info.total_pages` says another page remains, and stops after the first page when `total_pages` is absent. It filters after the read. `hostname` is not sent to Cloudflare. The host it compares is the text before the first slash, lowercased, with trailing dots removed, taken from `domain`, from each `self_hosted_domains` entry, and from each destination `uri`. An exact host matches. A wildcard is matched generously, so that nothing that might apply is filtered out: each `*` matches any run of characters, dots included, which covers a partial wildcard such as `*test.example.com` and more than one wildcard label, and `*.suffix` also matches `suffix` itself. `filtered_by` is the hostname that was asked for, or null when none was. When a hostname is set, an application is also kept when any `destinations` entry has no `uri`, a `worker` or `all_workers` destination for example, because whether it applies cannot be decided from the application. The ids kept for that reason are returned in `unresolved`. An application that matches a host field is returned in `result` and is left out of `unresolved`, including when it also has a destination with no `uri`. `unresolved` is an empty array when no hostname was given and when every kept application matched a host. The returned `result_info` describes that filtered list as one page, not Cloudflare's own pages. It answers `access_enabled: true` with what it read. When Cloudflare refuses the first page with HTTP 403 and 9999 as its only error code, which it sends when Access has never been enabled on the account, the answer is `{ success: true, access_enabled: false, result: [], unresolved: [] }`, with `filtered_by` and a one-page `result_info`: a reading that no Access application exists, so none applies to any hostname. The gateway passes that code as `provider_codes` on the `vendor_error` and nothing else from Cloudflare's body. Any other refusal stays a `vendor_error`: a 403 without code 9999, a 403 that mixes 9999 with another code, and a refusal after a page was already read, which would contradict the applications read.

`rulesets.list` and `rulesets.list_list_items` follow `result_info.cursors.after`, 50 to a page, until the cursor is absent, empty, or one already seen, and return every row in one envelope. `result_info.count` and `total_count` are the number of rows returned.

`pages.retry_domain_validation` is a PATCH with no body. `pages.get_domain` on the project's own `pages.dev` name comes back `vendor_error` with HTTP 404, because that name is not a custom domain. `pages.list_domains` returns the custom ones.

### Worker releases

The `workers` module ships fourteen actions. `workers_subdomain` reads the account's
free address without creating it. `get_worker` reads the active deployment's
version and binding names and types, retaining only D1's database id. Its singular
`version_id` names a version only when it is the single version at 100 percent.
A split deployment returns `versions`, a null singular `version_id` and a reason;
a caller records no rollback target and stops the upgrade. A sole version below
100 percent also returns null. Read and record this id before the upgrade's first
write, including `set_vars`, which publishes a settings version. `list_versions`
is history, not this read. `delete_worker`
confirms deletion by reading back, reporting `success: false` if still present.
A missing Worker is an absent result. Deploying and deleting require confirmation.
Reads need Account / Workers Scripts / Read; deploy and delete need Edit, the API's
Workers Scripts Write permission. The connected token carries these permissions
on the selected account, through toolkit `CLOUDFLARE_API_KEY`.

`deploy_worker_release` admits only apps and Ed25519 public keys pinned in the
connector's `release.json`, under a base whose host is in `workers.release_hosts`.
No input is an address. It verifies the signature over the exact manifest bytes
before checking format 2's exact field set and order, source commits and F1 limit,
the three PASS checks, Worker module types, assets and migrations. Unknown fields,
unsafe paths, a format other than 2 and `run_worker_first` other than true are
refused. Each module's MIME type must match its emitted extension: `.js` and `.mjs`
are ES modules, `.cjs` is JavaScript, `.wasm` is WebAssembly, `.txt` and `.html`
are plain text, and `.bin` is octet-stream. The migration table is an SQL identifier;
numbered SQL files are fetched, size-checked and SHA-256-checked with all other
files. This deploy does not apply migrations or write their history.

`vars` is required, an object of strings of at most 512 Unicode characters each.
Names match `^[A-Z][A-Z0-9_]{0,63}$`; names containing a segment `SECRET`, `TOKEN`,
`PASSWORD`, `PASSWD`, `KEY`, `CREDENTIAL`, `CREDENTIALS` or `AUTHORIZATION` are refused.
The object's own shape is checked before any release fetch. After signature and
manifest shape verification its keys must exactly match `worker.vars_required`,
with no missing or extra name, before any content file is fetched or any Cloudflare
call runs. Required names must be distinct and cannot collide with the D1 or assets
binding names. No action accepts a client secret or creates a service token.
Each variable is uploaded in `metadata.bindings` as `{ name, text, type: "plain_text" }`,
the [PlainText binding in Cloudflare's script-upload reference](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/).
A confirmation shows the values supplied by the call; deploy results and diagnostic
refusals carry neither variable binding values nor upload or completion tokens. The
address is built from the caller's script name and the account's validated subdomain
and is reported whenever the subdomain exists, including coincidental variable matches.

The release allows 50 modules, 20,000 assets, 25 MiB per file and 64 MiB total,
including migrations. Every file's size and SHA-256 and every request's size are
checked before the first upload. Script and asset multipart bodies each fit 3 MiB
after the proxy's base64 encoding; asset contents are base64 encoded inside multipart
as well. Preflight reserves 16 KiB for the completion token before its value is known.
The final report gives actual request bytes, module sizes, asset counts, fetched
paths and vendor calls. Preflight refusals carry `stage: "before upload"`.
The deployment binds the supplied D1 id and enables the Worker's workers.dev
address. An account without a subdomain still deploys with a null URL and a reason.
It never creates an account subdomain. Format 2 and the variables are verified by
fake-provider tests and the local live run of 2026-10-26; their hosted behavior
remains unverified.

`workers.set_vars` takes `account_id`, `script_name`, release `app` and `version`, and
`vars`. It shares deploy's signature-first verification and exact format-2 shape
check, fetching only the manifest and signature. Names must be a non-empty subset of that
signed release's `vars_required`; callers cannot supply an allowlist. The deploy's
non-secret uppercase-name rule and 512 Unicode-character value limit apply.
Unlisted names are refused before any Cloudflare call; refusals echo neither
variable names nor values. It reads the existing Worker's bindings, refuses a
plain variable that would replace a resource or secret, then reads the active
deployment and the complete version history through `list_versions`' paging and
checks. It selects the newest by `created_on`, irrespective of list order. If no
single version serves 100 percent or that version is not the newest, it refuses
before any PATCH: the Worker's newest version is not the one serving, as after a
rollback, and Cloudflare changes variables only on the newest deployed version.
The caller rolls back to a recorded version or deploys a release instead. Tied
newest creation times are refused because the newest cannot be determined. Failed
reads retain their own `vendor_error`; no variable name or value is echoed.
A failed settings PATCH adds `provider_codes`, an array containing only integer
Cloudflare codes, with no provider message text; other actions' errors are unchanged.
When the newest version alone is serving, it sends a multipart
`settings` part to [Patch Worker Script and Version Settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/edit/).
Every other binding is retained by name with `type: "inherit"`, including secrets
whose contents are unreadable, following Wrangler's
`copyWorkerVersionWithNewSecrets` inheritance strategy. The accompanying
[settings read](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
supplies those names. No code is uploaded. The PATCH reference does not specify a
resulting version id, so the action reads [the active deployment](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/) afterward and
requires one version serving 100 percent of traffic, and that version not the one
serving before the update: versions are immutable, so the old id still serving is
the version without the change, never a new one. It then re-reads binding names
and types without inspecting values. Every key in `keys_set` must appear as
`plain_text`; other bindings are not confirmed. It returns only `keys_set` and
`version_id`. Missing keys, non-plain types, an unconfirmed deployment, or the
pre-update version still serving produce a vendor error saying the settings were
updated, with no `version_id` to record. This reports
the post-update active version using Wrangler's `fetchLatestDeployment` and
`fetchDeploymentVersions` reading, rather than attributing an undocumented id to
the PATCH. A
concurrent deployment can change that reading. Binding inheritance likewise has
a read/write race; it follows the API's latest-binding semantics.

`workers.add_custom_domain` takes `account_id`, `script_name`, `zone_id` and
`hostname`. It reads the hostname first, refusing an attachment to another Worker
or non-production environment, then sends `hostname`, `service` (the script name)
and `zone_id` to [Attach Worker Domain](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/).
The result confirms that hostname, Worker and zone. This is Workers Custom Domains,
which manages the hostname's Worker routing, rather than a Workers route pattern.

`workers.remove_custom_domain` takes `account_id`, `script_name` and `hostname`.
[List Worker Domains](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/)
is filtered by hostname without a service filter so another Worker's attachment
cannot look absent. A malformed, ambiguous or incomplete listing refuses the write.
The selected domain is [read by id](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/get/)
before [Detach Worker Domain](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/delete/).
Both ownership reads must name this Worker in production; a missing hostname is
refused. After deletion the id must return 404 and the hostname must be absent.
A domain still present yields `removed: false`, `read_back: "present"`. Ownership
can change between the final read and delete; the API offers no conditional delete
in this reference.

`workers.set_workers_dev` takes `account_id`, `script_name`, `enabled` and
`previews_enabled`, both required booleans. It sends both unchanged to
[Update Worker Script Subdomain](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/create/)
and returns only the two reported flags. It [reads the account address](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/) first,
refusing to enable either flag if none exists. It never creates the account-wide
subdomain. Disabling both flags is permitted even without an account address.

`workers.list_versions` takes `account_id` and `script_name`. It reads
[List Versions](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/list/)
100 at a time and returns `versions`, each with only `id` and `created_on` from
`metadata.created_on`. No bindings, values, authors or other metadata are returned.
The reference exposes pagination but no total count in its answer; the action
continues until a short page, refuses malformed or repeated entries, and reports
an incomplete listing after 1000 full pages. Version history does not identify the
active deployment; use `get_worker` before an upgrade and record that version id.

All four settings writes require confirmation every time. They and the version
read use the `workers` grant and no local files. Their request shapes and refusals
are fake-provider tested. The local live run of 2026-10-26 exercised `set_vars`
and `list_versions`; the new newest-version refusal and PATCH code reporting are
offline-tested. Custom-domain writes, `set_workers_dev`, and hosted settings
behavior remain unverified.

### Restore points and rollback

`workers.d1_bookmark` takes `account_id` and `database_id`. It calls
[Get D1 database bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/),
`GET /accounts/{account_id}/d1/database/{database_id}/time_travel/bookmark`, without
a timestamp query. The answer contains only `bookmark` and `bookmark_time`.
The reference returns no time, and Wrangler's `getBookmarkIdFromTimestamp` and
Time Travel info command return only the bookmark when no timestamp is supplied.
The chosen reading records local UTC at the start of the current-bookmark GET as
`bookmark_time`. This is an observation checkpoint, not a server-confirmed time
encoded in or recovered from the bookmark. It relies on an accurate caller clock
and stopped writes; network latency and clock skew are not measured. Keep that
pair with its account and database, never pair a bookmark with another database's
time. There is no connector cache of restore points. Bookmark inputs and outputs
accept the documented lowercase hex spelling, three eight-digit groups then one
32-digit group separated by hyphens; an unfamiliar response is a vendor error.

`workers.d1_restore` requires the same account and database, `bookmark`,
`bookmark_time` and `window_days`. The caller supplies the account's plan window:
7 on Workers Free, 30 on Workers Paid, per
[Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).
Before any provider call it parses `bookmark_time` as a valid UTC date-time ending
in `Z`, with up to three fractional digits, refuses a future time, and refuses an
age greater than the supplied window or 30 days, reporting the age in days.
The plan window remains a caller fact. After those local checks, it resolves
`bookmark_time` through [Get D1 database bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/)
with a `timestamp` query parameter and refuses without a restore POST unless
Cloudflare's bookmark equals the caller's `bookmark`. A failed or malformed lookup
also makes no restore POST. A bookmark can still be unavailable or rate limited
at Cloudflare.
Its confirmation names `bookmark_time` and says every change after that time is
lost; restoring overwrites the database in place and cancels in-flight queries.
[Restore D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/restore/)
is `POST .../time_travel/restore` with a `bookmark` query parameter, no SQL or JSON
body, using only the bookmark returned by that lookup. This matches Wrangler's
`getBookmarkIdFromTimestamp` and `handleRestore`. The result contains only the new
`bookmark` and `previous_bookmark`, which can undo this restore. Missing either
is a named vendor error saying the restore was submitted, never an invented undo
point. Retain the previous bookmark with the same database and the local time
immediately before the restore if an undo will be needed. Provider diagnostics
and extra response fields are never copied into an answer.

`workers.rollback` requires `account_id`, `script_name` and `version_id`.
Missing `version_id` is refused by the gateway schema before confirmation or
transport. It never looks up a previous version, never lists versions to choose
one, and replaces whatever traffic split is live with the recorded id at 100
percent. [Create Worker Deployment](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)
is `POST .../scripts/{script_name}/deployments` with
`{ strategy: "percentage", versions: [{ version_id, percentage: 100 }] }`, matching
Wrangler's `createDeployment`. No `force` override bypasses Cloudflare's checks
for changed secrets or other rollback restrictions. It then reads
[List Worker Deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)
and returns only `version_id`, requiring that id alone at 100 percent. The list
reference identifies the first entry as actively serving traffic, consistent with
Wrangler's `fetchLatestDeployment`. An empty, split, mismatched
or failed read-back reports rollback submitted but unverified. A concurrent
deploy between the write and read can cause that result; the read is not a lock.
Both restore and rollback require confirmation every time. Their API behavior
is fake-provider tested; the local live run of 2026-10-26 verified restore and
rollback. The hosted run remains unverified.

### Upgrade and failure recovery sequence

Run these actions in order and retain each result before the next write:

1. `workers.get_worker`: record its non-null `version_id` for release N, before
   **any** upgrade write, including `workers.set_vars`. Stop if it cannot name a
   single version at 100 percent. `workers.list_versions` cannot supply this fact.
2. Stop application writes. Wiser CRM releases carry `WISER_READ_ONLY` in
   `vars_required`; the CRM refuses every write, including GET routes that write,
   while its value is anything but empty or `false`. Use `workers.set_vars` on N
   to set `WISER_READ_ONLY` to `true`, and record the answer's `version_id` as
   **N's stopped version**, separately from step 1's original N id. Stop if the
   update is unverified. Keep writes stopped through verification and failure recovery.
3. `workers.d1_bookmark`: retain `bookmark`, `bookmark_time`, account and database
   together, with the account's 7- or 30-day window.
4. `workers.deploy_worker_release`: deploy release N+1. Keep the read-only
   variable set in the new release as well. The deploy turns the Worker's
   `workers.dev` address on, so call `workers.set_workers_dev` with `enabled: false`
   and `previews_enabled: false` straight after it, as after a first install.
5. `workers.d1_migrate`: apply N+1's verified release migrations.
6. On failure, `workers.d1_restore` to step 3's pair and window, then
   `workers.rollback` to step 2's recorded **N's stopped version**, irrespective
   of the live deployment's versions. This restores N's code with writes still
   stopped. Retain `previous_bookmark` for undo. Verify the restored data with
   `pages.d1_query` against the pre-upgrade table set, counts and seeded values
   (custom columns included), and verify the stopped version serving alone with
   `get_worker`. A failed or unverified recovery stops the sequence for the operator.
7. Resume writes only after the data and serving version are verified. On failure,
   `workers.rollback` to step 1's original N id, restoring its original writable
   variables, then verify that id serving alone with `workers.get_worker`.
   Do not use `set_vars` to resume after rollback: N+1 remains the newest version,
   and Cloudflare changes variables only on the newest deployed version. On success,
   verify N+1's data and serving version, then clear `WISER_READ_ONLY` with
   `workers.set_vars` on N+1, which is both newest and deployed.

### Access applications and staff

The `access` module protects one public hostname at Cloudflare's edge with a
self-hosted application and named reusable policies. A proxied DNS record for
that hostname is required for Access to see its traffic. The application does
not cover a Worker's other addresses, including its `workers.dev` address, which
`workers.deploy_worker_release` turns on. After every deploy, a first install or an
upgrade (step 4 above), the caller turns `workers.dev` off with `workers.set_workers_dev`
using `enabled: false`; nothing here does it on its own.
The CRM's own wrapper refuses any request without a valid Access token on
every address. Creating this application alone does not close those other routes.
Its three writes require confirmation every time.
Each write first reads the account's Zero Trust organization. A 403 with only
Cloudflare error code 9999 means Access is not enabled and refuses the write,
naming Cloudflare Setup as the next step. An absent or incomplete organization also refuses without declaring Access off.
A plain permission failure stays `vendor_error`; it is not evidence Access is off.
A successful organization read must include a usable team domain. These actions
never create the organization or change its identity providers. The team must
already offer emailed-code sign-in if staff are to use it.
An Allow policy admits the listed emails through any identity provider the team has, so the team should keep only providers it trusts.

`access.create_app` takes `account_id`, `hostname`, `name` and 1 to 50 `policy_ids`.
It reads a counted application list first: the number of object rows read must
equal a numeric `result_info.total_count`; missing or inconsistent counts refuse
creation, even if page metadata says the list is finished. It refuses a hostname
already covered, including a wildcard or a path on that hostname. A scheme and
port are stripped before comparing destinations. An unresolved
Worker destination also requires inspection before creating an application.
The request uses `type: self_hosted`, the primary `domain`, one public
`destinations` entry, and reusable-policy links with precedence in supplied order.
Before POST it reads each policy, accepting only `allow` with 1 to 50 explicit
email includes or `non_identity` with exactly one service-token UUID include.
Both shapes require `exclude` and `require` to be absent or empty arrays. Any
other decision or include rule is refused with the policy id and reason.
The create response must carry the requested policy id set and policy details
satisfying the same checks. Each linked policy is read again after POST.
After POST, GET of the stored application must pass the same checker as `get_app`
and confirm the requested id, hostname and policy id set. It must be self-hosted,
with that hostname as `domain`, as its one public destination, and
as its one `self_hosted_domains` entry. Destination overrides must
be absent or empty, and `read_service_tokens_from_header` must be absent, null or empty.
Missing details, a different id set, a failed read or an unsafe application or policy cause the
created application to be deleted and read back absent before `vendor_error`
reports its removal. If removal cannot be confirmed, the error names the
application id so it can be checked in Cloudflare.
When the create response has no usable id, a counted application list is searched
for one exact hostname match and that application is removed. An ambiguous or
unreadable list reports by hostname that removal could not be confirmed.
It returns only `id` and the public audience tag `aud`, beside `success`.
It has no single-header input and leaves `read_service_tokens_from_header` out
of the create. Cloudflare's [application-create reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/)
marks this property optional and describes it as a header-name string, so leaving
it out keeps the two-header service-token check; the stored application is then
read back and refused unless the setting is absent, null or empty.
Concurrent application creation after the final read is still possible; the
preflight check is not an atomic reservation.

`access.create_policy` takes `account_id`, `name` and exactly one alternative:
`decision: allow` with 1 to 50 `emails`, or `decision: non_identity` with one
`service_token_id`. The latter is Cloudflare's Service Auth policy. Its include
rule carries only `service_token: { token_id }`, the existing token's public UUID.
The new policy is read back by id. It must pass the supported-shape check, carry
`reusable: true`, and have exactly the submitted decision and include rules.
Failure deletes the policy and reads it back absent; `vendor_error` names the id
and whether removal was confirmed. The result is the checked reusable policy's
`id` and `success`. No action creates a
service token or accepts or returns its client secret. The member creates it in
Cloudflare's dashboard. Its credentials belong only on the connecting service's
hosted connect page, never in this action's inputs.

`access.set_staff` takes `account_id`, `policy_id` and exactly one of `add` or
`remove`, each one email. It reads a reusable Allow policy with only explicit
email includes, requires `reusable: true` and absent or empty `exclude` and
`require`, preserves the documented writable settings, and refuses an unfamiliar
setting rather than discarding it. The same unknown-field and supported-shape
checks run before the write and after it. Removal compares emails without
case and never removes the last distinct email. Adding an existing email or
removing an absent one still reads the policy back and returns `changed: false`.
Every completed call returns the actual email arrays as `before` and `after`;
a failed read-back is a refusal, even when the write may already have taken effect.
A policy may contain at most 50 staff emails here. A concurrent edit between
read and PUT can be overwritten; this action has no conditional-write guarantee.
Changing a reusable policy affects every application carrying it.

`access.get_app` reads `account_id` and `app_id`, returning the single `hostname`,
`policy_ids`, `aud`, `id` and `success`. It refuses an ambiguous application rather
than imply it protects only one hostname. A non-empty destination `overrides`
array or an enabled single-header setting is reported as `vendor_error`. Every
attached policy is fetched by id and checked with `accessPolicyProblem`, even
when the embed contains rules. Embedded rules must also pass the supported-shape
checks. Any policy failure names the policy and reason.
App, policy and service token ids use
UUID spelling; account ids use 32 lowercase hexadecimal characters. Names are
1 to 100 characters, hostnames at most 253, and emails at most 254. Published
patterns exclude control characters in names and common credential shapes in
names and addresses: JWTs beginning `eyJ` and uninterrupted alphanumeric or underscore runs
of 40 or more. A whole name, email local part or hostname label consisting of
exactly 40 letters, digits, underscores or hyphens is also refused.
This includes staff addresses such as `it-infrastructure-operations-oncall-team@company.com`, whose 40-character local part has the same shape as a token.
Hyphenated local parts of 39 or 41 characters remain usable when they pass the
other checks. These are conservative shape checks, not a way to recognize every
possible secret disguised as ordinary text. Provider fields and diagnostics are
never returned wholesale. The audience tag is public and intentionally returned.

The API references establish [application creation](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/),
[application listing](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/list/),
[application reads](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/get/),
[reusable-policy creation](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/policies/methods/create/),
[policy reads](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/policies/methods/get/),
[policy replacement](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/policies/methods/update/),
and the [organization read](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/list/).
The application reference supports reusable links, public destinations and the
primary domain, and explicitly defaults allowed identity providers to every one
configured on the account. This connector leaves that setting absent, matching
the dashboard's self-hosted application flow with reusable Allow and Service Auth
policies and the team's identity providers. The reference does not settle
duplicate-creation races, so the read-first check makes no atomicity claim. The organization reference does not specify the
not-enabled error; code 9999 follows the existing connector's measured behavior.
The app-read path parameter lists a 32-character maximum while its response
labels the application id a UUID with a 36-character maximum. This connector uses
the returned UUID spelling for app ids, preserving the create-to-read round trip.
These four actions have fake-provider verification only.

## Credentials

This connector holds none. One token connected on any one module, with no label, serves all six where it is the only Cloudflare credential and no Cloudflare connection carries a label; otherwise a module with no connection of its own answers `needs_connect` and is connected on its own with the same token (`auth.md`). The vendor secret is an API token on the provider's hosted page. A DNS-only token will list nothing on `zones` and 403 on Pages: each module's permissions are on the token, whichever module it was connected as. A 403 on any of the new zone, ruleset or Pages domain reads or writes most often means the token connected for that module lacks the permission `auth.md` names; it is not proof of that, because the provider can also refuse with 403, and `zones.list_access_apps` answers `access_enabled: false` instead where Cloudflare says Access is not enabled, under How settings, redirects and lists behave. Where the permission is missing, edit that same token at Cloudflare and add it. Editing keeps the token's value, so nothing is reconnected. Rolling the token is what changes the value. The Web Analytics actions ride the `pages` grant and need Account / Account Settings: Read for `list_web_analytics_sites` and for `enable_web_analytics` when it attaches a named site, Edit for `enable_web_analytics` when it creates a site and for `delete_web_analytics_site`, with Edit added only for a run that creates or deletes a site and removed afterwards, because Account Settings Edit also lets the token update or delete the whole Cloudflare account, and editing the token keeps its value so nothing is reconnected.

## Modules

| Module | Privilege | What it is for |
|--------|-----------|----------------|
| `dns` | write | Records in a named zone |
| `zones` | write | Every zone the token can see, plus accounts, zone settings (seven of them can be changed), and reads of bot management, certificate packs, Workers routes and Access applications |
| `pages` | write | Pages projects, domains and custom-domain status, production deploys of kit output, including the kit's Function when a scheduled article carried one, production deploys with Pages Functions, plain static deploys, Web Analytics on a Pages project, and the D1 databases a Pages site uses: list, get, create, a read-only query, confirmed writes and migrations, binding, removal, and a confirmed validation retry |
| `access` | write | One-host self-hosted applications with reusable policies, Allow staff email lists, Service Auth by existing token id, and application audience reads |
| `workers` | write | Read deployed versions and binding names; deploy signed releases with D1, assets and plain variables; apply release migrations and adopt a baseline; take D1 bookmarks, restore and roll back to a recorded version; delete with a read-back |
| `rulesets` | write | Rulesets, Page Rules, reads of every phase `get_phase_entrypoint` accepts, redirect writes on the two redirect phases, and Bulk Redirect lists |

R2, KV, cache purging, and mail routing are later modules, never extra permissions on these six. Reads of Workers routes, certificate packs, Page Rules and non-redirect phases do not write them.

### Release migrations and adoption

`workers.d1_migrate` and `workers.d1_adopt` each take `account_id`, `database_id`,
release `app` and `version`, and require confirmation every time. They share
deploy's signature-first manifest verification, pinned host and exact format-2
contract. Every `migrations.files` file is fetched by SHA-256 and checked for size,
hash and UTF-8 before any Cloudflare call. The serialized query for each file,
including its history INSERT, must fit 3 MiB. No local file path is accepted;
these actions can run on the hosted endpoint when it carries this release.
They do not call `pages.d1_apply_migration`.

`d1_migrate` uses [Query D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
to create `migrations.table` with Wrangler 4.93.1's `id INTEGER PRIMARY KEY
AUTOINCREMENT`, `name TEXT UNIQUE` and `applied_at TIMESTAMP DEFAULT
CURRENT_TIMESTAMP NOT NULL`. It reads names ordered by id, sorts release names
lexically and then stably by their numeric prefix, skips recorded names, and
sends each remaining file's text with the history INSERT appended in that same
request. Names and table come from the verified manifest. Its `applied`, `skipped`
and `ignored` arrays name the files; an extra recorded name is ignored as Wrangler
ignores it. A corrupt history value that is not a safe SQL filename is withheld
by hash, never echoed as SQL. Answers carry no SQL or raw provider diagnostic.

A statement reporting `success: false` stops the action and names `file` and
zero-based `statement_index`. This deliberately differs from Wrangler 4.93.1,
which continues after that result. The answer retains previously applied files;
it never claims to roll back earlier statements or requests. The API reference
says semicolon-separated statements execute as a batch but does not specify the
effect of a later failed statement on earlier statements in that request.
Stop application writes and take a restore point before an upgrade. Concurrent
migration calls are not serialized by this connector; the history table's unique
name is no substitute for stopping concurrent upgrade runs.

`d1_adopt` reproduces `adopt.mjs` for `0001_baseline.sql` first and the default
`d1_migrations` table; another table or missing baseline is refused. Its four
outcomes are a matching baseline `adopted` by recording its name without running
it on the member database, `empty` with nothing written when no baseline table
exists (unrelated tables are allowed), `already_adopted` for compatible existing
history, or an incompatible baseline refused with named `mismatches`. Existing
history must be a nonempty lexical prefix of release SQL filenames, and still
undergoes the complete schema check. Empty, unknown, gapped or reordered history
is refused. Member tables and rows are unchanged on a comparison refusal.

The member and reference shapes are read with single SELECTs from `sqlite_master`
and `pragma_table_info`, `pragma_index_list`, `pragma_index_info` and
`pragma_foreign_key_list`. Each baseline column's type, notnull, default and pk
must match; column order is ignored. Every baseline index, including autoindexes,
must match its name, unique and partial flags and ordered column names. Foreign
key rows must match exactly. Extra tables, columns and indexes are allowed.
A query API refusal of those SELECTs stops adoption before a member write.
The final history CREATE and INSERT are sent in one query request.

To let SQLite interpret the baseline, adoption [creates a temporary D1 database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/)
named `wiser-adopt-` plus a random suffix, after a complete
[name search](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/)
reads it absent. Only that reference receives the baseline SQL. Before returning,
success, refusal and error all [delete the reference](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/delete/),
verify its id returns 404 and its name is absent. Ownership is read before delete;
the member database id is never a cleanup target. A lost create response is
reconciled by the generated name. `temporary_database` always names a created or
attempted reference; unconfirmed deletion is `vendor_error` with `deleted: false`
and the original `outcome`, so the operator can remove that named resource.
The token needs Account / D1 / Edit for migration, temporary creation and removal.
These paths are verified with fake providers and local D1; live API behavior
remains unverified. Stop application writes during adoption to keep its shape
reads and final history record consistent.

## Destructive Actions

| Action | Effect | Undoable there? |
|--------|--------|-----------------|
| `access.create_app` | Protects one hostname at Cloudflare's edge with the named reusable policies; requires proxied DNS and does not cover other Worker addresses | Remove the application in Cloudflare; this module has no delete action |
| `access.create_policy` | Creates a reusable Allow or Service Auth policy | Remove it in Cloudflare after checking its application links |
| `access.set_staff` | Replaces the policy's email includes; affects every application using that policy | Call again with the inverse change, subject to the last-email rule |
| `workers.deploy_worker_release` | Replaces the deployed script, assets, bindings and plain variables | A previous version must be retained separately |
| `workers.delete_worker` | Removes the Worker | No |
| `workers.d1_restore` | Overwrites the database at the supplied bookmark; every later change is lost | Restore to the returned previous_bookmark within the account's window |
| `dns.delete_record` | Removes the record | No |
| `dns.batch` | Mixed deletes and writes | No |
| `dns.import_zone` | Bulk create from BIND | No |
| `zones.delete` | Deletes the zone | No |
| `zones.update_setting` | Changes one of `ssl`, `always_use_https`, `security_header`, `min_tls_version`, `automatic_https_rewrites`, `email_obfuscation`, `browser_cache_ttl`, and returns the value it read first | A later `update_setting` with that `before` puts the value back. This action does not undo one. A browser keeps what it cached under a longer `browser_cache_ttl` until that time runs out, and a purge at Cloudflare does not reach it |
| `rulesets.delete` | Removes an empty redirect ruleset, after reading it. The phase must be `http_request_dynamic_redirect` on a zone or `http_request_redirect` on an account, and `rules` must be empty or absent. Any other phase, or a ruleset that still has rules, is refused before the DELETE. An empty answer is success, and `deleted` is the ruleset id | No |
| `rulesets.put_phase_entrypoint` | Replaces every rule in the redirect phase. The `expected_version` check is best effort: it compares a read taken just before the PUT, a write by anyone else in between is overwritten, and the guard does not make the replace atomic | A later call with the previous rules can replace them. This action does not undo one |
| `rulesets.add_rule` | Adds one redirect rule, after reading the ruleset and refusing unless it is that scope's redirect phase | `rulesets.remove_rule` removes it |
| `rulesets.update_rule` | Replaces the whole rule, after the same read, and only when `rule_id` is in that ruleset. A `position` key on the rule is refused | A later `update_rule` with the previous rule puts it back. This action does not keep the old one |
| `rulesets.reorder_rule` | Moves a rule to the top-level `position`, after the same read, and only when `rule_id` is in that ruleset | A later `reorder_rule` can put it back. This action does not remember where the rule was |
| `rulesets.remove_rule` | Removes the rule, after the same read, and only when `rule_id` is in that ruleset | Only by adding it again |
| `rulesets.create_list` | Creates an account list whose kind is redirect | `rulesets.delete_list` removes it |
| `rulesets.add_list_items` | Adds redirect items, as one bulk operation | `rulesets.remove_list_items` removes them once their ids are known |
| `rulesets.remove_list_items` | Removes the named items from a list | Only by adding them again |
| `rulesets.delete_list` | Deletes the list | No |
| `workers.d1_migrate` | Runs verified release SQL and records filenames in the manifest history table | No automatic undo; stop on a failed statement and use the upgrade restore sequence |
| `workers.d1_adopt` | Creates and deletes a temporary reference database; records a matching baseline on the member database | Member baseline SQL is never run; an unconfirmed reference deletion is a named failure |
| `workers.rollback` | Deploys the recorded version alone at 100 percent, including its variables | Roll back to another recorded id; recovery uses stopped N first, then original N to resume writes |
| `workers.set_vars` | Changes plain variables and creates a settings version only when the newest version alone is deployed; other bindings are inherited | Set previous values while newest is deployed, or roll back to a recorded version; no values are returned |
| `workers.add_custom_domain` | Routes the hostname to the Worker | `workers.remove_custom_domain` detaches it |
| `workers.remove_custom_domain` | Detaches the hostname from the Worker and its previews | Only by adding it again |
| `workers.set_workers_dev` | Enables or disables free and preview addresses on this Worker | Set the previous flags again |
| `pages.deploy` | Replaces what production serves. When the kit payload carries the kit's Function, a scheduled article appears at its instant with no further deploy | A later deploy can replace it. A later deploy of the same `dist/` without `site/dist-function/` serves the build-time view. This action does not undo one |
| `pages.create_project` | Creates a Pages project | `pages.delete_project` removes it |
| `pages.add_domain` | Attaches a domain to a project and does not create the DNS record | `pages.remove_domain` detaches it |
| `pages.retry_domain_validation` | Asks Pages to validate a custom domain again. PATCH with no body | No |
| `pages.remove_domain` | Detaches a custom domain; the hostname stops serving the project, and the DNS record stays | Only by adding it again |
| `pages.delete_project` | Deletes the project and every deployment in it. With Web Analytics on, Cloudflare also deletes the Web Analytics site the project sends to, and that site's history, whether the project created it or attached it (observed 2026-10-10) | No |
| `pages.d1_create_database` | Creates a D1 database | `pages.d1_delete_database` removes it |
| `pages.d1_execute` | Runs SQL that can change or delete rows | No |
| `pages.d1_apply_migration` | Runs a local `.sql` file and records it in `d1_migrations` | No. A later file can change the schema; this action does not undo one. A name already recorded does not run again |
| `pages.d1_delete_database` | Deletes the database and the data in it | No |
| `pages.bind_d1` | Sets or overwrites one D1 binding on the named environments | Bind a different database, or remove the binding in the dashboard |
| `pages.deploy_with_functions` | Replaces what production serves, including its Pages Functions | A later deploy can replace it; this action does not undo one |
| `pages.deploy_static` | Replaces what production serves | A later deploy can replace it. This action does not undo one |
| `pages.enable_web_analytics` | From the next deployment every HTML page carries the beacon of that site, and the site is deleted with the project if the project is deleted | This connector has no action that switches it off |
| `pages.delete_web_analytics_site` | Deletes the site and its recorded history | No |

Each is gated `always`. The Pages writes, and `rulesets.add_rule`, are `always` rather than `once` because the gateway remembers a `once` approval by action id for the life of the process, not by input, so after one approved domain a second, different domain would run unasked, and after one approved rule a second, different rule would too.

`pages.delete_project` reads the project first and refuses while any domain other than its own `pages.dev` subdomain (the read's `subdomain`) is attached, another `*.pages.dev` name included, or when the read carries no domain list, so a project serving a real hostname takes two confirmed calls to remove: `remove_domain`, then `delete_project`. That check is best effort: a domain someone attaches between the read and the delete is not caught. `remove_domain` and `delete_project` take a Cloudflare project name and, for `remove_domain`, a dotted hostname, published as patterns, because both values land in a DELETE path where `.` or `..` would address something else. Cloudflare may refuse to delete a project with many deployments.

`pages.add_domain` posts the hostname onto the project. It does not create the DNS CNAME. The domain stays pending until that record exists. The record is Zone Publisher's job, through the `dns` grant.

`pages.deploy` uploads static kit output only. `dir` must be a directory named `dist`, its parent must be named `site`, and that parent must contain a regular file `kit.json`. Neither `site` nor `dist` may be a symbolic link, so the path approved is the path deployed. A tree whose root contains `_worker.js` or a `functions/` directory is refused. Hidden names other than `.well-known`, names shaped like private keys or certificate bundles, `.env` files, `node_modules`, `_routes.json`, and links resolving outside `dir` are skipped and listed in the result's `skipped`; that is a screen for common shapes and nothing more. **The confirmation stop shows the input, not the file list**, so a secret under an ordinary name such as `config.json` passes the screen and is not visible before it publishes; the review that sees the files is Webmaster Job 3 over the payload, before the call, and the returned `manifest` and `skipped` lists report afterwards what was published. Each file is hashed during the walk and read again before the deployment is created, whether or not it needed uploading, as are `_headers` and `_redirects`; a file that changed in between stops the deploy. A directory inside `dist` swapped for a link while the deploy runs is not caught. Each upload request is capped at 3 MiB of serialized body. A file over roughly 2.25 MiB is refused before anything is sent and goes to Wrangler per `skills/Cloudflare Pages/SETUP.md`. A 2xx answer whose envelope says `success: false` stops the flow at that step as `vendor_error`. The file hash is `sha256(base64(content) + extension)` hex, first 32 characters, where extension is Node's `extname` including the leading dot. That substitutes for Wrangler's blake3 because Node has no blake3 built-in and a module may not add a dependency. The key is client-chosen.

When `site/dist-function/` exists beside that `dist`, the same deploy carries the kit's Function, and the result's `function` is null when it does not. The directory must be a real directory, not a link, at that exact path, holding exactly four regular files and nothing else: `_worker.js`, `_routes.json`, `schedule.bin` and `function.json`. A fifth name, a hidden name, a folder, or a link, including a link in place of the directory, refuses the deploy before any call and names the entry. The walk of `dist/` is unchanged, so none of those four files is an asset, and a `_worker.js` or `functions/` at the root of `dist/` is still refused. `deploy_with_functions` still refuses a kit payload.

`_worker.js` is admitted only when its sha256 is one of the fingerprints in `kit-function.json`, read once per deploy from beside this connector. A missing or malformed list refuses every kit Function deploy. The Function's code is pinned to a release because it runs on the request. `_routes.json` and `schedule.bin` are the site's own and carry no code, so they are screened by shape rather than by fingerprint: the routes can only send more or fewer requests to that Function, which passes any path it does not carry through to the static files. `_routes.json` must be version 1, with only `include` and `exclude`, `include` non-empty, at most 100 rules together, and every rule starting with `/` and at most 100 characters. `schedule.bin` must start with the bytes `WKS1` and a big-endian length, then that many bytes of UTF-8 JSON whose `v` is 1. Nothing after that header is interpreted. `function.json` must name the sha256 of `_worker.js`, `_routes.json` and `schedule.bin`, a `kitVersion` equal to the matching fingerprint and to `site/kit.json`, and a `buildTime` string equal to the one in `site/.astro/kit-build.json`. A missing or unreadable build record refuses the deploy.

The connector builds the Worker bundle itself, in the canonical form it already accepts from a Functions build: a `metadata` part `{"main_module":"_worker.js"}` with no bindings, `_worker.js` as `application/javascript+module`, and `schedule.bin` as `application/octet-stream`, each module named as its own filename. The deployment form is the static one (`manifest`, `_headers`, `_redirects`) plus `_worker.bundle` and `_routes.json`. It does not send `functions-filepath-routing-config.json`. The bundle must stay within 2 MiB, and the whole deployment request within the same base64 cap `deploy_with_functions` already enforces. Over that cap the deploy is refused before any call, with that same refusal and `scheduled_instants`, how many instants `function.json` carried. The four files are re-read immediately before the deployment request, and a change stops the deploy. The result's `function` then reports `kit_version`, `worker_sha256`, `schedule_bytes`, `routes` as include and exclude counts, and `carried` and `not_carried` from `function.json`.

`pages.deploy_with_functions` deploys a static directory that is not a kit site, together with a Pages Functions bundle from `functions_build`. It runs on the local gateway only. Both paths are absolute and in the platform's normal form: no `.` or `..` or repeated separator, on Windows in either separator, which is refused rather than normalized, and no symbolic link anywhere in the spelling, so pass the real path; on macOS that means `/private/tmp`, not `/tmp`. `dir` is not the home directory, not the credential directory, not the filesystem root, and not a kit payload: a `site/dist`, or any directory whose parent holds `kit.json`, and so does any directory inside a kit's `dist`; those go through `pages.deploy`, so this action never deploys a kit's payload, or any part of it, with a Function. Which project a deploy targets is the caller's input; the connector cannot tell a kit's project from another by its name. Its root must not contain `functions`, `_worker.js`, `_worker.bundle`, `functions-filepath-routing-config.json`, `package.json`, or a wrangler config (`wrangler.toml`, `wrangler.json`, `wrangler.jsonc`), in any letter case. Below the root, `_worker.js`, `_worker.bundle` or `functions-filepath-routing-config.json` stops the deploy, and `package.json`, `package-lock.json` or a wrangler config is skipped and listed as `source file`. `functions_build` is a separate absolute directory whose entries are exactly `_worker.bundle`, `_routes.json`, `functions-filepath-routing-config.json` and `build.json`. `build.json`, which `tools/pages-functions/` writes, must be a JSON object whose `assets` is this `dir`, whose `functions` names, by its real path, a functions source outside it, and whose `sources` lists each source file's sha256; a file in `dir` whose bytes match a listed source stops the deploy, under any name; it is returned as provenance and never sent. The bundle is at most 2 MiB and is parsed strictly: each part carries only `Content-Disposition` (form-data, a quoted `name` and an optional quoted `filename` equal to it) and `Content-Type`, each once; part names are unique and plain ASCII (letters, digits, `.`, `_`, `-`, `/`); the one `metadata` part is JSON naming its `main_module` and carrying no bindings; module parts carry a module content type. **The bundle sent is rebuilt from what was screened**, under the connector's own boundary and headers, so no part two parsers could read differently reaches Cloudflare. `functions-filepath-routing-config.json` must be a JSON object with a `routes` array. Bindings are set on the project with `pages.bind_d1`. The whole deployment request, measured as base64 length, must be at most 3 MiB. A larger one is refused with `bytes` and a Wrangler fallback. The four build files are re-read before the deployment is created, and a change stops the deploy. None of them is an asset or a manifest entry. The same walk screens as `pages.deploy` apply to `dir`, and every skip is listed.

`pages.deploy_static` deploys a static build output that is neither a kit payload nor a site with Pages Functions to Pages production by Direct Upload. It runs on the local gateway only, because it reads local files. `dir` reuses the path screen `pages.deploy_with_functions` uses: an absolute path in the platform's normal form, with no `.` or `..` or repeated separator (on Windows, no `/`) and no symbolic link anywhere in its spelling, refused rather than normalized, so pass the real path; on macOS that means `/private/tmp`, not `/tmp`. It is not the home directory, not the credential directory, and not the filesystem root. A kit payload is refused as `kit payload: use cloudflare.pages.deploy`: a `site/dist`, any directory whose parent holds `kit.json`, or any directory inside a kit's `dist`. A declared root is a directory whose `AGENTS.md` is a regular file, not a link, opening with a line `---` and closing that frontmatter with a line `---` within the first 64 KiB, with a line between them matching `root:` or `type:`. A leading UTF-8 byte-order mark is ignored, and the key may have leading spaces or tabs. `dir` is refused when it is a declared root (`working folder: dir is a declared root`) and when its parent is one (`working folder: dir is at the top level of a declared root`). An `AGENTS.md` at either place that is not a symbolic link, and that cannot be read or is not a regular file, is `working folder: unreadable AGENTS.md`. So is an `AGENTS.md` that opens with `---` and has no closing `---` within the first 64 KiB when the file is longer than that scan. A symbolic link named `AGENTS.md` is not a declared root. Higher ancestors are not examined, so a build output deeper inside a root is accepted. At the root of `dir`, in any letter case, `AGENTS.md`, `CLAUDE.md`, `.git` (file or directory), `zArchive`, a directory named `memory`, `.env`, and any name starting `.env.` are refused as `working folder:` plus that name. The walk checks those root markers again, so one that appears after the first screen is still refused. A file named `memory` at the root is not that marker. Server code anywhere in `dir`, in any letter case, is refused: a file named `_worker.js`, `_worker.bundle`, or `functions-filepath-routing-config.json`, or a directory named `functions`. The reason is `server code:` plus the path, then `; use cloudflare.pages.deploy_with_functions`. `package.json`, `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc` at the root are `not build output:` plus that name. Below the root, `AGENTS.md`, `CLAUDE.md`, `.git` of any type, `zArchive`, `.env`, and a name starting `.env.` are refused as a working folder rather than skipped. A directory named `memory` below the root is walked and uploaded. A link is refused when any segment of its resolved path, not the link's own name, is one of those markers, and the reason names the link, as in `working folder: public.txt`. A link whose resolved target is a server-code file, or sits under a directory named `functions`, is refused as `server code:` plus the link's path. Each skipped hidden directory, each skipped `node_modules` and each directory skipped for a key-shaped name is screened by name, not following links: a marker at any depth is refused as `working folder:` plus that path, and a server-code file as `server code:` plus that path; a directory named `functions` inside one is not, because such trees often hold one and nothing in them is published. Any directory the walk or that screening cannot read refuses the deploy as `working folder:` plus its path and `could not be screened`. More than 20000 entries across that screening is `working folder:` plus the skipped directory and `too large to screen`. `.well-known` is walked. The walk skips `node_modules`, hidden names other than `.well-known`, names shaped like private keys or certificate bundles, `package.json`, `package-lock.json`, and wrangler configs below the root, `_routes.json`, and links that resolve outside `dir` or point at a directory, and lists every skip. `_headers` and `_redirects` are sent with the deployment and are not assets. It refuses a tree with no uploadable file (`no uploadable files`, and `skipped` names what was left out), more than 20000 files, any file over 25 MiB, any file whose upload request alone would exceed 3 MiB, a deployment request whose base64 length exceeds 3 MiB, and a file that changes between hashing and upload. The upload token is never returned. A non-empty `web_analytics_token` anywhere in the result is replaced with `[redacted]`; null and an empty string are left as they are. Every `pages` result except a `d1_` action is treated the same way. `d1_query` and `d1_execute` return the caller's own rows unchanged. The result carries `deployment`, `dir`, `files`, `uploaded`, `already_present`, `manifest`, and `skipped`.

`pages.list_web_analytics_sites` lists every Web Analytics site in the account. It reads `/accounts/{account_id}/rum/site_info/list`, 100 at a time, at most 50 pages. The list is complete when `result_info.total_pages` is a whole number and every page up to it was read, or, when `total_pages` is absent, when the first page returned fewer than 100 sites. A `total_pages` that is present and not a whole number is incomplete. Otherwise the action is `vendor_error` with `reason: site listing incomplete` and returns no partial list. A page whose `success` is false or whose `result` is not an array is `vendor_error`. A thrown error on that read propagates. Each site is `site_tag`, `host`, `auto_install`, `enabled`, `zone_tag`, `zone_name`, `rule_hosts`, and `created`. A value that is absent is null. `rule_hosts` is the distinct string hosts of the site's rules. `site_token` and `snippet` are never returned.

`pages.enable_web_analytics` reads the project, then writes that site's tag and token into `build_config.web_analytics_tag` and `build_config.web_analytics_token` and nothing else in the patch. The site's token and snippet are never returned. `already_on` requires the project to carry a non-empty `web_analytics_tag` and a non-empty `web_analytics_token`. The same `site_tag`, or an omitted `site_tag`, then returns `project_name`, `action: already_on`, `site_tag` and `before_site_tag` set to the current tag, `host` null, `applies_from` `next deployment`, and an empty `collateral_changes`, and nothing else is called. A non-empty tag with no token is repaired: that tag is the site to attach, the site is read for its token, the project is patched, and `action` is `repaired`. A different `site_tag` is refused as `project already sends to another Web Analytics site` and names `current_site_tag`, whether or not the token is present. An unknown `site_tag`, which Cloudflare answers as HTTP 404, is `no such Web Analytics site`, and the project is not patched. With a `site_tag` that exists, the action attaches that site, so its history continues, and `action` is `attached`. `host` is that site's host, or null when the read has none. Without a `site_tag` it creates a site for the project's `pages.dev` host. The project's `subdomain` must be a string ending in `.pages.dev`, or the action is `vendor_error` on the project read and no site is created. The create posts exactly `{ host, auto_install: false }`, `host` in the result is that subdomain, and `action` is `created`. A success returns `project_name`, `site_tag`, `action`, `host`, `before_site_tag` (null when the project was not already sending), `applies_from` (`next deployment`), and `collateral_changes`. `collateral_changes` lists the names of other `build_config` settings the patch changed, each as `build_config.` followed by the key, and `deployment_configs` when that value differs, never their values. A create whose answer carries a `site_tag` but no token is `vendor_error` on that POST with `created_site_tag`, and nothing is patched. Applied means the PATCH answer shows the tag sent and a `web_analytics_token` equal to the token sent. An answer whose `success` is `false` is Cloudflare's refusal: `vendor_error` with `reason: analytics not applied`, plus `created_site_tag` when this call created the site, so the caller can remove it. Any other answer that does not show both, and a PATCH that throws, on every path alike, read the project once more. A re-read counts only when it shows the project's `build_config` with its `web_analytics_tag` key. When it shows the tag and the token that were sent, the result is the normal success, and `collateral_changes` comes from the re-read. When it shows them otherwise, the result is `analytics not applied`, with `http_status` from a thrown PATCH and `created_site_tag` when this call created the site. When the re-read fails or does not show that key, the result is `vendor_error` with `method: PATCH` and `reason: analytics outcome unknown`, plus `http_status` and `created_site_tag` when this call created the site. That reason claims nothing about whether the project sends to the created site. The switch takes effect from the next deployment, and a page that is not valid HTML does not get the script; deployments made before it keep serving no beacon (observed 2026-10-10). Attaching a site ties it to the project: when that project is deleted, Cloudflare deletes the site and its history, including a site another project created or a zone's own site, so attach a site with a history worth keeping only to a project that will not be deleted. The connector reports `applies_from: next deployment` and does not itself check the page.

`pages.delete_web_analytics_site` deletes the site and its recorded history. It reads the site first. An unknown `site_tag`, which Cloudflare answers as HTTP 404, is `no such Web Analytics site`, and nothing is deleted. It then refuses while any Pages project in the account names the site in `build_config.web_analytics_tag`, as `in use by a Pages project`, and `projects` names each of those projects whose `name` is a string. Projects are read 10 at a time, at most 50 pages. The listing is complete when `result_info.total_pages` is a number and every page up to it was read, or, when `total_pages` is absent, when the first page returned fewer than 10 projects. An incomplete listing, a `total_pages` that is present and not a whole number, or a row that is not an object or whose `build_config` is not an object, is `vendor_error` with `reason: project listing incomplete` and deletes nothing, because whether that project names the site cannot be read. The check is best effort: a project that starts naming the site after the listing is not caught. A failed project listing is `vendor_error` and deletes nothing. A success returns `deleted` (the site tag), `host`, and `zone_name`. The token and snippet are never returned.

Every `pages.d1_*` action except `d1_apply_migration`, and `pages.bind_d1`, run on the local gateway, and on the hosted Wiser endpoint once that service carries this release. `pages.d1_apply_migration`, `pages.deploy_with_functions` and `pages.deploy_static` run on the local gateway only, because each reads a local file. The three Web Analytics actions, `list_web_analytics_sites`, `enable_web_analytics` and `delete_web_analytics_site`, read no local file, so they run on the local gateway and on the hosted Wiser endpoint once that service carries this release. The bundle `deploy_with_functions` sends is built by `tools/pages-functions/`.

The connector neither sets nor changes `fail_open`. `pages.get_project` returns the project, which carries it, and `pages.bind_d1` reports the value it read back for each environment it patched. With `fail_open` on, which is the Pages default, a spent free quota makes requests skip the Function and receive the static files. With it off, those visitors get Cloudflare's 1027 page. An uncaught exception in a Function fails that request either way.

`pages.d1_query` is a read. After leading whitespace, `sql` must open with `SELECT` and a character that is not a letter, digit, underscore or semicolon, and the only semicolon allowed is an optional one as the last non-whitespace character. D1 splits on `;` with no regard for string literals, so `SELECT ';DROP TABLE x'` is refused rather than trusted. The rule is published as the pattern on `sql`, so the gateway refuses a non-matching statement before the module runs. `pages.d1_execute` is the write, and it is confirmed every time. `pages.d1_apply_migration` reads one local `.sql` file of at most 1 MiB (1048576 bytes), creates `d1_migrations` if needed, and skips a basename that is already recorded. A file over that limit goes to Wrangler: `wrangler d1 migrations apply`. A failed statement is reported with `statement_index`. Whether D1 rolls back the earlier statements in that file is not promised. The SQL text is not echoed.

## Troubleshooting

**`needs_connect` on `zones` while `dns` is ACTIVE** That is the design. Connect `cloudflare` / `zones` as its own turn.

**`vendor_error` 403 on `zones.list`** The token cannot list zones. Make a token with Zone / Zone / Read (or the account-wide list), connect `zones` with that token. Do not paste it into chat.

**`vendor_error` 403 on a zone configuration read, or on any new ruleset or Pages domain read or write** The read or write did not happen. The usual cause is that the token connected for that module lacks the permission `auth.md` names for the action; `provider_codes`, where present, are Cloudflare's own codes and say more, and a 403 with none can also be the provider's own refusal, which `skills/Connection Troubleshooter/` diagnoses. A zone configuration read is `get_settings`, `get_setting`, `get_bot_management`, `list_certificate_packs`, `list_workers_routes` or `list_access_apps`. Edit that same token at Cloudflare and add the permission. Editing keeps the token's value, so nothing is reconnected. Rolling the token is what changes the value.

**`vendor_error` 403 on `zones.list_access_apps`** The read did not happen; the usual cause is that the token connected as `zones` lacks Account / Access: Apps and Policies / Read. When Access is not enabled on the account, Cloudflare answers 403 with its own code 9999 instead, the gateway passes that code as `provider_codes`, and the action answers `access_enabled: false` rather than this error. A 403 without that code is unclassified: the usual cause is that missing permission, and adding it to the same token is the first fix, but the provider can also refuse a request with 403, which carries no Cloudflare code. If it persists with the permission on the token, `skills/Connection Troubleshooter/` is the next step.

**`vendor_error` 503 or 504 on a read seconds after a write** A list's items read right after `add_list_items`, and a new Pages domain read right after `add_domain`, each answered this once on 2026-10-09 and returned on a second read seconds later. Read again before calling it a failure; do not repeat the write.

**`vendor_error` 404 from `pages.get_domain` on the project's own `pages.dev` name** That name is not a custom domain. `pages.list_domains` shows the custom ones. Read one of those.

**`expected_version` from `rulesets.put_phase_entrypoint`** `none` when an entrypoint already exists is `invalid_arguments` with `reason: entrypoint exists`, `current_version` and `rule_count`. A version that is not the one just read, or a version when none exists, is `reason: version mismatch` and `current_version` (null when none exists). Send `result.version` from `get_phase_entrypoint`, or `none` only when `exists` is false. The check is best effort: it compares against a read taken just before the PUT, a write by anyone else in between is overwritten, and the guard does not make the replace atomic.

**`invalid_arguments` on a rule whose action is not `redirect`** `add_rule` and `update_rule` refuse that rule, and `put_phase_entrypoint` refuses the rules array. The field is `rule` or `rules`. Send `action: redirect`.

**`list_records` empty while `export_zone` has a file** Use `export_zone` or `list_records` through this build's proxy path, not an older catalog mapping.

**`vendor_error` 413 on `/pages/assets/upload` with `reason: request too large`** An upload request of that size came back 413 through the provider's proxy, and `batch` says how large it was; which hop refused it is not reported. No deployment was created, though files from earlier batches (`batches_sent`) may already be stored. A retry sends requests of about the same size and is likely to meet the same refusal, so report the batch size rather than retrying; Wrangler, per `skills/Cloudflare Pages/SETUP.md`, is the fallback.

**`vendor_error` 403 on a `pages.d1_*` call while other Pages calls work** The D1 actions ride the `pages` grant, so the token connected as `pages` needs Account / D1 / Read, and Account / D1 / Edit for a write, beside its Cloudflare Pages permission. Edit the token at Cloudflare to add it; its value does not change and nothing is reconnected.

**`invalid_arguments` on `sql` from `pages.d1_query`, or `not a single SELECT statement`** `pages.d1_query` accepts one SELECT and nothing else. Use `cloudflare.pages.d1_execute` for a write or for more than one statement. A semicolon inside a string is still a semicolon to D1.

**`bundle carries bindings`** `pages.deploy_with_functions` refuses a bundle whose metadata `bindings` array is not empty. Put the binding on the project with `cloudflare.pages.bind_d1`.

**`binding not applied`** The PATCH answer did not show the binding id that was sent. The result does not say the binding is in place, and its `collateral_changes` still names any other setting the answer shows changed.

**`kit payload: use cloudflare.pages.deploy`** `dir` is a kit site's `site/dist`, any directory whose parent holds `kit.json`, or any directory inside a kit's `dist`. Deploy it with `pages.deploy`. `pages.deploy_with_functions` and `pages.deploy_static` both return this reason.

**`build.json assets is not dir`, `functions source overlaps dir`, or `missing build.json`** The Functions build was made for another directory, or from a source inside the one being published, or not by `tools/pages-functions/`. Build again with `--assets` set to this `dir` and `--functions` outside it.

**`path is not in normal form`** The path holds `.`, `..` or a repeated separator, or on Windows a `/`. Pass the resolved absolute path.

**`functions source in dir`, `build.json lists no sources`, or `build.json names no functions source by its real path`** A file being published has the same bytes as one of the Function's own source files, or the build's record is incomplete. Keep the `functions/` folder outside the build output and rebuild with `tools/pages-functions/`.

**`bundle part name is not plain ASCII`** A module in the bundle has a name outside letters, digits, `.`, `_`, `-` and `/`. Rename the source file and rebuild.

**`migration table not created` or `migration history unreadable`** A statement creating or reading `d1_migrations` failed, so the migration did not run. Nothing was applied.

**`deployment request over the 3 MiB limit`** The deployment multipart, as base64, is over 3 MiB. `bytes` is that length. On a kit deploy that carried the Function, the reason also names how many scheduled instants the Function carries and `scheduled_instants` is that count. Deploy with Wrangler: `wrangler pages deploy`. A Wrangler deploy of `dist/` carries no kit Function.

**`unlisted fingerprint`** `site/dist-function/_worker.js` is not a sha256 listed in `kit-function.json`. The deploy admits only a released kit Function. Rebuild the site with the kit that ships that file.

**`kit-function.json is missing` or `kit-function.json is malformed`** The allowlist beside the connector cannot be read, so every kit Function deploy is refused. A deploy with no `site/dist-function/` is unaffected. Restore the file that shipped with this connector.

**`unexpected entry`, `not a regular file`, `symbolic link`, `dist-function is a symbolic link`, or `missing` a required name** `site/dist-function/` must hold exactly `_worker.js`, `_routes.json`, `schedule.bin` and `function.json`, each a regular file. The reason names the entry. Remove the extra, the folder, or the link, and rebuild.

**`function.json hash mismatch`** `function.json` does not name the sha256 of `_worker.js`, `_routes.json` or `schedule.bin` as they were read. Rebuild so the record and the three files are from the same build.

**`kitVersion mismatch`** `function.json`, `site/kit.json`, and the fingerprint that matched `_worker.js` do not name one kit version. The Function was built for a different kit than `dist/`.

**`buildTime mismatch`** `function.json` `buildTime` is not the string in `site/.astro/kit-build.json`. The Function was built for a different build than this `dist/`.

**`missing build record`** or **`kit build record unreadable`** `site/.astro/kit-build.json` is missing, or it is not a regular file whose `buildTime` is a string. Rebuild, and do not replace `.astro` with a link.

**`_routes.json` is not the screened shape** The file is not JSON, has a key other than `version`, `include` and `exclude`, is not version 1, has an empty include, has more than 100 rules, has a rule that does not start with `/`, or has a rule longer than 100 characters. The reason names which. The deploy does not send it.

**`schedule.bin does not start with WKS1`** or **`schedule.bin header`** The data file does not open with `WKS1`, a big-endian length, and JSON whose `v` is 1. The deploy does not interpret the rest of the file, and it does not send a file that fails this screen.

**`bundle over 2 MiB`** The Worker bundle the connector built is over 2 MiB. Fewer scheduled instants have to be carried; the kit build keeps its data within 1.5 MiB and names any instant it leaves out, so this means the build was not the kit's.

**`file changed during deploy`** A file in `dist/`, a file in the directory `pages.deploy_static` is deploying, or one of the four files in `site/dist-function/`, changed between the first read and the deployment request. Nothing was created. Deploy again from a tree that is not being written.

**`working folder:`** `pages.deploy_static` refuses a working folder, and the reason names which form. `dir is a declared root` means `dir` itself holds an `AGENTS.md` whose frontmatter declares `root:` or `type:`. `dir is at the top level of a declared root` means the parent does. `unreadable AGENTS.md` means an `AGENTS.md` at `dir` or its parent is not a symbolic link, and it cannot be read or is not a regular file. A symbolic link named `AGENTS.md` is not a declared root. A name after `working folder:` is the entry as it is spelled: `AGENTS.md`, `CLAUDE.md`, `.git`, `zArchive`, a directory named `memory`, `.env`, or a name starting `.env.`, in any letter case, at the root of `dir`. The walk checks that root again. The same markers except a `memory` directory are refused anywhere below the root, and the reason carries the path, as in `working folder: docs/AGENTS.md`. A link is refused when any segment of its resolved path is one of those markers, and the reason names the link, as in `working folder: public.txt`. A hidden directory, `node_modules`, or a directory skipped for a key-shaped name is screened by name, not following links, and a marker inside it is refused by that marker's path. More than 20000 entries in that screening is `too large to screen`, naming the skipped directory. A directory the walk or the screening cannot read is `could not be screened`, naming that directory; nothing is published until it can be read. A declaration key may be indented with spaces or tabs, and a leading UTF-8 byte-order mark is ignored. An opening `---` with no closing `---` within the first 64 KiB, when the file is longer than that scan, is `unreadable AGENTS.md`. A directory named `memory` below the root is uploaded. A file named `memory` is not the marker. Higher ancestors than the parent are not examined. Publish the build output, not the project root, the envelope, or the owning root.

**`server code:` and `use cloudflare.pages.deploy_with_functions`** A file named `_worker.js`, `_worker.bundle`, or `functions-filepath-routing-config.json`, or a directory named `functions`, anywhere in `dir`, in any letter case, a server-code file inside a skipped directory, or a link whose target is one of those or sits under a `functions` directory. The reason is `server code:` plus that path, then `; use cloudflare.pages.deploy_with_functions`. Deploy that site with `pages.deploy_with_functions`. A static page under a `/functions/` path is refused too, and renaming that directory is the way through.

**`no uploadable files`** `pages.deploy_static`, and `pages.deploy`, walked the tree and found no asset to upload. `skipped` lists what was left out. An empty directory, or one whose every file was skipped, is this refusal. Nothing was deployed.

**`vendor_error` 403 with Cloudflare code 10000 on a Web Analytics action** `list_web_analytics_sites`, `enable_web_analytics`, or `delete_web_analytics_site` did not happen. Other Pages calls can still work. The usual cause is that the token connected as `pages` lacks Account / Account Settings. `provider_codes` carries 10000 and nothing else. Read covers the list and attaching a named site. Edit covers creating a site and deleting one. Account Settings Edit also lets the token update or delete the whole Cloudflare account, so add Edit only for that run and remove it afterwards. Editing keeps the token's value, so nothing is reconnected. The connector does not turn this 403 into another answer.

**`no such Web Analytics site`** `enable_web_analytics` was given a `site_tag` Cloudflare answers 404 for, or `delete_web_analytics_site` was. The field is `site_tag`. Nothing was written. List the account's sites and use a tag from that list. A site that was attached to a Pages project is gone once that project is deleted, because Cloudflare deletes it with the project.

**`project already sends to another Web Analytics site`** The project already sends to `current_site_tag`, and the call named a different one. Nothing else was called. This connector does not move a project from one site to another. Report the refusal.

**`analytics not applied`** Cloudflare answered the PATCH with `success: false`, or a re-read of the project, after an answer that did not show the setting or a PATCH that threw, shows the tag and token other than those sent. The result does not say analytics is on. `http_status`, when present, is from the thrown PATCH. `created_site_tag`, when present, is a site this call created and the project is not sending to. `collateral_changes` names any other setting the answer, or the re-read, shows changed.

**`analytics outcome unknown`** The PATCH answer did not show the setting, or the PATCH threw, and a second read of the project failed or did not show its `build_config` `web_analytics_tag`, so this result claims nothing about whether the project sends to the site. Read the project with `pages.get_project` before doing anything else. Do not delete a created site the project may be sending to. `created_site_tag`, when present, is a site this call created. `http_status` is from the PATCH.

**`in use by a Pages project`** `delete_web_analytics_site` read Pages projects and at least one names this `site_tag` in `build_config.web_analytics_tag`. `projects` lists each of those whose `name` is a string. Nothing was deleted. The check is best effort. A failed project listing is `vendor_error` and also deletes nothing. An incomplete listing, a `total_pages` that is present and not a whole number, or a row that is not an object or whose `build_config` is not an object, is `vendor_error` with `reason: project listing incomplete` and deletes nothing, because whether that project names the site cannot be read. The refusal is a stop to report, not a reason to look for another route.

**`action: already_on`** The project already carries a non-empty tag and a non-empty token for that Web Analytics site. The same `site_tag`, or no `site_tag`, was given, and nothing else was called. `host` is null, and `before_site_tag` is the current tag. Report it. Do not create another site. A tag with no token is `action: repaired`, not this.

## Reference

- How to connect: `auth.md`
- The gateway: `gateway/AGENTS.md`
- Cloudflare DNS records API: https://developers.cloudflare.com/api/resources/dns/subresources/records/
- Cloudflare Web Analytics API: https://developers.cloudflare.com/api/resources/rum/
