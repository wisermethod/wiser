---
name: x
type: connector
category: communication
description: Reads the connected X account, one post and the account's own recent posts, and creates or deletes one post with confirmation
version: 0.1.0
---

# X

X is a social publishing platform. This connector reads the connected account, reads one post, lists that account's own recent posts, and creates or deletes one post with confirmation. It uses the gateway's authenticated proxy at absolute `https://api.x.com/2/...` URLs. The `xai` connector reaches xAI's model API, a different service.

## Status

Shipped 2026-11-09 in `v2026.11.09` with the four step-A actions, verified that day through the Wiser endpoint: `me`, `get_post` and `recent_posts` answered, and `delete_post` on an id no post holds answered `deleted: true`. The response checks below follow those answers. `create_post` is tested against the fake provider only until its first live post.

## Reaching it

Call these action ids through the gateway:

| Action | Input | Risk | Confirmation | Vendor request |
|--------|-------|------|--------------|----------------|
| `x.account.me` | `{}` | low | none | `GET /2/users/me?user.fields=username` |
| `x.account.get_post` | `{ post_id }` | low | none | `GET /2/tweets/{post_id}?tweet.fields=created_at,author_id,conversation_id` |
| `x.account.recent_posts` | `{ max_results? }` | low | none | `GET /2/users/me`, then `GET /2/users/{id}/tweets?max_results=n&tweet.fields=created_at` |
| `x.account.delete_post` | `{ post_id }` | high | always | `DELETE /2/tweets/{post_id}` |
| `x.account.create_post` | `{ text, reply_to?, allow_url? }` | high | always | `POST /2/tweets` |

Every input is an object with `additionalProperties: false`. `post_id` is a required string matching `^[0-9]{1,19}$`. `max_results` is an optional integer with minimum 5 and maximum 10; the module enforces those bounds and sends 5 when omitted. It sends `max_results` on the tweets request only, never on `/2/users/me`. There is no `user_id` input: the account is always the connected one. The second request uses only the first call's `data.id` and is refused unless that id is a string matching `^[0-9]{1,19}$`.

`create_post` requires `text` containing a non-whitespace character, from 1 to 280 code points. `reply_to` optionally names a post id matching `^[0-9]{1,19}$`; `allow_url` is an optional boolean. The request body is exactly `{text}`, or `{text, reply: {in_reply_to_tweet_id}}` for a reply. Neither input control is sent to X as an extra field.

The module also caps text at weight 280: code points 0 to 4351, 8192 to 8205, 8208 to 8223 and 8242 to 8247 each weigh 1; every other code point weighs 2. This is a conservative connector cap, not a measured copy of X's rule. No URL span receives a shorter weight. If the module detects a URL (a scheme followed by `://`, `www.`, or a dotted host whose last label is two or more letters, so `Pitch: Cut`, `e.g.` and `U.S.` are not URLs), it refuses the text unless `allow_url` is `true`. This format rule supports putting links in the first reply. It is not a cost bound: X's own URL detector is unpublished and may differ.

The four read/delete response checks follow captured answers, with invented ids, handles and text in tests:

| Action | Checked answer and return value |
|--------|---------------------------------|
| `me` | `data` is an object with a string `id` matching `^[0-9]{1,19}$`, a string `username` matching `^[A-Za-z0-9_]{1,15}$`, and a string `name`; returns that object as received |
| `get_post` | `data` is an object whose `id` equals the input `post_id` and whose `text` is a string; returns that object as received |
| `recent_posts` | After the existing first-call id check, `data` is an array no longer than the `max_results` sent, each item an object with a string `id` matching `^[0-9]{1,19}$` and a string `text`; returns the array as received |
| `delete_post` | `data.deleted` is a boolean; returns only `{ deleted }` |

A failed response check returns `vendor_error` with `reason: unexpected_response`, the request endpoint without its query, and its method. For `recent_posts`, X documents an empty timeline as absent `data` with `meta.result_count` equal to 0; that case returns `[]` and has no live capture. `create_post` returns the vendor's `data` unchecked until its first live capture supports step C's response check.

On every action, absent `data` otherwise returns `vendor_error` with `reason: no_data`, the endpoint without its query, and the method. Only an `errors[0].type` matching `^https://api\.(?:twitter|x)\.com/2/problems/[a-z-]{1,64}$` is copied as `problem`; no other vendor error field is returned.

X answers `deleted: true` even for an id that no post holds. A delete's answer therefore does not show that a post existed. Confirm a deletion by reading the post afterwards.

## Credentials

The gateway's provider holds the user OAuth grant and refresh token. No client secret, refresh token or access token enters this connector or Wiser. There is no credential file here and no `secrets:x` key.

Who can connect, and who pays, depends on the route (`auth.md`, Which route):

| Route | Who can connect | Whose app, and who pays X |
|-------|-----------------|---------------------------|
| The Wiser endpoint | Only an account the service names for X; any other is told "This connector is not offered on the hosted endpoint. It works through the local gateway." | The service's one X app and auth config, offered only to the accounts it names; the developer account that owns the app pays |
| Your own X app, on the local gateway | Anyone with an X developer account and a provider project of their own | Your own app, made with the provider's custom auth config as `auth.md` directs; your developer account pays |

The requested scopes are exactly `tweet.read tweet.write users.read offline.access`. X's generated schema, version 2.174, describes their reach in these words:

| Scope | Grant's reach, in the schema's own words |
|-------|----------------------------------------|
| `tweet.write` | "Create and repost on your behalf." |
| `tweet.read` | "View all posts you can see, including those from protected accounts." |
| `users.read` | "View any account you can see, including protected accounts." |
| `offline.access` | "Request a refresh token for the app." |

The actions are narrower than the grant. A leaked grant exposes creating posts and reposts as the account, reading every post and account it can see, protected ones included, and the refresh token held by the provider.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `account` | `write` | `me`, `get_post`, `recent_posts`, `delete_post`, `create_post` |

One module means one connect turn. Its privilege reflects the grant's write scope, including on reads; confirmation and risk are set separately for each action.

## Destructive Actions

X's own API pricing page was read on 2026-11-06 and re-read on 2026-11-09 with these prices unchanged. Charges and X's limits fall on the account and credits of the developer app the connection uses, on either route (Credentials); each proxied request also counts against the provider project that holds the auth config. That project's limit is unverified.

| Action | Effect and worst case of one invocation | Confirmation |
|--------|-----------------------------------------|--------------|
| `x.account.me` | One User: Read resource at $0.010, worst case $0.010 | none |
| `x.account.get_post` | One Posts: Read resource at $0.005, worst case $0.005 | none |
| `x.account.recent_posts` | One User: Read at $0.010 plus at most 10 Posts: Read resources at $0.005 each, worst case $0.060 | none |
| `x.account.delete_post` | Deletes the named post; treat it as irreversible. Interaction: Delete is $0.010 per request; a refused request's billing is unpublished and unknown | always |
| `x.account.create_post` | Publishes one post or reply. Post: Create is $0.015 per request, or $0.200 with URL; worst case $0.200 regardless of the module detector | always |

Owned Reads cost $0.001 per resource when the user id matches the authenticated user and that user owns the developer app. X lists `/2/users/{id}/tweets` as "Your own posts". At that rate, `recent_posts` costs at most $0.010 + 10 × $0.001 = $0.020; the stated worst case remains $0.060 because application of that rate is unverified. Resources are deduplicated within a 24-hour UTC day. The minimum credit purchase is unpublished in the evidence. Set a spending limit on the developer account.

## Excluded

Excluded: likes, reposts, follows, mutes and blocks; direct messages; bookmarks and lists; media upload and polls; search and counts; quote posts; editing; and any other account's posts in bulk.

## Troubleshooting

- `needs_connect`: connect the `account` module; on your own X app, after preparing the custom auth config in `auth.md`.
- "This connector is not offered on the hosted endpoint. It works through the local gateway.": the service does not name this account for X. Connect X with your own X app on the local gateway, as `auth.md` says.
- `needs_confirmation`: check the exact text and reply target before publishing, or the post id before deleting, then match the stop.
- `invalid_arguments`: correct the named field; `max_results` must be an integer from 5 through 10. Text must fit both caps; `url_requires_allow_url` requires explicit `allow_url: true` for detected links.
- `vendor_error` with `reason: unexpected_response` or `no_data`: the answer did not meet the documented response contract; inspect the endpoint and any safe `problem` before deciding the next step.
- `vendor_error` with 401 or 403: check the grant and app permissions; the gateway refreshes the provider's grant status and returns `needs_connect` if that grant is no longer usable.
- `vendor_error` with 429: stop and check X's limits and the provider project's quota before another call.
- `vendor_error` with 5xx: stop and check service availability before another call.
- `vendor_error` on `/2/users/me` without an HTTP status during `recent_posts`: the id could not safely form the second request; capture the answer for review before changing a response check.

## Reference

- How to connect: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Published input schema: `standards/script-contract.md`
- [X generated OpenAPI schema](https://api.x.com/2/openapi.json), version 2.174, read 2026-11-06
- X's own API pricing page, read 2026-11-06; rates above are from the approved connector plan
