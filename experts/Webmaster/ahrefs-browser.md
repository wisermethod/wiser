# Ahrefs by browser

The reports an audit takes from Ahrefs Site Explorer, how each is recorded, and what the person does. Navigation is described by what the page shows, not by fixed selectors: Ahrefs changes its interface, and an interactive snapshot before every action is the rule.

**Version:** 0.2.0, 2026-10-13

## Before anything

- Ahrefs is read in the person's own signed-in browser, driven by the host's browser extension where it has one; otherwise the person opens the reports and pastes or exports them. `tools/Browser Control/` is not this route: observed 2026-10-12, `app.ahrefs.com` answers the browser it launches with a bot check a person cannot clear there, while the person's own browser reached the signed-in app with no challenge. Where the extension can drive more than one browser, the person picks which before the first navigation; where it drives one, say which and go on.
- Navigate to Site Explorer. A sign-in, a second factor, or a challenge page is the person's: say what is blocking and wait. Never type a credential, never read a stored one, never snapshot a sign-in form into evidence.
- Confirm the plan's entitlement on the report itself: a report the plan does not include shows the vendor's upgrade notice, and that is `plan restricted` in the ledger with the report named, not a failure.
- The free plan reads only verified domains, and exports nothing. Observed 2026-10-12: a target the account has not verified shows "Domain not verified" with "You can only check verified domains and their subdomains on a free plan", and Export on a report opens "Upgrade to unlock export". So on a free account the site's own backlink profile is readable when the site is verified in Ahrefs, and a competitor's is not. Competitor link evidence then comes from `dataforseo.backlinks.referring_domains` and `dataforseo.backlinks.anchors` under `experts/Webmaster/seo-readings.md` Paid calls. Where the requester has ruled out paid research, or declines the stop on `dataforseo.backlinks.summary`, the competitor link section is `plan restricted` for Ahrefs and `not attempted: spend declined` for DataForSEO. The dashboard's project list names the verified domains.

## The reports

| Report | What the audit takes | Record |
|--------|----------------------|--------|
| Overview | Domain Rating, referring domains, backlinks, organic keywords, organic traffic estimate | Each figure as displayed, abbreviated where the page abbreviates ("1.2K" stays "1.2K", labeled as displayed); the date on the page; that every figure is Ahrefs' own index |
| Referring domains | The referring domain list with DR, links, first seen, for the site and, if the competitor set is confirmed and the plan entitles it, each competitor | Export where the vendor's export control is available and the plan permits; otherwise the visible table with its filters, sort, row limit and timestamp |
| Backlinks | The links themselves, with "Group similar" on, and each link's route: straight to the site, or to another domain that redirects into it | Same; the routes on the rows read are counted by `tools/data/`, and a domain redirecting into the site is named with the links it carries in. A page of the list is not the population, so the split is stated for the rows read and never for the whole profile |
| Anchors | The anchor text distribution | Same; the branded and exact-match shares are computed from the export by `tools/data/`, never by eye. A visible table supports a share or total only when the table shows the population and every row of it is read; otherwise the shares come from `dataforseo.backlinks.anchors` per `experts/Webmaster/seo-readings.md`, or the figure is `Not available: export plan restricted` |
| Broken backlinks | Inbound links pointing at URLs that now error, grouped by target | Same; this feeds the fastest recoverable value item |
| Organic keywords | What the site ranks for, with position, volume, and URL | Same; this is Ahrefs' estimate and is labeled so beside Search Console's own rows |
| Content gap or competitive analysis | Keywords competitors rank for that the site does not | Only with a confirmed competitor set; unconfirmed, the report is not opened and the row is `not attempted: no confirmed competitor set` |

## Export

The vendor documents report export, subject to report and account limits. An export is a download the person's browser makes, which the person confirms; the file is moved into the owning root's work directory and the ledger row names it. On the free plan export is unavailable. Where export is unavailable, the visible table is read as text after the filters are set, or pasted by the person where no extension drives the browser, and the row records the row limit shown; a partial table is never extended into a complete file.

## Recording

Every row taken from Ahrefs carries: the report, the target, the filters and sort, the row limit, the page's own date, the timestamp of the read, and `Estimated: vendor index` where the figure is the vendor's estimate rather than a count. A screenshot goes beside the export when the table's filters are not in the export.

## Observed navigation

Observed 2026-10-12, and the Backlinks row 2026-10-13, on a free-plan account, in the person's own browser through the host's extension. What that account's reports returned does not ship with this guide. If the page no longer matches a row, trust the page and record what it shows.

| Step | What the page showed | Control used |
|------|----------------------|--------------|
| Sign-in | Already signed in; `app.ahrefs.com/site-explorer` opened the app. An unsigned browser lands on the marketing page instead, whose sign-in link is "Sign in" | None |
| Target | A field with placeholder "Domain or URL", beside "http + https" and "Subdomains" selectors and a search button | Typed the domain into "Domain or URL", pressed the search button |
| Unverified target | "Domain not verified", with "Verify ownership" and "See pricing" | None; recorded `plan restricted` |
| Overview | Title "Overview: <domain>/". Blocks "AI responses", "Backlink profile", "Search", "Traffic analytics". Filters "Monthly volume", "All locations", "Best links: Off", "Changes: Don't show" | Left navigation "Overview" |
| Referring domains | Left navigation group "Backlink profile", link "Referring domains". Table header "`<count>` domains" with tabs "All", "New", "Lost"; filters "All", "Dofollow", "Nofollow", "UGC", "Best links: Off", "DR", "Domain traffic", "Links to target", a "Word or phrase" search, "Add filter", "Presets"; "Show history: Don't show"; sorted by "DR" descending; "`<page size>` results per page", `<page count>` pages. Some rows carry a "SPAM" tag | Left navigation "Referring domains" |
| Backlinks | Observed 2026-10-13. Left navigation group "Backlink profile", link "Backlinks". Header "`<count>` groups of links" with "Group similar"; tabs "All", "New", "Lost"; sorted by traffic descending; `<page size>` per page. A row whose link reaches the site through a redirect shows the redirecting URL, then "301", then the site's URL | Left navigation "Backlinks" |
| Export | Button "Export" above the table, beside "API". On the free plan it opens "Upgrade to unlock export: Export your data to CSV or Google Sheets for advanced analysis" | Opened, then closed with Escape; nothing downloaded |
