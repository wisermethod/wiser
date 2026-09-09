---
name: {{SERVICE}}
type: connector
category: {{CATEGORY}}
description: The directory a new connector is copied from, with one read action and one confirmed write action wired through the gateway and every placeholder named
version: 0.1.0
---

# {{SERVICE_TITLE}}

One sentence on what this platform is for the person, and one on what this connector reaches of it. Then the boundary: what on this platform this connector does not touch, and which other connector or module does.

## Placeholders

Every one is substituted before the directory lands, and a search of the finished directory for `{{` returns zero.

| Placeholder | Meaning |
|-------------|---------|
| `{{SERVICE}}` | The directory name and the first segment of every action id; lowercase, hyphens |
| `{{SERVICE_TITLE}}` | The platform's name as written in prose |
| `{{MODULE}}` | The first module; a resource domain, not the whole API |
| `{{TOOLKIT}}` | The provider's name for this platform, which appears in `manifest.json` under `auth.toolkit` and nowhere else |
| `{{SCHEME}}` | `OAUTH2`, `API_KEY`, `BEARER` or `BASIC`, in the platform's own terms |
| `{{PRIVILEGE}}` | `read`, `write` or `admin`, the most this module's grant can do at the vendor, not the risk of the actions currently listed |
| `{{CATEGORY}}` | Frontmatter category; lowercase letters and hyphens; reuse one the family already has |
| `{{AUTH_PROVIDER}}` | `catalog` or `local-file`, never an adapter name |

## Status

Scaffold, until the first connect is recorded in `auth.md`.

## Reaching it

Through the gateway, by action id. List every action with its input and, where it is gated, its confirmation.

```
{{SERVICE}}.{{MODULE}}.get      { id }
{{SERVICE}}.{{MODULE}}.update   { id, ...fields }     confirmation: once
```

## Credentials

This connector holds none. Say where the grant lives (the gateway's provider, or a bound file through the local-file provider), and say there is no credential file here and no `secrets:{{SERVICE}}` key unless the manifest's provider is `local-file`, in which case declare that key in the frontmatter above and name the file in the manifest.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `{{MODULE}}` | `{{PRIVILEGE}}` | `get`, `update` |

A grant is per module. A second module is a second row here, a second block in the manifest, and a second connect.

## Destructive Actions

A table of every action that deletes, overwrites, sends, spends or publishes, with its effect on the platform and whether the platform can undo it. Each is `confirmation: always` in the manifest. "None" is a legitimate entry, and a connector with none says so and says what on the platform it excluded to keep it that way.

## Troubleshooting

One entry per status a person will actually meet, each ending in the one next step. `needs_connect` always; `vendor_error` by the status codes this platform actually returns; anything this platform does that reads like an error and is not.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- The platform's API reference, by URL
