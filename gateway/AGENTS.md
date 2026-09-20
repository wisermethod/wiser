# Gateway

The one process a harness attaches to reach an outside account through this plugin. `standards/primitives.md` defines the connector type it serves; `gateway/SETUP.md` says how a person attaches it; `gateway/providers/AGENTS.md` says how a provider plugs in. This file is the gateway's write inventory and its contract with the rest of the root.

## What the gateway is

Not a primitive. Skills and experts invoke connectors by action id, `service.module.action`, and the gateway is how those ids are served: it loads every connector's manifest and module, resolves each id in a fixed order, applies the policy, and either runs the action or answers with a status object that names the next step. It holds no credential. The provider holds the grant; the local-file provider reads a bound credential file and hands the module nothing.

## Everything the gateway writes, and where

**This is the authoritative list for the gateway and the connectors it loads.** `tools/AGENTS.md` carries the inventory for tools and points here; neither restates the other.

| What | Where | When |
|------|-------|------|
| The connection store: our id, service, module, privilege, provider, provider account id, scopes, status, dates. Never a token | `~/.wiser/gateway/connections.json`, mode 0600 in a 0700 directory, outside this plugin, or the directory `--home` names | On `start_connect`, which writes the row at INITIATED over whatever that service and module held; on `connect_status`, which writes the status the provider reports **only when the provider reported one and the row is still the row that was read**, including for a row whose connector has been retired, which then answers `needs_connector` with `reason: orphaned_record` rather than `connected` because nothing remains that can execute it. **Four cases write nothing and each is deliberate**: a provider that answers nothing a status can be read from, since there is no word to write; a row removed or rebound while the provider was being asked, since writing would undo a teardown or overwrite a newer binding; a `local-file` orphan, refused rather than guessed because the path lived in the missing manifest; and a declared module with a non-ACTIVE answer and no stored row, since there is nothing to update and a new row is created only on ACTIVE; on an execute that meets 401 or 403 and refreshes, on a local-file status check before execute, and on an unwrap failure, each of which may write an inactive status; and on hydration, for a module with no ACTIVE record. A provider outage writes nothing, so it cannot turn a working grant into `needs_connect`. **Rows are removed by `disconnect`, and by nothing else**, once the provider confirms the credential is gone; it removes every row holding that provider account, which is more than the module named |
| The audit log, one JSON line per `execute`, `start_connect`, `connect_status` and `disconnect`, including the ones that stopped: time, harness, role, op, action, service, module, privilege, resolution path, provider account id, status, duration, correlation id. No input, no output, no header | `~/.wiser/gateway/audit.jsonl`, same modes | Every call |
| A local user id, `wiser-<uuid>`, which is what the provider sees as the user. Not a name, not an address | Inside `connections.json` | First run, and again whenever the id in the environment differs from the stored one |
| A policy override, if the person writes one | `~/.wiser/gateway/policy.json` | Only by the person; the gateway reads it and never writes it |
| The auth provider project key and user id | The platform user-config path `SETUP.md` names (`auth-provider.env`) | On first serve with no `--env`, the gateway creates the directory (0700) and an empty `WISER_AUTH_PROVIDER_KEY=` plus `WISER_USER_ID=` template (0600) if missing. It never overwrites an existing file and never writes a key value. An existing file missing `WISER_USER_ID=` gets that empty line appended. A generated user id is written only into an empty `WISER_USER_ID=` line. After that it only reads |

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

## The published input schema, and who applies it

**The gateway applies it, once, for every connector, and no connector carries a validator of its own.** `execute` reads the action's `input` from the manifest and refuses a call that does not satisfy it with `invalid_arguments` and the name of the first field at fault. The code is `src/input-schema.js`, which states what it reads, `type`, `enum`, `pattern`, `minLength`, `items` and `required`, and what it leaves to the module, `maxLength`, `minimum`, `maximum`, `oneOf`, `anyOf` and anything nested. **A key `properties` does not declare is refused**, which is why every shipped action declares `additionalProperties: false`: the published schema and the applied rule say the same thing.

**Until 2026-09-20 nothing applied it.** `src/manifest.js` type-checks that `input` is an object and validated no call against it, so the module was the only enforcer and the schema was documentation. Eleven connectors carried a byte-identical copy of this code; the other fourteen hand-rolled their checks and held all 189 divergences `test/agreement.test.js` measured. A connector cannot import the gateway, because `--connectors <abs dir>` lets a connector directory sit anywhere on disk, so the choice was twenty-five copies or none.

**Where it sits in `execute` is a decision, and each side of it was measured.** After the policy, so a denied action's input is never inspected. After the grant checks, so a caller with no connection is told that rather than told about its arguments, which is the common case and the one the whole connect flow serves. Before the confirmation stop, so nobody is asked to approve a call that cannot run.

**`test/agreement.test.js` holds the two sides together.** It calls every shipped action behind this validator with a schema-valid instance and with one violation per declared constraint, and fails on a divergence in either direction. Its baseline may only shrink, so the file going empty is the class closing.

## What the confirmation stop shows, and what it does not

A `needs_confirmation` answer is the one place a person decides. **It carries the values of the declared fields the call was given**, so an approval names the thing being acted on rather than only the shape of the call. Before 2026-09-20 it carried field names and no values, and an approval of `services.enable` was an approval of enabling something somewhere.

The rule has three parts and they are separate on purpose.

**Eligibility** decides which values may appear: the key is declared in the action's `input.properties`, its declared type is scalar, and the supplied value matches that type. A field whose declaration permits `object` or `array` is ineligible even if it also permits a scalar. An **undeclared key is counted and nothing more**: neither its name nor its value appears anywhere in the answer, which is the guarantee this stop has always made.

**Validation** checks an eligible value against its own declaration before rendering it. A value that fails is withheld and named, because showing a person a value the call will then reject wastes their approval. Validation is **not** what makes the summary safe.

**Rendering** is what makes it safe, and it applies to every value whatever its schema says. A schema cannot be trusted for this: of the 122 declared fields across the shipped `confirmation: always` actions, 6 are bounded by their own declaration against control characters, and two connectors declare no pattern at all. So every value is escaped against the Unicode classes `Cc`, `Cf`, `Cs`, `Zl`, `Zp` and `Default_Ignorable_Code_Point`, plus the backslash and the double quote; capped, with a cut marked by the true length and a fingerprint; and fitted into a summary whose every component is budgeted so the 2000-character limit holds unconditionally.

**Three things it does not show, each a decision rather than a gap:**

- **The content of a nested input.** `keys.create` and `keys.patch` take `restrictions` as an object, so on those two actions the summary names the target and says in words that the change itself is not shown. A person approving reads the change from the call, not from the stop.
- **A value that fails its own declaration.** Named as withheld, with the keyword it failed.
- **Anything from an undeclared key.**

**Two of those three can no longer arise here, and the handling stays.** Since 2026-09-20 the published input schema is applied before this stop, so a value failing its own `pattern`, `enum`, `type` or `minLength` and an undeclared key are both refused with `invalid_arguments` and never reach a person. `withheld_fields` keeps `nested`, which no schema check decides, and `undeclared_fields` is structurally 0. The renderer goes on handling both, asserted in `test/confirmation-disclosure.test.js`, because `discloseInput` decides what a person is told and has to be safe on its own terms rather than on the strength of a caller having passed an earlier gate.

**What the refusal itself carries.** `invalid_arguments` names the field at fault, and for an undeclared key that field name is one the caller chose. That is the refusal shape every connector suite has asserted since the first validator shipped, and `AUDIT_FIELDS` has no `field`, so neither the name nor the value reaches `audit.jsonl`. Asserted, in `test/hardening.test.js`.

**Three residuals, stated so they are not mistaken for oversights.** A caller may put a secret into a declared free-form string and no rule here can tell; provider credentials cannot arrive that way, because they are attached in `src/context.js` and a module never receives one, but caller-supplied text is caller-supplied text. A homoglyph defeats every escape. And a truncated value's fingerprint is collision resistance, not uniqueness, and never confidentiality.

**It lives in `src/disclosure.js`**, not in `execute`. `execute` decides that a stop happens and on which of the three entry paths: `confirmation: always`, `confirmation: once` on its first call, or a policy rule whose effect is `confirm`. It does not decide what a person is told. **The policy is reached identically on all three**, which `test/confirmation-disclosure.test.js` proves; the third has no shipped example on its own, because every destructive action also declares `always`.

**None of it reaches the audit line.** `AUDIT_FIELDS` in `src/audit.js` is a closed set of thirteen names with no input field, and a test asserts a rendered value does not appear in `audit.jsonl`.

## Roles and policy

`--role` selects `runtime` or `readonly`; `policy.default.json` decides what each may do, and `~/.wiser/gateway/policy.json` replaces those rules if present. Any other value, including `setup`, is refused. The one row a multi-user deployment flips is `startConnect` for `runtime`: on a laptop the person talking is the person connecting, and the shipped default allows it.
