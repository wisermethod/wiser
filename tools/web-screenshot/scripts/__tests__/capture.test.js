import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_HEIGHT,
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  MINIMUM_TIMEOUT_MS,
  classifyFailure,
  pngSizeFromHeader,
  screenDestination,
  validateHeight,
  validateOutput,
  validateOverwrite,
  validateScale,
  validateTimeout,
  validateUrl,
  validateWidth
} from '../capture-core.js';

const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTSIDE = process.platform === 'win32' ? 'C:\\work\\shots' : '/work/shots';

describe('validateUrl', () => {
  it('accepts an https address', () => {
    const result = validateUrl('https://host.example/page');
    assert.equal(result.ok, true);
    assert.equal(result.value, 'https://host.example/page');
  });

  it('accepts an http address, including one with a port', () => {
    const result = validateUrl('http://host.example:8080/');
    assert.equal(result.ok, true);
  });

  it('refuses a missing url', () => {
    const result = validateUrl(undefined);
    assert.equal(result.ok, false);
    assert.match(result.message, /--url is required/);
  });

  it('refuses a string that is not an address', () => {
    const result = validateUrl('host.example/page');
    assert.equal(result.ok, false);
    assert.match(result.message, /not a web address/);
  });

  it('refuses a file scheme', () => {
    const result = validateUrl('file:///etc/hosts');
    assert.equal(result.ok, false);
    assert.match(result.message, /http or https/);
  });

  it('names the sibling tools that own the schemes it refuses', () => {
    const { message } = validateUrl('file:///page.html');
    assert.match(message, /html-to-png/);
    assert.match(message, /mermaid-to-png/);
    assert.match(message, /svg-to-png/);
  });

  it('refuses a data scheme', () => {
    assert.equal(validateUrl('data:text/html,<p>x</p>').ok, false);
  });

  it('normalizes a bare host to a path', () => {
    assert.equal(validateUrl('https://host.example').value, 'https://host.example/');
  });
});

describe('validateWidth', () => {
  it('defaults when absent', () => {
    assert.equal(validateWidth(undefined).value, DEFAULT_WIDTH);
  });

  it('accepts a whole number', () => {
    assert.equal(validateWidth('375').value, 375);
  });

  it('refuses text', () => {
    const result = validateWidth('wide');
    assert.equal(result.ok, false);
    assert.match(result.message, /whole number/);
  });

  it('refuses a decimal', () => {
    assert.equal(validateWidth('12.5').ok, false);
  });

  it('refuses zero and negatives', () => {
    assert.equal(validateWidth('0').ok, false);
    assert.equal(validateWidth('-100').ok, false);
  });

  it('refuses the boolean a flag with no value would produce', () => {
    assert.equal(validateWidth(true).ok, false);
  });
});

describe('validateHeight', () => {
  it('defaults to the viewport height when absent', () => {
    assert.equal(validateHeight(undefined).value, DEFAULT_HEIGHT);
    assert.equal(DEFAULT_HEIGHT, 720);
  });

  it('accepts a whole number', () => {
    assert.equal(validateHeight('667').value, 667);
  });

  it('refuses text, a decimal, zero, and a negative', () => {
    assert.equal(validateHeight('tall').ok, false);
    assert.equal(validateHeight('720.5').ok, false);
    assert.equal(validateHeight('0').ok, false);
    assert.equal(validateHeight('-720').ok, false);
  });

  it('names --height, not --width, when it refuses', () => {
    assert.match(validateHeight('tall').message, /--height must be a whole number of pixels/);
  });

  it('refuses the boolean a flag with no value would produce', () => {
    assert.equal(validateHeight(true).ok, false);
  });
});

describe('validateScale', () => {
  it('defaults to 1, which leaves the image at viewport pixels', () => {
    assert.equal(validateScale(undefined).value, DEFAULT_SCALE);
    assert.equal(DEFAULT_SCALE, 1);
  });

  it('accepts a whole factor', () => {
    assert.equal(validateScale('2').value, 2);
  });

  it('accepts a fraction, which a device scale factor can be', () => {
    assert.equal(validateScale('1.5').value, 1.5);
    assert.equal(validateScale('0.5').value, 0.5);
  });

  it('refuses zero, a negative, and text', () => {
    assert.equal(validateScale('0').ok, false);
    assert.equal(validateScale('-2').ok, false);
    assert.equal(validateScale('retina').ok, false);
  });

  it('refuses a number carrying a unit', () => {
    assert.equal(validateScale('2x').ok, false);
  });

  it('refuses the boolean a flag with no value would produce', () => {
    assert.equal(validateScale(true).ok, false);
  });
});

describe('validateTimeout', () => {
  it('defaults to the budget this tool has always waited, in the family unit', () => {
    assert.equal(validateTimeout(undefined).value, DEFAULT_TIMEOUT_MS);
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('accepts a whole number of milliseconds', () => {
    assert.equal(validateTimeout('5000').value, 5000);
  });

  it('accepts the floor exactly', () => {
    assert.equal(validateTimeout(String(MINIMUM_TIMEOUT_MS)).value, MINIMUM_TIMEOUT_MS);
    assert.equal(MINIMUM_TIMEOUT_MS, 1000);
  });

  it('refuses zero, a negative, a decimal, and text', () => {
    assert.equal(validateTimeout('0').ok, false);
    assert.equal(validateTimeout('-5000').ok, false);
    assert.equal(validateTimeout('2500.5').ok, false);
    assert.equal(validateTimeout('soon').ok, false);
  });

  it('refuses a value below the floor, which is a caller thinking in seconds', () => {
    assert.equal(validateTimeout('30').ok, false);
    assert.equal(validateTimeout('999').ok, false);
  });

  it('names the unit when it refuses a seconds-shaped value', () => {
    const { message } = validateTimeout('30');
    assert.match(message, /milliseconds/);
    assert.match(message, /at least 1000/);
    assert.match(message, /30000/);
  });

  it('says milliseconds, so a caller cannot read it as seconds', () => {
    assert.match(validateTimeout('soon').message, /whole number of milliseconds/);
  });

  it('refuses the boolean a flag with no value would produce', () => {
    assert.equal(validateTimeout(true).ok, false);
  });
});

describe('validateOutput', () => {
  it('accepts an absolute .png outside the tool directory', () => {
    const target = join(OUTSIDE, 'page.png');
    const result = validateOutput(target, TOOL_DIR);
    assert.equal(result.ok, true);
    assert.equal(result.value, resolve(target));
  });

  it('refuses a missing output', () => {
    const result = validateOutput(undefined, TOOL_DIR);
    assert.equal(result.ok, false);
    assert.match(result.message, /no default destination/);
  });

  it('refuses a relative path', () => {
    const result = validateOutput('page.png', TOOL_DIR);
    assert.equal(result.ok, false);
    assert.match(result.message, /must be absolute/);
  });

  it('refuses an extension that is not .png', () => {
    const result = validateOutput(join(OUTSIDE, 'page.jpg'), TOOL_DIR);
    assert.equal(result.ok, false);
    assert.match(result.message, /must end in \.png/);
  });

  it('accepts .PNG in any case', () => {
    assert.equal(validateOutput(join(OUTSIDE, 'page.PNG'), TOOL_DIR).ok, true);
  });

  it('refuses a path inside the tool directory', () => {
    const result = validateOutput(join(TOOL_DIR, 'page.png'), TOOL_DIR);
    assert.equal(result.ok, false);
    assert.match(result.message, /inside this tool directory/);
  });

  it('refuses a path that climbs back into the tool directory', () => {
    const climb = `${TOOL_DIR}${sep}..${sep}web-screenshot${sep}scripts${sep}page.png`;
    assert.equal(validateOutput(climb, TOOL_DIR).ok, false);
  });

  it('refuses the tool directory itself even when it is named as a png', () => {
    const sibling = `${TOOL_DIR}${sep}node_modules${sep}page.png`;
    assert.equal(validateOutput(sibling, TOOL_DIR).ok, false);
  });

  it('accepts a sibling directory whose name only starts like the tool directory', () => {
    const nearby = `${TOOL_DIR}-work${sep}page.png`;
    assert.equal(validateOutput(nearby, TOOL_DIR).ok, true);
  });
});

describe('validateOverwrite', () => {
  const target = join(OUTSIDE, 'page.png');
  const present = () => true;
  const absent = () => false;

  it('accepts a destination that holds no file', () => {
    assert.equal(validateOverwrite(target, { exists: absent }).ok, true);
  });

  it('refuses a destination that already holds a file', () => {
    assert.equal(validateOverwrite(target, { exists: present }).ok, false);
  });

  it('names the path and the flag when it refuses', () => {
    const { message } = validateOverwrite(target, { exists: present });
    assert.ok(message.includes(target), 'the refusal names the path');
    assert.match(message, /--overwrite/);
  });

  it('does not ask for --confirm, which belongs to edits in place', () => {
    assert.equal(validateOverwrite(target, { exists: present }).message.includes('--confirm'), false);
  });

  it('replaces the file when the caller passes --overwrite', () => {
    const result = validateOverwrite(target, { overwrite: true, exists: present });
    assert.equal(result.ok, true);
    assert.equal(result.value, target);
  });

  it('refuses by default, with no options object at all', () => {
    assert.equal(validateOverwrite(import.meta.filename ?? fileURLToPath(import.meta.url)).ok, false);
  });

  it('accepts a path nothing on disk holds, with no options object', () => {
    assert.equal(validateOverwrite(join(OUTSIDE, 'nothing-here.png')).ok, true);
  });
});

describe('classifyFailure', () => {
  const cases = [
    ["browserType.launch: Executable doesn't exist at /some/cache/path", 'browser-missing'],
    ['page.goto: net::ERR_NAME_NOT_RESOLVED at https://host.example/', 'dns'],
    ['page.goto: net::ERR_CONNECTION_REFUSED at http://host.example:9/', 'refused'],
    ['page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://host.example/', 'tls'],
    ['page.goto: net::ERR_ADDRESS_UNREACHABLE at https://host.example/', 'network'],
    ['page.goto: Timeout 30000ms exceeded.', 'timeout'],
    ['Protocol error (Page.captureScreenshot): Target closed', 'render']
  ];

  for (const [raw, code] of cases) {
    it(`classifies ${code}`, () => {
      assert.equal(classifyFailure(raw, { url: 'https://host.example/' }).code, code);
    });
  }

  it('never repeats the browser message', () => {
    const raw = 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://host.example/ Call log: navigating';
    const { message } = classifyFailure(raw, { url: 'https://host.example/' });
    assert.equal(message.includes('net::ERR'), false);
    assert.equal(message.includes('Call log'), false);
  });

  it('names the address it was given', () => {
    const { message } = classifyFailure('net::ERR_NAME_NOT_RESOLVED', { url: 'https://host.example/' });
    assert.match(message, /https:\/\/host\.example\//);
  });

  it('handles a missing message and a missing url', () => {
    assert.equal(classifyFailure(undefined).code, 'render');
  });

  it('reports a timeout as the page not settling, not as a dead address', () => {
    const { message } = classifyFailure('Timeout 30000ms exceeded.', { url: 'https://host.example/' });
    assert.match(message, /never settles/);
  });

  it('names the default budget, in milliseconds, when the caller set none', () => {
    const { message } = classifyFailure('Timeout 30000ms exceeded.', { url: 'https://host.example/' });
    assert.match(message, /within 30000 ms/);
  });

  it('names the budget the caller set, not the default', () => {
    const { message } = classifyFailure('Timeout 2000ms exceeded.', {
      url: 'https://host.example/',
      timeoutMs: 2000
    });
    assert.match(message, /within 2000 ms/);
    assert.equal(message.includes('30000'), false);
  });
});

describe('pngSizeFromHeader', () => {
  function pngHeader(width, height) {
    const buffer = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
    buffer.writeUInt32BE(13, 8);
    buffer.write('IHDR', 12, 'latin1');
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
  }

  it('reads the dimensions', () => {
    assert.deepEqual(pngSizeFromHeader(pngHeader(1280, 720)), { width: 1280, height: 720 });
  });

  it('reads a tall full-page capture', () => {
    assert.deepEqual(pngSizeFromHeader(pngHeader(390, 8412)), { width: 390, height: 8412 });
  });

  it('returns null on a buffer that is not a PNG', () => {
    assert.equal(pngSizeFromHeader(Buffer.alloc(24)), null);
  });

  it('returns null on a truncated buffer', () => {
    assert.equal(pngSizeFromHeader(Buffer.alloc(8)), null);
  });

  it('returns null on nothing', () => {
    assert.equal(pngSizeFromHeader(undefined), null);
  });
});

// The address boundary, the same screen sitemap-fetch applies, with the
// resolver injected so no test depends on DNS. The CLI runs use literal
// addresses, which the screen classifies without a lookup.
describe('screenDestination', () => {
  const inward = async () => [{ address: '127.0.0.1', family: 4 }];
  const outward = async () => [{ address: '93.184.216.34', family: 4 }];
  const nowhere = async () => { throw new Error('ENOTFOUND'); };

  it('refuses a loopback literal by name, with the sitemap-fetch sentence', async () => {
    const result = await screenDestination('http://127.0.0.1:1/', { lookup: outward });
    assert.equal(result.ok, false);
    assert.equal(result.message, 'Error: --url http://127.0.0.1:1/ points at a loopback address, which this tool does not fetch.');
  });

  it('refuses each private range by name', async () => {
    for (const host of ['10.0.0.1', '172.16.0.1', '192.168.1.1']) {
      const result = await screenDestination(`http://${host}/`, { lookup: outward });
      assert.equal(result.ok, false);
      assert.match(result.message, /points at a private-range address/);
    }
  });

  it('refuses the cloud metadata address and localhost without a resolver', async () => {
    assert.match((await screenDestination('http://169.254.169.254/', { lookup: outward })).message, /cloud instance metadata/);
    assert.match((await screenDestination('http://localhost:8080/', { lookup: outward })).message, /loopback/);
  });

  it('refuses a hostname that resolves inward', async () => {
    const result = await screenDestination('https://intranet.example/', { lookup: inward });
    assert.equal(result.ok, false);
    assert.match(result.message, /loopback/);
  });

  it('passes a hostname that resolves outward, and one that resolves nowhere', async () => {
    assert.equal((await screenDestination('https://host.example/', { lookup: outward })).ok, true);
    assert.equal((await screenDestination('https://nowhere.invalid/', { lookup: nowhere })).ok, true);
  });
});

describe('capture --url against an address inside the machine', () => {
  const SCRIPT = join(TOOL_DIR, 'scripts', 'capture.js');
  const OUTPUT = join(OUTSIDE, 'never-written.png');
  const run = (url) => spawnSync(process.execPath, [SCRIPT, 'capture', '--url', url, '--output', OUTPUT], { encoding: 'utf8', timeout: 20000 });

  it('refuses a loopback address by name before any install or launch, stdout empty', () => {
    const result = run('http://127.0.0.1:1/');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error: --url http:\/\/127\.0\.0\.1:1\/ points at a loopback address, which this tool does not fetch\./m);
    assert.doesNotMatch(result.stderr, /Chromium|install/);
  });

  it('refuses a private-range address by name', () => {
    const result = run('http://192.168.0.1/');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points at a private-range address, which this tool does not fetch/);
  });
});
