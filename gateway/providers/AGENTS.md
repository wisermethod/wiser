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
| `proxy({ providerAccountId, toolkit, endpoint, method, body, parameters, binary_body })` | `{ status, data }` or `{ status, error: { code, endpoint, method } }` | Response headers are dropped. Never the vendor's body on failure; the same-domain rule is enforced here if the provider has one |
| `unwrap({ providerAccountId })` | `{ supported: false }` or `{ supported: true, header, value }` | The value goes to the gateway's `context.js` and nowhere else; a module never receives it |
| `revoke({ providerAccountId })` | `{ supported, how?, steps }`, and `{ status, error: { code, endpoint, method }, supported, steps }` when the **final** step fails | `steps` is an ordered list of `{ step, status, ok }`, one per call the adapter made, and it is **required even when empty**. A status code and a step name and never a vendor body, per `standards/script-contract.md`. **A top-level error reports the final step only; an earlier step failing shows as `ok: false` in `steps` and nothing else, so a caller must read every step rather than the error alone.** An adapter that cannot revoke answers `supported: false` with `how` and `steps: []` |

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

The mapping between our ids and the provider's slugs is a table inside the adapter, `mapping.js`, in both directions. A slug appears there and in a manifest's `auth.toolkit`, and nowhere else.

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
