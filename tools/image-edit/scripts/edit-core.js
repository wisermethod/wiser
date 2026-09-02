/**
 * image-edit core: every decision a run makes before a pixel is touched.
 *
 * Node built-ins only, and no filesystem or image work, so `node --test` can
 * exercise these rules on a copy with nothing installed.
 */

import { dirname, extname, resolve, sep } from 'node:path';

// Output format is the caller's file extension, so a name and its bytes agree.
export const ENCODERS = new Map([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
  ['.webp', 'webp']
]);

// The encoders that carry an alpha channel. A transparent canvas needs one, or
// the background it was asked for arrives filled in.
export const ALPHA_ENCODERS = new Set(['png', 'webp']);

export const QUALITY = 90;
export const PNG_COMPRESSION_LEVEL = 9;
export const CONTRAST_PIVOT = 128;

// The imaging library's own limits, restated here so a bad value is refused by
// name before anything is installed rather than surfacing as a library throw.
export const BLUR_MIN = 0.3;
export const BLUR_MAX = 1000;
export const SHARPEN_SIGMA_MAX = 10;
export const SHARPEN_MIN = 1;
export const SHARPEN_MAX = SHARPEN_MIN + SHARPEN_SIGMA_MAX;
export const SHARPEN_DEADBAND = 0.000001;

export const ROTATIONS = [90, 180, 270];

export function encoderFor(outputPath) {
  return ENCODERS.get(extname(outputPath).toLowerCase()) ?? null;
}

export function isInsideDirectory(candidate, directory) {
  const target = resolve(candidate);
  const parent = resolve(directory);
  // Normalized first, so a path that climbs out and back in is still caught.
  return target === parent || target.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
}

export function samePath(one, other) {
  return resolve(one) === resolve(other);
}

/** The folder that has to exist before the output can be written. */
export function outputParent(outputPath) {
  return dirname(resolve(outputPath));
}

/**
 * What stops a run from writing to the path the caller named: `directory` when
 * something other than a file is already sitting there, `exists` when a file is
 * and the caller did not ask for it to go, null when the path is free to write.
 * Replacing a file is never the default; it destroys what was there.
 */
export function outputRefusal({ exists = false, isDirectory = false, overwrite = false }) {
  if (isDirectory) return 'directory';
  if (exists && !overwrite) return 'exists';
  return null;
}

/** `WxH`, two whole positive numbers, or null. */
export function parseDimensions(raw) {
  const match = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(raw).trim());
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/**
 * `X,Y`, two whole numbers of either sign, or null. A comma rather than the
 * `x` the sizes use, because this is a coordinate and not a multiplication:
 * `-40x-30` reads as an expression, `-40,-30` reads as a position.
 */
export function parseOffset(raw) {
  const match = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(String(raw).trim());
  if (!match) return null;
  return { x: Number.parseInt(match[1], 10), y: Number.parseInt(match[2], 10) };
}

/**
 * Whether the offset alone leaves room on the canvas, whatever the image turns
 * out to measure. An x at or past the canvas's own width puts every column of
 * any image past the right edge, and a y likewise past the bottom, so that much
 * is answerable before the image is ever opened.
 */
export function offsetLandsOnCanvas(canvas, offset) {
  return offset.x < canvas.width && offset.y < canvas.height;
}

/**
 * Where a placement lands and which part of the image survives it.
 *
 * The image keeps its own size; the canvas keeps its own. The offset is the
 * image's top left corner in canvas coordinates, so a negative one hangs the
 * image off the left or top edge and an image larger than the canvas hangs off
 * the right or bottom. Neither grows the canvas: whatever falls outside is
 * clipped, because the caller asked for a canvas of exactly that size.
 *
 * Returns `extract`, the region of the image to keep, `left` and `top`, where
 * that region sits on the canvas, and `clipped`, true when anything was lost.
 * Returns null when no pixel of the image falls on the canvas at all.
 */
export function placeOnCanvas(size, canvas, offset) {
  const left = Math.max(0, offset.x);
  const top = Math.max(0, offset.y);
  const right = Math.min(canvas.width, offset.x + size.width);
  const bottom = Math.min(canvas.height, offset.y + size.height);
  if (right <= left || bottom <= top) return null;
  const width = right - left;
  const height = bottom - top;
  return {
    extract: { left: left - offset.x, top: top - offset.y, width, height },
    left,
    top,
    clipped: width !== size.width || height !== size.height
  };
}

/** A quarter turn swaps the frame the later steps measure against. */
export function rotatedSize(size, rotate) {
  return rotate === 90 || rotate === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** A center crop takes what is there; it cannot invent pixels, so it clamps. */
export function centerCrop(size, crop) {
  const width = Math.min(crop.width, size.width);
  const height = Math.min(crop.height, size.height);
  return {
    left: Math.max(0, Math.floor((size.width - width) / 2)),
    top: Math.max(0, Math.floor((size.height - height) / 2)),
    width,
    height
  };
}

/**
 * The geometry of one run: what to extract, what to resize to, and the pixel
 * dimensions the finished file will carry. Rotation comes first, and crop and
 * resize measure the rotated frame, because that is the order the pipeline runs.
 */
export function planEdit({ source, rotate = null, crop = null, resize = null }) {
  const rotated = rotatedSize(source, rotate);
  const extract = crop ? centerCrop(rotated, crop) : null;
  const afterCrop = extract ? { width: extract.width, height: extract.height } : rotated;
  const needsResize = Boolean(resize) && (resize.width !== afterCrop.width || resize.height !== afterCrop.height);
  const final = needsResize ? resize : afterCrop;
  return {
    extract,
    resize: needsResize ? resize : null,
    width: final.width,
    height: final.height
  };
}
