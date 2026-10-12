# SEO readings

The one home of which route acquires which reading, what each route needs before it answers, what it costs, and what its absence does to an audit.

**Version:** 0.1.0, 2026-10-12

## What it is and who cites it

`experts/Webmaster/` and `skills/SEO Assets/` cite this file; neither restates it. Action ids resolve through the gateway's `execute`. Tools run from their own directories. Ahrefs readings follow `experts/Webmaster/ahrefs-browser.md`. `tools/Browser Control/` is the route for a page that builds itself in the browser on a site with no bot check.

## Preflight

Before any evidence is read, open the readiness ledger below and fill `discoverable` and `grant` for every required row from live calls made now: `search_actions` per service, `list_connections` once, `help` for each tool, and which browser the host can drive, per `experts/Webmaster/ahrefs-browser.md`. A row's state from an earlier session is not evidence. A row whose discovery call has not answered is `not attempted: discovery not run`, never assumed present or absent. A connection seen absent in `list_connections` with no `execute` answer is recorded as observed there, `grant: none`, and its `next_step` is the Connect Account turn, taken only if no other verified route serves the reading. Then state, before the first read, which rows are ready, which need a human turn, and which readings will be labeled if that turn is declined. A reading that needs only a default, such as the crawl's bound, has that default stated here and runs; it does not wait for an answer. Ask the audit's questions once, here, and not again per row.

## The readings

| Reading | Route | Needs before it answers | Cost | Absent, the audit loses |
|---------|-------|-------------------------|------|-------------------------|
| Search Console queries, pages, countries, devices, for one window, and again for the previous window | `google.search-console.query` with `dimensions`, `row_limit`, `start_row`, `dimension_filter_groups`, `search_type`, `data_state` | `google` / `search-console` grant ACTIVE; a named public property | none | On-page and content judgments about what already ranks; cannibalization; measurement. A total summed from a top slice describes the rows and not the property |
| Submitted sitemaps and one sitemap's detail | `google.search-console.sitemaps`, `google.search-console.get_sitemap` | same grant | none | Sitemap coverage; the submitted count is not index coverage |
| Google's stored index state for one URL | `google.search-console.inspect` | same grant; one call per URL, so the money pages, not the site | none | Indexed versus crawled for the pages that matter. Query rows do not say whether a page is indexed. A 403 after an ACTIVE grant is one reconnect and then a label. On a bare host, `inspect` can return NEUTRAL with coverage "Page with redirect" while the page is indexed under its `www` canonical: follow `googleCanonical` before concluding anything about indexing |
| Keyword demand around seed terms, with intent and difficulty | `dataforseo.research.keyword_ideas`, `related_keywords`, `search_intent`, `keyword_difficulty`, `search_volume` | `dataforseo` / `research` grant ACTIVE; market as `location_code` and `language_code` from `dataforseo.research.locations` | per `connectors/dataforseo/CONNECTOR.md`. `dataforseo.research.search_volume` is one of the two actions Paid calls says the gateway still stops | Keyword items, doors-not-walls, content briefs; the report says demand was not measured |
| What ranks for the head terms | `dataforseo.research.serp` | same grant; market; device | per `connectors/dataforseo/CONNECTOR.md` | Intent alignment against what actually ranks; format calibration |
| What the site ranks for, and the competitors the vendor proposes for it | `dataforseo.research.ranked_keywords` and `competitors`, the site as `target` | same grant; market; the site's bare domain | per `connectors/dataforseo/CONNECTOR.md` | The site's ranked keywords; no proposed competitor set, so the set rests on the requester alone |
| What each competitor ranks for | `dataforseo.research.ranked_keywords`, that competitor as `target` | same grant; market; a competitor set confirmed per Market | per `connectors/dataforseo/CONNECTOR.md` | Content gaps against that competitor |
| Backlink profile: authority, referring domains, anchors, broken inbound | Ahrefs Site Explorer in the person's own browser, per `experts/Webmaster/ahrefs-browser.md`. On a free plan, the site's own profile when that site is verified in the account. Competitors' link evidence through `dataforseo.backlinks.referring_domains` and `dataforseo.backlinks.anchors`. `dataforseo.backlinks.summary` keeps the gateway stop Paid calls names. The site and its competitors are compared from one provider's index: Ahrefs Overview where the plan reads every domain in the set, otherwise `dataforseo.backlinks.summary` for the site and each competitor; a site score from one provider is never compared with competitors' from another. Where the requester has ruled out paid research, or declines that stop, the competitor link section is `plan restricted` for Ahrefs and `not attempted: spend declined` for DataForSEO | Ahrefs: the person's own signed-in browser, and, on a free plan, the site verified in that account. DataForSEO: `dataforseo` / `backlinks` grant ACTIVE | Ahrefs: the account's own plan. DataForSEO: per `connectors/dataforseo/CONNECTOR.md` | Off-site authority; broken inbound, the fastest recoverable value, goes unseen |
| Crawl inventory: status, redirects, canonicals, noindex, orphan candidates | `tools/site-crawl/` `crawl`, with the `sitemap` `fetch` snapshot for orphan candidates | nothing to connect; the tool's default `--max-pages` unless the requester set another, stated at preflight and not waited on | none | Reachability beyond the pages read by hand; `renderingSuspected` non-empty means the inventory is unreliable and the money pages go through `tools/Browser Control/` on a site with no bot check |
| Lab performance, mobile and desktop | `google-apis.insights.run`, `strategy` mobile then desktop, `category` `["performance"]`, `audits: true` where lab metric values are needed | `google-apis` / `insights` grant ACTIVE | none | Speed judged from nothing; never estimate a score. TBT never stands in for INP |
| Field performance | `google-apis.insights.run`; field from `loadingExperience` (URL) and `originLoadingExperience` (origin) | same grant | none | Absent `metrics` is no field data, never zero and never a pass |
| Bing index state, queries, inbound links | `bing.webmaster.list_sites`, `inspect_url`, `search_performance`, `query_performance`, `inbound_links` | `bing` / `webmaster` grant ACTIVE; the site in `list_sites` | none | The second index, which feeds generated answers; a site absent from `list_sites` is a verification task at Bing, not a connection fault. `search_performance` `daily_totals` carries null positions and a null query on every row, the report's shape and not missing data |
| Traffic, channels, conversions | `google.analytics.run_report` | `google` / `analytics` grant ACTIVE; a named property | none | Measurement and conversion priorities; no rows is a fact about the property and the window |
| Which tags the live pages serve | `tools/tag-audit/` | nothing | none | Whether absent analytics rows mean absent tracking |
| Behaviour evidence | `clarity.analytics.export` | `clarity` / `analytics` grant ACTIVE; optional | none | Nothing an audit needs; offered only when the requester wants it |
| One page's on-page elements | `tools/seo-page-analyzer/` over HTML the run fetched or the browser returned | nothing | none | The on-page dimension for that page |
| Rows already pulled, read together | `tools/seo-data/` `audit` and `keywords` | the saved responses | none | Ranking, comparison and grouping done by eye, which is the fabrication risk this tool removes |

A vendor read can carry ownership secrets, as Bing's site list did before the connector stripped them: inspect a reading for credentials, verification codes or tokens before writing it into the work directory.

## Paid calls

A billed call runs when the reading needs it, with no spend statement and no question before it.

The two actions the gateway still stops, `dataforseo.research.search_volume` and `dataforseo.backlinks.summary`, put the gateway's `needs_confirmation` to the person, who answers it; until they do, the row reads `not attempted: awaiting confirmation`. The run never sets `confirm: true` on its own.

A limit the requester states, "no paid research" or a ceiling, binds the run. A reading it rules out is `not attempted: spend declined` and labels the sections it feeds.

Pagination is planned, not open-ended. A billed endpoint is paged only as far as the reading needs.

Every billed call's `cost`, read from the vendor's response, goes in its ledger row, and the report states the run's total spend and the calls behind it. A task `status_code` other than 20000 is data and may have been charged. What a call costs is cited from `connectors/dataforseo/CONNECTOR.md`.

## Market

Keyword and SERP readings are meaningless without a market. Resolve location and language from the owning root's `about` and the site's actual service area before the first paid call; where they are not established there, ask once. `dataforseo.research.locations` with `country` returns the codes, free.

A competitor set becomes confirmed only when the requester names it, or the run proposes one from `competitors` or the SERP and the requester confirms it by name. The run never confirms a set alone.

## Readiness ledger

One table per audit run, kept in the owning root's work directory beside the audit, opened at preflight before any evidence is read, and updated every time a reading is attempted. It is the only place a run says what evidence it has, and the completion rule below reads it.

The ledger records what happened. It does not invent gateway statuses. Its labels are report distinctions that map onto what the gateway, a tool, or the browser actually returned.

One row per reading part. Each Search Console window is its own row. Lab and field are separate rows. Each Ahrefs report is its own row. Each competitor is its own row. A row reads `available` only for the part that returned. Where one named route bundles several actions, an action that did not return is recorded as its own row and does not leave the bundle marked `available`.

### Fields

| Field | What it holds | Source of the value |
|-------|---------------|---------------------|
| `reading` | The evidence the audit needs, one part in the audit's own words (search-console queries for the reporting window; the same for the previous window; URL inspection for one money page; keyword demand for the target market; one Ahrefs report; one competitor; broken inbound links; lab performance; field performance; Bing index state; crawl inventory; on-page elements; saved rows) | The reading map |
| `route` | The primitive that acquires it: an action id, a tool and command, the person's own browser per `experts/Webmaster/ahrefs-browser.md`, or `tools/Browser Control/` for a page that builds itself in the browser on a site with no bot check | The reading map |
| `discoverable` | Whether that route exists in this harness: `search_actions` returned the id, the tool's `help` answered, or the host named the browser it can drive, per `experts/Webmaster/ahrefs-browser.md`. A discovery call that has not answered is `not attempted: discovery not run`, never assumed present or absent | The call made at preflight, not a prior session |
| `grant` | For an action id: the `list_connections` status for its service and module (`ACTIVE`, `INITIATED`, `EXPIRED`, none). For a tool: `n/a`. For the person's browser: `signed in` or `login required`, observed from the page. A connection absent in `list_connections` with no `execute` answer is `grant: none`, and Preflight says when its Connect Account turn is taken | The call made at preflight |
| `attempted_at` | Absolute timestamp of the actual reading attempt, or `not attempted` with the reason (`discovery not run`, `awaiting confirmation`, `spend declined`, `no confirmed competitor set`, or another reason the run can point at) | The run |
| `target_and_filters` | Property string, URL or domain, date window, dimensions, filters, row limit, market and language, device; for a browser reading the report name, filters and row limit as displayed | The call's own input |
| `result` | One of: `available`, `missing action`, `needs_connect`, `needs_provider`, `login required`, `plan restricted`, `out of quota`, `no data`, `failed`, `not attempted`, `not applicable`. `not attempted` carries its reason, including `not attempted: discovery not run`, `not attempted: awaiting confirmation` and `not attempted: spend declined` | What came back, mapped below |
| `evidence_path` | Absolute path to the saved response, export, or screenshot in the owning root's work directory; never a path into the plugin, never a profile directory | The run |
| `cost` | For a billed action: the `cost` the vendor's response carried; otherwise `0` or `n/a` | The vendor's response |
| `fallback` | The alternate route tried or ruled out, with the reason | The run |
| `impact` | Which audit dimensions this reading feeds, and what the audit cannot conclude without it | The reading map |
| `next_step` | The smallest human or agent action that changes `result`: a Connect Account turn naming service and module, a Set Up Connectors turn, a sign-in in the person's browser, a purchase decision with the price, a wider date window, updating the plugin in that harness, or `none` | The run |

### Mapping what came back onto `result`

| What the run observed | `result` |
|-----------------------|----------|
| The route returned rows, a file, or a visible table with at least one row, for this part | `available` |
| `search_actions` did not return the action id, a tool's `help` did not answer, or a service's `search_actions` returned nothing | `missing action` |
| The gateway answered `needs_connect` | `needs_connect` |
| The gateway answered `needs_provider`, which is the gateway's own tools absent | `needs_provider` |
| The person's browser showed a sign-in, second factor, or challenge page | `login required` |
| The vendor refused a report the account's plan does not include, in the browser or as a vendor 402 or 403 with the plan named | `plan restricted` |
| A vendor 429, a quota message, or a DataForSEO task status naming balance | `out of quota` |
| The route returned successfully with zero rows for the window and filters; for DataForSEO, the task `status_code` is 20000 and its result holds no items | `no data` |
| A DataForSEO envelope whose task `status_code` is not 20000 and not in the balance class; the row records the task status and the `cost` it carried | `failed` |
| A `vendor_error` other than the above, a tool exit 1, or a browser action that failed twice | `failed` |
| The gateway answered `needs_confirmation` and the person has not answered yet | `not attempted: awaiting confirmation`, updated when they answer |
| The person declined a gateway `needs_confirmation` | `not attempted: spend declined` |
| The run chose not to try, and says why (out of scope for a narrowed request, dependent on a missing reading, budget declined, discovery not run) | `not attempted` |
| The reading does not apply to this site (no analytics property exists by the requester's decision; no Bing property was ever verified and the requester declines to) | `not applicable` |

A service whose `search_actions` returns nothing is `missing action`, and its `next_step` is updating the plugin in that harness. That is distinct from `needs_provider`, which is the gateway's own tools absent.

A visible table supports a share or total only when the table shows the population and every row of it is read. Otherwise the figure is `Not available: export plan restricted`, and a required reading whose figure is that share or total is not `available` from the table.

`no data` is not `failed` and not `needs_connect`: an ACTIVE grant that returns no rows is a fact about the property and the window, and the row says which window.


### Required readings for a full growth audit

The rows a full audit must open, and the dimensions they feed. A narrower request opens fewer rows and names the ones it left closed. Broken inbound links are their own row under the backlink profile. Each Ahrefs report is its own row. Each confirmed competitor is its own row.

| reading | route | feeds |
|---------|-------|-------|
| Search Console queries and pages, reporting window | `google.search-console.query` | On-page, content, cannibalization, measurement |
| Search Console queries and pages, previous window | `google.search-console.query` | On-page, content, cannibalization, measurement |
| Search Console sitemaps and one sitemap's detail | `google.search-console.sitemaps`, `google.search-console.get_sitemap` | Reachability and indexing |
| URL inspection, one row per money page | `google.search-console.inspect` | Reachability and indexing |
| Keyword demand and intent for the target market | `dataforseo.research.keyword_ideas`, `related_keywords`, `search_intent`, `keyword_difficulty`, `search_volume` | Content, doors-not-walls, keyword items |
| SERP for the head terms | `dataforseo.research.serp` | Intent alignment, competitor read |
| Ranked keywords, the site's own | `dataforseo.research.ranked_keywords`, the site as `target` | Content, gaps |
| Competitor domains proposed for the site, before the set is confirmed | `dataforseo.research.competitors`, the site as `target` | Off-site authority, gaps |
| Ranked keywords, one row per confirmed competitor | `dataforseo.research.ranked_keywords`, that competitor as `target` | Content gaps |
| Ahrefs overview, the site's own profile | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Ahrefs referring domains, the site's own | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Ahrefs anchors, the site's own, the visible list | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Anchor shares for the site, branded and exact-match | rows covering the whole anchor population: an Ahrefs export, a complete visible Ahrefs table, or `dataforseo.backlinks.anchors` with the site as `target`, paged until the items read reach the response's `total_count`; computed by `tools/data/`, weighted by the backlinks each anchor carries. Rows short of the population, a page cut by a stated limit among them, leave the shares `Not available: partial anchor population` | Off-site authority |
| Authority comparison, the site and each confirmed competitor from one provider | Ahrefs Overview where the plan reads every domain in the set, otherwise `dataforseo.backlinks.summary` for each, its figure recorded with DataForSEO's own metric name and scale | Off-site authority |
| Ahrefs organic keywords | `experts/Webmaster/ahrefs-browser.md` | Content, off-site authority |
| Ahrefs content gap | `experts/Webmaster/ahrefs-browser.md`, only against a confirmed competitor set; otherwise the row is `not attempted: no confirmed competitor set` and the section is `Not available: no confirmed competitor set` | Content gaps |
| Each competitor's referring domains and anchors | `dataforseo.backlinks.referring_domains`, `dataforseo.backlinks.anchors` | Off-site authority |
| Broken inbound links | the Ahrefs broken backlinks report in `experts/Webmaster/ahrefs-browser.md` | Off-site authority; the fastest recoverable value |
| Crawl inventory | `tools/site-crawl/` | Reachability, redirects, canonicals, orphans |
| Lab performance, mobile and desktop | `google-apis.insights.run` | Reachability (speed) |
| Field performance | `google-apis.insights.run`, from `loadingExperience` and `originLoadingExperience` | Reachability (speed); absent `metrics` is neither zero nor a pass |
| Bing index and query state | `bing.webmaster.list_sites`, `inspect_url`, `search_performance`, `query_performance`, `inbound_links` | Reachability, analytics and instrumentation |
| Analytics traffic and channels | `google.analytics.run_report` | Measurement, conversion priorities |
| Instrumentation on the live pages | `tools/tag-audit/` | Analytics and instrumentation |
| One page's on-page elements | `tools/seo-page-analyzer/` | On-page |
| Rows already pulled, read together | `tools/seo-data/` `audit` and `keywords` | Ranking, comparison and grouping |
| Behaviour evidence, optional | `clarity.analytics.export` | Conversion priorities |

## Completion

A full growth audit closes only when every required row is `available` or the requester approved a narrower scope naming the rows left closed. A partial run says which sections are partial and gives each such row's `next_step`. A missing route is never a finding about the site.

The ledger enforces that rule as follows.

- Every required row is `available`, or the requester approved a narrower scope naming the rows left closed: the audit may be called full.
- Any required row is `needs_connect`, `needs_provider`, `login required`, `missing action`, or `failed`: the audit is partial; its report says which sections are partial, and each such row's `next_step` is the next human or agent turn.
- A row is `no data`: the section it feeds is judged on the technical foundation and says the data-driven half is unavailable for that window.
- A row is `plan restricted` or `out of quota`: the report names the section as partial and the purchase or wait as the decision, with the price; it never silently requires a subscription.
- The ledger and the report are written together. A report that claims a reading the ledger does not show as `available` is the failure this ledger exists to prevent.
