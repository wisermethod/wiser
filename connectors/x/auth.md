# Connecting X

Prepare both sides before asking Connect Account to connect `x` / `account`. Hosted connect asks you to approve the app at X in your own browser. No credential is typed into the conversation.

## On X's side, first

1. Create an X developer account, a project and an app in the X Developer Portal.
2. Enable OAuth 2.0 user authentication as a confidential Web App and set app permission to **Read and write**.
3. Set the callback URL to exactly what the provider's auth-config page shows. Read it from that page and check the saved value against it; do not guess a callback.
4. Buy API credits and set a spending limit on the developer account. Your app's account pays X's pay-per-use charges and supplies its quota. See `CONNECTOR.md` for each action's worst case and prices read on 2026-11-06.

## On the provider's side, before connecting

The shipped toolkit is named `TWITTER`, X's former service name. It is the X toolkit, separate from the xAI model service. The provider has no managed OAuth app for it, so you must supply your own OAuth app through a custom auth config on that existing toolkit. There is no custom toolkit to create.

1. Open the gateway's provider's auth-config page, following the own-OAuth recipe in the `SETUP.md` of the adapter directory `gateway/providers/default.json` names.
2. Check first that no other `TWITTER` auth config exists. Keep exactly one on that toolkit. If one already exists, resolve its use before creating another: a second config makes the next `start_connect` fail with `vendor_error` naming the toolkit and count. An already-active stored connection can keep executing; a duplicate is not guaranteed to announce itself there.
3. Create the config on `TWITTER` using **your own OAuth app**, scheme `OAUTH2`, and enter your X app's client id and secret on that page only. Never put the secret anywhere else, including chat, Wiser, a root file or the gateway's provider-key file.
4. Set exactly these scopes, with no extras: `tweet.read tweet.write users.read offline.access`.

The reads require `tweet.read` and `users.read`; deleting requires both plus `tweet.write`. `offline.access` requests the refresh token the provider needs to mint access tokens. The requested grant's reach, in X's generated schema version 2.174's own words, is:

| Scope | Grant's reach |
|-------|---------------|
| `tweet.write` | "Create and repost on your behalf." |
| `tweet.read` | "View all posts you can see, including those from protected accounts." |
| `users.read` | "View any account you can see, including protected accounts." |
| `offline.access` | "Request a refresh token for the app." |

This permits creating posts and reposts as the account and reading every post and account it can see, protected ones included, beyond the actions this connector builds. The provider holds the refresh token; Wiser holds no client secret, access token or refresh token.

**Create the custom config before connecting.** With no config for the toolkit, `start_connect` asks for managed auth, which is unavailable for this toolkit. **If the custom config is ever deleted, the next `start_connect` attempts to create a provider-managed config in its place.** Recreate the custom config by hand before connecting again; never rely on the gateway to create it. Check the configs before treating a failing connection as a code defect.

## Through the gateway

1. After both sides are ready, say "Connect X" and name module `account`.
2. Connect Account runs `start_connect` and hands you a hosted link.
3. Open it in your own browser and consent at X. No secret enters the conversation.
4. The skill runs `connect_status`. Only `ACTIVE` completes the grant.

There is one module and one connect turn. The scopes as saved by the provider still need readback before the later build step. The first live call must be `x.account.me`: whether the proxy attaches the user's token at `https://api.x.com` remains unverified. The write-route ordering probe and live captures remain separate from this fake-provider build.

## Rate limits and unattended use

X's limits and charges apply to your developer app; every proxied request also counts against your provider project. That project's limit is unverified. A 429 is a stop: check both quotas before trying again. A refused request's billing and the minimum credit purchase are unpublished in the evidence.

The provider is expected to retain the refresh token and refresh access tokens. Unattended use remains unverified until a call succeeds more than an hour after consent. Do not rely on it before that measurement.

## The route this connector does not use

Local-file and app-only bearer authentication are not routes here. Every action uses the connected user's OAuth token by proxy, never catalog execution or token unwrapping. There is no `secrets:x` binding. Client credentials belong only on the provider's auth-config page.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **A labelled connection moves as one**: connecting again under a label moves every module of its toolkit under that label, so to keep one module out of a labelled connection, connect that module with no label first, then `disconnect` naming the label. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Revoke this app in X settings under Security and account access, Apps and sessions, Connected apps. To rotate the OAuth client credentials, update the custom auth config with the replacement credentials on the provider's page; if the config is deleted, recreate it by hand before connecting again. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
