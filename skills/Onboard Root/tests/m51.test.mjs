import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../gates.sh'), 'utf8');
// Exercise the real gate and driver, redirecting only the fixture shelf so no
// memory directory is opened. Harness scratch stays outside the worktree.
assert.equal(source.split('MEM="$ROOT/memory"').length, 2);
const harness = source.replace('MEM="$ROOT/memory"', 'MEM="$ROOT/voice-fixture"');
const claims = '## Claims\n\n| Row |\n|-----|\n| V1 |\n| V2 |\n\n'
  + '## Negative claims\n\n| Row | Anchor | All containers | Second reader | Outcome |\n'
  + '|-----|--------|----------------|---------------|---------|\n';
const emptyList = '## Must-reach list\n\n| Item | Kind | Text | Disposition | Where |\n'
  + '|------|------|------|-------------|-------|\n';

function runGate(gate, files, fails = false, setup = () => {}) {
  const root = mkdtempSync(join(here, 'm51-fixture-'));
  const scratch = mkdtempSync(join(tmpdir(), 'onboard-m51-'));
  try {
    const fixture = {
      'AGENTS.md': '---\ntype: org\n---\n',
      'voice-fixture/voice.md': '## How They Write\nThe rule is to open with the point. [V1]\n',
      'work/onboarding/verification.md': claims,
      ...files,
    };
    for (const [path, text] of Object.entries(fixture)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    setup(root);
    const child = spawnSync('bash', ['-c', harness, 'gates.sh', '--json', '--gate', gate, root], {
      env: { ...process.env, TMPDIR: scratch },
    });
    assert.ifError(child.error); assert.equal(child.stderr.toString(), '');
    // A replacement character from decoding a split UTF-8 sequence would hide
    // the diagnostic bug. Decode strictly before checking its JSON.
    const stdout = new TextDecoder('utf-8', { fatal: true }).decode(child.stdout);
    assert.equal(child.status, fails ? 1 : 0, stdout);
    const rows = stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2); assert.equal(rows[0].gate, gate);
    assert.equal(rows[0].status, fails ? 'fail' : 'pass');
    assert.equal(rows[1].total, 1); assert.equal(rows[1].skip, 0);
    return rows[0];
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

const answer = 'work/answers/2026-11-02 design answers.md';
for (const [name, citation, fails = false] of [
  ['joins a dated answers filename', answer],
  ['joins through the last word on the line', `Source: ${answer}`],
  ['stops at a resolving join before trailing prose', `${answer} supplies B1 and B2.`],
  ['strips closing citation punctuation from a join', `The source is (${answer}).`],
  ['checks both spaced paths on a line', `${answer}; work/answers/2026-11-02 voice answers.md.`],
  ['retains ordinary backticked path checks', '`work/plain.md`'],
  ['fails an unresolved spaced path', 'work/answers/2026-11-03 design answers.md', true],
  ['does not join across a newline', 'work/answers/2026-11-02\ndesign answers.md', true],
  ['does not hide another missing path after a resolving join', `${answer} and work/missing.md`, true],
  ['still refuses traversal', 'work/../../outside file.md', true],
]) test(`G19: ${name}`, () => {
  const row = runGate('G19', {
    'voice-fixture/voice.md': `## Sources\n${citation}\n`,
    [answer]: 'B1\n',
    'work/answers/2026-11-02 voice answers.md': 'Q1\n',
    'work/plain.md': 'Source\n',
  }, fails);
  if (fails) assert.match(row.detail, /line 2: path/);
});

test('G19: a longer join through a symlink must remain inside the root', () => {
  const row = runGate('G19', {
    'voice-fixture/voice.md': 'work/escape/m51.test.mjs extra words\n',
  }, true, root => symlinkSync(here, join(root, 'work/escape')));
  assert.match(row.detail, /outside|leaves the root/);
});

for (const exists of [false, true]) test(`G19: a backticked memory answers path with spaces ${exists ? 'exists' : 'is missing'}`, () => {
  const path = 'memory/answers/2026-11-02 voice answers.md';
  const row = runGate('G19', {
    'voice-fixture/voice.md': `## Sources\n\`${path}\`\n`,
    ...(exists ? { 'work/answers/2026-11-02 voice answers.md': 'P12\n' } : {}),
    'work/plain.md': 'Source\n',
  }, !exists, root => symlinkSync('work', join(root, 'memory')));
  if (!exists) assert.ok(row.detail.includes(path), row.detail);
});

test('G19: a backticked spaced path cannot borrow a shorter existing directory', () => {
  runGate('G19', {
    'voice-fixture/voice.md': '`work/onboarding missing-note.md`\n',
  }, true);
});

for (const [name, citation, files, fails] of [
  ['requires a filename after an existing directory', 'work/onboarding missing-note.md', {}, true],
  ['accepts a resolving filename after an existing directory', 'work/onboarding saved-note.md', { 'work/onboarding saved-note.md': 'Notes\n' }, false],
  ['accepts a directory followed by ordinary prose', 'see work/onboarding for notes', {}, false],
  ['requires a filename after a longer resolving directory', 'work/team notes missing-note.md', { 'work/team notes/saved.md': 'Notes\n' }, true],
]) test(`G19: ${name}`, () => {
  const row = runGate('G19', {
    'voice-fixture/voice.md': `${citation}\n`,
    ...files,
  }, fails);
  if (fails) assert.match(row.detail, /missing-note\.md.*does not resolve/);
});

test('G19: a backticked spaced path through a symlink cannot leave the root', () => {
  runGate('G19', {
    'voice-fixture/voice.md': '`work/escape/missing note.md`\n',
  }, true, root => symlinkSync(here, join(root, 'work/escape')));
});

for (const [name, sentence, fails = false] of [
  ['reattaches an anchor after a firsthand citation', 'Acme has 12 offices. (Firsthand: Dana Reyes) [V1]'],
  ['reattaches after several citation parentheticals', 'Acme has 12 offices. (Firsthand: Dana Reyes) (sources/brief.md) [V1]'],
  ['retains dotted abbreviations within a citation', 'Acme has 12 offices. (Firsthand: Dr. Dana Reyes) [V1]'],
  ['keeps each sentence with its own trailing citation and anchor', 'Acme has 12 offices. (Firsthand: Dana Reyes) [V1] It has 15 staff. (sources/brief.md) [V2]'],
  ['still accepts an adjacent anchor', 'Acme has 12 offices. [V1]'],
  ['still fails a citation without an anchor', 'Acme has 12 offices. (Firsthand: Dana Reyes)', true],
  ['does not borrow an anchor across unrelated prose', 'Acme has 12 offices. (Firsthand: Dana Reyes) It has 15 staff. [V1]', true],
  ['does not borrow an anchor across lines', 'Acme has 12 offices.\n(Firsthand: Dana Reyes) [V1]', true],
  ['still requires a verification row for the anchor', 'Acme has 12 offices. (Firsthand: Dana Reyes) [V99]', true],
  ['does not take an ordinary parenthetical claim as a citation', 'Acme has 12 offices. (Revenue grew 15% last year.) [V1]', true],
  ['does not take and/or prose as a path citation', 'Acme has 12 offices. (and/or 15 more planned) [V1]', true],
  ['does not take a year pair as a path citation', 'Acme has 12 offices. (2024/2025 roster lists 15 nurses) [V1]', true],
  ['keeps dotted abbreviations inside a sentence', 'e.g. Example Ltd. has 12 offices. [V1]'],
]) test(`G5a: ${name}`, () => {
  runGate('G5a', { 'voice-fixture/voice.md': `## Facts\n${sentence}\n` }, fails);
});

for (const citation of ['(Firsthand: Dana Reyes)', '(Secondhand: Dana Reyes)', '(Public statement: sources/brief.md)', '(Research inference: E3)', '(Working need: lock.mjs SCALE)', '(sources/brief.md)', '(`sources/brand guide.md`)', '(Firsthand: Dr. Dana Reyes) (sources/brief.md)']) {
  for (const gate of ['G5a', 'G5c']) test(`${gate}: accepts only the citation shape ${citation} before an anchor`, () => {
    runGate(gate, {
      'voice-fixture/voice.md': `## Facts\nThe guide does not say ${gate === 'G5a' ? '12' : 'this'}. ${citation} [V1]\n`,
      'work/onboarding/verification.md': `${claims}| N1 | V1 | yes | Dana Reyes | located |\n`,
    });
  });
}

for (const [name, tail] of [
  ['an ordinary parenthetical claim', '(Revenue grew 15% last year.) [V1]'],
  ['an ordinary parenthetical before a citation', '(Revenue grew 15% last year.) (Firsthand: Dana Reyes) [V1]'],
  ['a citation with no anchor', '(Firsthand: Dana Reyes)'],
  ['an anchor across a newline', '\n(Firsthand: Dana Reyes) [V1]'],
]) test(`G5c: does not anchor a preceding negative claim with ${name}`, () => {
  runGate('G5c', {
    'voice-fixture/voice.md': `## Facts\nThe guide does not say this. ${tail}\n`,
    'work/onboarding/verification.md': `${claims}| N1 | V1 | yes | Dana Reyes | located |\n`,
  }, true);
});

for (const sentence of [
  'The guide does not say No. It never stated a fee. [V1]',
  'The guide does not say Acme Inc. The policy never stated a fee. [V1]',
]) test(`G5c: keeps two negative sentences separate: ${sentence}`, () => {
  const row = runGate('G5c', {
    'voice-fixture/voice.md': `## Facts\n${sentence}\n`,
    'work/onboarding/verification.md': `${claims}| N1 | V1 | yes | Dana Reyes | located |\n`,
  }, true);
  assert.match(row.detail, /no \[V<n>\] anchor/);
});

for (const [name, list, fails = false] of [
  ['accepts the explicit one-line empty statement', `${emptyList}\nMust-reach items: none.\n`],
  ['accepts an empty enumeration with an explanation', `${emptyList}\nThe must-reach enumeration is empty; the source contains none of the enumerated kinds.\n`],
  ['accepts the run 4 statement after another sentence', `${emptyList}\nThe source contains no named people or constraints. The must-reach enumeration is empty; no dummy row has been invented.\n`],
  ['accepts an explicitly empty list', `${emptyList}\nThe must-reach list is empty.\n`],
  ['fails a silent empty table', emptyList, true],
  ['fails a missing list even with an empty statement elsewhere', '## Notes\nMust-reach items: none.\n', true],
  ['fails a missing table', '## Must-reach list\nMust-reach items: none.\n', true],
  ['does not take an empty statement from another section', `${emptyList}\n## Notes\nMust-reach items: none.\n`, true],
  ['still rejects an absent-item disguise row', `${emptyList}| M1 | prohibition | none found | in-bound-file | work/plain.md#rule |\n`, true],
]) test(`G6: ${name}`, () => {
  runGate('G6', { 'work/onboarding/extraction/sample.md': list }, fails);
});

for (const [name, text, fails = false, rows = ''] of [
  ['does not read whenever as never', 'We stop whenever you raise a hand.'],
  ['does not read coffee as fee', 'We offer coffee.'],
  ['does not read commentary as comment', 'The commentary describes the event.'],
  ['does not read preapproval as approval', 'The preapproval arrived.'],
  ['matches never as a standalone word', 'Never share this.', true],
  ['matches a constraint at the end of a line', 'Sharing is prohibited', true],
  ['matches fee beside punctuation', 'The fee, payable on receipt, is stated.', true],
  ['preserves regulatory word forms', 'These are regulatory constraints.', true],
  ...['confidential', 'confidentiality', 'comment', 'comments', 'fee', 'fees', 'approval', 'approvals', 'invoice', 'invoices', 'reviewer', 'reviewers', 'tracked change', 'tracked changes', 'review note', 'review notes'].map(word => [`counts ${word}`, `Maintain ${word}.`, true]),
  ['matches multiword constraints', 'The scope of work is stated.', true],
  ['still accepts a properly covered constraint', 'Never share this.', false, '| M1 | prohibition | Never share this. | in-bound-file | work/plain.md#rule |\n'],
]) test(`G6b: ${name}`, () => {
  runGate('G6b', {
    'sources/sample.txt': `${text}\n`,
    'work/onboarding/extraction/sample.md': `source: sources/sample.txt\n\n${emptyList}${rows}`,
  }, fails);
});

for (const [name, basis, fails = false] of [
  ['allows the authority inside the source citation', 'Owns editorial approval for all outward-facing clinic communications. (Firsthand: Dana Reyes) [V1]'],
  ['allows the authority named in a substantive basis', 'Dana Reyes owns editorial approval for all clinic communications.'],
  ['allows the authority in a source link', 'Owns editorial approval for all outward-facing clinic communications. [Dana Reyes](sources/brief.md)'],
  ['keeps a domain clause inside ordinary parentheses', 'Dana Reyes (owns editorial approval for all outward-facing clinic communications under clinic policy).'],
  ['keeps a slash compound inside a substantive basis', '(brand/voice: she holds editorial approval for all outward clinic communications under clinic policy)'],
  ['fails a basis that is only the name', 'Dana Reyes', true],
  ['fails a name padded with source citations', 'Dana Reyes. (Firsthand: Dana Reyes) [V1]', true],
  ['fails a name padded with a source link', 'Dana Reyes [source](sources/brief.md)', true],
  ['fails a name padded with only a path citation', 'Dana Reyes (sources/editorial approval policy.md) [V1]', true],
  ['fails a name padded with only a working-need citation', 'Dana Reyes (Working need: owns editorial approval for all clinic communications) [V1]', true],
  ['still fails a thin assertion', 'Has approval.', true],
  ['still requires an authority domain', 'Is the right person to ask about this.', true],
]) test(`G14: ${name}`, () => {
  runGate('G14', {
    'voice-fixture/voice.md': `voice-authority-name: Dana Reyes\nvoice-authority-basis: ${basis}\nvoice-confirmation-date: 2026-11-02\n`,
  }, fails);
});

test('phase summary writes both close records in Phase 9 before its harness and reserves Phase 10 for handover', () => {
  const skill = readFileSync(join(here, '../SKILL.md'), 'utf8').split('## The full path\n')[1].split('\n## ')[0];
  assert.match(skill, /Phase 9 writes the operating file and close report before (?:running )?(?:its|the|the same) `?gates\.sh`?/);
  assert.match(skill, /Phase 10 hands over/);
  const full = readFileSync(join(here, '../full-path.md'), 'utf8');
  assert.match(full, /does not say this\. \(Firsthand: Dana Reyes\) \[V3\]/);
  assert.doesNotMatch(full, /Backticked spans carrying whitespace are still not read/);
  assert.match(full, /[Bb]ackticked spans[^\n]*whole[^\n]*spaces/);
});

for (const gate of ['G5a', 'G5c']) {
  for (const character of ['é', '’', '𐐷']) {
    for (let offset = 1; offset < Buffer.byteLength(character); offset++) {
      test(`${gate}: UTF-8 snippet keeps a character boundary (${Buffer.byteLength(character)} bytes, cut ${offset})`, () => {
        const start = 'Acme does not say ';
        const prefix = start + 'x'.repeat(90 - offset - start.length);
        const row = runGate(gate, {
          'voice-fixture/voice.md': `## Facts\n${prefix}${character} remaining words.\n`,
        }, true);
        assert.ok(row.detail.endsWith(`${prefix}...`), row.detail);
      });
    }
  }
}

for (const separator of [',', ';']) test(`G10: a registered observer permits citation details after ${separator}`, () => {
  runGate('G10', {
    'voice-fixture/voice.md': `## Facts\nA confirmed fact. (Firsthand: Priya Shah${separator} Q4, memory/answers/2026-11-02 design answers.md)\n`,
    'work/onboarding/run-record.md': '### Who confirms and on what basis\nPriya Shah confirms clinic communications.\n',
  });
});
for (const observer of ['Category Report', 'Marketing Director', 'Unknown Person']) test(`G10: citation details cannot disguise ${observer}`, () => {
  runGate('G10', {
    'voice-fixture/voice.md': `## Facts\nA claim. (Firsthand: ${observer}, Priya Shah, Q4, sources/brief.md)\n`,
    'work/onboarding/run-record.md': '### Who confirms and on what basis\nPriya Shah confirms clinic communications.\n',
  }, true);
});
for (const code of ['B1', 'C2', 'G3', 'J2b', 'K1', 'L2', 'O2', 'T9']) {
  for (const recorded of [true, false]) test(`G10: personal brand ${code} ${recorded ? 'has' : 'lacks'} a recorded answer row`, () => {
    const row=runGate('G10', {
      'AGENTS.md': '---\nroot: Test Person\ntype: personal\n---\n',
      'voice-fixture/design.md': `## Foundation\nA derived rule. (Research inference: ${code}; work/answers.json#sentence)\n`,
      'voice-fixture/answers/design answers.md': `| Number | Answer |\n|---|---|\n| ${recorded ? code : 'P1'} | A recorded answer |\n`,
    }, !recorded);
    if (!recorded) assert.match(row.detail,/no file in memory\/answers\/ records/);
  });
}

test('Phase 3 starts the operating record before G7 and Phase 9 completes it before the harness', () => {
  const full=readFileSync(join(here,'../full-path.md'),'utf8');
  const three=full.split('### Phase 3: Verification')[1].split('### Phase 4:')[0];
  const nine=full.split('### Phase 9: Close, per key')[1].split('### Phase 10:')[0];
  assert.match(three,/Start `work\/onboarding\/operating-file\.md`[^\n]*gaps known/);
  assert.match(nine,/Complete `work\/onboarding\/operating-file\.md`[^\n]*before the harness/);
});

for (const payload of ['J2b,K1', 'E1; J2b,K1', 'J2b K1']) test(`G10: a recorded answer cannot hide the unrecorded adjacent code in ${payload}`, () => {
  runGate('G10', {
    'AGENTS.md': '---\nroot: Test Person\ntype: personal\n---\n',
    'voice-fixture/design.md': `## Foundation\nA derived rule. (Research inference: ${payload})\n`,
    'voice-fixture/answers/design answers.md': '| Number | Answer |\n|---|---|\n| J2b | A recorded answer |\n',
  }, true);
});
