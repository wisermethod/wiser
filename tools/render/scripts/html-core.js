/**
 * html-core.js - constants and the image-header read for html rendering.
 *
 * Node built-ins only, no I/O, no browser. scripts/render.js owns the file
 * reads, the browser, and the output.
 */

export const FORMATS = new Map([['.png', 'png'], ['.jpg', 'jpeg'], ['.jpeg', 'jpeg']]);

export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_SCALE = 1;
export const SETTLE_MS = 200;
export const FIT_MARGIN_PX = 10;

export { imageSize } from './drawing-core.js';
