import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCompute, lookupField, OPS } from '../compute-core.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.js');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function writeObject(data) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-data-compute-'));
  const file = join(dir, 'input.json');
  writeFileSync(file, `${JSON.stringify(data)}\n`, 'utf8');
  return file;
}

describe('compute', () => {
  describe('OPS', () => {
    it('lists percentage, difference, and rate', () => {
      assert.deepEqual(OPS, ['percentage', 'difference', 'rate']);
    });
  });

  describe('lookupField', () => {
    it('reads a nested array index and a named column', () => {
      const data = {
        groups: [{ sum: 450 }],
        columns: [{ name: 'revenue', mean: 1175 }],
      };
      assert.equal(lookupField(data, 'groups.0.sum').value, 450);
      assert.equal(lookupField(data, 'columns.revenue.mean').value, 1175);
    });
  });

  describe('executeCompute', () => {
    it('computes percentage as a / b * 100', () => {
      const result = executeCompute({
        data: { a: 25, b: 50 },
        op: 'percentage',
        aField: 'a',
        bField: 'b',
      });
      assert.equal(result.ok, true);
      assert.equal(result.result.value, 50);
      assert.equal(result.result.op, 'percentage');
    });

    it('computes difference as a - b', () => {
      const result = executeCompute({
        data: { a: 90, b: 40 },
        op: 'difference',
        aField: 'a',
        bField: 'b',
      });
      assert.equal(result.result.value, 50);
    });

    it('computes rate as a / b', () => {
      const result = executeCompute({
        data: { a: 10, b: 4 },
        op: 'rate',
        aField: 'a',
        bField: 'b',
      });
      assert.equal(result.result.value, 2.5);
    });

    it('returns error b is zero for percentage and omits value', () => {
      const result = executeCompute({
        data: { a: 10, b: 0 },
        op: 'percentage',
        aField: 'a',
        bField: 'b',
      });
      assert.equal(result.ok, true);
      assert.equal(result.result.error, 'b is zero');
      assert.equal(Object.hasOwn(result.result, 'value'), false);
    });
  });

  describe('data.js compute', () => {
    it('computes percentage from a JSON object', () => {
      const file = writeObject({ won: 25, total: 50 });
      const result = run(['compute', '--file', file, '--op', 'percentage', '--a', 'won', '--b', 'total']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.deepEqual(JSON.parse(result.stdout), {
        op: 'percentage',
        a: { field: 'won', value: 25 },
        b: { field: 'total', value: 50 },
        value: 50,
      });
    });

    it('computes difference', () => {
      const file = writeObject({ now: 90, then: 40 });
      const result = run(['compute', '--file', file, '--op', 'difference', '--a', 'now', '--b', 'then']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value, 50);
    });

    it('computes rate', () => {
      const file = writeObject({ hits: 10, days: 4 });
      const result = run(['compute', '--file', file, '--op', 'rate', '--a', 'hits', '--b', 'days']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value, 2.5);
    });

    it('prints b is zero on stdout with exit 0 and no value', () => {
      const file = writeObject({ a: 10, b: 0 });
      const result = run(['compute', '--file', file, '--op', 'rate', '--a', 'a', '--b', 'b']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      const body = JSON.parse(result.stdout);
      assert.equal(body.error, 'b is zero');
      assert.equal(Object.hasOwn(body, 'value'), false);
      assert.equal(body.op, 'rate');
    });

    it('exits 1 when a field is missing', () => {
      const file = writeObject({ a: 10, b: 2 });
      const result = run(['compute', '--file', file, '--op', 'difference', '--a', 'missing', '--b', 'b']);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Error: field missing is missing or not a number in /);
      assert.match(result.stderr, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n$`));
    });

    it('exits 1 when a field is not a number', () => {
      const file = writeObject({ a: 'east', b: 2 });
      const result = run(['compute', '--file', file, '--op', 'difference', '--a', 'a', '--b', 'b']);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Error: field a is missing or not a number in /);
    });

    it('reads a nested path', () => {
      const file = writeObject({
        groups: [{ sum: 450, count: 3 }],
        columns: { revenue: { mean: 150 } },
      });
      const result = run([
        'compute',
        '--file',
        file,
        '--op',
        'rate',
        '--a',
        'groups.0.sum',
        '--b',
        'columns.revenue.mean',
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value, 3);
    });

    it('rounds to --digits decimals', () => {
      const file = writeObject({ a: 1, b: 3 });
      const result = run([
        'compute',
        '--file',
        file,
        '--op',
        'rate',
        '--a',
        'a',
        '--b',
        'b',
        '--digits',
        '2',
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value, 0.33);
    });

    it('refuses an unknown flag by name before any read', () => {
      const result = run([
        'compute',
        '--bogus',
        '1',
        '--file',
        '/no/such/file.json',
        '--op',
        'rate',
        '--a',
        'a',
        '--b',
        'b',
      ]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /unknown option "--bogus"/);
      assert.doesNotMatch(result.stderr, /no file/);
    });
  });
});

describe('data help', () => {
  it('lists the six subcommands', () => {
    const result = run(['help']);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ['parse', 'describe', 'aggregate', 'join', 'chart', 'compute']) {
      assert.match(result.stdout, new RegExp(`^  ${name} `, 'm'));
    }
  });

  it('prints parse usage for parse help and parse --help', () => {
    const byWord = run(['parse', 'help']);
    const byFlag = run(['parse', '--help']);
    assert.equal(byWord.status, 0, byWord.stderr);
    assert.equal(byFlag.status, 0, byFlag.stderr);
    assert.match(byWord.stdout, /--no-header/);
    assert.equal(byWord.stdout, byFlag.stdout);
  });
});
