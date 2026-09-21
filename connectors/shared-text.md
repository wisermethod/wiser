# Shared guide text

**One source for the text every connector guide carries.** Twenty-four of the twenty-five
`auth.md` files in this family said the same thing about revoking in twenty-four hand-maintained
copies, and no copy was canonical, so a correction landed in one and the other twenty-three kept
the defect. That is the shape `gateway/AGENTS.md` records for `validated()`, which eleven
connectors carried and nobody owned, one layer out.

This file is the source. A guide carries a **projection** of a block below: the block verbatim,
with each `{SLOT}` replaced by that connector's own answer. `gateway/test/guide-conformance.test.js`
holds every guide to it and fails when a projection and its source disagree.

**Fix this file, then propagate.** A fix made in a guide's copy is lost the next time that guide
is reconciled, and the gate names it as a divergence rather than adopting it.

## How a block is used

Each block below is fenced, named by the heading above it, and states which guides carry it and
what fills each slot. A guide carries the block under the section heading the block names, with
nothing added inside it: a connector's own material goes in its slot, or in a section of its own.

A connector that genuinely must not carry a block says so here, by name and with the reason. The
gate reads that exemption from this file, so an exemption is a decision recorded in one place
rather than a row in a baseline.

## The blueprint sentence

**One sentence, carried verbatim by every `auth.md` that mentions a blueprint at all.** Not a
block: it sits inside that guide's own opening paragraph, wherever the guide explains what to do
on the vendor's side, so a guide keeps its own account and organisation advice around it.

This is the sentence the cold connect of 2026-09-20 established, and getting it wrong is not a
style matter. `microsoft` has six modules on five toolkits, `outlook` and `calendar` sharing one.
A guide that said to prepare a blueprint per module sent a reader to make two on that toolkit,
and the provider then refuses to start a connection on a toolkit carrying more than one auth
config, with a `vendor_error` naming the toolkit and a count rather than the instruction that
caused it. Both modules become unconnectable until the second blueprint is removed, and the answer does not say why. The
step was also unnecessary: the gateway creates the auth config when a toolkit has none.

In `google` and `zoho` the wrong wording was harmless, because every module there has its own
toolkit, so per module and per toolkit coincide. That is why it survived. A guide whose modules
happen not to collide still carries the sentence, so it does not read as a template for the next
connector whose modules do.

```
**One blueprint per toolkit, not per module**, and for a toolkit the provider already ships there is nothing to prepare: the gateway creates the blueprint on the first connect that finds none. A second blueprint on one toolkit makes every module on that toolkit unconnectable until it is removed, with a `vendor_error` naming the toolkit and the count.
```

**It names no authentication scheme, deliberately.** Six of the nineteen guides that carry it are
API-key connectors and the rest are OAuth, and the rule is about toolkits either way. Written as
"One OAuth blueprint per toolkit" first, which would have forced six guides to carry a word that
is false of them or to be exempted from a rule that binds them.

**A guide may say more after it, and two do.** `google-cloud` runs on bring-your-own-OAuth, so
it adds that the blueprint the gateway creates for you carries that toolkit's scopes rather than
yours and is the wrong one here. `microsoft` adds which two of its modules share a toolkit. What
no guide may do is state the rule differently.

## Revoking

Carried by every connector on the **`catalog`** provider, under the `## Revoking` heading in its
`auth.md`. Twenty-four of the twenty-five do.

**Exempt: `usebouncer`**, and the exemption is derived rather than granted. It is the family's only
`local-file` connector: the gateway never holds its credential, `disconnect` answers
`needs_provider_capability` and removes nothing, and every sentence below about what the gateway
revokes is false of it. Its `## Revoking` section is its own and is correct. Any future
`local-file` connector is exempt on the same test, which the gate reads from `manifest.json`
rather than from a list.

**`{VENDOR ROUTE}`** is the one slot: what a person does at the vendor to revoke or rotate this
connector's credential, as one to three sentences ending in a period. It is the only place a
connector's own answer belongs in this block. **It is not a place for a rule that applies to every
connector**; a rule that does belongs in the block itself, where every guide gets it.

**A `catalog` connector's slot never mentions a local credential file.** Five guides did, carrying
the generic "For a local file, remove its binding and rotate the key at the platform" into guides
whose own `## The route this connector does not use` says a local credential file is not a route
here. The gate fails on it.

```
**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. {VENDOR ROUTE} Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.
```
