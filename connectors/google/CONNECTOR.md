---
name: google
type: connector
category: analytics
description: Reads search performance, analytics reports, Drive files, Calendar events, Gmail messages, spreadsheet values, documents, and presentations through eight separate grants
version: 0.4.0
---

# Google

Reads search performance, analytics reports, Drive files, Calendar events, Gmail messages, spreadsheet values, documents, and presentations through eight separate grants.

## Status

Shipped 2026-09-08. Live connect 2026-09-08: `search-console`, `analytics`, `drive`, and `calendar` ACTIVE. Live connect 2026-09-09: `gmail` ACTIVE, envelope UNVERIFIED. `sheets`, `docs`, and `slides` still unconnected. Search Console: `sites` `{ siteEntry }`, `sitemaps` `{ sitemap }`, `query` `{ responseAggregationType }`. Analytics: `list_account_summaries` `{ accountSummaries }`, `get_property`, `run_report` with `rows` and header fields. Drive: `find_file` `{ files, nextPageToken, incompleteSearch, kind }`, `get_file` `{ display_url, id, kind, link_label, mimeType, name }`. Calendar: `list_events` `{ items, nextPageToken, kind, accessRole, timeZone }`, `get_event` `{ id, status, start, end, htmlLink, display_url, kind }`. Gmail: `list_messages` and `get_message` fake-provider only. Sheets: `search` and `get_values` fake-provider only. Docs: `search` and `get` fake-provider only. Slides: `get` and `get_page` fake-provider only. The Slides catalog has no search. Fake-provider tests still run. See `auth.md` and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
google.search-console.query  { site_url, start_date, end_date, dimensions?, row_limit? }
google.search-console.sites  {  }
google.search-console.sitemaps  { site_url }
google.analytics.run_report  { property, date_ranges, dimensions?, metrics }
google.analytics.list_account_summaries  { page_size?, page_token? }
google.analytics.get_property  { name }
google.drive.find_file  { q?, page_size?, page_token? }
google.drive.get_file  { file_id, fields? }
google.calendar.list_events  { calendar_id, time_min?, time_max?, max_results?, page_token? }
google.calendar.get_event  { calendar_id, event_id }
google.gmail.list_messages  { query?, max_results?, page_token?, label_ids?, include_payload?, ids_only?, verbose?, include_spam_trash? }
google.gmail.get_message  { message_id, format? }
google.sheets.search  { query?, max_results?, page_token?, order_by?, search_type? }
google.sheets.get_values  { spreadsheet_id, ranges?, major_dimension?, value_render_option?, date_time_render_option? }
google.docs.search  { query?, max_results?, page_token?, order_by? }
google.docs.get  { document_id, include_tabs_content? }
google.slides.get  { presentation_id?, presentation_name?, fields? }
google.slides.get_page  { presentation_id, page_object_id }
```

Search Console, Analytics, Gmail, Sheets, Docs, and Slides are read grants. Search Console does not add sites or submit sitemaps. Gmail does not send, draft, delete, or change labels. Sheets does not create, append, update, or delete. Docs does not create, insert, replace, or delete. Slides does not create, copy, or batch-update. Drive and Calendar hold write-capable grants but ship only reads, with no upload, create, or delete actions. A Search Console grant does not unlock any other module. A Gmail grant does not unlock Drive, Calendar, Analytics, Sheets, Docs, or Slides. Inputs use the field names in the manifest, remapped to catalog field casing where needed. Each `date_ranges` entry uses `{ startDate, endDate }`; metrics and dimensions use `{ name }`. Optional catalog fields pass through. Results are catalog objects, with no local file output.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `search-console` | read | `query`, `sites`, `sitemaps` |
| `analytics` | read | `run_report`, `list_account_summaries`, `get_property` |
| `drive` | write | `find_file`, `get_file` |
| `calendar` | write | `list_events`, `get_event` |
| `gmail` | read | `list_messages`, `get_message` |
| `sheets` | read | `search`, `get_values` |
| `docs` | read | `search`, `get` |
| `slides` | read | `get`, `get_page` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

None. This version only reads and ships no destructive actions.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://developers.google.com/webmaster-tools
