# Experts

Personas that carry a perspective and judge work through it; `standards/primitives.md` owns the type's definition, invocation rules, and frontmatter. The directory is flat, and the index below is grouped by category.

An expert owns a skill when its Context carries one line of this fixed form, paths only, outside any code block:

```
Owns: `skills/A/`, `skills/B/`
```

The line starts at the left margin, carries nothing but the paths, and is never wrapped; a code block is a run of three or more backticks or tildes, indented by at most three spaces. A skill an expert only routes to, or draws a boundary against, is not owned by it; the word `Owns:` in any other Context line is a defect. A skill no expert owns says so in its own Context, `Stands alone: <reason>`. Every skill is one or the other; an expert may own nothing, and its row below says so. The row for each expert lists what it owns and where its gate sits when not at the end, and that makes this index the routing table the constitution's Precedence and routing names.

<!-- generated:index -->

### Design

| Expert | Description | Owns |
|--------|-------------|------|
| `Creative Director/EXPERT.md` | Evaluate and direct visual design, enforcing intentionality and catching generic AI-design patterns, and return findings with specific fixes | None declared yet |
| `Design Advisor/EXPERT.md` | Judge a visual design against its brief and return a verdict whose findings each name what they fail and the concrete replacement or direction that clears it | None declared yet |

### Marketing

| Expert | Description | Owns |
|--------|-------------|------|
| `Conversion Advisor/EXPERT.md` | Diagnose why a site's visitors are not converting and return prioritized changes, each carrying its evidence, predicted effect, and effort | None declared yet |
| `Marketing Strategist/EXPERT.md` | Recommend a marketing strategy grounded in the business model and audience psychology, with channels prioritized, the funnel specified, and success metrics made measurable | None declared yet |

### SEO

| Expert | Description | Owns |
|--------|-------------|------|
| `SEO Advisor/EXPERT.md` | Judge a site's search visibility and return findings ordered by what would actually move its rankings, each naming the check that surfaced it, the fix, the expected impact, and the effort | None declared yet |

### Strategy

| Expert | Description | Owns |
|--------|-------------|------|
| `Problem Solver/EXPERT.md` | Analyze a complex problem from first principles and return a recommendation with its assumptions, constraints, and failure modes named | None: it judges a problem, not a skill's output |

### System

| Expert | Description | Owns |
|--------|-------------|------|
| `System Expert/EXPERT.md` | Judge whether a change to a root is the right change, where a proposed capability belongs and in which family, and whether a missing capability is a gap to declare or a build to file, and sequence the system skills accordingly | `skills/Play Author/`, `skills/Playbook Author/`, `skills/Onboard Root/`; its gate runs before the skill, on the change, never on the file the skill produces |

### Writing

| Expert | Description | Owns |
|--------|-------------|------|
| `Ghost Writer/EXPERT.md` | Judge a prose deliverable as its intended reader; the default review gate before writing ships | None declared yet |

<!-- /generated:index -->
