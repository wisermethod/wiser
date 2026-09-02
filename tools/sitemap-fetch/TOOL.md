---
name: sitemap-fetch
type: tool
category: seo
description: One deterministic snapshot of the URLs a site publishes in its sitemaps, with index files followed, gzip handled, each URL normalized, and every sitemap that failed recorded rather than raised
version: 0.1.2
---

# sitemap-fetch

One JSON object listing every URL a site publishes in its sitemaps, each with its path, slug, first path segment, and last modified date, plus which sitemaps were read and which failed.

## Context

Use it whenever a question turns on what a site publishes rather than on what a page says: to inventory a site's own pages before an audit, to read a competitor's published surface, to establish the baseline a later run is compared against, or to produce the snapshot files a sitemap diff consumes. A run per domain, repeated on the operator's schedule, is what makes month over month comparison possible at all.

Offline use: when the sitemap already sits on disk, a saved historical export, a body fetched through a browser-driving tool because the host refused non-browser clients, or a gzip archive kept from an earlier pull, pass it with `--file` instead of opening a network connection. The snapshot shape is the same, so `tools/sitemap-diff/` compares an offline historical snapshot to a live one without caring which mode produced each side.

Do not use it to judge what it collects. It reports the URLs a site publishes and nothing about their quality, ranking, or worth; clustering, gap analysis, and roadmaps belong to the skills and experts that call it. Do not use it to learn whether a URL is indexed either, which is a search platform's answer and comes through that platform's connector: a sitemap states what a site claims, not what a search engine accepted. It fetches pages of markup, so it is not a crawler and follows no link that is not a sitemap entry. Offline mode reads only the files the caller names and follows no child loc a local index declares.

It authenticates to nothing, holds no credential, reaches no other primitive, and after the first-run install described in Dependencies it requests, in network mode, only the addresses its input names and the child sitemaps those name, none of which may be an address inside this machine or its network. It writes a file only when the caller asks for one, in a directory the caller names.

## Snapshot Shape

Every run produces the same object, whether the site published 4 URLs or 40,000, and whether the seed was a network address or a local file.

| Field | Carries |
|-------|---------|
| `domain` | The host the snapshot is about: `--domain`, the first `--url` host, or in offline mode the first parsed `loc` host, else `local` |
| `fetchedAt` | The date stamped on this snapshot, `YYYY-MM-DD` |
| `sitemaps` | The sitemap addresses or file paths that were actually read as urlsets, index files excluded; the seed addresses or paths when nothing was read |
| `urls` | One entry per distinct URL, sorted by `loc` |
| `count` | How many entries `urls` holds |
| `truncated` | True when `--max` stopped the walk before the sitemaps ran out |
| `errors` | One entry per sitemap that could not be read or was skipped, and per published URL too long to record, each with its `url` and a `reason`; absent when everything read cleanly |
| `note` | Present only when no URL was parsed, labeled `N/A:` with what to check |

Each entry in `urls` carries:

| Field | Carries |
|-------|---------|
| `loc` | The URL as published |
| `path` | Its path, `/` for a root URL |
| `slug` | The last path segment, empty for a root URL |
| `segment` | The first path segment, which is what groups a site into sections |
| `lastmod` | The published `lastmod`, cut to its date, or null when the sitemap omits it |

The shape is the contract a snapshot comparison reads, so two snapshots of one site differ only where the site did. Ordering is by `loc`, duplicate `loc` values collapse to the first, and `--date` stamps `fetchedAt` so a re-run over the same input produces the same bytes.

## Quick Start

```bash
node scripts/sitemap-fetch.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/sitemap-fetch.js fetch --domain example.com
```

One JSON object on stdout:

```
{"domain":"example.com","fetchedAt":"2026-07-27","sitemaps":["https://example.com/sitemap.xml"],"urls":[{"loc":"https://example.com/guide/naming","path":"/guide/naming","slug":"naming","segment":"guide","lastmod":"2026-06-02"}],"count":1,"truncated":false}
```

Offline, from a saved sitemap:

```bash
node scripts/sitemap-fetch.js fetch --file /path/to/work/sitemap.xml --date 2026-04-01
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Needs configuration |
|---------|---------|---------------------|
| `node scripts/sitemap-fetch.js help` | Print usage and exit | No |
| `node scripts/sitemap-fetch.js fetch --domain <host>` | Discover the site's sitemaps, then collect them | No |
| `node scripts/sitemap-fetch.js fetch --url <url>` | Collect the sitemaps the caller names | No |
| `node scripts/sitemap-fetch.js fetch --file <path>` | Collect from local sitemap XML files, no network | No |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--domain <host>` | Discover sitemaps from `https://<host>/robots.txt`, and when it declares none, from `/sitemap.xml` and `/sitemap_index.xml` | None; required unless `--url` or `--file` is given |
| `--url <url>` | An http or https sitemap or sitemap-index address. Repeatable. Given, it replaces discovery | None |
| `--file <path>` | A local sitemap or sitemap-index XML file, absolute path outside this tool directory. Repeatable. Gzip is read by magic bytes or a `.gz` name. Mutually exclusive with `--domain` and `--url` | None |
| `--max <n>` | Stop after this many URLs and report `truncated: true` | 50000 |
| `--date <YYYY-MM-DD>` | The date stamped as `fetchedAt` | Today |
| `--output <dir>` | Also write the snapshot into this directory, an absolute path that must sit outside this tool directory | None; stdout only |
| `--help` | Print usage and exit | Off |

One domain per run in network mode. A sitemap index is followed to its child sitemaps, five levels deep, and a sitemap already read in this run is not read twice. Passing both `--domain` and `--url` collects the named addresses and labels the snapshot with the domain.

Offline mode takes only `--file` seeds: no robots discovery, no http(s) request, and no following of child locs a local index declares. Pass each child sitemap as its own `--file`. Stamp `--date` with the historical date the file represents so a later `sitemap-diff` run compares the right pair of points in time.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## What It Requests

Only http and https addresses are fetched in network mode, and any other scheme is refused before a connection opens: a sitemap address is never a path on this machine. An address carrying an embedded username and password is refused too, because this tool sends no credentials. Offline `--file` mode opens no connection at all.

Every network address is screened before a connection is opened to it, whoever named it: the `--domain` or `--url` target the caller gave, every sitemap a fetched robots.txt or sitemap index declares, and every address a redirect points at. Loopback, private-range, link-local, and unique-local addresses are refused, in every spelling of them, decimal, octal, and hexadecimal forms and the IPv6 forms that carry an IPv4 address inside them included, and so are the addresses cloud platforms answer instance credentials on. A hostname is resolved first and refused when its addresses are, so an ordinary-looking name pointing inward gets no connection either. A refusal names which kind of address it was.

Every `--file` path is screened before it is opened: absolute, resolvable to a real path, a regular file, and outside this tool directory. A relative path, a path inside the tool tree, or a path that cannot be resolved is refused before any other file is read.

Who named the address decides what a refusal costs. One the caller named ends the run: nothing is fetched and the cause is on stderr, because a run aimed somewhere this tool will not go has no partial answer worth returning. One a fetched document named is skipped, recorded in `errors` with its reason, and the rest of the walk continues, which is how this tool treats everything else a site got wrong. A redirect toward a refused address fails that one sitemap and is never followed, so a poisoned index or a redirect chain reaches nothing this tool would not have gone to directly. Offline, a child loc named by a local index is skipped into `errors` the same way: the rest of the named files still parse.

Every URL written into a snapshot or a message is written in public form: an embedded username and password is dropped, and the value of any query parameter whose name reads as authorization is replaced with `redacted`. A snapshot is a file that outlives the run, and the constitution's Irreversibles govern what may enter one. The request itself is made with the parameter intact, so a sitemap that authorizes itself by query string still reads.

Each network request waits 20 seconds and then counts as a failure. Redirects are followed one hop at a time, five hops at most, and each hop is screened and waits its own 20 seconds.

## Script Contract

The script in this tool, and the destination screen beside it that the script imports, follow `system/templates/Script Contract.md`: self-contained imports, help answered before anything else, and the stdout and stderr rules. They read no configuration file, so that contract's `--env` clause has nothing to bind here. They do import one package, `undici`, which `package.json` declares alongside the module form, so the contract's dependency check applies: the first run installs it with `npm ci` into this tool's own directory and asks for a re-run. The sections above state what the command does; the contract states how the script behaves getting there.

A sitemap that will not read is reported, not raised. A host that does not answer, a 404, a body that will not decompress, a declared sitemap this tool refuses to fetch, a redirect toward an address it will not go to, a local file that will not parse: each lands in `errors` and the walk continues, and the run still exits 0, because a partial snapshot with its gaps named is the answer a caller asked for and a silent stop is not. A site with no readable sitemap at all comes back with `count` 0 and the `N/A:` note, which is a result rather than a failure. A usage mistake is different: it names the cause on stderr and exits 1 before anything is fetched or read, as does an address the caller named that the screen refuses, and as does a `--file` path the source screen refuses.

## Output

One JSON object on stdout, exit 0, whenever the walk ran, including a walk that read nothing.

A file is written only when `--output <dir>` is given, and `Script Contract.md` governs where that directory may be. The file is named `sitemap-<domain>-<fetchedAt>.json`, with any character illegal in a filename replaced by a hyphen, and its path joins the object on stdout as `file`.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: fetch needs --domain <host>, at least one --url <sitemap url>, or at least one --file <path>` | The command ran with nothing to fetch | Pass one of them |
| `Error: fetch takes either network seeds (--domain / --url) or offline seeds (--file), not both` | Network and offline seeds were mixed | Use only `--domain`/`--url`, or only `--file` |
| `Error: unknown command "<word>"` | A command word other than `fetch` | Run `help` |
| `Error: --url <url> is not a URL this tool can resolve` | The value is not an absolute address, usually a typo or stray quoting | Pass a full sitemap address such as `https://example.com/sitemap.xml` |
| `Error: --url <url> uses <scheme>//` | A scheme this tool does not read | Pass an http or https address |
| `Error: --url <url> carries an embedded username and password` | The address holds credentials in its userinfo | Remove them. This tool sends no credentials, and the message prints the address without them |
| `Error: --url <url> points at <kind>, which this tool does not fetch` | The caller named an address inside this machine or its network, or a cloud metadata address, in some spelling of it | Sitemaps live at public addresses. Nothing on the local network is one; check the address, including what its hostname resolves to |
| `Error: --domain "<host>" points at <kind>, which this tool does not fetch` | Same, for the domain discovery would have connected to | Pass a public host. With `--url` given, `--domain` only labels the snapshot and is not requested |
| `Error: --file must be absolute` | A relative path | Pass an absolute path to the sitemap file |
| `Error: --file resolves inside this tool directory` | The path landed in the shared root's tool tree | Pass a work directory path in the owning root |
| `Error: --file <path> could not be read` | Missing file or unreadable path | Confirm the path and permissions |
| `Error: --file <path> is not a file` | The path names a directory or special node | Pass a regular file |
| `Error: --date must be YYYY-MM-DD` | A date in another form | Pass an absolute date, per `standards/conventions.md` |
| `Error: --max must be a whole number of 1 or more` | A non-numeric or zero cap | Pass a positive whole number, or omit it |
| `Error: --output resolves inside this tool directory` | The output path landed in the shared root | Pass a work directory in the owning root |
| `errors` names `HTTP 404` for every candidate, `count` 0 | The site publishes no sitemap at the conventional locations, or robots.txt points elsewhere | Read the site's robots.txt and pass the real address with `--url` |
| `errors` names `HTTP 403` | The host refuses non-browser clients | Fetch the sitemap with a browser-driving tool, save it, and re-run with `--file` on that path |
| `errors` names `no response within 20000ms` | The host did not answer inside the fixed timeout | Confirm the host is reachable from this machine, then re-run |
| `errors` names `points at <kind>, which this tool does not fetch; skipped` | A robots.txt line or a sitemap index entry declared an address inside this machine or its network, or a cloud metadata address | Nothing was sent to it and the rest of the walk finished. An index pointing inward is worth distrusting; read the index before trusting the snapshot |
| `errors` names `the redirect to <url> was not followed` | A sitemap answered with a redirect toward a refused address | The hop was never sent and that one sitemap failed. Pass the address the chain legitimately settles on with `--url`, or drop it |
| `errors` names `redirected more than 5 times without reaching a sitemap` | A redirect loop, or a chain longer than this tool follows | Pass the address the chain settles on with `--url` |
| `errors` names `is <n> characters, past the 2048 a sitemap URL may be` | The sitemap published a URL longer than the protocol allows one to be | That URL is absent from `urls` and named here instead of being cut down to fit, because a shortened address is a different address. The rest of the snapshot is complete |
| `errors` names `named by a local sitemap index; offline mode does not fetch child sitemaps` | A `--file` was a sitemap index | Pass each child sitemap as its own `--file` |
| `count` is far below the site's real page count | An index was deeper than five levels, or `--max` stopped the walk | Check `truncated`; raise `--max`, or pass the deep child sitemaps directly with `--url` or `--file` |
| `count` 0 with the `N/A:` note on a site that has a sitemap | The document is not a `urlset` this reader recognizes, for instance one whose elements carry a namespace prefix | Confirm the document is a plain sitemap; a sitemap in another dialect needs a different reader |
| A `loc` in the snapshot ends in `redacted` | The published URL carried a query parameter whose name reads as authorization | Expected: the value is deliberately not recorded |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `fetch` against a site whose sitemaps read exits 0 with one parseable JSON object on stdout carrying `domain`, `fetchedAt`, `sitemaps`, `urls`, `count`, and `truncated`.
- `fetch --file` against a local urlset exits 0 with the same shape, `domain` taken from the first `loc` host or `local`, and no network request made.
- Two runs over the same input with the same `--date` produce identical bytes, and `urls` is sorted by `loc` with no duplicate.
- A sitemap index is followed to its children in network mode, a gzipped sitemap is read, and a `lastmod` is carried through cut to its date.
- A sitemap that fails lands in `errors` with its address and reason while the rest of the walk completes, and a site with no readable sitemap exits 0 with `count` 0 and the `N/A:` note.
- An address the caller named that is loopback, private, link-local, or a cloud metadata address, in any spelling, exits 1 naming which it was, with nothing fetched; the same address named by a robots.txt line, a sitemap index, or a redirect is skipped into `errors` with no connection opened to it while the rest of the walk completes.
- A `--file` path that is relative, inside this tool directory, missing, or not a file exits 1 with the cause on stderr before any other file is read; mixing `--file` with `--domain` or `--url` exits 1 the same way.
- Every usage mistake exits 1 with the cause on stderr, stdout empty, before any request is made.
- No run reads a credential, and after the first-run install no run writes any file except the one `--output` asked for, or contacts a host other than the addresses its input names.
