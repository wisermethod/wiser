import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeParse } from '../parse-core.js';

describe('parse', () => {
  describe('basic CSV', () => {
    it('parses a simple CSV with header', () => {
      const result = executeParse({
        content: 'name,age,score\nAlice,30,95\nBob,25,87\nCarol,35,92',
      });
      assert.equal(result.rowCount, 3);
      assert.equal(result.columns.length, 3);
      assert.equal(result.columns[0].name, 'name');
      assert.equal(result.columns[0].type, 'string');
      assert.equal(result.columns[1].name, 'age');
      assert.equal(result.columns[1].type, 'number');
      assert.equal(result.columns[2].name, 'score');
      assert.equal(result.columns[2].type, 'number');
      assert.equal(result.parseErrors.length, 0);
    });

    it('detects correct nonNullCount', () => {
      const result = executeParse({
        content: 'name,value\nA,10\nB,\nC,30',
      });
      assert.equal(result.columns[1].nonNullCount, 2);
    });

    it('provides sample values', () => {
      const result = executeParse({
        content: 'x\n1\n2\n3\n4\n5\n6\n7',
      });
      assert.equal(result.columns[0].sampleValues.length, 5); // MAX_SAMPLE_VALUES
    });
  });

  describe('format detection', () => {
    it('auto-detects JSON array', () => {
      const result = executeParse({
        content: '[{"name":"Alice","age":30},{"name":"Bob","age":25}]',
      });
      assert.equal(result.rowCount, 2);
      assert.equal(result.columns.length, 2);
    });

    it('auto-detects TSV', () => {
      const result = executeParse({
        content: 'name\tage\nAlice\t30\nBob\t25',
      });
      assert.equal(result.rowCount, 2);
      assert.equal(result.columns[1].type, 'number');
    });

    it('auto-detects semicolon delimiter', () => {
      const result = executeParse({
        content: 'name;age\nAlice;30\nBob;25',
      });
      assert.equal(result.rowCount, 2);
    });

    it('respects explicit format override', () => {
      const result = executeParse({
        content: '[{"a":1}]',
        format: 'json',
      });
      assert.equal(result.rowCount, 1);
    });
  });

  describe('type detection', () => {
    it('detects number columns', () => {
      const result = executeParse({
        content: 'val\n100\n200\n300',
      });
      assert.equal(result.columns[0].type, 'number');
    });

    it('detects date columns (ISO)', () => {
      const result = executeParse({
        content: 'date\n2024-01-15\n2024-02-20\n2024-03-25',
      });
      assert.equal(result.columns[0].type, 'date');
    });

    it('detects boolean columns (word-form only)', () => {
      const result = executeParse({
        content: 'active\ntrue\nfalse\ntrue\nfalse\ntrue',
      });
      assert.equal(result.columns[0].type, 'boolean');
    });

    it('detects 0/1 as number, not boolean', () => {
      const result = executeParse({
        content: 'flag\n0\n1\n1\n0\n1',
      });
      assert.equal(result.columns[0].type, 'number');
    });

    it('marks mixed-type columns', () => {
      const result = executeParse({
        content: 'val\n100\nhello\n300\nworld\n500',
      });
      assert.equal(result.columns[0].type, 'mixed');
    });

    it('handles numbers with commas and currency', () => {
      const result = executeParse({
        content: 'revenue\n"$1,000"\n"$2,500"\n"$3,750"',
      });
      assert.equal(result.columns[0].type, 'number');
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      const result = executeParse({ content: '' });
      assert.equal(result.rowCount, 0);
      assert.ok(result.parseErrors.length > 0);
    });

    it('handles header only (no data rows)', () => {
      const result = executeParse({ content: 'name,age,score' });
      assert.equal(result.rowCount, 0);
    });

    it('handles CSV with quoted fields containing commas', () => {
      const result = executeParse({
        content: 'name,address\nAlice,"123 Main St, Apt 4"\nBob,"456 Oak Ave, Suite 2"',
      });
      assert.equal(result.rowCount, 2);
      assert.equal(result.columns.length, 2);
    });

    it('handles JSON with invalid items', () => {
      const result = executeParse({
        content: '[{"a":1}, "not an object", {"a":2}]',
        format: 'json',
      });
      assert.equal(result.rowCount, 2);
      assert.ok(result.parseErrors.length > 0);
    });

    it('handles malformed JSON', () => {
      const result = executeParse({
        content: '{not valid json',
        format: 'json',
      });
      assert.equal(result.rowCount, 0);
      assert.ok(result.parseErrors.length > 0);
    });

    it('handles single-row data', () => {
      const result = executeParse({
        content: 'x,y\n1,2',
      });
      assert.equal(result.rowCount, 1);
      assert.equal(result.columns.length, 2);
      assert.equal(result.raggedRowCount, 0);
    });

    it('surfaces ragged delimited rows without refusing the file', () => {
      const result = executeParse({
        content: 'a,b,c\n1,2,3\n4,5\n6,7,8,9',
      });
      assert.equal(result.rowCount, 3);
      assert.equal(result.raggedRowCount, 2);
      assert.equal(result.columns.length, 3);
      assert.equal(result.columns[2].nonNullCount, 2);
      assert.ok(result.parseErrors.some((e) => e.includes('2 of 3') && e.includes('column count')));
    });

    it('reports raggedRowCount 0 for JSON', () => {
      const result = executeParse({
        content: '[{"a":1},{"a":2}]',
        format: 'json',
      });
      assert.equal(result.rowCount, 2);
      assert.equal(result.raggedRowCount, 0);
    });
  });
});
