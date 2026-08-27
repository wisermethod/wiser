# Responsive Design

Reference material for responsive web design. Covers the mobile-first approach, breakpoint strategy, input method detection, safe areas, responsive images, and adaptation patterns.

## Mobile-First

Write base styles for mobile, use `min-width` queries to layer complexity. Desktop-first (`max-width`) means mobile loads unnecessary styles first.

## Breakpoints

This table is the home for component and UI-shell adaptation (a single control, a card, a nav bar, an application chrome). It is not the home for full marketing page grids; those live in `skills/Marketing Page Design/` under Breakpoints. Shared anchors are 640px and 1024px; this table also names md at 768px for mid-width component adjustments that a four-band page grid does not need.

Content-driven, not device-driven. Start narrow, stretch until the design breaks, add a breakpoint there. Three breakpoints usually suffice:

| Name | Width | Typical Use |
|------|-------|------------|
| sm | 640px | Two-column layouts begin |
| md | 768px | Tablet adjustments |
| lg | 1024px | Full desktop layout |

Use `clamp()` for fluid values between breakpoints to reduce the need for discrete breakpoints.

## Input Method Detection

Screen size does not indicate input method. A laptop with a touchscreen, a tablet with a keyboard; use pointer and hover queries:

```css
@media (pointer: fine) { /* Mouse, trackpad */ }
@media (pointer: coarse) { /* Touch, stylus */ }
@media (hover: hover) { /* Device supports hover */ }
@media (hover: none) { /* Touch-only, no hover states */ }
```

Never rely on hover for functionality. Touch users cannot hover.

## Safe Areas

Modern phones have notches, rounded corners, and home indicators. Use `env()`:

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

Enable with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.

## Responsive Images

Use `srcset` with width descriptors and `sizes` for resolution switching. Use `<picture>` for art direction (different crops at different sizes). Let the browser pick the optimal file.

## Adaptation Patterns

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| Navigation | Hamburger plus drawer | Horizontal compact | Full with labels |
| Tables | Stacked cards | Horizontal scroll | Full table |
| Grids | Single column | 2 columns | 3 to 4 columns |
| Sidebars | Hidden or drawer | Narrow | Full width |

Do not hide critical functionality on mobile. Adapt the interface, do not amputate it.

## Container Queries

For component-level responsiveness (not page-level), use container queries. A card in a narrow sidebar stays compact; the same card in main content expands.

```css
.container { container-type: inline-size; }
@container (min-width: 400px) { /* expanded layout */ }
```

## Testing

DevTools emulation misses real touch interactions, CPU constraints, network latency, and font rendering. Test on at least one real iPhone and one real Android device.
