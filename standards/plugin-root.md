---
standard: plugin-root
version: 0.1.0
description: One declared plugin-root tree, base or domain, and the clauses used to score its layout
---

# Plugin Root

## Context

Applies to a plugin root, base or domain: the capability tree a harness loads. This is not `standards/user-root.md`, which governs the five user-root types, and it is not a procedure that authorizes changing a populated directory. Instruction quality is governed by `standards/instruction-quality.md`; formatting and archives by `standards/conventions.md`; family placement by `standards/primitives.md`; the composition arrow by `wiser/AGENTS.md` Precedence and routing.

## C1 Identification and currency

A plugin root is identified by its own `AGENTS.md`, which carries `root:` as its id and `layout:` as its stamp. A folder set never identifies a plugin root.

The plugin class is base or domain, read from the `root:` id: `wiser` is the base; every other plugin is a domain plugin. The plugin class is a declared fact. It is not inferred from which families or files the tree holds.

A plugin root carries no user-root `type:`, no Provides block, and no Onboarding keys. Those absences keep this lane apart from `standards/user-root.md`. A user root also carries `root:`; the absences are what stop this branch from capturing one.

**Identification is not admission.** Those obligations say what a plugin root does not carry; they do not by themselves make a directory one, and they are scored under C9 rather than here. A directory is admitted to this standard only when its `AGENTS.md` carries `root:`, does **not** carry a complete user-root declaration, **and** the tree either holds at least one primitive family directory or its `AGENTS.md` makes C4's composition declaration.

**A complete user-root declaration is all three** of a recognized user-root `type:`, a Provides block, and a Wiser constitution citation. Any one of them alone proves nothing and does not send a tree to the other lane. A single stray one on a tree that is otherwise a plugin root is therefore not an admission question: the root is admitted and the stray declaration scores misfiled under C9, which is the only reading under which that C9 result is reachable at all.

**A self-declared placeholder is admitted ahead of the ordinary test, and that order is part of the rule.** A root whose own `AGENTS.md` declares that it is a placeholder for a plugin, forbids authoring in it until a build Playbook exists, and states that it loads alongside `wiser`, is a plugin root and classifies `placeholder-plugin`, whether or not it holds a family or makes C4's full composition declaration. It is reserved rather than built, so requiring a built tree's declarations of it would exclude the exact population the `placeholder-plugin` token exists to name.

**The test is ordered, and a scorer applies the limbs in this order:**

1. A complete user-root declaration, all three parts: not a plugin root, and no clause here scores it.
2. A self-declared placeholder, as above: a plugin root, `placeholder-plugin`.
3. `root:`, no complete user-root declaration, and either a primitive family directory or C4's composition declaration: a plugin root.
4. Anything else: not a plugin root.

A populated directory that declares a `root:` id and nothing else reaches limb 4 and is **not** a plugin root: it is outside this standard, no clause here scores it, and no plugin repair is proposed for it.

**Admission classifies an unknown directory; it does not expel a known one.** A root already declared a plugin root, and a root a person names as one to be scored, are both scored in this lane even when the declaration being scored for is missing or damaged. Without that, a plugin root that loses its constitution would leave this standard rather than score absent on C7, and damage would read as a change of kind.

**A root admitted this way whose constitution is missing, or which carries no `root:` id, has no plugin class, and the class is never inferred.** Not from the directory name, not from the presence of a `gateway/`, not from what the tree contains. Score C1 and C7 absent, report that the class could not be read, and **suspend every class-dependent judgment** rather than guessing one: C4's direction, C6's gateway obligation and C8's license each wait on a class a later score can read. A class established by an earlier score may be carried into this one only where that score is cited. `skills/Housekeeping/` Step 1 owns the classification of an unknown directory, and the first test above is the one it applies.

The frontmatter also carries `root:` and `layout:`, the latter this standard's current tree version (1). Increment that integer when this standard changes the tree; a version difference is a converge input, never permission to re-instantiate. `skills/Housekeeping/` owns layout migration on a declared plugin root after instantiation. `skills/Onboard Plugin Root/` writes the first stamp when it builds the tree.

That integer is the plugin-root **contract** version: the tree this standard requires before a root counts as current. One integer and no minor part; a row says whether it is required or advisory, so severity lives in the row and not in the number. The stamp is a bare nonnegative integer. A decimal, a minor part, or a range is not a stamp.

The table states, per integer, what a plugin root must carry to reach it, which primitive brings it there, and whether the row is required or advisory. A session compares the root's stamp with the integer above; on a mismatch it reads the rows between the two, reports what is owed, and names the primitive that owes it. It converges nothing on its own.

| Contract | What a plugin root must carry | Who brings it there | Required or advisory |
|---|---|---|---|
| 1 | The C2 to C10 clauses as this standard states them at introduction, and the C1 declaration and stamp itself | `skills/Onboard Plugin Root/` at instantiation, `skills/Housekeeping/` afterwards | required |

This row 1 is the introduction row. This standard declares 1 at introduction; nothing sits behind it.

**The stamp is the last obligation and is not its own prerequisite.** The row above lists the stamp among what a root must carry, which read alone would make a newly produced tree unable to reach a clean score and therefore unable to be stamped. The order is fixed here. A tree is **stamp-eligible** when every applicable obligation **other than the stamp itself** scores present or N/A; at that point the stamp is written and the tree is scored again, and the second score is the one that reports. For a tree already in use the absent stamp is scored like any other absent obligation, which is what makes an unstamped plugin root read `plugin-old`, and that reading is true of it.

A stamp that is missing, behind the authority, or ahead of the authority reads `plugin-old`. The token selects the standard and the lane; the plan diagnoses the direction. The plugin tokens `plugin-current`, `plugin-old`, and `placeholder-plugin` belong to `skills/Housekeeping/` Step 1, which asks which standard a pointed-at directory is scored against. They are not a user-root production route and they do not belong in `skills/Onboard Root/`.

When the observed stamp exceeds the authority, convergence freezes:

1. No repair row is actionable. Findings are reported; none is offered for apply. The session does not hold the clause set the tree was built against.
2. The stamp is not written, not raised, and not lowered to the authority.
3. The report names the remedy: load a newer copy of this standard, not change the plugin.

The freeze binds convergence, not the operator. Correcting a stamp believed wrong is an authoring write on that root, entered under the constitution's Working under this root on the authority that heading defines, which this clause cites and does not restate. That separately authorized authoring write is the freeze's exit. It is not a converge action, and no converge run may take it.

A stamp that is not a bare nonnegative integer, or a `layout:` key declared twice, is refused, not classified. No comparison is asserted. In this standard's vocabulary the refusal scores misfiled.

**What that refusal stops, stated so two scorers stop in the same place.** It refuses the **comparison**, not the score. C2 to C10 are still scored and their findings are still actionable, because none of them depends on the stamp's value. What does not happen is any statement that the root is current, behind or ahead, and any repair that writes the stamp. Correcting a malformed or duplicated stamp is an authoring write on that root under Working under this root, the same exit the ahead freeze names, and never a converge repair.

A root classified `placeholder-plugin` scores its stamp N/A, not absent. A placeholder declares a reserved name and a standing constraint and forbids authoring until a build Playbook exists. It has no families and no primitives, so there is no tree for a stamp to describe. It takes its first stamp when `skills/Onboard Plugin Root/` builds it.

## C2 Families

Family placement is `standards/primitives.md` Placement; connector bodies are that standard's Connector Bodies. Category is frontmatter metadata and never a folder tier.

Four obligations:

1. The three primitive family directories `skills/`, `experts/`, and `tools/` are flat, and category never becomes a folder tier. **Flat has a test**, because `standards/primitives.md` gives a primitive whatever supporting files it needs: a family directory's immediate children are primitive directories, each holding its typed file. A child that holds no typed file and instead holds primitive directories is category as a folder tier and scores misfiled. Directories **inside** a primitive's own directory belong to that primitive, at any depth, and are never a finding under this clause.
2. A family directory may also hold a **shared-library directory that a standard in this root names**. Such a directory holds no typed file and is not a category tier; `standards/script-contract.md` Self-contained names the one directory a tool may import from outside its own. A child that holds no typed file and that no standard names scores misfiled.
3. A family directory that exists carries its `AGENTS.md` index. An existing family directory without that index scores absent.
4. A family directory that does not exist is not a finding. Which families ship at instantiation is not a conformance requirement. A domain plugin with no `connectors/` is correct rather than incomplete.

This clause imposes no directory naming requirement and in particular no rename. A directory name that contains a space is not a finding.

A placeholder whose own constitution forbids authoring families scores N/A on this clause, not absent.

## C3 Ownership

Every skill in a plugin root is owned by an expert or explicitly stands alone. The family indexes project `Owns:` and `Stands alone:` rather than frontmatter, per `standards/primitives.md` Indexes.

A skill with neither a projected owner nor a stands-alone declaration scores absent. A projected owner that is not an expert in this root, or a skill claimed both as owned and as standing alone, scores misfiled. A tree whose families hold no skills scores present under Scoring's vacuous case.

## C4 Composition

The composition arrow is `wiser/AGENTS.md` Precedence and routing.

The arrow is stated in `wiser/AGENTS.md` Precedence and routing, in a file a domain plugin can resolve. This clause cites it and states none of it in its own words; what follows is only what a score does with it.

A cross-plugin reference is never a finding. Duplicating a base primitive into a domain plugin scores misfiled. A base file that names a domain plugin scores misfiled.

**The composition declaration has two parts, both in the domain plugin's own `AGENTS.md`**, so that a scorer and a reader reach the same answer: it cites `wiser/AGENTS.md`, and it states that this plugin **loads alongside `wiser`**, writing the base's name as inline code. **The form is part of the obligation**, because this declaration is read by a person and also located by a classifier, and one that carries the meaning without the form cannot be found by the second. A declaration missing either part scores absent, and where only the form is wrong the repair is one sentence. Stating the two parts is what keeps this testable by reading the file rather than by searching it for a word: a tree that says it makes **no** composition claim contains the word and satisfies neither part. That declaration is also what C1's admission test reads. The composition declaration is N/A for the base, which composes with nothing, and the no-domain-reference rule is N/A for a domain plugin.

No shipped file in any plugin root names a path under the build workspace. A shipped file that does scores misfiled. This obligation applies to both plugin classes.

## C5 Write mode and in-use writes

What may be written to a plugin root, and under what authority, is governed by the constitution's Writes, Irreversibles, Workspace Model, and Working under this root. This clause cites those headings and states none of their rules in its own words.

This standard decides the one thing they leave open, because a session may load more than one plugin constitution: **the write ban binds each plugin constitution the session loaded**, so a session that has loaded two refuses ordinary writes to both.

The scoreable obligation is that a plugin root's own `AGENTS.md` states its write mode. **The reason is delivery, not binding.** Workspace Model settles that these clauses hold whether or not the chain reached a session, so a silent constitution does not weaken the rule; it fails to deliver it to the one session that reads only this root. A root whose constitution is silent on write mode scores absent.

## C6 Gateway

Two obligations, one unconditional and one conditional.

1. Unconditional: the base plugin alone ships `gateway/`. A base root whose `gateway/` is missing scores absent. A domain plugin that ships its own gateway process scores misfiled, whether or not it ships connectors.
2. Conditional, and the trigger is named so that two scorers reach the same result. The conditional applies when the root **ships at least one connector**, meaning a directory under `connectors/` that holds a `CONNECTOR.md`. An absent `connectors/`, an empty one, or one holding only its `AGENTS.md` index ships no connector and scores **N/A** on this conditional; C2's fourth obligation already makes its presence or absence no finding. Where the conditional applies, those connectors load through the base gateway's repeated `--connectors` flag, per `wiser/gateway/SETUP.md`, and that root's `AGENTS.md` states this loading path. Silence on it scores absent.

These are opposite obligations, not an N/A for either plugin class. Reading the base's obligation against a domain plugin is the error, not the clause.

## C7 Host bridges

`AGENTS.md` is the constitution of a plugin root, and the chain starts there. A missing `AGENTS.md` scores absent.

This clause requires no constitution pointer in any host bridge. A host that loads the chain reaches the constitution at `AGENTS.md`, and a second home for "start at `AGENTS.md`" is what a pointer requirement would create.

`CLAUDE.md`, when present, is a bridge into the chain and carries no instructions **of its own**. Text that routes a reader into the chain, and text that states the bridge's own limits, is the bridge doing its job and is not a finding: telling a reader to start at `AGENTS.md`, and telling a later author to add nothing here, are both bridge text. What scores misfiled is an **independent operational instruction**, one that tells a session how to do work rather than where the chain starts. Its absence is not a finding, and a missing constitution pointer is not a finding.

## C8 License class

There is one declared plugin class, the plugin class in C1, and the license follows from it. This clause is not a second plugin class declaration. C1 declares what the tree is; this clause checks that the license that plugin class entails actually shipped.

The base plugin class entails the Wiser Plugins License; a domain plugin class entails the Wiser Domain Plugin License. Match is by the license title the file carries. This clause states which title each plugin class entails and says nothing about what either license grants: license text, ownership statements, and any other legal string are a human's in every execution mode, and this standard neither reproduces nor summarizes them. This clause does not require byte-identity against any other copy.

No `LICENSE` scores absent. A `LICENSE` whose title is the wrong one for the declared plugin class scores misfiled. **The check is the title and nothing else**: judging a grant would need legal criteria this standard does not carry and may not supply.

This clause checks a license; it never writes or alters one. A shipped license must not cite a path under the build workspace.

## C9 User-root exclusion

Two halves, checked against two different things.

Half one is an obligation on the root, scored against the tree. A plugin root carries no user-root identity and no user-root directories: no `work/`, no `programs/`, no `sources/`, no Provides block, no user-root `type:`, no Onboarding keys, no bound memory. Observed material that contradicts this half scores misfiled, not absent.

Half two is a constraint on the plan, scored against the produced rows and not against the tree. No row a plugin-root score proposes is a user-root repair, and no row cites a `user-root.md` C-clause. This half is vacuously satisfied by every tree and can fail only by inspecting the plan.

Looking for bound memory a plugin root ought to have scores N/A: there is no such obligation. Finding bound memory a plugin root actually carries scores misfiled, because contradiction outranks inapplicability.

Scoring a plugin root moves no user-root fact.

## C10 Catalog

The authority for this clause is the catalog files a plugin root ships, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and the install record of that catalog.

A plugin root ships both files. Either file missing scores absent. `plugin.json` carries a `name` that equals this root's `root:` id. `marketplace.json` carries a `name` (the marketplace id) and a `plugins` array of length 1 whose one entry is this plugin, with `source` `"./"`. The repository is itself the plugin; a nested copy is not the install shape. A `plugins` length other than 1, an entry that is not this plugin, or a `source` other than `"./"` scores misfiled.

The install id is `<plugin>@<marketplace>`, the `plugin.json` `name` and the `marketplace.json` `name` in that order. A missing `name` on either file scores absent.

One plugin per repository marketplace. Domain plugins stay out of the base catalog: a domain plugin ships its own `.claude-plugin/` with its own marketplace name, and the base catalog does not list it. An extra catalog entry scores misfiled.

This clause imposes no directory naming requirement. A directory name that contains a space is not a finding, and no row proposes a rename to satisfy this clause.

When the plugin root is git-sourced (a git clone or a marketplace added from a git repository), both catalog files omit a `version` key. Presence of that key on a git-sourced root scores misfiled. When the plugin root is not git-sourced, the `version` key is not scored (N/A). The omitted key is the shape that makes a host able to resolve the source commit. No Update outcome is asserted.

A plugin root's README may describe the install doors this clause defines: pointing a harness at the repository as a plugin root, and adding the repository as a marketplace and installing from the catalog. It may state that the attached working folder, not the repository, is where work lands. It may state which behaviours have been exercised, and **each such claim cites the record of the run that exercised it**. A claim carrying no cited record scores misfiled, whatever the truth of it: a score can check a citation and cannot check history, and requiring the scorer to know what nobody has run would put an unscoreable test in a layout standard. Where the README makes no behaviour claim, this obligation has no object and scores present under Scoring's vacuous case. Updating an installed plugin to a later commit is one such behaviour, and no README, clause, or template in this root asserts that it works.

A root classified `placeholder-plugin` scores this clause N/A, not absent. A placeholder is not an installable plugin.

## Scoring

Score each clause present, absent, or misfiled as `standards/user-root.md` Scoring defines those three words. This standard cites that definition rather than writing its own copy. The integer in C1 is this standard's own; the vocabulary is not. A user-root bump must not age a plugin, which is why C1 owns its own authority; the meaning of "misfiled" does not version with either tree.

This standard adds a fourth word, **N/A**, for an obligation that does not apply to this root at all. A user root has one shape and needs no such word; a plugin root comes in two plugin classes with different obligations, so a clause can be inapplicable rather than merely unsatisfied.

N/A is not vacuous present:

- **N/A** means the clause does not apply, by plugin class or by the root's own declaration. The base's composition sentence, connectors on a plugin that ships none, families on a placeholder that forbids them, bound memory looked for on any plugin root, the `version` key on a plugin root that is not git-sourced, catalog files on a placeholder.
- **Vacuous present** means the clause applies and has nothing to check, with nothing contradicting it. C3 ownership on a tree whose families are declared but hold no primitives.

Contradiction outranks both. Observed material that contradicts a clause is misfiled, whether or not the clause would otherwise have scored N/A or vacuous present.

| Observation | Score |
|-------------|-------|
| Stamp equals the authority | Current. Then score all clauses; a version is not a certificate of conformance |
| Stamp missing, or behind | Not current. Rows owed are the contract rows between the stamp and the authority |
| Stamp ahead | Not current, and C1's freeze applies in full: the interval is empty so no migration row is owed, no clause finding is actionable, and the stamp is not written in either direction. C1 is the sole statement of this rule; this row points at it and does not abbreviate it |
| Stamp present but not a bare nonnegative integer, or declared twice | Misfiled. It contradicts C1's shape rule, and no comparison is asserted |
| An obligation whose plugin class does not apply, per the applicability table below | N/A, not absent |
| Looking for bound memory on any plugin root | N/A, not absent |
| Finding bound memory a plugin root actually carries | misfiled, because contradiction outranks inapplicability |
| A clause that applies with no object to check and nothing contradicting it | vacuous present, not N/A |
| A placeholder's stamp | N/A, not absent |
| A placeholder's catalog files | N/A, not absent |

A root whose stamp equals the authority returns zero version-migration rows and may still return clause findings. Asserting zero findings on a current stamp would make a correct repair plan fail.

| Clause | Base | Domain | The plugin-class-dependent part |
|--------|------|--------|--------------------------|
| C1 Identification and currency | applies | applies | The declared plugin class differs; the obligation does not |
| C2 Families | applies | applies | N/A for a placeholder that forbids families |
| C3 Ownership | applies | applies | |
| C4 Composition | partly | applies | The composition sentence citing the base is N/A for the base. "Never references a domain plugin" applies to the base and is N/A for a domain plugin. The no-duplication and no-build-workspace-path rules apply to both |
| C5 Write mode and in-use writes | applies | applies | |
| C6 Gateway | applies | applies | Opposite obligations, not N/A. The base ships `gateway/`; a domain plugin ships none |
| C7 Host bridges | applies | applies | |
| C8 License class | applies | applies | The declared plugin class differs |
| C9 User-root exclusion | applies | applies | |
| C10 Catalog | applies | applies | One plugin per repository marketplace; domain plugins stay out of the base catalog. N/A for a placeholder |
