# Motion Design

Reference material for UI animation and transitions. Covers duration rules, easing curves, performance constraints, staggered animations, reduced motion support, and perceived performance.

## Duration Scale

This table is the single home of UI motion durations for this root. `skills/Design System/` ships tokens that map onto these bands; `experts/Design Advisor/` audits against this scale by citation, not by a second copy of the numbers.

| Duration | Use Case | Examples | Design System token |
|----------|----------|----------|---------------------|
| 100 to 150ms | Instant feedback | Button press, toggle, color change | `--duration-fast` |
| 200 to 300ms | State changes | Menu open, tooltip, hover states | `--duration-normal` |
| 300 to 500ms | Layout changes | Accordion, modal, drawer | `--duration-layout` |
| 500 to 800ms | Entrance animations | Page load, hero reveals | `--duration-entrance` |

Exit animations are faster than entrances; use about 75% of the entrance duration.

## Easing Curves

Do not use the default `ease`. Use exponential curves for natural deceleration:

| Curve | CSS | Use |
|-------|-----|-----|
| Smooth ease-out (default) | `cubic-bezier(0.25, 1, 0.5, 1)` | Most UI transitions |
| Slightly dramatic | `cubic-bezier(0.22, 1, 0.36, 1)` | Panels, drawers |
| Snappy, confident | `cubic-bezier(0.16, 1, 0.3, 1)` | Micro-interactions |
| Ease-in (elements leaving) | `cubic-bezier(0.7, 0, 0.84, 0)` | Exit animations |
| Ease-in-out (toggles) | `cubic-bezier(0.65, 0, 0.35, 1)` | State toggles |

Bounce and elastic easing are prohibited defaults: the Visual effects entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home, name them. Real objects decelerate smoothly, which is why none of the curves above overshoots.

## Performance

Only animate `transform` and `opacity`. Everything else triggers layout recalculation.

For height animations, use `grid-template-rows: 0fr` to `1fr` transitions instead of animating `height` directly.

Do not use `will-change` preemptively; only when animation is imminent (`:hover`, `.animating`).

## Staggered Animations

Use CSS custom properties for cleaner stagger:

```css
animation-delay: calc(var(--i, 0) * 50ms);
```

Set `style="--i: 0"`, `style="--i: 1"`, and so on, on each item. Cap total stagger time: 10 items at 50ms is 500ms maximum. For many items, reduce the per-item delay or limit the staggered count.

## Reduced Motion

Non-negotiable. Vestibular disorders affect about 35% of adults over 40 (approximate, unverified).

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Preserve functional animations (progress bars, loading indicators) but remove spatial movement. Provide crossfade alternatives for entrance animations.

## Perceived Performance

The 80ms threshold: the brain buffers sensory input for about 80ms (approximate, unverified). Anything under 80ms feels instant and simultaneous. This is the target for micro-interactions.

Past that threshold, motion is not what makes an interface feel fast; the loading strategy is, and `interaction-design.md` carries it.
