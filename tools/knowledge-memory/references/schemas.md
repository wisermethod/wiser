# Databased schemas for the knowledge memory build

The one home of the databased store shapes. These apply when `set.yaml` carries `backend: databased`, per `backends.md`. Wiki shapes live in `wiki-schemas.md`. The graph and hosted stubs have no schema. `tools/knowledge-memory/TOOL.md`, the pack's `graph_model.py`, and the databased branches of the three skills cite this file; none restates a shape. A change here is a change to all of them and gets a version bump below.

**Version:** 0.1.1, 2026-09-11. Preamble names the databased backend; the JSON shapes did not change.

Every file below is JSON, UTF-8, one object per file. Dates are `YYYY-MM-DD`. Hashes are `sha256:` followed by the full lowercase hex digest. Every string the model produces is limited as stated; the validator refuses what exceeds a limit by naming the field and the entry.

## 1. Chunk manifest

Written by the tool's `chunk` command, one per source, at `<set>/extraction/<source stem>.chunks.json`.

```json
{
  "schema": "chunks/0.1.0",
  "dataset": "exampleroot_example_set",
  "source_path": "corpus/walden-economy.txt",
  "source_hash": "sha256:...",
  "source_bytes": 142024,
  "chunker": {"max_chars": 6000, "split": "heading-then-paragraph"},
  "chunks": [
    {
      "index": 0,
      "chunk_hash": "sha256:...",
      "heading_path": ["Economy"],
      "char_start": 0,
      "char_end": 5812,
      "text": "..."
    }
  ]
}
```

Rules. `chunks` is in source order and `index` is dense from 0. `heading_path` is the list of headings in force at `char_start`, outermost first, empty for a headingless source. A chunk never crosses a heading boundary; a span between headings longer than `max_chars` is split at the last paragraph break before the cap, and a single paragraph longer than the cap is split at the last sentence end before it. `chunk_hash` is the digest of `text`. `text` is verbatim, so a quote can be located by plain substring search.

## 2. Extraction file

Written by the skill, through the session's model, one per source, at `<set>/extraction/<source stem>.extraction.json`. Appended per chunk: the skill writes the whole object after each chunk with one more entry, so an interrupted run leaves a valid file and resumes at the first chunk index with no entry.

```json
{
  "schema": "extraction/0.1.0",
  "dataset": "exampleroot_example_set",
  "source_path": "corpus/walden-economy.txt",
  "source_hash": "sha256:...",
  "pack": "general",
  "pack_version": "sha256:...",
  "entries": [
    {
      "chunk_index": 0,
      "chunk_hash": "sha256:...",
      "extracted_on": "2026-09-05",
      "entities": [
        {"name": "Concord", "entity_type": "place", "aliases": [], "summary": "", "status": "Candidate", "quote": "..."}
      ],
      "ideas": [
        {"name": "voluntary poverty", "definition": "...", "domain": "", "status": "Candidate", "quote": "..."}
      ],
      "idea_links": [
        {"source_name": "voluntary poverty", "relation": "DEPENDS_ON", "target_name": "simplicity", "quote": "..."}
      ],
      "facts": [
        {"subject": "...", "predicate": "...", "object": "...", "valid_from": null, "valid_to": null, "confidence": 0.8, "quote": "..."}
      ],
      "decisions": [
        {"summary": "...", "decided_by": "", "decided_on": null, "quote": "..."}
      ],
      "open_questions": [
        {"question": "...", "quote": "..."}
      ]
    }
  ]
}
```

Rules the validator enforces, in this order, refusing the entry that fails and counting the reason in the ingest report.

1. `pack_version` is the digest of the concatenated bytes of the pack's `graph_model.py`, `ontology.ttl`, and `extraction_prompt.md`, in that order. It must equal the digest of the pack on disk, or the file is stale and the whole file is refused.
2. `source_hash` and every `chunk_hash` must match the chunk manifest for the same source. A mismatch refuses the entry, because its quotes were located in text that is not the text on disk.
3. Every node in the six arrays carries `quote`, a non-empty string of at most 40 words, found verbatim by substring search in the chunk's `text`. Whitespace runs are collapsed on both sides before the search; nothing else is normalized. Not found refuses the node.
4. `status` on an entity or idea is `Candidate`. Any other value refuses the node; the model never grants status.
5. `entity_type` is one of `person`, `organization`, `work`, `place`, `term`, `other`. `relation` is one of `EXEMPLIFIES`, `DEPENDS_ON`, `CONTRADICTS`, `SPECIALIZES`, `DECIDED_IN`, `APPLIES_TO`. Anything else refuses the node.
6. `name` and `subject`, `predicate`, `object` are at most 120 characters; `definition` and `summary` at most 400; `question` at most 400. `confidence` is a number from 0 to 1. `valid_from`, `valid_to`, `decided_on` are `YYYY-MM-DD` or null.
7. No key outside those shown. An unknown key refuses the node by name.

An entry with zero nodes in every array is valid and means the chunk yielded nothing.

## 3. Retrieval item

Returned by the tool's `recall`, as the `items` array of its stdout object. The tool returns items and never an answer; the recall skill composes the answer from items alone.

```json
{
  "schema": "recall/0.1.0",
  "dataset": "exampleroot_example_set",
  "query": "what does the author mean by economy",
  "as_of": null,
  "items": [
    {
      "kind": "idea",
      "node_id": "idea:voluntary-poverty",
      "name": "voluntary poverty",
      "text": "...",
      "status": "Canonical",
      "quote": "...",
      "source_path": "corpus/walden-economy.txt",
      "heading_path": ["Economy"],
      "chunk_hash": "sha256:...",
      "valid_from": null,
      "valid_to": null,
      "score": 12.4,
      "hop": 0,
      "via": null
    }
  ],
  "canon_confirmed": "Anthony, 2026-09-05"
}
```

Rules. `kind` is one of `entity`, `idea`, `fact`, `decision`, `open_question`. `text` is the definition for an idea, the summary for an entity, the subject-predicate-object sentence for a fact, the summary for a decision, the question for an open question. `hop` is 0 for a lexical hit and 1 for a node reached from a hop-0 idea along a typed link, in which case `via` names the relation and the hop-0 `node_id`. `score` is the FTS5 rank for hop 0 and null for hop 1. Items are ordered hop 0 by score, then hop 1 in the order their hop-0 parents appear. `items` empty means the set returned nothing, and the skill labels it `Not available`. `canon_confirmed` is copied from the recipe so the skill can label without a second read.

## 4. Normalized name

Used by the tool for the link rules, the review pass, and replay identity. Lowercase; strip every character that is not a letter, digit, or space; remove a trailing legal suffix from the set `inc`, `corp`, `corporation`, `llc`, `ltd`, `gmbh`, `co`, `company`; collapse whitespace runs to one space; trim. The identity of a node for replay is `(dataset, kind, normalized_name)`.
