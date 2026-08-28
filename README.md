# Wiser

The general knowledge-work plugin: skills, experts, and the standards that bind them, for doing real work in your own voice on your own material.

It carries no dependency on any single agent host: everything in it is instruction text plus one shell script, and it runs wherever a root of this shape can be composed.

## What is in it

**29 skills** that produce something you asked for by name: writing a post, an essay, a press release, a speech; researching a question; designing a page, a palette, a type system, or a whole design system; analyzing a spreadsheet; building a funnel or a proposal; setting up a new working folder.

**7 experts** that judge work through a perspective rather than producing it: a review gate before writing ships, a marketing strategist, a conversion and an SEO advisor, two design critics, and a first-principles problem solver.

**5 standards** that bind all of it: how a primitive is shaped, how instructions are written, and the conventions every file follows.

## How it works

Install the plugin, then attach a **working folder**: the root the work is about. That folder describes itself in its own `AGENTS.md`, including a `Provides` block that binds what the plugin asks for, like the voice to write in and the facts about you or your organization.

The plugin is **read-only in use**. It never writes into itself. Everything it produces lands in the working folder you attached, in the directories that folder declares.

`AGENTS.md` is the constitution and the place to start reading. `skills/AGENTS.md` and `experts/AGENTS.md` index what is available.

## What it does not do yet

This release ships skills, experts, and standards. It does not ship the tools and connectors several primitives can use when they are present: chart and image rendering, audio transcription, site crawling, and direct reads from analytics, search-console, or DNS accounts.

**Nothing hides that.** Where a step depends on something absent, the primitive says which step cannot run and what it would have produced, rather than approximating the result. Every such gap is declared in the primitive's own frontmatter and collected in `system/GAPS.md`.

Press and public-affairs judgment is not here either: whether something is a story, who to pitch it to, and what to say during an unfolding incident. Primitives that used to route those questions elsewhere now name them as gaps instead of answering them.

## Install

Point your harness at this repository as a plugin root, then attach your working folder. **This repository is the source tree**: it ships no generated plugin manifest and no marketplace projection, so a harness that requires one is not yet supported. Install by composing this root, and read `AGENTS.md` first.

If you do not have a working folder yet, `skills/Onboard Root/` creates one from the templates in `system/templates/`. Its gate harness runs on all five types, reading each root's own declared type to know where that type keeps its records.

## License

See `LICENSE`. Free for an individual, including at work.

Two experts adapt material from Apache-2.0 sources. `experts/Creative Director/NOTICE.md` and `experts/Design Advisor/NOTICE.md` carry the attribution, and a copy of the Apache License 2.0 ships at `licenses/Apache-2.0.txt`.
