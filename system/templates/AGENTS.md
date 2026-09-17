# Templates

Every template here is inert until copied. Its declarations do not join this plugin's instruction chain. Validation and indexing skip template directories.

| Template | Copy it to create |
|----------|-------------------|
| `User Root Template/` | One user root under `standards/user-root.md`; type and about/design sheets select whose facts and voice it holds |
| `Plugin Root Template/` | One domain plugin root under `standards/plugin-root.md`, beside this plugin rather than inside it; it ships the license that plugin class entails and no layout stamp |
| `Connector Template/` | A connector module under `standards/primitives.md` |

**The two root templates have two producers and two populations, and neither reaches the other's.** `skills/Onboard Plugin Root/` copies `Plugin Root Template/` to create or adopt a domain plugin, which holds capability; `skills/Onboard Root/` copies `User Root Template/`, which holds work. A plugin root carries no `type:`, no Provides block and no user-root directories, so the two trees never converge, and a request for one is never served by the other's template.

`skills/Onboard Root/` creates or adopts user roots. Empty creation copies the one tree, sets `type:` to personal, org, client, department or industry, and selects `prompts/<type>/about.md` and `design.md` at copy-time. These sheets are copy-time inputs, not retained memory or a second folder layout in the destination. Department and industry copy this same template and set their type; the first about line names the parent organization or the field respectively.

A department earns its own root when a unit has facts or a register of its own. Personal is the person's own work and voice; org is the organization's shared work and public voice; client is work done for a client and its brand voice; industry holds a field's facts and terminology register. A department without distinct facts or register uses its organization's root.

`Script Contract.md` stays the pointer to `standards/script-contract.md` that tools cite. Archive trees are historical and never copy sources for a new root.
