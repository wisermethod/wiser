---
name: tag-audit
type: tool
category: marketing
description: One JSON report of which analytics and behavior tags a live page serves, with each tag's id where the served HTML exposes it
version: 0.1.1
---

# tag-audit

One JSON object naming which analytics and behavior tags a page serves, and the id of each one its HTML exposes.

## Context

Use when what a site is instrumented with is itself the question: before an engagement that will depend on the site's own analytics, when a report's numbers look wrong and nobody has confirmed the tag is installed, when a client says a tag was added and that claim needs checking, or when comparing instrumentation across a set of pages.

Do not use when the question is what the analytics say rather than whether they exist; that is the platform's own connector. Do not use it to prove a tag is absent: it reads the served HTML, so a loader injected only after hydration will not appear, and a negative result is a prompt to check further rather than a finding.

## Quick Start

```bash
node scripts/tag-audit.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/tag-audit.js audit --url https://example.com/pricing
```

One JSON object on stdout:

```
{"url":"https://example.com/pricing","final_url":"https://example.com/pricing","http_status":200,"method":"served-html","html_bytes":48213,"tags":{"clarity":{"label":"Microsoft Clarity","present":true,"id":"<container id>"},"...":"..."},"summary":{"present":["Microsoft Clarity","Google Analytics 4"]},"missing_note":"..."}
```

Anything else, see Troubleshooting.

## Detected Tags

| Tag | Reported present when the HTML carries | Id captured from |
|-----|----------------------------------------|------------------|
| Microsoft Clarity | the tag script URL, or the inline queue init call | either form |
| Google Analytics 4 | the `gtag/js` script URL, or a `gtag` config call | either form |
| Google Tag Manager | the `gtm.js` script URL, or a bare container id | either form |
| Hotjar | the settings assignment, or the CDN host | the settings assignment only |
| Plausible | the script URL | not exposed by the markup |
| Meta Pixel | the pixel init call, or the events script host | the init call only |
| Segment | the CDN host, with or without the key in the path | the keyed URL only |

A tag reports `present: true` whether or not an id came with it; the id is what the markup happens to expose, not the test. The Google Tag Manager check also matches a bare container id anywhere in the document, so a page that merely prints one in prose or in a comment reads as instrumented. Nothing outside this table is looked for, and a tag the list does not name is not reported missing; it is simply not covered.

## Usage

| Command | Purpose | Needs configuration |
|---------|---------|---------------------|
| `node scripts/tag-audit.js help` | Print usage and exit | No |
| `node scripts/tag-audit.js audit --url <url>` | Fetch the page and report its tags | No |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--url <url>` | The page to audit; `http` or `https` only, and a bare host gains `https://` | None; required |
| `--help`, `-h` | Print usage and exit | Off |

One page per run: auditing a set means one run each, which keeps every result attributable to the URL that produced it.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding. It writes no output file: nothing it produces lands anywhere but stdout. **The first run is the exception.** This tool declares one package, `undici`, and installs it the first time it is called, which reaches the npm registry once and writes what `tools/AGENTS.md` lists a first run writing. Later runs write nothing and the only request is for the page the caller named, plus any redirect that page issues. Redirects are followed and the landing address is reported as `final_url`, so a run that ended somewhere other than where it started says so. The request waits 20 seconds and then fails rather than hanging.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything else, and the stdout and stderr rules. It reads no configuration file, so that contract's `--env` clause has nothing to bind here. It does import one package, `undici`, so the contract's dependency check applies: the first run installs it with `npm ci` and asks for a re-run. Everything a run of this tool writes, and where, is listed in `tools/AGENTS.md`, which is the only place this repository states it. The sections above state what the command does; the contract states how the script behaves getting there.

## Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `url` | The address actually requested, after a bare host gained a scheme |
| `final_url` | Where the request landed once redirects were followed |
| `http_status` | The status of the response that was read |
| `method` | Always `served-html`, naming the read this tool performs and its limit |
| `html_bytes` | Size of the document read, which distinguishes a real page from an empty shell |
| `tags` | One entry per tag in Detected Tags: its `label`, whether it is `present`, and its `id` or null |
| `summary.present` | The labels found, for a caller that wants only the short answer |
| `missing_note` | The labels not found, with the hydration caveat, or null when every tag was found |

A page that does not serve is a failure, not a result: a non-2xx status exits 1 naming the status, because a tag audit of an error page would report all seven tags absent and read as a finding.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --url is required.` | The command ran with no page to audit | Pass `--url <url>` |
| `Error: --url is not a valid URL` | The value could not be parsed, usually a typo or stray quoting | Pass a page address such as `https://example.com/pricing` |
| `Error: --url must be http or https` | A scheme this tool does not fetch | Pass an http or https address; this tool reads web pages, never a path on this machine |
| `Error: could not fetch <url>: no response within 20 seconds` | The host did not answer inside the fixed timeout | Confirm the host is reachable from this machine, then re-run |
| `Error: could not fetch <url>: the request did not complete` | DNS, TLS, or connection failure | Check the address and the machine's network path to it |
| `Error: <url> returned HTTP <status>` | The page did not serve | Fix the URL or the access path. A 403 or 429 usually means the host refuses non-browser clients, which this read cannot pass; audit it with a browser-driving tool instead |
| `Error: unknown command` | A command word other than `audit` | Run `help` |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| Every tag reports `present: false` on a site known to be instrumented | The loaders are injected client-side, after the HTML this tool reads | Confirm with a tool that drives a real browser before reporting anything as missing |
| A tag reports `present: true` with `id: null` | The markup carries the loader but not the id, which is normal for several of these tags | Read the id from the platform's own console if it is needed |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `audit` against a page that serves exits 0 with one parseable JSON object on stdout.
- `audit` with `--url` omitted exits 1 naming the missing option, stdout empty.
- A scheme other than http or https is refused before any network call is made.
- A page whose served HTML carries a covered loader reports that tag `present`, and reports its id when the markup exposes one.
- No credential is read, and after the first-run install no run writes a file or contacts a host other than the one the URL names and its redirect targets.
