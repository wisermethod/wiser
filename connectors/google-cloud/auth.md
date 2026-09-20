# Connecting Google Cloud

What you do, on which side, to make `google-cloud.*` actions run. Connect Account walks this in its own turn; this file is what it reads.

## On the platform's side, first

Register an OAuth client in Google Cloud Console: APIs and Services, Credentials, Create Credentials, OAuth client ID, Web application. Add the redirect URI the auth config shows you, and confirm it against the config after you create it rather than assuming. The plugin never holds the client secret, the refresh token, or an access token; those stay on the auth config page and with the gateway's provider.

Enable the APIs this connector calls on the project that owns the client: Cloud Resource Manager, Service Usage, and API Keys.

**If you cannot create a project**, the two common causes are separate and have separate remedies: an administrator has removed the organisation's default Project Creator grant, or you have reached the project quota, which more permission does not raise. This connector does not create projects and never will, so there is no automated path around either. For the first, ask whoever administers the domain for `roles/resourcemanager.projectCreator` at the organisation, or for a project created for you; for the second, ask for a quota increase or reuse an existing project. A personal Google account outside the managed domain has its own quota and is a fallback for creating a project.

**Whichever route you take, this connector reaches only what the consenting account can reach.** The grant is user OAuth, so a project you can create is not automatically a project the consenting account has permission on, and an account outside the organisation has no access to its projects except where an IAM grant gives it some and organisation policy permits that account. Check that the account you consent with holds the permissions the actions need on the projects you intend to name. This paragraph is written from Google's access model and not from an observed block.

**Then create the auth config, before any connect.** This connector does not run on provider-managed auth, and nothing creates the right blueprint for you. Follow the bring-your-own-OAuth recipe in the `SETUP.md` of the adapter directory `gateway/providers/default.json` names, under "Add toolkits (auth configs)": create the auth config on toolkit `GOOGLEBIGQUERY`, choose your own OAuth app rather than managed auth, enter the client id and secret from the step above on that page, and set the scopes. **If you skip this, the first `start_connect` creates a managed blueprint instead**, which carries that toolkit's own scopes rather than yours, and the connector will fail against Cloud in a way that looks like a code problem. That failure is the case named at the foot of this file.

The grant as it stands asks for `https://www.googleapis.com/auth/cloud-platform`. That is the broad Cloud scope. The three shipping modules do not need it. Against the generated schemas of 2026-09-19 the narrowest workable set is `cloud-platform.read-only` for project and service reads, `service.management` for `services.enable`, and `apikeys` for every keys action. Secret Manager is the single operation that declares `cloud-platform` and nothing else, and Secret Manager is not in this connector. Narrowing the config later costs one re-consent. Until that happens, treat the grant as able to edit arbitrary Cloud data on every project the signed-in user can reach.

Rate limits apply on all three APIs. Enabling a service and creating a key are durable; do not poll.

## Through the gateway

1. Say "Connect Google Cloud" and name the module, `projects`, `services`, or `keys`.
2. The skill runs `start_connect` and hands you a hosted link.
3. Open that link in your own browser and approve at Google. Nothing is typed into the conversation.
4. The skill runs `connect_status`. Only `ACTIVE` completes that module's grant.

Each module is its own connect. They share one toolkit and one auth config, so one hosted connect may cover a module that has no grant of its own while the toolkit carries exactly one ACTIVE account. That reuse is adoption, not a shared token, and it stops if the toolkit grows a second account.

The auth config hangs off toolkit `GOOGLEBIGQUERY`. That is the only Google toolkit the provider ships that carries `OAUTH2`, and hanging the config there was a decision about the real hazard rather than the appearance. `list_connections` and any audit will show this connector under BigQuery.

**The config must be the only one on that toolkit.** The adapter refuses `start_connect` when a toolkit carries more than one config, and the gateway drops any toolkit whose distinct account ids number more than one. A second config takes this connector out of service for the next connect, loudly, until a human removes it. An already-ACTIVE stored connection keeps executing without that check, so a duplicate does not stop a connector that is already working; it stops the next `start_connect` and it prevents unambiguous discovery for a module not yet bound.

**If this custom config is ever deleted, the next `start_connect` attempts to create a provider-managed one in its place**, with that toolkit's default scopes, which are the wrong scopes for Cloud. Check Auth Configs before assuming a failing connector is a code problem.

The gateway's provider holds the grant. This connector holds none. There is no credential file here and no `secrets:google-cloud` key.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token. A service-account JSON in a file or in chat is not a route. A custom toolkit is not a route; custom toolkits cannot carry this vendor's OAuth.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own — `start_connect` for that service and module, then `connect_status` — and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Revoke the OAuth grant in the Google account under the client's authorized access, and remove or replace the auth config if you are done with this connector. Deleting the auth config without replacing it is the case above: the next connect tries to create a managed one with the wrong scopes. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Yes.
