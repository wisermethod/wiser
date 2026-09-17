---
root: {{ROOT}}
---

# {{TITLE}}

A WISER domain plugin. This file is this root's constitution. The chain starts here: load it before the first read or write under this root.

{{DESCRIPTION}}

## Copy-time

**Everything from this heading down to the next one is the template speaking to whoever copies it, and the copy keeps none of it.** Delete this heading, this paragraph, the table below and the heading above the table. What is said here is true of a template and false of a plugin, so a copy that keeps any of it tells its own reader that its root is still a template. Removal is not optional and is not a tidy-up: it is part of producing the tree.

Every placeholder is a name in double braces. Every one that appears anywhere in this tree is in the table below. A copy is finished when a search of it for that marker returns zero.

**Both catalog files are parsed after substitution and before C10 is scored**, per `wiser/standards/plugin-root.md` C10. That parse is the guarantee: a placeholder search returns zero whether or not the JSON survived, so nothing else catches a value that broke it.

**The four catalog-bound placeholders carry no double quote and no backslash.** `{{ROOT}}`, `{{TITLE}}`, `{{DESCRIPTION}}` and `{{MARKETPLACE}}` are substituted into `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, where a value is a JSON string, and either character substituted raw makes a catalog that will not parse and a plugin that will not install. They are not the only characters that can: a literal tab or newline does it too, which is why the parse above is the rule and this is the common case. Where a name genuinely carries one, the producer stops and asks rather than escaping it silently.

**`{{STANDING_CONSTRAINT}}` is exempt, and deliberately.** It reaches this file alone and never a catalog, and on an adopt it carries the source's constraints **verbatim**, which is a decided input rather than draft text. A constraint that quotes a word the plugin refuses to use is exactly the constraint most worth preserving, so a rule that forbade the quote would make preserving it and obeying the template contradict each other, with nothing the producer could ask that would resolve it.

| Placeholder | Meaning |
|-------------|---------|
| `{{ROOT}}` | This plugin's id: the `root:` value above, and `name` in both catalog files. Not `wiser`. |
| `{{TITLE}}` | This plugin's name as written in prose, headings, and `displayName`. |
| `{{DESCRIPTION}}` | One line on what this plugin is for, plain prose. Used here, in `README.md`, and in both catalog files. |
| `{{MARKETPLACE}}` | This plugin's own marketplace id in `.claude-plugin/marketplace.json`. Not the base catalog's. |
| `{{STANDING_CONSTRAINT}}` | The constraint this plugin carries. On an adopt, the source's standing constraints verbatim. On a create, the sentence that none is declared at instantiation. |

## What this root is

An authoring tree, not a working folder. Nothing here is anyone's work product; everything here is the capability that such work uses. Output belongs in the working folder a session attaches, never in this root.

This plugin carries no user-root `type:`, no Provides block, and no Onboarding keys.

## Composition

This plugin loads alongside `wiser` and may assume it is present. It references `wiser` primitives and standards rather than duplicating them, per `wiser/AGENTS.md` Precedence and routing. Copying a `wiser` primitive into this tree to remove the dependency is the defect; referencing one is the pattern. Nothing in `wiser` references this plugin.

## Write mode

In use this root is read-only. Nothing is written under this root during a session that uses it, and output lands in the working folder the session attached, in the directories that folder's own `AGENTS.md` declares. Authoring this root is separate work, planned as a Playbook, and is entered by the operator's authorization for a named phase and a named target. An Active Playbook is the record of that authorization and never the grant.

A session that has loaded this constitution and the base plugin's refuses ordinary writes to both.

What may be written here is governed by this heading and by `wiser/AGENTS.md` Writes, Irreversibles, Workspace Model, and Working under this root.

## Families

| Directory | Holds |
|-----------|-------|
| `skills/` | This plugin's skills |
| `experts/` | This plugin's experts |
| `tools/` | This plugin's tools |
| `connectors/` | This plugin's connectors |

Family placement follows `wiser/standards/primitives.md`. This plugin ships no `gateway/`; the base plugin alone ships one, and a connector that lands in `connectors/` loads through that gateway's repeated `--connectors` flag, per `wiser/gateway/SETUP.md`.

Each family directory carries its own `AGENTS.md` index. An empty index is still an index.

## Standing constraint

{{STANDING_CONSTRAINT}}

## Layout

This root's layout is governed by `wiser/standards/plugin-root.md`. That standard's C1 owns the `layout:` stamp: the current tree version, a bare nonnegative integer. `wiser/skills/Onboard Plugin Root/` writes it last, only once every applicable obligation other than the stamp itself scores present or N/A. A stamp written before that would advertise a conformance nothing had earned, which is why an unstamped tree reads as not current rather than as clean.
