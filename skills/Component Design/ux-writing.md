# UX Writing

Reference material for interface microcopy. Covers button labels, error messages, empty states, voice and tone, terminology consistency, accessibility in writing, and translation readiness.

## Button Labels

Verb-and-object patterns. The Interaction entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home, name the labels that never ship; these are what replaces them:

| Avoid | Use | Why |
|-------|-----|-----|
| OK | Save changes | Says what will happen |
| Submit | Create account | Outcome-focused |
| Yes | Delete message | Confirms the specific action |
| Cancel | Keep editing | Clarifies what "cancel" means |
| Click here | Download PDF | Describes the destination |

For destructive actions, name the destruction and show the count: "Delete 5 items", not "Delete selected".

## Error Messages

Every error answers three questions: What happened? Why? How to fix it?

| Situation | Template |
|-----------|----------|
| Format error | "[Field] needs to be [format]. Example: [example]" |
| Missing required | "Please enter [what is missing]" |
| Permission denied | "You do not have access to [thing]. [What to do instead]" |
| Network error | "We could not reach [thing]. Check your connection and [action]." |
| Server error | "Something went wrong on our end. We are looking into it. [Alternative action]" |

Never blame the user. "Please enter a date in MM/DD/YYYY format", not "You entered an invalid date".

## Empty States

Empty states are onboarding moments: acknowledge briefly, explain the value of filling the space, provide a clear action.

"No projects yet. Create your first one to get started." Not just "No items."

A filtered or searched view that matches nothing takes different copy: name the query, not the absence. "No invoices match Overdue. Clear the filter to see all 34." `interaction-design.md` carries the visual treatment for both.

## Voice vs Tone

Voice is the brand's personality, consistent everywhere. Tone adapts to the moment:

| Moment | Tone |
|--------|------|
| Success | Celebratory, brief: "Done. Your changes are live." |
| Error | Empathetic, helpful: "That did not work. Here is what to try." |
| Loading | Reassuring, specific: "Saving your work." |
| Destructive confirm | Serious, clear: "Delete this project? This cannot be undone." |

Never use humor for errors. Users are already frustrated.

## Terminology Consistency

Pick one term and enforce it:

| Inconsistent | Consistent |
|--------------|------------|
| Delete / Remove / Trash | Delete |
| Settings / Preferences / Options | Settings |
| Sign in / Log in / Enter | Sign in |
| Create / Add / New | Create |

## Accessibility in Writing

- Link text must have standalone meaning: "View pricing plans", not "Click here".
- Alt text describes information: "Revenue increased 40% in Q4", not "Chart".
- Use `alt=""` for decorative images.
- Icon buttons need `aria-label`.

## Translation Readiness

Plan for text expansion (German about 30% longer, Finnish about 30 to 40%; both approximate and unverified). Keep numbers separate from strings. Use full sentences as single translation units. Avoid abbreviations in translatable strings.

## Redundancy

If the heading explains it, the intro is redundant. If the button label is clear, do not explain it again in adjacent text. Say it once, say it well.
