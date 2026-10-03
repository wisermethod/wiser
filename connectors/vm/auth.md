# Connecting virtual machines

What you do, on which side, to make `vm.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## On your side, first

Run your own router and the hosts it maps. Then, in your own provider project, register one custom toolkit:

1. Slug `VM`. The connector names the registered slug `CUSTOM_VM`.
2. Set `app_url` to your router's https origin.
3. Scheme `API_KEY`.
4. Header `Authorization: Bearer {{generic_api_key}}`.
5. One auth config on that toolkit.

**One blueprint per toolkit, not per module**, and for a toolkit the provider already ships there is nothing to prepare: the gateway creates the blueprint on the first connect that finds none. A second blueprint on one toolkit makes every module on that toolkit unconnectable until it is removed, with a `vendor_error` naming the toolkit and the count.

This toolkit is not one the provider ships. The origin is different for every installer, so the gateway does not register a row for it. You create slug `VM`, and you keep a single auth config on it.

The bearer is root on every mapped host. To rotate, replace the bearer in the router's accepted set, run `start_connect` again, and enter the new value only on the hosted page. Disconnecting the provider account removes the provider's copy and does not revoke a bearer the router already holds; withdraw that bearer from the accepted set as well.

## Through the gateway

1. Say "Connect virtual machines" and name the module: `inventory`, `command`, `files` or `units`.
2. The skill runs `start_connect` and hands you a link.
3. Open that link in your own browser and enter the bearer only on the hosted page. Nothing is typed into the conversation.
4. The skill runs `connect_status`. On `ACTIVE`, that module's actions can run.

Repeat for each module. All four use the one toolkit, so the second and later may adopt the account the first created. A second auth config on that toolkit makes every module on it unconnectable until the extra one is removed.

The shipped default policy denies privilege `admin` for the runtime role. Each of these modules declares `admin`. Until `policy.json` in the gateway home allows service `vm` at privilege `admin`, an action answers `denied` and no request is sent.

## The route this connector does not use

Local-file is not a route here. This connector does not read a bound file, use a Provides secret, or unwrap a token. A bearer pasted into the conversation is not a route either.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Replace the bearer in the router's accepted set and enter the new value only on a new hosted connect page. Disconnecting the provider account removes the provider's copy and does not revoke a bearer the router already holds, so withdraw that bearer from the accepted set as well. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
