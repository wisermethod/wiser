import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_TYPES,
  buildChart,
  collectPoints,
  renderHtml,
  toNumber,
} from '../chart-core.js';

describe('chart', () => {
  const csvData = [
    'region,revenue',
    'East,100',
    'West,200',
    'North,150',
  ].join('\n');

  describe('toNumber', () => {
    it('parses plain numbers', () => {
      assert.equal(toNumber('42'), 42);
    });

    it('strips currency and commas', () => {
      assert.equal(toNumber('$1,200.50'), 1200.5);
    });

    it('returns null for non-numeric text', () => {
      assert.equal(toNumber('n/a'), null);
      assert.equal(toNumber(''), null);
    });
  });

  describe('collectPoints', () => {
    it('builds points and skips non-numeric y values', () => {
      const rows = [
        { region: 'A', revenue: '10' },
        { region: 'B', revenue: '' },
        { region: 'C', revenue: '30' },
      ];
      const { points, skipped } = collectPoints(rows, 'region', 'revenue');
      assert.equal(points.length, 2);
      assert.equal(skipped, 1);
      assert.equal(points[0].x, 'A');
      assert.equal(points[0].y, 10);
    });
  });

  describe('buildChart bar', () => {
    it('returns HTML and metadata for a bar chart', () => {
      const result = buildChart({
        content: csvData,
        x: 'region',
        y: 'revenue',
        type: 'bar',
        title: 'Revenue by region',
      });
      assert.equal(result.ok, true);
      assert.equal(result.type, 'bar');
      assert.equal(result.points, 3);
      assert.ok(result.html.includes('<svg'));
      assert.ok(result.html.includes('Revenue by region'));
      assert.ok(result.html.includes('<rect'));
      assert.ok(!result.html.includes('http://') || result.html.includes('xmlns="http://www.w3.org/2000/svg"'));
      // No external script or stylesheet loads.
      assert.ok(!/<script\s+src=/i.test(result.html));
      assert.ok(!/<link\s/i.test(result.html));
    });

    it('defaults type to bar', () => {
      const result = buildChart({
        content: csvData,
        x: 'region',
        y: 'revenue',
      });
      assert.equal(result.ok, true);
      assert.equal(result.type, 'bar');
    });
  });

  describe('buildChart line', () => {
    it('draws a path for a line chart', () => {
      const result = buildChart({
        content: csvData,
        x: 'region',
        y: 'revenue',
        type: 'line',
      });
      assert.equal(result.ok, true);
      assert.equal(result.type, 'line');
      assert.ok(result.html.includes('<path'));
      assert.ok(result.html.includes('<circle'));
    });
  });

  describe('JSON input', () => {
    it('charts a JSON array of objects', () => {
      const content = JSON.stringify([
        { month: 'Jan', value: 10 },
        { month: 'Feb', value: 20 },
      ]);
      const result = buildChart({
        content,
        x: 'month',
        y: 'value',
        format: 'json',
      });
      assert.equal(result.ok, true);
      assert.equal(result.points, 2);
    });
  });

  describe('rejections', () => {
    it('rejects a missing x column', () => {
      const result = buildChart({
        content: csvData,
        x: 'nope',
        y: 'revenue',
      });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes('x column')));
    });

    it('rejects a missing y column', () => {
      const result = buildChart({
        content: csvData,
        x: 'region',
        y: 'nope',
      });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes('y column')));
    });

    it('rejects when no numeric y values remain', () => {
      const result = buildChart({
        content: 'region,revenue\nEast,n/a\nWest,?\n',
        x: 'region',
        y: 'revenue',
      });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => /No numeric values/i.test(e)));
    });

    it('rejects an unknown type', () => {
      const result = buildChart({
        content: csvData,
        x: 'region',
        y: 'revenue',
        type: 'pie',
      });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes('pie')));
    });

    it('rejects empty content', () => {
      const result = buildChart({
        content: '',
        x: 'region',
        y: 'revenue',
      });
      assert.equal(result.ok, false);
    });
  });

  describe('renderHtml', () => {
    it('escapes title text in the document', () => {
      const html = renderHtml({
        points: [{ x: 'A', y: 1 }],
        type: 'bar',
        title: 'A <B> & "C"',
        width: 100,
        height: 100,
      });
      assert.ok(html.includes('A &lt;B&gt; &amp; &quot;C&quot;'));
      assert.ok(!html.includes('<B>'));
    });
  });

  describe('CHART_TYPES', () => {
    it('lists bar and line', () => {
      assert.deepEqual(CHART_TYPES, ['bar', 'line']);
    });
  });
});
