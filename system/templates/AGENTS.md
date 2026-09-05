# Templates

What a user copies to start something new: a root of each type.

**Every template under this directory is inert.** A template's AGENTS.md, frontmatter, and declarations belong to the copy it will become, not to this chain: nothing in a template routes, declares a live root, or registers a primitive. Validation and indexing skip the template directories.

| Template | Copy it to create |
|----------|-------------------|
| `Personal Root Template/` | One person's root |
| `Org Root Template/` | An organization's root |
| `Client Root Template/` | A client's root |
| `Department Root Template/` | A department's root, composed beside its org |
| `Industry Root Template/` | A shared industry reference root |

`skills/Onboard Root/` is what reads this file and these templates, and it chooses a type by the scope the new root will own.

**This directory carries root templates only.** Templates for the other primitive kinds are not part of this plugin. `Script Contract.md` beside them is a pointer to `standards/script-contract.md`, kept at the path the tools cite.
