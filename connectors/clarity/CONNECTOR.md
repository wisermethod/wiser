---
name: clarity
type: connector
category: analytics
description: Exports Clarity metrics for the last one, two, or three days
version: 0.1.0
---

# Microsoft Clarity

Exports Clarity metrics for the last one, two, or three days.

## Status

Shipped 2026-09-08. Fake-provider checks only; no live grant or execute yet. See `auth.md` for the human connect steps and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
clarity.analytics.export  { numOfDays, dimension1?, dimension2?, dimension3? }
```

`numOfDays` must be 1, 2, or 3, covering the last 24, 48, or 72 hours. Optional `dimension1`, `dimension2`, and `dimension3` group the export. The result is the catalog metrics object.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `analytics` | read | `export` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

None. This version only reads and ships no destructive actions.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
