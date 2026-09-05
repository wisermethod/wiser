---
name: sitemap
type: tool
category: seo
description: One deterministic snapshot of the URLs a site publishes in its sitemaps, and one JSON report of what changed between two snapshots of the same site
version: 0.1.1
---

# sitemap

One tool for a site's published URL list: a snapshot of every URL the sitemaps name, and a report of what changed between two snapshots of the same site.

## Context

Use it whenever a question turns on what a site publishes rather than on what a page says: to inventory a site's own pages before an audit, to read a competitor's published surface, to establish the baseline a later run is compared against, or to name what a site published, retired, or revised between two points in time. A change list read off sitemap XML by eye is the highest fabrication risk in competitive work, and `diff` exists so that no caller has to. Reach for the matching subcommand instead of fetching by hand or comparing two files by eye.

Do not use `fetch` to judge what it collects. It reports the URLs a site publishes and nothing about their quality, ranking, or worth; clustering, gap analysis, and roadmaps belong to the skills and experts that call it. Do not use it to learn whether a URL is indexed either, which is a search platform's answer. It fetches pages of markup, so it is not a crawler and follows no link that is not a sitemap entry. Offline mode reads only the files the caller names and follows no child loc a local index declares.

Do not use `diff` to fetch or refresh a sitemap; that is `fetch`, which produces the snapshots `diff` reads. Do not reach for `diff` against a single snapshot: one snapshot has nothing to compare against, and the answer is to keep it as the baseline and diff the next one against it. Do not expect judgment from it. It reports what moved, never what the movement means.

`diff` compares one site with its earlier self. Snapshots of two different sites are a caller mistake rather than a comparison, and a run whose snapshots name different domains says so in its result and still reports every URL on one side as added and every URL on the other as removed.

It authenticates to nothing, holds no credential, and reaches no other primitive. After the packages described in `tools/AGENTS.md` are installed, `fetch` in network mode requests only the addresses its input names and the child sitemaps those name, none of which may be an address inside this machine or its network. `diff` makes no network request. A file is written only when the caller asks for one.

## Quick Start

```bash
node scripts/sitemap.js help
```

Usage text listing the two subcommands, with nothing installed. `node scripts/sitemap.js fetch help` (or `--help`) prints that subcommand's usage; the same form works for `diff`.

```bash
node scripts/sitemap.js fetch --domain example.com
```

If this copy of the plugin has not yet authorised an install, `fetch` reports that it would install `undici` in this tool's directory, and stops. `--install` on that run is the answer: it installs and does the work, and later tools in this copy install without asking. It prints one JSON object:

```
{"domain":"example.com","fetchedAt":"2026-07-27","sitemaps":["https://example.com/sitemap.xml"],"urls":[{"loc":"https://example.com/guide/naming","path":"/guide/naming","slug":"naming","segment":"guide","lastmod":"2026-06-02"}],"count":1,"truncated":false}
```

`diff` does not install anything and runs on a copy with no packages:

```bash
node scripts/sitemap.js diff \
  --previous /path/to/a/work/directory/sitemap-example.com-2026-04-01.json \
  --current /path/to/a/work/directory/sitemap-example.com-2026-05-01.json
```

```
{"domain":"example.com","previousDate":"2026-04-01","currentDate":"2026-05-01","domainMismatch":null,"addedUrls":["https://example.com/compare/a-vs-b","https://example.com/tools/calculator"],"removedUrls":["https://example.com/guide/two"],"changedLastmod":[{"loc":"https://example.com/pricing","from":"2026-02-01","to":"2026-04-20"}],"newPathSegments":["compare","tools"],"counts":{"previousTotal":4,"currentTotal":5,"added":2,"removed":1,"lastmodChanged":1,"newSegments":2},"outputPath":null}
```

Anything else, see Troubleshooting.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the consent-gated dependency install, closed unknown flags, and the stdout and stderr rules. `fetch` writes a snapshot file only when `--output` names a directory outside this tool directory. `diff` writes a report file only when `--output` names a file outside this tool directory. Every other write a run makes is a package install, and `tools/AGENTS.md` is the only place this repository lists those. `fetch` checks for and imports `undici`; `diff` does not. `help` does not. The contract's `--env` clause has nothing to bind here, and the tool carries no Dependencies section because `undici` installs by the consent-gated check and Node covers the rest. The sections below state what each command does; the contract states how the script behaves getting there.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## fetch

One JSON object listing every URL a site publishes in its sitemaps, each with its path, slug, first path segment, and last modified date, plus which sitemaps were read and which failed.

Use it whenever a question turns on what a site publishes: to inventory a site's own pages, to read a competitor's published surface, or to produce the snapshot files `diff` consumes. A run per domain, repeated on the user's schedule, is what makes month over month comparison possible at all.

Offline use: when the sitemap already sits on disk, a saved historical export, a body fetched through a browser-driving tool because the host refused non-browser clients, or a gzip archive kept from an earlier pull, pass it with `--file` instead of opening a network connection. The snapshot shape is the same, so `diff` compares an offline historical snapshot to a live one without caring which mode produced each side.

### Snapshot Shape

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

### Usage

| Command | Purpose | Reads | Writes a file |
|---------|---------|-------|---------------|
| `node scripts/sitemap.js fetch help` | Print usage and exit | No | No |
| `node scripts/sitemap.js fetch --domain <host>` | Discover the site's sitemaps, then collect them | Network | Only with `--output` |
| `node scripts/sitemap.js fetch --url <url>` | Collect the sitemaps the caller names | Network | Only with `--output` |
| `node scripts/sitemap.js fetch --file <path>` | Collect from local sitemap XML files, no network | File | Only with `--output` |

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

Offline mode takes only `--file` seeds: no robots discovery, no http(s) request, and no following of child locs a local index declares. Pass each child sitemap as its own `--file`. Stamp `--date` with the historical date the file represents so a later `diff` run compares the right pair of points in time.

### What It Requests

Only http and https addresses are fetched in network mode, and any other scheme is refused before a connection opens: a sitemap address is never a path on this machine. An address carrying an embedded username and password is refused too, because this command sends no credentials. Offline `--file` mode opens no connection at all.

Every network address is screened before a connection is opened to it, whoever named it: the `--domain` or `--url` target the caller gave, every sitemap a fetched robots.txt or sitemap index declares, and every address a redirect points at. Loopback, private-range, link-local, and unique-local addresses are refused, in every spelling of them, decimal, octal, and hexadecimal forms and the IPv6 forms that carry an IPv4 address inside them included, and so are the addresses cloud platforms answer instance credentials on. A hostname is resolved first and refused when its addresses are, so an ordinary-looking name pointing inward gets no connection either. A refusal names which kind of address it was.

Every `--file` path is screened before it is opened: absolute, resolvable to a real path, a regular file, and outside this tool directory. A relative path, a path inside the tool tree, or a path that cannot be resolved is refused before any other file is read.

Who named the address decides what a refusal costs. One the caller named ends the run: nothing is fetched and the cause is on stderr, because a run aimed somewhere this command will not go has no partial answer worth returning. One a fetched document named is skipped, recorded in `errors` with its reason, and the rest of the walk continues, which is how this command treats everything else a site got wrong. A redirect toward a refused address fails that one sitemap and is never followed, so a poisoned index or a redirect chain reaches nothing this command would not have gone to directly. Offline, a child loc named by a local index is skipped into `errors` the same way: the rest of the named files still parse.

Every URL written into a snapshot or a message is written in public form: an embedded username and password is dropped, and the value of any query parameter whose name reads as authorization is replaced with `redacted`. A snapshot is a file that outlives the run, and the constitution's Irreversibles govern what may enter one. The request itself is made with the parameter intact, so a sitemap that authorizes itself by query string still reads.

Each network request waits 20 seconds and then counts as a failure. Redirects are followed one hop at a time, five hops at most, and each hop is screened and waits its own 20 seconds.

A sitemap that will not read is reported, not raised. A host that does not answer, a 404, a body that will not decompress, a declared sitemap this command refuses to fetch, a redirect toward an address it will not go to, a local file that will not parse: each lands in `errors` and the walk continues, and the run still exits 0, because a partial snapshot with its gaps named is the answer a caller asked for and a silent stop is not. A site with no readable sitemap at all comes back with `count` 0 and the `N/A:` note, which is a result rather than a failure. A usage mistake is different: it names the cause on stderr and exits 1 before anything is fetched or read, as does an address the caller named that the screen refuses, and as does a `--file` path the source screen refuses.

### Output

One JSON object on stdout, exit 0, whenever the walk ran, including a walk that read nothing.

A file is written only when `--output <dir>` is given, and `Script Contract.md` governs where that directory may be. The file is named `sitemap-<domain>-<fetchedAt>.json`, with any character illegal in a filename replaced by a hyphen, and its path joins the object on stdout as `file`.

## diff

One JSON object naming what changed between two dated snapshots of one site's sitemap: the URLs added, the URLs removed, the URLs whose `lastmod` moved, and the path segments that did not exist before.

Use it whenever the question is what a site published, retired, or revised between two points in time: tracking a competitor's output month over month, confirming what a migration actually moved, checking whether pages a client says shipped are in the sitemap, or finding the sections a site has started building that it did not have before. Its result is the authoritative change list, computed rather than estimated.

### Input Snapshots

Each input is one JSON object holding a `urls` array. These are the fields this command reads; anything else in the snapshot is ignored, and a snapshot written by `fetch` carries them already.

| Field | Required | Read for |
|-------|----------|----------|
| `urls` | Yes | The array of entries to compare; a file without it is not a snapshot |
| `urls[].loc` | Yes | The URL itself, which is the identity a comparison is made on |
| `urls[].lastmod` | No | The `changedLastmod` list |
| `urls[].segment` | No | The `newPathSegments` list, which reports first path segments not seen before |
| `domain` | No | Labelling the result, and detecting a mismatched pair |
| `fetchedAt` | No | The `previousDate` and `currentDate` the result reports |
| `truncated` | No | The `sourceIncomplete` field, when it is true |
| `errors` | No | The `sourceIncomplete` field, when it is a non-empty array |

A snapshot can be honestly incomplete. `fetch` exits 0 on a partial walk, setting `truncated` when a cap stopped it and listing every sitemap that failed in `errors`, because a partial answer with its gaps named is still an answer. Diffed against a complete snapshot, the URLs that run never collected read as removals. This command reports that rather than refusing it: `sourceIncomplete` names the side and the reason, the diff is still computed, and the run still exits 0.

Three behaviors follow from comparing on `loc` alone:

- A snapshot that lists the same URL twice contributes it once, and the totals count URLs compared rather than lines read.
- A URL is reported in `changedLastmod` only when both snapshots carry a `lastmod` for it and the two differ. One that gains or loses the field is not a content change; a site that starts or stops publishing `lastmod` would otherwise read as having revised every page at once.
- A snapshot whose entries lack `segment` produces an empty `newPathSegments`, and the rest of the diff is unaffected.

### Usage

| Command | Purpose | Reads files | Writes a file |
|---------|---------|-------------|---------------|
| `node scripts/sitemap.js diff help` | Print usage and exit | No | No |
| `node scripts/sitemap.js diff --previous <path> --current <path>` | Compare the two snapshots and report what changed | Yes, both | Only with `--output` |

| Option | Effect | Default |
|--------|--------|---------|
| `--previous <path>` | The earlier snapshot, an absolute path | None; required |
| `--current <path>` | The later snapshot, an absolute path | None; required |
| `--output <path>` | Also write the result to this file, an absolute path outside this tool directory | None; stdout only |
| `--pretty` | Indent the JSON, for a diff a person will read | Off |
| `--help`, `-h` | Print usage and exit | Off |

The two snapshots are named rather than ordered, because which one is earlier is the whole meaning of `added` and `removed`; a pair passed the wrong way round would invert the report silently. Both paths are absolute: a relative path resolves against whatever directory the caller happened to be in, which is not a property a saved report should depend on.

### Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `domain` | The domain the snapshots name, the current one preferred, or null when neither carries one |
| `previousDate`, `currentDate` | Each snapshot's `fetchedAt`, or null, which is what dates the report |
| `domainMismatch` | Null when the pair agrees; otherwise both domains, marking the result as a comparison of two different sites |
| `sourceIncomplete` | Present only when a snapshot says it is partial: `side`, which is `previous`, `current`, or `both`, and for each affected side the reasons, `truncated`, `errors`, or both |
| `addedUrls` | URLs in the current snapshot and not the previous one, sorted |
| `removedUrls` | URLs in the previous snapshot and not the current one, sorted |
| `changedLastmod` | One entry per URL whose `lastmod` moved, with its `loc`, `from`, and `to`, sorted by `loc` |
| `newPathSegments` | First path segments that appear only among the added URLs, sorted |
| `counts` | `previousTotal`, `currentTotal`, `added`, `removed`, `lastmodChanged`, and `newSegments` |
| `outputPath` | Where the result was also written, or null when it was only printed |

Every other field is always present, so a pair of complete snapshots yields exactly the shape callers already read; test for the `sourceIncomplete` key rather than for a null.

The same pair of snapshots always produces the same bytes: every list is sorted and nothing in the result is read from the clock. Two snapshots that differ in no URL and no `lastmod` produce empty lists and zero counts, which is a result and not a failure; the run still exits 0.

A file is written only when `--output` is given, and the file holds the same object that goes to stdout. `Script Contract.md` governs where that path may point: a work directory in the owning root, never inside this tool.

Both path options can be pointed at any file on the machine, including one holding credentials, so no failure message repeats a byte of what was read: a file that is not JSON, or is JSON but not a snapshot, is named by path and by what was wrong with it, never quoted.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this copy of the plugin has not authorised an install` | First `fetch` in this copy of the plugin, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. Later tools in this copy install without asking. `WISER_ALLOW_INSTALL=1` authorises an unattended run. `diff` never stops for an install |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around |
| `Error: fetch needs --domain <host>, at least one --url <sitemap url>, or at least one --file <path>` | The command ran with nothing to fetch | Pass one of them |
| `Error: fetch takes either network seeds (--domain / --url) or offline seeds (--file), not both` | Network and offline seeds were mixed | Use only `--domain`/`--url`, or only `--file` |
| `Error: unknown command "<word>"` | A command word other than `fetch` or `diff` | Run `help` |
| `Error: --url <url> is not a URL this tool can resolve` | The value is not an absolute address, usually a typo or stray quoting | Pass a full sitemap address such as `https://example.com/sitemap.xml` |
| `Error: --url <url> uses <scheme>//` | A scheme this command does not read | Pass an http or https address |
| `Error: --url <url> carries an embedded username and password` | The address holds credentials in its userinfo | Remove them. This command sends no credentials, and the message prints the address without them |
| `Error: --url <url> points at <kind>, which this tool does not fetch` | The caller named an address inside this machine or its network, or a cloud metadata address, in some spelling of it | Sitemaps live at public addresses. Nothing on the local network is one; check the address, including what its hostname resolves to |
| `Error: --domain "<host>" points at <kind>, which this tool does not fetch` | Same, for the domain discovery would have connected to | Pass a public host. With `--url` given, `--domain` only labels the snapshot and is not requested |
| `Error: --file must be absolute` | A relative path | Pass an absolute path to the sitemap file |
| `Error: --file resolves inside this tool directory` | The path landed in the shared root's tool tree | Pass a work directory path in the owning root |
| `Error: --file <path> could not be read` | Missing file or unreadable path | Confirm the path and permissions |
| `Error: --file <path> is not a file` | The path names a directory or special node | Pass a regular file |
| `Error: --date must be YYYY-MM-DD` | A date in another form | Pass an absolute date, per `standards/conventions.md` |
| `Error: --max must be a whole number of 1 or more` | A non-numeric or zero cap | Pass a positive whole number, or omit it |
| `Error: --output resolves inside this tool directory` | The output path landed in the shared root | Pass a work directory in the owning root |
| `Error: --previous is required.` | The command ran with only one snapshot, or with none | Pass both, the earlier as `--previous` and the later as `--current` |
| `Error: --current is required.` | Same, the other way round | Pass both |
| `Error: --previous must be an absolute path` | A relative path was passed | Pass the full path the work directory resolves to |
| `Error: could not read the previous snapshot <path>: no file at that path` | The path is wrong, or the snapshot was never written | Check the path; list the snapshot directory and pass a file that is there |
| `Error: the current snapshot <path> is not valid JSON.` | The file is not JSON, usually a truncated write or the wrong file entirely | Re-fetch the snapshot with `fetch`; the file's own content is not quoted back, so open it to see what it is |
| `Error: the previous snapshot <path> carries no urls array` | A JSON file that is not a sitemap snapshot | Pass a snapshot written by `fetch`, not a report or a config file |
| `Error: the current snapshot <path> has N url entries with no loc string` | The snapshot is partial or hand-edited | Re-fetch it; diffing it would report the entries with no URL as removals |
| `Error: --output names a directory that does not exist` | The parent directory was never created, or the path has a typo | Create the work directory, or fix the path |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `errors` names `HTTP 404` for every candidate, `count` 0 | The site publishes no sitemap at the conventional locations, or robots.txt points elsewhere | Read the site's robots.txt and pass the real address with `--url` |
| `errors` names `HTTP 403` | The host refuses non-browser clients | Fetch the sitemap with a browser-driving tool, save it, and re-run with `--file` on that path |
| `errors` names `no response within 20000ms` | The host did not answer inside the fixed timeout | Confirm the host is reachable from this machine, then re-run |
| `errors` names `points at <kind>, which this tool does not fetch; skipped` | A robots.txt line or a sitemap index entry declared an address inside this machine or its network, or a cloud metadata address | Nothing was sent to it and the rest of the walk finished. An index pointing inward is worth distrusting; read the index before trusting the snapshot |
| `errors` names `the redirect to <url> was not followed` | A sitemap answered with a redirect toward a refused address | The hop was never sent and that one sitemap failed. Pass the address the chain legitimately settles on with `--url`, or drop it |
| `errors` names `redirected more than 5 times without reaching a sitemap` | A redirect loop, or a chain longer than this command follows | Pass the address the chain settles on with `--url` |
| `errors` names `is <n> characters, past the 2048 a sitemap URL may be` | The sitemap published a URL longer than the protocol allows one to be | That URL is absent from `urls` and named here instead of being cut down to fit, because a shortened address is a different address. The rest of the snapshot is complete |
| `errors` names `named by a local sitemap index; offline mode does not fetch child sitemaps` | A `--file` was a sitemap index | Pass each child sitemap as its own `--file` |
| `count` is far below the site's real page count | An index was deeper than five levels, or `--max` stopped the walk | Check `truncated`; raise `--max`, or pass the deep child sitemaps directly with `--url` or `--file` |
| `count` 0 with the `N/A:` note on a site that has a sitemap | The document is not a `urlset` this reader recognizes, for instance one whose elements carry a namespace prefix | Confirm the document is a plain sitemap; a sitemap in another dialect needs a different reader |
| A `loc` in the snapshot ends in `redacted` | The published URL carried a query parameter whose name reads as authorization | Expected: the value is deliberately not recorded |
| `domainMismatch` is populated | Two different sites were compared | Re-run with two snapshots of the same site; the lists in this result describe two sites, not one site's change |
| A routine re-fetch reports removals in the thousands | The current snapshot is partial: a cap stopped the walk, or a sitemap failed to read, so URLs that still exist were never collected | Check `sourceIncomplete`. Named there, those removals are a gap in the fetch and not pages the site retired; re-fetch with a higher `--max`, or once the failing sitemap reads, then diff again |
| Every URL reports as added and removed | The snapshots come from different sites, or one site changed protocol or host and every `loc` changed with it | Check `domainMismatch` and the `loc` values; a host or protocol move is a real change, and the pair before it is not comparable |
| `changedLastmod` is empty on a site that plainly republished | One or both snapshots carry no `lastmod` for those URLs | Confirm the sitemap publishes `lastmod`; without it on both sides, revisions are invisible to a sitemap diff |
| `newPathSegments` is empty while `addedUrls` is not | The snapshots carry no `segment`, or the new URLs sit under sections that already existed | Both are normal; read `addedUrls` for the detail |

## Success

- `help` prints usage listing the two subcommands to stdout and exits 0 on a copy with no `node_modules/`. `fetch help` and `fetch --help` print that subcommand's usage; the same form works for `diff`.
- `fetch` against a site whose sitemaps read exits 0 with one parseable JSON object on stdout carrying `domain`, `fetchedAt`, `sitemaps`, `urls`, `count`, and `truncated`.
- `fetch --file` against a local urlset exits 0 with the same shape, `domain` taken from the first `loc` host or `local`, and no network request made.
- Two `fetch` runs over the same input with the same `--date` produce identical bytes, and `urls` is sorted by `loc` with no duplicate.
- A sitemap index is followed to its children in network mode, a gzipped sitemap is read, and a `lastmod` is carried through cut to its date.
- A sitemap that fails lands in `errors` with its address and reason while the rest of the walk completes, and a site with no readable sitemap exits 0 with `count` 0 and the `N/A:` note.
- An address the caller named that is loopback, private, link-local, or a cloud metadata address, in any spelling, exits 1 naming which it was, with nothing fetched; the same address named by a robots.txt line, a sitemap index, or a redirect is skipped into `errors` with no connection opened to it while the rest of the walk completes.
- A `--file` path that is relative, inside this tool directory, missing, or not a file exits 1 with the cause on stderr before any other file is read; mixing `--file` with `--domain` or `--url` exits 1 the same way.
- `diff` over two readable snapshots exits 0 with one parseable JSON object on stdout, and re-running the same pair prints the same bytes.
- A URL only in the current snapshot appears in `addedUrls`, one only in the previous appears in `removedUrls`, one whose `lastmod` moved on both sides appears in `changedLastmod`, and a first path segment new to the added URLs appears in `newPathSegments`.
- Either `diff` path option omitted, or a snapshot that is missing, unparseable, or not a snapshot, exits 1 naming the cause on stderr with stdout empty, and no message quotes the file's content.
- A `diff --output` path that is relative, that resolves inside this tool directory, or whose parent directory does not exist is refused before either snapshot is read.
- A snapshot carrying `truncated` or a non-empty `errors` still diffs and still exits 0, with `sourceIncomplete` naming the side and the reason; a pair of complete snapshots carries no `sourceIncomplete` key at all.
- A required flag omitted, a bad `--date` or `--max`, or an unknown option exits 1 with the cause on stderr and stdout empty, and triggers no dependency install when the mistake is a usage one. `diff` never stops for an install.
- An unknown option is refused by name before any install, read, or write.
- No run reads a credential. After packages are installed, `fetch` contacts only the addresses its input names. `diff` opens no network connection. The install itself reaches `registry.npmjs.org`. The writes are what `tools/AGENTS.md` lists an install writing, and the file `--output` asked for.
