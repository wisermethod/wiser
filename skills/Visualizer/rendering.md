# Rendering

The three media and how each is built, read at step 4 of `SKILL.md`. The medium is chosen there; this file says how to produce it.

## Library-backed HTML

The default. One self-contained HTML file with inline CSS, inline data, and the layout library loaded from a pinned CDN. The library computes node positions and connection endpoints, which is the part that fails when it is done by hand and keeps failing as the diagram grows: the author supplies structure, the library supplies coordinates.

**Network dependency.** The produced file loads its library over the network when it is opened. It is not an offline bundle, and it needs no server, no build step, and no installation. A diagram that must open with no network is built by hand instead, per the next section.

| Technique | Library | Pinned version | Loaded as |
|-----------|---------|----------------|-----------|
| Concept Map | Cytoscape.js, plus cytoscape-svg for export | 3.28.1, 0.4.0 | `https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js` and `https://cdnjs.cloudflare.com/ajax/libs/cytoscape-svg/0.4.0/cytoscape-svg.min.js` |
| Flow | Dagre for layout, D3 for rendering | 0.8.5, 7.8.5 | `https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js` and `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js` |
| Hierarchy | D3 tree layout | 7.8.5 | `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js` |
| Mind Map | D3 radial tree layout | 7.8.5 | as above |
| Fishbone | D3, custom layout | 7.8.5 | as above |
| Timeline | vis-timeline, script and stylesheet | 7.7.3 | `https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js` and the matching `.min.css` |
| Matrix | none, CSS Grid carries it | not applicable | not applicable |

**Always pin the version.** An unpinned URL lets a major release change the API under a file that was working. When a library's call signature is uncertain, read that library's own current documentation rather than working from memory or from a version pinned here; a version in this table is what was proven, not a claim about what is current.

**Separate the data from the machinery.** Put the structure in named declarations at the top of the file, marked as the part to edit, and keep the rendering code below untouched by content. Changing what the diagram says then means editing a list, not recalculating a layout.

The shape each library expects:

- Cytoscape: a list of nodes carrying an id, a label, a category, and a description for the tooltip; a list of edges carrying a source id, a target id, and the relationship label; a category-to-color map that also builds the legend. Elements are handed to `cytoscape()` with a style array and a layout; `cose` is the force-directed default, and offering a layout selector lets the reader try hierarchical, circular, and grid without a rebuild.
- Dagre with D3: nodes carrying an id, a label, and a type of start, process, decision, or end; edges carrying from, to, and an optional branch label. Set `rankdir` for direction and `nodesep` and `ranksep` for spacing on the graph, call `dagre.layout()`, then draw from the coordinates it wrote onto the nodes.
- D3 tree and radial tree: one nested object of name and children. `d3.hierarchy()` wraps it and `d3.tree()` lays it out, sized by node for a vertical or horizontal tree and sized across a full turn for a radial one, with a separation function that spaces cousins wider than siblings.
- vis-timeline: a list of groups for the lanes, and a list of items each carrying an id, its group, its content, a start, an end for a range, and a type of point, box, or range. Milestones and phases are distinguished by class, not by type alone.

**Export.** Every technique except Timeline and Matrix exports the rendered diagram to a standalone SVG through a button on the page: for Cytoscape through the svg extension, elsewhere by serializing the live SVG node with its computed styles inlined so the file carries its own appearance, then downloading it as a blob. Timeline renders to HTML and canvas rather than to one SVG node and has no SVG export.

**Check the rendered file.** Open it and exercise what the diagram promises: expansion, hover text, zoom, and layout switching where offered. `tools/Browser Control/` drives that check. A diagram whose interactions were never opened is unverified, and the cognitive-fit read at step 6 of `SKILL.md` cannot be done from source.

## Hand-built HTML

For a diagram that must open with no network, and for the Matrix, which needs no library at all.

One file, inline CSS, inline JavaScript, nothing external. Define the palette, the spacing steps, and the type sizes as custom properties at the top and use them throughout, so a change to the look is one edit. Visual hierarchy comes from size, weight, and color, not from decoration.

Per technique: a hierarchy is nested elements with indentation; a flow is positioned nodes with an SVG layer behind them carrying the lines and arrowheads; a concept map is a single SVG with connections drawn before nodes so nodes sit on top; a matrix is CSS Grid, with the axis labels in the outer tracks and the quadrants or cells in the inner ones.

Interactions worth having: expand and collapse driven by a class rather than by inline display values, hover detail from a data attribute rendered through a pseudo-element, and zoom applied as a transform with the origin set so the layout does not jump. Where tooltips clip, the parent is clipping them.

Beyond a handful of elements, hand-positioned coordinates drift and arrows stop landing. That is the signal to go back to step 4 and take the library, not to nudge the numbers.

## Mermaid

For output that embeds in a markdown document, and for diagrams small enough that setting up a library is the larger cost. The output is a fenced `mermaid` block, which renders in most markdown viewers and in a plain HTML page that loads the Mermaid script.

What it can carry:

| Technique | Mermaid |
|-----------|---------|
| Flow | Its strongest case. Direction, node shapes for actions, decisions, and terminals, and labeled branches |
| Hierarchy | Works as a directed graph drawn top down |
| Timeline | Works through the timeline syntax, without durations or lanes |
| Mind Map | Limited, through the mindmap syntax |
| Concept Map | Poor. Subgraphs group, but cross-connections tangle |
| Matrix | Not expressible |
| Fishbone | Not expressible |

Its limits are structural rather than stylistic: the diagram is static, so expansion, hover detail, and zoom are unavailable; layout is automatic, so precise placement is not possible; and past fifteen to twenty connected nodes the result is unreadable. When the destination needs any of those, the answer is HTML, and the medium decision at step 4 was made against the wrong destination.

Failures are almost always syntax: a missing bracket or arrow stops the parse, and a long label breaks the layout rather than wrapping. When a diagram will not render, verify the syntax against Mermaid's own current documentation for the version the viewer runs.
