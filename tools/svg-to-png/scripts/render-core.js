/**
 * svg-to-png core - the sizing decisions and the page the browser renders.
 *
 * Node built-ins only, no I/O, no browser. Everything here is a pure function so
 * the sizing rules can be tested without installing a package or launching a
 * browser; scripts/render.js owns the file reads, the browser, and the output.
 */

import { resolve, sep } from 'node:path';

export const DEFAULT_SCALE = 2;
export const FALLBACK_WIDTH = 800;
export const FALLBACK_HEIGHT = 600;

/**
 * The load budget, in milliseconds, for the page the SVG is placed on. It is
 * the budget this tool already ran under, stated here so `--timeout` can move
 * it; passing it explicitly changes no default behavior.
 */
export const DEFAULT_TIMEOUT_MS = 30000;

const SVG_TAG = /<svg\b[^>]*>/i;
const LENGTH = '([0-9]*\\.?[0-9]+)(?:px)?';

/**
 * The root <svg> tag's own opening tag, or null when the content holds none.
 * Attributes are read from this tag alone: a width on a nested shape describes
 * that shape, not the document.
 */
function rootTag(svgContent) {
  const match = SVG_TAG.exec(svgContent);
  return match ? match[0] : null;
}

function attributeLength(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']\\s*${LENGTH}\\s*["']`, 'i');
  const match = pattern.exec(tag);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The last two numbers of the viewBox, which are its width and height.
 * A percentage or a unit this pattern does not accept reads as absent, so the
 * chain falls through rather than sizing to a number that means something else.
 */
function viewBoxSize(tag) {
  const match = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(tag);
  if (!match) return null;
  const numbers = match[1].trim().split(/[\s,]+/).map(Number.parseFloat);
  if (numbers.length < 4 || numbers.some((n) => !Number.isFinite(n))) return null;
  const [, , width, height] = numbers.slice(numbers.length - 4);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The SVG's own dimensions, by the fallback chain: the root tag's width and
 * height attributes, then its viewBox, then the fallback square-ish canvas.
 * `sizedFrom` reports which of the three answered, so a caller can tell a
 * measured render from a fallback one.
 */
export function readSvgSize(svgContent) {
  const tag = rootTag(svgContent);
  if (tag) {
    const width = attributeLength(tag, 'width');
    const height = attributeLength(tag, 'height');
    if (width && height) return { width, height, sizedFrom: 'attributes' };

    const box = viewBoxSize(tag);
    if (box) return { ...box, sizedFrom: 'viewBox' };
  }
  return { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT, sizedFrom: 'default' };
}

/**
 * Output pixels. `targetWidth` wins when given: it becomes the scale that puts
 * the SVG at that width, and the height follows so the aspect ratio holds.
 */
export function resolveOutputSize({ svgWidth, svgHeight, scale = DEFAULT_SCALE, targetWidth = null }) {
  const effectiveScale = targetWidth ? targetWidth / svgWidth : scale;
  return {
    width: Math.round(svgWidth * effectiveScale),
    height: Math.round(svgHeight * effectiveScale),
    scale: effectiveScale
  };
}

/**
 * True when `outputPath` lands on the tool's own directory or inside it. The
 * Script Contract allows a script no write there beyond its dependency install.
 */
export function isInsideDirectory(outputPath, directory) {
  const target = resolve(outputPath);
  const parent = resolve(directory);
  return target === parent || target.startsWith(`${parent}${sep}`);
}

/**
 * The markup with a viewBox on its root tag, added from the dimensions already
 * read when the tag carries none.
 *
 * The viewBox is what maps the drawing's own coordinates onto whatever size the
 * viewport is given. Without one, enlarging the viewport enlarges the canvas and
 * leaves the artwork at its original size in the corner, which is padding rather
 * than the scaling every option here promises. The copy handed to the browser
 * changes; the file on disk never does.
 */
export function withViewBox(svgContent, { width, height }) {
  const tag = rootTag(svgContent);
  if (!tag || /\bviewBox\s*=/i.test(tag)) return svgContent;
  return svgContent.replace(tag, tag.replace(/^<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`));
}

/**
 * The page the browser screenshots: the SVG markup on a canvas of exactly the
 * output dimensions with the document chrome zeroed out, so the screenshot's
 * clip and the rendered artwork agree pixel for pixel.
 *
 * Both dimensions are definite. A `max-width` here would leave the element's
 * width to be resolved from its content, and an SVG contributes a CSS default
 * of 300 by 150 to that resolution, so every render would come out 300 wide
 * whatever the caller asked for.
 */
export function buildDocument(svgContent, width, height) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; }
  svg { width: ${width}px; height: ${height}px; }
</style>
</head>
<body>${svgContent}</body>
</html>`;
}
