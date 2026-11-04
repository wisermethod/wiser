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
// 2026-11-02, M5.1 second e2e round: retire marker from selection, keep
// Shantell Sans only in notes, and document the one dated cluster data list.
const CONTRACT_EDITS = {
  'Pairings': [["| Shantell Sans | Shantell Sans |", "| Shantell Sans | Instrument Sans |"],
    ["| marker | Drawn rhythm | Shantell Sans | Instrument Sans | Kalam, Covered By Your Grace |", "| marker | Drawn rhythm | Instrument Sans | Instrument Sans | Shantell Sans, Kalam |"],
    ["Softness is independent of weight: chunky remains bold and soft.", "Softness is independent of weight: chunky remains bold and soft. The marker pairing is retired from selection (`selectable: false`); its former Shantell Sans heading is retained only as a margin-note alternative, with Instrument Sans in both text roles. The selector reads the dated `refusedClusters` list in `parts.json` before ranking: ground RGB distance, accent HSL bands and a pairing's `displayStyle` determine refusals in both modes, including kept overrides and donor faces. The list cites Creative Director's dated whole-layout taxonomy and is expected to age; change the cluster rules there only."],
  ],
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
// 2026-11-02, M5.1 final e2e fixes: read-back statement, relock anchors,
// --check-rules, picked-look exclusions and unseen Review page rebuilds.
for (const [heading, changes] of Object.entries({
  "Locking a board": [
    [
      "The full confirmed read-back sentence is lock-only `readBack.text`; the selector uses its corrections in `off`, not that prose.",
      "Lock-only `readBack.text` is the confirmed read-back statement alone, one line, without the question or its options; the selector uses its corrections in `off`, not that prose."
    ],
    [
      "`readBack` requires the confirmed verbatim `text` and `confirmed: true`.",
      "`readBack` requires that confirmed one-line statement as verbatim `text` and `confirmed: true`."
    ],
    [
      "Old verification and negative-claim rows are preserved.",
      "Old verification and negative-claim rows are preserved; each retained Claims row whose anchor moved from the replaced design points to the actual archived file, with its outcome and every other cell unchanged."
    ]
  ],
  "Assembly": [
    [
      "`--library` optionally selects an absolute library JSON beside its fonts; `help`, `--help` and `-h` open no files. There are no other flags, installs, configuration or network calls.",
      "`--library` optionally selects an absolute library JSON beside its fonts. Optional `--check-rules` refuses retired pairings, primary handwriting and dated refused clusters, including kept overrides and donor faces; use it on quick-path boards before Contact Sheet. `help`, `--help` and `-h` open no files. There are no installs, configuration or network calls."
    ]
  ],
  "Selection from answers": [
    [
      "| `looks` | Optional unique array of up to three whole-look option values from `looks`, default empty |",
      "| `looks` | Optional unique array of up to three whole-look option values from `looks`, default empty |\n| `looksShown` | `round1` and `variations`: all displayed whole-look records or Form options, separate from board `shown`; include every picked look |\n| `pageDisplayed` | Optional boolean, default false: true preserves a displayed page on Review retry; false permits rebuilding an unseen page after slot exhaustion |"
    ],
    [
      "Only those numbered slots are replaced, deterministically from their ranked spares, preserving all other board bytes, fixed assets and page constraints; the returned `form` is ready as usual. A slot with no passing unblocked spare fails with its number and exhaustion reason, never a partial page.",
      "Try those numbered slots first, deterministically from their ranked spares, preserving all other board bytes, fixed assets and page constraints; the returned `form` is ready as usual. Set `pageDisplayed: true` when the page was displayed: a slot with no passing unblocked spare fails with its number and exhaustion reason. For an unseen page, leave `pageDisplayed` false: if a slot exhausts its spares, rebuild the whole page from the same answers, excluding all blocked boards, then run Review again before display. If even the rebuilt page cannot be filled, report that inability plainly, never a partial page."
    ],
    [
      "The answers JSON is one object with these closed fields:",
      "Carry every displayed looks page in `looksShown`. A look shown and not picked, its exact pairing, palette and graphic set, never returns in Round 1's Close group or as a recommendation. Recommendations come only from boards carrying a picked look's parts; tap scores alone do not qualify one. With no picked looks, there are no recommendations.\n\nThe answers JSON is one object with these closed fields:"
    ]
  ]
})) {
  (CONTRACT_EDITS[heading] ??= []).push(...changes);
}
// 2026-11-02, M5.1 retry review: required looks history and persisted displayed boards.
CONTRACT_EDITS['Selection from answers'].push(...[
  [
    "Carry every displayed looks page in `looksShown`.",
    "Require `looksShown` on `round1` and `variations`: carry every displayed looks page, or an empty array only when none was displayed."
  ],
  [
    "Recommendations come only from boards carrying a picked look's parts; tap scores alone do not qualify one.",
    "Recommendations go to the first two Close boards sharing at least two of a picked look's three parts (pairing, palette, graphic set), wherever they occur in Close; tap scores alone do not qualify one. With picks, at least one is recommended unless no Close board shares two parts with a picked look; that absence is explained in `notes`."
  ],
  [
    "| `looksShown` | `round1` and `variations`: all displayed whole-look records or Form options, separate from board `shown`; include every picked look |",
    "| `looksShown` | Required on `round1` and `variations`: all displayed whole-look records or Form options, separate from board `shown`; include every picked look; empty only when none was displayed |"
  ],
  [
    "| `pageDisplayed` | Optional boolean, default false: true preserves a displayed page on Review retry; false permits rebuilding an unseen page after slot exhaustion |",
    "| `pageDisplayed` | Optional boolean, default false: false rebuilds an unseen page with every avoided key excluded; true starts from saved `displayedBoards` and replaces only avoided slots |\n| `displayedBoards` | Required when `pageDisplayed` is true: the complete displayed `selection.boards` records, saved unchanged in the command input before waiting and reloaded on resume |"
  ],
  [
    "\"off\": [], \"looks\": [], \"kept\": {}",
    "\"off\": [], \"looks\": [], \"looksShown\": [], \"kept\": {}"
  ],
  [
    "Try those numbered slots first, deterministically from their ranked spares, preserving all other board bytes, fixed assets and page constraints; the returned `form` is ready as usual. Set `pageDisplayed: true` when the page was displayed: a slot with no passing unblocked spare fails with its number and exhaustion reason. For an unseen page, leave `pageDisplayed` false: if a slot exhausts its spares, rebuild the whole page from the same answers, excluding all blocked boards, then run Review again before display.",
    "For an unseen page, leave `pageDisplayed` false: exclude every avoided board key and build one fresh page from the same answers with `avoid` empty, without recursion, then run Review again before display. For a displayed page, persist `pageDisplayed: true` and its complete returned `selection.boards` as `displayedBoards` in that command's answers file before waiting. Resume retains both fields. Retries start from those saved boards and replace only slots whose displayed keys are avoided, deterministically from ranked spares, preserving every other board byte, fixed asset and page constraint; an unrelated avoid record cannot select a slot by number. A slot with no passing unblocked spare fails with its number and exhaustion reason. The returned `form` is ready as usual."
  ]
]);
// 2026-11-02, M5.1 reruns: dated answer citations and recorded page numbers.
CONTRACT_EDITS['Locking a board'].push(
  ["### Lock outputs and read-back", "### Answer numbers\n\nLock-only `answerNumbers` names the saved C14 record and the page numbers the session actually recorded. It is required; never infer them from array indexes. For example:\n\n```json\n\"answerNumbers\": {\n  \"file\": \"2026-11-02 V2 design answers.md\",\n  \"looks\": [\"L2\", \"L2\", \"L4\"],\n  \"rounds\": [\"C1\", \"C3\"],\n  \"board\": \"C3\"\n}\n```\n\n`file` is the dated design answers filename, including its V number where present. `looks` has one `L<n>` page number per picked `looks` entry, retaining duplicates for picks on the same page. `rounds` has one `C<n>` page number per `rounds` entry. Both are empty for absent legacy records. `board` is the `C<n>` page containing the locked board. Numbers may skip pages; the script never renumbers them. For personal optional sourced `audience` or `promise`, also give that field's recorded answer number in this map; do not invent an O1 or O2 question on the personal path. The non-personal answers use O1, O2 and O3.\n\nEach design claim cites its numbered answer in `memory/answers/<file>` as well as the existing JSON source field: sentence and word/boundary pairs J2b; audience O1, promise O2, final say O3; taps T1 to T9; read-back J3a; dropped `off` parts J3b; picked looks and board rounds their mapped L and C numbers; kept assets J1; the lock K1. A carried place cites P12 in its dated voice answers file instead of T9. Board-derived rules cite the mapped boards page and K1 beside the exact spec fields. Working needs keep their script citation. These numbered citations also travel into the direction's provenance table and the verification Cites column; source-field read-back still checks the actual values separately.\n\nOnly the existing legacy-layout exception in `../records.md`, where no answers shelf is authorised and no numbered record was written, uses explicit `answerNumbers: null`. It keeps firsthand source-field citations rather than inventing a dated record or answer numbers. Omission is refused.\n\n### Lock outputs and read-back"],
  ["Each rule cites the answers JSON and question/field, or the assembled spec's board field.", "Each rule cites its numbered answer in the dated record and the answers JSON field or assembled spec's board field, as Answer numbers specifies."]
);
CONTRACT_EDITS['Locking a board'].push(["  \"rounds\": [{\"question\": \"Round 1, questions 1 to 4\", \"steer\": \"Warmer; as it is; stronger; more current\"}],", "  \"rounds\": [{\"question\": \"Round 1, questions 1 to 4\", \"steer\": \"Warmer; as it is; stronger; more current\"}],\n  \"answerNumbers\": {\"file\": \"2026-11-02 design answers.md\", \"looks\": [], \"rounds\": [\"C1\"], \"board\": \"C1\"},"]);
// 2026-11-03, M5.4 whole-release review: retire marker's old character
// description and scope personal Foundation citations to their actual answers.
CONTRACT_EDITS['Pairings'].push([
  'Bouncing pen strokes carry a loose and openly playful voice.',
  'Retired from selection; Instrument Sans holds both text roles, with the former pen face kept for margin notes only.'
]);
CONTRACT_EDITS['Locking a board'].push([
  'audience O1, promise O2, final say O3;',
  'personal audience and promise use their ids in `answerNumbers`; O1, O2 and O3 apply only to an organisation, client or department;'
]);
// 2026-11-03, M5.4: displayed replacement recommendations are page-wide.
CONTRACT_EDITS['Selection from answers'].push([
  'preserving every other board byte, fixed asset and page constraint; an unrelated avoid record cannot select a slot by number.',
  'preserving fixed assets, page constraints and every other board byte except Close recommendation flags, which are reset on the first two boards sharing two picked-look parts in page order; an unrelated avoid record cannot select a slot by number.'
]);
// 2026-11-03, M5.4: selection requires the kept word/boundary pairs.
CONTRACT_EDITS['Selection from answers'].push([
  '| `words` | Required array of `{word, not}` objects, both non-empty single lines; an empty array omits the panel |',
  '| `words` | Required non-empty array of `{word, not}` objects, both non-empty single lines; empty words are refused before selection |'
]);
// 2026-11-04, M6: taste description and three taps mapped to four steer axes.
CONTRACT_EDITS["Locking a board"].push(...[
  [
    "`off` is the selection script's read-back corrections:",
    "`off` is the selection script's taste-description corrections:"
  ],
  [
    "Lock-only `readBack.text` is the confirmed read-back statement alone, one line, without the question or its options;",
    "Lock-only `readBack.text` is the taste description as shown alone, one line, without the question or its options;"
  ],
  [
    "\"readBack\": {\"text\": \"Natural and strong, like Patagonia.\", \"confirmed\": true}",
    "\"readBack\": {\"text\": \"Here's what I'm picturing: warm, inviting colours with a cheerful lift, and graceful lettering with a playful touch. Established enough to trust, fresh enough to feel current, with the cheer of KitchenAid and the warmth of Patagonia.\", \"confirmed\": true}"
  ],
  [
    "\"mode\": \"light\", \"feel\": \"natural\", \"history\": \"established-current\",\n    \"strength\": \"strong-solid\", \"technology\": \"craftsman\", \"style\": \"patagonia\",",
    "\"mode\": \"light\", \"feel\": \"playful-creative\", \"history\": \"established-current\",\n    \"strength\": \"soft-graceful\", \"technology\": \"kitchenaid\", \"style\": \"patagonia\","
  ],
  [
    "\"steer\": \"Warmer; as it is; stronger; more current\"",
    "\"steer\": \"Warmer; Bolder; More current; Nothing to add\""
  ],
  [
    "`readBack` requires that confirmed one-line statement as verbatim `text` and `confirmed: true`.",
    "`readBack` requires the one-line taste description as shown as verbatim `text` and `confirmed: true`, recording either That's it or the member's explicit off-parts correction, never an unanswered screen. Keep the description unchanged with its corrections in `off`; ask no description again."
  ],
  [
    "read-back J3a;",
    "taste description J3a;"
  ]
]);
CONTRACT_EDITS["Opening taps as data"].push(...[
  [
    "the four this-or-that taps and an optional \"What's missing from these?\" comment",
    "the three this-or-that taps and fourth \"What's missing from these?\" question on the question tool, with Nothing to add as its only option and the tool's typed answer taking a comment"
  ]
]);
CONTRACT_EDITS["Selection from answers"].push(...[
  [
    "The four steer values add three ticks toward their chosen pole to the taps' scores.",
    "The session maps three taps to the four existing steer values: Warmer sets `warmCool: -1`, Cooler `warmCool: +1`; Quieter sets `quietBold: -1` and `softStrong: -1`, Bolder sets `quietBold: +1` and `softStrong: +1`; More classic sets `classicContemporary: -1`, More current `classicContemporary: +1`. As it is, or unanswered, leaves both alone for quiet/soft and the corresponding axis alone for the other taps. For example, Bolder gives `\"steer\": {\"quietBold\": 1, \"softStrong\": 1}`; Quieter gives `\"steer\": {\"quietBold\": -1, \"softStrong\": -1}`. The selector's four-axis contract stays unchanged. The four steer values add three ticks toward their chosen pole to the taps' scores."
  ],
  [
    "After the four this-or-that taps, offer the optional comment box, “Anything you'd change about the ones you picked?”, or “What's missing from these?” with nothing picked.",
    "On the same question-tool screen as the three this-or-that taps, the fourth question is “Anything you'd change about the ones you picked?”, or “What's missing from these?” with nothing picked, with one option, “Nothing to add”. The tool's typed answer takes the comment. Where the tool needs two options or more, the three taps go together and the comment follows as a plain message in the same words; no or nothing is recorded as no comment."
  ],
  [
    "for a named wrong read-back part;",
    "for a named wrong taste contribution;"
  ],
  [
    "Thus a read-back word can be removed",
    "Thus a taste contribution can be removed"
  ]
]);
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
