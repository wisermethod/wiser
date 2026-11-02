import assert from 'node:assert/strict';

// Only layout whitespace, the documented section move and the dated contract
// edits below are normalised. Table cells, prose, settings and licence text
// remain part of the comparison.
// The operator's tap changes of 2026-11-02 (brand flow M2.9): new option ids in
// the examples, Engineered's line, Dark's dropped tick, more non-dial nudges and
// the two fills the card never shows.
// 2026-11-02, M4 review: --caller leaves onboarding state to its caller.
// 2026-11-02, M5.1: lock working needs, T numbers, respondent provenance,
// marker reading face and Review replacements.
const CONTRACT_EDITS = {
  'Pairings': [["| Shantell Sans | Shantell Sans |", "| Shantell Sans | Instrument Sans |"]],
  'Locking a board': [
    ["Q1 to Q9 correspond", "T1 to T9 correspond"],
    ["Otherwise answers are sourced as `Firsthand` with the member's name.", "For every non-personal type, `provenance: {register, by}` is required, naming the person who answered, never defaulting to the organisation or department. Only a personal brand defaults to `Firsthand` with the member's name."],
    ["Inferences cite their derivation; gaps use", "Inferences cite their derivation; fixed scale and rhythm claims cite `(Working need: lock.mjs SCALE)`, never a sourcing register; gaps use"],
    ['"posture": "subaru", "mood": "ikea", "place": "workshop"', '"posture": "toyota", "mood": "ikea", "place": "design-workshop"'],
    ['`--replace` permits replacing a complete design.', '`--replace` permits replacing a complete design. Optional `--caller` is a boolean: it leaves `## Onboarding` and run-record `## Per-key close` unchanged for the caller to close.'],
    ['Existing `AGENTS.md` Onboarding and `work/onboarding/run-record.md` Per-key close design lines are set to `complete`;', 'Without `--caller`, existing `AGENTS.md` Onboarding and `work/onboarding/run-record.md` Per-key close design lines are set to `complete`;'],
  ],
  'Opening taps as data': [
    ['Mechanical\'s description is "Precise and engineered".', 'Engineered\'s description is "Precise and industrial".'],
    ['One ordinary nudge is 1; Dark\'s small contemporary tick is 0.5; ', 'One ordinary nudge is 1; '],
    ['`natural`, `polished` and `casual` retain', '`natural`, `polished`, `casual`, `approachable`, `creative`, `utility`, `fashionable` and `sleek` retain'],
    ['Neutral options carry an empty object.', 'Neutral options carry an empty object. Feel\'s `feel-unsure` and place\'s `place-none` are marked `"shown": false`: those two questions show four options, the operator\'s limit of 2026-11-02, and each is kept only as its question\'s no-preference id for a question left unanswered.'],
  ],
  'Selection from answers': [["The caller appends each displayed page's full `selection.boards` records to `shown` before asking for the next round.", "The caller appends each displayed page's full `selection.boards` records to `shown` before asking for the next round. For a Review-blocked page, rerun the same `round1` or `variations` command with the same inputs and flags plus `avoid`, an array of the full blocked `selection.boards` records. Accumulate any blocked replacement records there too. Only those numbered slots are replaced, deterministically from their ranked spares, preserving all other board bytes, fixed assets and page constraints; the returned `form` is ready as usual. A slot with no passing unblocked spare fails with its number and exhaustion reason, never a partial page. Board zero uses the first alternative's ranked spares for its unfixed setting, retaining every fixed asset. Rejected boards were never displayed and never enter `shown`; append only the page actually displayed."], ['"feel": "mechanical"', '"feel": "engineered"'], ['"place": "design-studio"', '"place": "design-workshop"']],
};
function edited(text, heading) {
  for (const [from, to] of CONTRACT_EDITS[heading] ?? []) { assert.equal(text.split(from).length, 2, `contract edit not found once in the archive: ${heading}`); text = text.replace(from, to); }
  return text;
}
const normalise = text => text.trim().replace(/\s+/g, ' ');
function section(text, heading) {
  const marker = `## ${heading}\n`, start = text.indexOf(marker);
  assert.ok(start >= 0, `missing parts section: ${heading}`);
  const body = text.slice(start + marker.length);
  return body.split(/\n## /, 1)[0].trim();
}
export function comparePartsSplit(archive, contract, catalogue) {
  const compared = [];
  for (const heading of ['Pairings', 'Settings and use', 'Extension seam', 'Palettes', 'Containers', 'Graphic sets']) {
    assert.equal(normalise(section(catalogue, heading)), normalise(edited(section(archive, heading), heading)), `catalogue: ${heading}`);
    compared.push(`catalogue: ${heading}`);
  }
  const archivedFonts = section(archive, 'Font files');
  const licenceStart = archivedFonts.indexOf('All families are');
  assert.ok(licenceStart > 0, 'archive must contain font commands followed by provenance');
  assert.equal(normalise(section(catalogue, 'Font licences and provenance')), normalise(archivedFonts.slice(licenceStart)), 'catalogue: font licences and provenance');
  compared.push('catalogue: font licences and provenance');
  for (const heading of ['Locking a board', 'Assembly', 'Opening taps as data', 'Selection from answers']) {
    assert.equal(normalise(section(contract, heading)), normalise(edited(section(archive, heading), heading)), `script contract: ${heading}`);
    compared.push(`script contract: ${heading}`);
  }
  // The first Font files paragraph intentionally delegates fetch permission to
  // SKILL.md. Compare the remaining command contract against its archived span.
  const commandTail = text => text.slice(text.indexOf('\n\n') + 2);
  assert.equal(normalise(commandTail(section(contract, 'Font files'))), normalise(commandTail(archivedFonts.slice(0, licenceStart).trim())), 'script contract: font commands');
  compared.push('script contract: font commands');
  return compared;
}
