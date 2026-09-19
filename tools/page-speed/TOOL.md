---
name: page-speed
type: tool
category: seo
description: One JSON object of PageSpeed Insights v5 lab and field readings for one URL and one strategy
version: 0.1.0
---

# page-speed

One JSON object holding PageSpeed Insights v5 readings for one URL and one strategy, with lab and field data kept apart.

## Context

Use it when a caller needs the same PageSpeed Insights reading every time: before and after a performance change, to separate a lab regression from a field one, or to attach numbers to one URL and one strategy. Lab data is a Lighthouse run from a datacenter. Field data is what Chrome users actually experienced, a 28-day rolling window from the Chrome UX Report. They are different measurements and are kept apart in the output so one cannot be mistaken for the other.

Do not use it to decide what to change. It reports readings; it does not rank findings or recommend fixes. Do not treat absent field data as a zero or a pass: when the Chrome UX Report has no data for the page or origin, that block is marked unavailable with a reason. Do not derive Interaction to Next Paint from Total Blocking Time or any other lab number; if INP is missing from field data it is missing.

The vendor permits keyless use for infrequent calls and recommends a key for automation. Pass `--env` with a PageSpeed API key when calling this tool as part of a run of many URLs, or when a 429 or 403 is returned. Without `--env`, the request is sent with no key.

It holds no other credential, reaches no other primitive, and requests only the PageSpeed Insights v5 endpoint. A file is written only when `--output` names a directory outside this tool directory.

## Quick Start

```bash
node scripts/page-speed.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/page-speed.js run --url https://example.com/pricing --strategy mobile
```

One JSON object on stdout carrying `url`, `finalUrl`, `strategy`, `lab`, and `field`. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Needs configuration |
|---------|---------|---------------------|
| `node scripts/page-speed.js help` | Print usage and exit | No |
| `node scripts/page-speed.js run --url <url> --strategy <mobile or desktop>` | Fetch PageSpeed Insights v5 for one URL and one strategy | Optional `--env` |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--url <url>` | The page to measure; `http` or `https` only, an absolute address. A loopback, private-range, link-local, unique-local, or cloud-metadata address is refused by name before any request, hostname resolved first | None; required |
| `--strategy <mobile or desktop>` | Which PageSpeed strategy to run. Required; there is no default, because mobile and desktop are different measurements | None; required |
| `--category <name>` | A Lighthouse category to request: `performance`, `accessibility`, `best-practices`, or `seo`. Repeatable | `performance` |
| `--env <path>` | Absolute path to a file holding `PAGESPEED_API_KEY=`. Read directly, never copied into `process.env`. The key never appears in stdout, stderr, or the output file | None; the request is sent with no key |
| `--audits` | Include `lighthouseResult.audits` verbatim on the result | Off |
| `--output <dir>` | Also write the result into this directory, an absolute path outside this tool directory | None; stdout only |
| `--help`, `-h` | Print usage and exit | Off |

One URL and one strategy per run. Measuring both strategies, or a set of URLs, means one run each, which keeps every result attributable to the address and strategy that produced it.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. No command checks for a package or runs an install. `--env` is optional: absent, the request is sent with no key; present, the file is read directly and its values never enter the process environment, a log, or the output. A file is written only when `--output` names a directory outside this tool directory. The sections above state what the command does; the contract states how the script behaves getting there.

## Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `url` | The address from `--url`, as requested |
| `finalUrl` | The address the vendor reports it analyzed |
| `strategy` | `mobile` or `desktop`, as requested |
| `fetchedAt` | When the reading ran, in UTC |
| `lighthouseVersion` | The Lighthouse version the vendor used, or null |
| `requestUrl` | The PageSpeed Insights request URL, with any `key` parameter redacted |
| `lab` | Lighthouse lab metrics, each a number or null |
| `labIssues` | Names of lab metrics the response did not carry; empty when every metric was present |
| `field` | `{ page, origin }`, each a field-data block or `{ available: false, reason }` |
| `categories` | Each requested category's score, or null when the response did not carry it |
| `audits` | Present only with `--audits`, holding `lighthouseResult.audits` verbatim |
| `file` | Present only with `--output`, the path the object was also written to |

`lab` carries `performanceScore`, `firstContentfulPaintMs`, `largestContentfulPaintMs`, `cumulativeLayoutShift`, `totalBlockingTimeMs`, `speedIndexMs`, and `interactiveMs`. A missing metric is `null` and is named in `labIssues`. None of these is used to fill in field data.

A field-data block that is available carries `overallCategory` and the metric pairs the Chrome UX Report supplied, each `{ percentile, category }`: `lcpMs`, `inpMs`, `cls`, `fcpMs`, `ttfbMs`. A metric the vendor did not supply is omitted, never invented. When the vendor returns no `loadingExperience`, or its `metrics` object is empty, `page` is `{ available: false, reason: "no field data for this page in the Chrome UX Report" }`. The origin block uses `originLoadingExperience` and the reason `no field data for this origin in the Chrome UX Report`.

The file, when `--output` is given, is named `page-speed-<host>-<strategy>-<YYYY-MM-DD>.json`.

## Troubleshooting

The stops every tool shares, an unknown flag and a path that is relative or inside this tool, are in `tools/RUNNING.md`; this tool installs nothing; the rows below are its own.

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --url is required.` | `run` ran with no page to measure | Pass `--url <url>` |
| `Error: --strategy is required.` | `run` ran with no strategy | Pass `--strategy mobile` or `--strategy desktop`. There is no default |
| `Error: --strategy must be mobile or desktop` | A value this command does not run | Pass `mobile` or `desktop` |
| `Error: --url is not a valid URL` | The value could not be parsed | Pass an absolute http or https address |
| `Error: --url must be http or https` | A scheme this tool does not fetch | Pass an http or https address |
| `Error: --url <url> points at <kind>, which this tool does not fetch` | The address is loopback, private-range, link-local, unique-local, or a cloud metadata address, in some spelling of it | Pass a public page address; check what the hostname resolves to |
| `Error: --category must be performance, accessibility, best-practices, or seo` | A category name this command does not request | Pass one of those four names; repeat the flag for more than one |
| `Error: --env must be an absolute path` | A relative path was passed | Pass the absolute path the Provides binding resolves to |
| `Error: --env names a file that does not exist` | The path does not name a file | Resolve the Provides binding and pass that absolute path; this tool does not search for a configuration file |
| `Error: --env file does not set PAGESPEED_API_KEY` | The file was read and the key was not in it | Add `PAGESPEED_API_KEY=<value>` to the bound file |
| `Error: PageSpeed Insights returned HTTP 429 from <endpoint>` | The vendor rate-limited a keyless or heavy run | Pass `--env` with a PageSpeed API key |
| `Error: PageSpeed Insights returned HTTP 403 from <endpoint>` | The vendor refused the request | Pass `--env` with a PageSpeed API key |
| `Error: PageSpeed Insights returned HTTP <status> from <endpoint>` | The vendor did not return a reading | Confirm the URL is publicly reachable, then re-run |
| `Error: could not fetch PageSpeed Insights` | The request timed out or did not complete | Confirm this machine can reach `www.googleapis.com`, then re-run |
| `Error: unknown command` | A command word other than `run` | Run `help` |
| `field.page.available` is false on a page that has traffic | The Chrome UX Report has no 28-day field data for that exact URL | Read `field.origin`; origin-level data is the fallback, and its absence is still not a pass |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `run` against a URL the vendor analyzes exits 0 with one parseable JSON object on stdout carrying `lab` and `field`, and `strategy` equal to the value passed.
- `run` with `--url` or `--strategy` omitted, or with an unknown option, exits 1 naming the missing or unknown option, stdout empty, before any request.
- A `--url` that points at a loopback, private-range, link-local, unique-local, or cloud-metadata address, including a hostname that resolves to one, exits 1 naming which it was, with nothing fetched.
- A vendor response with no `loadingExperience` reports `field.page.available` false and the reason `no field data for this page in the Chrome UX Report`; INP appears in `field.page` only when the vendor supplied `INTERACTION_TO_NEXT_PAINT`.
- `run --env <file>` sends `key=` on the request, and the key string appears in neither stdout, stderr, nor the output file.
- A 429 or 403 names the status and the endpoint and tells the caller to pass `--env` with a PageSpeed API key, and never repeats the vendor body.
- No run installs a package. A file is written only when `--output` names a directory.
