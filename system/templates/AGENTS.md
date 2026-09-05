# Templates

What a user copies to start something new: a root.

**Every template under this directory is inert.** A template's AGENTS.md, frontmatter, and declarations belong to the copy it will become, not to this chain: nothing in a template routes, declares a live root, or registers a primitive. Validation and indexing skip the template directories.

| Template | Copy it to create |
|----------|-------------------|
| `Personal Root Template/` | One person's root: three memory files and a short onboarding |
| `Org Root Template/` | An organization's root |
| `Client Root Template/` | A client's root, with the records the full onboarding path keeps |

`skills/Onboard Root/` is what reads this file and these templates. A personal root takes its short path; an org or client root takes its full path.

**A department or an industry root starts from the Org template.** Copy it, set `type: department` or `type: industry` in the frontmatter, and have `memory/about.md` name the parent organization, or the field, in its first line. The constitution recognizes both types; neither earns a template of its own, because each differs from an org root in what its about file says first and in nothing the copy could carry.

**This directory carries root templates only.** Templates for the other primitive kinds are not part of this plugin. `Script Contract.md` beside them is a pointer to `standards/script-contract.md`, kept at the path the tools cite.
