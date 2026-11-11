import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../gates.sh'), 'utf8');
const harness = source.replace('MEM="$ROOT/memory"', 'MEM="$ROOT/shelf"');
const path = readFileSync(join(here, '../full-path.md'), 'utf8');
function gate(id, files, { file, fails = false, personal = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'r5-fixture-'));
  try {
    for (const [name, bytes] of Object.entries({
      'AGENTS.md': `---\nroot: Sample Person\ntype: ${personal ? 'personal' : 'org'}\n---\n\n## Provides\n- voice: shelf/voice.md\n- design: shelf/design.md\n`,
      'work/onboarding/run-record.md': '### Who confirms and on what basis\nname: Dana Reyes\n',
      'shelf/voice.md': '## Voice\n[Not available: no voice supplied]\n',
      'shelf/design.md': '## Design\n[Not available: no design supplied]\n', ...files,
    })) {
      mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), bytes);
    }
    mkdirSync(join(root, 'tmp'));
    const r = spawnSync('bash', ['-c', harness, 'gates.sh', '--json', '--gate', id, ...(file ? ['--file', file] : []), root], { encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') } });
    assert.ifError(r.error); assert.equal(r.stderr, ''); assert.equal(r.status, fails ? 1 : 0, r.stdout);
    const [row, summary] = r.stdout.trim().split('\n').map(s => JSON.parse(s));
    assert.equal(row.status, fails ? 'fail' : 'pass'); assert.equal(summary.total, 1); assert.equal(summary.skip, 0);
    return row;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const [basis, fails] of [
  ['We are not confirming any domain of authority here', true],
  ['Department lead not confirming Member Services support wording and output routing', true],
  ['Department lead confirms Member Services support wording and output routing', false],
  ['Department lead confirming Member Services support wording and output routing', false],
  ['The Member Services department lead confirming support', true],
  ['The Member Services department lead confirms support', true],
  ['We are confirming Member Services support wording and output routing', true],
  ['Department lead is not confirming any domain of authority here', true],
]) test(`G14 role confirmation: ${basis}`, () => {
  gate('G14', { 'shelf/voice.md': `voice-authority-name: Dana Reyes\nvoice-authority-basis: ${basis}\nvoice-confirmation-date: 2026-11-02\n` }, { fails });
});
test('G14 row describes the role, both verbs, two words and the negation refusal', () => {
  const row = path.split('\n').find(s => s.startsWith('| G14 '));
  assert.match(row, /role word immediately before/); assert.match(row, /`confirming` or `confirms`/);
  assert.match(row, /two words after/); assert.match(row, /`not` immediately before/);
});

test('Phase 7 scopes every design exit gate even when the voice still has a prompt', () => {
  const phase = path.split('### Phase 7:')[1].split('### Phase 8:')[0];
  assert.match(phase, /Exit: G9, G11, G11b[^\n]*--gate <id> --file memory\/design\.md/);
  const files = { 'shelf/voice.md': '## Voice\n*An unanswered prompt*\n', 'shelf/design.md': '## Design\n[Not available: no design supplied]\n' };
  gate('G9', files, { file: 'shelf/design.md' }); gate('G9', files, { fails: true });
});
test('a saved copy of the current G18 failure cannot create a new personal placeholder hit', () => {
  const row = gate('G18', { 'work/brand/note.txt': 'Fill in [name].\n' }, { personal: true, fails: true });
  gate('G18', { 'work/brand/gates-saved.txt': row.detail + '\n' }, { personal: true });
});
test('the placeholder hand check gives the exact G18 pattern and code-prefix rule', () => {
  const pattern = source.match(/placeholder='([^']+)'/)[1];
  const line = path.split('\n').find(s => s.startsWith('**The placeholder tokens**'));
  assert.ok(line.includes('`' + pattern + '`'), line);
  assert.match(line, /G18/); assert.match(line, /code-prefix/);
});

for (const personal of [false, true]) test(`G11b passes a scoped design with no figures as not applicable (personal: ${personal})`, () => {
  const row = gate('G11b', {}, { file: 'shelf/design.md', personal });
  assert.match(row.detail, /not applicable/);
});
test('scoped G11b still checks figure tables and does not inspect other bound files', () => {
  const invalid = '## Figures\n| Figure |\n|---|\n| 12 |\n';
  gate('G11b', { 'shelf/voice.md': invalid }, { file: 'shelf/design.md' });
  gate('G11b', { 'shelf/design.md': invalid }, { file: 'shelf/design.md', fails: true });
  const valid = '## Figures\n| Figure | Unit | Denominator | Tool | Window | Label | Source |\n|---|---|---|---|---|---|---|\n| 1 | item | all items | counter | 2026-11-02 | Verified | sources/note.txt |\n';
  const row = gate('G11b', { 'shelf/design.md': valid }, { file: 'shelf/design.md' });
  assert.doesNotMatch(row.detail, /not applicable/);
});
