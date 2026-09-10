import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  buildDocument,
  isInsideDirectory,
  readSvgSize,
  resolveOutputSize,
  withViewBox
} from '../svg-core.js';

describe('readSvgSize', () => {
  it('reads width and height attributes from the root tag', () => {
    const size = readSvgSize('<svg width="400" height="300"><rect width="10" height="10"/></svg>');
    assert.deepEqual(size, { width: 400, height: 300, sizedFrom: 'attributes' });
  });

  it('accepts px units and decimals on those attributes', () => {
    const size = readSvgSize('<svg width="400px" height="300.5px"></svg>');
    assert.deepEqual(size, { width: 400, height: 300.5, sizedFrom: 'attributes' });
  });

  it('falls back to the viewBox when the attributes are absent', () => {
    const size = readSvgSize('<svg viewBox="0 0 1024 768"></svg>');
    assert.deepEqual(size, { width: 1024, height: 768, sizedFrom: 'viewBox' });
  });

  it('reads a decimal, comma-separated viewBox', () => {
    const size = readSvgSize('<svg viewBox="0,0,100.5,50.25"></svg>');
    assert.deepEqual(size, { width: 100.5, height: 50.25, sizedFrom: 'viewBox' });
  });

  it('falls through a percentage width to the viewBox', () => {
    const size = readSvgSize('<svg width="100%" height="100%" viewBox="0 0 640 480"></svg>');
    assert.deepEqual(size, { width: 640, height: 480, sizedFrom: 'viewBox' });
  });

  it('ignores dimensions on nested elements', () => {
    const size = readSvgSize('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>');
    assert.equal(size.sizedFrom, 'default');
    assert.equal(size.width, FALLBACK_WIDTH);
    assert.equal(size.height, FALLBACK_HEIGHT);
  });

  it('uses the fallback canvas when nothing states a size', () => {
    const size = readSvgSize('<svg></svg>');
    assert.deepEqual(size, { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT, sizedFrom: 'default' });
  });

  it('needs both attributes before it trusts them', () => {
    const size = readSvgSize('<svg width="400" viewBox="0 0 200 100"></svg>');
    assert.deepEqual(size, { width: 200, height: 100, sizedFrom: 'viewBox' });
  });

  it('survives a multi-line root tag', () => {
    const size = readSvgSize('<svg\n  xmlns="http://www.w3.org/2000/svg"\n  width="120"\n  height="60">\n</svg>');
    assert.deepEqual(size, { width: 120, height: 60, sizedFrom: 'attributes' });
  });
});

describe('resolveOutputSize', () => {
  it('doubles by default', () => {
    const out = resolveOutputSize({ svgWidth: 400, svgHeight: 300 });
    assert.deepEqual(out, { width: 800, height: 600, scale: DEFAULT_SCALE });
  });

  it('applies a fractional scale', () => {
    const out = resolveOutputSize({ svgWidth: 400, svgHeight: 300, scale: 1.5 });
    assert.equal(out.width, 600);
    assert.equal(out.height, 450);
  });

  it('lets a target width override the scale and keep the ratio', () => {
    const out = resolveOutputSize({ svgWidth: 400, svgHeight: 300, scale: 2, targetWidth: 1000 });
    assert.equal(out.width, 1000);
    assert.equal(out.height, 750);
    assert.equal(out.scale, 2.5);
  });

  it('rounds fractional pixels to whole ones', () => {
    const out = resolveOutputSize({ svgWidth: 100.5, svgHeight: 50.25, scale: 2 });
    assert.equal(out.width, 201);
    assert.equal(out.height, 101);
    assert.ok(Number.isInteger(out.width) && Number.isInteger(out.height));
  });

  it('scales a fallback-sized document too', () => {
    const out = resolveOutputSize({ svgWidth: FALLBACK_WIDTH, svgHeight: FALLBACK_HEIGHT, targetWidth: 400 });
    assert.deepEqual(out, { width: 400, height: 300, scale: 0.5 });
  });
});

describe('isInsideDirectory', () => {
  it('catches a path inside the directory', () => {
    assert.equal(isInsideDirectory('/a/tool/out/x.png', '/a/tool'), true);
  });

  it('catches the directory itself', () => {
    assert.equal(isInsideDirectory('/a/tool', '/a/tool'), true);
  });

  it('catches a path that climbs back in', () => {
    assert.equal(isInsideDirectory('/a/work/../tool/x.png', '/a/tool'), true);
  });

  it('allows a sibling whose name only starts the same', () => {
    assert.equal(isInsideDirectory('/a/toolkit/x.png', '/a/tool'), false);
  });

  it('allows an unrelated work directory', () => {
    assert.equal(isInsideDirectory('/a/work/x.png', '/a/tool'), false);
  });
});

describe('withViewBox', () => {
  it('adds one from the measured dimensions when the root tag has none', () => {
    const out = withViewBox('<svg width="400" height="300"><rect/></svg>', { width: 400, height: 300 });
    assert.equal(out, '<svg viewBox="0 0 400 300" width="400" height="300"><rect/></svg>');
  });

  it('leaves an existing viewBox alone', () => {
    const svg = '<svg viewBox="0 0 10 5" width="400" height="300"></svg>';
    assert.equal(withViewBox(svg, { width: 400, height: 300 }), svg);
  });

  it('uses the fallback canvas when the tag stated no size', () => {
    const out = withViewBox('<svg><rect/></svg>', { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT });
    assert.ok(out.startsWith(`<svg viewBox="0 0 ${FALLBACK_WIDTH} ${FALLBACK_HEIGHT}"`));
  });

  it('touches only the root tag', () => {
    const out = withViewBox('<svg width="10" height="10"><svg width="5" height="5"></svg></svg>', { width: 10, height: 10 });
    assert.equal(out.match(/viewBox/g).length, 1);
  });

  it('returns content with no svg element untouched', () => {
    assert.equal(withViewBox('nothing here', { width: 1, height: 1 }), 'nothing here');
  });
});

describe('buildDocument', () => {
  it('carries the markup through unaltered', () => {
    const svg = '<svg width="10" height="10"><title>a &amp; b</title></svg>';
    assert.ok(buildDocument(svg, 20, 20).includes(svg));
  });

  it('sizes the canvas to the output dimensions', () => {
    const html = buildDocument('<svg></svg>', 1000, 500);
    assert.ok(html.includes('width: 1000px'));
    assert.ok(html.includes('height: 500px'));
    assert.ok(html.includes('overflow: hidden'));
  });

  it('gives the svg a definite width, never a maximum', () => {
    // A max-width would leave the width to be resolved from content, and an SVG
    // contributes a CSS default of 300 by 150 to that, capping every render.
    const html = buildDocument('<svg></svg>', 1200, 900);
    assert.ok(!/max-width/i.test(html));
    assert.ok(!/max-height/i.test(html));
    assert.match(html, /svg\s*\{[^}]*width:\s*1200px[^}]*height:\s*900px[^}]*\}/);
  });
});

describe('DEFAULT_TIMEOUT_MS', () => {
  it('states the load budget the render already ran under', () => {
    // 30000 is the browser driver's own default for this call, so naming it
    // here makes the budget adjustable without moving it.
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });
});
