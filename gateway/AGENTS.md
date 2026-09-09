# Gateway

The one process a harness attaches to reach an outside account through this plugin. `standards/primitives.md` defines the connector type it serves; `gateway/SETUP.md` says how a person attaches it; `gateway/providers/AGENTS.md` says how a provider plugs in. This file is the gateway's write inventory and its contract with the rest of the root.

## What the gateway is

Not a primitive. Skills and experts invoke connectors by action id, `service.module.action`, and the gateway is how those ids are served: it loads every connector's manifest and module, resolves each id in a fixed order, applies the policy, and either runs the action or answers with a status object that names the next step. It holds no credential. The provider holds the grant; the local-file provider reads a bound credential file and hands the module nothing.

## Everything the gateway writes, and where

**This is the authoritative list for the gateway and the connectors it loads.** `tools/AGENTS.md` carries the inventory for tools and points here; neither restates the other.

| What | Where | When |
|------|-------|------|
| The connection store: our id, service, module, privilege, provider, provider account id, scopes, status, dates. Never a token | `~/.wiser/gateway/connections.json`, mode 0600 in a 0700 directory, outside this plugin, or the directory `--home` names | On `connect_status` when a grant is active, and on revoke |
| The audit log, one JSON line per `execute`, `start_connect` and `connect_status`, including the ones that stopped: time, harness, role, op, action, service, module, privilege, resolution path, provider account id, status, duration, correlation id. No input, no output, no header | `~/.wiser/gateway/audit.jsonl`, same modes | Every call |
| A local user id, `wiser-<uuid>`, which is what the provider sees as the user. Not a name, not an address | Inside `connections.json` | First run |
| A policy override, if the person writes one | `~/.wiser/gateway/policy.json` | Only by the person; the gateway reads it and never writes it |
| The auth provider project key | The platform user-config path `SETUP.md` names (`auth-provider.env`) | On first serve with no `--env`, the gateway creates the directory (0700) and an empty `WISER_AUTH_PROVIDER_KEY=` template (0600) if missing. It never overwrites an existing file and never writes a key value. After that it only reads |

`--home` is canonicalised before any of that is written, and refused inside this plugin, inside the directory that holds `--env` or a `--secret` file, under `--secrets`, or on a symbolic link; the store and audit files refuse to write through a symbolic link as well.

Nothing is written inside this plugin. The gateway has no dependencies, so it installs nothing, and a connector module may not install anything either.

**Three things the gateway never writes**, stated because their absence is the design: a secret value, anywhere; the input or output of an action, anywhere; a file inside the plugin. An empty `KEY=` template at the default path is not a secret value.

## What a connector module receives, and may do

A module is `connectors/<service>/index.js`, exporting `modules`, a map of module name to a map of action name to `async (input, ctx) => result`. The manifest beside it declares every action the gateway will serve; the validator refuses a module that exports more or fewer.

`ctx` carries `service`, `module`, `action`, `input`, and four capabilities:

| Capability | What it does | When it exists |
|------------|--------------|----------------|
| `ctx.catalog(actionId, input)` | Runs the provider's own tool for this id, mapped by the provider adapter. The module never sees the slug | When the module's `auth.provider` is `catalog` |
| `ctx.proxy({ endpoint, method, body, parameters, binary_body })` | An authenticated HTTP call the provider makes on the module's behalf. The provider enforces its own same-domain rule | Same |
| `ctx.http(request)` | A direct HTTPS call with the credential attached by the gateway. The module never sees the value. HTTPS only, to a host the manifest's `auth.hosts` lists, and a redirect is refused rather than followed | Only when the manifest says `unwrap_token: true`, lists `auth.hosts`, and the provider can unwrap; in v1 that is the local-file provider |
| `ctx.audit(note)` | Reserved. The audit line is a closed field set so a module cannot put a secret on it; in v1 the call is accepted and the note is dropped | Always |

A module imports Node built-ins and files inside its own directory, and nothing else. It never imports a provider, never reads a credential file, never names a provider slug, and never writes a file. What it needs beyond `ctx`, it does not need.

## The resolution order

Code, in `src/resolve.js`: a connector module that declares the action; else a registered first-party MCP, which v1 stubs; else the catalog through the mapping; else `needs_connector`. The order is not configurable, because a person reading a status needs to know which step answered.

## Roles and policy

`--role` selects `runtime` or `readonly`; `policy.default.json` decides what each may do, and `~/.wiser/gateway/policy.json` replaces those rules if present. Any other value, including `setup`, is refused. The one row a multi-user deployment flips is `startConnect` for `runtime`: on a laptop the person talking is the person connecting, and the shipped default allows it.
