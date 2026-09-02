import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeDescribe } from '../describe-core.js';

describe('describe', () => {
  describe('basic statistics', () => {
    it('computes statistics for a numeric column', () => {
      const result = executeDescribe({
        content: 'name,value\nA,10\nB,20\nC,30\nD,40\nE,50',
      });
      assert.equal(result.columns.length, 1);
      const col = result.columns[0];
      assert.equal(col.name, 'value');
      assert.equal(col.count, 5);
      assert.equal(col.mean, 30);
      assert.equal(col.median, 30);
      assert.equal(col.min, 10);
      assert.equal(col.max, 50);
      assert.equal(col.nullCount, 0);
      assert.equal(result.totalRows, 5);
    });

    it('reports a population standard deviation', () => {
      const result = executeDescribe({ content: 'v\n10\n20\n30\n40\n50' });
      // sqrt(200), not the sample deviation sqrt(250).
      assert.equal(result.columns[0].stdDev, 14.1421);
    });

    it('interpolates percentiles between values', () => {
      const result = executeDescribe({
        content: 'v\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10',
      });
      const col = result.columns[0];
      assert.equal(col.p25, 3.25);
      assert.equal(col.p75, 7.75);
    });

    it('takes percentiles that land on a value from that value', () => {
      const result = executeDescribe({ content: 'v\n10\n20\n30\n40\n50' });
      const col = result.columns[0];
      assert.equal(col.p25, 20);
      assert.equal(col.p75, 40);
    });

    it('averages the middle pair for an even count', () => {
      const result = executeDescribe({ content: 'v\n1\n2\n3\n4' });
      assert.equal(result.columns[0].median, 2.5);
    });

    it('handles a column holding one repeated value', () => {
      const result = executeDescribe({ content: 'v\n42\n42\n42' });
      const col = result.columns[0];
      assert.equal(col.mean, 42);
      assert.equal(col.median, 42);
      assert.equal(col.stdDev, 0);
    });

    it('rounds to four decimal places', () => {
      const result = executeDescribe({ content: 'v\n1\n2\n2' });
      assert.equal(result.columns[0].mean, 1.6667);
    });

    it('reads currency and thousands separators as numbers', () => {
      const result = executeDescribe({
        content: 'revenue\n"$1,000"\n"$2,000"\n"$3,000"',
      });
      assert.equal(result.columns[0].mean, 2000);
    });
  });

  describe('values that are not numbers', () => {
    it('excludes them from the statistics and counts them', () => {
      const result = executeDescribe({
        content: 'label,v\na,10\nb,\nc,30\nd,\ne,50',
      });
      const col = result.columns[0];
      assert.equal(col.count, 3);
      assert.equal(col.nullCount, 2);
      assert.equal(col.mean, 30);
    });

    it('counts text inside a numeric column as absent, not as zero', () => {
      // 4 of 5 values parse, which clears the numeric threshold.
      const result = executeDescribe({ content: 'v\n10\n20\n30\nn/a\n40' });
      const col = result.columns[0];
      assert.equal(col.count, 4);
      assert.equal(col.nullCount, 1);
      assert.equal(col.mean, 25);
    });

    it('skips a column that holds nothing at all', () => {
      const result = executeDescribe({ content: 'name,value\nA,\nB,\nC,' });
      assert.equal(result.columns.length, 0);
      assert.ok(result.skippedColumns.some((s) => s.name === 'value' && s.reason.includes('not numeric')));
    });
  });

  describe('choosing columns', () => {
    it('skips columns that are not numeric, with a reason per column', () => {
      const result = executeDescribe({
        content: 'name,age,city\nAlice,30,Springfield\nBob,25,Fairview',
      });
      assert.equal(result.columns.length, 1);
      assert.equal(result.columns[0].name, 'age');
      const byName = Object.fromEntries(result.skippedColumns.map((s) => [s.name, s.reason]));
      assert.ok(byName.name.includes('not numeric'));
      assert.ok(byName.city.includes('not numeric'));
    });

    it('describes only the requested columns, in the order requested', () => {
      const result = executeDescribe({
        content: 'a,b,c\n1,10,100\n2,20,200\n3,30,300',
        columns: ['c', 'a'],
      });
      assert.equal(result.columns.length, 2);
      assert.equal(result.columns[0].name, 'c');
      assert.equal(result.columns[1].name, 'a');
    });

    it('names a requested column that is not there, and lists what is', () => {
      const result = executeDescribe({ content: 'a,b\n1,2', columns: ['z'] });
      assert.ok(result.errors.some((e) => e.includes('"z"') && e.includes('Available: a, b')));
      assert.equal(result.columns.length, 0);
      assert.equal(result.skippedColumns.length, 0);
    });

    it('names a requested column that is not numeric and keeps the rest', () => {
      const result = executeDescribe({
        content: 'name,age\nAlice,30\nBob,25',
        columns: ['name', 'age'],
      });
      assert.ok(result.errors.some((e) => e.includes('not numeric')));
      assert.ok(result.skippedColumns.some((s) => s.name === 'name' && s.reason.includes('not numeric')));
      assert.equal(result.columns.length, 1);
      assert.equal(result.columns[0].name, 'age');
    });

    it('describes every numeric column when none are requested', () => {
      const result = executeDescribe({ content: 'a,b,c\n1,10,100\n2,20,200' });
      assert.equal(result.columns.length, 3);
    });
  });

  describe('reading the file', () => {
    it('reads a JSON array of objects', () => {
      const result = executeDescribe({
        content: '[{"region":"north","revenue":100},{"region":"south","revenue":300}]',
      });
      assert.equal(result.columns.length, 1);
      assert.equal(result.columns[0].name, 'revenue');
      assert.equal(result.columns[0].mean, 200);
    });

    it('reads tab-separated content', () => {
      const result = executeDescribe({ content: 'name\tage\nAlice\t30\nBob\t20' });
      assert.equal(result.columns[0].name, 'age');
      assert.equal(result.columns[0].mean, 25);
    });

    it('reports items it dropped while reading, and still computes', () => {
      const result = executeDescribe({
        content: '[{"v":1}, "not an object", {"v":3}]',
        format: 'json',
      });
      assert.equal(result.columns[0].mean, 2);
      assert.ok(result.errors.some((e) => e.includes('not objects')));
    });

    it('reports empty content instead of raising', () => {
      const result = executeDescribe({ content: '' });
      assert.equal(result.columns.length, 0);
      assert.equal(result.totalRows, 0);
      assert.ok(result.errors.length > 0);
    });

    it('reports a header with no data rows instead of raising', () => {
      const result = executeDescribe({ content: 'name,age,score' });
      assert.equal(result.totalRows, 0);
      assert.ok(result.errors.some((e) => e.includes('No data rows')));
    });

    it('reports unparseable JSON without quoting the content', () => {
      const result = executeDescribe({ content: '{not valid json', format: 'json' });
      assert.equal(result.totalRows, 0);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.every((e) => !e.includes('not valid json')));
    });

    it('reports a file with no numeric column', () => {
      const result = executeDescribe({
        content: 'name,city\nAlice,Springfield\nBob,Fairview',
      });
      assert.equal(result.columns.length, 0);
      assert.ok(result.errors.some((e) => e.includes('No numeric columns')));
      assert.equal(result.totalRows, 2);
    });
  });
});
