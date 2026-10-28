# Connecting ElevenLabs

Connect Account handles the human grant in its own turn. Speech and clone uploads need the local gateway, because they write or read a file on your own computer; the Wiser endpoint withholds both. Listing and deleting need no local file.

## On ElevenLabs, first

1. Identify the workspace holding the intended clones and its plan, API access, Instant Voice Cloning and commercial entitlements. Do not infer entitlement from the toolkit's existence.
2. Create a restricted API key in that workspace. Permit text-to-speech, voice reads, instant-clone creation/deletion and model reads, using the permission labels actually displayed by ElevenLabs. Exclude unrelated account and key administration. A key quota can further limit spending. The intended grant is write; human connect must check the actual restriction rather than substitute an administrative key.
3. Identify that workspace's billing basis before paid use. **The key charges the ElevenLabs workspace it was created in; connecting through Wiser does not supply a separate ElevenLabs plan.** State the selected model's applicable rate, included allowance and whether PAYG or legacy overage can draw money. For a Starter allowance check, establish that the key belongs to that Starter workspace and has eligible allowance remaining. An unidentified billing basis stops paid use. Never paste the key into a conversation.

ElevenLabs' public pricing, read 2026-10-27, estimates USD 0.08 per 1,000 API characters for v4, v3 and multilingual v2, and USD 0.04 for v4 Turbo: USD 0.40 or USD 0.20 respectively for 5,000 characters at base rate, excluding taxes. API Starter's USD 6/month includes 75,000 base v4 or 150,000 v4 Turbo characters as alternative allowance uses; creative Starter lists USD 6/month, 30,000 credits and Instant Voice Cloning. These figures do not settle subscription-credit conversion, custom voice multipliers, legacy overage or this workspace's billing. **Not available: the actual maximum debit for account-specific cases is unestablished.** Every synthesis needs gateway confirmation unless a standing approval covers the call. Do not enable billing or upgrade a plan during connect. See [API pricing](https://elevenlabs.io/pricing/api), [creative pricing](https://elevenlabs.io/pricing), [authentication](https://elevenlabs.io/docs/api-reference/authentication), and [usage billing](https://elevenlabs.io/docs/help-center/account/general/what-is-the-price-for-usage-based-billing).

Only `elevenlabs.speech.synthesize` is eligible for a standing approval, of kind `pay`, for at most 7 days, on your yes to the gateway's exact warning through `skills/Standing Approval/`. Under it each call spends your own ElevenLabs plan's credits, or money where pay-as-you-go or overage is on, without asking each time. The gateway does not know your account's maximum charge. Before any paid use the caller still establishes the billing basis and gets your cost approval; the grant never replaces that. Voice creation and deletion still require confirmation every time.

**One blueprint per toolkit, not per module**, and for a toolkit the provider already ships there is nothing to prepare: the gateway creates the blueprint on the first connect that finds none. A second blueprint on one toolkit makes every module on that toolkit unconnectable until it is removed, with a `vendor_error` naming the toolkit and the count.

The three modules use one built-in toolkit. Add no custom toolkit row and never delete a conflicting configuration to force a connection.

## Through the gateway

1. Say "Connect ElevenLabs" and name `speech`, `voices` or `models` and an optional connection label.
2. Connect Account runs `start_connect` and gives a hosted link.
3. Open that link in your own browser and enter the API key only on hosted connect. The gateway's provider retains the key and injects `xi-api-key` for `https://api.elevenlabs.io`; no vendor key is stored here or supplied as an action input.
4. Connect Account runs `connect_status`. Only ACTIVE establishes the grant. Then inspect `list_connections` for the required modules.

Each module has its own binding. You may be asked to connect ElevenLabs for the required modules.

## Local files

Clone upload accepts one readable regular MP3 from an absolute physical path, 1 to **3,000,000 bytes inclusive**, with name at most 100 code points and path at most 4,096. It refuses symlinks at any ancestor, multiple links, changed files, `.env`/`.env.*` components, `memory` components and the person-scoped Wiser credential directory before opening. The multipart filename is always `sample.mp3`, never the local path.

File plus fixed boundary, headers and fields is below 3,002,000 bytes; base64 is at most 4,002,668 bytes; for a connected-account id of up to 1,024 characters the outer proxy wrapper adds less than 2,000 bytes, below 4,100,000 bytes sent. Do not split, truncate or automatically retry an upload. `requires_verification:true` is a vendor requirement, not readiness. The calling workflow owns the single consent ask; gateway confirmation is separate.

Speech uses the gateway's generated output files, up to 16,777,216 decoded bytes, and cannot run without local stdio file output. That refusal does not cover an upload: a gateway that serves other people withholds both upload and speech, as the Wiser endpoint does.

## The route this connector does not use

No local-file credential binding, bring-your-own OAuth, token unwrap or direct vendor HTTP path is used. No key belongs in chat, a root binding or an action. A failed built-in connection does not authorize switching routes.

## Troubleshooting

- `needs_connect`: use Connect Account for the named module.
- `invalid_arguments`: fix the named input or local file condition.
- `local_only`: use the local stdio gateway.
- `needs_provider_capability`: check the gateway's provider capability.
- 401/403: check the workspace/key permissions.
- 413: ElevenLabs or the provider's proxy refused a request that was sent. A file over 3,000,000 bytes never gets that far: it returns `invalid_arguments` with its size.
- 422: check current vendor model/file requirements.
- 429: inspect the workspace/provider quota before deciding on another request.
- Transport/5xx or malformed answer: stop and inspect the sanitized failure; do not retry paid synthesis or creation automatically.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what you approve**: if anything else is bound to the credential before you answer, nothing is revoked and it stops again with the new list. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **A labelled connection moves as one**: connecting again under a label moves every module of its toolkit under that label, so to keep one module out of a labelled connection, connect that module with no label first, then `disconnect` naming the label. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what the gateway has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and adds nothing when the provider cannot be read. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Delete or rotate the API key in the ElevenLabs workspace that issued it. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Not yet.
