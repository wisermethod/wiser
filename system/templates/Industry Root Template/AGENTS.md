---
root: [name]
type: industry
---

# [name]

Shared reference knowledge about one industry: how it works, who is in it, and the language it uses.

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
| `inbox/` | Quick captures with no home yet |
| `zArchive/` | This root's archive home |

## Industry Root

This root informs work; it rarely owns a deliverable. A deliverable about the industry belongs to the root that speaks it, reaching back here with `about:industry`, `voice:industry`, and `design:industry`; when a user wants one written here instead, ask before writing.

`memory/about.md` describes the industry and the dynamics that drive it. How one company sits in that industry is a fact about the company, and belongs to its own root.

`voice` here is not a speaker. It is the industry's terminology register, and `memory/voice.md` says when adopting it sharpens an output and when it obscures one.

Everything recorded here is a durable claim about a market; `standards/conventions.md` governs how such claims are sourced.

## Instantiation

This section is temporary. It governs the copy, the fill, and the per-key close, and it is deleted only when every memory key is complete.

### Copy and replace

1. Copy this template into the workspace under this root's real name, spelled as the people who work in it spell it. `root:` in the frontmatter matches that folder name.
2. Replace `[name]` everywhere it appears, here and in every file under `memory/`. Leave `type: industry` as it is.

### Fill, per key

Fill `memory/about.md` and `memory/design.md` here, replacing each prompt line with content. A prompt line is a whole line that begins with `*` and ends with `*`, and none may survive.

A heading with no answer does not get a sentence of its own invention. It gets one of the four evidence labels from `standards/conventions.md`, written in square brackets in place, exactly where the reading would have appeared: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. Those four are the whole vocabulary. Do not invent a fifth and do not substitute a shorter set.

`memory/voice.md` is not authored here. The Build Voice skill owns that file and writes it, including its routing table and its authority key lines. Instantiation records what that skill returned and nothing more.

### Per-key close

Closing is per memory key, not one switch for the root. Each of `about`, `voice`, and `design` closes in one of three states, and the state is recorded under `## Per-key close` in this root's onboarding run record, which lives in this root's working area; `work/onboarding/` is the client-root layout and does not apply here:

- **complete**: every heading answered or carrying its label, and every load-bearing claim read back against the source it cites.
- **provisional**: bound and usable, with named gaps outstanding, each carrying an owner and a status in the onboarding operating file kept beside that run record.
- **blocked**: not usable, with the blocker named as a person, a credential, or a capability.

### What a non-complete key refuses

The refusal is scoped to the keys that are not complete, never to the root as a whole. While a key is provisional or blocked, refuse a deliverable write that would load that key, name the key and its state, and ask to finish it. A deliverable that loads only complete keys proceeds: a deferred design does not block a facts-based deliverable, and a root with one provisional key is not reported as a failed onboarding.

### Deleting this section

Delete this section when every key is complete. While any key is provisional or blocked, keep this section, and keep it naming each such key by name and by state, so a later session reads the refusal and knows exactly which keys it covers. A retained section that does not name its keys is no better than no section at all.
