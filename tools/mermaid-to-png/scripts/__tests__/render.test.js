import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULTS,
  THEMES,
  UsageError,
  buildShell,
  fitDiagram,
  parseErrorLine,
  parseFlags,
  pngSize,
  readBackground,
  readInputPath,
  readOptions,
  readOutputPath,
  readOverwrite,
  readScale,
  readTheme,
  readTimeout,
  readWidth,
  viewportWidth
} from '../render-core.js';

const TOOL_DIR = '/tools/mermaid-to-png';

/**
 * fitDiagram runs inside the browser page, so exercising it here means
 * standing up the two DOM nodes it touches.
 */
function fakeSvg(width, height) {
  return {
    style: {},
    viewBox: { baseVal: { width, height } },
    getBoundingClientRect: () => ({ width, height })
  };
}

function withDocument({ svg, container }, run) {
  const previous = globalThis.document;

  globalThis.document = {
    querySelector: (selector) => (selector === '#container' ? container : svg)
  };

  try {
    return run();
  } finally {
    globalThis.document = previous;
  }
}

test('flags parse by name, with valueless flags reading as true', () => {
  assert.deepEqual(parseFlags(['--file', '/a.mmd', '--overwrite']), {
    file: '/a.mmd',
    overwrite: true
  });
});

test('an unknown flag is refused by name rather than ignored', () => {
  assert.throws(() => parseFlags(['--file', '/a.mmd', '--bogus', 'xyz']), /unknown option "--bogus"/);
});

test('a positional argument is refused rather than guessed at', () => {
  assert.throws(() => parseFlags(['diagram.mmd']), UsageError);
});

test('widths and scales take their documented defaults', () => {
  assert.equal(readWidth({}), DEFAULTS.width);
  assert.equal(readScale({}), DEFAULTS.scale);
  assert.equal(readTheme({}), DEFAULTS.theme);
  assert.equal(readBackground({}), DEFAULTS.background);
  assert.equal(readTimeout({}), DEFAULTS.timeout);
});

test('the render budget stays at ten seconds and moves only when asked', () => {
  assert.equal(readTimeout({}), 10000);
  assert.equal(readTimeout({ timeout: '45000' }), 45000);
});

test('a timeout that is not a whole positive number of milliseconds is refused', () => {
  for (const value of ['0', '-1', 'soon', '2.5', '']) {
    assert.throws(() => readTimeout({ timeout: value }), UsageError, `accepted ${value}`);
  }
  assert.throws(() => readTimeout({ timeout: true }), UsageError);
});

test('replacing a file is off until --overwrite asks for it', () => {
  assert.equal(readOverwrite({}), false);
  assert.equal(readOverwrite({ overwrite: true }), true);
});

test('--overwrite handed a value is refused rather than swallowing a path', () => {
  assert.throws(() => readOverwrite({ overwrite: '/work/out.png' }), UsageError);
});

test('a width that is not a whole positive number is refused', () => {
  for (const value of ['0', '-4', 'wide', '12.5', '']) {
    assert.throws(() => readWidth({ width: value }), UsageError, `accepted ${value}`);
  }
  assert.equal(readWidth({ width: '600' }), 600);
});

test('a scale that is not a positive number is refused, fractions allowed', () => {
  for (const value of ['0', '-1', 'retina']) {
    assert.throws(() => readScale({ scale: value }), UsageError, `accepted ${value}`);
  }
  assert.equal(readScale({ scale: '1.5' }), 1.5);
});

test('a flag given with no value is refused, not read as a default', () => {
  assert.throws(() => readWidth({ width: true }), UsageError);
  assert.throws(() => readTheme({ theme: true }), UsageError);
});

test('themes are limited to the four the renderer ships', () => {
  for (const theme of THEMES) {
    assert.equal(readTheme({ theme }), theme);
  }
  assert.throws(() => readTheme({ theme: 'midnight' }), UsageError);
});

test('a background that could carry a declaration of its own is refused', () => {
  assert.equal(readBackground({ background: 'transparent' }), 'transparent');
  assert.equal(readBackground({ background: '#0d1117' }), '#0d1117');
  assert.throws(() => readBackground({ background: 'red; position: fixed' }), UsageError);
  assert.throws(() => readBackground({ background: 'rgb(1,2,3)' }), UsageError);
});

test('both paths must be absolute and named', () => {
  assert.throws(() => readInputPath({}), UsageError);
  assert.throws(() => readInputPath({ file: './diagram.mmd' }), UsageError);
  assert.equal(readInputPath({ file: '/work/diagram.mmd' }), '/work/diagram.mmd');

  assert.throws(() => readOutputPath({}, TOOL_DIR), UsageError);
  assert.throws(() => readOutputPath({ output: 'out.png' }, TOOL_DIR), UsageError);
});

test('an output that is not a PNG is refused', () => {
  assert.throws(() => readOutputPath({ output: '/work/diagram.jpg' }, TOOL_DIR), UsageError);
  assert.equal(readOutputPath({ output: '/work/diagram.PNG' }, TOOL_DIR), '/work/diagram.PNG');
});

test('an output inside the tool directory is refused, climb back in included', () => {
  assert.throws(() => readOutputPath({ output: `${TOOL_DIR}/out.png` }, TOOL_DIR), UsageError);
  assert.throws(() => readOutputPath({ output: `${TOOL_DIR}/scripts/../out.png` }, TOOL_DIR), UsageError);
  assert.throws(() => readOutputPath({ output: '/work/../tools/mermaid-to-png/out.png' }, TOOL_DIR), UsageError);
  assert.equal(readOutputPath({ output: '/work/out.png' }, TOOL_DIR), '/work/out.png');
});

test('a sibling directory sharing the prefix is not inside the tool directory', () => {
  assert.equal(
    readOutputPath({ output: `${TOOL_DIR}-work/out.png` }, TOOL_DIR),
    `${TOOL_DIR}-work/out.png`
  );
});

test('a full option read returns every setting the render needs', () => {
  const options = readOptions(
    ['--file', '/work/a.mmd', '--output', '/work/a.png', '--width', '600', '--scale', '3', '--theme', 'dark', '--background', 'transparent', '--timeout', '20000', '--overwrite'],
    TOOL_DIR
  );

  assert.deepEqual(options, {
    inputPath: '/work/a.mmd',
    outputPath: '/work/a.png',
    width: 600,
    scale: 3,
    theme: 'dark',
    background: 'transparent',
    timeout: 20000,
    overwrite: true
  });
});

test('an option read with nothing optional given carries the documented defaults', () => {
  const options = readOptions(['--file', '/work/a.mmd', '--output', '/work/a.png'], TOOL_DIR);

  assert.equal(options.timeout, DEFAULTS.timeout);
  assert.equal(options.overwrite, false);
});

test('the viewport clears the diagram box', () => {
  assert.ok(viewportWidth(800) > 800);
});

test('the page shell fetches nothing and carries no diagram text', () => {
  const shell = buildShell({ width: 800, background: 'white' });

  assert.ok(!/https?:/i.test(shell));
  assert.ok(!/<script/i.test(shell));
  assert.match(shell, /#container \{ width: 800px; \}/);
  assert.match(shell, /<pre class="mermaid"><\/pre>/);
});

test('the fit pass keeps a diagram narrower than the cap at its own size', () => {
  const svg = fakeSvg(450, 355);
  const container = fakeSvg(0, 0);
  const result = withDocument({ svg, container }, () => fitDiagram(800));

  assert.deepEqual(
    { width: result.drawWidth, height: Math.round(result.drawHeight) },
    { width: 450, height: 355 }
  );
  assert.equal(svg.style.width, '450px');
  assert.equal(container.style.width, '450px');
  assert.equal(svg.style.maxWidth, 'none');
});

test('the fit pass scales a diagram wider than the cap down, keeping its proportions', () => {
  const svg = fakeSvg(900, 300);
  const result = withDocument({ svg, container: fakeSvg(0, 0) }, () => fitDiagram(300));

  assert.equal(result.drawWidth, 300);
  assert.equal(result.drawHeight, 100);
});

test('the fit pass reports nothing when the diagram has no measurable size', () => {
  assert.equal(withDocument({ svg: null, container: null }, () => fitDiagram(800)), null);
  assert.equal(withDocument({ svg: fakeSvg(0, 0), container: fakeSvg(0, 0) }, () => fitDiagram(800)), null);
});

test('PNG dimensions are read from the file header', () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(1280, 16);
  png.writeUInt32BE(720, 20);

  assert.deepEqual(pngSize(png), { width: 1280, height: 720 });
  assert.throws(() => pngSize(Buffer.alloc(24)), /not a PNG/);
});

test('only the line number escapes a renderer parse error', () => {
  // The renderer quotes the file back at you, and this tool reads whatever
  // file it is pointed at, so the quoted text must not survive the extraction.
  const quoted = 'Parse error on line 4:\n... --> C[Three]C --> ((((\n----------^\nExpecting NODE_STRING';

  assert.equal(parseErrorLine(quoted), 4);
  assert.equal(parseErrorLine('No diagram type detected'), null);
});
