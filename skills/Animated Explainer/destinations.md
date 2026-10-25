# Destinations

How a finished piece is packaged, rendered and handed over at each of the four places it can go, read at Steps 4, 5 and 7 of `SKILL.md`. The build itself is `build.md`'s. Each section ends in the delivery record the skill's record folder keeps.

## A kit site

**Working copy.** Build in a working copy, never the envelope. Copy the envelope folder to the owning root's work directory, per `standards/conventions.md` Working Files. Replace the copy's `AGENTS.md` with a router that opens with one line saying it is an unpublished working copy where an explainer is drafted and judged, keeps the envelope's Provides block unchanged, so every key resolves as it does in the envelope, and keeps every mention `skills/Site Author/` Check fails a router for missing, so the copy's check can pass. The envelope keeps its own router.

**The component.** The piece becomes one file, `site/src/custom/components/<Name>.astro`, named and limited as `skills/Site Author/kit/KIT.md` The site's own folder states. Every visible word is a prop the page's MDX places. The script goes in the component's `<script>`, which Astro bundles once per page, and the engine's own guard keeps one registration whatever else is on the page. The CSS goes in `<style is:global>`, not a plain `<style>`, because Astro scopes a plain `<style>` to elements its template wrote and a rule would never reach an element the script creates, such as the once engine's `.ax-count`. The picture's rules stay scoped under the piece's own class.

**A component that exists.** Does the site already hold a component this skill made that shows this kind of thing, so that only its words and data change? Yes: it changes by its props alone, placing it is `skills/Site Author/` Edit content, and nothing is filed. No: the piece is a new component.

**Weight.** The kit loads a site component's styles on every page and its script only where it is placed, so keep the CSS to the engine and the piece. A second explainer on the site carries its own copy of the engine's CSS, which is harmless, and the delivery record names that cost.

The jobs run in this order, each by the job that owns it:

1. Build and `check` in the working copy, and render from its own build served locally, per `build.md` `## Renders`. `SKILL.md` Steps 5 and 6 judge those renders.
2. `skills/Site Author/` File site code files the component into the envelope, handed the record of the Audit's verdict, naming the revision it judged, and of each finding the approver accepted, as its `<producer_record>`. That job names this skill as a producer it accepts. A piece left unfinished by `SKILL.md` Step 6 goes no further than job 1.
3. `skills/Site Author/` Edit content places it in the page with the approved words. The page is archived first, per `standards/conventions.md` Archives.
4. In the envelope, `npm run build`, then `check`, then `check --built`, per `skills/Site Author/` Check. Render the envelope's built page once at 1440 wide. **Does the piece look as it did in the judged renders?** Yes: go on. No, a difference in the piece: back to `SKILL.md` Step 5. No, a difference outside the piece because the envelope changed after the copy was made: a note for the site's owner in the delivery record.
5. **Has the requester said go?** Yes: `experts/Webmaster/` Job 3 on that exact build, with the destination the go names and the known limits the approver accepted, then the host skill publishes after its pass; this skill deploys nothing. No, or not yet: nothing is published, and the record says Job 3 is owed on that exact build.

**Delivery record:** the component's path; the page changed; the `check` results; the envelope's render; the engine's CSS cost where a second explainer is on the site; notes for the site's owner; and the requester's go and Job 3's verdict, or that both are owed.

## Another site

**The bundle** sits in the owning root's work directory, per `standards/conventions.md` Working Files. It is three files: an HTML snippet, the marked piece with its words; one CSS file; and one JS file. It carries no inline script and no inline style, so a policy that admits the site's own files admits the bundle once it is placed on that origin. Its rules are scoped under the engine's classes and the piece's own class. Every word sits in the markup.

**Does the requester supply the site's content security policy?** Read its script rule and its style rule separately.

- Both admit files from the site's own origin, or the policy has no rule for one of them and its `default-src` does not restrict it: the bundle runs as placed.
- Styles admitted, scripts not: the markup and CSS ship, showing the finished still, the motion is named unavailable, and the placement note names what the site would have to allow.
- Styles not admitted: the finished picture cannot ship as built. Name it unavailable, and put two routes to the requester: the site allows the stylesheet, or a still image of the finished picture, rendered from the build, ships in its place with the text description as its alternative text.
- Not supplied: the placement note says the bundle assumes a policy that admits the site's own scripts and styles, and what a stricter one leaves.

**Renders.** Each host page carries the supplied policy. Does the requester supply the site's own page? Yes: render from a local host page built from it, with that site's stylesheet loaded after the bundle's; a rule of the site's that changes the piece is a finding for `SKILL.md` Step 5, and the placement note names it. No, but its stylesheet is: render from a plain page with that stylesheet loaded after the bundle's, read the same way. Neither: render from a plain page.

**The placement note** is written for the person who places the bundle, in the order they work, under five headings, each a few lines:

- **Who places it**: the person or team the requester named, or else the requester.
- **Where each file goes**: the snippet's place in the page, and the CSS and JS files' paths, with the exact tags that load them.
- **What the site must allow**: the policy the bundle needs.
- **Content added after load**: `window.AxLoop.scan()` for a loop piece, `window.AxOnce.scan()` for a once piece.
- **Who publishes**: whoever publishes the page owns the publish gate, since `experts/Webmaster/` Job 3 sits before a publish this plugin makes, and this one it does not.

Each limit the approver accepted that the placer would meet, a browser not proved for instance, is one line under the heading it touches. Nothing is written into that site's tree and nothing is published, following the gap `skills/Site Author/` declares for a site whose engine is not the kit, and `skills/SEO Assets/` Rules, which hand a foreign site paste-ready files.

**Delivery record:** the files that ship, with a SHA-256 of each; the placement note; the renders; whether a supplied policy admits the bundle.

## A deck slide

**The deck.** `skills/Create Presentation/` holds the deck; this skill makes one slide in it. A deck that does not exist yet, that skill starts and assembles with a placeholder at the slide's position before it runs this skill, so the deck exists here. At the end of Step 4, hand the built slide to `skills/Create Presentation/`, which places it by its third sanctioned edit, replacing any placeholder. The built slide's `section` carries `data-ax-placeholder` until `SKILL.md` Step 7 delivers it, so an unfinished slide is never exported or shared, as that skill's Success requires. Step 5 starts only when the deck holds the built slide, and its Audit is that skill's Step 7 run on the deck, once.

The slide carries what `skills/Create Presentation/` Step 5 requires of every slide: a headline that states a conclusion, and speaker notes in `<aside class="notes">`, both drafted with the words and approved in the same block. The piece's markup, its `<style>` and its `<script>` sit inline in that one slide's `section`, the permission `skills/Create Presentation/` Steps gives one explainer slide on request. The rest of the deck stays on that skill's locked configuration.

**What the engine does there.** It waits for reveal.js to be ready, then plays while its slide is current and every fragment holding it is shown. It never arms in a print view or an export. On a deck whose reveal.js never loaded, it holds its still; whether the deck's shell shows that slide is the deck's matter, outside the footprint, so the render with no JavaScript is the slide's `section` alone, as `build.md` `## Renders` says. reveal.js's scaling changes nothing it draws.

Never wrap the piece in a fragment: it plays when its slide is current, the PNG export shows a slide in its first state, and `skills/Create Presentation/` keeps fragments to a reveal the user asked for.

**Placement.** reveal.js draws its navigation arrows and slide number in the slide's bottom-right corner, where the loop's pause control sits: inset the stage from that corner, or move the control. Text is sized for the room by `skills/Create Presentation/slide-design.md` Typography, never below 16px in the slide's own pixels.

**Exports.** `tools/deck-export/` Rendering's `pdf` prints the finished picture, and its `png` opens the deck with the export query, so the slide holds its still. Does the request or the deck say it must present with no network? Yes, and the deck is new: it starts from `tools/deck-export/` Scaffolding's offline starter. Yes, and the deck exists and loads reveal.js from the network: put the conversion to the requester, which is a new deck from that offline starter carrying the deck's slides. Yes, and it already loads reveal.js locally: nothing to convert. No, or neither says: the deck stays as it is, and the delivery record says whether it loads reveal.js from the network.

**Delivery record:** the deck's path; the slide's position; the PDF and the PNG; both gates' verdicts; findings on other slides or the shell, for the deck's owner.

## A video

**The project.** The piece becomes one project for `tools/video-render/`, in the record folder, shaped as that tool's `TOOL.md` describes a project: one page, laid out at the caller's frame size, holding the piece and nothing else, with the engine's stylesheet and script, the piece's own stylesheet, and every font and image as local files beside it. The piece is built per `build.md` `## Video`: its root on the render clock, its `data-len` the caller's duration, each beat's `data-at` the caller's time for it, and its line overlays in the frame's own pixels.

**The segment.** `tools/video-render/` `render` writes it at the caller's frame size and rate, in the profile the caller names: one to be joined with other footage, or one to stand alone, which its `TOOL.md` names. Not named: ask. The renders `SKILL.md` Step 5 judges are `build.md` `## Renders`' for a video, made from the same project.

**What goes back.** The segment, the project it was rendered from, its decoded-frame hashes, the beat times it used and the text description go back to the skill that ran this one, with the record. This skill uploads nothing, joins nothing, sets no loudness and places nothing.

**Delivery record:** the segment's path, bytes and SHA-256; a SHA-256 of each project file; the frame hashes' path; the frame size, rate and duration; the beat times used; the hold, and what `build.md` `## Video` says of it; the renders and the still; the text description; and that whether each beat lands on the word its narration names is the caller's to judge.
