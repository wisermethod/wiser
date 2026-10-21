# Connecting YouTube

## Before any connect

This connector runs on a custom auth config of your own that already exists on the gateway provider's `youtube` toolkit. Do not connect it on a toolkit with no config: the first connect creates the provider's shared app in its place, spending that app's shared quota.

Check the toolkit's existing configs before any connect:

| Existing configs | What to do |
|------------------|------------|
| None | Stop. Do not connect. |
| One provider-managed | Stop. Remove it before anything else; do not connect until a custom config exists. |
| One custom | Go on using that existing custom config. |
| Two or more | Stop. One config per toolkit is required. |

This release teaches no member setup. Setting up your own Google app and custom auth config comes with a setup skill in a later release. Until then, use YouTube Studio in your own browser.

## Grant and limits

Keep exactly one auth config per toolkit, shared by all four modules. More than one prevents the next connect and makes adoption ambiguous; an already-bound ACTIVE grant can keep executing. If the custom config is removed, stop before any new connect.

The grant is `https://www.googleapis.com/auth/youtube.force-ssl`, the narrowest single non-partner scope serving every action, including captions. Google describes its reach as "See, edit, and permanently delete your YouTube videos, ratings, comments and captions" ([Google OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#youtube)). Its privilege is write even for read actions. This connector does not expose video deletion, comments or ratings.

Custom thumbnails require a phone-verified channel. If `longUploadsStatus` is not `allowed`, the connector returns `vendor_error` with `reason: channel_not_verified` and `verify_url: https://www.youtube.com/verify`, without calling the thumbnail method. Verify in your own browser.

Quota is per Google Cloud project, not per channel: 10,000 units a day and a separate bucket of 100 video uploads a day. The custom config uses your own project's quota; the provider-managed app shares its quota across that provider's customers. Calls charge no money. See `CONNECTOR.md` for each action's cost.

## Through the gateway

Only an already-existing custom config passes the opening check. The gateway's provider holds the grant; the connector sees no credential. Each module has a connection record, and an unbound module can adopt the toolkit's one ACTIVE account. Nothing is typed into the conversation. The member setup walkthrough is held for a later release; this section supplies no substitute for it.

## The route this connector does not use

There is no hosted route in this release. Local-file credentials, Provides secrets and token unwrapping are not this connector's auth route. Use the local gateway with the existing custom config, or YouTube Studio in your own browser.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **A labelled connection moves as one**: connecting again under a label moves every module of its toolkit under that label, so to keep one module out of a labelled connection, connect that module with no label first, then `disconnect` naming the label. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Remove the app's access in your Google account's third-party connections. If you remove its custom auth config too, do not connect again until it has been replaced: a connect without it creates the provider's shared app. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
