/**
 * render-core.js - The parts of a render that need no browser and no packages.
 *
 * Argument validation, the page shell, and the PNG header read live here so
 * they can be tested without launching anything. render.js owns the browser.
 * Node built-ins only, per system/templates/Script Contract.md.
 */

import { isAbsolute, resolve, sep } from 'node:path';

export const THEMES = ['default', 'neutral', 'dark', 'forest'];

export const DEFAULTS = {
  width: 800,
  scale: 2,
  theme: 'neutral',
  background: 'white',
  timeout: 10000
};

/** Padding between the diagram box and the viewport edge, in CSS pixels. */
const VIEWPORT_MARGIN = 40;

/** Raised for a caller mistake: the message is ours and is safe to print. */
export class UsageError extends Error {}

/** Every flag this tool ships. Anything else is refused by name, never ignored. */
const KNOWN_FLAGS = new Set([
  'file', 'output', 'width', 'scale', 'theme', 'background', 'timeout', 'overwrite'
]);

/**
 * Named flags only. A positional argument is a mistake here, not a shorthand:
 * every path this tool takes is absolute and named, so an unnamed one is
 * almost always a relative path the caller expected to be resolved for them.
 * An unrecognized flag is refused rather than absorbed: silently dropping one
 * returns a file that looks finished and is not what was asked for.
 */
export function parseFlags(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];

    if (!word.startsWith('--')) {
      throw new UsageError(`unexpected argument "${word}"; every value is passed by name, such as --file <absolute path>`);
    }

    const name = word.slice(2);
    if (!KNOWN_FLAGS.has(name)) {
      throw new UsageError(`unknown option "${word}"`);
    }

    const next = argv[index + 1];

    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
      continue;
    }

    flags[name] = next;
    index += 1;
  }

  return flags;
}

function requireValue(flags, name) {
  const value = flags[name];
  if (value === undefined) return undefined;
  if (value === true) {
    throw new UsageError(`--${name} needs a value`);
  }
  return value;
}

export function readWidth(flags) {
  const raw = requireValue(flags, 'width');
  if (raw === undefined) return DEFAULTS.width;

  const width = Number(raw);
  if (!Number.isInteger(width) || width < 1) {
    throw new UsageError(`--width must be a whole number of pixels above zero; got "${raw}"`);
  }
  return width;
}

export function readScale(flags) {
  const raw = requireValue(flags, 'scale');
  if (raw === undefined) return DEFAULTS.scale;

  const scale = Number(raw);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new UsageError(`--scale must be a number above zero; got "${raw}"`);
  }
  return scale;
}

/**
 * The render budget, in milliseconds: how long the diagram has to appear
 * before the run gives up. The default is the budget this tool has always
 * allowed; the option exists because a very large diagram on a slow machine
 * is a waiting problem, not a broken one.
 */
export function readTimeout(flags) {
  const raw = requireValue(flags, 'timeout');
  if (raw === undefined) return DEFAULTS.timeout;

  const timeout = Number(raw);
  if (!Number.isInteger(timeout) || timeout < 1) {
    throw new UsageError(`--timeout must be a whole number of milliseconds above zero; got "${raw}"`);
  }
  return timeout;
}

/**
 * A switch, not a value. `--overwrite` handed a value has almost certainly
 * swallowed the path that followed it, and reading it as true anyway would
 * hide that while doing the one thing this flag exists to make deliberate.
 */
export function readOverwrite(flags) {
  const value = flags.overwrite;

  if (value === undefined) return false;
  if (value !== true) {
    throw new UsageError(`--overwrite takes no value; got "${value}". Pass it alone to replace a file that is already at --output`);
  }
  return true;
}

export function readTheme(flags) {
  const raw = requireValue(flags, 'theme');
  if (raw === undefined) return DEFAULTS.theme;

  if (!THEMES.includes(raw)) {
    throw new UsageError(`--theme must be one of ${THEMES.join(', ')}; got "${raw}"`);
  }
  return raw;
}

/**
 * A color reaches a stylesheet, so the accepted shapes are closed: the word
 * transparent, a hex color, or a single color word. Anything else could
 * carry a declaration of its own.
 */
export function readBackground(flags) {
  const raw = requireValue(flags, 'background');
  if (raw === undefined) return DEFAULTS.background;

  const isHex = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw);
  const isWord = /^[a-zA-Z]+$/.test(raw);

  if (!isHex && !isWord) {
    throw new UsageError(`--background must be transparent, a hex color such as #ffffff, or a single color word; got "${raw}"`);
  }
  return raw;
}

export function readInputPath(flags) {
  const raw = requireValue(flags, 'file');

  if (raw === undefined) {
    throw new UsageError('--file is required: the Mermaid diagram to render, as an absolute path');
  }
  if (!isAbsolute(raw)) {
    throw new UsageError(`--file must be absolute; got "${raw}", which would resolve against whatever directory the caller happened to be in`);
  }
  return raw;
}

/**
 * The output path is where the caller wants the PNG, and the one place this
 * tool writes. It may not land inside the tool's own directory (Script
 * Contract), and it may not claim an extension the file will not have.
 */
export function readOutputPath(flags, toolDir) {
  const raw = requireValue(flags, 'output');

  if (raw === undefined) {
    throw new UsageError('--output is required: where to write the PNG, as an absolute path. This tool has no default location; ask which directory the result belongs in');
  }
  if (!isAbsolute(raw)) {
    throw new UsageError(`--output must be absolute; got "${raw}", which would resolve against whatever directory the caller happened to be in`);
  }
  if (!/\.png$/i.test(raw)) {
    throw new UsageError(`--output must end in .png; got "${raw}". Only PNG is written, and a name that says otherwise misleads whatever opens it next`);
  }

  const target = resolve(raw);
  if (target === toolDir || target.startsWith(`${toolDir}${sep}`)) {
    throw new UsageError(`--output resolves inside this tool directory (${toolDir}). Scripts write only to a work directory in the owning root; pass that path instead`);
  }
  return target;
}

export function readOptions(argv, toolDir) {
  const flags = parseFlags(argv);

  return {
    inputPath: readInputPath(flags),
    outputPath: readOutputPath(flags, toolDir),
    width: readWidth(flags),
    scale: readScale(flags),
    theme: readTheme(flags),
    background: readBackground(flags),
    timeout: readTimeout(flags),
    overwrite: readOverwrite(flags)
  };
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

/**
 * Width and height straight out of the PNG's IHDR chunk, so the reported size
 * is what the file holds rather than what the arithmetic predicted.
 */
export function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('the written file is not a PNG');
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('the written PNG has no header chunk');
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

/**
 * A renderer's parse error quotes the diagram it was given, and this tool will
 * read any file it is pointed at, so only the line number crosses back out.
 */
export function parseErrorLine(message) {
  const match = /\bline\s+(\d+)/i.exec(String(message ?? ''));
  return match ? Number(match[1]) : null;
}
