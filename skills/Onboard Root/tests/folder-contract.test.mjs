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
  assert.match(step7, /set layout to the integer `standards\/user-root\.md` C1 names only when exactly one body `## Always` section has bytes equal to the template's and is the first section at the recorded destination/);
  assert.match(adoption, /Set layout to the integer `standards\/user-root\.md` C1 names only when exactly one body section has the template's bytes and is first/);
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
  assert.match(starter, /function approvedAlwaysSection\(\)[\s\S]*?createHash\('sha256'\)[\s\S]*?8ec292480309c0975513cdf2c118493c98788687d8ba26fb737cb81ef1a2394a/);
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

function step(skill, number) {
  return skill.split('\n## Steps\n')[1].split(`\n${number}. `)[1].split(/\n(?:\d+\. |## )/)[0];
}

for (const [name, skill, checkerSteps] of [
  ['Housekeeping', house, [3, 9]],
  ['existing root', adoption, [2, 9]],
]) {
  test(`${name} routes both sets through one delivery citation beside the work`, () => {
    const files = skill.split('## Wiser files\n')[1].split('\n## Steps')[0];
    const method = 'Beside the work, to read, compare with or run.';
    assert.ok(read('tools/DELIVERY.md').includes(method));
    assert.equal(skill.match(/tools\/DELIVERY\.md/g)?.length, 1);
    assert.match(files, /can this session read [^\n]*installed[^\n]*\?/);
    assert.match(files, /\*\*Yes\.\*\* Use [^\n]*installed paths/);
    assert.match(files, /\*\*No\.\*\* [^\n]*file set `starter-personal`[^\n]*by the delivery page `tools\/DELIVERY\.md`/);
    for (const number of checkerSteps) {
      assert.match(step(skill, number), /On the delivery path, [^\n]*`reference-check`[^?]*\? No: get the file set `reference-check` now by the delivery page, unpacked \*\*Beside the work, to read, compare with or run\.\*\*\. Yes: use its checked copy/);
    }
    assert.ok(files.includes(method));
    assert.match(files, /Leave the member's folder untouched during delivery/);
    assert.match(files, /it runs from that set's own `tools\/reference-check\/`/);
  });
}

test('Housekeeping compares the delivered personal template and reacquires the sets for apply', () => {
  assert.match(house, /anything other than `personal`[^\n]*I need the Wiser plugin to update this folder[^\n]*stop/);
  assert.match(house, /Use the delivered starter directory for every template read, including `AGENTS\.md`, `memory\/answers\/AGENTS\.md` and `programs\/AGENTS\.md`/);
  assert.match(house, /frontmatter `type:` line, outside the section being compared/);
  assert.match(house, /Use Step 2's span to compare every byte of `## Always`/);
  assert.match(house, /For Step 9, make the same decision again\. On the delivery path, get the starter again/);
  assert.match(step(house, 9), /has `reference-check` been delivered for this apply\?/);
  assert.match(house, /After Step 8 writes or returns the plan, before waiting for approval, and when Step 9 finishes[^\n]*every delivered copy, including its Step 6/);
  for (const number of [2, 3, 9]) {
    assert.match(step(house, number), /selected under Wiser files/);
  }
});

test('existing-root checks for its plugin-only prerequisites before taking the snapshot', () => {
  const no = adoption.split('\n').find((line) => line.startsWith('- **No.**'));
  assert.match(no, /Is the folder's type `personal`\? No: stop before Step 2[^\n]*I need the Wiser plugin/);
  assert.match(no, /Yes: get the file set `starter-personal`/);
  assert.match(no, /its `memory\/about\.md`, `memory\/design\.md` and `memory\/voice\.md` are the personal prompt sheets/);
  assert.match(no, /holds no `prompts\/` directory/);
  assert.match(no, /a gate that reads `gates\.sh` is recorded SKIP/);
  assert.doesNotMatch(adoption, /installed at `system\/templates/);
  for (const text of [house, adoption]) assert.match(text, /never from `read_skill_file`/);
  assert.match(adoption, /select sources under Wiser files before scoring any clause that reads the template/);
  assert.match(adoption, /every delivered copy after its last use or on an early stop, including its Step 6/);
});

test('connector update stops before a plan if the scan did not run successfully', () => {
  assert.match(step(house, 3), /has `reference-check` been delivered in this run\?[\s\S]*?node check\.cjs scan --root <target>[\s\S]*?did the scan run and return that JSON\? No: stop without producing a plan\. Yes: continue/);
});

test('connector update and adoption meet the local template decision before a template path', () => {
  const beforeTemplate = [house, adoption].map(skill => skill.split('`system/templates/User Root Template/')[0]);
  const decision = /Read Wiser files before following any template citation[\s\S]*?before opening any template path[\s\S]*?never from `read_skill_file`/;
  assert.deepEqual(beforeTemplate.map(text => decision.test(text)), [true, true]);
});

test('a first-use Housekeeping plan home requires the same approval as the listed edits', () => {
  assert.deepEqual({
    listed: /a `create` row citing `standards\/user-root\.md` C8 for each missing directory in `zBuilds\/playbooks\/` and for `zBuilds\/playbooks\/housekeeping\.plan\.md`/.test(step(house, 8)),
    asked: /including any plan-home rows, and ask one question\. "Do you approve applying these rows as listed\?"/.test(step(house, 8)),
    enforced: /No, including no answer: stop before any apply write[\s\S]*?Take the snapshot[\s\S]*?Apply the approved rows, writing only the approved paths in the target/.test(step(house, 9)),
    handedOff: /Housekeeping Step 8's single approval question[\s\S]*?No, including no answer: authorize no apply or plan-home write/.test(step(adoption, 3)),
  }, { listed: true, asked: true, enforced: true, handedOff: true });
});

test('connector update and adoption read the archive standard before naming replacement paths', () => {
  const readArchives = /have you read Archives in `wiser\/standards\/conventions\.md`\? No: read that file with the connector's `read_skill_file`/;
  const beforePlan = house.split('\n## Steps\n')[0];
  const beforeSnapshot = step(adoption, 2).split('Inventory the root')[0];
  assert.deepEqual([beforePlan, beforeSnapshot].map(text => readArchives.test(text)), [true, true]);
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

test('a stop on the delivery path removes the delivered copies, and the checker is its own set', () => {
  assert.match(house, /Every other stop on the delivery path[^\n]*first finishes the page for every copy this run delivered, including its Step 6/);
  assert.match(house, /The checker is not in the starter: it is the set `reference-check`/);
  assert.doesNotMatch(house, /Read and run the checker from the delivered/);
  assert.match(house, /Step 2's rule against making first-use homes does not drop them/);
  assert.match(adoption, /Did Housekeeping stop without a plan\? Yes: finish the page for every delivered copy/);
  assert.match(adoption, /The checker is not in the starter/);
});

test('contract row 3 owes the Work Directories cell, never the first-use router file', () => {
  const standard = read('standards/user-root.md');
  const row3 = standard.split('\n').find(line => line.startsWith('| 3 |'));
  assert.match(row3, /the cell is the one in the root's Work Directories table that names `memory\/knowledge\/AGENTS\.md`/);
  assert.match(row3, /The router file is not the cell and is not owed by this row: C3 makes it first use, so a root with no set has none, and its absence there is not a finding and holds no stamp back/);
  // A set without its row stays owed: the no-set case excuses nothing else.
  assert.match(row3, /A set without a row, or a row naming no set directory, is C12's absent or misfiled and is still owed/);
  assert.match(step(house, 2), /Contract row 3's router cell is the cell in the root's Work Directories table that names `memory\/knowledge\/AGENTS\.md`, never that file: the file is first use \(`standards\/user-root\.md` C3\), so where the root has no set its absence is not a finding, owes no row and does not hold the stamp back\./);
  assert.doesNotMatch(read('system/templates/User Root Template/AGENTS.md'), /memory\/knowledge\/AGENTS\.md` \| ships/);
});

test('a populated destination is adopted around what is there, never copied over', () => {
  const entry = read('skills/Onboard Root/SKILL.md');
  assert.match(entry, /The three ways below copy only into an empty destination\. A destination that already holds working files is never copied into by any of them, and the template is never laid over what it holds\./);
  assert.match(entry, /the Destination discriminator sends it to `existing-root\.md`, which builds the root around what is there, creating the template files the folder lacks, each only where no path stands/);
  const step4 = adoption.split('4. **Declare.**')[1].split('5. **Rebuild memory')[0];
  assert.match(step4, /Where the target holds no root `AGENTS\.md`, create it from the template's `AGENTS\.md` selected under Wiser files/);
  assert.match(step4, /Create only specifically listed new files, each exclusively: test `\[ -e "\$dest" \]` first and leave a path that exists as it is, reporting it, or copy with `cp -n`/);
  assert.match(step4, /the template's `prompts\/` directory is never created in the target/);
});

test('the folder name and the person name stay two answers, and installed, attached and onboarded are told apart', () => {
  const step1 = read('skills/Onboard Root/SKILL.md').split('### Step 1: Copy')[1].split('### Step 2: Voice')[0];
  assert.match(step1, /The folder's name and the person's name are two answers/);
  assert.match(step1, /fill `the folder owner` as the person's name, never the folder's name or a guess/);
  assert.match(step1, /the scaffold is installed when the copy and the fill above pass; the host is attached when a session loads the folder[^;]*; and the owner is onboarded only when Step 5 closes\. A root on disk that no session loads is installed, not onboarded\./);
});

test('an unattended run stops at template-pending and silence is no answer', () => {
  const entry = read('skills/Onboard Root/SKILL.md');
  const step2 = entry.split('### Step 2: Voice')[1].split('### Step 3')[0];
  assert.match(step2, /Is this run unattended, because the request or its caller says no person will answer during it\? Yes: stop here, at template-pending\./);
  assert.match(step2, /Do not run the coach, Step 3's design question, the read-back or the close, and do not call `first_run`\./);
  assert.match(step2, /silence is never read as declining the coach, as "Let's do this later", or as any other choice/);
  // The unattended stop comes before the coach runs.
  assert.ok(step2.indexOf('Is this run unattended') < step2.indexOf('Run it now'));
  assert.match(entry, /A run that stopped before this close never calls it\./);
  assert.match(entry, /The personal path makes no competitors offer, so the section carries no competitors line/);
});

test('a verified pre-staged original can stand as the adoption snapshot', () => {
  const step2 = step(adoption, 2);
  assert.match(step2, /where the caller permits writes only inside `<target>`, stand a pre-staged original in for it/);
  assert.match(step2, /two enumerations by different mechanisms find every file in `<target>`, not only those in the change union, present in the original with equal size and SHA-256, and every directory present in both/);
  assert.match(step2, /Anything else, or an original that cannot be read, is no rollback: stop before the first target write\./);
  assert.match(step(house, 9), /a pre-staged original `skills\/Onboard Root\/existing-root\.md` Step 2 verified included/);
});

test('references unresolved before an adoption take an approved baseline, and none may be new', () => {
  const step3 = step(house, 3);
  assert.match(step3, /or, on an adoption `skills\/Onboard Root\/existing-root\.md` hands over, an approved baseline: a reference already unresolved in the adoption's baseline scan/);
  assert.match(step3, /An unresolved concrete consumer outside that baseline, or an unclassified hit, stops apply\./);
  assert.match(step3, /require zero unresolved concrete references outside the approved baseline, matched occurrence for occurrence/);
  assert.match(house, /Apply success requires zero unresolved concrete references outside an approved baseline/);
});

test('the adoption path carries the unattended stop, the coach flag and the name re-ask itself', () => {
  assert.match(step(adoption, 1), /Does a memory file's first heading carry `the folder owner`[^?]*\? Yes, and a person is here: ask Step 1's name question before any memory write and take the answer as the settled name, which Step 5 writes over the stand-in once Step 2's snapshot covers those files/);
  const step5 = step(adoption, 5);
  assert.match(step5, /^\*\*Rebuild memory from source\.\*\* On a personal root, is the run unattended, as `SKILL\.md` Step 2 defines it\? Yes: rebuild nothing here or in Step 6\./);
  assert.match(step5, /leave the Onboarding lines as the template ships them; skip Step 8's close;/);
  assert.match(step5, /call no `first_run`; and report as `SKILL\.md` Step 2 says/);
  const step6 = step(adoption, 6);
  assert.match(step6, /Personal: an unattended run was settled at Step 5\. Otherwise hand it to `skills\/Build Voice\/` by name, saying that personal onboarding is running it, so it leaves the first-run finish to the close/);
  // Build Voice's coach skips its own finish only when Onboard Root runs it.
  assert.match(read('skills/Build Voice/paths/coach.md'), /the coach was not run by `skills\/Onboard Root\/`/);
});

test('an adoption creates every template file the folder lacks, without the copy path\'s fill', () => {
  const step4 = step(adoption, 4);
  assert.match(step4, /the listed files include every file the selected template ships that the target still lacks after Housekeeping's rows, `CLAUDE\.md` and each `\.gitkeep` among them, other than the bound memory files Steps 5 and 6 write/);
  assert.match(step4, /with the settled type and the root's folder name written for `\[name\]`/);
  // The copy path's fill script reads all four files and re-copies on failure: never an adoption's.
  assert.doesNotMatch(step4, /Step 1's fill/);
});

test('the pre-staged route settles created paths, links, G3 and recovery without the checker manifest', () => {
  const step2 = step(adoption, 2);
  assert.match(step2, /Before the first target write, also run the checker's `scan` on `<target>` and keep its JSON, with each unresolved occurrence's line text read from its file beside it: it is this adoption's reference baseline, handed in `<context>` to every Housekeeping invocation below/);
  assert.match(step2, /every path the union creates absent from both; and no path `tools\/reference-check\/snapshot\.md` refuses: a link in the union or above it inside `<target>`/);
  assert.match(step2, /the checker's `g3`, `restore` and `verify`, which read a manifest this route does not have, do not run/);
  assert.match(step(adoption, 9), /on a pre-staged original, G3, restore and verify are Step 2's/);
  assert.match(step(house, 9), /or, on a pre-staged original, the restore and verify that Onboard Root step names/);
  const step3 = step(house, 3);
  assert.match(step3, /which that file's Step 2 takes before the adoption's first write and hands to every invocation in `<context>`, never a scan taken later/);
  assert.match(step3, /an occurrence on a line this adoption changed, or one more than the baseline holds, is new/);
});

test('gates never take the unattended stand-in as the owner', () => {
  const gates = read('skills/Onboard Root/gates.sh');
  const fn = gates.slice(gates.indexOf('about_owner() {'), gates.indexOf('\n}\n', gates.indexOf('about_owner() {')) + 3);
  const dir = mkdtempSync(join(tmpdir(), 'about-owner-'));
  try {
    for (const [heading, want] of [['# About the folder owner', ''], ['# About [name]', ''], ['# About Dana Ortiz', 'Dana Ortiz']]) {
      writeFileSync(join(dir, 'about.md'), `<!-- provenance-preamble -->\n${heading}\n`);
      const out = spawnSync('bash', ['-c', `${fn}\nSHORT=1; MEM="$1"; about_owner`, 'x', dir], { encoding: 'utf8' });
      assert.equal(out.status, 0, out.stderr);
      assert.equal(out.stdout, want, heading);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the pre-staged G3 re-hashes the original alone, and restore keeps its record until verify', () => {
  const step2 = step(adoption, 2);
  assert.match(step2, /A union that grows is checked again the same way for its new paths alone\./);
  assert.match(step2, /removes every created path but those records; verify then compares every path in the union, those records aside, with the before enumeration, and only then are the records removed/);
  assert.match(step2, /Step 9's G3 is the record of the two enumerations' agreement, a re-hash of the original alone against the before enumeration, and a re-hash of every file in `<target>` outside the union against it, where a difference is a write no row approved and restores; it is never a comparison of the union's changed paths with the original/);
});

test('the adoption baseline reaches every Housekeeping invocation and its after-apply check', () => {
  assert.match(step(adoption, 3), /`<context>` carrying the chain, System Expert verdict, family indexes, named plan home and Step 2's reference baseline/);
  assert.match(house, /and, on an adoption, the reference baseline `skills\/Onboard Root\/existing-root\.md` Step 2 took\./);
  assert.match(step(house, 3), /against that adoption baseline, never this invocation's own scan/);
  assert.match(step(house, 9), /and, on an adoption, the adoption baseline in `<context>`\? No: return to Step 3 before any apply write/);
});

test('an unattended adoption records the close-state gates SKIP and lists no prompts', () => {
  assert.match(step(adoption, 5), /in Step 9, record each gate that reads a closed key, a filled prompt line or a close record SKIP, the root being template-pending, which is no failure and restores nothing/);
  assert.match(step(adoption, 5), /Where Step 1 settled a name over the stand-in, write it over `the folder owner` in each memory file's first heading, voice included, before any rebuild\./);
  assert.match(step(adoption, 4), /other than the bound memory files Steps 5 and 6 write and the template's `prompts\/` directory\./);
});

test('G18 fails a memory heading that still carries the unattended stand-in', () => {
  const harness = read('skills/Onboard Root/gates.sh');
  const run = (heading, scoped) => {
    const dir = mkdtempSync(join(tmpdir(), 'g18 stand-in '));
    try {
      mkdirSync(join(dir, 'memory'), { recursive: true }); mkdirSync(join(dir, 'tmp'));
      writeFileSync(join(dir, 'AGENTS.md'), '---\ntype: personal\n---\n\n## Provides\n- about: memory/about.md\n');
      writeFileSync(join(dir, 'memory/about.md'), `<!-- provenance-preamble -->\n<!-- /provenance-preamble -->\n\n${heading}\n\n## Who\n\nA line.\n`);
      const args = ['-c', harness, 'gates.sh', '--json', '--gate', 'G18', ...(scoped ? ['--file', 'memory/about.md'] : []), dir];
      const child = spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, TMPDIR: join(dir, 'tmp') } });
      return JSON.parse(child.stdout.trim().split('\n')[0]).status;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  for (const scoped of [false, true]) {
    assert.equal(run('# About the folder owner', scoped), 'fail', `stand-in, scoped=${scoped}`);
    assert.equal(run('# About Dana Ortiz', scoped), 'pass', `named, scoped=${scoped}`);
  }
});
