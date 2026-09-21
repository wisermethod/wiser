---
name: {{SERVICE}}
type: connector
category: {{CATEGORY}}
description: The directory a new connector is copied from, with one read action and one confirmed write action wired through the gateway and every placeholder named
version: 0.3.0
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

Scaffold, until the connector ships.

This section records **when the connector shipped and how it was verified**, and nothing else.
**Do not record a grant state, an account, a person, a machine or a harness here**, and in
particular do not write that a module is ACTIVE or that a live connect happened on a date. That
is one person's store; it is wrong the moment anybody else reads it, and this repository is
public. Which actions were executed live and what each returned is worth keeping and belongs in
this repo's build workspace. `connectors/clarity/CONNECTOR.md` is the model form.
`gateway/test/guide-conformance.test.js` fails on a shipped guide that breaks this. Decided
2026-09-20, after sixteen of twenty-five shipped guides were found stating a grant.

## Reaching it

Through the gateway, by action id. List every action with its input and, where it is gated, its confirmation.

```
{{SERVICE}}.{{MODULE}}.get      { id }
{{SERVICE}}.{{MODULE}}.update   { id, ...fields }     confirmation: once
```

**What this section says and what the manifest says are the same rule twice, and they are kept the same by a gate.** `standards/script-contract.md` Published input schema binds the manifest: every action declares `additionalProperties: false`, a conditional requirement is published with `oneOf` or `anyOf`, and a length bound counts code points. The gateway applies it before the module runs, and `gateway/test/agreement.test.js` fails when a module enforces a rule its schema does not publish or a schema publishes a rule nothing applies. A rule no schema can carry, such as a path that must exist on this machine, goes in the action's `description` and in this document, and it is the only kind that belongs in prose alone.

## Credentials

This connector holds none. Say where the grant lives (the gateway's provider, or a bound file through the local-file provider), and say there is no credential file here and no `secrets:{{SERVICE}}` key unless the manifest's provider is `local-file`, in which case declare that key in the frontmatter above and name the file in the manifest.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `{{MODULE}}` | `{{PRIVILEGE}}` | `get`, `update` |

A grant is per module. A second module is a second row here, a second block in the manifest, and a second connect.

## Destructive Actions

A table of every action that deletes, overwrites, sends, spends or publishes, with its effect on the platform and whether the platform can undo it, and its manifest `confirmation`. **Deleting, overwriting, sending and publishing are `always`. Spend is judged by whether the action's own published `input` schema bounds the worst case of one call**: `none` when every cost-driving input carries a declared upper bound (`maximum`, `maxItems`, `maxLength`, or an `enum`), so one call's worst case is a small stated amount, and this table states that worst case, not only the base rate; `always` when any cost-driving input is unbounded by its own declaration, or when the price is not published at all. **Where both limbs apply, `always` wins**: a bounded worst case does not buy an exemption for an action that also deletes, overwrites, sends or publishes. Use `once` only for other writes whose effect warrants one approval. `skills/Connector Author/` step 4 and `experts/Connector Advisor/` step 3 carry the same rule and this table must agree with them. "None" is a legitimate entry, and a connector with none says so and says what on the platform it excluded to keep it that way.

## Troubleshooting

One entry per status a person will actually meet, each ending in the one next step. `needs_connect` always; `vendor_error` by the status codes this platform actually returns; anything this platform does that reads like an error and is not.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- What the published input schema must say, and who applies it: `standards/script-contract.md` Published input schema
- The platform's API reference, by URL
