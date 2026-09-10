---
name: stripe
type: connector
category: development
description: Reads customers and charges through one billing grant
version: 0.1.0
---

# Stripe

Reads customers and charges through one billing grant.

## Status

Shipped unconnected. Verification is fake-provider only, with invented results. Catalog contract from the approved plan dated 2026-09-09; live envelope UNVERIFIED. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `stripe.billing.list_customers` | `email?`: string, `limit?`: integer, `starting_after?`: string, `ending_before?`: string | none |
| `stripe.billing.get_customer` | `customer_id`: string | none |
| `stripe.billing.list_charges` | `customer?`: string, `limit?`: integer, `starting_after?`: string, `ending_before?`: string | none |
| `stripe.billing.get_charge` | `charge_id`: string | none |

Customers and charges share the single `billing` grant.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `billing` | read | `list_customers`, `get_customer`, `list_charges`, `get_charge` |

## Excluded

Create customers or charges, refunds, payouts, subscription writes, invoice writes, and payment intents.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `stripe` / `billing` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
