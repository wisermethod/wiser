---
name: youtube
type: connector
category: media
description: Reads the signed-in YouTube channel, uploads and updates videos, sets thumbnails, inserts captions, and manages playlists, with channel and ownership checks and confirmation on every write
version: 0.1.0
---

# YouTube

YouTube hosts a channel's videos and playlists. This connector reaches channel identity, video publishing and status, thumbnails, caption tracks and playlist items through the gateway.

Excluded: deleting videos; updating, deleting or downloading captions; channel updates, banners and sections; comments, ratings, subscriptions, search, live streaming, analytics and catalog tools. Use YouTube Studio in your own browser for those operations. There is no hosted route in this release.

## Status

Runs on the local gateway only. Verified against the gateway's fake provider.

## Reaching it

Use the gateway's `execute` with these action ids. Optional fields are in brackets. Every write requires `channel_id` and confirmation `always`; reads require none.

| Action id | Input | Quota units |
|-----------|-------|-------------|
| `youtube.channels.mine` | `{}` | 1 |
| `youtube.videos.upload` | `channel_id, path, title, category_id, made_for_kids, [description, tags, language, privacy]` | 1 + one of the project's 100 uploads a day |
| `youtube.videos.get` | `video_id` | 1 |
| `youtube.videos.update` | `channel_id, video_id, [title, description, tags, category_id, language, privacy]` | 52 |
| `youtube.videos.set_thumbnail` | `channel_id, video_id, path` | 52 |
| `youtube.captions.insert` | `channel_id, video_id, path, language, [name]` | 402 |
| `youtube.captions.list` | `video_id` | 50 |
| `youtube.playlists.create` | `channel_id, title, [description, privacy]` | 51 |
| `youtube.playlists.list` | `[max_results, page_token]` | 1 |
| `youtube.playlists.add_video` | `channel_id, playlist_id, video_id, [position]` | 53 |
| `youtube.playlists.list_items` | `playlist_id, [max_results, page_token]` | 1 |
| `youtube.playlists.remove_item` | `channel_id, playlist_item_id` | 53 |

The API charges no money. Quota belongs to your own Google Cloud project: 10,000 units a day and a separate bucket of 100 uploads a day. The worst case of one upload is one of that project's 100 uploads a day, plus the one-unit channel check. Costs above sum the calls, including ownership checks, using Google's quota cost page dated 2026-10-15. Refused and retried requests can consume additional quota.

`manifest.json` publishes the schema, with no undeclared keys. Channel ids are `UC` followed by 22 URL-safe characters; video ids have 11; playlist ids have 2 to 64; playlist item ids have 8 to 128. Category ids have 1 to 3 digits. Language is a 2 or 3 letter tag with optional 2 to 8 character alphanumeric subtags. Page tokens are nonempty; `max_results` is 1 to 50 and `position` is a nonnegative integer.

Video titles are 1 to 100 code points; playlist titles are 1 to 150. Titles and descriptions exclude `<` and `>`. Descriptions are at most 5,000 UTF-8 bytes. Tags number at most 50 and total at most 500 code points, counting separating commas and two quotation marks for each tag containing a space. Caption `name` is at most 150 code points. `videos.update` requires at least one editable field, reads the current snippet and status, and sends only writable fields with the named changes. It always sends the category and preserves the made-for-kids declaration, using the current `madeForKids` when `selfDeclaredMadeForKids` is absent. It sends an existing `publishAt` only when the resulting privacy is private and that time is still in the future. `language` sets both default language and default audio language.

Uploads require a boolean `made_for_kids`. They default to `privacy: private` and allow `unlisted`; public requires a separate `videos.update` confirmation. Playlist creation defaults to private; it and video updates allow private, unlisted or public.

Local files must exist as readable regular files. The screen canonicalizes the path, refuses the gateway user-config directory and its file identities (including hard links), and refuses resolved `.env` and `.env.*` names. It opens the resolved path with `O_NOFOLLOW` and checks device, inode, regular-file type and size through the descriptor before reading. The extension is checked on the resolved name. Nothing writes a file.

- Videos: `.mp4`, `.mov`, `.webm`, 1 to 274,877,906,944 bytes, sent as `video/mp4`, `video/quicktime`, `video/webm`.
- Thumbnails: `.jpg`, `.jpeg`, `.png`, at most 3,145,728 bytes. The cap is the proxy body's bound, lower than YouTube's 50 MB bound. The signed-in channel's `status.longUploadsStatus` must be `allowed` before a thumbnail call.
- Captions: `.srt`, `.vtt`, `.sbv`, at most 3,145,728 bytes. Sent as `multipart/related` with metadata and file parts, always `isDraft: false`.

Uploads use 3,145,728-byte chunks, the last shorter. A streaming SHA-256 covers each file byte once. A 308 range resumes at its next byte, including a short commit; no range means zero bytes committed. A 308 acknowledging the whole file is followed by a status query to obtain the completed video. A 413, 5xx, transport refusal or 308 that does not advance is followed by one status query and resume, with at most five consecutive retries and waits of 1, 2, 4, 8 and 16 seconds; the sixth refusal ends the call. A stalled 308 ends with the fixed reason `upload did not advance`. Returns only `video_id`, `channel_id`, `privacy_status`, `upload_status`, `bytes`, `sha256`, `chunks`, `refusals`, `seconds`. `chunks` counts data requests, including retries. The session address stays inside the module's proxy calls.

Reads project named fields only. Channels return identity and status; videos return snippet fields, status, processing status, file size, container and streams when available to the owner, and duration, definition and caption. Lists return ids, titles, privacy or positions as applicable, caption track details, and `next_page_token` when supplied. A non-object answer is `vendor_error`.

## Credentials

The gateway's provider holds the OAuth grant. This connector holds none, reads no credential file and unwraps no token. There is no `secrets:youtube` key. The custom auth config must already exist; `auth.md` states the stops before connecting. Member setup is held for a later release.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `channels` | write | `mine` |
| `videos` | write | `upload`, `get`, `update`, `set_thumbnail` |
| `captions` | write | `insert`, `list` |
| `playlists` | write | `create`, `list`, `add_video`, `list_items`, `remove_item` |

Each module has its own connection record. All use one toolkit and one grant: an unbound module can adopt its one ACTIVE account, avoiding repeated consent.

## Destructive Actions

Before every write, a fresh signed-in channel read must return exactly one channel matching `channel_id`. A mismatch returns `invalid_arguments`, field `channel_id`, reason `not the signed-in channel`, with signed-in ids and titles. Existing videos, playlists and playlist items must belong to that channel. Confirmation shows the channel id and supplied fields.

| Action | Effect and recovery | Confirmation |
|--------|---------------------|--------------|
| `videos.upload` | Publishes one private or unlisted video; the operator can remove it in Studio | always |
| `videos.update` | Replaces named metadata or privacy; restore prior values with another update | always |
| `videos.set_thumbnail` | Replaces the thumbnail; restore by setting the prior image | always |
| `captions.insert` | Publishes a caption track; manage it in Studio | always |
| `playlists.create` | Creates a playlist; manage it in Studio | always |
| `playlists.add_video` | Inserts a playlist item; remove that item to undo | always |
| `playlists.remove_item` | Deletes an item; adding it again creates a new item id | always |

## Troubleshooting

- `needs_connect`: the module lacks a usable grant. Check `auth.md`'s four config cases before connecting.
- `needs_confirmation`: show the channel and fields, then repeat the identical call with `confirm: true` after approval.
- `invalid_arguments`: correct the named field or choose the connected channel; nothing was written.
- `vendor_error` with `channel_not_verified`: open `https://www.youtube.com/verify` in your own browser and verify the channel before setting a custom thumbnail.
- `vendor_error` with HTTP 403 or 429: check the Google project's scopes and remaining quota; never infer an account change from quota alone.
- `vendor_error` with HTTP 413: check the file cap; video chunks retry through the resumable protocol.
- `vendor_error` with a 5xx or transport failure: read the state before repeating a write; the call may have run.
- `vendor_error` with `no upload session`, `upload did not advance` or `unexpected answer`: report the sanitized endpoint and fixed reason; no session address is exposed.
- `local_only` or `needs_provider_capability` from a hosted endpoint: use the local gateway.

## Reference

- Connection boundary and revocation: `auth.md`
- Gateway contract: `gateway/AGENTS.md`
- Published schema: `standards/script-contract.md` Published input schema
- [YouTube Data API](https://developers.google.com/youtube/v3/docs)
- [Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
