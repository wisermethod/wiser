---
name: site-crawl
type: tool
category: seo
description: One JSON inventory of the URLs a bounded polite crawl can reach from one start URL
version: 0.1.2
---

# site-crawl

One JSON object recording what a bounded, polite crawl can reach from one start URL. A deterministic inventory, not a judgment.

## Context

Use it when the question is what a crawler can reach from one start URL: to inventory a site's own pages before an audit, to see which of those pages a robots rule hides, to list redirect chains, or to compare the crawl against a sitemap snapshot. It is not a crawler in the search engine's sense. It follows links from one start URL within the bounds the caller set, one request at a time, with a delay between them.

Do not use it to decide whether a page should exist, whether it ranks, or whether it is indexed. Do not use it as a search-engine crawl: it does not execute JavaScript, does not fill forms, and never submits or mutates anything. A site that builds itself in the browser defeats it; the tell is an HTML page that carries no `a href` at all, listed under `renderingSuspected`. A PDF is inventoried unread: status, content type, and length, with `pdf: true`, and its body is not parsed.

`sitemap.unreached` lists addresses the sitemap named that this crawl never reached. They are orphan candidates only. A bounded crawl proves nothing beyond its bound: a URL past `--max-pages` or `--max-depth` can sit in `unreached` without being an orphan, and a JavaScript-only link will not be followed even when the bound still had room. When `stoppedByBound` is true, or `reason` is `max-pages` or `max-depth`, raise the bound and re-run before treating a URL in `unreached` as an orphan. When the page is listed under `renderingSuspected`, use a browser-driving tool for that site, and do not call the URL an orphan from this crawl. When `stoppedByBound` or `reason` is missing, do not call the URL an orphan.

It is polite by default: 250 ms between requests, one host, a named user agent, and `robots.txt` `Disallow` honored for that agent and for `*`, per origin, on every request including redirect destinations. URLs discovered but not fetched because of a `Disallow` are listed under `robotsBlocked`. The screen resolves the hostname before the request and the request resolves it again, so a name that changes its answer between the two is not caught; the tool refuses what it can see and does not claim more.

It authenticates to nothing, holds no credential, and reaches no other primitive. A file is written only to the directory `--output` names, and never overwritten.

## Quick Start

```bash
node scripts/site-crawl.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/site-crawl.js crawl --start https://example.com/ --output /path/to/a/work/directory
```

One JSON summary on stdout, and the full inventory (including `pages`) at `site-crawl-YYYY-MM-DD-example.com.json` in that directory. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/site-crawl.js help` | Print usage and exit | No |
| `node scripts/site-crawl.js crawl --start <url> --output <dir>` | Crawl from the start URL and write the inventory | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--start <url>` | The first page. `http` or `https` only, an absolute address. A loopback, private-range, link-local, unique-local, or cloud-metadata address is refused by name before any request, hostname resolved first | None; required |
| `--output <dir>` | Directory to write the inventory into, an absolute path outside this tool directory. The file is named `site-crawl-YYYY-MM-DD-<host>.json` and is refused if it already exists | None; required |
| `--max-pages <n>` | Stop after this many fetched pages. Whole number, 1 to 2000 | 200 |
| `--max-depth <n>` | Do not fetch pages deeper than this. Start is depth 0. Whole number, 0 to 20 | 5 |
| `--delay-ms <n>` | Sleep this many milliseconds between requests. Whole number, 0 or more | 250 |
| `--include-subdomains` | Also follow hostnames that end in `.` plus the start host, and nothing else | Off; one host |
| `--sitemap <path>` | Absolute path to a sitemap `fetch` snapshot JSON. Compared by `loc` against the pages this crawl fetched | None; `sitemap` is null |
| `--user-agent <string>` | `User-Agent` header, also the token `robots.txt` is matched against | `wiser-site-crawl/0.1.0 (+https://github.com/wisermethod/wiser)` |
| `--help`, `-h` | Print usage and exit | Off |

One start URL per run. Breadth-first, one request in flight at a time, 15 seconds per request. Redirects are followed by hand, up to 5 hops, and every URL is screened before it is fetched, including same-host links and every redirect hop. A hop that leaves the allowed host is recorded as `redirectOffHost` and is not followed. Fragments are stripped; query strings are kept. `mailto:`, `tel:`, `javascript:`, and any non-http scheme are not followed.

`robots.txt` is fetched once per origin met, following a redirected robots file up to 5 screened hops. `Disallow` for this tool's user-agent token and for `*` is obeyed, including `*` as any-sequence and `$` as end-anchor. A 404 or 410 is allow-all. A 5xx, a timeout, or a connection failure on the start origin's `robots.txt` stops the run: exit 1, stdout empty, naming the file as unreachable and RFC 9309 section 2.3.1.4 (an unreachable robots file means complete disallow). The same on another origin marks that origin's URLs `robotsBlocked` with reason `robots unreachable` rather than fetching them. Bodies are read up to 2 MiB; a non-HTML content type is recorded and not parsed. `X-Robots-Tag` `noindex` applies to every resource, HTML or not.

No command takes `--env`.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install, `--env`, and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. No command checks for a package or runs an install. A file is written only when `--output` names a directory outside this tool directory, and only if that file does not already exist. The sections above state what the command does; the contract states how the script behaves getting there.

## Output

One JSON object on stdout, exit 0, holding every field below except `pages`, plus `file`. The output file holds the same object including `pages`.

| Field | Carries |
|-------|---------|
| `start` | The normalized `--start` URL |
| `host` | The start host |
| `fetchedAt` | When the crawl ran, in UTC |
| `bounds` | `{ maxPages, maxDepth }` as applied |
| `stoppedByBound` | True when `--max-pages` or `--max-depth` stopped the walk |
| `reason` | `max-pages`, `max-depth`, or null |
| `counts` | `fetched`, `html`, `nonHtml`, `pdf`, `redirectChains`, `non200`, `noindex`, `canonicalElsewhere`, `robotsBlocked` |
| `pages` | One entry per fetched URL (file only) |
| `redirectChains` | Chains longer than one hop |
| `duplicateTitles` | Title to URL list, only for titles that appear more than once |
| `noindexPages` | URLs whose robots meta, googlebot meta, or `X-Robots-Tag` contains `noindex` |
| `canonicalElsewhere` | URLs whose canonical points somewhere other than the page |
| `robotsBlocked` | URLs discovered but not fetched because of `robots.txt` |
| `errors` | `{ url, reason }` for requests that failed or hops that were refused |
| `sitemap` | Null, or `{ snapshotFile, sitemapUrls, reached, unreached }` |
| `renderingSuspected` | HTML pages that carried no `a href` at all |
| `file` | Path of the inventory file (stdout only) |

Each `pages` entry carries `url`, `finalUrl`, `status`, `redirectChain` (each hop `{ from, to, status }`), `contentType`, `contentLength`, `pdf`, `title`, `h1Count`, `hasMetaDescription`, `canonical`, `canonicalMatches`, `robotsMeta`, `xRobotsTag`, `noindex`, `lang`, `internalLinks`, `depth`, and `discoveredFrom`.

`unreached` is labeled as orphan candidates only, because a bounded crawl proves nothing beyond its bound.

## Troubleshooting

The stops every tool shares, an unknown flag and a path that is relative or inside this tool, are in `tools/RUNNING.md`; this tool installs nothing; the rows below are its own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --start is required.` | `crawl` ran with no first page | Pass `--start <url>` |
| `Error: --output is required.` | `crawl` ran with no destination | Pass `--output <absolute dir>` |
| `Error: --start is not a valid URL` | The value could not be parsed | Pass an absolute http or https address |
| `Error: --start must be http or https` | A scheme this tool does not fetch | Pass an http or https address |
| `Error: --start <url> points at <kind>, which this tool does not fetch` | The address is loopback, private-range, link-local, unique-local, or a cloud metadata address | Pass a public page address; check what the hostname resolves to |
| `Error: --max-pages must be a whole number` | A non-numeric or out-of-range cap | Pass a whole number from 1 to 2000 |
| `Error: --max-depth must be a whole number` | A non-numeric or out-of-range depth | Pass a whole number from 0 to 20 |
| `Error: --delay-ms must be a whole number` | A non-numeric delay | Pass a whole number of 0 or more |
| `Error: --output file already exists` | The dated inventory file is already in that directory | Pass a different directory, or remove the file; this tool never overwrites |
| `Error: robots.txt at <url> is unreachable` | The start origin's robots file returned 5xx, timed out, or would not connect | RFC 9309 section 2.3.1.4 treats that as complete disallow; fix the file or the host, then re-run |
| `Error: the sitemap snapshot <path> is not valid JSON` | `--sitemap` did not point at a sitemap fetch snapshot | Pass a snapshot written by `sitemap` `fetch` |
| `Error: unknown command` | A command word other than `crawl` | Run `help` |
| `renderingSuspected` lists the home page | The served HTML has no `a href`; the site likely builds itself in the browser | This crawler cannot see those links; use a browser-driving tool for that site |
| `sitemap.unreached` is long on a large site | The crawl stopped at `--max-pages` or `--max-depth` | Those URLs are orphan candidates only; raise the bound and re-run before treating them as orphans |
| A PDF appears with `pdf: true` and no title | Expected: a PDF is inventoried unread | Read the file by another means if its text is needed |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `crawl` against a reachable start URL exits 0 with one parseable JSON object on stdout that has no `pages` field and does have `file`, and writes the full object including `pages` to that file.
- `crawl` with `--start` or `--output` omitted, or with an unknown option, exits 1 naming the missing or unknown option, stdout empty, before any request.
- A `--start` that points at a loopback, private-range, link-local, unique-local, or cloud-metadata address, including a hostname that resolves to one, exits 1 naming which it was, with nothing fetched.
- A crawl with `--max-pages 3` sets `stoppedByBound` true and `reason` `max-pages`, records a redirect chain, marks a noindex page, marks a canonical-elsewhere page, inventories a PDF unread, lists a robots-blocked URL, and lists a sitemap URL it never reached under `sitemap.unreached`.
- An output file that already exists is refused, and the existing file is left unchanged.
- No run installs a package, reads a credential, or writes anything except the file `--output` names.
