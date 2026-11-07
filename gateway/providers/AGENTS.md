# Providers

How the gateway reaches an account without holding its credential. Two interfaces, one directory per adapter, and one file naming the default.

`default.json` names the adapter for each interface. `--provider <name>` on the gateway overrides it. Nothing outside an adapter's own directory may name the adapter, and the release gate greps for it.

## AuthProvider

Holds the grant, or knows where the person's own credential file is. One adapter per directory, exporting `createAuthProvider({ envPath, secretsDir })`.

| Method | Returns | Contract |
|--------|---------|----------|
| `name` | the adapter's directory name | |
| `setupText()` | plain text a person follows to make this adapter work | **The short form**, and the only provider words that reach an answer: the gateway puts it on `needs_provider` as `setup` and repeats it verbatim. It says what to do next in a few sentences, without a dashboard walkthrough. **An adapter owes this and a `SETUP.md`, and they are two jobs**; see `Adding one` |
| `initiate({ userId, service, module, toolkit, scheme, file, variables })` | `{ kind: "link", url, providerAccountId }` or `{ kind: "file", path, variables }` | Never completes a grant; never accepts a key |
| `status({ providerAccountId })` | `ACTIVE`, `INITIATED`, `EXPIRED`, `FAILED`, `INACTIVE` or `ABSENT`, or `{ status, error: { code, endpoint, method } }` | The gateway writes an ACTIVE record only on `ACTIVE`, and records any other word on the row as the reason it stopped. **`ABSENT` means the provider says this account is not there. `INACTIVE` means the grant is not usable and is not known to be gone**, which covers a switched-off hosted account and equally a `local-file` credential whose file is missing, since neither establishes that anything was revoked. An error object is a transport or provider failure and not a grant state, and the gateway leaves the record untouched on one |
| `proxy({ providerAccountId, toolkit, endpoint, method, body, parameters, binary_body, response_headers }, { proxyBodyMaxBytes }?)` | `{ status, data, headers? }` or `{ status, error: { code, endpoint, method } }` | Response headers are dropped except the closed set (`location` and `range`) an action declares as `response_headers`, returned as `headers` on success only. `gateway/src/response-headers.js` holds the set and the 8,192-character value cap; an over-cap value or one holding a control character is left out whole. The gateway's context applies the same filter, so an adapter that returns more delivers nothing more. A delivered `location` is treated as a secret for the rest of the call. Never the vendor's body on failure; the same-domain rule is enforced here if the provider has one. **`parameters` is an array of `{ name, value, type }` where `type` is `header` or `query`, and it is not the SDK-documented `in` key, which the REST API rejects outright.** Settled 2026-09-17 by a four-arm probe against the real API, including a deliberately wrong digest to prove the header value reached the vendor, because two vendor documentation pages disagreed. Confirm a header shape against the API rather than against a repository fixture, which can encode a shape the API refuses. The hosted provider's measured proxy request-body ceiling lies between about 3.8 MB (passed) and 5.7 MB (HTTP 413), its upload route is no larger than its JSON route, and `binary_body` also travels as base64 inside JSON; measure each connector's size limit through `ctx.proxy`, never take it from the vendor's documentation or infer the refusing hop from a 413 whose vendor body is withheld |
| `unwrap({ providerAccountId })` | `{ supported: false }` or `{ supported: true, header, value }` | The value goes to the gateway's `context.js` and nowhere else; a module never receives it |
| `revoke({ providerAccountId })` | `{ supported, how?, steps }`, and `{ status, error: { code, endpoint, method }, supported, steps }` when the **final** step fails | `steps` is an ordered list of `{ step, status, ok }`, one per call the adapter made, and it is **required even when empty**. A status code and a step name and never a vendor body, per `standards/script-contract.md`. **A top-level error reports the final step only; an earlier step failing shows as `ok: false` in `steps` and nothing else, so a caller must read every step rather than the error alone.** An adapter that cannot revoke answers `supported: false` with `how` and `steps: []` |
| `listAccounts({ userId, states })` | an array of `{ id, toolkit, status }`, one per account the provider holds for that user, `toolkit` null where the provider names none | **Every page, or a rejection: never a partial list, and never `[]` for a listing that could not be read**, so `[]` means none. `states` omitted lists ACTIVE accounts only, which hydration uses. `states: 'all'` lists every account in every state and every sharing model the provider holds for that user, for a caller that must find every credential, such as an account deletion; a page count that is not a number, or one that says a page was not read, is a rejection. Each account carries those three fields and nothing else. A rejection that followed a request carries `listingRequest` as `{ status, endpoint, method }` for that request, `endpoint` its path without the query, and nothing from its body, so no cursor the provider sent and no user id reaches a caller. Optional: an adapter with no listing omits it, and a caller treats its absence as nothing to list |

### Optional exact proxy measurement and request budget

`measureProxyBody(request)` is optional and returns a nonnegative safe-integer UTF-8 byte count, or `{ supported: false }`. It uses the adapter's own proxy preparation and JSON serialization: the context-bound account id, method default, actual body/base64 `binary_body`, parameters and escaping all count in the outer JSON body. Outer HTTP headers do not count. It makes no network call, quota charge, grant initiation or transport observation and exposes no payload or client. An adapter may omit it; existing unbudgeted operations remain usable. Context converts missing, unsupported, throwing or malformed measurement to `needs_provider_capability`, without error text or transport. The local-file adapter continues refusing proxy; the interface stub's existing methods remain stubs. Both omit measurement as unsupported.

`gateway/AGENTS.md` owns the action's optional `proxy_body_max_bytes` positive safe integer, validated at load and `--check`. Context passes its snapshotted value only through `proxy`'s private second argument `{ proxyBodyMaxBytes }`, never through the module request. Every proxy call of that action, including an internal read, is bounded. No option means no new size limit or measurement dependency.

At send time the adapter prepares and serializes once, counts UTF-8 bytes of that immutable string, checks the inclusive budget and passes the identical string to transport. It never checks an object then serializes it again to send. A stale preflight count cannot authorize a changed request. Over-budget throws a gateway status signal containing only `{ status: 'vendor_error', reason: 'proxy_body_too_large' }`; an invalid private bound or an unmeasurable budgeted request throws only `{ status: 'needs_provider_capability' }`. No network, retry, substitute payload or raw error text follows either refusal. Under a 4,100,000-byte budget, the local check permits 4,100,000 bytes to reach transport and refuses 4,100,001 before transport; provider acceptance is separate, governed by the measured ceiling in the `proxy` row above.

### `ABSENT`, and why a sixth word rather than reusing `INACTIVE`

**Added 2026-09-20.** Until then a deleted account and a switched-off one both answered `INACTIVE`, in the composio adapter and in the test fake alike, so no caller could tell them apart. That matters because the gateway is gaining a teardown: a tool that removes the local row whenever the provider does not say `ACTIVE` would also remove the row for a grant that is merely suspended and is coming back. **Removal is gated on `ABSENT`, and on `ABSENT` being corroborated by the teardown's own final step succeeding.** The word alone is not enough: it is scoped to what this credential can see, so a project change or a visibility restriction reads the same way. An adapter that reports no steps at all has established nothing and the removal is refused.

An adapter reports `ABSENT` when the provider says this account is not there; for composio, an HTTP 404 on the account read. It does **not** report `ABSENT` for a transport failure, an outage, or a status word the provider never documented; those are the error object, which leaves the record alone.

**`ABSENT` means absent within the scope the gateway's own credential can see, and that is narrower than "deleted".** Composio's account-read reference documents 404 but does not say what it returns for an account outside the project, restricted by visibility, or named by a malformed id. If any of them answers 404, it reads as `ABSENT` here, and this adapter cannot tell which one it was. A stored id establishes what the gateway asked about; it does not establish project visibility. It is a safe reading for the gateway, whose own stored id is the only one it ever asks about, and **a build that gates a destructive removal on this word owes the narrower cases a check rather than inheriting the assumption.** Recorded 2026-09-20 by adversarial review; not verified at the vendor.

**`local-file` deliberately never returns `ABSENT`**, and a missing credential file stays `INACTIVE`. **The reason is what a missing file can and cannot establish**: `ABSENT` is a claim about a credential at a provider we asked, and a file that is not on this disk says nothing about whether anything upstream was revoked; the file may never have been written, or may be on another machine. A missing file is also recoverable by writing it, which is what `INACTIVE` already means.

*An earlier draft justified this by saying the adapter cannot revoke, so `ABSENT` could never gate a removal there. Adversarial review found that a non-sequitur: being unable to revoke does not imply being unable to observe absence. The reasoning above is the one that holds.*

**A `local-file` connection's `provider_account_id` is the credential's filename**, written by `startConnect`, not an account at any provider. Two consequences worth knowing before a second local-file connector ships. It is why `disconnect` can never remove such a row: the teardown is gated on `ABSENT`, which this adapter never returns. And **the filename is the namespace**, so two local-file modules declaring the same `auth.file` would be treated as one credential by anything that groups on that field, `disconnect` included. One local-file module ships today, `usebouncer/verify` on `usebouncer.env`, so nothing collides; **a second one must not reuse a filename.** Observed 2026-09-20 while checking an impossibility claim, not by a defect.

**`nango` is an interface stub and every method throws `not_implemented`.** It is uniform and therefore cannot diverge; whoever implements it builds to the table above, which is why the table changed rather than only the adapter that needed it.

### Why `revoke` reports each step

The composio teardown is two calls, a `POST /revoke` then a `DELETE`, and they fail independently. Measured at the vendor on 2026-09-19: a custom `API_KEY` toolkit answers the POST with 400 and "does not support programmatic credential revocation", and the DELETE then does the work. Until 2026-09-20 the adapter awaited that POST and discarded the result, so the caller saw `{ supported: true }` and the fact was invisible. **A caller deciding whether a credential is really gone needs to know which step did what**, and `supported` alone cannot carry it.

## CatalogProvider

Serves a provider's own tools behind our action ids. Exporting `createCatalogProvider({ envPath })`.

| Method | Returns |
|--------|---------|
| `search({ service, module, query })` | our action ids the provider can serve, from the adapter's mapping |
| `execute({ actionId, userId, providerAccountId, arguments })` | the tool's result, or `{ status, error }` with no body |
| `curated()` (optional, synchronous) | a frozen array of reviewed plain-data tool rows; absence means no curated actions |

A curated row needs no connector function. The gateway snapshots and validates the rows once, skips invalid entries at runtime and reports every invalid row in `--check`; `gateway/AGENTS.md` owns their safety table. Provider wrappers must pass this optional method through bound and synchronously. No id appearing more than once may enter the provider's curated slug map; every copy is invalid in the gateway. The gateway also requires `toSlug(row.id) === row.tool`, so rejected metadata cannot select a different tool to run.

The mapping between our ids and the provider's slugs is a table inside the adapter, `mapping.js`, in both directions. Curated rows live in that adapter's `curated.js`; `toSlug` and `execute` also serve their ids. The provider's `search` remains mapping-only; the gateway adds validated curated rows to `search_actions` locally. Slugs stay inside the adapter, apart from a manifest's `auth.toolkit`.

### Adding a curated row

Keep `curated.js` data only, in reviewed order. Each row carries:

| Field | Source and meaning |
|-------|--------------------|
| `id` | A unique `service.module.action` under an existing catalog-authenticated module, with no manifest action collision |
| `toolkit`, `tool` | The provider listing's toolkit and exact tool slug; toolkit must match the module's auth declaration |
| `kind` | `read`, `change`, `send` or `delete`, selected from the tool's description and hints and confirmed by a person |
| `summary` | One plain sentence describing what the call does |
| `key_fields` | Names in the retained input properties that a person needs to see first |
| `input_schema` | The listing's `input_parameters`, preserving constraints and annotations apart from the explicit narrowing below |
| `narrowed` | An array of optional top-level property names removed from the provider schema, empty when none |
| `hint` | The listing's recorded hint tags (`tags`), including the read and write hints |

For Composio, read every page of `GET https://backend.composio.dev/api/v3.1/tools?toolkit_slug=<TOOLKIT>&limit=1000`, passing `next_cursor` as the next request's `cursor`. Copy the definition rather than inferring a schema from a successful call. Remove user/mailbox selectors and properties the gateway cannot constrain, recording their names in `narrowed`. A row may narrow the provider schema by removing optional properties; it never adds properties, relaxes constraints or removes a required property. A required field that cannot be safely exposed excludes that tool. Widening would let gateway validation approve inputs the reviewed provider contract never allowed.

The module must grant the minimum privilege in the gateway's kind table. A tool that trashes, deletes, permanently removes or purges, or carries `destructiveHint`, is `delete` regardless of other hints; it always stops and can never be covered by a standing approval. A person checks and confirms the kind before shipping. Run the gateway tests and `node gateway/server.js --check`; invalid rows are findings to fix, never rows to silently remove.

### Checking drift

Run from the plugin root:

```sh
node gateway/providers/composio/curated-drift.mjs --env <absolute provider-key file>
node gateway/providers/composio/curated-drift.mjs --fixture <listing.json>
node gateway/providers/composio/curated-drift.mjs --help
```

The explicit `--env` file is parsed like `catalog-provider.js` (`WISER_AUTH_PROVIDER_KEY`, then `COMPOSIO_API_KEY`); nothing is read from a default key path or printed. The checker lists tools, never executes them, follows every page, and compares canonical JSON including annotations after removing each row's `narrowed` properties and required entries. A narrowed field becoming required is drift even if that comparison otherwise matches. Missing or duplicate slugs, changed input schemas and changed read/write hint sets are reported by row id. Other hint tags do not change the read/write comparison.

`--fixture` takes a complete JSON array of tool definitions, or `{ "items": [...] }` with no outstanding `next_cursor`; each definition has `slug`, `input_parameters` and `tags`. It needs no key and makes no network request. Help works without configuration; unknown flags are refused before any work. Success writes one JSON object to stdout, failures only to stderr. Exit codes: 0 all match; 1 drift or listing failure; 2 usage, fixture or key error. This script has no dependencies to install and writes no files.

## The adapters here

| Directory | State on 2026-09-05 |
|-----------|---------------------|
| The one `default.json` names | The first adapter, both interfaces, against the provider's HTTP API with the built-in `fetch`. Its `SETUP.md` is the long form, and its `setupText()` is the short one the gateway quotes. Request bodies marked `UNVERIFIED` in code were read from documentation and not yet run |
| `local-file/` | AuthProvider only. A credential file bound by `secrets:<platform>` and named by the manifest, in the directory `--secrets` names. `status` is whether the file has its variables; `unwrap` reads it. For services no catalog carries |
| `nango/` | Interface stub. Every method throws `not_implemented`. Exists so a second adapter is a directory and not a rewrite |

## Adding one

Copy the interface, not an adapter. Name the directory for the provider, keep every mention of the provider inside it, and point `default.json` at it only by a recorded decision.

**An adapter owes two pieces of prose and they are not the same piece.** This was one sentence
saying each was the only place a provider explains itself, which cannot both be true, and an
author following either half alone shipped a broken path.

| | `setupText()` | `<adapter>/SETUP.md` |
|---|---|---|
| What it is | The short form, a few sentences | The long form, a walkthrough |
| Who reads it | Whoever gets the `needs_provider` answer, which carries it verbatim as `setup` | A person following a dashboard, sent there by the short form or by a skill |
| Where it is quoted | In every `needs_provider` answer the gateway returns | Cited by path from `gateway/SETUP.md` section 3 and by `skills/Set Up Connectors/` |
| What breaks without it | Every `needs_provider` answer in the system describes a provider that is not the one installed, because `gateway.js` falls back to a generic string | `skills/Set Up Connectors/` sends a person to a file that does not exist, and the turn ends at a dead path |

Write both. The short form names the next step and points at the long one; the long one is where
the clicks live.
