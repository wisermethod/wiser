import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url)), plugin = resolve(here, '../../..');
const read = path => readFileSync(join(plugin, path), 'utf8');
const harness = read('skills/Onboard Root/gates.sh').replace('MEM="$ROOT/memory"', 'MEM="$ROOT/shelf"');
const skill = read('skills/Onboard Root/SKILL.md'), full = read('skills/Onboard Root/full-path.md');
function gate(id, files, fails = false) {
  const root = mkdtempSync(join(tmpdir(), 'm54-fixture-'));
  try {
    for (const [path, bytes] of Object.entries({
      'AGENTS.md': '---\nroot: Sample Org\ntype: org\n---\n\n## Provides\n- voice: shelf/voice.md\n- design: shelf/design.md\n',
      'work/onboarding/run-record.md': '### Who confirms and on what basis\nname: Dana Reyes\n',
      ...files,
    })) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
    mkdirSync(join(root, 'tmp'));
    const child = spawnSync('bash', ['-c', harness, 'gates.sh', '--json', '--gate', id, root], { encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') } });
    assert.ifError(child.error); assert.equal(child.stderr, '');
    const [row, summary] = child.stdout.trim().split('\n').map(s => JSON.parse(s));
    assert.equal(child.status, fails ? 1 : 0, row.detail);
    assert.equal(summary.total, 1); assert.equal(row.status, fails ? 'fail' : 'pass');
    return row;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('M5.4 item 13: brand-only findings do not return or rewrite a voice file', () => {
  for (const path of ['experts/Ghost Writer/EXPERT.md', 'skills/Build Voice/SKILL.md', 'skills/Build Voice/paths/from-writing.md']) {
    const text = read(path);
    assert.match(text, /From your brand[^\n]*(citation[^\n]*tap labels|tap labels[^\n]*citation)/);
    assert.match(text, /finding confined to that section is not a return and is not rewritten/i);
    assert.match(text, /checkable[^\n]*closed[^\n]*every other section/);
  }
});

const locked = '# Design of Sample Org\n\nComplete at the lock. Colour and lettering are settled. Lock: K1. (Firsthand: Dana Reyes; work/brand/lock-answers.json#lock.question)\n\n## Typography\nbody: 16px. (Working need: lock.mjs SCALE)\n';
const finding = bound => `## Findings\n\n| Finding | Disposition | Deciding check | Where checker looked | Bound file entry |\n|---|---|---|---|---|\n| A4 | disputed | Both searches still disagree | design heading | ${bound} |\n`;
const label = '(Disputed: audit.md A4; producer and auditor still disagree about the sentence.)\n';
test('M5.4 item 14: locked design dispute survives in audit plus operating file', () => {
  const files = { 'shelf/design.md': locked, 'work/onboarding/audit.md': finding('shelf/design.md') + '\n' + label, 'work/onboarding/operating-file.md': label };
  gate('G16', files);
  gate('G16', { ...files, 'work/onboarding/operating-file.md': 'No dispute recorded.\n' }, true);
  gate('G16', { ...files, 'work/onboarding/audit.md': finding('shelf/design.md') }, true);
  gate('G16', { ...files, 'work/onboarding/operating-file.md': label.replace('A4', 'A40') }, true);
  gate('G16', { ...files, 'shelf/design.md': '# Ordinary design\n' }, true);
  gate('G16', { ...files, 'work/onboarding/audit.md': finding('shelf/missing.md') + label }, true);
  // Ordinary bound files retain the existing in-file dispute requirement.
  gate('G16', { 'shelf/design.md': '# Ordinary design\n' + label, 'work/onboarding/audit.md': finding('shelf/design.md') });
  // Lock-like words in an unbound file do not grant the exception.
  gate('G16', { ...files, 'shelf/voice.md': locked, 'work/onboarding/audit.md': finding('shelf/voice.md') + label }, true);
});

test('M5.4 item 14: relocks archive the prior file and preserve recorded disputes', () => {
  assert.match(full, /accepted correction[^\n]*relock[^\n]*prior file archived/i);
  assert.match(full, /A relock never makes a dispute disappear/);
  assert.match(full.split('\n').find(line => line.startsWith('| G16 ')), /lock.mjs[^\n]*audit[^\n]*operating/);
});

test('M5.4 item 15: personal correction and all caller writes leave state to onboarding', () => {
  const personal = skill.split('### Step 4: Read back')[1].split('### Step 5: Close')[0];
  assert.match(personal, /lock.mjs --replace --caller/);
  for (const path of ['standards/user-root.md', 'AGENTS.md']) {
    const text = read(path);
    assert.match(text, /caller[^\n]*provisional page writes[^\n]*every rerun[^\n]*Onboard Root/);
    assert.match(text, /direct run sets[^\n]*design state line/i);
  }
});

for (const [basis, fails] of [
  ['This is not a fallback. Department lead confirming Member Services support wording and output routing', false],
  ['Department lead not confirming Member Services support wording and output routing', true],
  ['Department lead not confirms Member Services support wording and output routing', true],
  ['Not previously reviewed. Department lead confirms Member Services support wording and output routing', false],
]) test(`M5.4 item 16: ${basis}`, () => {
  gate('G14', { 'shelf/voice.md': `voice-authority-name: Dana Reyes\nvoice-authority-basis: ${basis}\nvoice-confirmation-date: 2026-11-03\n` }, fails);
});
test('M5.4 item 16: an affirmative fallback still requires outstanding signoff', () => {
  const voice = 'voice-authority-name: Dana Reyes\nvoice-authority-basis: This is a fallback. Department lead confirming Member Services support wording and output routing\nvoice-confirmation-date: 2026-11-03\n';
  gate('G14', { 'shelf/voice.md': voice }, true);
  gate('G14', { 'shelf/voice.md': voice + 'voice-authority-fallback-signoff: Department director\n' });
});
test('M5.4 item 16: G14 row limits negation to immediately before the verb', () => {
  assert.match(full.split('\n').find(line => line.startsWith('| G14 ')), /no `not` immediately before either verb/);
});

test('M5.4 item 17: summaries start operating record at Phase 3 and protect a stopped design', () => {
  assert.equal((skill.match(/Phase 3 starts the operating file, and Phase 9 completes it/g) || []).length, 2);
  assert.match(full, /stopped sitting's provisional `design.md`[^\n]*not hand-edited[^\n]*Record the failure[^\n]*resume to Build Brand/);
  assert.match(skill, /stopped sitting's provisional `design.md`[^\n]*not hand-edited[^\n]*record the failure[^\n]*resume to Build Brand/i);
});
