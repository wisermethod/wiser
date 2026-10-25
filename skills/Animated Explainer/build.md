# Build

This file is the one home of how a piece is built so that its finished picture shows whatever happens. `skills/Animated Explainer/SKILL.md` reads it at Steps 4 and 5. `## The contract` holds for every piece; the rest is how the two starters keep it. A starter is an engine, not a look: copy it, replace its picture and its words entirely, and keep its engine rules and its script as they are. The class names the engine reads (`ax-loop`, `ax-once`, `ax-stage`, `ax-wires`, `ax-fly`, `ax-btn`, and the rest the starter's header lists) are never renamed. A piece is named by its own class beside the root, as `ax-demo` is in the loop starter.

## The contract

Every piece keeps these, whether it runs on a starter's engine or on its own script.

- The base CSS is the finished picture. Every rule that hides, dims or moves anything sits inside one `@media screen and (prefers-reduced-motion: no-preference)` block, the piece's own hidden states included, after the engine rules. With that done, no script, reduced motion at load or switched on later, print, a reveal.js `?print-pdf` view, and an address carrying `?export` all show the finished picture.
- The script only arms what that block animates. Falling back to the still, it cancels every running animation, because in Chrome a transition already running keeps going after its rule stops applying.
- The still matches the picture at the end of the motion, every connection drawn.
- Every visible word is in the markup: the labels, the text description beside the `aria-hidden` picture, the control's names, any caption. The script writes no word, apart from a count's intermediate digits.
- A loop on a page or a slide stops off-screen and on a hidden tab and resumes where it stopped, and draws its pause control where `## The accessibility floor` says one is drawn. On a slide, the piece plays only while its slide is current. In a video, the piece plays once, as `## Video` says.
- It loads nothing from another origin, and its rules are scoped under its own class, so two pieces on one page never restyle each other.

The engines keep every line of this, proved in Chromium. A piece on its own script proves each line on its renders.

## The picture

The picture is the inline SVG `skills/Illustrator/` drew to its `drawing.md` `## A picture another skill will move`, one drawing per layout. It sits on the stage, which keeps a fixed aspect: the starter sets that aspect in its own demo geometry, so set `aspect-ratio` on the stage under the piece's class, or the stage collapses and the engine draws nothing. Every element on it is placed in the stage's width units (`cqw`) or in its SVG's own units, so it holds at every width. Which layouts does the piece have? One aspect: one picture. A page that narrows below what that aspect can carry: a second layout shown by its own container query, as the starter's `ax-wide` and `ax-narrow` overlays are.

Engine markup is the root, frame, stage and layout wrappers, cover and pause control; the engine's classes and timing, anchor, line, flight and count attributes named here and in the starter's header; `pathLength="1"` and the line's dash; a line the engine measures, its default `d` computed by `wirePath` per `## Measuring and drawing`, in place of the drawn line between the same two objects; an HTML anchor overlay the engine measures from, where an SVG anchor would carry a transform; and the `aria-hidden` wrapper and text description `## The accessibility floor` requires. Any other change to finished geometry runs `skills/Illustrator/` again by name as a revision, naming the change, as `SKILL.md` Pitfalls says.

Motion is transform and opacity, per Performance in `skills/Component Design/motion-design.md`. A drawn shape turns on by the class `on` the timeline gives it, and its moving rules sit in the motion block. Id prefixes follow `skills/Illustrator/drawing.md` `## The file`; where one component may sit twice on a page, add a suffix it takes as a prop. A once piece's drawing moves on the root's classes: hidden inside the motion block under `.ax-armed:not(.ax-go)`, entering under `.ax-go`.

The engine's colours are custom properties set on the piece's class (the loop's `--ax-ground`, `--ax-ink`, `--ax-muted`, `--ax-box`, `--ax-line` and `--ax-focus`; the once's `--ax-ground`, `--ax-ink` and `--ax-muted`); the picture's own properties are the ones Illustrator set, named for their roles, and the engine's take their values from the same design sources. The starters' greys are placeholders and never ship. The loop's cover, which hides the stage at each wrap, is `--ax-ground`: set it to the picture's own backdrop colour, or the stage blinks to another at every cycle. On a site, keep the piece's properties apart from the site's palette names, so a palette change elsewhere cannot recolour the piece unseen. On a deck, set them from the deck's `:root` brand properties with `var()`, so a change to the deck's look reaches the slide, as `skills/Create Presentation/` makes every look change.

The page text floor is `skills/Illustrator/drawing.md` `## Words on the picture`; the stage's width units make it a real risk at 320, so write label sizes as `max(12px, <n>cqw)`, as the starter does, with `<n>` chosen so a label meets that section's floor at every width. On a slide, keep that section's slide floor in the slide's own pixels, per `skills/Create Presentation/slide-design.md` Typography.

## The timeline

`data-len` on the root is the cycle in seconds. `data-at` and `data-off` on an element are when it turns on and off, as the class `on`: present from `data-at` until `data-off`. With no `data-off`, it stays on. Every line and every flight carries a `data-at`: one with none shows in the still and stays hidden for the whole loop.

A cover hides the stage for the cycle's first 0.3 s and lifts over `--ax-fade` after it, and it comes down again over `--ax-fade` from 0.6 s before the cycle ends. While it is up it resets everything beneath it. `--ax-fade` is at most 0.6 s; longer, the engine keeps the still and warns in the console.

What must a viewer never lose while the loop runs? The conclusion, a total or a heading, is a direct child of the stage marked `data-keep`, with no `data-at` and no `data-off`. It sits above the cover, shows throughout every cycle, and is never reset. The engine makes it `position: relative` only where the piece gives it no position of its own; do not set it to `position: static`.

The hold is the stretch after the last moment and before the closing fade, where the whole picture stands finished. The still must match the hold. The last moment is the latest `data-at` or `data-off`, counted as at least 0.3 s. Does `data-len` leave room? It must be at least the last moment plus 0.9 s, which the engine enforces: shorter, or no number, and it keeps the still and warns in the console. It must also be at least the last moment plus the length of the motion that moment starts plus 0.6 s, which the engine does not check: shorter, and the closing fade starts before that motion ends, so the hold never stands finished and does not match the still. Lengthen the cycle until both hold. A root on the render clock, for a video, has no closing fade and no cycle: `## Video` holds for it instead of this paragraph.

Durations and curves are Duration Scale and Easing Curves in `skills/Component Design/motion-design.md`, named through the starters' custom properties: the loop's `--ax-draw`, `--ax-enter`, `--ax-fade`, `--ax-travel` and `--ax-ease-out`, the once's `--ax-count`, `--ax-draw`, `--ax-rule-delay`, `--ax-enter` and `--ax-ease-out`, and any the picture adds. Each is a plain CSS time, in `ms` or `s`; a `calc()` the scripts cannot read falls back to the default. Beats overlap and stagger as `SKILL.md` Step 3 says. No overshoot, no bounce.

## Loop

A process, a cycle or a relationship seen whole is a loop, from `starters/loop/`. It starts when a quarter of its stage is in view or, on a slide, when the slide is current and every fragment holding it is shown. It waits off-screen, on a hidden tab, and while paused, and the time it was away is not added to its clock.

Its pause control is drawn where `## The accessibility floor` says one is, and a loop runs for longer than five seconds whatever its cycle. Its two names are the markup's `data-pause` and `data-play`. A pause inside either of the cover's fades moves to the hold and pauses there with the cover clear; a pause anywhere else keeps its frame; a resume never replays a motion already finished. Do not remove the control from the markup. The engine shows it only while it can animate on the browser's clock, and never on the render clock.

One engine serves every `.ax-loop` on a page, each on its own clock, and including `loop.js` or `loop.css` twice is harmless. `window.AxLoop.scan()` starts a piece added after load. Known limit: paused mid-draw, then resized across the layout switch, the layout that appears shows its lines complete until play resumes.

## Once

One figure or one outcome that lands is a once piece, from `starters/once/`. With motion wanted, it stays hidden until a quarter of it is in view, or until its slide is current, then plays once and holds. A figure already a quarter in view when the script arms it, off a slide, keeps the finished figure and never plays: where the figure will sit in the first screen, Step 6's message and a placement note say it shows its finished figure there and counts only lower on the page. Several on one page take turns in document order.

`.ax-num` holds one quantity the engine can read, with words or symbols around it; it counts in the markup's own format, which the once starter's header sets out, and ends on the markup's own text. A year, a code, or anything that is not a quantity: `data-count="off"`. A second number, a range, a negative or an ambiguous separator such as `1.250,5`: the engine fades it in instead of counting. `window.AxOnce.scan()` starts a figure added after load.

## Video

A piece for a video plays its timeline once from the renderer's time, never the browser's clock, so the same time gives the same frame on any render worker. Its root carries `data-clock="render"`, and each engine then runs on its render clock; the piece's markup, its motion block and `## The timeline` stay the one statement of when each element turns on and off. `tools/video-render/` renders the page, and its `TOOL.md` is the one home of what the project holds and how the time reaches the page.

- **A loop's timeline, played once.** `data-len` is the video's duration, and any number past the last moment holds, since a video has no closing fade. The cover lifts at 0.3 s as on a page, and the finished picture holds from the end of the last motion to the end.
- **The five-second sentence.** In a video it is the conclusion marked `data-keep`, so it shows from the first frame; a heading in its place, with the point arriving on a late beat, does not meet `SKILL.md`'s Objective.
- **When a beat shows.** An element turns on at the first frame whose time is past its `data-at`, so a frame drawn at exactly a beat's time shows the moment before it. `data-at` stays the caller's time.
- **A once figure.** The root's `data-at` is when it plays, 0.3 s where it has none. It waits hidden until then, counts in its own format and holds. Several figures each play at their own `data-at`, never in turns.
- **What moves.** A transition on a timed element or on any element inside one, a flight, an element leaving at `data-off`, and a once figure's count are each set to the render time on every frame, and frozen there before the frame is drawn. A motion on an element with no timed element at or above it is not, and the engine names its class in the console; that is the gap `SKILL.md` declares, so in a video, move only timed elements and what sits inside them.
- **The still.** Each line overlay's `viewBox` is the stage's size in the frame's own CSS pixels, and each line's default path is written in those units by `## Measuring and drawing`'s procedure at the frame's size, so the still a video is judged against is drawn as its hold is.
- **The hold and the cover.** The hold runs from the end of the last motion to the end the caller set. Is it shorter than 0.33 s for each word on the finished picture, the fast end of the 160 to 180 words a minute the BBC's subtitle guidance recommends (as summarised at `clevercast.com/bbc-subtitling-guidelines`, read 2026-10-25), or does the end fall before the last motion finishes? Yes: say so in the delivery record, with the hold it would need. No: nothing to say. Does any beat fall at or before 0.3 s, under the cover? Yes: say so in the delivery record, naming each such beat and that it shows when the cover lifts; never move it. No: nothing to say.

## Measuring and drawing

Lines (`path[data-from][data-to]`) and flights (`.ax-fly`) are optional: use them where something travels or connects. They are measured between anchors, as fractions of each element's box: `data-fx`, `data-fy`, `data-tx`, `data-ty`. An anchor is an HTML element laid out inside the stage, which the engine reads from layout, so its own entrance transform changes nothing. An SVG shape is read from its on-screen box instead, so it anchors only while neither it nor any group around it carries a transform, its entrance included; anchor to an HTML element where the drawing moves. Leave measuring to the engine: never add a measurement with `getBoundingClientRect`, whose box counts padding, an entrance transform and a slide's scale. The stage carries no padding and no border; space around the picture goes on the frame or the page.

A line's default path in the markup is its finished shape, in its overlay's units, so the still shows it. Does every line have a default path computed with the engine's curve? No, or one was drawn by hand: open the piece with its script once, call `window.AxLoop.wirePath(a, b, head)` with `a` and `b` as `{x, y}` points and `head` a length, all in the overlay's units, and write the returned path into its `d`. `data-head` is a percent of the stage's width. Lines draw with `pathLength="1"` and a dash of 1.

## The accessibility floor

Every piece meets this floor in every destination. Each line is checkable on the renders or in the markup.

- Without JavaScript, under reduced motion at load or switched on later, and in print or PDF, the finished picture shows. In a video, the still, rendered with no script, shows it.
- On a page or a slide, a loop has a pause control (WCAG 2.2.2), stops off-screen and on a hidden tab, and resumes where it stopped. In a video, no control is drawn, since the player carries pause, and the piece plays once and holds. This line is the one home of when a control is drawn.
- A once piece plays once and holds, hidden rather than shown at zero until it plays.
- The picture is `aria-hidden`, with the text description beside it. A once piece's number and caption are the text. In a video, the text description travels with the segment, for the video's own description or transcript.
- No word renders under 12px on a page from 320 to 1440 wide, under 16px on a slide in its own pixels, or, in a video, under 28 × (the frame's shorter side ÷ 1,080) pixels, 28px at 1920×1080, the smallest body text Amazon's Fire TV design guidelines allow on a 1080p screen (at least 14sp, about 28px; `developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html`, read 2026-10-25).
- Every control meets criteria 4 and 5 of `skills/Component Design/SKILL.md`, and is reached and worked by keyboard.
- Nothing flashes more than three times a second (WCAG 2.3.1).
- Contrast meets Contrast Requirements in `skills/Color Palette Design/SKILL.md`, and colour is never the only carrier of meaning.

## Renders

For a page or a slide, Step 5 captures through `tools/Browser Control/`, at 1440 and 390 wide, and at 320 for the text floor:

- Mid-motion, and the hold or the held figure.
- With no JavaScript, from a copy of the page with its script tags removed. A deck needs reveal.js's script to show any slide, so a deck slide's render with no JavaScript is its `section` alone on a plain page that loads the deck's stylesheet, with no script; how the deck itself looks with no script is the deck's matter, per `destinations.md` `## A deck slide`.
- Under reduced motion, with that tool's `emulate set --reduced-motion reduce`, twice: set before the page loads, and switched on after it has started moving, when nothing may still be moving. The setting stays on the tab until `emulate reset`, which also resets the window's size, so set the width again after it.
- A loop paused mid-motion. A once piece waiting and playing, where it loads below the fold.
- A deck slide playing, and the deck exported through `tools/deck-export/`: its `pdf` opens the deck on `?print-pdf` and its `png` with the export query, so both show the finished picture.

For a video, the renders come from `tools/video-render/` at the caller's frame size and rate, one size only, all PNGs from its `frames`: at each beat, the first frame after the beat's time, per `## Video`; one mid-motion; the last frame, which is the hold; and the still, `frames` at time 0 on a copy of the project with its script tags removed. Is the last frame the still, pixel for pixel, both being PNGs from `frames`? Yes: the still matches the hold. No: back to `SKILL.md` Step 4. The segment, an MP4 its profile encodes, is what is handed over and never this comparison. Browser Control's widths, its reduced-motion captures, print and a deck's exports are the page's and the slide's, and a video has none of them.

Every address is cache-busted with a fresh query string of your own naming, since a capture from a cached build has misled a gate before; `export` and `print-pdf` are the names that hold the still. Every capture is a new file. Check each line by looking along it, since a short line missing from the still barely moves a whole-picture comparison. Save the captures in the record folder, with a profile directory per run in the owning root's work area, per Session State in `tools/Browser Control/TOOL.md`.

## Pitfalls

- **The starter's look shipped.** Grey boxes and arrows with new labels. Replace the whole picture, per `SKILL.md` Step 4.
- **Lines cut short.** A fixed dash length. Use `pathLength="1"` and a dash of 1.
- **A flight or a line off its target.** A measurement of the on-screen box, or padding or a border on the stage. Leave measuring to the engine and keep the stage bare.
- **The still missing a connection.** A line with no default path. Write it per Measuring and drawing.
- **Two pieces on one page restyling each other, or one's gradient appearing in the other.** Rules not scoped under the piece's class, or an id not prefixed. Scope the rules and prefix the ids, per The picture.
- **A capture that shows an old build.** The browser cached it. Bust the address.
- **Motion still running after reduced motion was switched on.** A hiding rule moved out of the motion block, or the engine's cancel removed. Put both back.
- **A figure that counts a year, or reads `1.250,5` as a decimal.** Mark it `data-count="off"`, or write the number unambiguously.
- **A loop that never moves and warns in the console.** `data-len` leaves no room after the last moment. Lengthen it, except on the render clock, where any duration past the last moment holds and `## Video`'s hold note is the warning.
- **Browsers other than Chromium.** The starters were proved in Chromium only. Render in Chromium, and where the readers' browsers are not known or include Safari or Firefox, the delivery names the Chromium-only proof; this is not a question to stop on.
