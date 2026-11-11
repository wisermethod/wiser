import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// These are instruction-contract checks, not a Housekeeping executor. The
// varied before/plan/after fixtures are kept by the build that requested them.
// An explicit override lets that build run these same checks on old text.
const root = process.env.WISER_INSTRUCTION_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = path => readFileSync(join(root, path), 'utf8');
const house = read('skills/Housekeeping/SKILL.md');
const adoption = read('skills/Onboard Root/existing-root.md');
const standard = read('standards/user-root.md');

test('C16 placement preserves the owner note and does not depend on an opening paragraph', () => {
  assert.match(standard, /as its first section, before any other heading/);
  assert.match(house, /Immediately before the first body section heading, after all preceding owner prose/);
  assert.match(house, /An opening paragraph is not required, and a note after one does not call for a placement question/);
  assert.match(house, /If there is no section heading, append it after all existing bytes/);
});

test('finding 1: front matter and fenced lookalikes are excluded and every next heading ends the span', () => {
  assert.match(house, /count only body `## Always` headings outside front matter and fenced blocks; occurrences inside either are not sections/);
  assert.match(house, /next body section heading of any level, or end of file/);
  assert.match(house, /unclosed front matter block or fence prevents locating a body destination/);
});

test('finding 2: adoption explicitly invokes Housekeeping after declaration and waits for its plan', () => {
  const step4 = adoption.split('4. **Declare.**')[1].split('5. **Rebuild memory')[0];
  assert.match(step4, /Housekeeping Step 2's body-heading, section-span and destination definitions/);
  assert.match(step4, /after the identity lines are written, invoke `skills\/Housekeeping\/` by name on the now-declared root/);
  assert.match(step4, /must return the concrete plan before this companion continues to Step 5 or close/);
  assert.match(step4, /name any pending row-5 work to the owner in the reply even on a personal adoption with no close report/);
});

test('finding 3: the stamp write requires a unique equal first block and duplicates have an apply path', () => {
  const step7 = house.split('7. **Routing.**')[1].split('8. **Plan.**')[0];
  assert.match(step7, /set layout to 5 only when exactly one body `## Always` section has bytes equal to the template's and is the first section at the recorded destination/);
  assert.match(adoption, /Set layout to 5 only when exactly one body section has the template's bytes and is first/);
  assert.match(standard, /misfiled when there is more than one/);
  const duplicates = house.split('**More than one:**')[1].split('\n\n')[0];
  assert.match(duplicates, /After the answer, propose one `update` row removing all the old section spans and inserting exactly one template section/);
  assert.match(duplicates, /archive the complete original/);
  assert.match(duplicates, /separate approval/);
});

test('finding 4: one-context coach and full-path instructions stop before confirmation and close', () => {
  const coach = read('skills/Build Voice/paths/coach.md');
  const voice = read('skills/Build Voice/SKILL.md');
  const full = read('skills/Onboard Root/full-path.md');
  assert.match(coach, /Until the independent review returns and its findings are worked, stop before Step 6: show no first piece, ask no A2/);
  assert.doesNotMatch(voice, /did not draft the voice where the host offers one/);
  assert.match(voice, /coach waits before Step 6 for that review/);
  assert.match(full, /Stop before Phase 9: write no close report and perform no Phase 10 handover until the independent pass returns/);
  assert.doesNotMatch(full, /record the pending audit in[^\n]*close-report/);
});

test('finding 5: moving the equal block archives the file and overlay refusal has one scope', () => {
  const move = house.split('**One, text equal, wrong place:**')[1].split('\n')[0];
  assert.match(move, /removal and insertion as one add-or-replace `update` row under `AGENTS.md` Irreversibles/);
  assert.match(move, /archiving the complete `AGENTS.md` first/);
  assert.match(house, /no whole-file template overlay onto a populated folder/);
});

test('finding 6: the approved SHA-256 is checked at each template or copy comparison', () => {
  const starter = read('skills/Onboard Root/tests/starter.test.mjs');
  assert.match(starter, /function approvedAlwaysSection\(\)[\s\S]*?createHash\('sha256'\)[\s\S]*?2f0d5e83370268a540b3e7a6b722ea89897c0317cc6897b48b4d2bd855caeff9/);
  assert.match(starter, /alwaysSection\(copied\).equals\(approved\)/);
  assert.match(starter, /alwaysSection\(starter\).equals\(approved\)/);
});

test('Part A: core path, core import exception and both no-folder branches agree', () => {
  const script = read('standards/script-contract.md');
  assert.match(script, /module matching `scripts\/\*\*\/\*-core\.js` in the tool's own directory, archives and installed packages excepted/);
  assert.match(script, /a core excepted, which imports none \(Core first\)/);
  assert.match(read('AGENTS.md'), /No folder attached at all: deliver what they ask for in the chat; work that must last, such as a site, a book or a video, needs a folder first, and its skill says so\. Never hunt\./);
  assert.match(read('standards/conventions.md'), /where the plugin is installed, the skill asks only for a folder and does not mention installing/);
});

test('empty AGENTS.md is an undeclared working file and cannot be overwritten by the copy path', () => {
  assert.match(house, /a target holding only that empty file is populated-undeclared and takes no empty-copy path/);
  assert.match(read('skills/Onboard Root/SKILL.md'), /An existing `AGENTS.md`, even empty, is a working file:[^\n]*only on an adoption request, never overwrite it on an empty-copy path/);
});

for (const [name, value, reviewers, close, fails] of [
  ['independent completed audit', 'yes', 'Independent reader', '', false],
  ['disclosed shared context', 'no', 'Producing context', 'The audit was not independent.', true],
  ['undisclosed shared context', 'no', 'Producing context', '', true],
  ['no reviewers', 'yes', '', '', true],
  ['invalid independence value', 'maybe', 'Independent reader', '', true],
]) test(`G15: ${name}`, t => {
  const fixture = mkdtempSync(join(tmpdir(), 'folder-g15-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, 'work/onboarding'), { recursive: true });
  writeFileSync(join(fixture, 'AGENTS.md'), '---\ntype: org\n---\n');
  writeFileSync(join(fixture, 'work/onboarding/audit.md'), `# Audit\n\nindependent-context: ${value}\nreviewers: ${reviewers}\n`);
  if (close) writeFileSync(join(fixture, 'work/onboarding/close-report.md'), `## Audit disposition\n\n${close}\n`);
  const result = spawnSync('bash', [join(root, 'skills/Onboard Root/gates.sh'), '--json', '--gate', 'G15', fixture], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  assert.equal(result.status, fails ? 1 : 0, result.stdout);
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows[0].gate, 'G15');
  assert.equal(rows[0].status, fails ? 'fail' : 'pass');
});
