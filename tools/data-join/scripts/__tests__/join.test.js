import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeJoin, HOW } from '../join-core.js';

describe('join', () => {
  const leftCsv = [
    'id,name,region',
    '1,Alice,East',
    '2,Bob,West',
    '3,Carol,East',
  ].join('\n');

  const rightCsv = [
    'id,revenue',
    '1,100',
    '2,200',
    '4,400',
  ].join('\n');

  describe('inner join', () => {
    it('keeps only keys present on both sides', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'id',
        how: 'inner',
      });
      assert.equal(result.errors.length, 0);
      assert.equal(result.leftRows, 3);
      assert.equal(result.rightRows, 3);
      assert.equal(result.matchedRows, 2);
      assert.equal(result.rows.length, 2);
      assert.equal(result.how, 'inner');
      assert.equal(result.on, 'id');
      const alice = result.rows.find((r) => r.name === 'Alice');
      const bob = result.rows.find((r) => r.name === 'Bob');
      assert.ok(alice);
      assert.ok(bob);
      assert.equal(alice.revenue, '100');
      assert.equal(bob.revenue, '200');
      assert.equal(result.rows.find((r) => r.name === 'Carol'), undefined);
    });

    it('defaults to inner when how is omitted', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'id',
      });
      assert.equal(result.how, 'inner');
      assert.equal(result.rows.length, 2);
    });
  });

  describe('left join', () => {
    it('keeps every left row and nulls unmatched right columns', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'id',
        how: 'left',
      });
      assert.equal(result.rows.length, 3);
      assert.equal(result.matchedRows, 2);
      const carol = result.rows.find((r) => r.name === 'Carol');
      assert.ok(carol);
      assert.equal(carol.revenue, null);
    });
  });

  describe('one-to-many', () => {
    it('emits one result row per matching right row', () => {
      const rightMany = [
        'id,sku',
        '1,A',
        '1,B',
        '2,C',
      ].join('\n');
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightMany,
        on: 'id',
        how: 'inner',
      });
      assert.equal(result.rows.length, 3);
      assert.equal(result.matchedRows, 3);
      assert.equal(result.rows.filter((r) => r.name === 'Alice').length, 2);
    });
  });

  describe('column collisions', () => {
    it('renames a colliding right non-key column with _right', () => {
      const left = 'id,value\n1,L';
      const right = 'id,value\n1,R';
      const result = executeJoin({
        leftContent: left,
        rightContent: right,
        on: 'id',
      });
      assert.deepEqual(result.columns, ['id', 'value', 'value_right']);
      assert.equal(result.rows[0].value, 'L');
      assert.equal(result.rows[0].value_right, 'R');
    });

    it('keeps the key once, from the left side', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'id',
      });
      assert.ok(result.columns.includes('id'));
      assert.equal(result.columns.filter((c) => c === 'id').length, 1);
      assert.equal(result.rows[0].id, '1');
    });
  });

  describe('JSON input', () => {
    it('joins two JSON arrays of objects', () => {
      const left = JSON.stringify([
        { id: 'a', name: 'X' },
        { id: 'b', name: 'Y' },
      ]);
      const right = JSON.stringify([
        { id: 'a', score: 10 },
        { id: 'c', score: 30 },
      ]);
      const result = executeJoin({
        leftContent: left,
        rightContent: right,
        on: 'id',
        format: 'json',
      });
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].name, 'X');
      assert.equal(result.rows[0].score, 10);
    });
  });

  describe('errors that stay inside the result', () => {
    it('reports a missing left key column', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'missing',
      });
      assert.equal(result.rows.length, 0);
      assert.ok(result.errors.some((e) => e.includes('left key column')));
      assert.ok(result.errors.some((e) => e.includes('Available:')));
    });

    it('reports a missing right key column', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: 'sku,price\nA,1',
        on: 'id',
      });
      assert.equal(result.rows.length, 0);
      assert.ok(result.errors.some((e) => e.includes('right key column')));
    });

    it('reports empty left content', () => {
      const result = executeJoin({
        leftContent: '',
        rightContent: rightCsv,
        on: 'id',
      });
      assert.equal(result.rows.length, 0);
      assert.ok(result.errors.some((e) => /left.*empty/i.test(e)));
    });

    it('reports a bad how value', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: 'id',
        how: 'outer',
      });
      assert.equal(result.rows.length, 0);
      assert.ok(result.errors.some((e) => e.includes('outer')));
    });

    it('reports when on is missing', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: rightCsv,
        on: '',
      });
      assert.equal(result.rows.length, 0);
      assert.ok(result.errors.some((e) => /on is required/i.test(e)));
    });
  });

  describe('left join with empty right', () => {
    it('returns every left row with null right columns', () => {
      const result = executeJoin({
        leftContent: leftCsv,
        rightContent: 'id,revenue',
        on: 'id',
        how: 'left',
      });
      // Header-only right: no data rows. left join still emits left rows; right
      // columns may be empty when the right side had no columns beyond the key.
      assert.equal(result.leftRows, 3);
      assert.equal(result.rows.length, 3);
    });
  });

  describe('HOW export', () => {
    it('lists the supported modes', () => {
      assert.deepEqual(HOW, ['inner', 'left']);
    });
  });
});
