# SEO readings

The one home of which route acquires which reading, what each route needs before it answers, what it costs, and what its absence does to an audit.

**Version:** 0.4.1, 2026-10-13

## What it is and who cites it

`experts/Webmaster/` and `skills/SEO Assets/` cite this file; neither restates it. Action ids resolve through the gateway's `execute`. Tools run from their own directories. Ahrefs readings follow `experts/Webmaster/ahrefs-browser.md`. `tools/Browser Control/` is the route for a page that builds itself in the browser on a site with no bot check.

## Preflight

Before any evidence is read, open the readiness ledger below and fill `discoverable` and `grant` for every required row from live calls made now: `search_actions` per service, `list_connections` once, `help` for each tool, and which browser the host can drive, per `experts/Webmaster/ahrefs-browser.md`. A row's state from an earlier session is not evidence. A row whose discovery call has not answered is `not attempted: discovery not run`, never assumed present or absent. A connection seen absent in `list_connections` with no `execute` answer is recorded as observed there, `grant: none`, and its `next_step` is the Connect Account turn, taken only if no other verified route serves the reading. Then state, before the first read, which rows are ready, which need a human turn, and which readings will be labeled if that turn is declined. A reading that needs only a default, such as the crawl's bound, has that default stated here and runs; it does not wait for an answer. The default Search Console and Analytics window is the latest 28 complete days, and the previous window the 28 days before it. The money pages are the pages the requester names, else the five landing pages with the most goal conversions in the Analytics rows, else the five with the most clicks in the Search Console rows; the rule is stated here and the pages named once those rows are read.

The order, whether or not the host holds the turn until a question is answered:

1. The site and the goal, where the request lacks either, which `experts/Webmaster/` asks before any evidence is read.
2. Every reading that needs no answer from the person, browser readings last among them, since a sign-in, a challenge or a choice of browser can need the person; what blocks one joins the questions. The keyword, SERP and ranked-keyword readings and the vendor's competitor proposal are among them once the market is established from the owning root; where it is not, the market joins the questions and those readings follow its answer. Seed terms are the requester's, else the top non-brand queries in the Search Console rows already read, else the terms of the owning root's `about`. Where `google.search-console.sites` or `google.analytics.list_account_summaries` returns more than one candidate for the site and the requester named none, the property joins the questions, its candidates named, and the account readings follow the answer. A question asked before these leaves every one of them waiting on the person.
3. The audit's questions, together, once, and not again per row. A billed call that stops is raised as its question is put. The question shows each stop's action, its full input values and its price as `connectors/dataforseo/CONNECTOR.md` states it, which for `search_volume` is not published and for `backlinks.summary` is per row with no row bound; the run never supplies a figure that document does not give. It takes one yes or no per stop; a stop left unanswered stays `not attempted: awaiting confirmation`.
4. The readings an answer unlocks, before any stop it leads to. For a confirmed competitor set, Ahrefs first; then the `backlinks.summary` stops the authority comparison still needs, for the site and each competitor, in one further question.

A stop lasts 15 minutes. A confirm sent after it lapsed is answered with a fresh stop carrying `reason: unmatched_confirm`; that fresh stop is shown to the person and waits for their yes, per `skills/Connection Troubleshooter/`, however recently they approved the call. On a host that holds the turn, the stop question is therefore the one question that can be asked twice, and again each time an answer comes after its stop lapsed.

## The readings

| Reading | Route | Needs before it answers | Cost | Absent, the audit loses |
|---------|-------|-------------------------|------|-------------------------|
| Search Console queries, pages, countries, devices, for one window, and again for the previous window | `google.search-console.query` with `dimensions`, `row_limit`, `start_row`, `dimension_filter_groups`, `search_type`, `data_state` | `google` / `search-console` grant ACTIVE; a named public property | none | On-page and content judgments about what already ranks; cannibalization; measurement. A total summed from a top slice describes the rows and not the property |
| Submitted sitemaps and one sitemap's detail | `google.search-console.sitemaps`, `google.search-console.get_sitemap` | same grant | none | Sitemap coverage; the submitted count is not index coverage |
| Google's stored index state for one URL | `google.search-console.inspect` | same grant; one call per URL, so the money pages, not the site | none | Indexed versus crawled for the pages that matter. Query rows do not say whether a page is indexed. A 403 `vendor_error` while the grant reads ACTIVE and `query` on the same property returns rows has two causes. The inspected URL can lie outside the property, such as a `www` page under an apex URL-prefix property: check it against `site_url` first and inspect it under the property that contains it. Otherwise it is the connected account's permission on that property, and the next step is the person checking that account's access in Search Console. Either way the row is `failed` with the status, and the grant is not reconnected to make the call pass, per `skills/Connection Troubleshooter/`. On a bare host, `inspect` can return NEUTRAL with coverage "Page with redirect" while the page is indexed under its `www` canonical: follow `googleCanonical` before concluding anything about indexing |
| Manual actions and security issues, one ledger row each | Search Console's Manual actions and Security issues pages in the person's own browser, driven by the host's extension where it has one; no gateway action reads them. Where a window's daily impressions fell to zero and stayed there, the Crawl stats page on the same route is read too, as its own row | a browser signed in to an account that holds the property | none | Whether anything stops Google serving the site. With a browser available this reading is never `missing action`. Without one, the person opens the pages and pastes or describes what they show, recorded as the person's report and labeled `Unverified: requires confirmation` in the report; with neither, the row is `not attempted: no browser` |
| Keyword demand around seed terms, with intent and difficulty | `dataforseo.research.keyword_ideas`, whose items carry Google Ads search volume, `related_keywords`, `search_intent`, `keyword_difficulty`; `search_volume` only for a term that needs a volume `keyword_ideas` did not return | `dataforseo` / `research` grant ACTIVE; market as `location_code` and `language_code` from `dataforseo.research.locations` | per `connectors/dataforseo/CONNECTOR.md`. `dataforseo.research.search_volume` is one of the two actions Paid calls says the gateway still stops | Keyword items, doors-not-walls, content briefs; the report says demand was not measured |
| What ranks for the head terms | `dataforseo.research.serp` | same grant; market; device | per `connectors/dataforseo/CONNECTOR.md` | Intent alignment against what actually ranks; format calibration |
| What the site ranks for, and the competitors the vendor proposes for it | `dataforseo.research.ranked_keywords` and `competitors`, the site as `target` | same grant; market; the site's bare domain | per `connectors/dataforseo/CONNECTOR.md` | The site's ranked keywords; no proposed competitor set, so the set rests on the requester alone |
| What each competitor ranks for | `dataforseo.research.ranked_keywords`, that competitor as `target` | same grant; market; a competitor set confirmed per Market | per `connectors/dataforseo/CONNECTOR.md` | Content gaps against that competitor |
| Backlink profile: authority, referring domains, backlinks with their routes, anchors, broken inbound | Ahrefs Site Explorer in the person's own browser, per `experts/Webmaster/ahrefs-browser.md`. On a free plan, the site's own profile when that site is verified in the account. Competitors' link evidence through `dataforseo.backlinks.referring_domains` and `dataforseo.backlinks.anchors`. `dataforseo.backlinks.summary` keeps the gateway stop Paid calls names. Every figure that sets the site against its competitors, a score, a referring-domain count or an anchor share, comes from one provider's index for all of them: Ahrefs where the plan reads every domain in the set, otherwise DataForSEO for the site as well as each competitor, with `dataforseo.backlinks.summary` for the score; a figure from one provider is never compared with another's. Where the requester has ruled out paid research, every DataForSEO competitor row is `not attempted: spend declined`; where the person declines a `backlinks.summary` stop, only the score that stop serves is, and `referring_domains` and `anchors` still run. An Ahrefs competitor row is `plan restricted` only where the plan refuses it | Ahrefs: the person's own signed-in browser, and, on a free plan, the site verified in that account. DataForSEO: `dataforseo` / `backlinks` grant ACTIVE | Ahrefs: the account's own plan. DataForSEO: per `connectors/dataforseo/CONNECTOR.md` | Off-site authority; broken inbound, the fastest recoverable value, goes unseen |
| Crawl inventory: status, redirects, canonicals, noindex, orphan candidates | `tools/site-crawl/` `crawl`, with the `sitemap` `fetch` snapshot for orphan candidates | nothing to connect; the tool's default `--max-pages` unless the requester set another, stated at preflight and not waited on | none | Reachability beyond the pages read by hand; `renderingSuspected` naming the home page means the inventory is unreliable and the money pages go through `tools/Browser Control/` on a site with no bot check; another page it names, often a landing or thank-you page with no links, is read through that route before it is taken as a fault. Start from the host the site serves, the home page's final address after its redirects or Search Console's `googleCanonical`; a start answered by `redirectOffHost` is re-run from the destination host, and sections on subdomains need `--include-subdomains`. Where `stoppedByBound` is true the inventory covers only the bound, and no orphan or sitemap-coverage claim rests on `unreached`: raise whichever bound `reason` names, `--max-pages` to at most 2000 or `--max-depth` to at most 20, and re-run into a new `--output` directory, since the tool refuses a file that exists; a bound still hit leaves the row short of the site, the bound stated |
| PDFs the crawl found: status, `X-Robots-Tag` noindex, size, and whether search shows them | the crawl's `pages` entries with `pdf: true`, each address looked up in the Search Console `page` rows already pulled; `google.search-console.inspect` for a PDF that earns impressions or carries noindex | the crawl; the Search Console grant for the lookup | none | Whether documents rank in place of the HTML pages they duplicate, or are indexed when they should not be. The crawl inventories a PDF without reading it: where a finding turns on a PDF's title or text, the host reads that file by its own means and the finding names it; a finding that needs text nobody read is not made |
| Lab performance, mobile and desktop | `google-apis.insights.run`, `strategy` mobile then desktop, `category` `["performance"]`, `audits: true` where lab metric values are needed | `google-apis` / `insights` grant ACTIVE | none | Speed judged from nothing; never estimate a score. TBT never stands in for INP |
| Field performance | `google-apis.insights.run`; field from `loadingExperience` (URL) and `originLoadingExperience` (origin) | same grant | none | Absent `metrics` is no field data, never zero and never a pass |
| Bing index state, queries, inbound links | `bing.webmaster.list_sites`, `inspect_url`, `search_performance`, `query_performance`, `inbound_links` | `bing` / `webmaster` grant ACTIVE; the site in `list_sites` | none | The second index, which feeds generated answers; a site absent from `list_sites` is a verification task at Bing, not a connection fault. `search_performance` `daily_totals` carries null positions and a null query on every row, the report's shape and not missing data |
| Traffic, channels, conversions | `google.analytics.run_report` | `google` / `analytics` grant ACTIVE; a named property | none | Measurement and conversion priorities; no rows is a fact about the property and the window |
| Which tags the live pages serve | `tools/tag-audit/` | nothing | none | Whether absent analytics rows mean absent tracking. It reads the served HTML, so a tag it does not find is confirmed in the rendered page, through `tools/Browser Control/` or the person's browser, before anything reports tracking missing; until then the absence is reported as unconfirmed |
| Behaviour evidence | `clarity.analytics.export` | `clarity` / `analytics` grant ACTIVE; optional | none | Nothing an audit needs; offered only when the requester wants it |
| One page's on-page elements | `tools/seo-page-analyzer/` over HTML the run fetched or the browser returned | nothing | none | The on-page dimension for that page |
| Rows already pulled, read together | `tools/seo-data/` `audit` and `keywords` | the saved responses | none | Ranking, comparison and grouping done by eye, which is the fabrication risk this tool removes |

Every DataForSEO and Ahrefs figure is its vendor's estimate, labeled `Estimated: vendor index` with the provider named; it is never summed with or set against a Search Console or Analytics figure, and cannibalization is read from Search Console rows alone.

A vendor read can carry ownership secrets, as Bing's site list did before the connector stripped them: inspect a reading for credentials, verification codes or tokens before writing it into the work directory.

## Paid calls

A billed call runs when the reading needs it, with no spend statement and no question before it.

The two actions the gateway still stops, `dataforseo.research.search_volume` and `dataforseo.backlinks.summary`, put the gateway's `needs_confirmation` to the person, who answers it; until they do, the row reads `not attempted: awaiting confirmation`. The run never sets `confirm: true` on its own.

A limit the requester states, "no paid research" or a ceiling, binds the run. A reading it rules out is `not attempted: spend declined` and labels the sections it feeds. Against a ceiling, each billed call's worst case, as `connectors/dataforseo/CONNECTOR.md` states it, is compared with what remains before the call is sent, and a call that could pass the ceiling is not sent. A call whose cost came back `unknown` counts at its worst case. A stopped call whose document states no worst case is put to the person with what remains of the ceiling, and is sent only on their yes.

Pagination is planned, not open-ended. A billed endpoint is paged only as far as the reading needs. A reading that needs a whole population, such as the anchor list, is paged at the largest `limit` the action allows whose worst case fits what remains of a stated ceiling, and at most ten pages unless the requester's stated limit covers more; a population past that leaves the reading short of it, its remaining pages and their worst-case cost as the next step.

A balance refusal, a `vendor_error` 402 or a task whose status message names the balance, the 40201 class per `connectors/dataforseo/CONNECTOR.md`, is account-wide; a rate limit is not one. Its row is `out of quota`; the billed DataForSEO rows not yet read are `not attempted: out of quota`, pointing at that row, and are not called; the next step for all of them is the top-up.

Every billed call's `cost`, read from the vendor's response, goes in its ledger row, and the report states the run's total spend and the calls behind it. A task `status_code` other than 20000 is data and may have been charged. A billed call whose cost did not come back, a `vendor_error` or an `uncertain` among them, has `cost` `unknown` in its row, and the total is stated as at least the known sum. What a call costs is cited from `connectors/dataforseo/CONNECTOR.md`.

## Market

Keyword and SERP readings are meaningless without a market. Resolve location and language from the owning root's `about` and the site's actual service area before the first paid call; where they are not established there, ask once. `dataforseo.research.locations` with `country` returns the codes, free.

A competitor set becomes confirmed only when the requester names it, or the run proposes one from `competitors` or the SERP and the requester confirms it by name. The run never confirms a set alone. A competitor list the owning root already keeps names business rivals, and a business rival may never meet the site in search. A set the requester names in this request, by domain or by pointing at that list, is confirmed. A list read without such a pointer is a proposal, put to the requester beside the vendor's own, and no call of any kind takes one of its domains as `target` until the requester confirms it for this audit.

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
| `cost` | For a billed action: the `cost` the vendor's response carried, or `unknown` where none came back; otherwise `0` or `n/a` | The vendor's response |
| `fallback` | The alternate route tried or ruled out, with the reason | The run |
| `impact` | Which audit dimensions this reading feeds, and what the audit cannot conclude without it | The reading map |
| `next_step` | The smallest human or agent action that changes `result`: a Connect Account turn naming service and module, a Set Up Connectors turn, a sign-in in the person's browser, a purchase decision with the price where one is stated, a wider date window, updating the plugin in that harness, the support address a Wiser endpoint answer gives, a wait for a limit to reset, or `none` | The run |

### Mapping what came back onto `result`

| What the run observed | `result` |
|-----------------------|----------|
| The route returned rows, a file, or a visible table with at least one row, for this part | `available` |
| `search_actions` did not return the action id, a tool's `help` did not answer, or a service's `search_actions` returned nothing | `missing action` |
| The gateway answered `needs_connect` | `needs_connect` |
| The gateway answered `needs_provider`, its provider not set up | `needs_provider`, its next step per `skills/Connection Troubleshooter/`: from the Wiser endpoint the service's own setup, on the local gateway a Set Up Connectors turn |
| The person's browser showed a sign-in, second factor, or challenge page, or a signed-in account without access to the property | `login required`, naming which |
| A browser page that reports nothing to list, such as Search Console's "No issues detected" | `available`, with the page text or a screenshot as evidence |
| The person reported what a page shows that the run could not open | `available`, labeled `Unverified: requires confirmation` in the report |
| The vendor refused a report the account's plan does not include, in the browser or as a vendor 402 or 403 whose answer names the plan, DataForSEO's balance refusal aside | `plan restricted` |
| A DataForSEO `vendor_error` 402, or a task whose status message names the balance | `out of quota`, account-wide per Paid calls |
| A vendor 429, or a rate-limit or quota message | `out of quota` for that row only, its next step a wait, for the time the answer names where it names one |
| The route returned successfully with zero rows for the window and filters; for DataForSEO, the task `status_code` is 20000 and its result holds no items | `no data` |
| A DataForSEO envelope whose task `status_code` is not 20000 and not in the balance class; the row records the task status and the `cost` it carried | `failed` |
| A `vendor_error` other than the above, a tool exit 1, or a browser action that failed twice | `failed` |
| The Wiser endpoint answered `unavailable` with `reason: daily_limit` | `not attempted: daily limit`, for that row and every gateway row not yet read, its next step the answer's `message`; no further gateway call is sent this run |
| Any other gateway status, such as `uncertain`, `denied`, `needs_connector`, `needs_provider_capability` or `invalid_arguments` | `failed`, naming the status, its next step per `skills/Connection Troubleshooter/`; a billed call answered `uncertain` is not sent again by the run: it counts at its worst case, and the person decides whether it is repeated |
| The gateway answered `needs_confirmation` and the person has not answered yet | `not attempted: awaiting confirmation`, updated when they answer |
| The person declined a gateway `needs_confirmation` | `not attempted: spend declined` |
| The run chose not to try, and says why (out of scope for a narrowed request, dependent on a missing reading, budget declined, discovery not run) | `not attempted` |
| The reading does not apply to this site (no analytics property exists by the requester's decision; no Bing property was ever verified and the requester declines to) | `not applicable` |

A service whose `search_actions` returns nothing is `missing action`, and its `next_step` is updating the plugin in that harness. That is distinct from `needs_provider`, the gateway's answer when its provider is not set up. No Wiser tools at all is no row's state: it is a Set Up Connectors turn before preflight.

A visible table supports a share or total only when the table shows the population and every row of it is read. Otherwise the figure is `Not available`, naming why: `export plan restricted` where only the plan's export would show the population, `partial anchor population` where a read stopped short of it; a required reading whose figure is that share or total is not `available` from the table.

`no data` is not `failed` and not `needs_connect`: an ACTIVE grant that returns no rows is a fact about the property and the window, and the row says which window.


### Required readings for a full growth audit

The rows a full audit must open, and the dimensions they feed. A narrower request opens fewer rows and names the ones it left closed. Broken inbound links are their own row under the backlink profile. Each Ahrefs report is its own row. Each confirmed competitor is its own row.

| reading | route | feeds |
|---------|-------|-------|
| Search Console queries and pages, reporting window | `google.search-console.query` | On-page, content, cannibalization, measurement |
| Search Console queries and pages, previous window | `google.search-console.query` | On-page, content, cannibalization, measurement |
| Search Console sitemaps and one sitemap's detail | `google.search-console.sitemaps`, `google.search-console.get_sitemap` | Reachability and indexing |
| URL inspection, one row per money page, named per Preflight | `google.search-console.inspect` | Reachability and indexing |
| Manual actions | Search Console in the person's own browser | Reachability and indexing |
| Security issues | Search Console in the person's own browser | Reachability and indexing |
| Keyword demand and intent for the target market | `dataforseo.research.keyword_ideas`, `related_keywords`, `search_intent`, `keyword_difficulty`; `search_volume` is a supplement, not a required row | Content, doors-not-walls, keyword items |
| SERP for the head terms | `dataforseo.research.serp` | Intent alignment, competitor read |
| Ranked keywords, the site's own | `dataforseo.research.ranked_keywords`, the site as `target` | Content, gaps |
| Competitor domains proposed for the site, before the set is confirmed | `dataforseo.research.competitors`, the site as `target` | Off-site authority, gaps |
| Ranked keywords, one row per confirmed competitor | `dataforseo.research.ranked_keywords`, that competitor as `target` | Content gaps |
| Ahrefs overview, the site's own profile | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Ahrefs referring domains, the site's own | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Ahrefs backlinks with their routes, the site's own | `experts/Webmaster/ahrefs-browser.md` | Off-site authority; the routes by which links reach the site |
| Ahrefs anchors, the site's own, the visible list | `experts/Webmaster/ahrefs-browser.md` | Off-site authority |
| Anchor shares for the site, branded and exact-match | rows covering the whole anchor population: an Ahrefs export, a complete visible Ahrefs table, or `dataforseo.backlinks.anchors` with the site as `target`, paged until the items read reach the response's `total_count`; computed by `tools/data/`, weighted by the backlinks each anchor carries. Rows short of the population, a page cut by a stated limit among them, leave the shares `Not available: partial anchor population` | Off-site authority |
| Authority comparison, the site and each confirmed competitor from one provider | Ahrefs Overview where the plan reads every domain in the set, otherwise `dataforseo.backlinks.summary` for each, its figure recorded with DataForSEO's own metric name and scale | Off-site authority |
| Ahrefs organic keywords | `experts/Webmaster/ahrefs-browser.md` | Content, off-site authority |
| Ahrefs content gap | `experts/Webmaster/ahrefs-browser.md`, only against a confirmed competitor set; otherwise the row is `not attempted: no confirmed competitor set` and the section is `Not available: no confirmed competitor set` | Content gaps |
| Each competitor's referring domains and anchors | `dataforseo.backlinks.referring_domains`, `dataforseo.backlinks.anchors` | Off-site authority |
| Broken inbound links | the Ahrefs broken backlinks report in `experts/Webmaster/ahrefs-browser.md` | Off-site authority; the fastest recoverable value |
| Crawl inventory | `tools/site-crawl/` | Reachability, redirects, canonicals, orphans |
| PDFs, one row for the set the crawl found; `not applicable` when its `counts.pdf` is 0 | the crawl's `pages` with `pdf: true`, against the Search Console `page` rows | Reachability and indexing, content |
| Lab performance, mobile and desktop, for the money pages | `google-apis.insights.run` with `audits: true` | Reachability (speed) |
| Field performance | `google-apis.insights.run`, from `loadingExperience` and `originLoadingExperience` | Reachability (speed); absent `metrics` is neither zero nor a pass |
| Bing index and query state | `bing.webmaster.list_sites`, `inspect_url`, `search_performance`, `query_performance`, `inbound_links` | Reachability, analytics and instrumentation |
| Analytics traffic and channels | `google.analytics.run_report` | Measurement, conversion priorities |
| Instrumentation on the live pages | `tools/tag-audit/` | Analytics and instrumentation |
| One page's on-page elements | `tools/seo-page-analyzer/` | On-page |
| Rows already pulled, read together | `tools/seo-data/` `audit` and `keywords` | Ranking, comparison and grouping |

Behaviour evidence through `clarity.analytics.export` is outside this list: offered only when the requester wants it, and never counted toward completion.

## Completion

A full growth audit closes only when every required row is closed: `available` for the whole of what the reading needs, `no data` from a route that answered, or `not applicable`. A partial run says which sections are partial and gives each such row's `next_step`. A missing route is never a finding about the site.

The ledger enforces that rule as follows.

- Every required row is closed: the audit may be called full.
- The requester approved, by name, a narrower scope that leaves rows open: the audit is complete for that scope, reported as such with the rows left out, and never called full. Declining a turn is not approving a narrower scope.
- Any required row is anything else, `needs_connect`, `needs_provider`, `login required`, `missing action`, `failed` or any `not attempted`, or is `available` for less than the reading needs, such as a crawl stopped by its bound, an inventory whose `renderingSuspected` names the home page or a page the browser route has not then read, or a table short of its population: the audit is partial; its report says which sections are partial, and each such row's `next_step` is the next human or agent turn.
- A row is `no data`: the section it feeds is judged on the technical foundation and says the data-driven half is unavailable for that window.
- A row is `plan restricted` or `out of quota`: the report names the section as partial and the purchase or wait as the decision, with the price where a document in this tree states one; it never silently requires a subscription.
- The ledger and the report are written together. A report that claims a reading the ledger does not show as `available` is the failure this ledger exists to prevent.
