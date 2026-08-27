---
root: [name]
type: org
---

# [name]

An organization's own root: its shared work, its facts, and its public voice.

The composed Wiser root's constitution and `standards/` govern the work here; this file declares only what is local to this root.

## Provides
- about: memory/about.md
- voice: memory/voice.md
- design: memory/design.md

## Work Directories

This root's declared directories under `standards/conventions.md`:

| Directory | Holds |
|-----------|-------|
| `work/` | This root's deliverables and their drafts |
| `plays/` | This root's Plays (`standards/play.md`) |
| `playbooks/` | This root's Playbooks (`standards/playbook.md`) |
| `skills/` | This root's Skills (`standards/primitives.md`); ships with the template |
| `experts/` | This root's Experts; created on first use |
| `tools/` | This root's Tools; created on first use |
| `connectors/` | This root's Connectors; created on first use |
| `inbox/` | Quick captures with no home yet |
| `zArchive/` | This root's archive home |

## Org Root

`voice` here is the organization's public voice, governing the outputs this root owns. Material that carries the organization's name but is authored in another root requests `voice:org`, `design:org`, and `about:org` to reach them.

A department is not a subdirectory here. A unit with facts or a register of its own becomes a department-type root composed alongside this one.

A root that holds shared credentials adds `memory/secrets/`, binds each as `secrets:<platform>` in the Provides block above, and never commits a value.

## Instantiation

This section is temporary. It governs the copy, the fill, and the per-key close, and it is deleted only when every memory key is complete or unbound.

### Copy and replace

1. Copy this template into the workspace under this root's real name, spelled as the organization spells its own short name. `root:` in the frontmatter matches that folder name.
2. Replace `[name]` everywhere it appears, here and in every file under `memory/`. Leave `type: org` as it is.

### Fill, per key

Fill `memory/about.md` and `memory/design.md` here, replacing each prompt line with content. A prompt line is a whole line that begins with `*` and ends with `*`, and none may survive.

A heading with no answer does not get a sentence of its own invention. It gets one of the four evidence labels from `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the whole vocabulary. Do not invent a fifth and do not substitute a shorter set.

`memory/voice.md` is not authored here. The Build Voice skill owns that file and writes it, including its routing table and its authority key lines. Instantiation records what that skill returned and nothing more.

The `competitors` key is not part of this template: it is offered for an org root only when the requester asks for a confirmed competitive set on record, and the Onboard Root skill binds `competitors: memory/competitors.md` only after a named person confirms that set.

### Per-key close

Closing is per memory key, not one switch for the root. Each of `about`, `voice`, `design`, and `competitors` where that offer was made and accepted, closes in one of three states, and the state is recorded under `## Per-key close` in this root's onboarding run record, which lives in this root's working area; `work/onboarding/` is the client-root layout and does not apply here:

- **complete**: every heading answered or carrying its label, and every load-bearing claim read back against the source it cites.
- **provisional**: bound and usable, with named gaps outstanding, each carrying an owner and a status in the onboarding operating file kept beside that run record.
- **blocked**: not usable, with the blocker named as a person, a credential, or a capability.

An offer declined or deferred leaves `competitors` **unbound**, which is a complete outcome, not a provisional one and not a failure. A key that was never offered is not listed at all.

### What a non-complete key refuses

The refusal is scoped to the keys that are not complete, never to the root as a whole. While a key is provisional or blocked, refuse a deliverable write that would load that key, name the key and its state, and ask to finish it. A deliverable that loads only complete keys proceeds: a deferred design does not block a facts-based deliverable, and a root with one provisional key is not reported as a failed onboarding.

### Deleting this section

Delete this section when every key is complete or unbound. While any key is provisional or blocked, keep this section, and keep it naming each such key by name and by state, so a later session reads the refusal and knows exactly which keys it covers. A retained section that does not name its keys is no better than no section at all.
