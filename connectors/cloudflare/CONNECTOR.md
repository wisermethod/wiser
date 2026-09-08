---
name: cloudflare
type: connector
category: development
description: Reaches one Cloudflare zone's DNS records to list, export, create, update, delete, import, and batch them, with every removal confirmed
version: 0.1.0
---

# Cloudflare

The zone control plane for DNS, and the worked example of a connector that mixes stock catalog actions with proxied ones the catalog lacks. Reach for it to read a zone's records, pull the zone as a file, publish and change records, and land a set of changes together. Zone Publisher is its consumer.

Not for Cloudflare's developer platform, cache, encryption mode, mail routing, or redirect rules. Those are other modules or other connectors, and a redirect rule is a gap this connector declares rather than approximates.

## Status

Live connect 2026-09-08, operator, Grok with `wiser-gateway`: the `dns` module is ACTIVE. Catalog `list_records` and proxy `export_zone` on `agentfirst.ai` both fail vendor 400 (Cloudflare 9106). The operator's Cloudflare token is wider than `auth.md` documents for this module; extra permissions do not add actions. This module still only serves DNS. Tests still run against the fake provider.

Later modules, each its own grant, not this Playbook's v1 ship: `zones` (list every zone the token reaches), `pages`, `rulesets`. Skills cite those action ids. IT Expert owns zone and ruleset work; Pages ownership versus Webmaster is open.

## Reaching it

Through the gateway, by action id. The zone is always an input, never discovered, because a token that reaches several zones must not let whichever answered first decide.

```
cloudflare.dns.list_records    { zone_id, type?, name? }
cloudflare.dns.get_record      { zone_id, record_id }
cloudflare.dns.export_zone     { zone_id }                                  proxy
cloudflare.dns.create_record   { zone_id, type, name, content, ttl?, proxied?, priority? }   confirmation: once
cloudflare.dns.update_record   { zone_id, record_id, ...fields }            confirmation: once
cloudflare.dns.delete_record   { zone_id, record_id }                       confirmation: always
cloudflare.dns.import_zone     { zone_id, zone_file, proxied? }             confirmation: always, proxy
cloudflare.dns.batch           { zone_id, deletes?, patches?, puts?, posts? }   confirmation: always, proxy
```

## Credentials

This connector holds none. The grant is an API token you create at Cloudflare and give to the gateway's provider through its hosted page; `auth.md` says which permissions the token needs and how narrow to make it. There is no credential file and no `secrets:cloudflare` key.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `dns` | write | the eight above |

One module, one grant, scoped to the zones the token names. A later `zones`, `pages`, `rulesets`, `workers`, or `r2` module is a separate grant, never an extension of this one. `zones` is how a skill lists every domain the token reaches; `dns` still takes `zone_id` as an input and does not discover.

## Destructive Actions

| Action | Effect on Cloudflare | Undoable there? |
|--------|----------------------|-----------------|
| `delete_record` | Removes the record; an apex or service record stops resolving worldwide as caches expire | No. The answer returns the record it deleted, which is the only way back |
| `batch` | One payload of deletes, patches, puts and posts in that order, so every delete lands before any create | No. One transaction, but propagation is not atomic |
| `import_zone` | Bulk creation from a BIND file; `proxied` puts every imported record behind the proxy at once | No |

Each is gated `always`: the gateway returns `needs_confirmation` with the zone and the count of records affected, and runs only on the re-call that carries `confirm: true` after a person said yes. `update_record` and `create_record` are gated `once` per session.

## Troubleshooting

**`needs_connect`** The `dns` module is not connected. Run the Connect Account skill for `cloudflare` and `dns`.

**`vendor_error` with status 403** The token does not reach this zone, or lacks DNS edit. The token's permissions are fixed when it is made; make a new one per `auth.md` rather than widening an old one.

**`export_zone` returns something that is all comments** The zone has no records the token can read, or the token reaches the wrong zone. `list_records` on the same `zone_id` says which.

**`import_zone` refused by the provider** The content type the proxy sends for a file upload is unverified as of 2026-09-05 and is Milestone 3 evidence in the build Playbook. Until it is settled, `batch` with `posts` is the route for bulk creation.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- Cloudflare's DNS records API: https://developers.cloudflare.com/api/resources/dns/subresources/records/
