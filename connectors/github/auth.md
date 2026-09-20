# Connecting GitHub

What you do, on which side, to make `github.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## On the provider's side, first

The provider needs a blueprint for GitHub (OAuth, managed by the provider) before a connect link can work. Make that in the provider dashboard. The clicks are in the provider's own SETUP.md, the file `gateway/SETUP.md` points at. Do not connect a test account from that dashboard; that authenticates a playground user, not this gateway. Connecting is the next section.

## Through the gateway

1. Say "Connect GitHub" and name the module: `users`, `repos` or `issues`. Each is its own grant.
2. The skill runs `start_connect` and hands you a link. Open it in your own browser.
3. The provider's hosted page sends you to GitHub, which asks you to authorise the provider's application for the scopes that module needs. Approve.
4. The skill runs `connect_status`. On `ACTIVE`, the gateway writes a connection record and the module's actions run from then on.

No key is typed anywhere. If anything in this flow asks you for a token in the conversation, stop; that is not this flow.

## The route this connector does not use

A personal access token in a file is the local-file provider, and this connector is not on it. GitHub here is OAuth through the gateway's hosted link. A skill that asks you to paste a `ghp_` token, or to write one under `memory/secrets/`, is wrong; stop.

## On GitHub's side

Nothing to prepare. GitHub's authorisation page is the whole of it. If your account belongs to an organisation that restricts third-party applications, an owner has to approve the provider's application once for that organisation, and until they do a repository in it reads as absent.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own — `start_connect` for that service and module, then `connect_status` — and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. At GitHub, Settings, Applications, Authorized OAuth Apps, revoke the provider's application. `list_connections` shows the modules this machine has recorded, which is not the same as every module connected anywhere: discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Yes.
