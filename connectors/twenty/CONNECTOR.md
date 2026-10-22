---
name: twenty
type: connector
category: crm
description: Reads, creates and updates records, and reads and creates objects, fields and select options in Twenty workspaces through labelled connections, confirming every write
version: 0.2.0
---

# Twenty

Reads, creates and updates records, and reads and creates objects, fields and select options in self-hosted Twenty workspaces through labelled connections. Every endpoint is relative to that install's address. No action takes a host as input.

## Status

Shipped 2026-10-10. Version 0.2.0 shipped 2026-10-22. Verification at release is fake-provider only, with invented results. The human connect is separate and is not claimed here. See `auth.md`.

## Email

Twenty has three kinds of email.

- Team email comes from the install's one address, over the install's driver.
- Email to contacts comes from each person's own connected mailbox.
- Branded email comes from an organisation's verified emailing domain.

This connector sends none of them. It holds a workspace API key and calls no endpoint that sends. No mailbox is named. It cannot create or update a workflow, a campaign or a message either: `twenty.records.create` and `twenty.records.update` refuse Twenty's own system objects by name.

A record `twenty.records.create` creates or `twenty.records.update` updates can start the workspace's own workflows. A workflow the workspace already holds may send from a member's connected mailbox. This connector cannot see that workflow and cannot stop it. Creating or updating a record stops for confirmation every time.

## Several workspaces

Each workspace is a labelled connection. Use its subdomain as the label: `acme` for `acme.<base>`. One connect binds both `records` and `metadata` under that label to the same key. Every call names the label. Before any write in a workspace, read `twenty.records.workspace` and `twenty.metadata.workspace` under that label and stop unless both name the workspace whose subdomain equals the label. An unlabelled connection still works as a single workspace. Connecting again under a label replaces that label's key and does not revoke the replaced key in Twenty: revoke it in that workspace's settings. `auth.md` says how.

## Reaching it

Through the gateway, by action id, on the Wiser endpoint or the local gateway. `label` is a gateway argument beside `input`, never an action input. The endpoint holds this toolkit only once the service is set up for it. `auth.md` says which route is yours. API names match `^[a-z][a-zA-Z0-9]{0,62}$`. Length bounds below count code points. The gateway applies types, enums, patterns, required fields and item types before the module runs. The module applies `minLength`, `maxLength`, `minimum`, `maximum`, `minItems`, `maxItems`, `maxProperties`, the `oneOf` that ties `options` to the select types, and every nested rule.

```
twenty.records.list                  { object, limit?, cursor? }
twenty.records.count                 { object }
twenty.records.workspace             {}
twenty.records.create                { object, data }                 confirmation: always
twenty.records.update                { object, id, data }             confirmation: always
twenty.metadata.list_objects         {}
twenty.metadata.workspace            {}
twenty.metadata.create_object        { nameSingular, namePlural, labelSingular, labelPlural, icon?, description? }  confirmation: always
twenty.metadata.create_field         { objectMetadataId, name, label, type, description?, options? }               confirmation: always
twenty.metadata.add_field_options    { fieldId, options }             confirmation: always
```

`twenty.records.list` takes the singular API name as `object`, such as `person`, and also accepts the plural, such as `people`. The seven standard CRM names resolve without a metadata call: `person` to `people`, `company` to `companies`, `opportunity` to `opportunities`, `note` to `notes`, `noteTarget` to `noteTargets`, `task` to `tasks` and `taskTarget` to `taskTargets`. Each of those plurals is used as it is. A custom name takes one `POST /metadata` read of up to 200 objects' `nameSingular` and `namePlural`. A singular match supplies the plural; failing that, a plural match is used as it is. The resolved plural must match the API-name pattern. No match is `invalid_arguments` on `object`, or `vendor_error` with `code` `RESULT_INCOMPLETE` when another metadata page exists. A malformed answer or an unsafe plural is `vendor_error`. No REST call follows a failed resolution.

The list sends `GET /rest/<plural>?limit=<limit>`, and `&starting_after=` when `cursor` is present. `limit` is an integer from 1 to 60 and defaults to 20. All input checks run before name resolution. The answer is the records, `pageInfo` and `totalCount` as Twenty returns them.

`twenty.records.count` takes the singular API name as `object`, also accepts the plural, and resolves the name by the same rules as `list`. Standard CRM names need no extra call. A custom name takes one metadata read. It sends `GET /rest/<plural>?limit=1` and returns `totalCount` only. The one record Twenty sends back is dropped inside the module, so counting a populated workspace returns no row.

`twenty.records.workspace` and `twenty.metadata.workspace` read `currentWorkspace` on `POST /metadata` and return its `id`, `subdomain` and `displayName`: the workspace the bound key belongs to. Each module can be bound to its own account, so read both before writing, and stop when either names a workspace other than the one intended.

`twenty.records.create` sends `POST /graphql`. The mutation and its input type carry `object` as Twenty spells it in a type name, its words split as lodash `camelCase` splits them and each capitalized: `person` is `createPerson` and `PersonCreateInput`, and `foo2bar` is `createFoo2Bar`. The field values travel only as GraphQL variables. It returns the new record's `id`. `data` holds at most 100 values, and each key is an API name.

`twenty.records.update` sends `POST /graphql` with `update<Name>(id: $id, data: $data)` and `<Name>UpdateInput`, where `<Name>` is spelled as for `create`. `id` is a lowercase UUID. It sets the named fields and leaves every other field as it is. `data` holds at most 100 values, and each key is an API name. Twenty's own fields `id`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy` and `searchVector` are refused as keys, so an update never deletes or restores a record. A SELECT field takes an option's value, such as an opportunity's `stage`. An option whose value starts with a digit is sent with a leading underscore, as Twenty's GraphQL names it; an option this connector creates always starts with a letter. A relation is set by its id field, such as `pointOfContactId` or `companyId`. The id and field values travel only as GraphQL variables. It returns the record's `id`. An update can start the workspace's own workflows, and such a workflow may send email. This action sends none.

For `create` and `update`, `object` may be `person`, `company`, `opportunity`, `note`, `noteTarget`, `task`, `taskTarget` or a custom object. Every other standard object of Twenty `v2.45.6` is refused by name before any call, and both patterns publish the same list: `agentChatThread`, `agentChatThreadTarget`, `agentMessage`, `agentMessagePart`, `agentTurn`, `agentTurnEvaluation`, `attachment`, `blocklist`, `calendarChannelEventAssociation`, `calendarEvent`, `calendarEventParticipant`, `calendarEventTarget`, `callRecording`, `campaignDelivery`, `dashboard`, `message`, `messageCampaign`, `messageChannelMessageAssociation`, `messageChannelMessageAssociationMessageFolder`, `messageList`, `messageListMember`, `messageParticipant`, `messageSuppression`, `messageThread`, `messageThreadTarget`, `recordShare`, `shortLink`, `timelineActivity`, `workflow`, `workflowAutomatedTrigger`, `workflowRun`, `workflowVersion` and `workspaceMember`. A created workflow, campaign or message could send email, and the rest are the workspace's own machinery. A standard object a later Twenty version adds is not on the list until this connector names it.

`twenty.metadata.list_objects` sends `POST /metadata` for the workspace's objects and their fields. It returns `isSystem` on both objects and fields. It takes an empty object. It asks for 200 objects and 200 fields per object. A workspace past either is refused as `vendor_error` with `code` `RESULT_INCOMPLETE`, never returned in part.

`twenty.metadata.create_object` sends `createOneObject`. `nameSingular` and `namePlural` must differ. `namePlural` publishes the same API-name language as `^[a-z](?:[a-zA-Z0-9]{0,62})$`, so the two fields are not given one exemplar. Labels are 1 to 63 code points. `icon`, when present, matches `^Icon[A-Za-z0-9]{1,60}$`. `description`, when present, is at most 500 code points.

`twenty.metadata.create_field` sends `createOneField`. `type` is `TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `DATE_TIME`, `SELECT` or `MULTI_SELECT`. `options` is required for `SELECT` and `MULTI_SELECT` and refused for every other type. Each list is 1 to 50 items. A label is 1 to 63 code points and contains no comma. A `value` matches `^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, is at most 63 characters, and is unique within the list. `color` is one of `red`, `ruby`, `crimson`, `tomato`, `orange`, `amber`, `yellow`, `lime`, `grass`, `green`, `jade`, `mint`, `turquoise`, `cyan`, `sky`, `blue`, `iris`, `violet`, `purple`, `plum`, `pink`, `bronze`, `gold`, `brown`, `gray`. The module sets `position` from the order.

`twenty.metadata.add_field_options` reads the field with `field(id:)`, then appends, positions continuing above the highest existing one. It reads and then writes the whole list, and Twenty has no conditional update, so no one else may change that field's options while it runs: an option added by another caller in between is lost. It refuses a type other than `SELECT` or `MULTI_SELECT`, a `value` or a label already on the field, and a combined list that would pass 100 options. Those three are read from the field, so the schema cannot state them. It then sends the existing options unchanged and in order, followed by the new ones. It does not remove, rename or reorder an option.

A label Twenty counts in UTF-16 units can pass the code-point bound here and still be refused by Twenty. A label in emoji is the case.

A self-hosted install charges nothing per call. Every write takes `always`, because one approval does not cover another write.

## Credentials

This connector holds none. The gateway's provider holds the workspace API key for toolkit `CUSTOM_TWENTY`. There is no credential file here, nothing is unwrapped, and there is no `secrets:twenty` key. The key is assigned the Admin role, so every module's grant privilege is `admin`.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `records` | `admin` | `list`, `count`, `workspace`, `create`, `update` |
| `metadata` | `admin` | `list_objects`, `workspace`, `create_object`, `create_field`, `add_field_options` |

A grant is per module. Both modules use one toolkit. How to connect is `auth.md`.

## Destructive Actions

None of these actions deletes a record, deactivates an object or a field, or removes an option. The five writes below create or update a record, create an object or a field, or append options. An update replaces the values it names and keeps no copy of the old ones. Each one confirms every time.

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `twenty.records.create` | Creates one record. A workspace workflow may run because of it. | `always` |
| `twenty.records.update` | Replaces the named field values and keeps no copy of the old ones. A workspace workflow may run because of it. | `always` |
| `twenty.metadata.create_object` | Creates one object. | `always` |
| `twenty.metadata.create_field` | Creates one field of one of the seven types. | `always` |
| `twenty.metadata.add_field_options` | Appends options and leaves the ones already there unchanged. | `always` |

## Excluded

- Deleting, restoring or merging records.
- Deleting or deactivating objects and fields.
- Removing, renaming or reordering options.
- Creating relation fields, and every field type outside the seven. An update can set an existing relation through its id field.
- Batch and import endpoints.
- Files and attachments.
- Twenty's own system objects, named under `twenty.records.create`: workflows, campaigns, messages, calendar events, attachments, workspace members and the rest.
- Webhooks and API keys.
- Workspace settings, the custom domain among them.
- Invitations.
- Workspace creation.
- Every kind of email.

## Troubleshooting

`needs_connect`: connect the named module in its own turn using `auth.md`. Privilege on that stop is `admin`.

`needs_confirmation`: the call is one of the five writes. Read the stop, then repeat the identical call with `confirm: true` only when it is the one you want. A confirm with no matching stop is a fresh stop.

`denied`: on the local gateway, the shipped default policy denies privilege `admin` for the runtime role. These modules declare `admin`. Until `policy.json` in the gateway home allows service `twenty` at privilege `admin`, no request is sent. On the Wiser endpoint the policy is the service's.

`invalid_arguments`: the named field is missing, the wrong type, or outside a published bound. On `twenty.records.create` and `twenty.records.update`, `object` is also refused when it names one of Twenty's system objects. On `update`, `id` must be a lowercase UUID, and a `data` key that is one of Twenty's own fields is refused. `nameSingular` and `namePlural` must differ. `options` is refused on a non-select type, required on a select type, and each `value` in one list must be unique. `add_field_options` also refuses a non-select field, a value or label already on that field, and a list that would pass 100 options.

`vendor_error`: the gateway's provider or the transport failed, or Twenty answered a GraphQL call with HTTP 200 and an `errors` array. When the first error's `extensions.code` matches `^[A-Z_]{1,64}$`, the failure carries that `code`. It also carries `message` when the first error's message is a string. Control characters U+0000 to U+001F and U+007F become spaces, the text is trimmed, and it is cut to at most 300 code points. An empty message is omitted. A message matching `token|secret|passw(?:or)?d|credential|api[\s_-]*key|bearer|authorization`, without regard to case, or containing a JWT-shaped run matching `eyJ[A-Za-z0-9_-]{10,}`, is omitted, tested with its control characters removed as well as replaced. A message can repeat a value the call sent, such as an id Twenty could not read. No data, second error, path, locations or other extensions are returned. A REST failure keeps the gateway's own failure status and carries neither `code` nor `message`.

`FORBIDDEN` or `UNAUTHENTICATED`: the key has expired or been revoked. Make a new key and connect again.

## Reference

- How to connect: [auth.md](auth.md)
- The gateway and what a module may do: [gateway/AGENTS.md](../../gateway/AGENTS.md)
- What the published input schema must say, and who applies it: [standards/script-contract.md](../../standards/script-contract.md)
