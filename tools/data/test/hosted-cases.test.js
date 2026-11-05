import '../../lib/tests/isolated-home.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cases, caseText } from './fixtures/cases.mjs';
import { executeDescribe } from '../scripts/describe-core.js';
const cli = fileURLToPath(new URL('../scripts/data.js', import.meta.url));
for (const c of cases) test(`shared hosted case: ${c.name}`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-case-'));
  try {
    const text = caseText(c), file = resolve(dir, 'input.txt');
    writeFileSync(file, text);
    const result = spawnSync(process.execPath, [cli, 'describe', '--file', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, JSON.stringify(c.expected) + '\n');
    assert.deepEqual(executeDescribe({ content: new TextEncoder().encode(text) }), c.expected);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
