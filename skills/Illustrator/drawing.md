# Drawing

This file is the one home of the drawing standard for a still picture that explains or illustrates, in which code places the structure and the run draws the things inside it, so the reader recognises the subject before reading a word and can say its point after five seconds. `skills/Illustrator/SKILL.md` reads it at Step 3 (Structure), Step 4 (Draw) and Step 5 (Check).

## The bar

Does the finished picture meet every item below when looking at the renders from `skills/Illustrator/SKILL.md` Step 5.1 (Render, look, fix: up to four rounds)? All hold: it clears the drawing bar. Any fails: name the failed item; it does not clear the bar.

- **Five seconds.** The five-second sentence lands at every width the picture shows at, and every fact it names, a deadline or a count included, is visible as a word or a number, per `## Structure`.
- **Nothing overlaps or is clipped.** Every object and word stays clear and inside the picture at every width, per `## Layouts`.
- **Text floor.** Every word meets the floor at its displayed width, per `## Words on the picture`.
- **Order.** The order reads one way, numbered where `## Structure` requires it.
- **Facts.** Every fact shown is in the sources note and matches it, per `skills/Illustrator/SKILL.md` Step 2 (Truth).
- **Recognisable.** Every pictured thing is recognised before its label is read, per `## Drawing the subject`.
- **Style.** One style holds throughout, per `## Styles`, flat unless a design source asked for an effect, per `## Shadows`.
- **Colour.** Each colour does one job the reader can see, per `## Colour`.
- **Words.** Few words sit on the picture, and its point survives without explanatory sentences, per `## Words on the picture`.
- **Layouts.** The wide layout is laid out at the width it shows at, and the narrow one is re-laid, not shrunk, per `## Layouts`.
- **Defaults.** No entry of `experts/Creative Director/EXPERT.md` Reference, Prohibited Defaults Taxonomy, its Illustration group included, appears on an axis no design source or brief fixed.

Where the requester's own instruction fixed the form and the run drew it, the bar judges that form done well, and the record names what it gives up. The bar is the same on either path and in every style, and a picture that meets every rule below but fails the five-second sentence has failed.

## Structure

**Which structure?** Pick the one the five-second sentence describes:

- **Sequence:** steps in order.
- **Set:** parallel figures or items.
- **Comparison:** things set against one another on shared terms.
- **Hierarchy:** parts arranged in levels, general to specific.
- **Mechanism:** how a physical thing works, one scene with flows.

Does the material's structure fit none of the five, a network or a cycle, say? Yes: use the geometry table in `skills/Visualizer/SKILL.md` Step 2 (Settle the geometry) for its arrangement, on the code-layout path; a picture does not run Visualizer. No: use the chosen structure on the path `## Placing it by code` gives.

**A sequence of four or more steps carries its step numbers**, and its reading path runs one way, left to right or top to bottom, never doubling back or crossing itself. Every fact the five-second sentence names is visible on the picture as a word or a number. The explanation, in sentences, goes in the text description beside the picture, never on it.

## Placing it by code

**Which path?** Two, and the overall layout's positions are never placed by hand on either: hand drawing is for the inside of each object only. Is the destination a skill that moves the picture? Yes: the code-layout path, per `## A picture another skill will move`. No: a sequence, set, comparison or hierarchy takes the template path where a template fits and no person the third branch of `## Drawing the subject`'s People rule draws is in it; a mechanism, or a structure no template fits, takes the code-layout path. Does the template path's library address load? Yes: use that path. No: take the code-layout path with a layout function of the run's own, and record why.

**The template path.** Load the UMD bundle at `https://cdn.jsdelivr.net/npm/@antv/infographic@0.2.20/dist/infographic.min.js`; it exposes `AntVInfographic`, whose class is `AntVInfographic.Infographic`. Pick a registered template from `AntVInfographic.getTemplates()` whose family matches the structure, `sequence-`, `list-`, `compare-` or `hierarchy-`, and whose items fit the facts. Never use `chart-`, whose job is `tools/data/TOOL.md` `chart`, or `relation-`.

Seed `themeConfig` from the design sources settled in `skills/Illustrator/SKILL.md` Inputs: `colorPrimary` is the accent, `colorBg` the ground, `palette` the colour table's role colours, and the type is the design source's font, never the built-in `hand-drawn` theme's. Did a design source ask for an effect? Yes: a template whose name carries `gradient`, or `stylize` of type `pattern`, `linear-gradient` or `radial-gradient`, may carry that effect, per `## Shadows`. No: use none of those. Use `stylize` of type `rough` only for the hand-drawn style, per `## Styles`.

Each `icon` is an icon from `tools/icon-set/TOOL.md` `get`, as a data URI per `## Icons inside a drawing`, never `ref:search:`. A pictured thing goes in an `illus` slot as an SVG the run draws per `## Drawing the subject`, as a data URI encoded the same way.

**Nothing leaves the page but the library itself.** Every icon and illustration is a working data URI, so nothing fails to load and the library never falls back to its remote icon search. Hold that outcome with a `Content-Security-Policy` meta element in the source page's head before its scripts: `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'">`; the page needs no connections for its data, icons or illustrations, and that policy blocks the search even if a resource fails. Does an exported file still reference another file or origin, or miss a resource the page showed? Does the laid-out picture show a person the third branch of `## Drawing the subject`'s People rule draws? Either: the template path has failed; take the code-layout path, and record why.

**The code-layout path.** One HTML source page: declare the objects, their sizes and the flows between them as data at its top; compute their positions with a small layout function, or with D3 at the version and pinned address in `skills/Visualizer/rendering.md` Library-backed HTML; draw the picture as SVG from those positions. Does anything overlap or a flow miss its object? Yes: change the layout function or its parameters, never nudge coordinates by hand, following the rule in `skills/Visualizer/rendering.md` Hand-built HTML for its own libraries. No: keep the computed positions.

## Drawing the subject

**Every pictured thing is drawn as the thing itself**, recognisable before its label is read: a place the five-second sentence names, a branch, a shop or a clinic, has the face of the place itself, its front, its sign or its counter, never only a shelf, frame or box inside it. On the template path it sits in an `illus` slot; on the code-layout path it is a group drawn at its computed position.

Before any layout, write the object list in the record at `skills/Illustrator/SKILL.md` Step 3a (Structure: the object list): every thing and place the five-second sentence names, a destination included, and the other things a reader would point at, each with what it is, its size relative to the others, and its face, the one or two features that distinguish its kind at a glance. Do two kinds look alike at the smallest width? Yes: change a face until each kind reads on its own. No: keep their distinguishing features in every layout.

**An icon or a drawn thing?** An icon marks an item or a step in the structure, or a small sign or detail inside a drawn object, per `## Icons inside a drawing`. A thing or place the five-second sentence names is drawn, never stood in for by an icon: one generic icon per concept with nothing drawn is the icon diagram in `experts/Creative Director/EXPERT.md` Reference, Prohibited Defaults Taxonomy, Illustration.

Inside each drawn object, use one drawing language, matched to the template's own where there is one: one family of stroke weights, each at least 1.5 CSS pixels rendered at the smallest width, round joins and caps by default, one family of corner radii, one way of drawing a fill. Text inside a drawn object, a page, screen or card, is drawn as bars, never letters.

**People.** Is a person a must? A person is drawn only where the five-second sentence cannot be shown without one: it counts people, its action is done to or with a body, or the requester asked for people. A requester's "no people" ends this test: no one is drawn. No person is a must: the scene shows its actors through their things and places, and draws no one. A person the picture still reads without is taken out, and the people drawn are as few as the sentence needs, never added to fill or warm the scene. Where a person is a must, take the first of these that fits:

1. **Counted figures:** equal pictograms from `tools/icon-set/TOOL.md` `get`, one set, one figure per kind counted, as `## Styles` Pictogram says; people counted with roles, ages or groups take a Health Icons figure per kind.
2. **A small figure or a crowd that is not the subject**, about a fifth of the picture's height or less on its widest layout: a pictogram from `tools/icon-set/TOOL.md` `get`, Health Icons (`--set health`) for a person in a role, an age or a group, Phosphor for a posture. One set draws every person in a picture: Health Icons where any needs a role, an age or a group, Phosphor otherwise.
3. **A person who is the subject, or larger than a fifth of the height:** drawn in the picture's own style on the code-layout path, body, clothing and hands as filled shapes, a head about one seventh of their height, a gesture that reads at the smallest width; record why the picture needs them. Never an enlarged pictogram, whose strokes become a stick figure at that size; a figure that reads as a blob or a stick is redrawn.

Does a scene or metaphor carry the subject truthfully? Yes: it may be drawn. It states something the sources do not hold: drop it under `skills/Illustrator/SKILL.md` Step 2 (Truth), whose rules apply to a metaphor's claims too. Check stock metaphors against `experts/Creative Director/EXPERT.md` Reference, Prohibited Defaults Taxonomy, Illustration.

## Icons inside a drawing

`tools/icon-set/TOOL.md` `search` and `get` search its two pinned sets, Phosphor and Health Icons, and write an icon recoloured at a size. Which path places it? **On the template path**, each icon is a data URI: `data:image/svg+xml,` followed by the SVG percent-encoded with `encodeURIComponent`, so a `#` in a colour cannot cut it short. **On the code-layout path**, it is a fragment placed inside the group of the object it belongs to.

- **One weight per picture**, matched to its style: Phosphor `fill` or `duotone` for flat, the second tone a palette colour; `regular` or `light` for line art, its stroke matched to the outline weight at rendered size. Health Icons uses `filled` for flat, `outline` for line art. For another style, pick the weight that matches its drawing language and record it.
- **Colours are the colour table's roles**, passed to the tool, never the set's own.
- **Clear of the face.** An icon on a drawn thing sits beside the part it marks, never over the part that makes the thing recognisable, a wheel, a door or a screen.
- **Recorded:** each icon placed is a line in the record with its name, weight, set and version from its `data-icon` attribute, and the licence line the tool prints.

## A reference picture

**What is the reference?** A picture an image model made for this brief before drawing, or one the requester supplied. Look at it before the structure is picked and again before drawing, for three things only: the composition, what is large, where the eye starts and how the scene is arranged; how each pictured thing can look so it is recognisable; and the mood of the colour.

**What is it not?** **Not the picture:** never embedded, traced, or any of its pixels in a delivered file; everything delivered is drawn in code. **Not a source of facts:** ignore any word, number or step in it; facts come from the sources note only. **Not the palette:** colours come from the design sources; the reference's colours are a mood. The record says in a few lines what was taken from it and what was left out.

**Which prompt does `skills/Illustrator/SKILL.md` Step 3b (Structure: a reference picture) hand to `skills/Media Generator/SKILL.md` Inputs?** This template, with only its three slots filled:

```text
A flat vector-style explanatory illustration, the kind used on a small organisation's website to show how something works at a glance. Subject: {{SENTENCE}}. Show these things, each drawn so it is recognisable at a glance: {{OBJECTS}}. Clear composition with one focal point and an obvious reading path. Colour mood: {{COLOUR_WORDS}}. Simple shapes, clean outlines or flat fills, generous space. No text, no letters, no numbers, no logos, no people unless the subject cannot be shown without one.
```

- **`{{SENTENCE}}`:** the subject as the request states it in one plain clause, not the five-second sentence.
- **`{{OBJECTS}}`:** the things and places the object list names, comma-separated.
- **`{{COLOUR_WORDS}}`:** the design source's colour roles in words, no hex values.

Use the destination's aspect, or 3:2 for a site section; an inexpensive quality setting, since the picture is a guide; one image. Does it contain legible text, or is a thing from the object list missing? Yes: record it, and take from the image only what it shows well. No: use it. One image is made, never a second call.

## Styles

Which style does `skills/Illustrator/SKILL.md` Step 3 (Structure) pick? A design source names one: it fixes the style. None does: use Flat, the default. One style per picture; a mixed part is a defect.

**Flat, the default**

- **What:** shapes filled with solid palette colour, outlined in one weight or not at all, with no depth cue. **When:** almost any subject, and whenever no design source names another style.
- **Rules:** every object is filled, the ground showing only around things; hold the outline weight and express hierarchy by composition and colour. Outlines on the ground with nothing filled are Line art, chosen or not used.

**Line art**

- **What:** outlines in one stroke weight, fill reserved for one accent. **When:** a calm register or many small parts.
- **Rules:** contours and gaps distinguish objects; hold the outline weight and confine fill to the focal accent.

**Map**

- **What:** places as regions or points, routes as paths. **When:** a journey, route, territory or process truthfully told as a trip.
- **Rules:** keep distance and order true wherever claimed; add a legend only for a symbol that is not obvious. A schematic arrangement must not be read as geographic where the sources do not support it.

**Pictogram**

- **What:** counted figures, one figure for one stated quantity. **When:** counts or proportions.
- **Rules:** rows of equal figures carry a count and the unit is a visible word, never a figure scaled up to mean more. **Arithmetic:** draw a part-figure only where the arithmetic gives it, under `skills/Illustrator/SKILL.md` Step 2 (Truth).

**Hand-drawn:** the template path's `rough` rendering with the design source's font, only where a design source or the requester asks for it.

**Isometric:** for a mechanism on the code-layout path, objects on three axes at 30 degrees, all on one grid; each surface takes one of three solid tones of its object's colour, top lightest, one side mid, the other darkest, held across every object.

**Cutaway:** for a mechanism on the code-layout path, the outside outlined and part cut away to reveal the inside in full colour; draw the cut edge as a distinct line. For assembly, an exploded view pulls parts apart along the axis they assemble on.

## Shadows

Flat is the default. Has a design source asked for an effect, following the source order in `skills/Illustrator/SKILL.md` Inputs? No: the picture carries no shadow, gradient, glow, blur or texture. Yes: draw only the effect it asks for; a named style alone does not ask for added effects. A gradient is an effect like a shadow: draw one only where a design source asks for it.

A drop shadow is an option drawn deliberately when asked: use one light direction for the whole picture and one shadow style, with one offset, either hard-edged or with one blur value, never several. Its colour is a darker shade of the surface it falls on, never grey or black laid over at partial opacity. Apply it to one class of objects, never text, lines or the ground; the contrast floor in `## Colour` holds with the shadow in place.

Record the chosen shadow and the source that asked for it among the brief-fixed choices `skills/Illustrator/SKILL.md` Step 5.2 (The Audit, a review) hands the Audit, so it records a brief-fixed match with its justification under `experts/Creative Director/EXPERT.md` Commitments, item 2, and Rules, item 2. Does a shadow have a requesting source? Yes: judge it against that recorded brief. No: it is a finding; remove it.

## Colour

The colours come from the design sources in the order `skills/Illustrator/SKILL.md` Inputs gives; this file owns how they are used, never what they are.

Each colour has one meaning across the whole picture. Before any layout, write a short table in the record with the columns Role, Design-source token or name, and Meaning in this picture; on the template path it seeds the theme per `## Placing it by code`. Reserve one accent for the moment that matters and use it nowhere else. **Is the story one thing's journey through its steps?** Yes: that thing keeps one colour at every step, so the reader follows one thing and never takes it for two. Where that colour is the accent, the accent marks the thing at each step, the one exception to using it once, and the focal moment is carried by size, position and where the lines lead. No: keep the accent for the focal moment. Use the palette the design source gives, its surfaces, neutrals and supporting colours as well as its ground, ink and accent, each with its row in the table; a picture in two colours, where the source offers more, has not made a choice.

Neutrals are tinted toward the palette's hue. Does a design source fix pure white or pure black for ground or ink? Yes: use it there. No: use tinted neutrals, checked against the Color entries of `experts/Creative Director/EXPERT.md` Reference, Prohibited Defaults Taxonomy.

Colour is never the only carrier of meaning: shape, position or a label carries it too. Does every word and every line or shape the reader must see meet `skills/Color Palette Design/SKILL.md` Contrast Requirements? Yes: keep the pairings. No: adjust the design source's colour for this picture until it passes, and record the adjustment.

## Words on the picture

Few words sit on the picture, in the bound `voice`. A label names a thing in one to four words beside what it labels, per `skills/Visualizer/SKILL.md` Step 5 (Build it); labels also carry the sources note's facts as short words or numbers. The explanation goes in the text description. Does the picture need its sentences to carry its point? Yes: it has failed the bar; move the explanation out and redraw until the picture carries it. No: keep only the labels the reader needs.

In an infographic, figures are the largest words, each with a label that says what it counts in the words of the five-second sentence, and they read in that sentence's order. Each figure drawn as a size, whether a bar, an area or a count of figures, is in true proportion to the numbers under `skills/Illustrator/SKILL.md` Step 2 (Truth). The type comes from the design sources.

**The text floor**, at the picture's displayed width: on a page, no word under 14 CSS pixels at 390 wide, none under 12 at 320, and in the wide layout none under 14 at its smallest displayed width, where the narrow layout takes over; on a slide, no word under 16 pixels in the slide's own pixels, per `skills/Create Presentation/slide-design.md` Typography. Does a label fall below its floor? Yes: enlarge it, move it to the text description or redo the layout; never shrink the type past the floor. No: keep its size.

Check the floor at each layout's smallest displayed width with this formula:

`rendered size = size in drawing units × (rendered width ÷ drawing width in units)`

Every visible word is in the file's markup as text, never drawn as shapes; on the template path the library sets it as HTML text inside `foreignObject`, which counts.

## Layouts

Which layouts does the destination need?

- **A page section:** a wide layout in the section's aspect, laid out at the width `skills/Illustrator/SKILL.md` Step 1 (Frame) recorded, the box the picture fills in its section, never the window's width or the reading column of running text; and a narrow layout re-laid for a 390-wide phone, not shrunk. On the template path, use a template of the same structure whose items stack; on the code-layout path, use a second layout function. The narrow layout takes over where the column falls below about 600 CSS pixels, and the placement note names the window width at which that happens. In the narrow layout each step's number and name sit with its drawing: a stacked template that sets them in a column of their own, apart from the drawing, is not used; take one that keeps them together, or the code-layout path.
- **A slide:** the slide's own size.
- **An image file:** the sizes `skills/Illustrator/SKILL.md` Step 1 (Frame) recorded.
- **A picture another skill will move:** the layouts that skill asks for.

The narrow layout is recomposed, not shrunk: keep the same objects and story, rearranged for the tall frame, with its own drawing width so the text floor holds. Does the wide arrangement fit the narrow frame with the floors intact? Yes: still compose it for that frame. No: turn a row into a column or crop a wide scene to its focal part and move the rest below. Shrinking the wide picture until its words fall below the floor is the defect this prevents.

Check each layout at the widths where it shows through the renders in `skills/Illustrator/SKILL.md` Step 5.1 (Render, look, fix: up to four rounds), including overlap, clipping and the text floor.

## The file

**The source page** is the master: one HTML file per picture in the record folder, holding the data, the colour table's roles and the theme at its top, the pinned library addresses, the layout, and the `Content-Security-Policy` meta element `## Placing it by code` names. A change to the picture is made there and exported again.

**The delivered picture** is one SVG per layout exported from it, with its own drawing units in a `viewBox`. Which path made it? The template path: use the instance's `toDataURL` with `type: 'svg'`, which returns a standalone SVG as a data URL with resources embedded by default, and decode it into the file. The code-layout path: serialise the page's SVG element after layout. The delivered SVG holds no script, no reference to another file or origin, and no embedded raster unless the source material supplies one, a reference picture's pixels never. It carries `role="img"` and a `<title>`, added where the export lacks them; the text description beside it is the full explanation, the text alternative.

Prefer no ids; every id that is needed is prefixed with the picture's own name, since ids are global on a page where two pictures may sit.

**Colours.** The source page's top is the one place the colour roles are set. The code-layout path writes each into the SVG as a custom property named for its role, set once on its root; the template path's export carries them as values. **On a deck slide, which pictures follow the deck by themselves?** A code-layout picture on a deck whose `:root` carries brand properties: each role property's value is `var()` of the brand property its colour came from, with that colour as the fallback, so a change to the deck's look reaches it with no new run. Every other picture on a deck, a template-path export or a picture on a brand template with no custom properties, carries its colours as values. A change to a design source, a deck's look included, that does not reach a picture by itself is made at the top of its source page and the picture exported again: whichever skill makes that change runs `skills/Illustrator/` again by name as a revision naming it, through `skills/Animated Explainer/` for a moving picture.

An SVG shown through an `img` element does not load the page's web fonts, so its words render in a fallback. Which way is it shown? Inline in the page or slide: the page's fonts apply. As a file through `img`, or handed over as an image file: deliver PNG renders of each layout at 1x and 2x its displayed size beside the SVG, rendered through `tools/render/TOOL.md` `html` from a wrapper page in the record folder that places the SVG inline and loads its fonts by `@font-face`, since `svg` loads only what the SVG itself references, and record which file is placed. The font files come from the design source or the destination, read in place. A font the design source names without supplying files, which a public font service serves, is loaded from that service when the picture is drawn, as the layout libraries are, its address recorded, and the renders use it. A font the run cannot reach is no stop: render in the fallback and record the font, the fallback used and the file still owed; `skills/Illustrator/SKILL.md` Step 6 (Approve), or the moving skill's Approve, names them.

Render a picture alone through the wrapper page above with `tools/render/TOOL.md` `html`, and a picture in its page or slide through `tools/Browser Control/TOOL.md` Session State. Each capture is a new file, its address cache-busted, saved in the record folder.

**The export holds** when each exported SVG, rendered alone in that wrapper page, shows the same objects, words and positions as the source page at the same width. Does it differ? Yes: fix the source or export and render again before delivery. No: the export holds.

## A picture another skill will move

When `skills/Illustrator/SKILL.md` Step 1 (Frame) records that a skill which moves pictures will take this one, draw it on the code-layout path only, never export it from a template, since a template's markup does not keep one group per object. The drawing keeps these rules so that skill can move it without changing a drawn shape. The moving skill adds its own engine markup, which is its own and is not listed here.

- **Objects.** One group per object that may move, each a `g` element with its own class prefixed with the picture's name.
- **Positions.** Every object is at its finished position in the markup; the file as delivered is the end state of any motion.
- **Anchors.** A line anchors to an object that stays still; an object the moving skill's Frame says will move is never an anchor. No `transform` attribute on a shape a line anchors to or on its ancestor groups; every line's end is computed in the drawing's units from the finished positions.
- **Lines.** Every line is a `path` whose `d` is its finished shape.
- **Colours.** Custom properties, as `## The file` specifies for the code-layout path.
- **Words.** Text in the markup, as `## Words on the picture` says.
- **Layouts.** Each a separate drawing, as `## Layouts` says.

Nothing else in this file changes for a picture that will move; the bar is judged on the still.

## Pitfalls

The skill's process pitfalls are in `skills/Illustrator/SKILL.md` Pitfalls, clarification included; these are the drawing's.

- **A plain picture.** Labelled boxes stand in for a subject with a look of its own: draw its things in the structure, per `## Drawing the subject`.
- **An icon diagram.** Icons stand in for the things the five-second sentence names: draw those things, per `## Drawing the subject`.
- **Coordinates placed by hand.** An overlap nudged away: change the layout function or the template, per `## Placing it by code`.
- **A template forced on a mechanism.** Take the code-layout path.
- **The remote icon search reached.** Give every icon as a data URI and hold the page's policy, per `## Placing it by code`.
- **The wide picture laid out at the window's width.** Lay it out at the width Frame recorded, per `## Layouts`.
- **The wide picture shrunk for the phone.** Re-lay the narrow layout.
- **A phone step apart from its drawing.** Keep its number and name with the drawing, per `## Layouts`.
- **An icon over a thing's face.** Move it beside the part it marks, per `## Icons inside a drawing`.
- **A fact in the sentence not on the picture.** Add it as a word or a number.
- **Kinds that look alike.** Change a face until each kind reads alone at the smallest width.
- **A style mixed.** Redraw the odd part in the picked style.
- **A shadow or gradient no source asked for.** Remove it.
- **Colour as decoration.** Give it a meaning in the colour table or remove it.
- **One thing in two colours.** The thing whose journey the story follows keeps one colour at every step.
- **A picture that needs its words.** Move the explanation to the text description and redraw until the picture carries the point.
- **A proportion drawn by eye.** Draw it from the numbers.
- **Words drawn as shapes.** Put them back as text.
- **A reference picture's pixels shipped.** Redraw the part in code.
- **A person nobody needs.** A figure added to fill or warm the scene: take it out and let the things carry it, per `## Drawing the subject`'s People rule.
- **A pictogram enlarged into the subject.** Take the person out, or where one is a must, draw them per `## Drawing the subject`'s People rule.
