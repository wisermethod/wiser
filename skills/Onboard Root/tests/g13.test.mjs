import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../gates.sh'), 'utf8');
// Run the real harness and driver, redirecting only the fixture shelf so no
// memory directory is opened. The gates and their helpers are unaltered.
assert.equal(source.split('MEM="$ROOT/memory"').length, 2);
const harness = source.replace('MEM="$ROOT/memory"', 'MEM="$ROOT/voice-fixture"');

const anchored = 'The rule is to open with the point. [V1]';

for (const [name, voice, failedLine, file = 'voice.md'] of [
  ['brand note at end permits its tap label', `## How They Write\n${anchored}\n\n## From your brand\nPlayful and creative (T2).\n`, null],
  ['brand note before another section permits its tap label', `## From your brand\nPlayful and creative (T2).\n\n## How They Write\n${anchored}\n`, null],
  ['the same word under How They Write still fails at its original line', '## From your brand\nPlayful and creative (T2).\n\n## How They Write\nPlayful and creative (T2).\n', 5],
  ['the same word before the brand note still fails', '## How They Write\nPlayful and creative (T2).\n\n## From your brand\nPlayful and creative (T2).\n', 2],
  ['a deeper heading stays inside the exempt section', `## From your brand\n### Tap labels\nPlayful and creative (T2).\n\n## How They Write\n${anchored}\n`, null],
  ['a longer heading receives no exemption', '## From your brand elsewhere\nPlayful and creative.\n', 2],
  ['CRLF headings end the exemption at the next section', '## From your brand\r\nPlayful and creative (T2).\r\n\r\n## How They Write\r\nPlayful and creative.\r\n', 5],
  ['trailing space opens the exemption', `## How They Write\n${anchored}\n\n## From your brand \nPlayful and creative (T2).\n`, null],
  ['trailing tab and CRLF open the exemption', '## From your brand\t\r\nPlayful and creative (T2).\r\n', null],
  ['a prose mention receives no exemption', '## How They Write\nA playful rule mentions ## From your brand (T2).\n', 2],
  ['a leading space receives no exemption', ' ## From your brand\nPlayful and creative (T2).\n', 2],
  ['a longer next heading ends the exemption', '## From your brand\nPlayful and creative (T2).\n## From your brand elsewhere\nPlayful and creative (T2).\n', 4],
  ['a three-line brand note needs no voice anchors or registers', `## How They Write\n${anchored}\n\n## From your brand\nPlayful and creative (T2).\nSuit and tie, Brooks Brothers (T6).\nNatural and organic (T1).\n`, null],
  ['a final heading with trailing whitespace opens the exemption', `## How They Write\n${anchored}\n\n## From your brand `, null],
  ['the section in about is not exempt', '## From your brand\nPlayful and creative (T2).\n', 2, 'about.md'],
  ['the section in design is not exempt', '## From your brand\nPlayful and creative (T2).\n', 2, 'design.md'],
]) for (const gate of (file === 'voice.md' ? ['G5a', 'G9', 'G13'] : ['G5a', 'G9'])) test(`${gate}: ${name}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'g13-fixture-'));
  try {
    mkdirSync(join(root, 'voice-fixture')); mkdirSync(join(root, 'tmp'));
    mkdirSync(join(root, 'work/onboarding'), { recursive: true });
    writeFileSync(join(root, 'work/onboarding/verification.md'), '## Claims\n\n| Row |\n|-----|\n| V1 |\n');
    writeFileSync(join(root, 'AGENTS.md'), '---\ntype: org\n---\n');
    writeFileSync(join(root, 'voice-fixture/voice.md'), `## How They Write\n${anchored}\n`);
    writeFileSync(join(root, 'voice-fixture', file), voice);
    const child = spawnSync('bash', ['-c', harness, 'gates.sh', '--json', '--gate', gate, root], {
      encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') },
    });
    assert.ifError(child.error); assert.equal(child.stderr, '');
    assert.equal(child.status, failedLine == null ? 0 : 1, child.stdout);
    const rows = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2); assert.equal(rows[0].gate, gate);
    assert.equal(rows[1].total, 1); assert.equal(rows[1].skip, 0);
    if (failedLine != null) assert.match(child.stdout, new RegExp(`line ${failedLine - (gate === 'G9' ? 1 : 0)}:`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
