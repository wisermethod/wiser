---
root: wiser
---

# Wiser

The general knowledge-work plugin: the experts, skills, tools, and connectors that knowledge workers use for agentic work.

This root is mid-migration as of 2026-08-26. Its capability tree is being brought in from a source tree composed into the workspace, under this new name. Read `../AGENTS.md` first, then this file.

## Do not author here yet

Do not add skills, experts, tools, connectors, or standards to this root on your own initiative, and do not hand-copy anything in from the source tree. The migration is planned and executed as a Playbook in `WISER Plugins/zBuilds/playbooks/`, and work done outside it is work the gates never see.

When the migration completes, this file is replaced by the real constitution generated from `zBuilds/templates/repo-scaffold/AGENTS.md.template`.

## The source tree is read-only

The tree this root is migrating from is composed into the workspace as input. Reading it is the point; writing it is forbidden, and a workspace that composes it is not permission. Every write from a migration session lands under this root or under `zBuilds/`.

## The identity gate

This plugin is published under its own name and carries no trace of the tree it came from. Stripping the source's identity is part of the migration, not cleanup afterward.

The gate is a case-insensitive search of the working tree, including filenames and paths, that returns zero hits for the source's name.

It runs before the **first push** of migrated content, not before the last. Migration commits land locally and stay local until it passes. A gate failure found before that push is free to fix: rewrite the local history and move on. The same failure found after it is not fixable at all, because published git history is permanent, and a commit survives squashing, force-pushing, forks, and caches once anyone could have fetched it.

This repository is public. That is why the gate is the push and not the merge.
