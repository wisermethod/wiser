# Templates

What a user copies to start something new: a root of each type. One contract lives beside them and is cited, never copied.

**Every template under this directory is inert.** A template's AGENTS.md, frontmatter, and declarations belong to the copy it will become, not to this chain: nothing in a template routes, declares a live root, or registers a primitive. Validation and indexing skip the template directories.

**The contract beside them is not inert.** `Script Contract.md` is live text that shipped primitives cite by path, and it binds them wherever they run.

| Template | Copy it to create |
|----------|-------------------|
| `Personal Root Template/` | One person's root |
| `Org Root Template/` | An organization's root |
| `Client Root Template/` | A client's root |
| `Department Root Template/` | A department's root, composed beside its org |
| `Industry Root Template/` | A shared industry reference root |

`skills/Onboard Root/` is what reads this file and these templates, and it chooses a type by the scope the new root will own.

**This directory carries root templates only.** Templates for the other primitive kinds are not part of this plugin, so nothing here points at them. The one contract that lives beside them, `Script Contract.md`, is not a template: it is live text cited by every tool this root ships, and it is named above and in the table below.

| Contract | Governs |
|----------|---------|
| `Script Contract.md` | How every script a tool ships behaves: what it may import, how it installs a dependency, how it answers help, what it writes and where |
