# Providers

How the gateway reaches an account without holding its credential. Two interfaces, one directory per adapter, and one file naming the default.

`default.json` names the adapter for each interface. `--provider <name>` on the gateway overrides it. Nothing outside an adapter's own directory may name the adapter, and the release gate greps for it.

## AuthProvider

Holds the grant, or knows where the person's own credential file is. One adapter per directory, exporting `createAuthProvider({ envPath, secretsDir })`.

| Method | Returns | Contract |
|--------|---------|----------|
| `name` | the adapter's directory name | |
| `setupText()` | plain text a person follows to make this adapter work | The only place a provider explains itself; the gateway repeats it verbatim in `needs_provider` |
| `initiate({ userId, service, module, toolkit, scheme, file, variables })` | `{ kind: "link", url, providerAccountId }` or `{ kind: "file", path, variables }` | Never completes a grant; never accepts a key |
| `status({ providerAccountId })` | `ACTIVE`, `INITIATED`, `EXPIRED`, `FAILED` or `INACTIVE` | The gateway writes a record only on `ACTIVE` |
| `proxy({ providerAccountId, toolkit, endpoint, method, body, parameters })` | `{ status, data, headers }` or `{ status, error: { code, endpoint, method } }` | Never the vendor's body on failure; the same-domain rule is enforced here if the provider has one |
| `unwrap({ providerAccountId })` | `{ supported: false }` or `{ supported: true, header, value }` | The value goes to the gateway's `context.js` and nowhere else; a module never receives it |
| `revoke({ providerAccountId })` | `{ supported, how }` | |

## CatalogProvider

Serves a provider's own tools behind our action ids. Exporting `createCatalogProvider({ envPath })`.

| Method | Returns |
|--------|---------|
| `search({ service, query })` | our action ids the provider can serve, from the adapter's mapping |
| `execute({ actionId, userId, providerAccountId, arguments })` | the tool's result, or `{ status, error }` with no body |

The mapping between our ids and the provider's slugs is a table inside the adapter, `mapping.js`, in both directions. A slug appears there and in a manifest's `auth.toolkit`, and nowhere else.

## The adapters here

| Directory | State on 2026-09-05 |
|-----------|---------------------|
| The one `default.json` names | The first adapter, both interfaces, against the provider's HTTP API with the built-in `fetch`. Its own `SETUP.md` is the whole of what a person needs. Request bodies marked `UNVERIFIED` in code were read from documentation and not yet run |
| `local-file/` | AuthProvider only. A credential file bound by `secrets:<platform>` and named by the manifest, in the directory `--secrets` names. `status` is whether the file has its variables; `unwrap` reads it. For services no catalog carries |
| `nango/` | Interface stub. Every method throws `not_implemented`. Exists so a second adapter is a directory and not a rewrite |

## Adding one

Copy the interface, not an adapter. Name the directory for the provider, keep every mention of the provider inside it, write its `SETUP.md` as the whole of what a person needs, and point `default.json` at it only by a recorded decision.
