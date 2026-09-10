---
name: vercel
type: connector
category: development
description: Reads projects and deployments and creates a deployment only with confirmation on every call
version: 0.1.0
---

# Vercel

Reads projects and deployments and creates a deployment only with confirmation on every call.

## Status

Shipped 2026-09-08. Live connect 2026-09-08: `projects` and `deployments` ACTIVE. Catalog lists `{ projects, pagination }` and `{ deployments, pagination }`. `create` not run. Fake-provider tests still run. See `auth.md` and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
vercel.projects.list  { team_id?, limit? }
vercel.projects.get  { id_or_name, team_id? }
vercel.deployments.list  { project_id?, team_id?, limit? }
vercel.deployments.create  { name, project?, files?, git_source?, target?, team_id? }  confirmation: always
```

Projects and deployments are separate grants, both write-capable. All actions use the catalog. `team_id` or `slug` selects the team. Inputs use the manifest names, remapped to catalog field casing. Deployment creation maps to the current create action; the older create action is deprecated. Deployment creation can publish and requires confirmation always. Reads do not require confirmation. This connector does not read or modify environment variables or delete projects.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `projects` | write | `list`, `get` |
| `deployments` | write | `list`, `create` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `deployments.create` | Publish a deployment | always |

Spent credits cannot be recovered by this connector.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://vercel.com/docs/rest-api
