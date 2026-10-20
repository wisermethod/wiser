# Connecting xAI

Connect service `xai`, module `voice`, with an ordinary xAI API key. The Connect Account skill handles the hosted link in its own turn; no key belongs in a conversation.

## On the platform's side, first

1. Open the [xAI console](https://console.x.ai/) and select the team that holds the custom voice you will use. The key must belong to that team to list and use its voices.
2. Open **API Keys** and create an ordinary API key. Never use a Management API key: management credentials administer keys or the team and are not the speech credential.
3. In the console's permissions picker, restrict the key to the **Voice** endpoint by the label shown there. Do not guess an ACL string from another endpoint's documentation. Save the restriction.
4. Keep the key ready for hosted connect. Paste it only into that hosted page, never into a conversation, a root file or a gateway configuration file.

The module's grant is `write` because speech synthesis creates billed output. The same key covers the two voice-list reads; no second connection is required for them.

**One blueprint per toolkit, not per module**, and for a toolkit the provider already ships there is nothing to prepare: the gateway creates the blueprint on the first connect that finds none. A second blueprint on one toolkit makes every module on that toolkit unconnectable until it is removed, with a `vendor_error` naming the toolkit and the count.

## Through the gateway

1. Say "Connect xAI voice". The skill calls `start_connect` with service `xai` and module `voice` and returns a hosted link.
2. Open that link in your own browser. Paste the ordinary API key into hosted connect's API-key field, without a header name or prefix.
3. The skill calls `connect_status` on the returned connection. Only `ACTIVE` completes the connection.

The gateway's provider holds the vendor key. The connector never reads it, unwraps it or stores it. Speech synthesis runs on the local gateway because the gateway writes the audio file; the hosted link still collects its key.

## The route this connector does not use

Local-file is not this connector's route. There is no local vendor-key file or Provides secret binding. A key pasted in a conversation is never a connection route.

## Rate limits

Use the Voice limits currently shown for the team in the xAI console. xAI documents rate-limit failures as HTTP 429; do not assume a single fixed allowance for every team or apply a chat model's quota to speech. This connector does not retry a billed call automatically. See [xAI rate limits](https://docs.x.ai/developers/rate-limits) for the vendor's current rules.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **A labelled connection moves as one**: connecting again under a label moves every module of its toolkit under that label, so to keep one module out of a labelled connection, connect that module with no label first, then `disconnect` naming the label. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Delete the ordinary API key in the xAI console's API Keys page, in the team that owns it, to revoke it at xAI. Then run disconnect for xai/voice and approve the listed bindings to remove the gateway's credential record; deleting the key alone does not remove that record. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
