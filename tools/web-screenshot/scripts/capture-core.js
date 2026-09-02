/**
 * web-screenshot - argument validation, failure classification, PNG header read
 *
 * Node built-ins only and no packages, so the entry script can import this
 * above its dependency check: a usage mistake must never trigger an install.
 */

import { existsSync } from 'node:fs';
import { extname, isAbsolute, resolve, sep } from 'node:path';

export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;
export const DEFAULT_SCALE = 1;
export const DEFAULT_TIMEOUT_MS = 30000;
export const MINIMUM_TIMEOUT_MS = 1000;
export const SETTLE_MS = 1000;

/**
 * A web address this tool will navigate to. Only http and https: a screenshot
 * of a local file is a different tool's job, and every other scheme either
 * cannot be rendered or reaches somewhere a caller did not name.
 */
export function validateUrl(raw) {
  if (!raw) {
    return { ok: false, message: 'Error: --url is required. Pass the http or https address of the page to capture.' };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: `Error: --url is not a web address: "${raw}". Pass a full address including the scheme, as in https://host/path.` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: `Error: --url must use http or https; got "${parsed.protocol}". This tool captures live web pages only; a local HTML file needs html-to-png, a Mermaid diagram mermaid-to-png, and an SVG svg-to-png.` };
  }

  if (!parsed.hostname) {
    return { ok: false, message: `Error: --url names no host: "${raw}". Pass a full address including the scheme and host.` };
  }

  return { ok: true, value: parsed.href };
}

/**
 * A viewport dimension in whole pixels, shared by --width and --height so the
 * two agree on what they accept. The source accepted anything parseInt returned.
 */
function wholePixels(name, raw, fallback) {
  if (raw === undefined) return { ok: true, value: fallback };

  if (!/^\d+$/.test(String(raw).trim())) {
    return { ok: false, message: `Error: ${name} must be a whole number of pixels; got "${raw}".` };
  }

  const value = Number.parseInt(String(raw).trim(), 10);
  if (value < 1) {
    return { ok: false, message: `Error: ${name} must be at least 1 pixel; got "${raw}".` };
  }

  return { ok: true, value };
}

/** Viewport width in whole pixels, which decides the responsive layout. */
export function validateWidth(raw) {
  return wholePixels('--width', raw, DEFAULT_WIDTH);
}

/** Viewport height in whole pixels, which decides the fold. */
export function validateHeight(raw) {
  return wholePixels('--height', raw, DEFAULT_HEIGHT);
}

/**
 * Device scale factor. Not a viewport dimension: it multiplies the pixels the
 * browser writes without changing the layout, so a fraction is meaningful and
 * the whole-number rule above would be wrong here.
 */
export function validateScale(raw) {
  if (raw === undefined) return { ok: true, value: DEFAULT_SCALE };

  if (!/^\d*\.?\d+$/.test(String(raw).trim())) {
    return { ok: false, message: `Error: --scale must be a positive number; got "${raw}".` };
  }

  const value = Number.parseFloat(String(raw).trim());
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: `Error: --scale must be a positive number; got "${raw}".` };
  }

  return { ok: true, value };
}

/**
 * The navigation budget, in whole milliseconds, the unit every tool in this
 * family takes. It is the wait for network silence, so it is the one number
 * that decides whether a busy page can be captured at all.
 *
 * The floor is a full second, and it is there to catch a unit mistake rather
 * than to forbid a short budget: a caller who passes 30 meant 30 seconds and
 * would otherwise get a run that fails in 30 milliseconds against a page that
 * was never given a chance.
 */
export function validateTimeout(raw) {
  if (raw === undefined) return { ok: true, value: DEFAULT_TIMEOUT_MS };

  if (!/^\d+$/.test(String(raw).trim())) {
    return { ok: false, message: `Error: --timeout must be a whole number of milliseconds; got "${raw}".` };
  }

  const value = Number.parseInt(String(raw).trim(), 10);
  if (value < MINIMUM_TIMEOUT_MS) {
    return { ok: false, message: `Error: --timeout is in milliseconds and must be at least ${MINIMUM_TIMEOUT_MS}; got "${raw}". Thirty seconds is ${DEFAULT_TIMEOUT_MS}, not 30.` };
  }

  return { ok: true, value };
}

/**
 * The destination file. Absolute, ending in .png, and outside this tool's own
 * directory: the Script Contract lets a script write only where the caller
 * names, and the caller names a work directory in the owning root.
 */
export function validateOutput(raw, toolDir) {
  if (!raw) {
    return { ok: false, message: 'Error: --output is required. Name the absolute path of the .png file to write; this tool has no default destination.' };
  }

  if (!isAbsolute(raw)) {
    return { ok: false, message: `Error: --output must be absolute; got "${raw}". A relative path resolves against whatever directory the caller happened to be in.` };
  }

  const target = resolve(raw);

  if (extname(target).toLowerCase() !== '.png') {
    return { ok: false, message: `Error: --output must end in .png; got "${raw}". This tool encodes PNG only, and an extension that disagrees with the bytes misleads whatever opens the file.` };
  }

  const normalizedToolDir = resolve(toolDir);
  if (target === normalizedToolDir || target.startsWith(`${normalizedToolDir}${sep}`)) {
    return { ok: false, message: `Error: --output resolves inside this tool directory (${normalizedToolDir}). Pass a work directory in the owning root instead.` };
  }

  return { ok: true, value: target };
}

/**
 * The destination against what is already on disk. A capture replaces its file
 * whole, so an existing one is a caller's earlier work: it is refused by
 * default, named, and replaced only when the caller says so.
 *
 * `exists` is injected so the rule can be tested without touching a disk.
 */
export function validateOverwrite(target, { overwrite = false, exists = existsSync } = {}) {
  if (overwrite || !exists(target)) return { ok: true, value: target };

  return {
    ok: false,
    message: `Error: --output already exists: ${target}. Pass --overwrite to replace it, or name a path that is not in use.`
  };
}

/**
 * A failure from the browser, restated in this tool's own words. The raw
 * message is read to classify and never repeated: an external component's
 * prose is outside this tool's control and outside the Script Contract's
 * error discipline.
 */
export function classifyFailure(rawMessage, { url, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const text = String(rawMessage ?? '');
  const where = url ? ` for ${url}` : '';

  if (
    text.includes("Executable doesn't exist") ||
    text.includes('playwright install') ||
    /install-deps|missing dependencies to run browsers/i.test(text)
  ) {
    return {
      code: 'browser-missing',
      message:
        'Error: Chromium cannot launch; check: node scripts/capture.js check (read remediation). See the Dependencies section of TOOL.md.'
    };
  }
  if (text.includes('ERR_NAME_NOT_RESOLVED')) {
    return { code: 'dns', message: `Error: the host in --url did not resolve${where}. Check the spelling of the host, or that the machine has a working DNS path to it.` };
  }
  if (text.includes('ERR_CONNECTION_REFUSED')) {
    return { code: 'refused', message: `Error: the host refused the connection${where}. Confirm the port is right and that something is listening on it.` };
  }
  if (text.includes('ERR_CERT') || text.includes('ERR_SSL')) {
    return { code: 'tls', message: `Error: the TLS certificate was rejected${where}. This tool captures only what a browser would trust; fix the certificate or capture the http address.` };
  }
  if (text.includes('net::ERR')) {
    return { code: 'network', message: `Error: the page could not be reached${where}. Confirm the address is correct and reachable from this machine.` };
  }
  if (text.includes('Timeout') && text.includes('exceeded')) {
    return { code: 'timeout', message: `Error: the page did not finish loading within ${timeoutMs} ms${where}. This tool waits for network activity to stop, so a page that keeps issuing requests (a polling beacon, an ad or analytics loop) or leaves one unanswered never settles and reaches this timeout even though it rendered; raise --timeout for a page that is merely slow, never for one that is never quiet.` };
  }
  return { code: 'render', message: `Error: the page could not be captured${where}. Confirm the address renders in a browser on this machine.` };
}

/**
 * Pixel dimensions from a PNG's IHDR chunk: 8 signature bytes, then a 4-byte
 * length, the 4-byte type, and width and height as big-endian 32-bit values.
 */
export function pngSizeFromHeader(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return null;
  }
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
