# Templates

Every template here is inert until copied. Its declarations do not join this plugin's instruction chain. Validation and indexing skip template directories.

| Template | Copy it to create |
|----------|-------------------|
| `User Root Template/` | One user root under `standards/user-root.md`; type and about/design sheets select whose facts and voice it holds |
| `Connector Template/` | A connector module under `standards/primitives.md` |

`skills/Onboard Root/` creates or adopts user roots. Empty creation copies the one tree, sets `type:` to personal, org, client, department or industry, and selects `prompts/<type>/about.md` and `design.md` at copy-time. These sheets are copy-time inputs, not retained memory or a second folder layout in the destination. Department and industry copy this same template and set their type; the first about line names the parent organization or the field respectively.

A department earns its own root when a unit has facts or a register of its own. Personal is the person's own work and voice; org is the organization's shared work and public voice; client is work done for a client and its brand voice; industry holds a field's facts and terminology register. A department without distinct facts or register uses its organization's root.

`Script Contract.md` stays the pointer to `standards/script-contract.md` that tools cite. Archive trees are historical and never copy sources for a new root.
