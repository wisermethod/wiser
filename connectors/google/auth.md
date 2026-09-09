# Connecting Google

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Each connect is a human turn.

## On the platform's side, first

Use a Google account allowed to access the relevant sites, analytics properties, files, calendars, mailbox, spreadsheets, documents, or presentations. An organisation may need to approve the OAuth application. Prepare an OAuth blueprint for each module through the gateway's provider.

## Through the gateway

1. In a human turn, request "Connect Google" and name the module.
2. Run `start_connect` for `google` and that module, then open the hosted link in your own browser.
3. Approve the OAuth grant for that module.
4. Run `connect_status`. Only ACTIVE unlocks that module.

## Per-module notes

- `search-console`: separate connect, read privilege; Last connected: 2026-09-08.
- `analytics`: separate connect, read privilege; Last connected: 2026-09-08.
- `drive`: separate connect, write privilege; Last connected: 2026-09-08.
- `calendar`: separate connect, write privilege; Last connected: 2026-09-08.
- `gmail`: separate connect, read privilege; Last connected: 2026-09-09.
- `sheets`: separate connect, read privilege; Last connected: Not yet.
- `docs`: separate connect, read privilege; Last connected: Not yet.
- `slides`: separate connect, read privilege; Last connected: Not yet.

## The route this connector does not use

A Google service-account JSON in a file or in chat is not a route. Each of the eight modules uses its own hosted OAuth connect.

## Revoking

Revoke each module through the gateway, then revoke the OAuth application in the Google account. For a local file, remove its binding and rotate the key at the platform.

## Last connected

2026-09-09, `gmail` ACTIVE. Hosted OAuth; live envelope UNVERIFIED.

2026-09-08, `search-console`, `analytics`, `drive`, and `calendar`, Grok session via the current gateway tree. Search Console: `sites` `{ siteEntry }`; `sitemaps` `{ sitemap }`; `query` `{ responseAggregationType }` with no `rows` for the window used. Analytics: `list_account_summaries` `{ accountSummaries }` with nested `propertySummaries`; `get_property` name, displayName, propertyType, timeZone, currencyCode; `run_report` rows, rowCount, dimensionHeaders, metricHeaders, metadata, kind. Drive: `find_file` `{ files, nextPageToken, incompleteSearch, kind }`; items include id, name, mimeType, webViewLink, display_url. `get_file` `{ display_url, id, kind, link_label, mimeType, name }`. Calendar: `list_events` `{ items, nextPageToken, kind, accessRole, timeZone }`; items include id, status, start, end, htmlLink, display_url. `get_event` `{ id, status, start, end, htmlLink, display_url, kind }`. No account, property, site, file, calendar, or event names are recorded here.
