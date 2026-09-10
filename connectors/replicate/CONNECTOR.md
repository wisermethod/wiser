---
name: replicate
type: connector
category: media
description: Lists curated model collections, starts confirmed predictions, and returns prediction status and output URLs
version: 0.1.0
---

# Replicate

Lists curated model collections, starts confirmed predictions, and returns prediction status and output URLs.

## Status

Shipped 2026-09-08. Live connect 2026-09-08: `models` ACTIVE. Catalog `list_collections` `{ results, next, previous }`. `create_prediction` not run. Fake-provider tests still run. See `auth.md` and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
replicate.models.list_collections  {  }
replicate.models.create_prediction  { version, input }  confirmation: once
replicate.models.get_prediction  { prediction_id }
```

The module writes no files. `create_prediction` returns the catalog prediction object with an id; `get_prediction` returns status and output URLs when ready. The caller retrieves and files outputs. A prediction is billed and uses confirmation once; this connector does not infer a model or a version.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `models` | write | `list_collections`, `create_prediction`, `get_prediction` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `models.create_prediction` | Start a billed prediction | once |

Spent credits cannot be recovered by this connector.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://replicate.com/docs/reference/http
