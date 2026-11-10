// Drawing and sizing shared by the portable browser core and CLI validators.

const DEFAULT_SCALE = 2, FALLBACK_WIDTH = 800, FALLBACK_HEIGHT = 600, VIEWPORT_MARGIN = 40;
export function imageSize(buffer) {
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (buffer.length >= 24 && PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)) {
    if (String.fromCharCode(...buffer.subarray(12, 16)) !== 'IHDR') {
      throw new Error('the written PNG carries no header chunk');
    }
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // JPEG keeps its dimensions in the frame header, which sits an unknown
    // number of segments in, so the segment chain is walked to find it.
    let at = 2;
    while (at + 9 < buffer.length) {
      if (buffer[at] !== 0xff) break;
      const marker = buffer[at + 1];
      // A run of 0xff bytes is padding before the marker, not a marker.
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      // Standalone markers carry no length word to skip past.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2;
        continue;
      }
      const isFrameHeader = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
      }
      at += 2 + view.getUint16(at + 2);
    }
    throw new Error('the written JPEG carries no frame header');
  }

  throw new Error('the written file is neither a PNG nor a JPEG');
}

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

export function viewportWidth(width) {
  return width + VIEWPORT_MARGIN;
}

/**
 * The page the diagram renders in. It holds no diagram text and no script:
 * the source is set as text through the DOM and the renderer is attached from
 * this tool's own node_modules, so nothing here can be closed early by the
 * contents of a caller's file and nothing is fetched from anywhere.
 *
 * The width is definite rather than a maximum, because a diagram that lays
 * itself out against its container needs a real one to lay out against; what
 * keeps a narrow diagram from being padded out to it is the fit pass below.
 */
export function buildShell({ width, background }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 20px;
    background: ${background};
    display: flex;
    justify-content: center;
  }
  #container { width: ${width}px; }
  .mermaid {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .mermaid svg { display: block; }
</style>
</head>
<body>
  <div id="container"><pre class="mermaid"></pre></div>
</body>
</html>`;
}

/**
 * Runs in the page once the diagram exists: sizes the drawing to what it
 * actually measures, capped at the requested width, then shrinks the frame
 * onto it. Without this the capture is whatever the renderer's own
 * responsive sizing left behind, which is neither the diagram's size nor the
 * requested one.
 */
export function fitDiagram(cap) {
  const svg = document.querySelector('.mermaid svg');

  if (!svg) return null;

  const box = svg.viewBox.baseVal;
  const naturalWidth = box && box.width ? box.width : svg.getBoundingClientRect().width;
  const naturalHeight = box && box.height ? box.height : svg.getBoundingClientRect().height;

  if (!naturalWidth || !naturalHeight) return null;

  const drawWidth = Math.min(naturalWidth, cap);
  const drawHeight = (naturalHeight * drawWidth) / naturalWidth;

  svg.style.maxWidth = 'none';
  svg.style.width = `${drawWidth}px`;
  svg.style.height = `${drawHeight}px`;
  document.querySelector('#container').style.width = `${drawWidth}px`;

  return { naturalWidth, naturalHeight, drawWidth, drawHeight };
};


export function parseErrorLine(message) {
  const match = /\bline\s+(\d+)/i.exec(String(message ?? ''));
  return match ? Number(match[1]) : null;
}
