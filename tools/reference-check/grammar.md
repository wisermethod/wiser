# Reference grammar

Contract: `standards/script-contract.md`; command and scope are in `TOOL.md`.

| Shape | Pattern/example | Resolution |
|-------|-----------------|------------|
| Backticked path | single-backtick span containing a slash or file extension, e.g. `notes/brief.md` | relative to referring file, then root; existence only |
| Backticked directory | same span ending in slash, e.g. `notes/` | same path search |
| Markdown link | inline `[brief](notes/brief.md)` or angle-enclosed destination | strip fragment/query for path lookup; URI labeled external, never fetched |
| Bare family name | whole case-insensitive name against skills, experts, tools, connectors child directories inside --root | Estimated: name match, never asserted as a resolved citation |
| Fenced hit | any of the above or a slash-bearing token inside matching backtick/tilde fences | separate fenced array; a human decides whether executable or example |

An inline path is counted once, not again as an overlapping bare name. Comments are text in this limited grammar. Escaped delimiters, multiline links, reference-style markdown links, anchors, and nontext file containers are outside this grammar. A family name absent from the scanned root's family directories cannot be recognized; the caller must inventory composed plugin names and review that portion manually. The scanner never hunts sibling roots. These limits require a declared scan scope in a Housekeeping plan; no measured sample establishes universal recall.

Each JSON item carries file, line, shape, target, and state. Output has no source snippets. Credential paths are skipped before content reads, including hard-link aliases. Symlinks are path-only. A metadata walk under secrets collects file identities without reading their contents. Unknown flags fail before scan. Scanning inside this tool is refused. It writes nothing, installs nothing, and uses Node built-ins only.

The root Provides block is read only after a metadata-only sensitive-inode inventory clears its AGENTS.md. Declared secrets bindings also exclude innocuously named files and hard-link aliases before the content scan. A credential hard-linked as the root declaration is refused, with no stdout.
