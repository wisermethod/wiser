import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeAggregate } from '../aggregate-core.js';

describe('aggregate', () => {
  const csvData = [
    'region,product,revenue,units',
    'East,Widget,100,10',
    'East,Widget,150,15',
    'East,Gadget,200,8',
    'West,Widget,120,12',
    'West,Gadget,180,9',
    'West,Gadget,220,11',
  ].join('\n');

  describe('one group-by column', () => {
    it('groups by one column with sum', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'revenue', function: 'sum' }],
      });
      assert.equal(result.groupCount, 2);
      assert.equal(result.totalRows, 6);
      const east = result.groups.find((g) => g.key.region === 'East');
      const west = result.groups.find((g) => g.key.region === 'West');
      assert.ok(east);
      assert.ok(west);
      assert.equal(east.values.revenue_sum, 450);
      assert.equal(west.values.revenue_sum, 520);
    });

    it('groups by one column with mean', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'revenue', function: 'mean' }],
      });
      const east = result.groups.find((g) => g.key.region === 'East');
      assert.ok(east);
      assert.equal(east.values.revenue_mean, 150);
    });

    it('counts every row in the group, not the column values', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'region', function: 'count' }],
      });
      const east = result.groups.find((g) => g.key.region === 'East');
      assert.ok(east);
      assert.equal(east.values.region_count, 3);
    });
  });

  describe('several group-by columns', () => {
    it('groups by two columns', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region', 'product'],
        metrics: [{ column: 'revenue', function: 'sum' }],
      });
      assert.equal(result.groupCount, 4);
      const eastWidget = result.groups.find(
        (g) => g.key.region === 'East' && g.key.product === 'Widget'
      );
      assert.ok(eastWidget);
      assert.equal(eastWidget.values.revenue_sum, 250);
    });

    it('keeps a value carrying a separator inside its own group', () => {
      const result = executeAggregate({
        content: 'a,b,v\nx|||y,z,10\nx,y|||z,20',
        groupBy: ['a', 'b'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.equal(result.groupCount, 2);
    });
  });

  describe('several metrics', () => {
    it('computes several functions over different columns', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [
          { column: 'revenue', function: 'sum' },
          { column: 'units', function: 'mean' },
          { column: 'revenue', function: 'max' },
        ],
      });
      const east = result.groups.find((g) => g.key.region === 'East');
      assert.ok(east);
      assert.equal(east.values.revenue_sum, 450);
      assert.equal(east.values.revenue_max, 200);
      assert.ok(typeof east.values.units_mean === 'number');
    });
  });

  describe('every function', () => {
    it('computes sum', () => {
      const result = executeAggregate({
        content: 'g,v\nA,10\nA,20\nA,30',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.equal(result.groups[0].values.v_sum, 60);
    });

    it('computes median on an odd count', () => {
      const result = executeAggregate({
        content: 'g,v\nA,10\nA,20\nA,30',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'median' }],
      });
      assert.equal(result.groups[0].values.v_median, 20);
    });

    it('computes median on an even count as the middle pair average', () => {
      const result = executeAggregate({
        content: 'g,v\nA,10\nA,20\nA,30\nA,50',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'median' }],
      });
      assert.equal(result.groups[0].values.v_median, 25);
    });

    it('computes min and max', () => {
      const result = executeAggregate({
        content: 'g,v\nA,10\nA,50\nA,30',
        groupBy: ['g'],
        metrics: [
          { column: 'v', function: 'min' },
          { column: 'v', function: 'max' },
        ],
      });
      assert.equal(result.groups[0].values.v_min, 10);
      assert.equal(result.groups[0].values.v_max, 50);
    });

    it('rounds to four decimal places', () => {
      const result = executeAggregate({
        content: 'g,v\nA,1\nA,1\nA,1',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'mean' }],
      });
      assert.equal(result.groups[0].values.v_mean, 1);
    });
  });

  describe('input formats', () => {
    it('reads a JSON array of objects', () => {
      const result = executeAggregate({
        content: '[{"g":"A","v":10},{"g":"A","v":20},{"g":"B","v":5}]',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.equal(result.groupCount, 2);
      assert.equal(result.groups[0].values.v_sum, 30);
    });

    it('strips currency symbols and thousands separators before summing', () => {
      const result = executeAggregate({
        content: 'g,v\nA,"$1,200"\nA,"$800"',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.equal(result.groups[0].values.v_sum, 2000);
    });
  });

  describe('errors', () => {
    it('reports a missing groupBy column', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['nonexistent'],
        metrics: [{ column: 'revenue', function: 'sum' }],
      });
      assert.ok(result.errors.some((e) => e.includes('"nonexistent"')));
      assert.equal(result.groupCount, 0);
    });

    it('reports a missing metric column', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'nonexistent', function: 'sum' }],
      });
      assert.ok(result.errors.some((e) => e.includes('"nonexistent"')));
    });

    it('reports a non-numeric metric column for a function other than count', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'product', function: 'sum' }],
      });
      assert.ok(result.errors.some((e) => e.includes('not numeric')));
    });

    it('allows count on a non-numeric column', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'product', function: 'count' }],
      });
      assert.equal(result.errors.length, 0);
      assert.equal(result.groupCount, 2);
    });

    it('reports an unknown function', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [{ column: 'revenue', function: 'stddev' }],
      });
      assert.ok(result.errors.some((e) => e.includes('"stddev"')));
      assert.equal(result.groupCount, 0);
    });

    it('reports empty content', () => {
      const result = executeAggregate({
        content: '',
        groupBy: ['x'],
        metrics: [{ column: 'y', function: 'sum' }],
      });
      assert.ok(result.errors.length > 0);
      assert.equal(result.totalRows, 0);
    });

    it('reports a missing groupBy argument', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: [],
        metrics: [{ column: 'revenue', function: 'sum' }],
      });
      assert.ok(result.errors.some((e) => e.includes('groupBy is required')));
    });

    it('reports a missing metrics argument', () => {
      const result = executeAggregate({
        content: csvData,
        groupBy: ['region'],
        metrics: [],
      });
      assert.ok(result.errors.some((e) => e.includes('metrics is required')));
    });

    it('withholds the parser message when the content is not JSON', () => {
      const result = executeAggregate({
        content: '[{"g":"A", "v":}]',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.ok(result.errors.some((e) => e.includes('could not be parsed as JSON')));
      assert.ok(!result.errors.some((e) => e.includes('position')));
    });

    it('groups an empty value in a groupBy column on its own', () => {
      const result = executeAggregate({
        content: 'g,v\nA,10\n,20\nA,30',
        groupBy: ['g'],
        metrics: [{ column: 'v', function: 'sum' }],
      });
      assert.equal(result.groupCount, 2);
    });
  });
});
