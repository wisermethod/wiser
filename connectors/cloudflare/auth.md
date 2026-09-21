# Connecting Cloudflare

Each module is its own grant. The provider blueprint is **Cloudflare Api Key** (one API token field). A hosted page that asks for an email is the other blueprint, **Cloudflare**, and will fail 9106.

Do not paste a token into the conversation.

## On Cloudflare's side

Make an API token (not a Global API Key). Permissions are fixed when you make it.

| Module | Token needs |
|--------|-------------|
| `dns` | Zone / DNS / Edit on the named zone or zones |
| `zones` | Zone / Zone / Read, or an account-wide list of zones. `create` and `delete` need Edit |
| `pages` | Account / Cloudflare Pages / Read (Edit to change) |
| `rulesets` | Zone / Zone WAF or the rulesets permission for the zones you mean |

One wider token can serve several modules. You still connect each module separately and paste that same token on each hosted page. **Extra permissions on one grant do not unlock another**: a token connected as `dns` does not serve `zones`, and `pages` needs Account / Cloudflare Pages in its own right. A 403 on a Pages call from a token that works for DNS is that, and not an outage.

Keep the create-token page open; the value is shown once.

## On the provider's side

One blueprint, **Cloudflare Api Key**, already created. Do not make **Cloudflare** (email plus Global API Key). Do not click dashboard Connect Account.

## Through the gateway

1. Name the module: "Connect Cloudflare DNS", "Connect Cloudflare zones", "Connect Cloudflare Pages", or "Connect Cloudflare rulesets".
2. The skill runs `start_connect` with `service=cloudflare` and that module.
3. Open the link. The page asks for the API token only. Paste it there.
4. `connect_status`. On `ACTIVE`, that module's actions run.

## The route this connector does not use

A credential file or token in chat is not a route. Use the API-token-only hosted page through the gateway's provider; [gateway/SETUP.md](../../gateway/SETUP.md) links its setup.

## Finding ids

- **zone id**: zone Overview, right-hand column, or `cloudflare.zones.list`.
- **account id**: `cloudflare.zones.list_accounts`, then Pages calls take it as `account_id`.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. At Cloudflare, roll or delete the token. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Yes.
