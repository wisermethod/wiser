import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const harness = readFileSync(join(here, '../gates.sh'), 'utf8').replace('MEM="$ROOT/memory"', 'MEM="$ROOT/shelf"');
function gate(id, text, { scoped = false, fails = false, path = 'shelf/voice.md' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'r4-fixture-'));
  try {
    const files = {
      'AGENTS.md': '---\ntype: org\n---\n\n## Provides\n- voice: shelf/voice.md\n',
      'work/onboarding/run-record.md': '### Who confirms and on what basis\nname: Dana Reyes\n',
      [path]: text,
    };
    for (const [file, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), bytes);
    }
    mkdirSync(join(root, 'tmp'));
    const args = ['-c', harness, 'gates.sh', '--json', '--gate', id, ...(scoped ? ['--file', path] : []), root];
    const child = spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') } });
    assert.ifError(child.error); assert.equal(child.stderr, '');
    assert.equal(child.status, fails ? 1 : 0, child.stdout);
    const [row, summary] = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(row.status, fails ? 'fail' : 'pass'); assert.equal(summary.total, 1); assert.equal(summary.skip, 0);
    return row;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const scoped of [false, true]) {
  test(`G18: identifier and closing-delimiter prefixes are code (scoped=${scoped})`, () => {
    const prefixes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-])'];
    const code = ['name', 'Competitor'].flatMap(token => prefixes.map(prefix => `${prefix}[${token}]`)).join('\n');
    gate('G18', `input[name] { color: red; }\nx[name];\n${code}\n`, { scoped });
  });
  test(`G18: code never hides a standalone prose token on the same line (scoped=${scoped})`, () => {
    for (const token of ['name', 'Competitor']) for (const prefix of ['', ' ', '(', ',', ':', '[', '/', '`']) {
      const row = gate('G18', `input[name]\n\nx[${token}]; ${prefix}[${token}]\n`, { scoped, fails: true });
      assert.match(row.detail, /line 3:/); assert.doesNotMatch(row.detail, /line 1:/);
    }
  });
}
test('G18: saved helpers receive the same code rule as bound files', () => {
  gate('G18', 'const value = x[name];\n', { path: 'work/brand/helper.js' });
  gate('G18', 'const value = x[name];\nFill in [name].\n', { path: 'work/brand/helper.js', fails: true });
});

for (const [basis, fails = false] of [
  ['Department lead confirming Member Services support wording and output routing'],
  ['Department lead confirming Member Services support wording and output routing. (Firsthand: Dana Reyes) [V1]'],
  ['Editorial lead confirming clinic patient communications and channel routing'],
  ['Dana Reyes', true],
  ['Department lead', true],
  ['Department lead for the Member Services support team', true],
  ['Department lead confirming', true],
  ['Department lead confirming support', true],
  ['Is the right person to ask about this.', true],
  ['Dana Reyes (Working need: confirming Member Services support wording and output routing) [V1]', true],
]) test(`G14: ${fails ? 'rejects' : 'accepts'} ${basis}`, () => {
  gate('G14', `voice-authority-name: Dana Reyes\nvoice-authority-basis: ${basis}\nvoice-confirmation-date: 2026-11-02\n`, { fails });
});
