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

`skills/Connector Author/` does this from an approved plan; `experts/Connector Advisor/` produces the plan. After Connector Author writes the module, Connect Account is the human grant in its own turn. In use, the copy lands in the owning root's own `connectors/` and the gateway loads it with `--connectors`; this plugin is read-only in use, so a connector meant to ship here arrives by an authoring Playbook, never by a session. Copy `system/templates/Connector Template/`, never a connector from this directory. Every action id a primitive cites must resolve, and every action a manifest declares must exist in `index.js`; the gateway's `--check` refuses to start otherwise.

<!-- generated:index -->

### Development

| Connector | Description |
|-----------|-------------|
| `cloudflare/CONNECTOR.md` | Reaches Cloudflare DNS, the account's zones, Pages, and rulesets, with every removal confirmed |
| `github/CONNECTOR.md` | Reaches one GitHub account's repositories and issues to read them, list them, and open an issue, and reports the authenticated account |
| `vercel/CONNECTOR.md` | Reads projects and deployments and creates a deployment only with confirmation on every call |

### Analytics

| Connector | Description |
|-----------|-------------|
| `google/CONNECTOR.md` | Reads search performance, analytics reports, Drive files, Calendar events, and Gmail messages through five separate grants |
| `clarity/CONNECTOR.md` | Exports Clarity metrics for the last one, two, or three days |

### Communication

| Connector | Description |
|-----------|-------------|
| `usebouncer/CONNECTOR.md` | Reads verification credits, verifies single addresses and batches, and resumes batch results by identifier |

### Media

| Connector | Description |
|-----------|-------------|
| `replicate/CONNECTOR.md` | Lists curated model collections, starts confirmed predictions, and returns prediction status and output URLs |
| `google-vision/CONNECTOR.md` | Detects faces and returns eye coordinates for faces with both eyes available |

### Research

| Connector | Description |
|-----------|-------------|
| `courtlistener/CONNECTOR.md` | Read CourtListener case law search, one docket, one opinion cluster, and the courts list |
| `tinyfish/CONNECTOR.md` | Search the web and fetch content from up to ten HTTPS URLs through Tiny Fish |

<!-- /generated:index -->
