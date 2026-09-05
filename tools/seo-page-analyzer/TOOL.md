---
name: seo-page-analyzer
type: tool
category: seo
description: Reports one page's on-page SEO elements from caller-supplied HTML, each element with its measurements and the checks it failed
version: 0.1.1
---

# seo-page-analyzer

One JSON object describing a single page's on-page SEO: its title, meta description, heading structure, body and image alt coverage, link counts, indexability directives, structured data, and Open Graph tags, each with what was measured and which checks it failed.

## Context

Use it whenever a caller already holds a page's HTML and needs the same measurements every time: before rewriting a title or meta description, to find the pages on a site whose headings, alt text, or canonical tags are missing, to check one page against one target keyword, or to compare a page before and after an edit. It is the deterministic half of a page review; a caller pairs it with performance data and its own judgment about what to change first.

Do not use it to decide anything. It reports what the markup contains and which threshold a measurement crossed; it does not rank the findings, recommend a rewrite, or say whether a crossing matters on this page, and a caller that needs those runs its own judgment over this report. Do not use it to fetch a page: it never opens a connection, so the caller fetches however it fetches pages and hands the HTML in. Do not use it across a set of pages in one run, or for anything the page's markup does not carry: rankings, traffic, backlinks, competitors, and rendered-in-the-browser content are all outside it.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request, including to the address `--page-url` names. It reads the one file the caller names and writes nothing.

## What It Checks

Each group reports its measurements and an `issues` list. An issue names what was measured and the guideline it crossed, and stops there.

| Group | Reports | Issues when |
|-------|---------|-------------|
| `title` | The title text and its length in characters; when several title elements exist, the first | No title element; more than one title; length above 60 or below 20; text entirely uppercase; target keyword absent |
| `metaDescription` | The description text and its length; when several description metas exist, the first | No meta description; more than one meta description; length above 160 or below 70; target keyword absent |
| `headings` | Every H1, H2, and H3 text, and the H1 count | No H1; more than one H1; no H2 on a page over 300 words; target keyword absent from every H1 |
| `content` | Word count, paragraph count, image count, images with and without alt text, keyword density | Body under 300 words; any image without a non-empty `alt`; keyword absent from the body, or density above 3 percent |
| `links` | Internal, external, and nofollow link counts | No internal links; fewer than 3 |
| `technical` | Canonical URL (first when several), robots directives, noindex and nofollow flags, viewport presence, `lang` value | Robots contains noindex or nofollow; no canonical link; more than one canonical; no viewport meta; no `lang` on the `html` element |
| `structuredData` | Every JSON-LD `@type` found with its property names | A JSON-LD block does not parse as JSON; no JSON-LD at all |
| `openGraph` | `og:title`, `og:description`, `og:image`, `og:type` | No `og:title`; no `og:image` |

Title, meta description, and canonical each report the first matching element when more than one is present, and still add an issue naming the count, the same pattern as multiple H1s. The reported text is never a silent pick without that issue.

The thresholds are conventional practice for how search results display and how much content a page tends to need. No search platform publishes them as limits, so a crossing is an observation about the page and not a defect, and the numbers are fixed rather than arguments: a tool runs the same way every time.

How the measurements are taken, where a caller could reasonably read them another way:

- Lengths count decoded characters, so `&amp;` is one character in a title, not five.
- Keyword matching is a case-insensitive substring, and density is occurrences of the whole phrase divided by the word count, so a two-word keyword and a one-word keyword do not produce comparable densities.
- An image with `alt=""` counts as an image without alt text, though an empty `alt` is the correct markup for a decorative image.
- Word count is the visible body text: the head, script and style elements, HTML comments, and the tags themselves are removed first, so the title is measured once as a title and a heading a script writes at runtime is not on the page.
- A link counts once, toward internal or external by comparing its resolved host to the host in `--page-url`. Fragment, `mailto:`, `tel:`, and script links count toward neither.

## Quick Start

```bash
node scripts/analyze.js help
```

Usage text, with nothing installed.

```bash
node scripts/analyze.js analyze --html /path/to/a/work/directory/pricing.html --page-url https://example.com/pricing --keyword "team pricing"
```

One JSON object on stdout, shortened here to two of its groups:

```
{"url":"https://example.com/pricing","analyzedAt":"2026-07-27T00:00:00.000Z","targetKeyword":"team pricing","title":{"text":"Pricing","length":7,"containsKeyword":false,"issues":["Title is 7 characters, below the 20-character guideline.","Target keyword does not appear in the title."]},"headings":{"h1":["Pricing"],"h2":[],"h3":[],"h1Count":1,"containsKeywordInH1":false,"issues":["Target keyword does not appear in any H1."]}}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reads a file |
|---------|---------|--------------|
| `node scripts/analyze.js help` | Print usage and exit | No |
| `node scripts/analyze.js analyze --html <path> --page-url <url>` | Report the page's on-page elements | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--html <path>` | File holding the page's HTML, an absolute path. Required by `analyze` | None; required |
| `--page-url <url>` | The http or https address this HTML came from. Parsed to separate the page's own links from links off it, and echoed in the report. Never requested | None; required |
| `--keyword "<text>"` | Target keyword to check the page against | None; every keyword field reports null |
| `--help`, `-h` | Print usage and exit | Off |

One page per run. `--page-url` is required because internal and external links cannot be told apart without a host to compare against; a caller analyzing a build artifact or a staging copy passes the address the page will be served at.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything is read, and the stdout and stderr rules. It ships no package and no system dependency, so it carries no Dependencies section and there is no package install; it reads one caller-named file and writes nothing, so the contract's `--env` and output-path clauses have nothing to bind here.

Markup that parses to nothing is reported, not raised. A file holding no HTML comes back as a full report of absences with exit 0, because "this page has no title, no headings, and no structured data" is the answer a caller asked for. A usage mistake or an unreadable file is different: it names the cause on stderr and exits 1. No message quotes the file's bytes, and a JSON-LD block that does not parse is counted rather than echoed, since a page can put anything inside one.

## Output

One JSON object on stdout, exit 0, whenever a report was produced, including one that reports only absences.

| Field | Carries |
|-------|---------|
| `url` | The address from `--page-url`, as recorded |
| `analyzedAt` | When the analysis ran, in UTC |
| `targetKeyword` | The keyword checked against, or null |
| `title`, `metaDescription`, `headings`, `content`, `links`, `technical`, `structuredData`, `openGraph` | One object per group, with the measurements and `issues` the table above names |

Two rules govern the values. Text taken from the page is reported as the page carries it, entity references decoded and whitespace collapsed, because a report that quietly rewrote a canonical URL or an `og:image` would misdescribe the page. The address in `--page-url` is the caller's own and is recorded without any embedded username and password, without its fragment, and without any query parameter whose name carries authorization, since this report is written into other files.

`containsKeyword`, `containsKeywordInH1`, and `keywordDensity` are null when no keyword was given and when the element itself is missing; they are false or zero only when the element exists and the keyword is absent from it.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --html is required.` | `analyze` ran with no HTML to read | Pass `--html <path>` |
| `Error: no file at <path>` | The path given to `--html` does not exist | Check the path; an absolute one cannot be misread |
| `Error: --page-url is required.` | The address the HTML came from was not passed | Pass it; the tool does not request it and cannot infer it |
| `Error: --page-url is not a URL` | A bare host, a path, or a typo was passed | Pass an absolute address including its scheme |
| `Error: --page-url must be http or https` | A `file://` or other scheme was passed | Pass the address the page is served at, even when the HTML came off disk |
| `Error: could not read <path>` | The path is a directory or is not readable | Point `--html` at a readable file |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| Every group reports absences on a page that plainly has content | The HTML holds a shell that a browser fills in, or the file is not HTML | Hand in the HTML as a browser renders it, not the served source, when the page builds itself client-side |
| A heading or title the page shows is missing from the report | It is written by script, or it sits inside an HTML comment | Neither is on the page as delivered; both are reported as absent by design |
| `imagesWithoutAlt` counts images that are decorative | Empty `alt` counts as missing, per What It Checks | Read `imageCount` against `imagesWithAlt` and judge which are decorative |
| The recorded `url` is shorter than the address passed | A fragment or an authorization-bearing parameter was dropped, per Output | Expected; the page's identity is what remains |

## Success

- `help` prints usage to stdout and exits 0 with nothing installed and nothing configured.
- `analyze` over a well-formed page exits 0 with one parseable JSON object on stdout carrying all eight groups, and the same file analyzed twice produces the same report apart from `analyzedAt`.
- `analyze` with `--html` or `--page-url` missing, or naming a path that does not exist, exits 1 with the cause on stderr and stdout empty.
- A file holding no HTML exits 0 with every group reporting its absences, and never quotes the file's contents.
- Every threshold in What It Checks fires on a page that crosses it and stays silent on a page that does not, and no keyword field is populated when `--keyword` was omitted.
- No run reads a credential, opens a network connection, reads standard input, or writes any file.
