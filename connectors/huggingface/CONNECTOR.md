---
name: huggingface
type: connector
category: research
description: Reads model information and lists dataset metadata
version: 0.1.0
---

# Hugging Face

Reads model information and lists dataset metadata.

## Status

Shipped 2026-09-09. Live connect 2026-09-09: `hub` ACTIVE, envelope UNVERIFIED. Verification otherwise fake-provider only. Catalog contract from the approved plan dated 2026-09-09. See `auth.md` for the separate human connect.

## Reaching it

Through the gateway's `execute` tool by action id. Required strings must be nonblank; declared types and enums are checked before catalog execution. Undeclared fields are refused with `invalid_arguments`.

| Action | Inputs (? means optional) | Confirmation |
|--------|---------------------------|--------------|
| `huggingface.hub.get_model` | `namespace`: string, `repo`: string | none |
| `huggingface.hub.list_datasets` | `search?`: string, `author?`: string, `limit?`: integer, `cursor?`: string | none |

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `hub` | read | `get_model`, `list_datasets` |

## Excluded

Generation, embeddings, inference endpoints, repository creation or deletion, commits, space writes, and dataset row retrieval.

## Credentials

The grant lives with the gateway's provider. This connector holds no credential and uses hosted connect only, per `auth.md`.

## Destructive Actions

None. This slice only reads.

## Troubleshooting

- `needs_connect`: use Connect Account for `huggingface` / `hub` in its own human turn.
- `invalid_arguments`: correct the named field using the action inputs above.
- `vendor_error`: give Connection Troubleshooter the gateway status object; live vendor envelopes remain unverified.

## Reference

- Connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Connector contract: `standards/primitives.md` Connector Bodies and `standards/script-contract.md` Connector Modules
