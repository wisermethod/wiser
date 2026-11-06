---
name: x
type: connector
category: communication
description: Reads the connected X account, one post and the account's own recent posts, and deletes one post with confirmation
version: 0.1.0
---

# X

X is a social publishing platform. This connector reads the connected account, reads one post, lists that account's own recent posts, and deletes one post. It uses the gateway's authenticated proxy at absolute `https://api.x.com/2/...` URLs. The `xai` connector reaches xAI's model API, a different service.

## Status

fake-provider only

## Reaching it

Call these action ids through the gateway:

| Action | Input | Risk | Confirmation | Vendor request |
|--------|-------|------|--------------|----------------|
| `x.account.me` | `{}` | low | none | `GET /2/users/me?user.fields=username` |
| `x.account.get_post` | `{ post_id }` | low | none | `GET /2/tweets/{post_id}?tweet.fields=created_at,author_id,conversation_id` |
| `x.account.recent_posts` | `{ max_results? }` | low | none | `GET /2/users/me`, then `GET /2/users/{id}/tweets?max_results=n&tweet.fields=created_at` |
| `x.account.delete_post` | `{ post_id }` | high | always | `DELETE /2/tweets/{post_id}` |

Every input is an object with `additionalProperties: false`. `post_id` is a required string matching `^[0-9]{1,19}$`. `max_results` is an optional integer with minimum 5 and maximum 10; the module enforces those bounds and sends 5 when omitted. It sends `max_results` on the tweets request only, never on `/2/users/me`. There is no `user_id` input: the account is always the connected one. The second request uses only the first call's `data.id` and is refused unless that id is a string matching `^[0-9]{1,19}$`.

Results return the vendor's `data` unchecked. All fake answers are invented and their shapes are unverified until live captures exist. The id check before the second `recent_posts` request is the only field check in this step.

## Credentials

The gateway's provider holds the user OAuth grant and refresh token. No client secret, refresh token or access token enters this connector or Wiser. There is no credential file here and no `secrets:x` key. Prepare your own OAuth app and the provider's custom auth config as `auth.md` directs before connecting.

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
| `account` | `write` | `me`, `get_post`, `recent_posts`, `delete_post` |

One module means one connect turn. Its privilege reflects the grant's write scope, including on reads; confirmation and risk are set separately for each action. The configured scopes and privilege still require live readback from the provider.

## Destructive Actions

X's own API pricing page was read on 2026-11-06. Charges and X's limits fall on your developer app's account and credits; each proxied request also counts against your provider project. The provider project's limit is unverified.

| Action | Effect and worst case of one invocation | Confirmation |
|--------|-----------------------------------------|--------------|
| `x.account.me` | One User: Read resource at $0.010, worst case $0.010 | none |
| `x.account.get_post` | One Posts: Read resource at $0.005, worst case $0.005 | none |
| `x.account.recent_posts` | One User: Read at $0.010 plus at most 10 Posts: Read resources at $0.005 each, worst case $0.060 | none |
| `x.account.delete_post` | Deletes the named post; treat it as irreversible. Interaction: Delete is $0.010 per request; a refused request's billing is unpublished and unknown | always |

Owned Reads cost $0.001 per resource when the user id matches the authenticated user and that user owns the developer app. X lists `/2/users/{id}/tweets` as "Your own posts". At that rate, `recent_posts` costs at most $0.010 + 10 × $0.001 = $0.020; the stated worst case remains $0.060 because application of that rate is unverified. Resources are deduplicated within a 24-hour UTC day. The minimum credit purchase is unpublished in the evidence. Set a spending limit on the developer account.

## Excluded

`create_post` is not yet built. Also excluded: likes, reposts, follows, mutes and blocks; direct messages; bookmarks and lists; media upload and polls; search and counts; quote posts; editing; and any other account's posts in bulk.

## Troubleshooting

- `needs_connect`: connect the `account` module after preparing the custom auth config in `auth.md`.
- `needs_confirmation`: check the exact post id and match the stop before deleting.
- `invalid_arguments`: correct the named field; `max_results` must be an integer from 5 through 10.
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
