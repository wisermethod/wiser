# Connecting DataForSEO

What you do, on which side, to make `dataforseo.*` actions run. Connect Account walks this in its own turn; this file is what it reads.

## On the platform's side, first

Have a DataForSEO account with API access. On the vendor's API Access page, copy the two credentials the vendor names API login and API password. Keep them in your own browser. Never paste either into chat. The same pair serves both modules.

Rate limits the vendor publishes: 2000 calls a minute, 30 simultaneous, and 12 a minute for Google Ads search volume.

## Through the gateway

1. Say "Connect DataForSEO" and name the module, `research` or `backlinks`.
2. The skill runs `start_connect` and hands you a hosted link.
3. Open that link in your own browser. Enter the API login and the API password on the hosted page. Nothing is typed into the conversation.
4. The skill runs `connect_status`. Only `ACTIVE` completes that module's grant.

Each module is its own connect. Both asks for the same API login and API password, so two hosted connects of one account. A grant on `research` does not unlock `backlinks`, and the reverse.

The gateway's provider holds the credentials. This connector holds none. There is no credential file here and no `secrets:dataforseo` key.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token. A personal token in chat is never a route.

The vendor's sandbox host is a different domain from the live API. The gateway's provider does not reach it. Contract fixtures are the gateway's fake provider, not the sandbox.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own — `start_connect` for that service and module, then `connect_status` — and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Regenerate the API password on the vendor's API Access page. Regenerating the password invalidates both modules' hosted grants. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
