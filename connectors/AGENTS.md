# Connectors

Authenticated access to outside platforms; `standards/primitives.md` owns the type's definition, invocation rules, and frontmatter. The directory is flat, and the index below is grouped by category.

The index is **hand-maintained**. `standards/primitives.md` says a family index is generated from primitive frontmatter at release. This root carries no generator, so nothing generates this file: it is written by hand from the frontmatter of what actually shipped, and it is corrected by hand when a connector is added, removed, renamed, or recategorized.

## How a connector is reached

Not by running anything in its directory. The gateway, `gateway/server.js`, loads every directory here at start, and a skill or expert asks for an action by id, `service.module.action`, through the gateway's `execute` tool. `gateway/AGENTS.md` says what a connector module receives and may do, and `gateway/SETUP.md` says how a person attaches the gateway and connects an account.

A connector directory holds four things: `CONNECTOR.md`, the typed file; `manifest.json`, every module and action with its privilege, risk, confirmation and execution preference; `index.js`, the actions; and `auth.md`, what a person does on the vendor's side to connect. A `tests/` directory runs the module against the gateway's fake provider and touches no account.

## What a connector writes

Nothing. A module may not write a file, install a package, or read a credential; the gateway's inventory in `gateway/AGENTS.md` is the whole of what this family writes, and it is written by the gateway.

## Grants are per module

A connection record is keyed by service and module. Two modules on one service are two grants and two `needs_connect` stops, even where the vendor would have accepted one broader grant, because the provider holds one grant per toolkit and a record that pretends otherwise cannot be honoured. The facade is naming and shared scope, never a shared token.

## Adding one

`skills/Connector Author/` does this from an approved plan; `experts/Connector Advisor/` produces the plan. In use, the copy lands in the owning root's own `connectors/` and the gateway loads it with `--connectors`; this plugin is read-only in use, so a connector meant to ship here arrives by an authoring Playbook, never by a session. Copy `system/templates/Connector Template/`, never a connector from this directory. Every action id a primitive cites must resolve, and every action a manifest declares must exist in `index.js`; the gateway's `--check` refuses to start otherwise.

<!-- generated:index -->

### Development

| Connector | Description |
|-----------|-------------|
| `cloudflare/CONNECTOR.md` | Reaches one Cloudflare zone's DNS records to list, export, create, update, delete, import, and batch them, with every removal confirmed |
| `github/CONNECTOR.md` | Reaches one GitHub account's repositories and issues to read them, list them, and open an issue, and reports the authenticated account |

<!-- /generated:index -->
