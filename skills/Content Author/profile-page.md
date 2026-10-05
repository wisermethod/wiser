# Profile Page

A single page about one person, for the people who will check that person before they quote, brief, invest in, or hire them. Read this file at Frame and hold it through Draft. A persuasion page is `skills/Marketing Page Design/`. A fact sheet about a company is `fact-sheet.md`. A profile page is written through `skills/Profile Page/`, which builds the claims ledger these checks read and hands it over. A request that reaches Content Author for one without a ledger is routed there.

Review expert: `experts/Ghost Writer/`, reading as each of the page's readers the Frame recorded, and only those, in the order the brief to the gate states with its reason, the reader most likely to check a fact first; a reporter is read as one checking facts before quoting the page, an analyst as one checking how the person's work is described, in one review in a second context, handed the claims ledger and the fact map with the draft as the material the Point-At Test and Rule 2 check against. This root carries no news-desk reviewer, so whether a desk would quote the page is not judged here; name that gap.

## Shape

Two jobs, in this order. Each is a default, and `## Evidence` is the basis, not a law.

1. **Be the one correct, checkable source about the person**, for people and for answer engines. Basis: E1, E2, E5, E8, E12. What an answer engine would say about the person was not queried, and the effect of this page on one is untested (E15).
2. **State one argument of theirs**, plainly enough that a reader can disagree with it. Basis: E7.

The page is these sections, in this order. Each one names its reader. Short is a virtue: a section with no reader is not on the page.

- **Opening.** Who the person is, in their own first-person voice, for anyone who arrived searching their name.
- **The one argument.** First person, for buyers and peers.
- **Bio.** Third person, in a short length and a longer length, lift-ready, for reporters, analysts, and event organisers.
- **Other properties.** Links to the person's other properties, for everyone and for findability.
- **Contact.** One route, for reporters.
- **Photograph.** Only where one is supplied, for reporters who need a picture they can print.

## Format rules

- **Fact map.** Written with the draft, by whoever writes it, in the format `tools/copy-check/TOOL.md` defines: one row for every unit of the page, citing the ledger rows its facts rest on, or `none` with what the unit states instead. It is complete before the format checks run.
- **Two registers.** A first-person statement, and a third-person bio a reporter can paste without rewriting. The bio is built from facts only, one checkable fact per role in place of an adjective (E2, E3). The voice file's Routing Table row for a personal site names the register each takes. Where that row names none, the first-person parts take the person's essay register and the bio takes the plainest wording the press already uses for them.
- **Defaults, each overridable with a reason.** The anti-patterns below are the ones with a public basis in `## Evidence`. An owning root's own prohibitions are not this file's: they reach a run through its bound `about` and `voice`, and this file never states one. Reader reaction to personal sites was never measured, so each line is a default.
  - A self-applied label: thought leader, visionary, pioneer, foremost voice, world-renowned, industry-leading, or a near synonym the page applies to the person (E1, E9, E11).
  - A humblebrag construction (E9).
  - A comparison that ranks others below the person: rivalled, the only, the highest-scoring (E10).
  - A figure or a credential with no checkable source on the ledger (E5, E8).
  - Talent framing where a work story is available (E10).
  - Stacked press quotes or testimonials used as proof. One attributed quotation with its source is not a stack (E1, E5).
  - A borrowed analyst credential: another firm's ranking, placement, or quote used as proof of standing (E6).
  - A booking or engagement funnel as the primary action, for a person whose business is not speaking. The branch is the next rule (E1).
- **Recognition that is attributed and sourced is not an anti-pattern.** An award, a fellowship, or a named list, stated with who gave it and when, with its source on the ledger, is a checkable fact (E2, E9).
- **The speaking-business branch, stated once (E1).** Is speaking, training, or advisory engagement what the person sells? Yes: the page carries one primary engagement route, named plainly, and the booking-funnel default does not apply; every other default still does, the self-applied label included. No: no booking or engagement call to action anywhere on the page. Not stated in the brief: ask. Never infer it from the person's title.
- **Photograph.** A photograph appears only when one is supplied. It carries a credit line where the photographer is known. A print-resolution copy is linked or offered for reporters (E5). A generated likeness is never used: E12 forbids a placeholder image in the markup, and this rule extends it to the page, as a default. The credit line is a format demand, not a question about whether the person may use the photograph.
- **Contact.** One named route for reporters, an address or a contact page, and no form-gated funnel (E5). On the speaking branch the engagement route is that one route, or it sits beside it.
- **Findability brief.** The page's identity facts as a structured-data brief: name, role, organisation, a one-line description, and the person's other profiles as `sameAs` links. Every value is one the page displays, and each maps to a ledger row. `image` is present only for a real supplied photograph (E12). The site kit emits no Person or ProfilePage structured data, so on a kit site that is a declared gap of `skills/Profile Page/` and nothing is produced in its place. On any other site, `skills/SEO Assets/` builds the Person and ProfilePage blocks. Google states no guarantee that markup changes how a person appears (E12). What answer engines say about a person was not queried (E15). llms.txt names a personal site as a use case and does not add a field to this brief (E13).

`tools/copy-check/TOOL.md` states how the copy is read. A heading, a list item, and a table cell are each a unit under that reading, and one shorter than four words is mapped by its whole text.

## Failure modes

- **The brochure.** Adjectives where a fact should be. Test: can a reporter paste the sentence without rewriting out a label? If not, it is not a fact. Fix: replace the adjective with one checkable fact per role, or cut the sentence.
- **The inflated bio copied in.** A supplied bio, a speaker-bureau profile, a jacket bio, or an author page treated as a source rather than as claims to check. Test: a ledger row whose source is that supplied text. Fix: split it into claims, and give each claim a source that is not the supplied text, or keep it off the page.
- **The rerun.** An argument the person has already published, retold at length. Test: the argument-level read in Format checks. Fix: state it in a sentence or two and link the piece. This is an editorial default with no research basis: a page that retells an essay gives the reader nothing the link would not.
- **The vanity stack.** Labels, superlatives, and logos standing in for a fact. Test: a self-applied label, a comparison that ranks others below the person, or stacked quotes, testimonials, or logos used as proof. Fix: one attributed quotation with its source, or one sourced recognition, or cut.
- **The speaking funnel.** A booking or engagement call to action on a page whose person does not sell speaking. Test: the branch is no, and such a call to action is on the page. Fix: remove it. Where the branch was inferred from a title, the branch was never answered; ask.

## Format checks

Run after Content Author's Cut and before its Review step. How each command is run, and what its JSON carries, is `tools/copy-check/TOOL.md`. The Use codes are `skills/Profile Page/`'s.

1. Every sentence of the page has a row in the fact map, and every person-fact sentence maps to ledger rows whose Use code the skill marks usable. `copy-check facts` passes on the run's own ledger, fact map, and copy, with `--allow` set to those codes.
2. `copy-check prohibited` with the run's patterns file. Every hit is read and resolved.
3. `copy-check overlap` against the person's published corpus. Every match outside the page's factual identifiers (name, title, a book's full title, a co-author credit, a published piece's title reproduced as written) is rewritten. The tool does not decide which matches those are.
4. `copy-check dashes`. Each counted dash is either rewritten or one `experts/Ghost Writer/` Craft exempts that the tool cannot see, a title or a source's words reproduced as written, linked or not, or a habit the bound voice names, listed with that reason. The exempt ones are listed.
5. The argument-level read. Does any paragraph retell, at length, an argument the person has already published? Yes: it is a rerun; state it in a sentence or two and link the piece. Does any sentence put a view in the person's voice that neither their published work nor a confirmed ledger row supports? Yes: cut it, or carry it as a `confirm` row. Neither: record that the read ran.
6. Ghost Writer review ran as the review-expert line states, and the news-desk gap was named.

## Evidence

Every rule above names its basis here. The findings, the confidence, and the sources are dated observations from a research run read on 2026-09-26. The confidence levels are that run's own calibration. Reader reaction to personal sites was never measured: every rule is a default, never a law. No survey figure is given without its source and date. Two findings are recorded because they were in the run, and neither becomes a rule: E4 and E13.

- **E1. Two families of personal sites.** Moderate, as observed. In a sample of 21 personal sites the research run selected (not random), six from the speaking and advisory trade presented the person through labels or credential lines, stacked press quotes or testimonials, and booking calls to action; fourteen belonging to people whose work is something else opened with what the person does or thinks and carried no booking call to action; one was mixed. Sites read 2026-09-26: briansolis.com, hyken.com, charleneli.com, geoffreyamoore.com, kozyr.com, jessejamesgarrett.com (speaking family); dhh.dk, reidhoffman.org, backchannel.org, andrewng.org, tomgruber.org, kk.org, jnd.org, oreilly.com/tim, patrickcollison.com, paulgraham.com, allthingsdistributed.com, ben-evans.com, jaronlanier.com, om.co (second family); sethgodin.com (mixed). That the second family's plain pattern serves reporters, analysts, and investors better than the speaking family's is research inference, not measured. Basis for the label, stack and booking-funnel defaults and the speaking-business branch, each still at the confidence of its own finding below.
- **E2. One checkable fact per role.** Moderate as observed; Very Low that it drives credibility. Basis for the bio rule, and for treating an attributed, sourced award, fellowship, or named list as a fact rather than as a label.
- **E3. First person common, with a third-person bio offered separately.** Moderate. One site offers "my official bio and my short official bio" in two lengths for others to lift. Basis for the two registers and the two bio lengths.
- **E4. Plain statements of limits appear on some second-family sites.** Moderate for presence; Very Low as a deliberate device. Recorded. Not a format rule.
- **E5. Journalists.** Low; Very Low as applied to a personal site. Cision's 2024 State of the Media survey of more than 3,000 journalists, reported by Allison Carter, PR Daily, 2024-05-30: 55% annoyed by pitches that sound like marketing brochures; inaccurate information breaks trust; usable full-resolution photos asked for. Muck Rack's 2025 survey of more than 1,500 journalists, reported by Linda Zebian, PR News, 2025-06-18: 71% name an overly promotional tone and 33% missing or unverifiable sources as what gets pitches deleted; ready-to-use visuals, quotes, and data points appreciated. A missing media contact named as one editor's top complaint (one commenter, anecdotal). Both surveys ask about pitches, not personal pages, and both publishers sell PR software. Basis for the brochure default, the unsourced-figure default, the one-quotation rule, the print-resolution photograph, and the named reporter route.
- **E6. Analysts.** Moderate in briefings; Low as applied to a personal page. Joseph Blankenship, Forrester, 2026-01-13: quotes and results from other analyst firms will at best be ignored and at worst insult the analyst. Alessandro Perilli, a former industry analyst, perilli.com, 2017-05-16: a customer-logo slide feeds the vendor's ego; being mentioned in a paper is not an endorsement. Basis for the borrowed-analyst-credential default.
- **E7. Buyers reward ideas that challenge them.** Very Low. Edelman and LinkedIn 2025 B2B Thought Leadership Impact Report, landing page only; both sell thought-leadership services. Basis for the second job, the one argument a reader can disagree with.
- **E8. Investors check for inflated claims and consistency across sources.** Very Low. Three aggregator or promotional sources, no investor-authored source: Angel Investors Network (Sarah Mitchell, 2026-04-29), Growpido (2026-07-21), goingvc.com (2026-06-18). Basis for the unsourced-figure default. Consistency across the person's own properties is the same finding, recorded here, and applied by `skills/Profile Page/` when it builds the ledger.
- **E9. Excessive self-promotion backfires.** Moderate; Low for humblebrag versus plain brag. Steinmetz, Sezer, and Sedikides, Social and Personality Psychology Compass 11(6), 2017, e12321; Scopelliti, Loewenstein, and Vosgerau, Psychological Science 26(6), 2015, 903 to 914, whose third experiment found profile writers underestimate how boastful their own profile reads. Contradicting: Rudman, JPSP 74(3), 1998, and Chang, Saccardo, and Gallus, SSRN 2025, report competence gains or no likability cost, read only as listings. The reconciliation, that plain factual self-presentation can help and insincere or superior-sounding forms cost, is research inference. Basis for the humblebrag default and the sourced-recognition exception.
- **E10. Hubris and talent framing cost liking.** Low. Steinmetz et al. 2017, reporting Steinmetz 2017: success credited to hard work is liked more than success credited to talent; hubris costs liking. Basis for the talent-framing default and the comparison default.
- **E11. A self-applied "thought leader" label reads as self-importance.** Very Low. Sangram Vajre, Inc., 2017-05-22. One source read. Basis for the self-applied-label default.
- **E12. Profile page structured data.** Low; Very Low for any effect on how a person appears. Google Search Central, "Profile page (ProfilePage) structured data", updated 2026-09-08: the page's primary focus is one person or organisation affiliated with the site; an "About Me" page is a valid use; `sameAs` links to other profiles; no default or placeholder image; Google does not guarantee features that consume structured data will show. Basis for the findability brief, for `image` only on a real supplied photograph, and for never using a generated likeness.
- **E13. llms.txt names a personal site as a use case.** Low. llmstxt.org, Jeremy Howard. Recorded. Not a format rule, and not a field on the brief.
- **E14. The genre's most visible advice scores pages on lead generation**, which is not this page's job. Aggregator evidence of what the advice says: searchbloom.com, 2026-05-05.
- **E15. What answer engines say about a person was not queried.** The effect of any of this on them is untested.
