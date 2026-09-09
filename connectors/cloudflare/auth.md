# Connecting Cloudflare

Each module is its own grant. The provider blueprint is **Cloudflare Api Key** (one API token field). A hosted page that asks for an email is the other blueprint, **Cloudflare**, and will fail 9106.

Do not paste a token into the conversation.

## On Cloudflare's side

Make an API token (not a Global API Key). Permissions are fixed when you make it.

| Module | Token needs |
|--------|-------------|
| `dns` | Zone / DNS / Edit on the named zone or zones |
| `zones` | Zone / Zone / Read, or an account-wide list of zones. `create` and `delete` need Edit |
| `pages` | Account / Cloudflare Pages / Read (Edit to change) |
| `rulesets` | Zone / Zone WAF or the rulesets permission for the zones you mean |

One wider token can serve several modules. You still connect each module separately and paste that same token on each hosted page. Extra permissions on the `dns` grant do not unlock `zones`.

Keep the create-token page open; the value is shown once.

## On the provider's side

One blueprint, **Cloudflare Api Key**, already created. Do not make **Cloudflare** (email plus Global API Key). Do not click dashboard Connect Account.

## Through the gateway

1. Name the module: "Connect Cloudflare DNS", "Connect Cloudflare zones", "Connect Cloudflare Pages", or "Connect Cloudflare rulesets".
2. The skill runs `start_connect` with `service=cloudflare` and that module.
3. Open the link. The page asks for the API token only. Paste it there.
4. `connect_status`. On `ACTIVE`, that module's actions run.

## The route this connector does not use

A credential file or token in chat is not a route. Use the API-token-only hosted page through the gateway's provider; [gateway/SETUP.md](../../gateway/SETUP.md) links its setup.

## Finding ids

- **zone id**: zone Overview, right-hand column, or `cloudflare.zones.list`.
- **account id**: `cloudflare.zones.list_accounts`, then Pages calls take it as `account_id`.

## Revoking

Revoke the module through the gateway, then at Cloudflare roll or delete the token.

## Last connected

2026-09-08, `dns`, `zones`, `pages`, and `rulesets` ACTIVE. The gateway's provider setup is in [gateway/SETUP.md](../../gateway/SETUP.md).

Supplied live evidence from the operator's 2026-09-08 session, recorded as shapes only:

- `dns.get_record`, confirmed proxy GET: `{ success, result: { id, name, type, content, ttl, ... }, errors, messages }`.
- `dns.list_records`, confirmed proxy GET: the same envelope with a `result` array and `result_info`.
- `dns.create_record`, confirmed proxy POST with confirmation: `{ success, result: { id, name, type, content, ttl }, errors, messages }`.
- `dns.update_record`, confirmed catalog execute with confirmation: `{ success, result, errors, messages }`; the module remaps `record_id` to `dns_record_id`.
- `dns.export_zone`, confirmed proxy: `{ zone_file }`, BIND text.
- `dns.batch`, confirmed proxy POST with confirmation: successful vendor data. The module now returns data only; transport headers are dropped.
- `zones.list` was already proven. No account or zone payload is copied here.
- `pages.list_projects`: confirmed proxy GET 2026-09-08 after the token gained Account / Cloudflare Pages / Edit. `{ success, result, errors, messages, result_info }` with an empty `result` array on every account `zones.list_accounts` returned (three). Operator: no Pages projects exist. `get_project` and `list_deployments` not run. An earlier 403 was a token without Pages permission; extra permissions on the `dns` or `zones` grant do not unlock `pages`.
- `rulesets`: grant ACTIVE. `create` without `confirm: true` returned `needs_confirmation` and wrote nothing. `get` with an invented id returned vendor_error HTTP 400 on catalog execute; live envelope UNVERIFIED. `delete`, `add_rule`, and `remove_rule` not run.

`dns.import_zone` JSON returned HTTP 400 on 2026-09-08. Multipart via `binary_body` confirmed live the same day: `{ success, result: { recs_added, total_records_parsed }, errors, messages }`, one TXT parsed and added, no headers on the result.
