---
name: twenty
type: connector
category: crm
description: Reads and creates records, objects, fields and select options in one Twenty workspace, confirming every write
version: 0.1.0
---

# Twenty

Reads and creates records, objects, fields and select options in one self-hosted Twenty workspace. Every endpoint is relative to that install's address. No action takes a host as input.

## Status

Shipped 2026-10-10. Verification is fake-provider only, with invented results. The human connect is separate and is not claimed here. See `auth.md`.

## Email

Twenty has three kinds of email.

- Team email comes from the install's one address, over the install's driver.
- Email to contacts comes from each person's own connected mailbox.
- Branded email comes from an organisation's verified emailing domain.

This connector sends none of them. It holds a workspace API key and calls no endpoint that sends. No mailbox is named.

A record `twenty.records.create` creates can start the workspace's own workflows. A workflow the workspace already holds may send from a member's connected mailbox. This connector cannot see that workflow and cannot stop it. Creating a record stops for confirmation every time.

## One workspace

One gateway holds one workspace at a time. A key belongs to one workspace. Connecting again reaches a second workspace and rebinds the record. It does not revoke the key it replaced. Revoke that key in the first workspace's settings. Both modules use one toolkit, so after the first is connected the second may adopt that account. Adoption is skipped when the toolkit has more than one ACTIVE account, and then each module is connected by name. `auth.md` says how.

## Reaching it

Through the gateway, by action id, on the Wiser endpoint or the local gateway. The endpoint holds this toolkit only once the service is set up for it. `auth.md` says which route is yours. API names match `^[a-z][a-zA-Z0-9]{0,62}$`. Length bounds below count code points. The gateway applies types, enums, patterns, required fields and item types before the module runs. The module applies `minLength`, `maxLength`, `minimum`, `maximum`, `minItems`, `maxItems`, `maxProperties`, the `oneOf` that ties `options` to the select types, and every nested rule.

```
twenty.records.list                  { object, limit?, cursor? }
twenty.records.count                 { object }
twenty.records.workspace             {}
twenty.records.create                { object, data }                 confirmation: always
twenty.metadata.list_objects         {}
twenty.metadata.workspace            {}
twenty.metadata.create_object        { nameSingular, namePlural, labelSingular, labelPlural, icon?, description? }  confirmation: always
twenty.metadata.create_field         { objectMetadataId, name, label, type, description?, options? }               confirmation: always
twenty.metadata.add_field_options    { fieldId, options }             confirmation: always
```

`twenty.records.list` sends `GET /rest/<object>?limit=<limit>`, and `&starting_after=` when `cursor` is present. `limit` is an integer from 1 to 60 and defaults to 20. The answer is the records, `pageInfo` and `totalCount` as Twenty returns them.

`twenty.records.count` sends `GET /rest/<object>?limit=1` and returns `totalCount` only. The one record Twenty sends back is dropped inside the module, so counting a populated workspace returns no row.

`twenty.records.workspace` and `twenty.metadata.workspace` read `currentWorkspace` on `POST /metadata` and return its `id`, `subdomain` and `displayName`: the workspace the bound key belongs to. Each module can be bound to its own account, so read both before writing, and stop when either names a workspace other than the one intended.

`twenty.records.create` sends `POST /graphql`. The mutation name is `object` with its first letter upper-cased, and the field values travel only as GraphQL variables. It returns the new record's `id`. `data` holds at most 100 values, and each key is an API name.

`twenty.metadata.list_objects` sends `POST /metadata` for the workspace's objects and their fields. It takes an empty object.

`twenty.metadata.create_object` sends `createOneObject`. `nameSingular` and `namePlural` must differ. `namePlural` publishes the same API-name language as `^[a-z](?:[a-zA-Z0-9]{0,62})$`, so the two fields are not given one exemplar. Labels are 1 to 63 code points. `icon`, when present, matches `^Icon[A-Za-z0-9]{1,60}$`. `description`, when present, is at most 500 code points.

`twenty.metadata.create_field` sends `createOneField`. `type` is `TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `DATE_TIME`, `SELECT` or `MULTI_SELECT`. `options` is required for `SELECT` and `MULTI_SELECT` and refused for every other type. Each list is 1 to 50 items. A label is 1 to 63 code points and contains no comma. A `value` matches `^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, is at most 63 characters, and is unique within the list. `color` is one of `red`, `ruby`, `crimson`, `tomato`, `orange`, `amber`, `yellow`, `lime`, `grass`, `green`, `jade`, `mint`, `turquoise`, `cyan`, `sky`, `blue`, `iris`, `violet`, `purple`, `plum`, `pink`, `bronze`, `gold`, `brown`, `gray`. The module sets `position` from the order.

`twenty.metadata.add_field_options` reads the field with `field(id:)`, then appends. It refuses a type other than `SELECT` or `MULTI_SELECT`, a `value` or a label already on the field, and a combined list that would pass 100 options. Those three are read from the field, so the schema cannot state them. It then sends the existing options unchanged and in order, followed by the new ones, with positions continuing from the number of options already there. It does not remove, rename or reorder an option.

A label Twenty counts in UTF-16 units can pass the code-point bound here and still be refused by Twenty. A label in emoji is the case.

A self-hosted install charges nothing per call. Every write takes `always`, because one approval does not cover another write.

## Credentials

This connector holds none. The gateway's provider holds the workspace API key for toolkit `CUSTOM_TWENTY`. There is no credential file here, nothing is unwrapped, and there is no `secrets:twenty` key. The key is assigned the Admin role, so every module's grant privilege is `admin`.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `records` | `admin` | `list`, `count`, `workspace`, `create` |
| `metadata` | `admin` | `list_objects`, `workspace`, `create_object`, `create_field`, `add_field_options` |

A grant is per module. Both modules use one toolkit. How to connect is `auth.md`.

## Destructive Actions

None of these actions deletes a record, deactivates an object or a field, or removes an option. The four writes below create a record, an object or a field, or append options. Each one confirms every time.

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `twenty.records.create` | Creates one record. A workspace workflow may run because of it. | `always` |
| `twenty.metadata.create_object` | Creates one object. | `always` |
| `twenty.metadata.create_field` | Creates one field of one of the seven types. | `always` |
| `twenty.metadata.add_field_options` | Appends options and leaves the ones already there unchanged. | `always` |

## Excluded

- Updating, deleting, restoring or merging records.
- Deleting or deactivating objects and fields.
- Removing, renaming or reordering options.
- Relation fields and every field type outside the seven.
- Batch and import endpoints.
- Files and attachments.
- Workflows, webhooks and API keys.
- Workspace settings, the custom domain among them.
- Invitations.
- Workspace creation.
- Every kind of email.

## Troubleshooting

`needs_connect`: connect the named module in its own turn using `auth.md`. Privilege on that stop is `admin`.

`needs_confirmation`: the call is one of the four writes. Read the stop, then repeat the identical call with `confirm: true` only when it is the one you want. A confirm with no matching stop is a fresh stop.

`denied`: on the local gateway, the shipped default policy denies privilege `admin` for the runtime role. These modules declare `admin`. Until `policy.json` in the gateway home allows service `twenty` at privilege `admin`, no request is sent. On the Wiser endpoint the policy is the service's.

`invalid_arguments`: the named field is missing, the wrong type, or outside a published bound. `nameSingular` and `namePlural` must differ. `options` is refused on a non-select type, required on a select type, and each `value` in one list must be unique. `add_field_options` also refuses a non-select field, a value or label already on that field, and a list that would pass 100 options.

`vendor_error`: the gateway's provider or the transport failed, or Twenty answered a GraphQL call with HTTP 200 and an `errors` array. The status and the endpoint are the safe fields. When the first error's `extensions.code` matches `^[A-Z_]{1,64}$`, the failure also carries that `code`. It never carries the message or the body. A REST failure keeps the gateway's own failure status.

`FORBIDDEN` or `UNAUTHENTICATED`: the key has expired or been revoked. Make a new key and connect again.

## Reference

- How to connect: [auth.md](auth.md)
- The gateway and what a module may do: [gateway/AGENTS.md](../../gateway/AGENTS.md)
- What the published input schema must say, and who applies it: [standards/script-contract.md](../../standards/script-contract.md)
