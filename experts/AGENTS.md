# Experts

Personas that carry a perspective and judge work through it; `standards/primitives.md` owns the type's definition, invocation rules, and frontmatter. The directory is flat, and the index below is grouped by category.

An expert owns a skill when its Context carries one line of this fixed form, paths only, outside any code block:

```
Owns: `skills/A/`, `skills/B/`
```

The line starts at the left margin, carries nothing but the paths, backticked and separated by a comma and a space, each naming a directory in `skills/` and none twice, and is never wrapped; a code block is a run of three or more backticks or tildes, indented by at most three spaces, closed by a run at least as long of the same character; a backtick run followed by more backticks on its line is a code span, not a fence, and a comment is not read. Each path names a directory holding a `SKILL.md`; an `Owns:` line anywhere outside Context, or either keyword in a Context line that is not its declaration, is an error. A skill an expert only routes to, or draws a boundary against, is not owned by it. A skill no expert owns says so in its own Context, `Stands alone: <reason>`, one such line, at the left margin, with a reason. Every skill is one or the other once declared, and a skill carrying neither has no declared owner yet; an expert may own nothing, and its row below says so. The row for each expert lists what it owns and where its gate sits when not at the end, and that makes this index the routing table the constitution's Precedence and routing names.

<!-- generated:index -->

### Design

| Expert | Description | Owns |
|--------|-------------|------|
| `Creative Director/EXPERT.md` | Direct visual design before it is made and judge it against its brief once it exists, enforcing intentionality and catching generic AI-design patterns, and return direction or a verdict whose findings each name what they fail and the fix that clears it | `skills/Color Palette Design/`, `skills/Component Design/`, `skills/Designer/`, `skills/Typography Design/`, `skills/Design System/`, `skills/Marketing Page Design/`, `skills/Create Presentation/`, `skills/Visualizer/`, `skills/Media Generator/`, `skills/Headshot Normalizer/`; a standalone component is gated at the caller's request; Media Generator and Headshot Normalizer take its direction before the first billed call |

### Marketing

| Expert | Description | Owns |
|--------|-------------|------|
| `Conversion Advisor/EXPERT.md` | Diagnose why a site's visitors are not converting and return prioritized changes, each carrying its evidence, predicted effect, and effort | None: it judges a live site's readings, not a skill's output; a leaking funnel routes here from Funnel Design |
| `Marketing Strategist/EXPERT.md` | Recommend a marketing strategy grounded in the business model and audience psychology, with channels prioritized, the funnel specified, and success metrics made measurable | `skills/Funnel Design/`, `skills/List Hygiene/` |

### SEO

| Expert | Description | Owns |
|--------|-------------|------|
| `SEO Advisor/EXPERT.md` | Judge a site's search visibility and return findings ordered by what would actually move its rankings, each naming the check that surfaced it, the fix, the expected impact, and the effort | `skills/SEO Assets/` |

### Strategy

| Expert | Description | Owns |
|--------|-------------|------|
| `Problem Solver/EXPERT.md` | Analyze a complex problem from first principles and return a recommendation with its assumptions, constraints, and failure modes named | None: it judges a problem, not a skill's output |

### System

| Expert | Description | Owns |
|--------|-------------|------|
| `System Expert/EXPERT.md` | Judge whether a change to a root is the right change, where a proposed capability belongs and in which family, and whether a missing capability is a gap to declare or a build to file, and sequence the system skills accordingly | `skills/Play Author/`, `skills/Playbook Author/`, `skills/Onboard Root/`; its gate runs before the skill, on a change to a root, a new root included, never on the file the skill produces; a Play or Playbook for a user's own work takes no gate before the draft |

### Writing

| Expert | Description | Owns |
|--------|-------------|------|
| `Ghost Writer/EXPERT.md` | Judge a prose deliverable as its intended reader; the default review gate before writing ships | `skills/Content Author/`, `skills/Proposal Author/`, `skills/Speech Writing/`, `skills/Create Presentation/`, `skills/Build Concepts/`, `skills/Categorize Content/`, `skills/Transcript Summary/`, `skills/Build Voice/` |

<!-- /generated:index -->
