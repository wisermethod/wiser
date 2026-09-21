---
name: usebouncer
type: connector
category: communication
description: Reads verification credits, verifies single addresses and batches, and resumes batch results by identifier
version: 0.2.0
---

# Bouncer

Reads verification credits, verifies single addresses and batches, and resumes batch results by identifier.

## Status

Shipped 2026-09-08. Fake-provider checks only; no live grant or execute yet. See `auth.md` for the human connect steps and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
usebouncer.verify.credits  {  }
usebouncer.verify.single  { email }  confirmation: always
usebouncer.verify.bulk  { emails }  confirmation: always
usebouncer.verify.status  { id }
usebouncer.verify.download  { id }
```

Read `usebouncer.verify.credits` and estimate the requested address count before submitting. `bulk` takes `{ emails: [{ email }] }` and returns the vendor object including `batchId`; keep that identifier in the owning work record, then use `status` and `download` with `{ id }` to resume. Results preserve vendor fields including `status`, `reason`, `domain.acceptAll`, `domain.disposable`, `account.role`, and `retryAfter` when supplied. This connector supplies no list hygiene policy and writes no files.

## Credentials

Access is a bound file through the local-file provider, named by `--secret usebouncer=<abs file>` or the Provides key `secrets:usebouncer`. The gateway attaches the key; this module holds none.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `verify` | write | `credits`, `single`, `bulk`, `status`, `download` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `verify.single` | Verify one address using credits | always |
| `verify.bulk` | Submit addresses for billed batch verification | always |

Spent credits cannot be recovered by this connector.

**Both billed actions confirm on every call, not once per session.** `standards/script-contract.md`
and `skills/Connector Author/` both put an action that spends under `always`, and these two were
`once` until 2026-09-20. `once` is remembered per action, so the second batch of a session ran
with no stop at all, and the approval a person gave was for a different batch and a different
cost. `skills/List Hygiene/` had always put the balance, the address count and the estimate in
front of the user before calling, but that is a courtesy in one skill and a caller that is not
that skill got neither.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://docs.usebouncer.com/api-reference/batch/batch-results
