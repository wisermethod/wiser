import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
// Redirect the shelf, preserving the actual parser and driver. No memory is read.
const harness = readFileSync(join(here, '../gates.sh'), 'utf8').replace('MEM="$ROOT/memory"', 'MEM="$ROOT/shelf"');
const claims = '## Claims\n| Row |\n|---|\n| V1 |\n\n## Negative claims\n| Row | Anchor | All containers | Second reader | Outcome |\n|---|---|---|---|---|\n';
const agents = '---\nroot: Test Root\ntype: org\n---\n\n## Provides\n- design: shelf/design.md\n';
function gate(id, files = {}, { file, status = 0, setup = () => {} } = {}) {
  const root = mkdtempSync(join(here, 'r3-fixture-'));
  try {
    for (const [path, bytes] of Object.entries({
      'AGENTS.md': agents,
      'shelf/about.md': '## Facts\n[Not available: not supplied]\n',
      'shelf/design.md': '## Type\n[Not available: not chosen]\n',
      'work/onboarding/verification.md': claims,
      ...files,
    })) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes);
    }
    mkdirSync(join(root, 'tmp')); setup(root);
    const args = ['-c', harness, 'gates.sh', '--json', '--gate', id];
    if (file !== undefined) args.push('--file', file === 'absolute' ? join(root, 'shelf/about.md') : file);
    const child = spawnSync('bash', [...args, root], { encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') } });
    assert.ifError(child.error); assert.equal(child.status, status, child.stdout + child.stderr);
    if (status === 2) return child.stderr;
    assert.equal(child.stderr, '');
    const rows = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2); assert.equal(rows[1].total, 1); assert.equal(rows[1].skip, 0);
    return rows[0];
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const state of ['provisional', 'complete']) {
  for (const id of ['G5a', 'G5c', 'G10']) test(`m51-r3: ${id} accepts the bound design's standalone State: ${state}`, () => {
    gate(id, { 'shelf/design.md': `State: ${state}\n\n## Type\n[Not available: not chosen]\n` });
  });
  test(`m51-r3: G5a still checks State: ${state} outside design and with appended claims`, () => {
    gate('G5a', { 'shelf/about.md': `State: ${state}\n` }, { status: 1 });
    gate('G5a', { 'shelf/design.md': `State: ${state}; Acme has 12 offices.\n` }, { status: 1 });
  });
  test(`m51-r3: G5a accepts a CRLF State: ${state} with a normalized design binding`, () => {
    gate('G5a', { 'AGENTS.md': agents.replace('shelf/design.md', './shelf/design.md'), 'shelf/design.md': `State: ${state}\r\n\r\n## Type\r\n[Not available: not chosen]\r\n` });
  });
}
test('m51-r3: G5a follows a custom design binding and preserves diagnostic lines', () => {
  const row = gate('G5a', {
    'AGENTS.md': agents.replace('shelf/design.md', '`shelf/brand rules.md`'),
    'shelf/brand rules.md': 'State: provisional\n\nAcme has 12 offices.\n',
  }, { status: 1 });
  assert.match(row.detail, /line 3:/); assert.doesNotMatch(row.detail, /line 1:/);
});

for (const id of ['G5a', 'G5c', 'G9', 'G10', 'G11', 'G11b', 'G18', 'G19']) {
  const bad = {
    G5a: 'Acme has 12 offices.', G5c: 'The report does not say this.', G9: '*An unanswered prompt*',
    G10: '(Research inference: no source)', G11: '[Unsupported: invented label]',
    G11b: '## Figures\n| Figure |\n|---|\n| 12 |', G18: '[name]', G19: 'work/missing.md',
  }[id];
  test(`m51-r3: ${id} --file checks only the selected bound file`, () => {
    // G11b skips a file without figures; use a real valid figures table so
    // this checks a scoped pass without changing that existing skip rule.
    const good = id === 'G11b' ? { 'shelf/about.md': '## Figures\n| Figure | Unit | Denominator | Tool | Window | Label | Source |\n|---|---|---|---|---|---|---|\n| 1 | item | all items | counter | 2026-11-02 | Verified | sources/note.txt |\n' } : {};
    gate(id, { ...good, 'shelf/design.md': `## Facts\n${bad}\n` }, { status: 1 });
    gate(id, { ...good, 'shelf/design.md': `## Facts\n${bad}\n` }, { file: 'shelf/about.md' });
    gate(id, { 'shelf/about.md': `## Facts\n${bad}\n` }, { file: 'shelf/about.md', status: 1 });
  });
}
test('m51-r3: --file accepts an absolute bound path', () => gate('G9', {}, { file: 'absolute' }));
for (const file of ['shelf/missing.md', 'work/onboarding/verification.md', 'shelf/answers/test.md', 'shelf/zArchive/old.md', '../outside.md']) test(`m51-r3: --file refuses an unbound path ${file}`, () => {
  gate('G9', { 'shelf/answers/test.md': 'A row', 'shelf/zArchive/old.md': 'Old' }, { file, status: 2 });
});
test('m51-r3: --file refuses a file symlink leaving the root', () => {
  gate('G9', {}, { file: 'shelf/escape.md', status: 2, setup: root => symlinkSync(join(here, 'm51.test.mjs'), join(root, 'shelf/escape.md')) });
});
test('m51-r3: --file refuses a record gate', () => gate('G2', {}, { file: 'shelf/about.md', status: 2 }));
test('m51-r3: scoped G10 does not run the unrelated personal voice answer check', () => {
  const files = {
    'AGENTS.md': agents.replace('type: org', 'type: personal'),
    'shelf/voice.md': 'A rule. (P99)\n',
    'shelf/answers/2026-11-02 voice answers.md': '| Number | Answer |\n|---|---|\n| P1 | A recorded answer |\n',
  };
  gate('G10', files, { status: 1 }); gate('G10', files, { file: 'shelf/about.md' });
});
test('m51-r3: scoped G19 leaves other bindings outside the phase exit', () => {
  gate('G19', { 'AGENTS.md': agents + '- voice: shelf/missing.md\n' }, { status: 1 });
  gate('G19', { 'AGENTS.md': agents + '- voice: shelf/missing.md\n' }, { file: 'shelf/about.md' });
});
test('m51-r3: Phase 4 documents file scope for each of its exit gates', () => {
  const phase = readFileSync(join(here, '../full-path.md'), 'utf8').split('### Phase 4:')[1].split('### Phase 5:')[0];
  assert.match(phase, /--gate <id> --file memory\/about\.md/);
  assert.match(readFileSync(join(here, '../gates.sh'), 'utf8'), /--file <bound file>/);
});

test('m51-r3: unknown publication date has an explicit receipt-date grammar', () => {
  const grammar = readFileSync(join(here, '../record-grammars.md'), 'utf8').split('### `extraction/<source>.md`')[1].split('### `evidence/')[0];
  assert.match(grammar, /provenance-date: unknown; received YYYY-MM-DD/);
  assert.match(grammar, /publication date/); assert.match(grammar, /receipt date/);
});
for (const id of ['G2', 'G6', 'G6b', 'G10']) test(`m51-r3: ${id} accepts unknown publication date with receipt date`, () => {
  gate(id, {
    'sources/note.txt': 'A supplied source.\n',
    'work/onboarding/extraction/note.md': 'source: sources/note.txt\nextract-mechanism: text reader\nextract-measure: 1 lines\ncheck-mechanism: independent line counter\ncheck-measure: 1 lines\nprovenance-author: first-party\nprovenance-status: draft\nprovenance-date: unknown; received 2026-11-02\nprovenance-audience: internal\n\n## Must-reach list\n| Item | Kind | Text | Disposition | Where |\n|---|---|---|---|---|\nMust-reach items: none.\n',
  });
});
