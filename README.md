# Wiser

The skills here are built to work together: state your voice and facts once, the skills that write for you read them, and experts check your work. Your voice, your facts and your work live in plain files you own, and each task can leave them better for the next. Built on the book *The WISER Method*; guided by AI First Principles (aifirstprinciples.org). Training and hosted services come next.

## What it is for

Knowledge work in your own voice, on your own material: writing, research, design, data, sites and marketing. The work lands in a folder you own, never inside Wiser, so one copy serves every folder you point it at.

## How it works

You attach a **working folder**, the one the work is about. Its `AGENTS.md` says what the folder is and points to the files that hold your voice, the facts about you, and your design. Every skill that writes reads those files, so you state them once. Your voice file can be revised as you use it, and a knowledge set grows as you add to it, so the next task starts from better files.

Wiser is made of five kinds of part:

- **Skills** produce something you ask for by name: a post, a brief, a page, a palette, an analysis.
- **Experts** judge work through one perspective, and most check it before it ships, in a second context that did not write it.
- **Tools** do the parts that should come out the same every time, such as parsing data, rendering images, or driving a browser. The first time a tool needs packages, Wiser asks once, then installs them into its own folder; later tools install without asking.
- **Connectors** reach the outside accounts you connect, through a local gateway you attach to each app you use. The grants are held by an authentication provider you set up an account with, never on your machine, and the accounts stay yours.
- **Standards** say how every other part is written, so each one reads and behaves alike.

Each family keeps its own index: `skills/AGENTS.md`, `experts/AGENTS.md`, `tools/AGENTS.md`, `connectors/AGENTS.md` and `standards/AGENTS.md`. What Wiser does not do is listed in `system/GAPS.md`, and a step that needs a missing part says so rather than guessing.

## Install

Install Wiser, then attach your working folder. If your folder has no `AGENTS.md` yet, ask Wiser to set it up; it can start a new folder or adopt one that already holds work.

- **Claude Cowork.** Open Customize, then Plugins, then Add marketplace. Give it the full address, `https://github.com/wisermethod/wiser`, install `wiser`, then attach your working folder.
- **Claude Code.** Clone this repository, start Claude Code in your working folder, add the clone with `/add-dir`, and ask Claude to read the clone's `AGENTS.md` first.
- **Codex and ChatGPT for desktop.** Add `wisermethod/wiser` as a marketplace and install `wiser`. The same install serves ChatGPT for desktop once plugins are turned on there. Codex's sandbox has network off by default, so a tool's first install stops until you turn network on.
- **Grok.** Run `grok plugin marketplace add wisermethod/wiser`, then `grok plugin install wiser --trust`. We have not run this with Wiser yet; these are Grok's own documented steps, read at version 1.0.40.
- **Cursor.** Add your clone of this repository as a workspace root beside your working folder. Cursor reads each root's `AGENTS.md`.

## Where to start reading

`AGENTS.md` is the constitution: the rules every part follows, and the place a session starts. `GLOSSARY.md` defines the words it uses. `gateway/SETUP.md` is the recipe for attaching the gateway to a new machine or app; ask Wiser to set up connectors and it walks you through it.

## Support

Email support@wisermemory.com.

## License

See `LICENSE`. Free for an individual, including at work.

One expert adapts material from Apache-2.0 sources. `experts/Creative Director/NOTICE.md` carries the attribution, and a copy of the Apache License 2.0 ships at `licenses/Apache-2.0.txt`.
