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

/**
 * Width and height read out of the written file's own header, PNG or JPEG, so
 * the reported size is what the file holds rather than what the arithmetic
 * predicted. A device scale factor multiplies the pixels without touching the
 * layout numbers, which is exactly where a calculated report goes wrong.
 */
export function imageSize(buffer) {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
      throw new Error('the written PNG carries no header chunk');
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
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
        return { width: buffer.readUInt16BE(at + 7), height: buffer.readUInt16BE(at + 5) };
      }
      at += 2 + buffer.readUInt16BE(at + 2);
    }
    throw new Error('the written JPEG carries no frame header');
  }

  throw new Error('the written file is neither a PNG nor a JPEG');
}
