---
name: Content Harvester
type: tool
category: research
description: Turns one harvest request into a timeboxed, deduplicated, ranked bundle of source candidates with a record of what was rejected and what failed
version: 0.1.1
---

# Content Harvester

One run turns a harvest request into a bundle of source candidates: collected from the feeds and pages the request names, scored, held to its timebox and filters, deduplicated, and written as JSON and Markdown alongside a record of everything rejected and every source that failed.

## Context

Use it when a piece of work needs a repeatable sweep of named sources over a window: a roundup, a market scan, a competitor watch, a research queue. It is subject-agnostic and holds no opinion about any topic; the request supplies the vocabulary, the sources, and the standards.

Do not use it to decide anything. It does not verify a claim, rank truth, summarize a body of work, or write a deliverable, and its scores rank likely relevance only. Whatever verifies claims in this workflow runs after it, on the candidates a person or a skill selected from the list. Do not reach for it to read one known page either; fetching a single URL you already have is not worth a request file.

It authenticates to nothing and reaches no other primitive. Material behind a login reaches it only through the handoff below, and it fetches nothing inside the machine or its network.

## Inputs

One file, named by `--request`, in the shape `REQUEST_SCHEMA.md` defines: `<harvest_request>`. Everything the run does comes from it. Nothing about the calling project belongs in it; a rule that applies to one consumer's work stays with that consumer.

## Quick Start

```bash
node scripts/harvest.js help
```

Usage text, on a copy with nothing installed.

```bash
node scripts/harvest.js sample > /path/to/a/work/directory/weekly.harvest.json
```

A valid starter request to edit. Then check it, which fetches nothing:

```bash
node scripts/harvest.js validate --request /path/to/a/work/directory/weekly.harvest.json
```

```
{"ok":true,"name":"weekly-roundup","sources":2}
```

Then run it. The first real run reports that it would install dependencies, and stops. With `--install` it installs and does the work in the same run.

```bash
node scripts/harvest.js run --request /path/to/a/work/directory/weekly.harvest.json
```

```
{"ok":true,"candidate_count":12,"rejected_count":5,"error_count":0,"output_directory":"..."}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Fetches | Writes |
|---------|---------|---------|--------|
| `node scripts/harvest.js help` | Print usage and exit | No | No |
| `node scripts/harvest.js sample` | Print a starter request to stdout | No | No |
| `node scripts/harvest.js validate --request <path>` | Check a request against every rule | No | No |
| `node scripts/harvest.js run --request <path> --dry-run` | Report what the run would collect and where it would land | No | No |
| `node scripts/harvest.js run --request <path>` | Collect, score, filter, deduplicate, write the bundle | Yes | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--request <path>` | The harvest request, absolute and outside this tool directory. Required by `run` and `validate` | None; required |
| `--output <dir>` | Write the bundle here instead of where the request says, absolute and outside this tool directory | The request's `output.directory` |
| `--dry-run` | Plan the run and stop before fetching | Off |
| `--help` | Print usage and exit | Off |

This tool needs no credentials and takes no `--env`: it fetches public addresses only. The two settings a run might want to vary, the User-Agent header and the per-fetch timeout, are optional fields of the request rather than environment variables, so a run is reproducible from its request file alone and depends on nothing set up around it.

## Authenticated Material

This tool authenticates to nothing, holds no credential, and invokes no other primitive. Material behind a login therefore never arrives by this tool reaching for it; it arrives already authorized, from the caller, on these terms.

**What the caller supplies.** The skill or expert running this tool fetches or authorizes the material through the connector for that platform, then hands it in as one `manual_urls` source whose `urls` are addresses that answer without a session: a signed, time-limited URL the platform issued, or a plain address for material that turned out not to need the login. The caller supplies that source's `source` name and its `role` as well; the role is a claim about what the material is, never about how it was obtained. Addresses only, one list, no headers and no session: what the caller hands over is a way in that stands on its own.

**What the tool guarantees about it.** It sends exactly the URL it was handed, adding only the request's User-Agent and Accept headers and no credential of its own, because it holds none. Every URL it records is stripped first, of userinfo and of every credential-bearing query or fragment parameter, so the signature that authorized the fetch reaches no file the run writes, no message it prints, and no entry in `errors`. The destination screen below applies to a handed-in address exactly as to any other, and a redirect it takes is screened the same way. A handed-in URL that fails becomes one entry in `errors` naming the status and the address as scheme, host, and path. The material itself is then scored, filtered, and deduplicated by the same rules as everything else: arriving through a connector earns it no standing here.

**What stays the caller's.** A signed URL is a credential for as long as it lives, so a request file holding one is credential-bearing material: it belongs in the owning root's work directory and is the caller's to remove when the run is done. This tool never renews a signature, never records the request file's path, and never retries an expired one; an expired signature is an HTTP status in `errors`, and the answer to it is a fresh handoff.

**What cannot be handed in.** Material reachable only with a cookie or an authorization header. This tool takes addresses, not content, and it carries no header it was handed. Where a platform issues no signed URL, the caller extracts what it needs before the harvest and leaves that source out of the request.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, the dependency check, help without configuration, and the stdout and stderr rules. Everything a run of this tool writes, and where, is listed in `tools/AGENTS.md`, which is the only place this repository states it. Two of its rules are worth knowing before the first run, because they are what a request most often collides with.

The request file and the output directory must both resolve outside this tool's own directory, and either one pointing inside it is refused before anything is installed and before anything is fetched. Containment is decided by the path's real identity, its device and inode, rather than by how it is spelled, so a differently cased name for this directory and a symbolic link onto it are refused exactly as the direct spelling is. Per `standards/conventions.md` both belong in the owning root's work directory.

No message this tool prints or records repeats a provider's own text, a response body, or a full request URL. A failed fetch is reported as the status and the address called, scheme, host, and path only. That is because a URL can carry a credential in its userinfo or its query string, and error text travels into logs and into the bundle: a source URL holding an embedded username and password is refused before it is sent, and every URL the run records is written without its userinfo and without any credential-bearing query or fragment parameter. The fetch still uses the address the request gave, which is what lets a caller's signed URL work while no record of the run carries the signature. That stripping reaches URLs inside titles, summaries, feed content, and the raw source record too, since a credential in any of them lands in the same bundle.

Every destination is screened before a connection is opened, and a redirect is a new destination: this tool follows redirects one hop at a time and screens each hop the same way. Loopback, private, link-local, and unique-local addresses are refused, in every spelling of them, decimal, octal, hexadecimal, and IPv6 forms that carry an IPv4 address inside them included, and so are the addresses cloud platforms answer instance credentials on. A refusal names which of those it was. A redirect that turns toward one fails that item with that reason and is never followed, so a run reaches only what its own addresses lead to.

## Output

`run` writes into a fresh timestamped subdirectory, so no run overwrites another: `harvest-candidates.json` (the contract for automation), `harvest-run-status.json` (what happened), and `harvest-summary.md` (the same run for a person). `OUTPUT_SCHEMA.md` defines all three and the JSON object printed to stdout.

A source that fails does not fail the run. It becomes an entry in `errors` and the remaining sources still run, because a partial bundle with an honest account of its gaps is worth more than nothing. `OUTPUT_SCHEMA.md` states exactly what the run status counters do and do not count.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` and run `npm ci` here by hand |
| `no file at <path>` | The path given to `--request` does not exist | Check the path; an absolute one cannot be misread |
| `<path> is not valid JSON` | The request file is malformed, or the path landed on something that is not a request | Run `sample` for a request this tool accepts. The parser's own message is withheld on purpose: it quotes the first bytes of whatever it was handed |
| `is not a valid harvest request` | The file parsed but broke the rules `REQUEST_SCHEMA.md` states, listed one per line | Fix each line, then `validate` again |
| `--request must be absolute` or `--output must be absolute` | A relative path resolves against whichever directory the caller happened to be in | Pass the resolved absolute path |
| `--request resolves inside this tool directory` | The request file named is this tool's own directory or something in it | Pass the request in a work directory in the owning root |
| `the output directory resolves inside this tool directory` | `--output`, or the request's `output.directory` resolved against the request file, lands in this tool's directory | Pass a work directory in the owning root as `--output`, or make `output.directory` name one |
| `Refused <scheme>//` | A source URL is not `http` or `https` | Only those two are fetched. A local file is not a source |
| `it carries an embedded username and password` | A source URL holds credentials in its userinfo | Remove them. This tool sends no credentials, and the runtime's own refusal would have quoted the password |
| `Refused <url>: the destination is <reason>` | A source address is inside this machine or its network, or is a cloud metadata address | Sources are public addresses. Nothing on the local network is one, whichever spelling of the address the request used |
| `Refused the redirect from <url> to <url>` in `errors` | A source answered with a redirect toward a blocked destination | The hop was refused and never sent, and that item failed. A public source redirecting inward is worth distrusting; drop it |
| `did not run: the host does not resolve` in `errors` | The source's hostname returned no address | Check the hostname. A name that resolves only inside a private network is not a source for this tool |
| `redirected more than 5 times without reaching a page` in `errors` | A redirect loop, or a chain longer than this tool follows | Name the address the chain settles on as the source, or drop it |
| `Request to <url> returned HTTP <status>` in `errors` | That source answered with an error | 404 means the address moved. 401 or 403 means it needs authentication, which this tool does not do: fetch it through the connector for that platform and hand it in as `manual_urls` |
| `got no response within <n>ms` in `errors` | The source timed out or refused the connection | Raise `timeout_ms` in the request, or drop the source |
| `unsupported_adapter_type` in `rejected` | The request named a `type` this tool does not collect | Use one from `REQUEST_SCHEMA.md` |
| Fewer candidates than expected | Timebox, filters, or deduplication | Read `harvest-summary.md`, which counts rejections by reason |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |

## Reference

- The request contract: `REQUEST_SCHEMA.md`
- The bundle and status contract, including how to read clusters: `OUTPUT_SCHEMA.md`

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/`.
- `validate` and `run --dry-run` exit 0 with one JSON object on stdout, having made no network request and written no file.
- A run over reachable sources exits 0, prints one JSON object naming a directory, and that directory holds the three files `OUTPUT_SCHEMA.md` defines.
- A run whose sources all fail still exits 0 and still writes a bundle, with one entry in `errors` per source and none of them quoting a provider's text or a full URL.
- An output directory resolving inside this tool directory is refused before anything is fetched.
- No run opens a connection to a loopback, private, link-local, unique-local, or cloud metadata address, on the first request or on any redirect hop, in any spelling of that address; a redirect toward one fails that item with the reason named and is never followed.
- No file the run writes and no message it prints carries a URL with userinfo or a credential-bearing parameter, including the URLs inside titles, summaries, content, and `raw`.
- Every candidate falls inside the timebox or carries no date, no two candidates share a canonical URL, and every `score_reasons` entry corresponds to a rule in `REQUEST_SCHEMA.md`.
- Every set of candidates joined by a shared canonical URL or a shared normalized title, directly or through another member, appears as one cluster, and every candidate deduplication dropped sits in the same cluster as the candidate it duplicated.
