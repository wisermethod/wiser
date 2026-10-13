# Sketch file

The contract for the one file the skill writes, and its only field list.

A register is one in Sourcing Registers in `standards/conventions.md`. A label is one in Evidence Labels there. This format adds neither. Dates are absolute, per Dates in `standards/conventions.md`.

## File name

The home supplies the directory. The file name is the family name, a hyphen, the given name, lower case, `.md`. A space becomes a hyphen. A character Names in `standards/conventions.md` forbids is dropped. An accented letter becomes its plain ASCII letter. Where the family name is not the last word, or the order is unclear: ask. Never guess.

A collision appends a hyphen and the current organization, normalized the same way. Still a collision, or no organization: ask for a name.

## Title and headings

The title is `# Bio sketch: <name as given>`.

When `status` is `draft`, `Missing:` is the line Status states. `Missing` is not a claim and carries no register.

Base headings, in order, each with at least one line: Identity; The ask; Role; Standing and fit; Record; Routes; Assessment (subheadings What they care about, What motivates a yes, What never to do); Supplied records; Open gaps.

Extension headings follow the base, in the order Which extensions apply? in `SKILL.md` states. Within one extension, declared order. A base heading has no owner suffix. Every extension heading is `## <Heading> (<extension>@<version>)`.

## The ask

The ask line quotes the requester or the declaring file: the ask, its date, and who stated it. It is not a claim about the person and carries no register.

`- <the ask>. Stated by: <the requester, or the path>. As of: YYYY-MM-DD.`

Where no ask was stated, the line is `Not available: no ask was stated`, with its as-of date and no register.

## Lines

A fact uses this shape. Omit optional parts. Keep this order.

```
- <value>. Source: <source>. Register: <register>. As of: YYYY-MM-DD. Kind: <statement, report, or sighting>. Label: <label>. Read: <fetch, archive, or browser>. Superseded YYYY-MM-DD: <the later evidence>.
```

An absent reading uses this shape. The reason is one clause saying why the field is empty, and states no fact about the person, no figure, no count, and nothing a sighting line holds. Each way tried and its outcome go on `Read:` alone, in a word each (for example `Read: fetch refused, browser captcha not completed`).

```
- Not available: <reason>. As of: YYYY-MM-DD. Read: <ways tried, or not read>.
```

`Kind: statement`: the person or their organization said it. `Kind: report`: a publication independent of the person states it in its own dated reporting. `Kind: sighting`: a page listed it. Omit `Kind` otherwise. Omit `Read` when not from a page. `Label` only on a figure or a `Supplied:` line. A superseded fact keeps source, register, and as-of date, and adds `Superseded` once. Do not delete it.

Which as-of date? Take the first match.

- A record item whose source states a publication date. That date. With none, it is not a dated item.
- A statement or report whose source states its date. That date. A statement takes the date it was made. A report takes the date of its reporting.
- A statement or report on a page read this run whose source states no date, and this run's day is within the staleness number of the as-of date. The run's as-of date, with `Read:` naming how it was read.
- Such a page read later than that. It establishes nothing at the as-of date; the field is `not found in the sources read`.
- A sighting. The source's date, else the file's capture date, else the run's as-of date. The capture date and the run's as-of date never date a record item.
- A `Research inference`. The latest date among the dated items it names.
- A supplied value. The pull date its record states. None stated: the run's as-of date, and the line's source part adds `pull date not stated`.
- None of these. `Not available: the source states no date`.

## Figures

A figure is a counted or measured quantity: a count, an amount, a rate, a share, a score, a tier, or a rank. A date, a year, a quarter, a duration quoted in the ask or a title, and a number that is part of a name are not figures. A tenure, such as a first year, is one.

Every figure in the file carries its label in place: a fact line, a record item, an assessment, an extension's line, and a figure quoted inside a title, whose line's `Label` carries it. No figure label applies to the ask line. The base derives no combined score and no tier; a supplied one stays a `Supplied:` line. An extension may declare one only as a derived figure labelled `Estimated: <method>`, the method naming every signal it combines. Any other label follows What does each field do? in `SKILL.md`.

Which label? Take the first match.

- Derived from sourced inputs, and the method is stated, a by-eye read included. `Estimated: <method>`.
- Not obtained, and not derived as above. `Not available: <reason>`.
- The person reports the figure about themselves, and no source independent of the person confirms it. `Unverified: requires confirmation`. Never `Verified` on their own word.
- Two sources that do not trace to one original state different figures. Both, each `Unverified: requires confirmation`. Open gaps names the conflict.
- Those two state the same figure. `Verified`.
- One source. `Unverified: requires confirmation`.

## Front matter

Front matter is flat, per `standards/primitives.md` Frontmatter. A projection is copied from its body line on every write, and never edited alone.

`schema: bio-sketch`. `schema_version: 1`. `file`. `status`: `draft` or `complete`. `created` and `last_verified`: YYYY-MM-DD. `staleness_days`. `staleness_source`. `ask_date`: YYYY-MM-DD. `extensions`: a dash-list of `<name>@<version>, declared by <path or skill>`. `declared by` names the calling skill where a skill handed it, otherwise the path of the handed file or of the declaring `AGENTS.md`. Projections: `standing`, `fit`, `fit_reason`.

`staleness_days` and `staleness_source` follow What is the as-of date, and what staleness applies? in `SKILL.md`.

Omit `ask_date` where no ask was stated. Omit `extensions` when no extension applied.

A `Not available` fit copies as `not-assessed`. No code copies as `none`.

`created` is the first write's date and never changes. Converting a file of another shape is a first write: `file` is its existing name, and `created` and `last_verified` are this run's as-of date. A file already in this format keeps its `file`. `last_verified` is the as-of date of the last run that changed a fact. No fact changed, a shape repair included, leaves both.

An extension marker carries its prefix. A record marker is a database identifier and also stands on a `Supplied:` line. A projection names the line it copies. Anything else goes in the body.

## Status

`status` is `complete` only when all of these hold. A `Not available` line does not count as present.

- Identity holds a `Name:` line and two `Anchor:` lines.
- Role holds an in-force `Role statement:` line. A sighting does not count.
- Record holds at least one dated item.
- `Fit:` is assessed for the recorded ask. `not-assessed` and `Not available` are not assessed.
- Every field an applied extension marks required is present. A refused field is not required.

Otherwise `status` is `draft`, and `Missing:` names each absent item. An extension's own bar never lowers this one.

## Identity

- `Name:` the professional name.
- `Also known as:` each public variant, where there is one.
- `Anchor:` each fact that ties this file to one person (an employer, a location, a published profile, an email domain, or a bio's text). At least two.
- `Not to be confused with:` each namesake ruled out on any page, a search result included. Only what separates the two: name form, organization, field, or place. The source names the address only. The excerpt is that result's title and text, as the package returned them, `Kind: sighting`, kept for the gate, not the file. Never only in Open gaps. Omit the token where none was ruled out.

## Role

One event per line, naming the organization. `Kind` on every line. Tokens: `Role statement:`, `Role sighting:`, `Former role:`, `Departure:`, `Return:`, `Retirement:`, `Move:`. A `Role statement:` rests on `Kind: statement` or `Kind: report`. A sighting never does.

An event is written only where the evidence shows it. No `Not available` line for an event not found. No `Role statement:` leaves one `Not available` line for that token.

Within one organization, a later line, except a `Role sighting:`, supersedes an earlier one only where it updates that role or says it ended or was replaced. An additional role stands beside it. A line at one organization never supersedes a line at another unless its evidence says the earlier role ended or was replaced (a `Departure:`, a `Move:`, a `Former role:`). Where more than one role is in force, the in-force role line is the one in the work the ask needs; none in that work, the latest. Two statements or reports that cannot be ordered leave the field unresolved; at one organization, either is the in-force line. Only the `Role statement:` that would otherwise be the in-force line, never a superseded or other line, is not in force when dated more than 365 days before the as-of date and a later `Role sighting:` names another organization. The field is unresolved, and Open gaps names it conflicting, naming the two lines.

## Record

`Item:` the title as the source states it, the venue or organization, and what it covered where the source states that. Items are the person's professional public work: pieces, talks, filings, announced deals, and posts about their work.

An item counts only with a title, a date, and a venue. An author page, a section index, or a publication's own listing that states those three is that item's source, `Kind: statement` when the venue publishes the listing. The piece itself need not be fetched. Keep the latest that count, at most ten. Fewer than five: keep each. None: one `Not available` line.

## Routes

`Route:` a route the person or their organization published for reaching them for this kind of ask, or one a database built for that purpose lists. A database route is a sighting and names the database. Never a home address, or a route shown only in a personal capacity. Do not repeat one.

`Route works:` only where a statement says the route works. No `Not available` line because that statement was not found.

Where no route qualifies, one `Not available` line names why.

## Standing and fit

One `Standing:` line. It names the in-force Role line and does not restate it. Source, register, and as-of date are that line's. For `deceased`, the notice's excerpt that states the death, and nothing else.

Which standing? Take the first match.

- A statement or a report that sets `deceased`, below. `deceased`.
- The in-force line is a `Retirement:`. `retired`.
- The in-force line is a `Role statement:` or a `Return:`. `active`.
- The in-force line is a `Departure:`, a `Former role:`, or a `Move:`. `left-role`.
- No in-force line, or the field is unresolved. `unknown`.

One `Fit:` line for the recorded ask. Where it is not `approach`, it carries a reason code and names the statement or report the code rests on. Register `Research inference`, except the no-ask line, which is not a verdict.

Set a code only where the ask needs what the code says is missing. An extension may add codes. One fact sets one code: where it fits more than one of `vendor`, `left_field`, and `non_practitioner`, the first in that order.

- `left_field`: the in-force role is outside the work the ask needs.
- `retired`: the in-force role line is a `Retirement:`.
- `deceased`: the person's organization, or a news report, states that the person has died.
- `vendor`: they work for a company that sells a product or service, and their public work is that company's marketing, where the ask needs someone independent of it.
- `non_practitioner`: the in-force role does not do the work the ask needs (operations, producing content the venue labels paid or sponsored, a masthead or a desk that does not create the work).

What sets a code is an in-force Role line with `Kind: statement` or `Kind: report`, or for `deceased` its own excerpt. An extension's code rests on the in-force line of the token that extension declares for it, under that `Kind` rule. The base codes keep resting on the Role line. A sighting, a supplied value, a `Research inference`, a record item alone, or one piece labelled paid or sponsored never sets one. Geography and fit to one program's list are not codes.

Read this run only where the package or a browser read holds the excerpt. Carried from the existing file does not count, even when that file was handed over as source material.

Which code is in force? Take the first match.

- A reading or a carried line that sets `deceased`, with no dated correction or retraction. `deceased`.
- A carried code that nothing in What supersedes a code? supersedes. That code stays.
- A reading that sets one code, in the order above. That code.
- A reading of the role that shows no code. Write `No code was found in the sources read.` only in this case.
- No such reading, and no carried code still in force. `Not available: no source was read this run that could show a reason code`.

Which fit? Take the first match.

- No ask was stated. The line The ask states.
- The code in force is an applied extension's code that names `approach-with-care`. That verdict, the code, and the line.
- Any other code is in force. `do-not-approach`, the code, and the line.
- The role was read and no code is in force. `approach`, naming that line.
- No such reading, and no carried code still in force. `not-assessed`, and the code match's `Not available` line.

Read a code again when its line is dropped or narrowed: set what remains, and drop what it no longer shows. A later-role match fires only where the ask names that work. What supersedes a code? Take the first match.

- The line it rests on is superseded. The code goes with it.
- `retired` or `left_field`: a later `Return:` or `Role statement:` in that work.
- `vendor` or `non_practitioner`: a later `Role statement:` in that work.
- A dated correction or retraction by the source the code rests on, `deceased` included.
- `deceased`, and no such correction or retraction. Nothing else supersedes it.
- None of these. The code stays.

## Assessment

Each subheading holds at least one line. No ask: the line The ask states. Otherwise `Research inference` lines, each naming the dated items it rests on and claiming only what they show. With none, one `Not available` line names what was missing. On an update, a re-derived inference on the same subject supersedes the carried line, as Lines states.

## Supplied records

A supplied record (a CSV row, a database stub, a bio, or an older sketch) is a claim, never a source, per Step 2 of `skills/Profile Page/`.

Every leaf value, a nested one included, is a `Supplied:` line, register `Secondhand`, naming the relay and its pull date, or is named as not carried. It never fills standing, fit, a role statement, or an assessment. Every `Supplied:` line carries `Label: Unverified: requires confirmation`.

A leaf that is a route to the person (an email, a phone, a profile) goes under Routes as a sighting naming the database, within Routes' limits, and not again under Supplied records. One Routes' limits shut out is named as not carried, by category. Any other not carried, named by its field and never its value: an empty or unknown field, a repeat, or what the file never holds, that last as Open gaps states.

A skipped route is a line about the run, not the person, with no register: `- Route skipped: <the route>, <why>. As of: YYYY-MM-DD.` Nothing supplied and nothing skipped: one `Not available` line says no record was supplied.

## Open gaps

One line per field. A line that fits none of these reasons is not a gap line.

`- <heading>: <token or field>: <reason>. As of: YYYY-MM-DD.`

The token or field is a name only, with no value, date, figure, or source.

The reason is exactly one of: not found in the sources read; conflicting, naming the two lines by heading and token; not refreshed past staleness; not gathered after the early stop; refused by name; extension not refreshed; version changed from <old> to <new>; fewer than two anchors; personal-life material was removed; dropped for want of a source; rests on a source the gate found weak.

A personal-life reason repeats nothing of the content. Nothing to name: `None as of YYYY-MM-DD.`

## Currency

An organization is current when its in-force role line is a `Role statement:` or a `Return:`, or a dated item there falls within 365 days of the as-of date, or the ask names it. A dated `Kind: report` counts as a statement does. A sighting does not. An unresolved field is not current. A page that lists the person, other than their organization's own, is a sighting, never the in-force role.

The currency fields are the in-force role, standing, and each `Route works:`. Each carries its own source and as-of date. Past staleness, Open gaps names an unrefreshed one. `status`, `last_verified`, and a dated item elsewhere do not refresh one.

## What the file never holds

The file never holds, about anyone, family, health, grief, home life, relationships, or anything shared in a personal capacity, and no assessment rests on them.

A `deceased` line holds the code, its source, and its date, and nothing else from the notice.

A piece is first-person where its title, deck, or listing says the person writes about their own body, health, family, home, or relationships. A title that itself holds such material is not carried: the item is dropped, and Open gaps names personal-life material removed. Otherwise its item is title, date, and venue, with `a first-person piece` as what it covered. Nothing else from it, its deck included, enters any line, an extension's included, or an assessment.

## Extensions

An extension is one markdown file declaring its name, version, and prefix, then each heading, token, and marker it adds: what it holds, its register or label rule, whether it is required, and for a marker its kind (record marker or projection), as Front matter states. It may declare a staleness number and the queries its fields need. A field that does not say required is not required.

Additive only. It never redefines, removes, or relaxes a base heading, token, marker, line shape, the sourcing rule, the personal-life exclusion, or the label on a figure. It adds its own headings, and its own tokens only under them, as Does any name clash? in `SKILL.md` states.

Fields follow What does each field do? in `SKILL.md`.

Versions follow Which version applies? there.
