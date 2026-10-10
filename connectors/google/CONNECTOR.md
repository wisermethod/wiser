---
name: google
type: connector
category: analytics
description: Reads search performance, URL index state, sitemap details, analytics reports, Drive files, Calendar events, Gmail messages, spreadsheet values, documents, and presentations through eight separate grants, and creates, uploads, renames and moves Drive files, creates and edits documents, writes spreadsheet values, saves Gmail drafts, and creates and updates events, confirming every write
version: 0.7.0
---

# Google

Reads search performance, URL index state, sitemap details, analytics reports, Drive files, Calendar events, Gmail messages, spreadsheet values, documents, and presentations through eight separate grants, and creates, uploads, renames and moves Drive files, creates and edits documents, writes spreadsheet values, saves Gmail drafts, and creates and updates events, confirming every write.

## Status

Shipped 2026-09-08. All eight modules have been proved live, `search-console`, `analytics`, `drive` and `calendar` on 2026-09-08 and `gmail`, `sheets`, `docs` and `slides` on 2026-09-09, the second four with envelopes UNVERIFIED. Search Console: `sites` `{ siteEntry }`, `sitemaps` `{ sitemap }`, `query` `{ responseAggregationType }`. Analytics: `list_account_summaries` `{ accountSummaries }`, `get_property`, `run_report` with `rows` and header fields. Drive: `find_file` `{ files, nextPageToken, incompleteSearch, kind }`, `get_file` `{ display_url, id, kind, link_label, mimeType, name }`. Calendar: `list_events` `{ items, nextPageToken, kind, accessRole, timeZone }`, `get_event` `{ id, status, start, end, htmlLink, display_url, kind }`. Gmail, Sheets, Docs and Slides are fake-provider only for their envelopes. The Slides catalog has no search. Fake-provider tests still run. See `auth.md` and [gateway setup](../../gateway/SETUP.md).

The eleven write actions shipped 2026-10-10 in 0.7.0. Fake-provider tests in `tests/writes.test.js` check each one's confirmation stop, the exact call it sends, and every refusal. All eleven were proved live on 2026-10-10, each through its confirmation stop. Drive `create_file`, `upload_file`, `rename_file` and `move_file` answer `{ id, name, mimeType, parents, webViewLink }`. Docs `create` answers the new document with its `documentId` and `revisionId`, and `edit` answers `{ replies, writeControl, documentId }`, a `replaceAllText` reply carrying `occurrencesChanged`. Sheets `update_values` answers `{ spreadsheetId, updatedRange, updatedRows, updatedColumns, updatedCells }`, and `append_values` answers `{ spreadsheetId, tableRange, updates }`. Gmail `create_draft` answers `{ id, message: { id, threadId, labelIds } }`, with `DRAFT` the only label. Calendar `create_event` and `update_event` answer the event, and an update from all-day to a time cleared the date.

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
google.search-console.query  { site_url, start_date, end_date, dimensions?, row_limit?, start_row?, dimension_filter_groups?, search_type?, aggregation_type?, data_state? }
google.search-console.sites  {  }
google.search-console.sitemaps  { site_url }
google.search-console.inspect  { site_url, inspection_url, language_code? }
google.search-console.get_sitemap  { site_url, feedpath }
google.analytics.run_report  { property, date_ranges, dimensions?, metrics }
google.analytics.list_account_summaries  { page_size?, page_token? }
google.analytics.get_property  { name }
google.drive.find_file  { q?, page_size?, page_token? }
google.drive.get_file  { file_id, fields? }
google.drive.create_file  { name, kind, folder_id?, description? }
google.drive.upload_file  { name, source_type, content | content_base64, convert?, folder_id?, description? }
google.drive.rename_file  { file_id, name }
google.drive.move_file  { file_id, folder_id }
google.calendar.list_events  { calendar_id, time_min?, time_max?, max_results?, page_token? }
google.calendar.get_event  { calendar_id, event_id }
google.calendar.create_event  { calendar_id, summary, start, end, time_zone?, description?, location?, attendees?, notify_guests? }
google.calendar.update_event  { calendar_id, event_id, summary?, description?, location?, start?, end?, time_zone?, attendees?, notify_guests? }
google.gmail.list_messages  { query?, max_results?, page_token?, label_ids?, include_payload?, ids_only?, verbose?, include_spam_trash? }
google.gmail.get_message  { message_id, format? }
google.gmail.create_draft  { to, subject, body, cc?, bcc?, body_html? }
google.sheets.search  { query?, max_results?, page_token?, order_by?, search_type? }
google.sheets.get_values  { spreadsheet_id, ranges?, major_dimension?, value_render_option?, date_time_render_option? }
google.sheets.update_values  { spreadsheet_id, range, values, value_input_option? }
google.sheets.append_values  { spreadsheet_id, range, values, value_input_option? }
google.docs.search  { query?, max_results?, page_token?, order_by? }
google.docs.get  { document_id, include_tabs_content? }
google.docs.create  { title }
google.docs.edit  { document_id, operations, required_revision_id? }
google.slides.get  { presentation_id?, presentation_name?, fields? }
google.slides.get_page  { presentation_id, page_object_id }
```

Every module's grant can write, and `auth.md` names each one's scopes. Search Console does not add sites or submit sitemaps. `inspect` reads Google's stored index state for one URL, not a live fetch. `query` dates are `YYYY-MM-DD` with start not after end; `row_limit` is 1 to 25000; the catalog may cap lower and that is the vendor's answer, not the module's. Grouping `dimensions` are `country`, `device`, `page`, `query`, `searchAppearance`, `date`, and `hour`. Filter `dimension` values inside `dimension_filter_groups` are `country`, `device`, `page`, `query`, and `searchAppearance` only. `inspect`, `get_sitemap`, and `sitemaps` accept `site_url` as an absolute http or https URL or a Domain property `sc-domain:<hostname>`; `inspection_url` and `feedpath` stay absolute URLs. The search-console module validates those bounds, the two dimension sets and operator enums, and the URL and Domain-property forms before catalog execution. A `query` call carrying only `site_url`, `start_date`, `end_date`, `dimensions`, and `row_limit` still passes unchanged. Gmail saves drafts and does not send, delete, or change labels. Sheets writes and appends values and does not create, clear, or delete. Docs creates a document and edits it with inserted and replaced text, paragraph styles and lists, and does not delete content. Slides does not create, copy, or batch-update. Drive creates, uploads, renames and moves files and does not delete, trash, copy, or share them. Calendar creates and updates events and does not delete them. A Search Console grant does not unlock any other module. A Gmail grant does not unlock Drive, Calendar, Analytics, Sheets, Docs, or Slides. Inputs use the field names in the manifest, remapped to catalog field casing where needed. Each `date_ranges` entry uses `{ startDate, endDate }`; metrics and dimensions use `{ name }`. Optional catalog fields pass through. Read results are catalog objects and write results are Google's own response objects, with no local file output.

## Writes

Each write calls Google's own API through the gateway's provider, at Drive v3, Docs v1, Sheets v4, Gmail v1 or Calendar v3, on the grant its module already holds. Every one stops for confirmation every time, and the stop shows the values it will send.

**The stop repeats long values in full.** A value longer than the stop's summary is shortened there and given complete in `input_values`, so a long upload, edit or draft crosses the conversation three times: in the call, in the stop, and in the confirm. The bounds below are sized for that.

- `drive.create_file` makes an empty Google Doc, Sheet, Slides file or folder, `kind` being `document`, `spreadsheet`, `presentation` or `folder`, inside `folder_id` when given.
- `drive.upload_file` stores one file. `source_type` is `text/plain`, `text/markdown`, `text/html`, `text/csv`, `text/tab-separated-values`, or the Word, Excel or PowerPoint Office Open XML type. Give exactly one of `content`, text of at most 200000 characters and only for the five text types, or `content_base64`, at most 700000 characters, about 512 KB, which must decode. With `convert` true, the default, Drive imports the file as a Google type: text, Markdown, HTML and Word become a Doc, CSV, TSV and Excel a Sheet, and PowerPoint Slides. With `convert` false the file is stored as it is. A file on disk is not read: there is no path-based upload in this release.
- `drive.rename_file` replaces a file's name.
- `drive.move_file` reads the file's parents, then adds `folder_id` and removes every parent it read. Those are two calls, so a parent added between them stays and a parent removed between them is asked to be removed again.
- Every Drive write answers with `id`, `name`, `mimeType`, `parents` and `webViewLink`, the link a person opens, and reaches files in shared drives.
- `docs.create` makes an empty document titled `title`.
- `docs.edit` sends up to 50 operations in order as one batch, which Google applies all or nothing. `insert_text` puts `text`, at most 100000 characters, at `index`, or at the end of the body when `index` is omitted. `replace_text` replaces every match of `find` with `replace`, matching case unless `match_case` is false. `set_style` gives the paragraphs from `start_index` to `end_index` one of `NORMAL_TEXT`, `TITLE`, `SUBTITLE` or `HEADING_1` to `HEADING_6`. `create_list` makes them a `bulleted` or `numbered` list. Indexes are Google's: the body starts at 1, and every insertion moves what follows it. Read the document with `docs.get` first, and pass its `revisionId` as `required_revision_id` so that an edit computed against a document that has since changed is refused rather than landing in the wrong place. In a document with tabs, `replace_text` changes every tab, and the indexed operations act on the first tab.
- `sheets.update_values` replaces the cells of `range`, in A1 notation, with `values`. `sheets.append_values` inserts `values` as new rows after the table `range` finds, and never writes over cells below it. `values` is 1 to 500 rows of 1 to 50 cells, each a string of at most 5000 characters, a number or a boolean. `value_input_option` defaults to `RAW`, which stores text that starts with `=` as text; `USER_ENTERED` makes Google read it as a person typing, so formulas and dates are parsed. A `range` of `.` or `..` is refused, because it would turn into a different address rather than a range.
- `gmail.create_draft` saves a message in Drafts and never sends it. `to` holds 1 to 50 addresses and `cc` and `bcc` up to 50 each. An address is at most 254 characters and 254 bytes in UTF-8, with exactly one `@`, text on both sides and no whitespace, and carries no display name. The subject may not hold a line break or NUL. A subject that is not plain ASCII, is too long for one header line, or contains `=?`, is sent as encoded-words on folded lines, so a mail reader shows exactly the text given, and each address goes on a line of its own. With `body_html` the draft carries both the text and the HTML body. There are no attachments and no replies in a thread.
- `calendar.create_event` adds an event. `start` and `end` are both a date, `YYYY-MM-DD`, for an all-day event whose `end` is the day after it ends, or both an RFC 3339 date-time with seconds. A date-time with no offset needs `time_zone`, an IANA name such as `America/Denver`; a bare offset such as `+01:00` is refused. **Whether `end` is after `start` is Google's check**, and a reversed span comes back as a `vendor_error`. `notify_guests` defaults to false, which sends `sendUpdates=none` and asks Google not to email the guests in `attendees`. **Google does not fully promise that**: it says some emails may still go, and it warns that with `none` a guest outside Google Calendar may never receive the event. Set `notify_guests` to true for guests who must get an invitation.
- `calendar.update_event` changes only the fields it is given, and at least one of `summary`, `description`, `location`, `start`, `end` and `attendees`. `attendees`, when given, replaces the whole guest list. A changed `start` or `end` clears the form it replaces, so an all-day event can become a timed one and back. `time_zone` is accepted only with `start` or `end`. `notify_guests` works as on create.
- `calendar_id` is `primary` or a calendar's address, and a dot, a double dot or a slash is refused, so the id cannot become a path. Every other Google id must match `^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$`.

**Rules the module checks that no schema keyword carries**, so a caller is not surprised by them: exactly one of the two upload fields, text content only with a text type, and base64 that decodes; a real calendar date and time; the same kind of value in `start` and `end`; `time_zone` as an IANA name, required for a date-time with no offset, and only beside `start` or `end`; the `calendar_id` refusals above; a Sheets `range` of `.` or `..`; in `docs.edit`, each operation's fields and bounds, with `end_index` greater than `start_index`; a Gmail address's 254-byte limit; and on every write, text that is well-formed Unicode, so a lone surrogate, which would be saved as a replacement character, is refused. Each is refused as `invalid_arguments` naming the field before anything is sent.

**Drive keeps Markdown's structure when it converts.** A `#` heading arrives as `HEADING_1`, `**bold**` as bold text and a `-` list as a bulleted list, so `upload_file` with `text/markdown` is the shortest way to a formatted Doc.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `search-console` | write | `query`, `sites`, `sitemaps`, `inspect`, `get_sitemap` |
| `analytics` | write | `run_report`, `list_account_summaries`, `get_property` |
| `drive` | write | `find_file`, `get_file`, `create_file`, `upload_file`, `rename_file`, `move_file` |
| `calendar` | write | `list_events`, `get_event`, `create_event`, `update_event` |
| `gmail` | write | `list_messages`, `get_message`, `create_draft` |
| `sheets` | write | `search`, `get_values`, `update_values`, `append_values` |
| `docs` | write | `search`, `get`, `create`, `edit` |
| `slides` | write | `get`, `get_page` |

Each module has its own grant. Privilege describes the grant, not just these actions. A gateway started with the `readonly` role refuses every write-privilege module, so it serves none of these.

## Destructive Actions

Nothing here deletes or trashes anything. Nothing sends mail except Google's guest invitations: those `notify_guests` asks for, and any Google sends on its own despite `sendUpdates=none`. Five writes replace what was there, and each is risk `high`: `drive.rename_file` the name, `drive.move_file` the parents, `docs.edit` any text `replace_text` matches, `sheets.update_values` the range, and `calendar.update_event` the fields it is given, the guest list included. All eleven writes take `confirmation: always`.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`invalid_arguments`: the named field broke a rule in `## Writes` or in the manifest; nothing was sent.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat. A 403 on a write to a file you can edit is the grant case `auth.md` describes.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://developers.google.com/webmaster-tools
- Write APIs: https://developers.google.com/drive/api/reference/rest/v3, https://developers.google.com/docs/api/reference/rest, https://developers.google.com/sheets/api/reference/rest, https://developers.google.com/gmail/api/reference/rest, https://developers.google.com/calendar/api/v3/reference
