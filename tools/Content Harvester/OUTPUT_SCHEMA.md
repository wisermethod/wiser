# Harvest Output Schema

A `run` writes up to three files into a fresh timestamped directory and prints one JSON object to stdout. The JSON files are the contract automation reads; the Markdown file is for a person.

## On stdout

```json
{"ok":true,"candidate_count":12,"rejected_count":5,"error_count":1,"output_directory":"/path/to/directory/2026-07-08T15-31-00-000Z"}
```

`validate` prints `{"ok":true,"name":"...","sources":3}` and fetches nothing. `run --dry-run` prints the same plus `dry_run`, `request`, `sources_requested`, and the `output_directory` it would have written, and neither fetches nor writes. `sample` prints a request object. Failure prints nothing to stdout: the reason goes to stderr and the exit code is 1.

## harvest-candidates.json

```json
{
  "schema_version": 1,
  "run": {
    "id": "2026-07-08T15-31-00-000Z",
    "name": "weekly-roundup",
    "consumer": "the workflow asking for these candidates",
    "timebox": { "from": "2026-07-01T00:00:00Z", "to": "2026-07-08T00:00:00Z" },
    "topics": ["first topic"]
  },
  "candidates": [],
  "clusters": [],
  "rejected": [],
  "errors": []
}
```

`candidates` is sorted by score, highest first. The request file's path is not recorded; the run is identified by `name` and `id`.

## Candidate

```json
{
  "id": "a1b2c3d4e5f60718",
  "title": "Article title",
  "url": "https://example.com/an-article",
  "canonical_url": "https://example.com/an-article",
  "source": "Example Feed",
  "adapter_type": "rss",
  "source_role": "independent_reporting",
  "author": "Author name",
  "published_at": "2026-07-06T12:00:00.000Z",
  "discovered_at": "2026-07-08T15:31:00.000Z",
  "summary": "Short summary the source supplied",
  "content": "Content the source supplied, empty for url sources",
  "topics": ["first topic"],
  "matched_topics": ["first topic"],
  "score": 72,
  "score_reasons": ["source_role:independent_reporting", "topic_match", "recent:72h"],
  "discovered_by": { "type": "rss", "source": "Example Feed", "url": "https://example.com/feed.xml" },
  "raw": {}
}
```

`id` is the first 16 hex characters of a sha256 over the canonical URL and the publication date, so the same item collected twice gets the same id. `url` is the address as the source gave it, minus any embedded username and password and minus every credential-bearing query or fragment parameter, both of which are stripped from every URL this tool records; the fetch is still made with the address the request gave, so a caller's signed URL works and no record of the run carries the signature. `canonical_url` drops those, the fragment, and the common tracking parameters as well; it is what deduplication and clustering compare, which is also why two arrivals of one article under different session ids collapse to one candidate. `published_at` is ISO 8601 in UTC, or `null` when the source gave no date. `discovered_by.url` carries only the scheme, host, and path of the source URL. `raw` is whatever the source handed over before normalization, with every http and https address inside it recorded in the stripped form above and nothing else altered; it is the one field with no shape: never depend on it. The same stripping reaches addresses written inside `title`, `summary`, and `content`.

`score_reasons` names every rule that fired: `source_role:<role>` always, then `topic_match`, one of `recent:24h`, `recent:72h`, `recent:week`, or `date_missing`, then `summary_detail`, `content_detail`, and `author_present` when they apply. The weights are in REQUEST_SCHEMA.md.

## Cluster

```json
{
  "cluster_id": "0f1e2d3c4b5a6978",
  "title": "Representative title",
  "item_ids": ["a1b2c3d4e5f60718", "b2c3d4e5f6071829"],
  "urls": ["https://example.com/an-article"],
  "sources": ["Example Feed", "Another Feed"],
  "top_score": 72
}
```

Clusters group items sharing a canonical URL, or a title that normalizes to the same string, which is how a story picked up by several sources shows as one thing. The grouping is by both tests at once and it carries along: an item sharing a title with a second and a URL with a third puts all three in one cluster. An item with neither key stands alone rather than joining every other item that also has neither.

A cluster therefore agrees with deduplication by construction: a candidate dropped as `duplicate:url` or `duplicate:title` is always in the same cluster as the candidate named by its `duplicate_of`.

They are built before deduplication, and that is deliberate: after it, every cluster would hold exactly one item and say nothing. The consequence is that `item_ids` can name an item that deduplication then dropped, so it does not appear in `candidates`. Read `item_ids` as the evidence that a story was seen more than once, never as an index into `candidates`.

## Rejected

```json
{ "reason": "outside_timebox", "title": "An older article", "url": "https://example.com/older", "source": "Example Feed", "adapter_type": "rss" }
```

| Reason | Means |
|--------|-------|
| `unsupported_adapter_type` | The request named a `type` this tool does not collect |
| `missing_url` | The source gave an item with no link |
| `outside_timebox` | The publication date fell outside `timebox` |
| `excluded_term:<term>` | That term from `exclude_terms` appeared in the item's text |
| `missing_include_term` | No term from `include_terms` appeared in the item's text |
| `below_min_score` | The final score was under `min_score` |
| `source_cap_reached` | `max_items_per_source` was already met for this source |
| `duplicate:url` | An earlier candidate had the same canonical URL |
| `duplicate:title` | An earlier candidate had a title that normalizes the same |

The two `duplicate` reasons also carry `duplicate_of`, the id of the candidate that was kept.

## Error

```json
{ "source": "Example Feed", "adapter_type": "rss", "message": "Request to https://example.com/feed.xml returned HTTP 404.", "retryable": false }
```

One entry per source that failed; the rest of the run continues. `retryable` is true for a timeout, a connection failure, and the HTTP statuses that mean try again later. A message names the status and the address called, and never the provider's own text, which can carry a credential.

A failure the destination screen caused carries one more field, `reason`, so it can be read without parsing prose. It is absent from every other error.

```json
{ "source": "Curated URLs", "adapter_type": "manual_urls", "message": "Refused the redirect from https://example.com/an-article to http://169.254.169.254/: the destination is a cloud instance metadata address, which this tool does not fetch. The redirect was not followed.", "retryable": false, "reason": "blocked_redirect:cloud_metadata" }
```

| `reason` | Means |
|----------|-------|
| `blocked_destination:<kind>` | The address the request named is one this tool does not fetch. Nothing was sent |
| `blocked_redirect:<kind>` | A hop in the redirect chain pointed at one. That hop was never requested |
| `unresolvable` | The hostname returned no address at all |

`<kind>` is one of `loopback`, `private_range`, `link_local`, `unique_local`, `cloud_metadata`, `unspecified`, or `unroutable`; a redirect refused for its scheme or for embedded credentials reads `blocked_redirect:protocol` or `blocked_redirect:embedded_credentials`.

## harvest-run-status.json

```json
{
  "ok": true,
  "reason": "completed",
  "started_at": "2026-07-08T15:31:00.000Z",
  "finished_at": "2026-07-08T15:31:02.000Z",
  "sources_requested": 3,
  "sources_completed": 2,
  "sources_failed": 1,
  "candidate_count": 12,
  "rejected_count": 5,
  "error_count": 1,
  "output_directory": "/path/to/directory/2026-07-08T15-31-00-000Z"
}
```

`ok` says the run finished and the bundle is readable. It stays true when individual sources failed. A run that could not finish writes no status file at all, because it failed before this point and said so on stderr.

`sources_requested` counts the sources the request did not disable. `sources_failed` counts those that stopped on an error, and `sources_completed` counts the rest, which includes a source that ran to the end and returned nothing. The two therefore do not account for every error: a `manual_urls` source whose individual URLs failed completes, and each failed URL is its own entry in `errors`. Read `error_count` for how much went wrong and `candidate_count` for how much came back; the two source counters say only where a whole source stopped.

## harvest-summary.md

The same run in reading order: run metadata, source health, the top 30 candidates with their scores and reasons, the top 20 clusters, rejection counts by reason, errors, and a closing note that these are candidates and not verified claims. Nothing appears here that is not in the JSON.
