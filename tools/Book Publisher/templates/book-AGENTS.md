---
book: {{title}}
---

# {{heading}}

`tools/Book Publisher/TOOL.md` holds the input contract and command checks.
`book-config.yaml` holds this book's build settings.

## Standing

{{completionCondition}}

## Layout

| Path | Holds |
|------|-------|
| `chapters/` | Ordered chapter files, one per chapter |
| `assets/` | Assets the chapters reference |
| `book-config.yaml` | Build configuration read by the tool |
| `publish/` | Build outputs |
| `<does-this-thing>.playbook.md` | A plan for this book, per `standards/playbook.md` |
| `zArchive/` | Recovery, per `standards/conventions.md` Archives |

## Production requirements

{{productionRequirements}}

## Manuscript changes

{{manuscriptChanges}}
