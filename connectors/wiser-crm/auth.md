# Connecting Wiser CRM

The Connect Account skill walks these steps for the local gateway.

## In Cloudflare and the gateway home

1. Create a Cloudflare Access service token for the CRM agent and make sure the CRM's Access application admits it. Keep both values, Client ID and Client Secret, for the hosted connect page.
2. In the local gateway home (`~/.wiser/gateway/` by default), add the labelled HTTPS origin to `installs.json`. Use a label that matches the CRM instance name. Add more entries under `wiser-crm` for more installs.

   ```json
   {
     "wiser-crm": {
       "<label>": "https://<your CRM address>"
     }
   }
   ```

## Through the gateway

1. Ask to connect Wiser CRM and give the module, such as `records`, and your install's label.
2. The skill calls `start_connect` with that label. The link answer includes `install_origin`, which the skill quotes before handing over the link.
3. Open the link in your browser. The provider's page asks for **Client ID** and **Client Secret** from the Cloudflare Access service token made for the agent. Enter them only if `install_origin` is your CRM's address. Keep the two values out of the conversation.
4. The skill calls `connect_status` with the same label. When the connection is `ACTIVE`, all three modules share it. Read `wiser-crm.records.instance` under the label to verify the CRM identity and the agent caller.

The member's CRM Worker handles each request. The gateway provider's proxy rate limits apply.

## Only on the local gateway

The entire `wiser-crm` connector runs on the local gateway because the Wiser endpoint has no per-install route yet.

## Renewing

If the Cloudflare Access service token expires, create a replacement for the agent in Cloudflare, confirm the CRM's Access application admits it, and repeat the connect with the same label. Revoke the expired or replaced token in Cloudflare.

## Connection labels

Wiser CRM requires a label on every call. An unlabelled `start_connect`, `connect_status`, `execute` or `disconnect` is refused. The three modules on a label share one grant and end together. **The shared instruction below to "connect that module with no label first" does not apply to Wiser CRM**, so no one module can be kept while the others end. Keeping one means keeping all three; to end one, end the label.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **A labelled connection moves as one**: connecting again under a label moves every module of its toolkit under that label, so to keep one module out of a labelled connection, connect that module with no label first, then `disconnect` naming the label. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. In Cloudflare Zero Trust, go to Access, then Service tokens, and revoke the service token made for the CRM agent. To rotate a token, connect the replacement under the same label and revoke the old token in Cloudflare. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
