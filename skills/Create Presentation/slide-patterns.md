# Slide Patterns

Reusable reveal.js HTML patterns. Each pattern shows the exact HTML to place inside `<div class="slides">`. All content in every pattern is fully visible on navigation, with no fragment animations by default. Read this at the Generate-slides step.

When a brand template is loaded, use its CSS classes (`.brand-primary`, `.brand-accent`) instead of inline color values. When no brand template exists, use the CSS custom properties (`var(--brand-primary)`) defined in the document's `<style>` block, or the reveal.js theme variable `var(--r-link-color)`.

Pattern selection principle: choose the pattern that best serves the content, not the one that looks most impressive. A standard content slide with a strong headline beats a fancy card layout with a weak one. Vary patterns across the deck to prevent monotony, but never use a complex pattern where a simple one communicates the same idea.

## Cover or Title Slide

Opening slide with title, subtitle, and optional branding.

```html
<section>
  <h1>Presentation Title</h1>
  <p style="opacity: 0.7; margin-top: 0.5em;">Subtitle or tagline goes here</p>
  <p class="attribution">Author Name | Date | Company</p>
</section>
```

With a brand template that has a logo:

```html
<section>
  <div class="cover-brand">
    <img src="{Title} Assets/logo.png" class="cover-logo" alt="">
  </div>
  <h1>Presentation Title</h1>
  <p class="attribution">Brand Name | Author | Date</p>
</section>
```

## Section Divider

Full-width gradient background for separating major beats. Uses the `.section-slide` class for white text.

```html
<section class="section-slide" data-background-gradient="linear-gradient(135deg, var(--brand-primary, #2563eb) 0%, var(--brand-secondary, #7c3aed) 100%)">
  <h2>Section Title</h2>
  <p>Brief context for what follows</p>
</section>
```

With a brand template, replace the gradient with the brand's primary and secondary colors from its CSS.

## Standard Content

Default slide for text, lists, and inline elements.

```html
<section>
  <h2>Slide Title States the Conclusion</h2>
  <p>Main point or context paragraph.</p>
  <ul>
    <li>First supporting point</li>
    <li>Second supporting point</li>
    <li>Third supporting point</li>
  </ul>
</section>
```

## Two-Column Comparison

Side-by-side content using the `.columns` utility.

```html
<section>
  <h2>Before vs. After</h2>
  <div class="columns">
    <div class="col">
      <h3>Before</h3>
      <ul>
        <li>Pain point one</li>
        <li>Pain point two</li>
        <li>Pain point three</li>
      </ul>
    </div>
    <div class="col">
      <h3>After</h3>
      <ul>
        <li>Benefit one</li>
        <li>Benefit two</li>
        <li>Benefit three</li>
      </ul>
    </div>
  </div>
</section>
```

## Feature Cards (Single)

A single centered card for highlighting one concept, framework, or key idea.

```html
<section>
  <h2>Slide Title</h2>
  <div class="cards cards-single">
    <div class="card">
      <div class="card-label">Category Label</div>
      <div class="card-title">Card Title</div>
      <ul class="card-list">
        <li><strong class="brand-accent">Term One:</strong> Definition or description</li>
        <li><strong class="brand-accent">Term Two:</strong> Definition or description</li>
        <li><strong class="brand-accent">Term Three:</strong> Definition or description</li>
      </ul>
    </div>
  </div>
  <p class="text-muted" style="margin-top: 1em;">Optional footer text or call to action.</p>
</section>
```

Use `.card-description` instead of `.card-list` for paragraph text:

```html
<div class="card">
  <div class="card-label">Category</div>
  <div class="card-title">Title</div>
  <div class="card-description">Descriptive paragraph text that explains the concept.</div>
</div>
```

## Feature Cards (Two)

Side-by-side cards for comparisons, before and after, or contrasting concepts.

```html
<section>
  <h2>Comparison Title</h2>
  <div class="cards">
    <div class="card">
      <div class="card-label">Left Label</div>
      <div class="card-title">Left Title</div>
      <ul class="card-list">
        <li>Point one</li>
        <li>Point two</li>
        <li>Point three</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-label">Right Label</div>
      <div class="card-title brand-accent">Right Title</div>
      <ul class="card-list">
        <li>Point one</li>
        <li>Point two</li>
        <li>Point three</li>
      </ul>
    </div>
  </div>
</section>
```

Highlight the preferred card title with `.brand-accent` to draw attention to it.

## Feature Cards (Three)

Three cards for options, tiers, or related concepts.

```html
<section>
  <h2>Options Title</h2>
  <div class="cards cards-three">
    <div class="card">
      <div class="card-label">Option 1</div>
      <div class="card-title">Title One</div>
      <div class="card-description">Brief description of this option or tier.</div>
    </div>
    <div class="card">
      <div class="card-label">Option 2</div>
      <div class="card-title">Title Two</div>
      <div class="card-description">Brief description of this option or tier.</div>
    </div>
    <div class="card">
      <div class="card-label">Option 3</div>
      <div class="card-title">Title Three</div>
      <div class="card-description">Brief description of this option or tier.</div>
    </div>
  </div>
</section>
```

### Card Components Reference

| Class | Purpose |
|-------|---------|
| `.cards` | Container; centers cards with proper spacing |
| `.cards-single` | Single card layout (wider, more padding) |
| `.cards-three` | Three card layout (narrower, tighter spacing) |
| `.card` | Individual card with gradient background and border |
| `.card-label` | Small uppercase label above the title (accent color) |
| `.card-title` | Bold card heading |
| `.card-description` | Paragraph text inside a card |
| `.card-list` | Bullet list inside a card |
| `.card-price` | Large accent-colored text for pricing |

## Image Right

Text on the left, image on the right.

```html
<section>
  <div class="columns">
    <div class="col">
      <h2>Slide Title</h2>
      <p>Descriptive text that accompanies the image. Keep to 3 or 4 lines for visual balance.</p>
      <ul>
        <li>Supporting point</li>
        <li>Supporting point</li>
      </ul>
    </div>
    <div class="col">
      <img src="{Title} Assets/photo.jpg" alt="Description">
    </div>
  </div>
</section>
```

Swap the column order for Image Left. The `{Title} Assets/photo.jpg` path is a placeholder showing where a user-provided image goes; do not create that file.

## Full Image Background

Image fills the entire slide with a text overlay.

```html
<section data-background-image="{Title} Assets/hero-image.jpg" data-background-size="cover">
  <h1 style="color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.5);">Bold Statement</h1>
  <p style="color: #fff; opacity: 0.8;">Supporting text overlaid on the background image</p>
</section>
```

## Quote or Testimonial

Centered quote with attribution.

```html
<section>
  <blockquote>"The quoted text goes here. Keep it impactful and concise."</blockquote>
  <p><strong>Attribution Name</strong>, Title, Company</p>
</section>
```

## Metrics or Data Highlight

Display key numbers prominently using the `.metrics` utility.

```html
<section>
  <h2>Key Results</h2>
  <div class="metrics">
    <div class="metric">
      <div class="number brand-primary">47%</div>
      <div class="label">Revenue Growth</div>
    </div>
    <div class="metric">
      <div class="number brand-primary">3.2x</div>
      <div class="label">ROI Achieved</div>
    </div>
    <div class="metric">
      <div class="number brand-primary">92%</div>
      <div class="label">Client Retention</div>
    </div>
  </div>
</section>
```

Use `.brand-primary` on `.number` elements for consistent coloring. The class is defined in brand templates and in the starter-deck.html utilities.

## Code Walkthrough

Code block with syntax highlighting. `data-line-numbers` takes one range, which highlights those lines with the whole block visible at once.

```html
<section>
  <h2>Implementation</h2>
  <pre><code data-trim data-noescape data-line-numbers="1-8">
# Step 1: Define the model
class User(BaseModel):
    name: str

# Step 2: Create the endpoint
@app.post("/users")
async def create_user(user: User):
    return {"id": 1, "name": user.name}
  </code></pre>
</section>
```

### Stepped Line Highlight (Opt-in Only)

Pipe-separated ranges make the highlight plugin walk the ranges one click at a time. This is a progressive reveal even though no `class="fragment"` appears in the file: reveal.js generates the fragments from the attribute at runtime, so a grep for the class will not find it. Use it only when the user explicitly asks to step through code.

```html
<pre><code data-trim data-noescape data-line-numbers="1-3|5-8|1-8"></code></pre>
```

## Code Comparison (Two Column)

Two code blocks side by side.

```html
<section>
  <h2>Before and After</h2>
  <div class="columns">
    <div class="col">
      <h3>Before</h3>
      <pre><code data-trim>
function getData() {
  return fetch('/api')
    .then(r => r.json())
    .then(d => d.data);
}
      </code></pre>
    </div>
    <div class="col">
      <h3>After</h3>
      <pre><code data-trim>
async function getData() {
  const res = await fetch('/api');
  const { data } = await res.json();
  return data;
}
      </code></pre>
    </div>
  </div>
</section>
```

## Timeline or Process Steps

Sequential steps displayed together. All steps are visible on navigation.

```html
<section>
  <h2>Our Process</h2>
  <ol>
    <li><strong>Discovery.</strong> Understand the problem and audience</li>
    <li><strong>Strategy.</strong> Define the approach and success criteria</li>
    <li><strong>Execution.</strong> Build, test, and iterate</li>
    <li><strong>Delivery.</strong> Launch and measure results</li>
    <li><strong>Optimization.</strong> Refine based on data</li>
  </ol>
</section>
```

## Progressive Reveal (Opt-in Only)

Reveals bullet points one click at a time. Only use this pattern when the user explicitly requests progressive reveal or step-by-step animation. The default for all list slides is Standard Content, all items visible immediately. When the user requests this pattern, limit to three or four fragments per slide.

```html
<section>
  <h2>Three Key Insights</h2>
  <ul>
    <li class="fragment">First insight that sets the foundation</li>
    <li class="fragment">Second insight that builds on the first</li>
    <li class="fragment">Third insight that delivers the punchline</li>
  </ul>
</section>
```

## Big Number or Hero Metric

One metric dominates the slide. Use it when a single number tells the story.

```html
<section>
  <p style="font-size: 4em; font-weight: 700; line-height: 1;" class="brand-primary">2.4M</p>
  <h2>Users Onboarded in 90 Days</h2>
  <p style="opacity: 0.6; font-size: 0.7em;">Previous record: 800K over 6 months</p>
</section>
```

The number should be the largest element on the slide, with supporting context below in smaller text. Use this instead of a bar chart when comparing against a single baseline.

## Agenda or Overview

List the deck's major sections. Use it at the start to set expectations, or right after the cover slide.

```html
<section>
  <h2>What We Will Cover</h2>
  <ol>
    <li><strong>The Problem.</strong> Why the current approach fails</li>
    <li><strong>Our Approach.</strong> Three principles that change the game</li>
    <li><strong>Evidence.</strong> Results from two pilot programs</li>
    <li><strong>The Ask.</strong> What we need to scale</li>
  </ol>
</section>
```

Keep to four to six items. More than six and the deck may be trying to cover too much.

## Icon and Label Grid

Text-based grid for features, values, or categories. Uses Unicode characters instead of image files.

```html
<section>
  <h2>Our Core Values</h2>
  <div class="cards cards-three">
    <div class="card" style="text-align: center;">
      <div style="font-size: 2em; margin-bottom: 0.3em;">&#9878;</div>
      <div class="card-title">Precision</div>
      <div class="card-description">Every detail matters. We measure twice.</div>
    </div>
    <div class="card" style="text-align: center;">
      <div style="font-size: 2em; margin-bottom: 0.3em;">&#9829;</div>
      <div class="card-title">Empathy</div>
      <div class="card-description">We build for real people with real problems.</div>
    </div>
    <div class="card" style="text-align: center;">
      <div style="font-size: 2em; margin-bottom: 0.3em;">&#9889;</div>
      <div class="card-title">Speed</div>
      <div class="card-description">Ship weekly. Learn daily. Iterate constantly.</div>
    </div>
  </div>
</section>
```

Uses the existing `.cards` and `.card` utilities. Unicode symbols serve as lightweight icons without image files.

## Centered Statement

A single powerful statement, centered. Use it for a "so what" moment or a key takeaway.

```html
<section>
  <h2>The one thing to remember</h2>
  <p style="opacity: 0.7; margin-top: 0.5em; font-size: 0.8em;">Supporting context that reinforces the statement</p>
</section>
```

## Table Slide

Standard HTML table for comparisons and data.

```html
<section>
  <h2>Feature Comparison</h2>
  <table>
    <thead>
      <tr><th>Feature</th><th>Plan A</th><th>Plan B</th><th>Plan C</th></tr>
    </thead>
    <tbody>
      <tr><td>Users</td><td>10</td><td>100</td><td>Unlimited</td></tr>
      <tr><td>Storage</td><td>5 GB</td><td>50 GB</td><td>500 GB</td></tr>
      <tr><td>Support</td><td>Email</td><td>Priority</td><td>Dedicated</td></tr>
      <tr><td>Price</td><td>$29/mo</td><td>$99/mo</td><td>$299/mo</td></tr>
    </tbody>
  </table>
</section>
```

## Inline Bar Chart (CSS Only)

A horizontal bar chart built with HTML and CSS. No images, no JavaScript, no external libraries.

```html
<section>
  <h2>Market Share by Region</h2>
  <div style="max-width: 80%; margin: 1em auto; text-align: left;">
    <div style="margin-bottom: 0.8em;">
      <div style="display: flex; justify-content: space-between; font-size: 0.6em; margin-bottom: 0.2em;">
        <span>North America</span><span class="brand-primary">47%</span>
      </div>
      <div style="background: rgba(0,0,0,0.08); border-radius: 4px; height: 1.2em;">
        <div style="width: 47%; height: 100%; background: var(--brand-primary); border-radius: 4px;"></div>
      </div>
    </div>
    <div style="margin-bottom: 0.8em;">
      <div style="display: flex; justify-content: space-between; font-size: 0.6em; margin-bottom: 0.2em;">
        <span>Europe</span><span class="brand-primary">31%</span>
      </div>
      <div style="background: rgba(0,0,0,0.08); border-radius: 4px; height: 1.2em;">
        <div style="width: 31%; height: 100%; background: var(--brand-primary); border-radius: 4px;"></div>
      </div>
    </div>
    <div style="margin-bottom: 0.8em;">
      <div style="display: flex; justify-content: space-between; font-size: 0.6em; margin-bottom: 0.2em;">
        <span>Asia-Pacific</span><span class="brand-primary">22%</span>
      </div>
      <div style="background: rgba(0,0,0,0.08); border-radius: 4px; height: 1.2em;">
        <div style="width: 22%; height: 100%; background: var(--brand-primary); border-radius: 4px;"></div>
      </div>
    </div>
  </div>
</section>
```

Highlight the leading bar with `--brand-primary` and secondary bars with `--brand-secondary` or a lower opacity. Use this pattern instead of referencing an external chart image.

## End or Thank You

Closing slide.

```html
<section>
  <h2>Thank You</h2>
  <p>Questions?</p>
  <p class="attribution">name@example.com | @handle</p>
</section>
```

## Speaker Notes

Add notes visible in speaker view (press `S` during a presentation). Place `<aside class="notes">` inside any slide section.

```html
<section>
  <h2>Slide Title</h2>
  <p>Content here</p>
  <aside class="notes">
    Speaker notes:
    - Remember to mention the pilot case study
    - Pause for questions after this slide
    - Transition: "Now let's look at the data..."
  </aside>
</section>
```

## Custom Background Colors

Set a background color on any slide.

```html
<section data-background-color="var(--brand-primary, #1e293b)">
  <h2 style="color: #fff;">Dark Background Slide</h2>
  <p style="color: #e2e8f0;">Content on a dark slide</p>
</section>
```

## Vertical Slides (Nested Sections)

Create a vertical slide stack by nesting `<section>` elements. Navigate down with the arrow keys.

```html
<section>
  <section>
    <h2>Vertical Slide 1</h2>
    <p>Top of the stack (press the down arrow)</p>
  </section>
  <section>
    <h2>Vertical Slide 2</h2>
    <p>Second in the stack</p>
  </section>
</section>
```

## Fragment Ordering (Opt-in Reference)

When the user has requested progressive reveal, control the order elements appear with `data-fragment-index`. This is a reference for opt-in use only; do not add fragment ordering to slides by default.

```html
<section>
  <h2>Custom Order</h2>
  <p class="fragment" data-fragment-index="3">This appears third</p>
  <p class="fragment" data-fragment-index="1">This appears first</p>
  <p class="fragment" data-fragment-index="2">This appears second</p>
</section>
```

## Fragment Styles (Opt-in Reference)

Animation styles available when the user has requested fragment animations. This is a reference for opt-in use only; do not add fragment styles to slides by default. Prefer `fade-in` or the default (no style class) over dramatic styles.

```html
<section>
  <h2>Fragment Styles</h2>
  <p class="fragment fade-in">Fade in</p>
  <p class="fragment fade-up">Fade up</p>
  <p class="fragment fade-out">Fade out (disappears)</p>
  <p class="fragment highlight-red">Highlight red</p>
  <p class="fragment highlight-blue">Highlight blue</p>
  <p class="fragment grow">Grow</p>
  <p class="fragment shrink">Shrink</p>
</section>
```

Available fragment classes: `fade-in`, `fade-out`, `fade-up`, `fade-down`, `fade-left`, `fade-right`, `fade-in-then-out`, `fade-in-then-semi-out`, `grow`, `shrink`, `strike`, `highlight-red`, `highlight-green`, `highlight-blue`, `highlight-current-red`, `highlight-current-green`, `highlight-current-blue`.
