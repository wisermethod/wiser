# Connecting Cloudflare

Each module is its own grant. **One blueprint per toolkit, not per module**, and for a toolkit the provider already ships there is nothing to prepare: the gateway creates the blueprint on the first connect that finds none. A second blueprint on one toolkit makes every module on that toolkit unconnectable until it is removed, with a `vendor_error` naming the toolkit and the count. The one this connector uses is **Cloudflare Api Key**, with a single API token field; the other, **Cloudflare**, asks for an email plus a Global API Key and will fail 9106.

Do not paste a token into the conversation.

## On Cloudflare's side

Make an API token (not a Global API Key). A token's permissions can be changed later by editing it at Cloudflare (My Profile, API Tokens, the token's Edit). Editing keeps the token's value, so a module already connected keeps working and nothing is reconnected. Rolling the token issues a new value.

| Module | Token needs |
|--------|-------------|
| `dns` | Zone / DNS / Edit on the named zone or zones |
| `zones` | Zone / Zone / Read, or an account-wide list of zones. `create` and `delete` need Zone / Zone / Edit. `get_settings` and `get_setting` need Zone / Zone Settings / Read. `update_setting` needs Zone / Zone Settings / Edit. `get_bot_management` needs Zone / Bot Management / Read. `list_certificate_packs` needs Zone / SSL and Certificates / Read. `list_workers_routes` needs Zone / Workers Routes / Read. `list_access_apps` needs Account / Access: Apps and Policies / Read (on an account where Access was never enabled it answers `access_enabled: false`, which needs no permission to mean) |
| `pages` | Account / Cloudflare Pages / Read for list and get, and for `list_domains` and `get_domain`. Edit for `create_project`, `add_domain`, `remove_domain`, `delete_project`, `deploy`, `bind_d1`, `deploy_with_functions`, `deploy_static`, `enable_web_analytics`, and `retry_domain_validation`. A Read-only token returns 403 on those ten. The D1 actions ride this same grant: Account / D1 / Read for `d1_list_databases`, `d1_get_database`, and `d1_query`, and Account / D1 / Edit for `d1_create_database`, `d1_execute`, `d1_apply_migration`, and `d1_delete_database` (Cloudflare's API reference calls Edit "D1 Write"). A token without the D1 permission returns 403 on those seven and nothing else. The Web Analytics actions ride this same grant and need Account / Account Settings: Read for `list_web_analytics_sites` and for `enable_web_analytics` attaching a named site, and Edit for `enable_web_analytics` creating a site and for `delete_web_analytics_site`. Account Settings Edit also lets the token update or delete the whole Cloudflare account, so keep Read on the token, add Edit only for a run that creates or deletes a site, and remove it afterwards. Editing keeps the token's value, so nothing is reconnected. A token without Account Settings returns 403 on those three, with Cloudflare's code 10000, and nothing else. `deploy_static` and `enable_web_analytics` also need Account / Cloudflare Pages / Edit, which the list above already includes |
| `rulesets` | Zone `list` and `get_phase_entrypoint` on `http_request_dynamic_redirect` need Zone / Single Redirect / Read (Dynamic URL Redirects). Zone `put_phase_entrypoint`, and a zone redirect ruleset's `add_rule`, `update_rule`, `reorder_rule` and `remove_rule`, need Zone / Single Redirect / Edit. `get_phase_entrypoint` on another phase needs that phase's Read: Zone / Config Rules / Read for `http_config_settings`; Zone / Transform Rules / Read for `http_request_transform`, `http_request_late_transform` and `http_response_headers_transform`; Zone / Cache Rules / Read for `http_request_cache_settings`; Zone / Origin Rules / Read for `http_request_origin`; Zone / Zone WAF / Read for `http_request_firewall_custom`. A `get_phase_entrypoint` phase outside the ones named in this cell needs the Read permission Cloudflare names for that product. For example, `http_ratelimit` and `http_request_firewall_managed` need Zone / Zone WAF / Read. `list_page_rules` needs Zone / Page Rules / Read, or Zone / Zone / Read. Account `list` needs Account / Account Rulesets / Read. Account `get_phase_entrypoint` on `http_request_redirect` needs Account / Bulk URL Redirects / Read (Mass URL Redirects). Account `put_phase_entrypoint` needs Account / Bulk URL Redirects / Edit (Mass URL Redirects) and Account / Account Rulesets / Edit. An account redirect ruleset's `add_rule`, `update_rule`, `reorder_rule` and `remove_rule` need Account / Bulk URL Redirects / Edit. `add_rule`, `update_rule`, `reorder_rule`, `remove_rule` and `delete` read the target ruleset and send the write only when its phase is the redirect phase for that scope. A ruleset in any other phase is refused before the write. `list_lists`, `list_list_items` and `get_bulk_operation` need Account / Account Filter Lists / Read (Account Rule Lists). `create_list`, `add_list_items`, `remove_list_items` and `delete_list` need Account / Account Filter Lists / Edit |

One wider token can serve several modules. The four Cloudflare modules are connected separately. Where they were all connected with the same token, one edit to that token serves all four. You still connect each module on its own and paste that same token on each hosted page. **Extra permissions on one grant do not unlock another**: a token connected as `dns` does not serve `zones`, and `pages` needs Account / Cloudflare Pages in its own right, even when that shared token already holds the permission. A 403 on a Pages call from a token that works for DNS is that, and not an outage.

`pages.add_domain` registers the hostname on the Pages project and does not create the DNS record. That record needs Zone / DNS / Edit, which is the `dns` grant, and Zone Publisher is the skill that publishes it. A Pages Edit token does not do that job.

Keep the create-token page open; the value is shown once.

## On the provider's side

Use the **Cloudflare Api Key** blueprint. Do not make **Cloudflare** (email plus Global API Key), and do not click dashboard Connect Account.

## Through the gateway

1. Name the module: "Connect Cloudflare DNS", "Connect Cloudflare zones", "Connect Cloudflare Pages", or "Connect Cloudflare rulesets". The D1 and Web Analytics actions ride the Pages connection and take no connect of their own.
2. The skill runs `start_connect` with `service=cloudflare` and that module.
3. Open the link. The page asks for the API token only. Paste it there.
4. `connect_status`. On `ACTIVE`, that module's actions run.

## The route this connector does not use

A credential file or token in chat is not a route. Use the API-token-only hosted page through the gateway's provider; [gateway/SETUP.md](../../gateway/SETUP.md) links its setup.

## Finding ids

- **zone id**: zone Overview, right-hand column, or `cloudflare.zones.list`.
- **account id**: `cloudflare.zones.list_accounts`, then Pages, D1 and Web Analytics calls take it as `account_id`.
- **database id**: `cloudflare.pages.d1_list_databases`, then D1 calls take it as `database_id`.
- **site tag**: `cloudflare.pages.list_web_analytics_sites`, then `enable_web_analytics` and `delete_web_analytics_site` take it as `site_tag`.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. At Cloudflare, roll or delete the token. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Yes.
