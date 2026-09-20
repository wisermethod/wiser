---
name: google-cloud
type: connector
category: development
description: Reads Google Cloud projects and IAM policy, lists and enables services, and creates restricted API keys, with every mutation confirmed on the named project
version: 0.1.0
---

# Google Cloud

Reads project metadata and IAM policy through Cloud Resource Manager, lists and enables services through Service Usage, and lists, reads, creates, and patches restricted API keys through API Keys v2. Every mutating action is `confirmation: always` and names the project and the resource in its **description**, which is fixed text. The stop does not carry the values sent; see the next section, which is the first thing to read on this connector. It does not mint key material, access Secret Manager, disable a service, delete a key, set IAM policy, or create a project.

## Status

Shipped 2026-09-19 from the approved Connector Advisor plan of that date. Fake-provider tests cover input validation, absolute endpoints, restriction rules, keyString projection, and schema agreement. Live behavior unverified. The human connect and the first live project read, service enablement, and restricted key creation are Expand Session 5. See `auth.md` for the grant.

## What the confirmation does not tell you, and it matters most on this connector

`services.enable`, `keys.create` and `keys.patch` are `confirmation: always`. **The stop a person sees names the action, the risk, the description, and the field names supplied. It does not carry the field values, so it does not say which project.** That is deliberate in the gateway, at `gateway/src/gateway.js`: it returns the names of declared fields and counts the rest, so an undeclared key cannot carry a value back through its own name. **Filtering names is not the same as being unable to show validated values**, and the gateway does not distinguish the two today: it shows no values at all. Showing an allowlisted, validated value for a declared field is a change nobody has made.

It matters here more than anywhere else in this plugin, because the grant is **user-scoped**. A `cloud-platform` grant carries every project the signed-in user can reach, so an approval that cannot name the project is an approval of "enable this service somewhere". Each mutating action names the project and the resource in its own `description`, which the stop does carry, but a description is fixed text and not the value sent.

**Until the gateway can show an allowlisted, validated value for a declared field, treat the confirmation as necessary and not sufficient**, and read the intended project from the call you are approving rather than from the stop. This is a known gap recorded against this build, not an oversight.

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
| `google-cloud.services.enable` | Required `project` and `service`. The request body is `{}`. Confirmation always. The description names the project and the service as words; the stop does not carry their values |
| `google-cloud.services.get_operation` | Required `operation_name`, matching `^operations/[^/]+$`, the pattern both generated documents declare. `.` and `..` are refused and the id is encoded as one path segment |
| `google-cloud.keys.list` | Required `project`; optional `page_size`, `page_token`, `show_deleted` |
| `google-cloud.keys.get` | Required `project` and `key_id` |
| `google-cloud.keys.create` | Required `project` and `restrictions`; optional `key_id` as a query parameter matching `[a-z]([a-z0-9-]{0,61}[a-z0-9])?`, which the generated parameter states in its description as a hard rule and which also excludes UUID-like ids; optional `display_name` of at most 63 characters. Confirmation always. The description names the project and the key as words; the stop does not carry their values |
| `google-cloud.keys.patch` | Required `project`, `key_id`, `restrictions`. `updateMask=restrictions` is fixed. Confirmation always. The description names the project and the key as words; the stop does not carry their values |
| `google-cloud.keys.get_operation` | Required `operation_name`, matching `^operations/[^/]+$`, the pattern both generated documents declare. `.` and `..` are refused and the id is encoded as one path segment |

`project` is 6 to 30 lowercase ASCII letters, digits, or hyphens, starting with a letter and not ending in a hyphen. That is Google's `Project.projectId` rule and nothing more; a project number is refused because it does not start with a letter.

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
- `invalid_arguments`: provide a project id of 6 to 30 lowercase letters, digits or hyphens, starting with a letter and not ending in a hyphen; a nonempty `service` with no whitespace and no `/`; a nonempty `key_id` with no `/` on `get` and `patch`; an `operation_name` matching `^operations/[^/]+$`, which refuses `.` and `..`; `requested_policy_version` 0, 1 or 3; `restrictions` with at least one `api_targets` entry that names a `service`; and none of the four client-restriction kinds.
- `vendor_error` with 401 or 403: have the operator check the grant, the enabled APIs, and that the named project is one the grant can reach; never paste a token in chat.
- `vendor_error` with 429: stop and wait for the vendor's rate-limit window; do not poll.

## Reference

The implementation follows the approved Connector Advisor plan dated 2026-09-19. Bounds are from Cloud Resource Manager v3 revision 20260909, Service Usage v1 revision 20260902, and API Keys v2 revision 20260902. Endpoints: `GET https://cloudresourcemanager.googleapis.com/v3/projects/{project}`, `GET https://cloudresourcemanager.googleapis.com/v3/projects:search`, `POST https://cloudresourcemanager.googleapis.com/v3/projects/{project}:getIamPolicy`, `GET https://serviceusage.googleapis.com/v1/projects/{project}/services`, `GET https://serviceusage.googleapis.com/v1/projects/{project}/services/{service}`, `POST https://serviceusage.googleapis.com/v1/projects/{project}/services/{service}:enable`, `GET https://serviceusage.googleapis.com/v1/{operation_name}`, `GET https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys`, `GET https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys/{key_id}`, `POST https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys`, `PATCH https://apikeys.googleapis.com/v2/projects/{project}/locations/global/keys/{key_id}?updateMask=restrictions`, `GET https://apikeys.googleapis.com/v2/{operation_name}`. Live behavior unverified.

Connect with `auth.md`; the module contract is in `gateway/AGENTS.md`.
