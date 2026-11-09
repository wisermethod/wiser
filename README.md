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
- **Connectors** reach the outside accounts you connect, through the Wiser endpoint: installing Wiser brings it where your app allows, and you sign in to it once with your Wiser account. The grants are held by an authentication provider, never on your machine, and the accounts stay yours. In a command-line harness you can ask for the gateway to run locally instead, with a provider account of your own.
- **Standards** say how every other part is written, so each one reads and behaves alike.

Each family keeps its own index: `skills/AGENTS.md`, `experts/AGENTS.md`, `tools/AGENTS.md`, `connectors/AGENTS.md` and `standards/AGENTS.md`. What Wiser does not do is listed in `system/GAPS.md`, and a step that needs a missing part says so rather than guessing.

## Install

Install Wiser, sign in to the Wiser endpoint, then attach your working folder. If your folder has no `AGENTS.md` yet, ask Wiser to set it up; it can start a new folder or adopt one that already holds work. To connect accounts, ask Wiser to **set up connectors**; `gateway/SETUP.md` is the recipe it follows, and its section 1 adds the endpoint by hand in an app that does not list it after install.

Wiser reaches an app two ways from one release: the plugin and the connector, the Wiser endpoint at the address in `.mcp.json`. Today the connector alone carries sign-in, connections, preferences and forms, but none of Wiser's skills, so install the plugin, which brings the connector with it. The connector alone is the route only where an app installs no plugins, such as ChatGPT on the web. Each app should then show one Wiser.

Install from this repository, as the steps below do, and not from the plugin directory in Claude: a copy installed from the directory does not update when Wiser does, since Claude serves it a snapshot taken once (`standards/plugin-root.md` C10 records it).

- **Claude Cowork.** Open Customize, then Plugins, then Add marketplace. Give it the full address, `https://github.com/wisermethod/wiser`, and install `wiser`. If Cowork warns that installing grants the plugin access to everything available to Cowork, continue. Then open Customize, then Plugins, then Add, then Manage marketplaces, open the `wiser` marketplace's menu, and turn on Sync automatically. Then open Customize, then Plugins, then Wiser, then its Connectors tab. Next to `wiser`, if it shows Not added, press Connect to add it, or, if you cannot, ask an Owner of your organization to add it; once it shows Not connected, press Connect and sign in. If you added Wiser as a connector before installing the plugin, the plugin uses that connector: its Connectors tab shows it Connected and there is nothing to press. Claude keeps one connector per address; Customize, Connectors and the plugin's tab show the same one. Do not add another Wiser connector because Customize, Connectors does not list it before you connect it. Then attach your working folder.
- **Claude Code.** Run `claude plugin marketplace add wisermethod/wiser`, then `claude plugin install wiser@wiser-method`, and start Claude Code in your working folder. Run `/mcp`, choose Wiser's endpoint, and sign in. A clone added with `/add-dir` instead is not an installed plugin; `gateway/SETUP.md` section 1 says how to add the endpoint by hand. The plugin carries a hook that asks the Wiser service for its current notice when a session starts and shows it; `hooks/AGENTS.md` says what that hook reads and sends, and how to turn it off. A Wiser connector on your Claude account also reaches Claude Code, which shows one Wiser where the account connector and the plugin share the address.
- **Codex and ChatGPT for desktop.** The two share their settings, so what is installed or added in one is in the other. In the ChatGPT desktop app, open Plugins, choose Browse directory, and choose the plus button on lowercase `wiser`, the one with the branch icon; if it is not listed, choose Add, then Add a marketplace, give `wisermethod/wiser`, and go back to Browse directory for it. The marketplace then shows as `wiser-method` on the Marketplace tab, which installs nothing itself. When ChatGPT asks, sign in with your Wiser account and choose Allow. Do not add Wiser's address as a custom server or use Create as a plugin, which is chatgpt.com's route and on the desktop gives a second Wiser. If you add Wiser as an MCP server in either app, name it exactly `wiser`: these apps merge it with the plugin only when the names match, and any other name gives two Wisers with every tool twice. Codex's sandbox has network off by default, so a tool's first install stops until you turn network on.
- **ChatGPT on the web.** It installs no plugins. With developer mode on, open Plugins, choose Add, then Add a custom MCP server, name it Wiser, give the address in `.mcp.json`, sign in and choose Allow. This gives Wiser's account tools, not its skills.
- **Grok.** Run `grok plugin marketplace add wisermethod/wiser`, then `grok plugin install wiser --trust`. We have not run this with Wiser yet; these are Grok's own documented steps, read at version 1.0.40.
- **Cursor.** Add your clone of this repository as a workspace root beside your working folder. Cursor reads each root's `AGENTS.md`. Cursor cannot sign in to the Wiser endpoint yet, because the endpoint refuses the sign-in return address Cursor uses, so Wiser's connectors do not reach Cursor for now.

If the ChatGPT desktop app or Codex shows Wiser twice, or every Wiser tool twice, keep the one named exactly `wiser` and remove the other where it was added; asking Wiser to **set up connectors** names which. Claude keeps one connector per address, so a second Wiser there is a different endpoint you added: remove it under Customize, Connectors unless you meant to keep it.

## Updating

Each release is listed in `CHANGELOG.md`. Each app has its own update step:

- **Claude Cowork.** The Install steps turn on Sync automatically for the `wiser` marketplace. To update by hand, open Customize, then Plugins, then Add, then Manage marketplaces, open the `wiser` marketplace's menu, and choose Check for updates.
- **Claude Code.** Run `claude plugin marketplace update wiser-method`, then `claude plugin update wiser@wiser-method`, and start a new session.
- **Codex, ChatGPT for desktop and Grok.** Update the `wisermethod/wiser` marketplace and the `wiser` plugin with that app's own update step.
- **Cursor.** Run `git pull` in your clone.

Claude Code can also look for updates by itself. Its documentation, read on 2026-10-15, says this is on by default only for Anthropic's official marketplaces and those added from claude.ai, so it starts off for `wiser-method` ([plugin loading](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs)). To turn it on, run `/plugin`, open Marketplaces, and turn on Enable auto-update for `wiser-method`. The same page says Claude Code then checks up to ten minutes after your first message in a session, and that the new copy loads when you run `/reload-plugins` or start a new session.

## On a phone

On 2026-11-09 the Claude phone app reached the Wiser endpoint through the connector a Claude install makes and answered which Wiser account it used. Whether the plugin's skills load on the phone has not been tried; the rest of this section is what Anthropic's documentation says, read on 2026-10-17.

- **The Claude phone app on its own.** A chat there loads a plugin's skills and its remote connector, and skips its hooks and local servers ([platform support](https://claude.com/docs/plugins/platform-support)). By that documentation, Wiser's skills and the Wiser endpoint reach you there once you have installed Wiser in Claude, as the Claude Cowork step above does, and connected the endpoint on the plugin's Connectors tab. A Claude Code install from the command line stays on that computer and does not reach the phone ([platform support](https://claude.com/docs/plugins/platform-support)). What needs a computer: your working folder, which holds your voice, facts and design and is where work lands; Wiser's tools, which run as programs on your computer; and the local gateway.
- **Claude Cowork, through Dispatch** ([Dispatch](https://claude.com/docs/cowork/guide/dispatch)). Leave Claude Desktop open on your computer, awake and online. In the Claude phone app, open Dispatch and describe the task; it runs on your computer, in the Cowork project or Claude Code workspace you name. Dispatch needs a Pro or Max plan and the latest Claude Desktop on macOS or Windows.
- **Claude Code, through Remote Control** ([Remote Control](https://code.claude.com/docs/en/remote-control)). In your working folder, run `claude remote-control` and press the spacebar to show a QR code, or type `/remote-control` in a session already running there and type it again to show the QR code. Scan it with the Claude phone app to open the session. The session keeps running on your computer, so leave it on. Remote Control needs a Pro, Max, Team or Enterprise plan; on Team and Enterprise, an Owner switches it on first. Its documentation says your files, MCP servers and project configuration stay available, and does not say whether plugin hooks run.

Codex, ChatGPT and Grok on a phone are not covered here.

## Where to start reading

`AGENTS.md` is the constitution: the rules every part follows, and the place a session starts. `GLOSSARY.md` defines the words it uses. `gateway/SETUP.md` is the recipe for reaching connectors from a new app or machine; ask Wiser to set up connectors and it walks you through it.

`CHANGELOG.md` lists what changed in each release, newest first.

## Support

Email support@wisermemory.com.

## Privacy

How Wiser and the Wiser service handle your information is in [Privacy and Terms](https://wisermemory.com/privacy-and-terms).

## License

See `LICENSE`. Free for an individual, including at work.

One expert adapts material from Apache-2.0 sources. `experts/Creative Director/NOTICE.md` carries the attribution, and a copy of the Apache License 2.0 ships at `licenses/Apache-2.0.txt`.
