---
id: <dataset>-<YYYYMMDD>-<n>
type: new_finding
dataset: <dataset>
status: open
created: YYYY-MM-DD
---

# <proposed canonical name>

<!-- type is one of: new_finding | stale | merge_proposal | conflict -->
<!-- status is one of: open | decided | applied, and the lifecycle is one path:
     review-pass writes an item with status open into review/<type>/; a human fills
     the Decision block, sets status: decided, and moves the file to review/decided/;
     promote reads only items with status decided, applies each, and sets status: applied.
     After a rebuild, promote --replay re-applies every applied item by its Subject's
     node_type and normalized_name, which is why those two fields are the identity. -->

## Surface forms

- "<form as it appeared>" (<count> occurrences)

## Subject

node_type: <Entity | Idea | Fact>
normalized_name: <lowercase, punctuation and legal suffixes stripped, whitespace collapsed; the identity that survives a rebuild>
node_id: <the engine's id when this item was written; it may change across rebuilds and is never the identity>
data_id: <the source's id; only for a reject decision on a source>
target: <normalized_name and node_id of the alias or merge target; only for alias-of and merge-into>

## Proposed action

<!-- exactly one: promote | alias-of <node id> | merge-into <node id> | mark-stale | reject | edit-ontology -->

## Evidence

| Quote (40 words at most) | Source path | Content hash | Extractor confidence |
|--------------------------|------------|--------------|----------------------|
| "<verbatim>" | corpus/<file> | sha256:<first 12> | <0.0 to 1.0> |

## Why this is not auto-decidable

<!-- why a human is needed: no exact ontology match and no normalized-name match to a
     Canonical of the same type in this set, so the link rules did not attach it; a protected type;
     a single weak source; a contradiction with a Canonical fact; a cross-type similarity -->

## Recommendation

<!-- Memory Expert fills this when it triages; it is advice to the reviewer, never a decision -->

## Decision

reviewer:
decision:
date:
note:
