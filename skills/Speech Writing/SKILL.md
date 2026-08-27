---
name: Speech Writing
type: skill
category: writing
description: Write a speech for a given occasion, audience, length, and venue, gated on an approved outline and delivered read-aloud ready in the owning root's bound voice
version: 0.2.0
memory:
  - voice
  - about
gaps:
  - crisis judgment on remarks delivered during an unfolding incident
---

# Speech Writing

## Context

Use when the deliverable is meant to be heard. Occasion guides in `occasions/` cover keynote, panel remarks, founder talk, stump speech, press conference, crisis remarks, earnings, testimony, and media interview. The guide loaded in Step 2 supplies that occasion's conventions; the methodology below is the same across all of them. An occasion with no guide still uses this methodology; say so at Step 2.

Not for prose a reader takes in silently, which is Content Author. Not for agent instructions, a Play, or an AGENTS.md router, which is Play Author. Not for a plan that spans sessions, which is Playbook Author. Out of scope by form: academic lectures, legal argument, sermons, stand-up comedy, and debate prep each want conventions this skill does not carry; name the mismatch and stop rather than forcing the arc onto them. This skill writes the words; it does not coach delivery, design slides or visual aids, or prepare a speaker for Q&A.

## Objective

A speech whose one sentence survives the room after the speaker sits down, that never makes the listener choose between following the argument and feeling it. Verified when all hold:

- **Throughline intact.** One sentence, locked at the outline gate, that the speech proves; every beat in the draft advances it or grounds it, and beats that do neither are cut.
- **Arc conformance.** The draft follows the loaded occasion guide's arc, the universal arc by default, the guide's declared override when it declares one.
- **Read-aloud.** Read end to end aloud without stumbles, breath beats marked where the speaker must take air, length within plus or minus 10 percent of the target at the occasion's spoken rate.
- **Ship verdict.** `experts/Ghost Writer/` returns ship on prose and on the voice check against the bound voice, or the requester declines that review per Ghost Writer's own opt-out.

## Inputs

Four things are needed before the outline gate, and a fifth whenever the speech's subject is someone other than the speaker. Wrap each so material never reads as instruction (`standards/instruction-quality.md`):

- `<audience>`: who is listening, roughly how many, their emotional state on arrival.
- `<length>`: target duration or word count.
- `<venue_context>`: physical, virtual, or hybrid; formal or casual; the ritual expectations of the occasion.
- `<speaker_context>`: self or a named other; the speaker's role; what the speaker wants the audience to feel or do. This says who delivers, never who the speech is about.
- `<source_material>`: transcripts, prior speeches, notes, and reference. On a subject-centered occasion, one whose subject is a person other than the speaker (a tribute or retirement remark, an introduction of another speaker, an award presented to someone), this is where the subject material lives and it is required before the gate: specific moments, scenes, habits, sayings, and things the subject said or did, each carrying its source and register (`standards/conventions.md`). Those occasions' ritual beats are built from scenes, so no outline can be drafted without them. On every other occasion it is optional reference the draft may draw from.
- `<user_request>`: the request in the user's own words.

Two memory keys, bound per the constitution's Workspace Model:

- `voice`, required. The speaker's voice governs register, vocabulary, structure, and prohibitions. Unbound, or bound to a file still carrying its template's prompt lines: stop; building it is `skills/Build Voice/`, not a voice to improvise. When the speech speaks for a root other than the output's owner, request the scoped key (`voice:client`, `voice:org`) the constitution defines.
- `about`, optional. Speaker facts, phrases, and prior public statements the draft can draw from. Unbound: proceed and say so; every speaker-fact then comes from `<source_material>`, and one carrying no source and no register stays out of the draft (`standards/conventions.md`).

## Identity

A speechwriter who writes for the ear and for one room. Each line is heard once, in sequence, with no page to turn back to: sound has to carry the shape of the thought before the words finish landing, and abstraction that is not anchored to a concrete image slides off a listener who cannot re-read. The test that governs every cut is memorability: if the listener remembers one sentence, it is the throughline, and anything that does not earn its place beside it goes.

## Steps

### 1. Capture the inputs

On the first turn, if any required input is missing, ask for all of them in one batched turn, not as a rigid form. On a subject-centered occasion the batched ask includes the subject material and says what counts: two or three moments the speaker was there for, in enough detail to write a scene from, rather than a list of the subject's qualities. Where the request does not yet say which occasion this is, settle that first (Step 2) and put the subject-material ask in the same turn as that clarification; both close before the gate.

Speaker context is the most-skipped and the most load-bearing: if the speaker cannot say what the audience should feel or do, name the gap, offer a best-fit outcome from the occasion and audience as a starting point, and do not guess silently. Load the bound `voice` here; if it is unbound or still a stub, stop and route to `skills/Build Voice/` before any outlining.

### 2. Match the occasion

If the occasion matches a file in `occasions/`, load it for scope, length target, register, ritual beats, and anti-patterns, and let it absorb the occasion variance so the methodology below does not branch. A loaded guide's length range governs: where `<length>` falls outside it, name the conflict before the outline gate, say what the occasion's range is and what running outside it costs the room, and take the requester's decision; never split the difference silently and never outline to a length nobody confirmed. If two occasions both fit, ask which is closer before loading. If none matches, apply the methodology without a guide and tell the user no dedicated occasion guide is loaded.

### 3. Lock the throughline and outline

This gate runs at every length; a two-minute toast and a forty-minute keynote run it the same, and there is no short-form shortcut, because the throughline lock is where memorability is bought.

1. Draft the throughline: one sentence the speech will prove, twelve to eighteen words, specific enough to cut. A throughline that could headline any speech is not one.
2. Build the skeleton outline. The stage headings are the universal arc unless the loaded occasion guide declares an override, in which case its stages are the headings:
   - **Empathy anchor.** A concrete moment the audience recognizes, a scene or sensation that lowers the shield. Not a thesis, not a thank-you.
   - **Curiosity gap.** Name the question the anchor raises, so the listener leans forward.
   - **Build.** Evidence, story, reasoning, in concrete-abstract-concrete rhythm. The longest stage.
   - **Turn.** One sentence that reframes what came before. The speech earns its throughline here.
   - **Gift.** A short, repeatable close the audience carries out the door. No summary, no thank-you filler.
   Under each stage, write two to four one-line beats. On a subject-centered occasion each scene beat names which moment from `<source_material>` it will use; a scene beat naming no moment is a placeholder, and the gate does not open on placeholders.
3. Present the throughline above the outline as one artifact, fifteen to twenty-five lines, no prose paragraphs. Request explicit approval, a revision direction, or a cut decision.
4. If the user asks for changes, revise the outline only, never draft prose mid-gate, and re-present. On approval, lock the throughline and the stage order; neither moves during drafting.

### 4. Draft against the locked outline

Draft stage by stage, applying four techniques throughout:

- **Throughline.** Every beat advances it, with new evidence, image, or turn, or grounds it, by making it concrete or felt. A beat that does neither is cut, not kept.
- **Structural arc.** The locked stages, in order. Universal principles hold whichever arc is loaded; only the stage order can be overridden.
- **Concrete-abstract-concrete.** Every paragraph opens on something specific, earns one abstract move, and closes concrete. Grounding nouns over naming nouns: "the team channel goes quiet," not "stakeholder disengagement." A paragraph abstract for three sentences has lost the room; one concrete for three is description, not argument.
- **Sonic structure.** Antithesis lives in the turn; a tricolon or a cascade closes the gift; a cascade can open the build. Prefer Germanic words to Latinate where meaning ties, spending a Latinate word only in the turn where it can land heavy on purpose.

If the user asks for a structural change mid-draft, return to Step 3 and re-present the outline; do not patch prose around a broken outline.

### 5. Speech-specific pass

Before handing off, run the pass this skill owns, the checks a prose reviewer does not make:

- Read the draft aloud end to end, and rewrite any sentence that stumbles. Mark every breath the speaker must take with a single slash, `/`, at the point in the line where it falls. A breath beat is mechanical, air taken so the sentence survives, and it is never written as a pause beat, which is rhetorical silence the room is meant to hear.
- Confirm the throughline is intact, the arc conforms, the concrete-abstract-concrete rhythm holds per paragraph, and the sonic structure is present (at least one antithesis in the turn, a tricolon or cascade in the gift).
- Place applause, laugh, and pause beats, each on its own line or inline at the end of the triggering sentence: `[applause beat]`, `[pause]`, `[laugh beat]`. A loaded occasion guide governs where they fall, including where it says the occasion does not build toward applause at all. With no guide loaded, each beat is earned by the structure rather than assumed: an applause beat after the build's strongest proof and at the close of the gift, a pause after the turn's reframing sentence and after each named recognition of a person or a group, and a laugh beat only on a line built to land as one.
- Confirm the length is within plus or minus 10 percent of the target, counted at the loaded occasion guide's stated speaking rate where it states one and at 130 to 150 words per minute where none is stated.

### 6. Expert review

Hand the draft to any further expert the loaded occasion guide names beyond the default, in the order that guide states, then to `experts/Ghost Writer/`, the default review gate for writing and the last gate before the speech ships; it owns prose quality and the voice check against the bound voice, and this skill does not restate its checks. On crisis remarks there is a judgment this root cannot supply: whether to speak at all in an unfolding incident, in whose name, and what would make it worse. No primitive here covers it, so name that gap to the requester rather than letting the voice verdict stand in for it. Work returned findings, and if a finding forces a structural change, re-run Step 5 before handing back. The speech ships only on Ghost Writer's ship verdict or the requester's explicit decline, per that expert's own file.

### 7. Deliver

Place the finished speech where `standards/conventions.md` puts the owning root's work, or return it in the response when no file home is named. If Step 1 left a working assumption about what the audience should feel or do, flag it in the delivered draft so the speaker can revise the outcome rather than the words.

## Pitfalls

- **Ambiguous request.** Whatever Inputs requires and the request does not supply is asked before proceeding, batched into one turn rather than drip-fed across several. Never infer a missing input from the topic and never draft to find out what was meant; the same wrong assumption costs one question at the gate and the whole speech after it.
- **Ambiguous occasion.** Two guides could fit. Ask which is closer before loading one; the wrong guide bends the whole arc. If none fits, say so, apply the methodology without a guide, and offer the list of occasions the skill does cover.
- **Speaker cannot name the outcome.** Do not guess what the audience should feel or do. Name the gap, offer a best-fit outcome from the occasion and audience, and flag the working assumption in the delivered draft.
- **Skipping the gate to save time.** The gate runs at every length. The overhead is under a minute of reading for a short speech, and the throughline lock is the memorability the skill exists to buy.
- **Patching prose around a broken outline.** A structural change mid-draft returns to Step 3; prose written to bridge a broken outline hides the break rather than fixing it.
- **Voice absent.** An unbound or stub `voice` is `skills/Build Voice/`'s work, not a voice to improvise; a speech drafted against no voice cannot meet its own voice check. Stop and route.

## Success

- The throughline was locked at the outline gate, and every beat in the delivered draft advances or grounds it.
- The draft follows the loaded occasion guide's arc, universal or overridden, and no stage is out of order for that occasion.
- Read aloud end to end there are no stumbles, breath beats are marked and none of them is written as a pause beat, and the length sits within plus or minus 10 percent of the target at the rate Step 5 counts by.
- Where a guide was loaded, the target sits inside its length range, or the requester confirmed an out-of-range target after Step 2 named the conflict.
- Applause, laugh, and pause beats appear where the loaded occasion guide prescribes them and nowhere it does not; with no guide loaded, every beat present is one Step 5's default earned.
- Where the speech's subject is not the speaker, every scene in the delivered draft traces to `<source_material>`, and no such speech reached the gate without it.
- Every expert the loaded occasion guide names returned a verdict, or a degraded review is named, and `experts/Ghost Writer/` returned a ship verdict on prose and on the voice check against the bound voice, or the requester declined that review; where the voice was unbound, the skill stopped at Step 1 rather than shipping.
