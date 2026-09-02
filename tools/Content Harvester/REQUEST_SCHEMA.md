# Harvest Request Schema

One JSON object, written by whoever is asking for candidates, naming the window, the topics, the sources, and where the bundle goes. `node scripts/harvest.js sample` prints a valid one to start from, and `validate` checks any file against every rule below without fetching.

## Shape

```json
{
  "name": "weekly-roundup",
  "consumer": "the workflow asking for these candidates",
  "timebox": {
    "from": "2026-07-01T00:00:00Z",
    "to": "2026-07-08T00:00:00Z"
  },
  "topics": ["first topic", "second topic"],
  "sources": [],
  "filters": {},
  "output": {
    "directory": "/absolute/path/to/a/work/directory"
  }
}
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `name` | string | Yes | Names the run; becomes the last path segment of the default output directory |
| `consumer` | string | Yes | What asked for the bundle, recorded in the run metadata |
| `timebox.from` | date string | Yes | Earliest publication date accepted |
| `timebox.to` | date string | Yes | Latest publication date accepted, and the point recency is measured from |
| `topics` | string array | Yes, may be empty | Terms scored against each candidate's title, summary, content, and URL |
| `sources` | object array | Yes, may be empty | What to collect, one object per source |
| `filters` | object | No | The filters below; absent means nothing is filtered out |
| `output` | object | No | Where the bundle goes and which files are written |
| `user_agent` | string | No | The User-Agent header sent with every fetch. Defaults to `Content Harvester/0.1.0` |
| `timeout_ms` | number | No | Milliseconds allowed per fetch. Defaults to 15000 |

Dates are anything `Date` parses; write them absolute and with an offset or `Z`, per `standards/conventions.md`. A candidate with no publication date is never rejected for being outside the timebox, and scores `date_missing`.

## Source Objects

Every source object takes `source` (the name the bundle records), `role` (the table below), and optional `topics` (terms scored for this source on top of the request's). Setting `enabled` to `false` skips a source without deleting it, and skipped sources are not validated and not counted.

Feed. `substack_rss` and `reddit_rss` parse identically to `rss`; they exist so a consumer can tell platforms apart in `adapter_type` afterward.

```json
{
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "source": "Example Feed",
  "role": "independent_reporting",
  "topics": ["a topic only this source is scored against"]
}
```

One page. The candidate is built from the page's own metadata tags, and its `content` is left empty; this tool reads metadata, it does not extract article bodies.

```json
{
  "type": "url",
  "url": "https://example.com/an-article",
  "source": "Example Site",
  "role": "primary"
}
```

Several pages, each fetched as a `url` source. One that fails is recorded as an error and the rest still run.

```json
{
  "type": "manual_urls",
  "source": "Curated URLs",
  "role": "curated",
  "urls": ["https://example.com/one", "https://example.com/two"]
}
```

Only `http` and `https` addresses are fetched, and any other `type` is recorded as an `unsupported_adapter_type` rejection rather than stopping the run. An address inside this machine or its network, or a cloud metadata address, is refused before any connection is opened, whichever spelling of it the request uses, and so is a redirect that turns toward one; `TOOL.md` states the screen and `OUTPUT_SCHEMA.md` the reasons it records.

Material from an authenticated platform is handed in as a `manual_urls` source under the terms `TOOL.md` sets out in Authenticated Material: the caller supplies addresses that answer without a session, and the run records them stripped of whatever authorized them. This tool authenticates to nothing and calls no other primitive.

## Roles

A role is a claim about what kind of source this is, and it is the largest single input to a candidate's score. It is a signal, not a truth label.

| Role | Use for | Weight |
|------|---------|--------|
| `primary` | Official documents, filings, papers, product pages | 25 |
| `independent_reporting` | Publications with reporting standards | 20 |
| `expert_analysis` | Named expert commentary | 18 |
| `curated` | Lists a person assembled by hand | 16 |
| `community` | Forums, comment threads, community feeds | 12 |
| `social_signal` | Posts on social platforms | 10 |
| `discovery` | Exploratory or unvetted source lists | 6 |

A role outside this table is accepted and scores 5. A source with no role at all is treated as `discovery`.

## Filters

```json
{
  "filters": {
    "include_terms": ["agent", "workflow"],
    "exclude_terms": ["sponsored"],
    "max_items_per_source": 20,
    "min_score": 0
  }
}
```

| Filter | Type | Behavior | Rejection reason |
|--------|------|----------|------------------|
| `include_terms` | string array | The candidate's title, summary, content, URL, or source name must contain at least one term | `missing_include_term` |
| `exclude_terms` | string array | Any term appearing in that same text rejects the candidate | `excluded_term:<term>` |
| `max_items_per_source` | number | Caps accepted candidates per source type and source name pair | `source_cap_reached` |
| `min_score` | number | Rejects candidates scoring below it | `below_min_score` |

Terms match as plain substrings, compared in lowercase. Filters run after scoring, so `min_score` sees the final score, and after ranking, so `max_items_per_source` keeps the highest scoring items from each source.

## Output

```json
{
  "output": {
    "directory": "/absolute/path/to/a/work/directory",
    "markdown": true,
    "json": true
  }
}
```

`markdown` and `json` both default to `true`; setting either to `false` skips those files. `directory` may be absolute or relative to the request file, and `--output` on the command line overrides it. Every run writes into a new timestamped subdirectory of it, so no run overwrites another.

The directory must resolve outside this tool's own directory; a path that lands inside it is refused before anything is fetched. Per `standards/conventions.md`, it belongs in the owning root's work directory.

## What A Request May Not Ask For

The request describes collection and filtering. It cannot ask this tool to verify a claim, draw a conclusion, write a deliverable, publish anything, or reach material that requires authenticating to a platform.
