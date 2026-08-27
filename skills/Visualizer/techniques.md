# Techniques

The seven geometries, read one at a time at step 3 of `SKILL.md`. Each entry gives the structure it fits, how it is laid out, what it must label, the ceiling above which it stops working, and the mistakes that break it. The universal rules in step 5 hold on top of every entry here and are not repeated.

## Flow

**Fits** steps that happen in order, decisions that branch the path, a process with a start and an end. Not concepts without sequence, which is Concept Map, and not nesting without flow, which is Hierarchy.

**Layout.** One direction throughout, top to bottom by default and left to right when steps carry substantial text. Rectangles for actions, diamonds for decisions, rounded shapes for the start and the end. Equal spacing between sequential steps, branches spread across the perpendicular axis, merge points drawn explicitly. Crossing lines mean the flow is too complex for one view or laid out wrong.

**Labels.** Every step is a verb phrase naming the action. Every branch out of a decision names the condition that leads there, either the yes and no or the actual test.

**Ceiling.** Fifteen to twenty nodes. Above it, lift the detail into sub-process nodes that expand on click and show the overview flow first. Parallel actors get swimlanes with their synchronization points marked.

**Breaks it.** More than two or three branches from one decision, which reads as noise; break it into sequential checks. An unlabeled branch. No visible start or end, leaving the reader unsure where to begin. Sequence imposed on material that has none.

## Hierarchy

**Fits** parent and child, levels of abstraction from general to specific, parts composing a whole, taxonomies. Not cross-connections between branches, which is Concept Map, and not sequence, which is Flow.

**Layout.** Top down by default, left to right when nodes carry long text, radial when the tree is wide and compactness matters more than reading ease. Depth position means level of abstraction and lateral position means sibling; siblings at one level sit at equal spacing. One node shape throughout, size stepping down by level.

**Labels.** Every node is named. Levels are distinguished visually by size, weight, or color rather than by an added legend.

**Ceiling.** Five to nine children per parent, four to five levels visible at once. Above either, collapse by default, mark collapsed branches with a count, and expand on click. A tree far past both is two diagrams.

**Breaks it.** Ten children under one parent, which forces scanning; introduce intermediate categories. Six levels shown at once. Branches at wildly different depths, which usually means some content sits at the wrong altitude. Items in different branches that need to connect, which means the geometry is wrong.

## Concept Map

**Fits** several concepts connecting in several directions where no single hierarchy dominates and the cross-connections carry as much meaning as the groupings. Not a single dominant concept, which is Mind Map, and not a clean set of levels, which is Hierarchy.

**Layout.** Proximity encodes relationship strength: strongly related concepts sit close, conceptual groups form visible clusters, the most-connected concept sits centrally and supporting concepts sit at the periphery. Curve lines to avoid crossings. Line weight may encode strength; arrowheads appear only where the relationship has a direction.

**Labels.** Every connection carries a verb saying what the relationship is: enables, requires, contradicts, leads to, depends on, is an example of. "Relates to" and "connected" say nothing and fail this check.

**Ceiling.** Fifteen to twenty nodes in one view. Above it, collapse clusters and expand them on click, or split into linked diagrams and zoom between overview and detail.

**Breaks it.** Any unlabeled connection. Every node connected to every other, which shows density instead of structure; keep the primary relationships visible and put the rest behind interaction. Random placement, which forces the reader to hold relationships in mind that the layout could have shown. A color meaning one thing in one region and another elsewhere.

## Mind Map

**Fits** one central concept with ideas branching outward, where relatedness is associative and shown by grouping rather than stated by labeled links. Not several central concepts and not explicit relationships, both of which are Concept Map.

**Layout.** Radial and nothing else: the center holds the subject, main branches radiate, sub-branches extend from them. Radial matters because it refuses the false linearity an outline imposes, lets each branch grow at its own rate, and encodes relatedness as proximity. Curved branches, space between them, branch color by category, thickness and text size falling with depth.

**Labels.** Keywords, one to three words, not sentences. The center states the scope in a phrase.

**Ceiling.** Five to seven main branches, three to five sub-branches each. Above it, collapse sub-branches by default and expand on click, or split into linked maps.

**Breaks it.** A top-to-bottom or left-to-right arrangement, which discards the whole point. More than seven main branches. Full sentences on branches. Reaching for "causes" or "leads to" labels, which means the material wanted a Concept Map. Every branch styled identically, leaving no visible hierarchy.

## Matrix

**Fits** items compared across two independent dimensions, where position carries meaning and the pattern across many items is the finding. Not more than two primary dimensions, not sequence, not nesting.

**Layout.** Three shapes. A quadrant splits two dimensions into high and low and gives each of the four regions a meaning. A comparison table puts items in rows, criteria in columns, and an assessment in each cell. A positioning scatter places items at real values on two continuous dimensions and shows clusters and gaps. Whichever shape, the two dimensions must be independent of each other.

**Labels.** Both axes name what they measure and which direction means more. Each quadrant carries a name conveying what sitting there means. Every item is identifiable. In a comparison table, the rating scale is stated.

**Ceiling.** Fifteen to twenty items in one view, two primary dimensions with a third available through color or size, five to seven criteria in a comparison table. Above it, filter by category, split into several matrices, or zoom into regions.

**Breaks it.** Two axes measuring nearly the same thing, which yields a diagonal and no insight. Unlabeled quadrants, which leave position meaningless. Fifty ungrouped items. An inconsistent scale where up means good on one axis and bad on the other. A decision matrix that never says what a high score implies for the decision.

## Fishbone

**Fits** one effect with multiple contributing factors that group into categories, where systematic cause analysis is the goal. Not solutions, which this geometry cannot express, not sequence, and not relationships without a central effect.

**Layout.** The effect sits in the head at one end, a spine runs to it, major bones angle off the spine for cause categories, minor bones branch from those for specific causes, and sub-bones carry root causes behind an expansion. Bones alternate above and below the spine at a consistent angle. Common category sets are people, machine, method, material, measurement, and environment, or a set the domain actually uses; adapt rather than forcing the standard six.

**Labels.** The head states the effect as a sentence. Major bones name categories. Minor bones name specific causes, phrased as causes rather than symptoms and specific enough to investigate.

**Ceiling.** Four to six categories, three to five causes each. Above it, group causes and put the sub-bones behind expansion.

**Breaks it.** Symptoms written where causes belong. Every cause landing in one category, which means either the categories are wrong or the problem is simpler than assumed. Stopping at surface causes instead of asking why down each bone. Causes with no evidence and no mark distinguishing confirmed from hypothesized. Using it to propose fixes.

## Timeline

**Fits** events, phases, or milestones in temporal order, where when and how long carry the meaning. Not a process with no time dimension, which is Flow, and not cause and effect, which is Fishbone or Concept Map.

**Layout.** Horizontal for most, vertical when the timeline is long and the destination scrolls. A marked scale whose consistent spacing means consistent intervals, with major ticks at significant periods and a now marker where the timeline is live. Points for moments, bars for durations, position for when and length for how long. Several streams get parallel labeled lanes with the dependencies between them drawn.

**Labels.** The scale states what its intervals are. Every event carries a name and a date. Every duration carries its start, its end, and what the period is. Dependencies name what must precede what.

**Ceiling.** Fifteen to twenty events in view. Above it, zoom between period scales, filter by stream, or collapse minor events behind the major milestones. Dense clusters stack vertically or move into callouts.

**Breaks it.** A scale that changes without saying so, which misleads about duration. Fifty events at identical visual weight. No time markers, leaving the reader unable to orient. A long-running item marked only at its start.
