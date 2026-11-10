/**
 * render svg core - the sizing decisions and the page the browser renders.
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

export { readSvgSize, resolveOutputSize, withViewBox, buildDocument } from './drawing-core.js';

/**
 * True when `outputPath` lands on the tool's own directory or inside it. The
 * Script Contract allows a script no write there beyond its dependency install.
 */
export function isInsideDirectory(outputPath, directory) {
  const target = resolve(outputPath);
  const parent = resolve(directory);
  return target === parent || target.startsWith(`${parent}${sep}`);
}
