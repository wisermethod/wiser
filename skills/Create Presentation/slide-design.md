# Slide Design Principles

How to design individual slides that communicate clearly and look professional. These principles apply regardless of theme or topic, and they are this skill's own baseline. Where the workspace binds a design authority (a design source or a Creative Director expert in review), that authority governs visual choices and these principles yield to it. Read this at the Generate-slides step.

## The Fundamental Rule

One idea per slide.

If a slide asks the audience to hold two unrelated thoughts at once, it is two slides. If a slide has content the audience cannot absorb before you advance, it has too much.

## Visual Hierarchy

Every slide needs a clear reading order. The audience should know where to look first, second, and third without thinking about it.

Hierarchy tools, in order of strength:

1. Size. Larger elements read first.
2. Color and contrast. High contrast draws the eye.
3. Position. Top-left reads first in Western audiences, top-right in right-to-left ones.
4. Whitespace. Isolated elements draw attention.

The squint test: blur the slide with your eyes. Can you still identify the hierarchy? If everything blurs into equal weight, the hierarchy is broken. Apply it to every slide before moving to the next.

## Whitespace and Spacing

Whitespace is not empty space. It is the structure that makes content readable.

- **Margin from slide edges.** Content should never touch the edges. The `margin: 0.04` setting in reveal.js gives 4% padding, but dense slides may need more internal margin on content blocks.
- **Grouping through proximity.** Elements that belong together sit close; elements that are separate have visible gaps. If a heading sits equidistant between two content blocks, the reader cannot tell which it belongs to. Move it closer to its content.
- **Breathing room between sections.** Within a slide, use `margin-top` or `gap` to separate logical groups. Five bullet points with no spacing read as a wall of text; the same five grouped into two clusters with a gap read as two ideas.
- **Vertical centering.** reveal.js centers content vertically by default (`center: true`), which works for sparse slides. A dense slide with a long list may read better top-aligned, and reveal.js has no per-slide attribute for that: it positions each section with an inline offset, so only a CSS rule that outranks that offset changes the alignment. In a deck built from the starter, whose style block is locked, split the slide instead; with a brand template, use the template's own alignment class when it has one.

## Text Density

| Slide type | Max text | Notes |
|------------|----------|-------|
| Title or cover | 2 lines | Title and subtitle only |
| Section divider | 1 to 2 lines | Section name and brief context |
| Content | 5 to 7 bullet points | Each under 15 words |
| Quote | 3 lines | Shorter quotes hit harder |
| Data | 3 metrics | More than 3 becomes noise |
| Code | 15 to 20 lines | Use highlighting to focus attention |

If you need more text, split the slide.

## Typography

**Headlines.** Short, declarative, stating the conclusion rather than the topic.

- Wrong: "Q3 Revenue". Right: "Q3 Revenue Grew 47%".
- Wrong: "Our Approach". Right: "Three Principles That Drive Everything".

**Body text.** Short phrases, not sentences. The presenter speaks the full thought; the slide shows the anchor phrase.

- Wrong: "We have seen that our customers report higher satisfaction when they receive personalized onboarding."
- Right: "Personalized onboarding: 92% satisfaction".

**Font sizes** (16:9 at 1920x1080):

- H1: 48 to 64px
- H2: 36 to 42px
- Body: 24 to 28px
- Captions: 16 to 20px
- Never below 16px

**Font selection.** Take fonts from the design resolved before generation: a brand template's own families, the bound design source, or the references gathered when neither was available. A templateless deck loads no webfonts, so its families must be ones the viewer's machine already has; let the resolved direction choose among those rather than settling for the starter's placeholder system stack. The Typography entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home, name the families overused to the point of invisibility. None of them is ever a deck's primary family.

## Color Usage

Use color with purpose. Color should signal meaning, not decorate.

| Color role | Use for |
|------------|---------|
| Primary | Headlines, key data, links, interactive elements |
| Secondary | Accents, section backgrounds, gradients |
| Neutral | Body text, borders, backgrounds |
| Success or warning | Data comparisons where directional meaning matters |

Limit to three colors per slide, not counting neutrals and grays. More than three creates visual noise.

When a design source is loaded, use CSS class references (`.brand-primary`, `.brand-accent`) or custom properties (`var(--brand-primary)`) instead of inline hex values, so colors stay consistent and stay easy to update.

Check every color against the Color entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home. Three places in a deck land on one most often: the section-divider gradient, the metric numbers, and the neutrals behind body text.

## Images

This skill does not generate or create images. The only images in a deck are ones the user provides or ones a brand template bundles. With no user-provided images, design with text, data, and layout instead.

When to use user-provided images:

- To show something words cannot convey (a product, place, person, diagram).
- To create emotional resonance (a hero image, photography).
- To break up a text-heavy section.

When not to use images:

- Never create a placeholder image or reference an image that does not exist.
- Never use a generic stock-photo description as alt text hoping the user will replace it.
- When the data or the text is the point.

Image rules when the user provides images: full-bleed or generous size, since small floating images look amateur; one image per slide, since two compete for attention; high resolution only, since pixelation destroys credibility; always a descriptive `alt` attribute for accessibility.

## Data Visualization

Present the insight, not the data.

- Wrong: a spreadsheet screenshot with 50 cells.
- Right: one chart showing the key trend, with the insight in the title.

Chart selection:

| Message | Chart type |
|---------|-----------|
| Trend over time | Line chart |
| Comparison | Bar chart |
| Part of a whole | Pie chart (max 5 segments) or stacked bar |
| Relationship | Scatter plot |
| Single metric | Big number, centered |

Data design rules:

- The title states the insight: "Revenue doubled in Q3", not "Q3 Revenue Data".
- Remove chart junk: gridlines, legends when labels can sit on the data directly, 3D effects.
- Highlight the key data point: one number in the brand primary color, the rest in neutral gray.
- Put source attribution at the bottom in small text.
- For a simple comparison of two to four numbers, use the `.metrics` pattern instead of a chart; centered big numbers are more immediate than a two-bar chart.
- For inline visualizations, build bar charts and simple diagrams from HTML and CSS: `div` elements with percentage widths and background colors make effective horizontal bars with no image files. **This is the two-to-four-number case above and nothing wider.** A quantitative chart of real data is `tools/data-chart/`, which `SKILL.md`'s Context puts outside this skill; drawing one of those by hand from this line is the misreading it exists to prevent.

## Animations and Transitions

### Default Behavior

All slide content is fully visible on navigation. When the presenter clicks forward, the next slide appears with all its content. There are no within-slide animations unless the user asks for them.

Slide-to-slide transitions (fade, slide, convex) are fine; these control how one slide replaces another, not how content appears within a slide. The default transition is `slide`.

### Fragment Animations, Opt-in Only

reveal.js `class="fragment"` makes elements appear one click at a time within a slide, so every fragment adds a click before the audience sees the next slide. Five fragments on one slide means five clicks before advancing.

Never add fragment animations unless the user explicitly asks for progressive reveal, build-up effects, or step-by-step animation.

When the user does request it, use fragments sparingly: limit to three or four per slide; use them only where reveal order carries meaning (a punchline after a setup, a solution after a problem); prefer `fade-in` or no animation class over dramatic styles like `grow`, `shrink`, or `highlight-*`; never fragment individual words or sub-bullets. The test: if removing the fragment would not change how the audience processes the information, remove it.

### Prohibited Animation Patterns

- Bounce or elastic easing, per the Visual effects entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home.
- Every list item as a fragment, which turns a simple slide into a click marathon.
- Elements flying in from different directions on the same slide.
- Animations that delay the audience from reading content they can already see coming.

## Speaker Notes

Every non-trivial slide should carry speaker notes. Notes serve three purposes: talking points (what to say that is not on the slide), transitions (how to bridge to the next slide), and timing cues (how long to spend, when to pause). Notes are anchor points for the presenter, not a script.

## Layout Selection Guide

| Content | Layout | Why |
|---------|--------|-----|
| Opening slide | Cover | Sets the tone with title and attribution |
| New major section | Section divider | A gradient break signals a shift |
| Regular content | Standard content | Text, lists, inline elements |
| Single impactful statement | Centered statement | Whitespace focuses attention |
| Comparison or contrast | Two-column | Side-by-side makes differences visible |
| Content with a photo | Image-right or image-left | Balances text and visual |
| Full-bleed photography | Cover with background | Maximum visual impact |
| Testimonial | Quote | Centered treatment signals importance |
| Key metrics | Metrics | Numbers deserve prominence |
| Code example | Code walkthrough | Syntax highlighting focuses the lines that matter |
| Closing | End | Clean sign-off |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Too much text on one slide | Split it. Each slide gets one idea. |
| Title restates the topic | State the conclusion or insight instead. |
| All slides look identical | Vary layouts. Mix dense and sparse. Use section dividers. |
| Bullet points with full sentences | Use short phrases; the presenter speaks the full thought. |
| No visual hierarchy | Make one element clearly dominant on each slide. |
| Decorative images | Every image should communicate something the text does not. |
| Inconsistent styling | Use the design source's CSS classes; do not override fonts or colors per slide. |
| No speaker notes | Add notes for anything the audience cannot see on the slide. |
| Fragment animations on every list | Default is all content visible; add fragments only on request. |
| Placeholder or generated images | Never create image files. Use text, data, and layout. Images come from the user or a brand template only. |
| Wall-of-text slides with no grouping | Group related items with whitespace. Two clusters of three read better than six undifferentiated bullets. |
| Ending every slide the same way | Vary how slides close: some with a question, some with a data point, some with a transition cue in the notes. |

## AI-Signature Patterns

Generated decks have recognizable tells, and an audience that spots them stops trusting the content. This section is the skill's own copy-quality baseline; the Ghost Writer review before ship is the authority on copy. Scan every slide for these before delivering.

### Structural symmetry

The most common tell. Every slide has a title and exactly three bullets of similar length; every section has exactly three slides; every card grid has three cards of the same word count. The deck feels stamped from a mold.

The fix: vary deliberately. A section can have two slides or five. A list can have four items or two. Two cards can hold different amounts of text if one idea needs more explanation. Symmetry should emerge from the content's natural shape, not from a template applied to everything. Scan the slide overview (`Esc` in reveal.js); if every slide shares the same rhythm, rewrite the outliers to break the pattern.

### Corporate filler phrases

Phrases that sound authoritative but say nothing. The audience has heard them hundreds of times and processes them as noise.

Banned phrases: "In today's rapidly evolving landscape", "Let's dive in" or "Let's explore", "Unlocking the power of", "At the end of the day", "It's not just about X, it's about Y", "This is a game-changer", "Taking it to the next level", "Moving the needle", "Best-in-class".

The fix: replace the phrase with the claim it was standing in for, written in the shape the standards require. Name what changed, date it absolutely (`YYYY-MM-DD`, never "14 months ago"), and carry the source that supports the figure or mark it unverified when none does, per `standards/conventions.md`. A filler phrase asks the audience to agree; a dated, sourced, falsifiable sentence gives them something to evaluate, which is the point of cutting the filler.

### Consultant-speak

Jargon that signals the writer never did the work.

| Do not write | Write instead |
|--------------|---------------|
| leverage | use |
| synergy or synergies | combined effect, shared benefit |
| holistic approach | complete system, full picture |
| driving value | increasing revenue, reducing cost, saving time |
| paradigm shift | the specific change, by name |
| stakeholders | the actual group (customers, engineers, board) |
| ideation | brainstorming, design session |
| operationalize | ship, deploy, put into practice |
| transformative | the specific transformation |
| robust | what makes it strong |

If a word could appear in any deck about any topic and still sound plausible, it is too vague. Replace it with the word that only works for this deck.

### Fake-conclusory headlines

Headlines that look like conclusions but are topics in disguise: strong-sounding words with no specific, falsifiable claim.

Fake conclusions to avoid: "The Power of Innovation", "Driving Growth Through Technology", "Building a Better Future", "Transforming the Customer Experience", "Why This Matters".

Real conclusions to use: "Patent Filings Tripled After We Changed the Incentive Structure", "Self-Serve Onboarding Converted 47% More Trials Than Sales-Led", "Three Bugs in the Auth Flow Caused 80% of Our Support Tickets", "Customers Who Complete Setup in Under 5 Minutes Retain at 3x the Rate".

The test: can you disagree with the headline? "The Power of Innovation" is not a claim anyone can evaluate. "Patent Filings Tripled" is; someone could say "actually they only doubled." If the headline cannot be challenged, it is not a conclusion.

### Tagline stacks and synonym ladders

The tell that survives every list above: plain words, sharp rhythm, no referent. A slide whose body restates its own headline's benefit in different words; four pillars rendered as four slogans with no what-it-is, example, or proof under any of them; a ladder whose adjacent rungs a cold reader cannot tell apart. Each reads confident and teaches nothing.

The check is the Point-At Test in `experts/Ghost Writer/EXPERT.md`, its single home. Rewrite the failing body around any one referent that file names; where the source material holds none, ask for the real detail rather than inventing one. A list earns each item by making adjacent items distinguishable, or merges them.

### Generic metaphors

Metaphors used so often they no longer create an image. The audience pictures nothing.

Banned metaphors: "navigate the landscape", "bridge the gap", "unlock potential", "north star", "move the needle", "low-hanging fruit", "deep dive", "ecosystem", "journey" for a process, "empower" for a feature.

The fix: use a fresh, specific metaphor that fits the content, or drop the metaphor and state the point directly. "We need to bridge the gap between engineering and sales" becomes "Engineers and sales reps talk past each other because they do not share a dashboard."

### Suspiciously round numbers

Generated metrics tend to be clean and round: "50% improvement", "10x faster", "$1M saved". Real data is messy. 47.3% is more credible than 50%; $847K is more credible than $1M.

The fix: use the real numbers from the source. If no real data exists and you are projecting, say so: "Projected: about $850K annual savings based on pilot results." Never round a projection to a clean number and present it as fact.

### Robotic rule of three

The rule of three is a real technique, but applied to everything it feels mechanical: three benefits, three challenges, three phases, three pillars.

The fix: let the content set the count. If there are four real barriers to adoption, present four; if two compelling reasons, present two, and do not invent a third to complete the set. When you do use three, vary the pattern across the deck rather than repeating it in every list and section.
