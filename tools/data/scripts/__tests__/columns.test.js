import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsedInstallFlag } from '../../../lib/consent.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.js');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function ok(args) {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function tempFile(name, text) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-data-columns-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

describe('describe --column and --columns', () => {
  it('names a header that contains a comma with --column and refuses --columns', () => {
    const file = tempFile('money.csv', '"cost, usd",note\n1.5,a\n2.5,b\n');
    const described = ok(['describe', '--file', file, '--column', 'cost, usd']);
    assert.equal(described.columns.length, 1);
    assert.equal(described.columns[0].name, 'cost, usd');
    assert.equal(described.columns[0].count, 2);
    const refused = run(['describe', '--file', file, '--columns', 'cost, usd']);
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout, '');
    assert.match(refused.stderr, /--columns/);
    const both = run(['describe', '--file', file, '--column', 'cost, usd', '--columns', 'note']);
    assert.equal(both.status, 1);
    assert.match(both.stderr, /--column/);
    assert.match(both.stderr, /--columns/);
  });

  it('resolves --columns a,b to the headers a and b when a header is also named a,b', () => {
    const file = tempFile('split.csv', '"a,b",a,b\n1,2,3\n4,5,6\n');
    const described = ok(['describe', '--file', file, '--columns', 'a,b']);
    assert.deepEqual(described.columns.map((column) => column.name), ['a', 'b']);
    assert.equal(described.columns[0].mean, 3.5);
    assert.equal(described.columns[1].mean, 4.5);
  });

  it('accepts a JSON column named --amount as the value of --column', () => {
    const file = tempFile('flags.json', '[{"--amount":1},{"--amount":3}]\n');
    const described = ok(['describe', '--file', file, '--column', '--amount']);
    assert.equal(described.columns.length, 1);
    assert.equal(described.columns[0].name, '--amount');
    assert.equal(described.columns[0].mean, 2);
  });

  it('treats --install, --file, and --help as column names when they follow --column', () => {
    const file = tempFile('dash.json', '[{"--install":1,"--file":2,"--help":3},{"--install":5,"--file":4,"--help":7}]\n');
    for (const name of ['--install', '--file', '--help']) {
      const described = ok(['describe', '--file', file, '--column', name]);
      assert.equal(described.columns.length, 1, name);
      assert.equal(described.columns[0].name, name);
    }
    const helped = run(['describe', '--column', '--help', '--file', file]);
    assert.equal(helped.status, 0, helped.stderr);
    assert.equal(JSON.parse(helped.stdout).columns[0].name, '--help');
    assert.doesNotMatch(helped.stdout, /data describe - descriptive statistics/);
    const namedFile = ok(['describe', '--column', '--file', '--file', file]);
    assert.equal(namedFile.columns[0].name, '--file');
    const valueFlags = new Set(['--file', '--format', '--delimiter', '--columns', '--column']);
    assert.equal(parsedInstallFlag(['describe', '--file', file, '--column', '--install'], valueFlags), false);
    assert.equal(parsedInstallFlag(['describe', '--install', '--file', file], valueFlags), true);
  });
});
