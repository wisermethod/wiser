# Connecting Vercel

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Create a Vercel API token limited to the intended account or team. Prepare an API Key blueprint through the gateway's provider. Paste the token only on its hosted page. This connector selects API_KEY even where other authentication options are listed.

## Through the gateway

1. In a human turn, request "Connect Vercel" and name the module.
2. Run `start_connect` for `vercel` and that module, then open the hosted link in your own browser.
3. Paste the API token on the hosted page, never in chat.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `projects`: separate connect, write privilege; Last connected: 2026-09-08. Last verified ACTIVE: 2026-09-17.
- `deployments`: separate connect, write privilege; Last connected: 2026-09-08. Last verified ACTIVE: 2026-09-17.

## The route this connector does not use

A local credential file or a key pasted into chat is not a route. Use the hosted page through the gateway's provider.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own — `start_connect` for that service and module, then `connect_status` — and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Revoke or rotate the API key or token at the platform. For a local file, remove its binding and rotate the key at the platform. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Connected 2026-09-08, `projects` and `deployments` ACTIVE. Catalog projects.list `{ projects, pagination }`. Catalog deployments.list `{ deployments, pagination }`.

`create` **has run**: a deployment succeeded live on 2026-09-14, `dpl_AonCe3igyVt1sV2ut38p8vJbe4vA`, READY and PROMOTED.

Last verified ACTIVE 2026-09-17, by a status check rather than a new connect; the connection date above is unchanged. Upload by reference was verified the same day against a real 38-file, 962,496-byte site: 38 of 38 files accepted, largest single body 233,984 base64 characters, resulting create body 3,824 bytes. A **by-reference deployment** was then created end to end and polled to READY, `dpl_D9mP4EPiCFZCF5cpansAudj4Z3hs`, against a throwaway project that was deleted afterwards and confirmed gone by a 404 re-read.
