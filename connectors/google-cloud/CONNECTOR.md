---
name: google-cloud
type: connector
category: development
description: Reads Google Cloud projects and IAM policy, lists and enables services, and creates restricted API keys, with every mutation stopping for a confirmation that names the project and the resource
version: 0.2.0
---

# Google Cloud

Reads project metadata and IAM policy through Cloud Resource Manager, lists and enables services through Service Usage, and lists, reads, creates, and patches restricted API keys through API Keys v2. Every mutating action is `confirmation: always`, and **the stop carries the project and the resource it will act on**, rendered from the values the caller sent. **An omitted optional field is simply absent from the stop; a supplied value that fails its own declaration is named as withheld.** The two are different and the stop distinguishes them. What it does not carry is `restrictions`; see the next section, which is the first thing to read before approving a key change. It does not mint key material, access Secret Manager, disable a service, delete a key, set IAM policy, or create a project.

## Status

Shipped 2026-09-19 from the approved Connector Advisor plan of that date. Fake-provider tests cover input validation, absolute endpoints, restriction rules, keyString projection, and schema agreement.
**Nine of the twelve actions called the vendor on 2026-09-20. Eight returned a successful result; one exercised the error path.** The eight are all three `projects` actions, `services.list`, `services.get`, `services.enable`, `keys.list` and `keys.get`. The ninth is `services.get_operation`, which built its endpoint from a vendor-supplied operation name carrying a dot and received a 400; that exercises the validator and the `vendor_error` path and **does not demonstrate that an operation can be read successfully**. The cause of the 400 is inferred, because the gateway withholds the vendor body.
Two limits on the eight. `services.enable` ran against a service already enabled on the project it was given and returned Google's own `operations/noop.DONE_OPERATION`, which proves the confirmation stop, the request shape and that `serviceusage.services.enable` was permitted there; it does not prove a disabled-to-enabled transition. And no call that a module accepts exercises any validation bound.
`keys.create`, `keys.patch` and `keys.get_operation` have never called the vendor. The `@type` branch of the key reader is therefore **not live-tested**; it is covered against the fake provider in `tests/keys.test.js`, on both `create` and `get_operation`. See `auth.md` for the grant.


## What the confirmation shows and what it does not, which matters most on this connector

`services.enable`, `keys.create` and `keys.patch` are `confirmation: always`. **The stop names the project and the resource, as values and not as field names.** Enabling a service reads:

```
google-cloud.services.enable on google-cloud/services with project="wiser-method-prod",
service="translate.googleapis.com"; risk high; Enable the named service on the named
Google Cloud project
```

**It names what was supplied, and the two ways a field can be missing are not the same.** A field the caller omitted is **absent**: nothing in the stop mentions it. A field the caller supplied whose value fails its own declaration is **named as withheld**, with the keyword it failed, so `project="Not A Project"` produces `project was supplied and is not shown, because it fails its own pattern` rather than a rendered value.

The practical case is `keys.create`, where `key_id` and `display_name` are both optional. Omit `key_id` and the stop names no key identifier at all, because Google will choose one; supply `display_name` and it appears. **So what a `keys.create` approval identifies depends on what the call carried**, and it is always at least the project.

This matters here more than anywhere else in this plugin, because the grant is **user-scoped**. A `cloud-platform` grant carries every project the signed-in user can reach, so an approval that could not name the project was an approval of "enable this service somewhere". **It can now name it.**

**What the stop still does not show is `restrictions`, and on two actions that is the change itself.** `keys.create` and `keys.patch` both take `restrictions` as a nested object, and the gateway's disclosure policy renders no nested input. So a `keys.patch` stop reads:

```
google-cloud.keys.patch on google-cloud/keys with project="wiser-method-prod",
key_id="a1b2c3d4-key"; the content of restrictions is not shown, so this approves the
target and not the change; risk high; Patch restrictions on the named API key in the
named Google Cloud project
```

**So approving `keys.patch` approves which key on which project, and not what the restriction becomes.** Read the intended restriction from the call you are approving rather than from the stop. `services.enable` has no such gap, because there the target *is* the change.

**This is a decided limit and not an oversight.** Showing the target alone was decided on 2026-09-20, against a rendered comparison of both stops, and nothing is scheduled to render a nested input; the gateway's own `AGENTS.md` carries the rule and the reasoning. A later reader should not read the absence as a gap waiting to be closed here.

**The section this replaces described the opposite**, and was accurate when written: until 2026-09-20 the stop carried field names and no values at all. That gap held a public release. It is closed, and the paragraph naming it has gone with it rather than being left to mislead.

## Reaching it

Through the gateway, by action id. Required fields, project-id shape, service and key-id path rules, int32 bounds, the policy-version enum, restriction shape, and undeclared keys are checked in the module before transport. Undeclared keys are refused with `invalid_arguments`.

`describe_action` publishes each action's input schema from `manifest.json`, and a module stricter than its published schema misleads whoever composes a call from it. The project-id pattern, the service emptiness and slash checks, the key-id path pattern, the operation-name substring, the int32 range on `page_size`, the `requested_policy_version` enum of 0, 1 and 3, the 63-character `display_name` cap, and the required non-empty `api_targets` all live in that schema as well as in the module.

JSON Schema cannot carry three rules the module still enforces, and they are named here rather than left as a silent gap. The reason the four non-`apiTargets` restriction kinds are refused, that a key this capability mints is a server-side key, is a message on `invalid_arguments` and not a schema keyword; the schema refuses those keys as additional properties. The reader projects a `V2Key` and never forwards `keyString`; that is an output rule and the published input schema has nowhere to put it. It also recognises and drops `@type`, because a key returned inside an `Operation.response` is a `google.protobuf.Any` and the generated schema says that object "Contains field `@type` with type URL". A reader that refused it would turn every successful key creation into a `vendor_error` at the first live write, and a type URL is transport rather than result. `get_iam_policy` is a POST that reads: Google's shape, not a mutation. Its `risk` and `confirmation` describe the effect rather than the verb.

| Action | Input |
|--------|-------|
| `google-cloud.projects.get` | Required `project`, either a project id, being 6 to 30 characters starting with a lowercase letter and not ending in a hyphen, or a project number of up to 19 digits. Resource Manager's own example is a number, `projects/415104041262`, and the path patterns take either at all four hosts |
| `google-cloud.projects.search` | Optional `query`, any string with no pattern and no length bound; optional `page_size`, an int32; optional `page_token`, any string. Send only what the caller supplied |
| `google-cloud.projects.get_iam_policy` | Required `project`; optional `requested_policy_version`, an int32 whose valid values are 0, 1 and 3. 2 is not a member. When supplied, the body is `{ "options": { "requestedPolicyVersion": n } }`; when not, `{}` |
| `google-cloud.services.list` | Required `project`; optional `filter`, any string, with the documented `state:ENABLED` form named here and not enforced; optional `page_size`; optional `page_token` |
| `google-cloud.services.get` | Required `project` and `service` |
| `google-cloud.services.enable` | Required `project` and `service`. The request body is `{}`. Confirmation always, and the stop carries both values, so the target and the change are the same thing here |
| `google-cloud.services.get_operation` | Required `operation_name`, matching `^operations/(?!\.{1,2}$)[^/]+$`. That is the pattern both generated documents declare, `^operations/[^/]+$`, narrowed to exclude `.` and `..`, which the module has always refused and the published pattern admitted until 2026-09-20. The id is encoded as one path segment |
| `google-cloud.keys.list` | Required `project`; optional `page_size`, `page_token`, `show_deleted` |
| `google-cloud.keys.get` | Required `project` and `key_id` |
| `google-cloud.keys.create` | Required `project` and `restrictions`; optional `key_id` as a query parameter matching `[a-z]([a-z0-9-]{0,61}[a-z0-9])?`, which the generated parameter states in its description as a hard rule and which also excludes UUID-like ids; optional `display_name` of at most 63 characters. Confirmation always; the stop carries whichever of `project`, `key_id` and `display_name` the caller supplied and that passes its own declaration, and says in words that `restrictions` is not shown. **Both `key_id` and `display_name` are optional**, so a create that supplies neither is approved by project alone, and one that supplies `display_name` names that too |
| `google-cloud.keys.patch` | Required `project`, `key_id`, `restrictions`. `updateMask=restrictions` is fixed. Confirmation always; the stop carries `project` and `key_id` and says in words that `restrictions` is not shown, so it approves the target and not the change |
| `google-cloud.keys.get_operation` | Required `operation_name`, matching `^operations/(?!\.{1,2}$)[^/]+$`. That is the pattern both generated documents declare, `^operations/[^/]+$`, narrowed to exclude `.` and `..`, which the module has always refused and the published pattern admitted until 2026-09-20. The id is encoded as one path segment |

`project` is either a project id, being 6 to 30 lowercase ASCII letters, digits or hyphens, starting with a letter and not ending in a hyphen, which is Google's `Project.projectId` rule and nothing more; or a project number of up to 19 digits, which Resource Manager's own parameter description gives as its example and which `tests/keys.test.js` asserts is accepted. This sentence said a project number was refused until 2026-09-20, contradicting the action table above it and the manifest pattern both. The `projects` module carries no test of its own for the number form; the coverage is on `keys`, and the validator is shared.

`service` is a nonempty string with no whitespace and no `/`. The schema states no pattern; emptiness and slash are the module's own checks, needed to build a well-formed path.

`key_id` on `get` and `patch` is a nonempty path segment with no `/`. On `create` it is an optional query parameter whose rule the generated description states as a regular expression, `[a-z]([a-z0-9-]{0,61}[a-z0-9])?`, lower case and at most 63 characters; that description also says an id must not be UUID-like, which this module does not enforce. That is deliberately not the `get` rule: `get` reads an id Google already assigned, `create` proposes a new one.

`restrictions` is `{ api_targets: [ { service, methods? }, ... ] }`. `api_targets` is required and must have at least one entry. Every entry requires `service`. `methods` is optional, an array of strings; an absent or empty list is the vendor's "all methods for the service" and is not refused. `browser_key_restrictions`, `android_key_restrictions`, `ios_key_restrictions` and `server_key_restrictions` are refused by name. The wire body is camelCase `apiTargets`. `global` is hardcoded on every keys path and is not a caller input.

Every response type here declares no required field, so every reader recognises its envelope by key set, never by one required key, and types the members that are present without requiring any, arrays and non-arrays alike. `{}` is a success. An envelope with an unknown key, or a present member of the wrong type, is a `vendor_error` naming the endpoint and the method, never the body. `readKey` returns `name`, `uid`, `displayName`, `restrictions`, `createTime`, `updateTime`, `etag`, `annotations` and `serviceAccountEmail`, and never forwards `keyString`. The same projection is applied to each item of a list and to `Operation.response` on the keys writes and `keys.get_operation`.

`services.enable` returns a long-running `Operation`. `done: false` is the normal first answer. `get_operation` exists so a caller can resolve it without a second connector.

All three modules return vendor data without transport headers and preserve gateway status objects. They do not return the vendor body on an error. Results are source material, not a grant to mutate another project, not a key value, and not a verdict that a service is safe to enable.

## Credentials

Hosted connect through the gateway's provider holds one OAuth grant. The auth config hangs off toolkit `GOOGLEBIGQUERY` because that is the only Google toolkit the provider ships that carries `OAUTH2`. That filing is decided, not cosmetic: `list_connections` and any audit will show a Cloud connector under BigQuery. The config must be the only one on that toolkit; a second config takes the toolkit out of service for the next `start_connect`, and if this custom config is deleted the next `start_connect` attempts to create a provider-managed one with that toolkit's default scopes, which are the wrong scopes for Cloud. See `auth.md`.

The modules use authenticated proxy calls to absolute HTTPS endpoints on three hosts, never a credential file or an unwrapped token. No Provides secret key is required. `getKeyString` is not an action. Secret Manager is not a module.

A user OAuth grant carries what that user can reach. A grant that can see eight projects can name any of them on a write. The description names the project and the stop does not carry it; there is no allowlist.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `projects` | `read` | `get`, `search`, `get_iam_policy` |
| `services` | `write` | `list`, `get`, `enable`, `get_operation` |
| `keys` | `write` | `list`, `get`, `create`, `patch`, `get_operation` |

A grant is per module. Privilege describes the grant, not just these actions: `services` and `keys` are `write` because the grant can mutate through them; `projects` is `read` because it cannot. `get_operation` is a read action on a write module so a caller can resolve the long-running result of `enable` or `create` without a second connector.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `services.enable` | Enables the named service on the named project; durable | always |
| `keys.create` | Creates a restricted API key on the named project; someone must then manage it | always |
| `keys.patch` | Overwrites restrictions on the named key in the named project | always |

`getKeyString`, Secret Manager, `keys.delete`, `keys.undelete`, `services.disable`, `setIamPolicy`, project creation, billing, organisation policy, Kubernetes, Compute, App Engine, Cloud Run, Cloud Build, Artifact Registry, service account creation, and service account key minting are excluded.

## Troubleshooting

- `needs_connect`: follow `auth.md` for the named module's grant.
- `needs_confirmation`: the summary names the action, the project field, and the resource field; review those, then repeat with `confirm: true` if intended.
- `invalid_arguments`: provide a project id of 6 to 30 lowercase letters, digits or hyphens, starting with a letter and not ending in a hyphen; a nonempty `service` with no whitespace and no `/`; a nonempty `key_id` with no `/` on `get` and `patch`; an `operation_name` matching `^operations/(?!\.{1,2}$)[^/]+$`, which refuses `.` and `..`; `requested_policy_version` 0, 1 or 3; `restrictions` with at least one `api_targets` entry that names a `service`; and none of the four client-restriction kinds.
- `vendor_error` with 401 or 403: have the operator check the grant, the enabled APIs, and that the named project is one the grant can reach; never paste a token in chat.
- `vendor_error` with 429: stop and wait for the vendor's rate-limit window; do not poll.

## Reference

The implementation follows the approved Connector Advisor plan dated 2026-09-19. Bounds are from Cloud Resource Manager v3 revision 20260909, Service Usage v1 revision 20260902, and API Keys v2 revision 20260902. Endpoints: `GET https://cloudresourcemanager.googleapis.com/v3/projects/{project}`, `GET https://cloudresourcemanager.googleapis.com/v3/projects:search`, `POST https://cloudresourcemanager.googleapis.com/v3/projects/{project}:getIamPolicy`, `GET https://serviceusage.googleapis.com/v1/projects/{project}/services`, `GET https://serviceusage.googleapis.com/v1/projects/{project}/services/{service}`, `POST https://serviceusage.googleapis.com/v1/projects/{project}/services/{service}:enable`, `GET https://serviceusage.googleapis.com/v1/{operation_name}`, `GET https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys`, `GET https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys/{key_id}`, `POST https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys`, `PATCH https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys/{key_id}?updateMask=restrictions`, `GET https://apikeys.googleapis.com/v2/{operation_name}`. Which actions have called the vendor is in `## Status`.

Connect with `auth.md`; the module contract is in `gateway/AGENTS.md`.
