# Interaction Design

Reference material for interactive element design in web interfaces. Covers the eight interactive states, focus management, form patterns, loading strategies, the container's empty state, modal alternatives, destructive action patterns, and keyboard navigation.

## The Eight Interactive States

Every interactive element has up to eight states. The empty state is a container's, not an element's, and has its own section below.

| State | When | Visual Treatment |
|-------|------|------------------|
| Default | At rest | Base styling |
| Hover | Pointer over (not touch) | Subtle lift, color shift |
| Focus | Keyboard/programmatic focus | Visible ring, to the specification in Focus Indicators below |
| Active | Being pressed | Pressed in, darker |
| Disabled | Not interactive | Reduced opacity (0.5 to 0.6), no pointer events |
| Loading | Processing | Spinner, skeleton |
| Error | Invalid state | Error color border, icon, message |
| Success | Completed | Confirmation mark, confirmation text |

Hover and focus are different states. Keyboard users never see hover states.

## Focus Indicators

`:focus-visible` shows focus rings only for keyboard users. Focus rings need 3:1 contrast against adjacent colors, 2 to 3px thickness, offset from the element.

```css
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Never remove focus outlines without replacement.

## Form Patterns

- Placeholders are not labels. Always use visible `<label>` elements.
- Validate on blur, not on every keystroke (exception: password strength).
- Place error messages below fields with `aria-describedby`.
- Error messages answer: what happened, why, and how to fix it.

## Loading Strategies

- Skeleton screens over spinners: previewing the content's shape feels faster, because the user sees work happening.
- Optimistic updates for low-stakes actions (likes, follows, toggles); never for payments or destructive operations.
- Button loading: spinner replaces label, disable the button.
- For long waits, set expectations ("This usually takes 30 seconds").
- Never block the entire page for a partial data load.

## Empty States

The empty state belongs to a container that can hold nothing rather than to an interactive element, which is why it sits outside the eight above. A container with nothing in it is never rendered blank.

- Keep the container's own frame legible so the shape of what will arrive is visible before anything does: a table keeps its header row, a list keeps its bounds, a card grid keeps its column widths.
- Fill the space with a short heading, one line of guidance, and one primary action, set in the container's own type scale and spacing rather than as a centered island with rules of its own.
- The three causes take different treatment. Nothing created yet takes the heading, guidance, and action above. A filter or search matching nothing keeps the controls in place and offers to clear them, because the data exists and the query is what is wrong. A load that failed is the error state, not this one.
- An illustration or icon is optional; it earns its place or it is dropped. The heading and the action carry the state.

`ux-writing.md` carries the copy.

## Modal Alternatives

The modal as default overlay is a prohibited default: the Interaction entries of the Prohibited Defaults Taxonomy in `experts/Creative Director/EXPERT.md`, the list's single home, name it. Reach for an alternative first:

| Alternative | When |
|------------|------|
| Drawer (slide-over panel) | Content needs context from the page behind |
| Popover (`popover` attribute) | Small menus, tooltips, pickers |
| Inline expansion | Details, accordions, progressive disclosure |
| Toast plus undo | Confirmation of actions (undo is better than confirmation dialogs) |

Reserve modals for: complex multi-step flows, truly irreversible destructive actions, content that requires full attention.

Use native `<dialog>` with `showModal()` for proper focus trapping and Escape-to-close.

## Destructive Actions

Undo is better than confirmation dialogs. Users click through confirmations mindlessly. Pattern: remove from UI immediately, show undo toast, actually delete after the toast expires.

Reserve confirmation for: account deletion, data purge, actions affecting other users, financial transactions.

When confirming: name the action specifically, explain consequences, use specific button labels ("Delete 5 items" and "Keep items", not "Yes" and "No").

## Keyboard Navigation

### Roving Tabindex

For component groups (tabs, menu items, radio groups): one item is tabbable (`tabindex="0"`), arrow keys move within the group. Tab moves to the next component entirely.

### Skip Links

Provide skip links for keyboard users to jump past navigation. Hide off-screen, show on focus.

### Gesture Fallbacks

Swipe-to-delete and similar gestures are invisible. Always provide a visible fallback (a menu with "Delete"). Hint at gesture existence with partial reveal or onboarding coach marks.
