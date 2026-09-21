# Connecting Google APIs

What you do, on which side, to make `google-apis.*` actions run. Connect Account walks this in its own turn; this file is what it reads.

**Prerequisite.** The gateway must already be attached, as described in `gateway/SETUP.md`. This file does not cover that attachment.

## On the platform's side, first

Have a Google Cloud project, the APIs you will actually call enabled on it, and one API key for that project available in your own browser.

**If you do not have a project**, create one in Google Cloud Console: open the project picker at the top of the page and create a project. Name it and confirm.

This connector's five modules, named as a person would name the Google service:

- `insights` is PageSpeed Insights
- `translate` is Cloud Translation
- `voice` is Cloud Text-to-Speech
- `speech` is Cloud Speech-to-Text
- `language` is Cloud Natural Language

**Enable each API on that project before you restrict a key to it.** Confirm the right project is selected in the project picker first, then go to the API Library: APIs and Services, Library. Search for the API by the vendor name above, open it, and enable it. Console's API-restriction picker offers only APIs already enabled on the project, so enable first, then restrict.

**Billing.** Translation, Text-to-Speech, Speech-to-Text and Natural Language are billed services and need a billing account on the project. Google's own setup pages make billing a prerequisite for using them; whether Console stops you at the enable step or at the first call was not checked here, so expect to be asked for one at one point or the other. PageSpeed Insights is free and needs no billing account. **A reader who arrived only for a PageSpeed reading can skip billing entirely** and enable that one API.

Rate limits apply on PageSpeed Insights; rate limits and per-character charges apply on Translation and on Text-to-Speech; rate limits and per-audio-duration charges apply on Speech-to-Text; rate limits and per-unit charges apply on Natural Language. Make deliberate requests and do not poll.

Create the key under APIs and Services, Credentials, Create Credentials, API key.

One key covers every module. Two restrictions on that key, and both live on the key's own page: open the key by name from Credentials. The second restriction is the one that catches people.

The **API restriction** is under **API restrictions**; **Restrict key** is the control that reveals the picker. Restrict the key to the services you will actually call. A PageSpeed-only key names `pagespeedonline.googleapis.com` and that is enough. The full set this connector can call is all five: `pagespeedonline.googleapis.com`, `translate.googleapis.com`, `texttospeech.googleapis.com`, `speech.googleapis.com` and `language.googleapis.com`. Check your key against the modules you will use and add any it is missing, rather than assuming a key made for an earlier version of this connector already covers them: each module was added in its own release, so a key restricted before one shipped will not name it. A key restricted to fewer services than you then call returns `API_KEY_SERVICE_BLOCKED` at the first call to an unnamed one, which is a late and opaque way to learn this.

The **application restriction** is on the same page, under **Application restrictions**, and must be **None**, not HTTP referrers. A server-side call sends no HTTP referrer, so a referrer-restricted key fails with 403 `API_KEY_HTTP_REFERRER_BLOCKED` even though the key is valid and the API is enabled. An IP allowlist is not the alternative: the provider's egress addresses are not published and not stable. This is measured rather than cautionary: it is exactly how the first live run failed on 2026-09-19.

**Save the key after setting both, and then reopen it and check.** Neither restriction takes effect until it is saved, and a key that looks restricted on a page you navigated away from is a key that is not restricted. This is the step most easily missed, and missing it leaves a new key open to every API and leaves an existing referrer-restricted key still returning 403.

## Through the gateway

One hosted connect usually covers every module of this connector, because they share one custom toolkit and one key. Observed on 2026-09-19: one hosted connect on `insights` produced a single account; `google-apis.translate.text` then executed with no `needs_connect` stop, and a `translate` connection record appeared afterwards pointing at that same account. Both `voice` actions did the same later that day, on the same one account and with no connect turn. This is what was measured on this connector, on this custom toolkit, on one API key, on that day. It is not a statement about how grants work in general.

**The word "usually" is carrying a real condition.** The gateway adopts an existing account for a module that has no grant of its own, and only while this toolkit carries **exactly one** ACTIVE account; it skips adoption altogether if it cannot list accounts at the provider.

Adding a second account does **not** break the modules you have already connected. They keep the account they were bound to. What it costs is the automatic adoption a not-yet-connected module would otherwise get, so that module stops at `needs_connect` and needs its own hosted connect, which is the safe behaviour rather than a fault. If a module stops there when you expected it not to, check whether this toolkit has grown a second ACTIVE account before assuming anything is broken.

1. Say "Connect Google APIs" and name the module: `insights` for PageSpeed Insights, `translate` for Cloud Translation, `voice` for Cloud Text-to-Speech, `speech` for Cloud Speech-to-Text, or `language` for Cloud Natural Language.
2. The skill runs `start_connect` and hands you a hosted link. The gateway registers the custom toolkit before creating that link.
3. Open that link in your own browser and enter the API key on the hosted page. Never paste the key in chat. Enter only the key: the custom toolkit supplies the `X-Goog-Api-Key` header with the key only, without a prefix.
4. The skill runs `connect_status` for the returned connection. Only `ACTIVE` completes the grant and enables the module's read actions.

The gateway's provider holds the key. Do not put a Google APIs key into an auth config or `auth-provider.env`.

**A grant on the retired pagespeed toolkit does not carry over.** If you connected this capability before it became `google-apis`, that grant is on a toolkit this connector no longer uses, and you connect again here rather than expecting the old one to serve.

## The route this connector does not use

Local-file is not this connector's route. It does not read a local vendor-key file, use Provides secrets, or unwrap a token.

## Revoking

**Revoke through the gateway.** `disconnect`, with this service and any of its modules, revokes the credential at the provider and removes every local record of it.

- **It ends every module bound to that credential and not only the one you name.** It stops first and lists them in `modules_ending`. **That list is what is bound at the moment it asks, not a promise**: what you approve is the credential, so anything attached to it before you answer ends too. The answer reports what was actually removed.
- **If someone wants one of those modules kept, their request cannot be met as asked, and saying so is the answer.** The credential is the unit; there is no way to end part of one. Two routes work. Either agree that both end, or first connect the module they want kept on a credential of its own, `start_connect` for that service and module and then `connect_status`, and only then run `disconnect`, **naming a module still on the old credential**, checking that `modules_ending` no longer lists the one you moved. **Do not approve the teardown hoping it spares one**, and do not take the vendor route instead, which is broader rather than narrower.
- **The vendor route below does not reach the same set, and may reach further.** `disconnect` acts on one provider account, and that account is what defines its scope; `modules_ending` reports the local bindings known to it when it asks. Rolling or deleting a credential at the vendor acts on everything that credential authorises, which can include modules bound to a different provider account, other machines, and other people. **`modules_ending` does not describe the vendor route**; before taking it, work out what else uses that credential.
- **It acts on one credential.** A service connected more than once needs one `disconnect` per credential. **`list_connections` shows what this machine has recorded and nothing more**: it cannot establish that no credential for this service remains at the provider, because discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page. To be sure a service is gone, check at the vendor. Do not read one teardown, or an empty listing, as removing a service entirely.
- **Revoking is not scoped to this workspace.** The credential lives at the provider, and the store is per person rather than per workspace, so ending it can end access from another machine or another workspace using the same grant. Settle that before approving.
- **It removes nothing locally unless the provider confirms the credential is gone**, so a grant that is merely suspended keeps its records.
- **A finished teardown says what it established, in `credential_revoked`.** `yes` means every step the provider reported succeeded. **`unknown` means the provider's record of the credential is gone and an earlier step failed**, so the credential may still work at the vendor even though nothing here points at it any more. Removing the local rows is right either way; **`unknown` is not a completed cutoff**, and the vendor route below is what finishes it.

**At the vendor instead**, if you would rather, or if `disconnect` answers `needs_provider_capability`, meaning this provider will not revoke this credential for you. Revoke or rotate the API key in the Google Cloud project's Credentials page. If the project does not expose that control, restrict or delete the key there. Rotating the key invalidates every module's hosted grant. Afterwards run `connect_status` for each module you revoked and read what it returns: it asks the provider and records the answer, so the row stops reading ACTIVE only once the provider agrees, and a provider error leaves it unchanged. A `how` field on the gateway's answer is the adapter's own words; where it names a route this guide does not list, the two disagree and that is worth reporting rather than following.

## Last connected

Yes.
