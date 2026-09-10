import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALPHA_ENCODERS,
  centerCrop,
  encoderFor,
  isInsideDirectory,
  offsetLandsOnCanvas,
  outputParent,
  outputRefusal,
  parseDimensions,
  parseOffset,
  placeOnCanvas,
  planEdit,
  rotatedSize,
  samePath
} from '../edit-core.js';

test('the output extension chooses the encoder, in any case', () => {
  assert.equal(encoderFor('/work/a.png'), 'png');
  assert.equal(encoderFor('/work/a.PNG'), 'png');
  assert.equal(encoderFor('/work/a.jpg'), 'jpeg');
  assert.equal(encoderFor('/work/a.jpeg'), 'jpeg');
  assert.equal(encoderFor('/work/a.webp'), 'webp');
});

test('an extension this tool does not write has no encoder', () => {
  assert.equal(encoderFor('/work/a.gif'), null);
  assert.equal(encoderFor('/work/a.tiff'), null);
  assert.equal(encoderFor('/work/a'), null);
  assert.equal(encoderFor('/work/.env'), null);
});

test('the tool-directory guard sees a path that climbs out and back in', () => {
  assert.equal(isInsideDirectory('/tools/image/out.png', '/tools/image'), true);
  assert.equal(isInsideDirectory('/tools/image', '/tools/image'), true);
  assert.equal(isInsideDirectory('/work/../tools/image/scripts/out.png', '/tools/image'), true);
  assert.equal(isInsideDirectory('/tools/image-notes/out.png', '/tools/image'), false);
  assert.equal(isInsideDirectory('/work/out.png', '/tools/image'), false);
});

test('two spellings of one file are one file', () => {
  assert.equal(samePath('/work/a.png', '/work/./a.png'), true);
  assert.equal(samePath('/work/a.png', '/work/sub/../a.png'), true);
  assert.equal(samePath('/work/a.png', '/work/b.png'), false);
});

test('an occupied output is refused until the caller asks for the overwrite', () => {
  assert.equal(outputRefusal({ exists: false }), null);
  assert.equal(outputRefusal({ exists: true }), 'exists');
  assert.equal(outputRefusal({ exists: true, overwrite: true }), null);
  assert.equal(outputRefusal({ exists: false, overwrite: true }), null);
});

test('a directory is never a target, asked for or not', () => {
  assert.equal(outputRefusal({ exists: true, isDirectory: true }), 'directory');
  assert.equal(outputRefusal({ exists: true, isDirectory: true, overwrite: true }), 'directory');
});

test('the folder to create is the output path normalized, not the string given', () => {
  assert.equal(outputParent('/work/cards/photo.png'), '/work/cards');
  assert.equal(outputParent('/work/cards/sub/../photo.png'), '/work/cards');
  assert.equal(outputParent('/work/./photo.png'), '/work');
  assert.equal(outputParent('/photo.png'), '/');
});

test('dimensions parse as WxH and nothing else', () => {
  assert.deepEqual(parseDimensions('1440x810'), { width: 1440, height: 810 });
  assert.deepEqual(parseDimensions(' 800 X 600 '), { width: 800, height: 600 });
  assert.equal(parseDimensions('1440'), null);
  assert.equal(parseDimensions('1440x'), null);
  assert.equal(parseDimensions('1440x810px'), null);
  assert.equal(parseDimensions('0x600'), null);
  assert.equal(parseDimensions('-800x600'), null);
  assert.equal(parseDimensions('1440.5x810'), null);
});

test('a quarter turn swaps the frame, a half turn does not', () => {
  assert.deepEqual(rotatedSize({ width: 400, height: 300 }, 90), { width: 300, height: 400 });
  assert.deepEqual(rotatedSize({ width: 400, height: 300 }, 270), { width: 300, height: 400 });
  assert.deepEqual(rotatedSize({ width: 400, height: 300 }, 180), { width: 400, height: 300 });
  assert.deepEqual(rotatedSize({ width: 400, height: 300 }, null), { width: 400, height: 300 });
});

test('a center crop is centered', () => {
  assert.deepEqual(centerCrop({ width: 1000, height: 800 }, { width: 400, height: 400 }), {
    left: 300,
    top: 200,
    width: 400,
    height: 400
  });
});

test('a crop larger than the image clamps to the image', () => {
  assert.deepEqual(centerCrop({ width: 800, height: 600 }, { width: 1000, height: 1000 }), {
    left: 0,
    top: 0,
    width: 800,
    height: 600
  });
});

test('crop and resize measure the rotated frame, not the original', () => {
  const plan = planEdit({
    source: { width: 400, height: 300 },
    rotate: 90,
    crop: { width: 200, height: 400 }
  });
  // Rotated to 300x400, so the crop is centered on 300 wide, not on 400.
  assert.deepEqual(plan.extract, { left: 50, top: 0, width: 200, height: 400 });
  assert.equal(plan.width, 200);
  assert.equal(plan.height, 400);
});

test('a resize that matches the current size is not run', () => {
  const plan = planEdit({ source: { width: 800, height: 600 }, resize: { width: 800, height: 600 } });
  assert.equal(plan.resize, null);
  assert.equal(plan.width, 800);
  assert.equal(plan.height, 600);
});

test('resize is measured after the crop', () => {
  const plan = planEdit({
    source: { width: 1000, height: 1000 },
    crop: { width: 500, height: 500 },
    resize: { width: 500, height: 500 }
  });
  assert.deepEqual(plan.extract, { left: 250, top: 250, width: 500, height: 500 });
  assert.equal(plan.resize, null);
  assert.equal(plan.width, 500);
});

test('a plan with no operations changes no geometry', () => {
  const plan = planEdit({ source: { width: 640, height: 480 } });
  assert.deepEqual(plan, { extract: null, resize: null, width: 640, height: 480 });
});

test('only the encoders with an alpha channel can hold a transparent canvas', () => {
  assert.equal(ALPHA_ENCODERS.has('png'), true);
  assert.equal(ALPHA_ENCODERS.has('webp'), true);
  assert.equal(ALPHA_ENCODERS.has('jpeg'), false);
});

test('an offset parses as X,Y, either sign, and nothing else', () => {
  assert.deepEqual(parseOffset('120,40'), { x: 120, y: 40 });
  assert.deepEqual(parseOffset('-40,-30'), { x: -40, y: -30 });
  assert.deepEqual(parseOffset(' 0 , -7 '), { x: 0, y: -7 });
  assert.equal(parseOffset('120'), null);
  assert.equal(parseOffset('120,'), null);
  assert.equal(parseOffset('120x40'), null);
  assert.equal(parseOffset('12.5,40'), null);
  assert.equal(parseOffset('120,40px'), null);
  assert.equal(parseOffset('abc'), null);
  assert.equal(parseOffset(''), null);
});

test('an offset at or past the canvas leaves nothing to place, whatever the image', () => {
  const canvas = { width: 100, height: 80 };
  assert.equal(offsetLandsOnCanvas(canvas, { x: 0, y: 0 }), true);
  assert.equal(offsetLandsOnCanvas(canvas, { x: 99, y: 79 }), true);
  assert.equal(offsetLandsOnCanvas(canvas, { x: -9000, y: -9000 }), true);
  assert.equal(offsetLandsOnCanvas(canvas, { x: 100, y: 0 }), false);
  assert.equal(offsetLandsOnCanvas(canvas, { x: 0, y: 80 }), false);
});

test('a placement inside the canvas keeps the whole image', () => {
  assert.deepEqual(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: 12, y: 7 }), {
    extract: { left: 0, top: 0, width: 40, height: 30 },
    left: 12,
    top: 7,
    clipped: false
  });
});

test('a placement flush against the far corner is still not clipped', () => {
  assert.deepEqual(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: 60, y: 50 }), {
    extract: { left: 0, top: 0, width: 40, height: 30 },
    left: 60,
    top: 50,
    clipped: false
  });
});

test('a negative offset hangs the image off the left and top, and that part is clipped', () => {
  assert.deepEqual(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: -10, y: -5 }), {
    extract: { left: 10, top: 5, width: 30, height: 25 },
    left: 0,
    top: 0,
    clipped: true
  });
});

test('an image larger than the canvas is clipped, never grown to fit', () => {
  assert.deepEqual(placeOnCanvas({ width: 200, height: 150 }, { width: 100, height: 80 }, { x: 0, y: 0 }), {
    extract: { left: 0, top: 0, width: 100, height: 80 },
    left: 0,
    top: 0,
    clipped: true
  });
});

test('an image clipped on all four sides keeps only the middle', () => {
  assert.deepEqual(placeOnCanvas({ width: 200, height: 150 }, { width: 100, height: 80 }, { x: -30, y: -20 }), {
    extract: { left: 30, top: 20, width: 100, height: 80 },
    left: 0,
    top: 0,
    clipped: true
  });
});

test('a placement with no pixel on the canvas is refused rather than blank', () => {
  assert.equal(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: -40, y: 0 }), null);
  assert.equal(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: 0, y: -30 }), null);
  assert.equal(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: 100, y: 0 }), null);
  assert.equal(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: -41, y: -31 }), null);
});

test('one row of pixels on the canvas is still a placement', () => {
  assert.deepEqual(placeOnCanvas({ width: 40, height: 30 }, { width: 100, height: 80 }, { x: -39, y: 79 }), {
    extract: { left: 39, top: 0, width: 1, height: 1 },
    left: 0,
    top: 79,
    clipped: true
  });
});
