#!/usr/bin/env node
/**
 * html-to-png - render one local HTML file to a PNG or JPEG image
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js render --input <path> --output <path> [--width N] [--height N]
 *     [--scale N] [--quality N] [--timeout MS] [--overwrite]
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');

const COMMANDS = new Set(['render']);

// Output format follows the extension the caller wrote, so one flag cannot
// disagree with the other.
const FORMATS = new Map([['.png', 'png'], ['.jpg', 'jpeg'], ['.jpeg', 'jpeg']]);

// How long the page gets to finish loading before the shot is abandoned.
const DEFAULT_TIMEOUT_MS = 5000;
// Device pixels per CSS pixel. One means the image is the layout's own size.
const DEFAULT_SCALE = 1;
// Fonts and layout settle a frame or two after load; the shot waits that out.
const SETTLE_MS = 200;
// Auto-fit adds this much so a hairline of content cannot fall off the bottom.
const FIT_MARGIN_PX = 10;

const USAGE = `html-to-png - render one local HTML file to a PNG or JPEG image

Usage:
  node scripts/render.js help
  node scripts/render.js render --input <path> --output <path> [--width N] [--height N]
    [--scale N] [--quality N] [--timeout MS] [--overwrite]

Commands:
  render           Render the HTML file and write the image
  help             Print this message

Options:
  --input <path>   HTML file to render, absolute. Required.
  --output <path>  Image file to write, absolute, ending .png, .jpg, or .jpeg.
                   Required, and it may not sit inside this tool directory.
  --width N        Viewport width in pixels. Default 1200.
  --height N       Viewport height in pixels. Omit to fit the content instead.
  --scale N        Device scale factor; the image carries this many pixels per
                   CSS pixel. Default ${DEFAULT_SCALE}.
  --quality N      JPEG quality, 1 to 100. Default 90. Ignored for PNG.
  --timeout MS     Milliseconds the page gets to finish loading.
                   Default ${DEFAULT_TIMEOUT_MS}.
  --overwrite      Replace a file already at --output. Without it, a run that
                   would replace one refuses.
  --help           Print this message

Renders the file the caller names and writes the image the caller names. Needs
no credentials and no configuration file, so no command takes --env. The page is
loaded from disk; anything it references is fetched, and nothing else is. Success
prints one JSON object to stdout; a usage mistake or a page that will not render
goes to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no file read,
// no browser.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--input', '--output', '--width', '--height', '--scale', '--quality', '--timeout'
]);
const BARE_FLAGS = new Set(['--overwrite', '--help', '-h']);

// The position after each value flag belongs to that flag. A path or number
// that opens with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a file that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/render.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/render.js help" for usage.`);
  }
  return value;
}

function positiveInteger(name, raw, max) {
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1) {
    fail(`Error: ${name} must be a whole number of 1 or more; got "${raw}".`);
  }
  const value = Number(raw);
  if (max !== undefined && value > max) {
    fail(`Error: ${name} must be ${max} or less; got "${raw}".`);
  }
  return value;
}

// A scale factor is not a pixel count: 1.5 is a real device scale, so this one
// takes a fraction where the pixel flags above take whole numbers.
function positiveNumber(name, raw) {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
    fail(`Error: ${name} must be a number above zero; got "${raw}".`);
  }
  return value;
}

/**
 * Width and height read out of the written file's own header, PNG or JPEG, so
 * the reported size is what the file holds rather than what the arithmetic
 * predicted. A device scale factor multiplies the pixels without touching the
 * layout numbers, which is exactly where a calculated report goes wrong.
 */
function imageSize(buffer) {
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

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read, installed, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
 */
function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * True when `candidate` names `directory` itself or something beneath it,
 * decided by identity rather than by spelling.
 *
 * A prefix comparison is not enough. `realpathSync` preserves whatever case the
 * caller wrote, so on a case-insensitive volume a variant spelling of this tool's
 * own directory canonicalizes to a string carrying none of `directory`'s prefix
 * even though it names that very directory, and the prefix test answers "not
 * inside" about a path that is. Device and inode are a directory's own identity,
 * which no spelling reaches, so every existing ancestor of `candidate` is
 * compared that way. An output file does not exist yet and has no inode of its
 * own, which is why the walk climbs to the deepest ancestor that does: that
 * ancestor is where the write lands.
 */
function descendsFrom(candidate, directory) {
  let rootId;
  try {
    rootId = statSync(directory);
  } catch {
    return false;
  }

  let head = candidate;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install and never opens a browser.
const inputRaw = flag('--input');
if (!inputRaw) {
  fail('Error: --input is required. Pass the absolute path of the HTML file to render. Run "node scripts/render.js help" for usage.');
}
if (!isAbsolute(inputRaw)) {
  fail(`Error: --input must be absolute; got "${inputRaw}". A relative path resolves against whichever directory the caller was in, which is not this tool's directory.`);
}
const inputPath = resolve(inputRaw);
if (!existsSync(inputPath)) {
  fail(`Error: no file at ${inputPath}. Check the path; an absolute one cannot be misread.`);
}
if (!statSync(inputPath).isFile()) {
  fail(`Error: ${inputPath} is not a file. Point --input at the HTML file itself, not at a directory.`);
}

const outputRaw = flag('--output');
if (!outputRaw) {
  fail('Error: --output is required. This tool never picks a location: pass the absolute path of the image to write, in a work directory in the owning root.');
}
if (!isAbsolute(outputRaw)) {
  fail(`Error: --output must be absolute; got "${outputRaw}". Pass a resolved path in a work directory in the owning root.`);
}
// Everything below writes `outputPath`, which is the path this screen resolved
// and cleared, not the string the caller typed. Both sides are canonicalized, so
// a symbolic link, a relative spelling and a differently spelled ancestor
// collapse onto one real path; the prefix test alone is not the whole screen
// either, which is what `descendsFrom` beside it closes.
const outputPath = canonical('--output', outputRaw);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
}

const format = FORMATS.get(extname(outputPath).toLowerCase());
if (!format) {
  fail(`Error: --output must end .png, .jpg, or .jpeg; got "${outputPath}". The extension chooses the format.`);
}

// Replacing a caller's file is opt-in. The check is here, above the dependency
// check, so a refused run installs nothing and opens no browser.
const overwrite = argv.includes('--overwrite');
if (existsSync(outputPath)) {
  if (statSync(outputPath).isDirectory()) {
    fail(`Error: ${outputPath} is a directory. --output names the image file to write, not the folder to write it into.`);
  }
  if (!overwrite) {
    fail(`Error: a file already exists at ${outputPath}. Pass --overwrite to replace it, or name a path that is free.`);
  }
}

const widthRaw = flag('--width');
const width = widthRaw === undefined ? 1200 : positiveInteger('--width', widthRaw);

const heightRaw = flag('--height');
const height = heightRaw === undefined ? null : positiveInteger('--height', heightRaw);

const scaleRaw = flag('--scale');
const scale = scaleRaw === undefined ? DEFAULT_SCALE : positiveNumber('--scale', scaleRaw);

const qualityRaw = flag('--quality');
const quality = qualityRaw === undefined ? 90 : positiveInteger('--quality', qualityRaw, 100);

const timeoutRaw = flag('--timeout');
const timeout = timeoutRaw === undefined ? DEFAULT_TIMEOUT_MS : positiveInteger('--timeout', timeoutRaw);

// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Dependencies. Runs before any package import; keep it above the dynamic import.
if (!existsSync(DEP_MARKER)) {
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // stderr only: npm output on stdout would break the empty-stdout-on-failure rule.
    execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory the first time it runs, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
  fail('Dependencies installed. Re-run the command.');
}

// Shared browser runtime: dynamic import only on the command that needs Chromium.
// Never a top-level static import — help must work on a never-installed copy.
const runtime = await import('./lib/browser-runtime.js');
const browserSurvey = await runtime.check();
if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: npm run check:chromium. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

// The output's home is settled before the browser starts. A directory that
// cannot be created is a path problem, and it should not arrive dressed as a
// rendering failure after a browser has been launched for nothing.
try {
  mkdirSync(dirname(outputPath), { recursive: true });
} catch {
  fail(`Error: could not create the directory for ${outputPath}. Pass a work directory in the owning root that this process may write to.`);
}

// A problem this script diagnosed itself, so its text is ours and safe to print.
// The browser engine's own messages are never passed through: they quote the
// page, the full path, and whatever the page put in a console message.
class RenderProblem extends Error {}

let browser;
let result = null;
let failure = null;

try {
  browser = await runtime.launch();

  // The scale factor belongs to the page, not to the screenshot call: a shot
  // captures device pixels, and this is what puts them there. Height is
  // provisional when the caller did not fix one; the fit pass below replaces
  // it once the content has laid out.
  const page = await browser.newPage({
    deviceScaleFactor: scale,
    viewport: { width, height: height ?? 800 }
  });

  // Loaded from disk, so relative references in the HTML resolve against the
  // HTML file's own directory. pathToFileURL owns the escaping; joining
  // "file://" to a path by hand leaves it to whatever parses the string next.
  await page.goto(pathToFileURL(inputPath).href, {
    waitUntil: 'networkidle',
    timeout
  });

  await new Promise((done) => setTimeout(done, SETTLE_MS));

  const shot = { path: outputPath, type: format };
  if (format === 'jpeg') {
    shot.quality = quality;
  }

  if (height) {
    // Fixed size: the image is the viewport, whatever the content does inside it.
    await page.screenshot(shot);
  } else {
    // Fit: the image is the body's own box, with the viewport grown to hold it
    // so that nothing below the fold is missing from the shot.
    const body = await page.$('body');
    const box = body === null ? null : await body.boundingBox();
    if (box === null || box.width < 1 || box.height < 1) {
      throw new RenderProblem('the page rendered nothing with a size to capture. Give the HTML visible content, or pass --height to shoot a fixed viewport instead.');
    }

    await page.setViewportSize({
      width: Math.max(width, Math.ceil(box.width)),
      height: Math.ceil(box.height) + FIT_MARGIN_PX
    });

    await body.screenshot(shot);
  }

  // Read back rather than calculated: the dimensions reported are the ones the
  // file carries, so a caller sizing a layout around them is never told a
  // number the image does not have.
  let size;
  try {
    size = imageSize(readFileSync(outputPath));
  } catch (problem) {
    throw new RenderProblem(`the render finished but ${outputPath} could not be measured: ${problem.message}. Re-run; if it repeats, the page produced nothing drawable.`);
  }

  result = { output: outputPath, format, width: size.width, height: size.height, scale };
} catch (error) {
  if (error instanceof RenderProblem) {
    failure = `Error: ${error.message}`;
  } else if (error && error.name === 'TimeoutError') {
    failure = `Error: the page did not finish loading within ${timeout} ms. Something the page references is hanging rather than answering: inline the remote references or keep them beside the HTML, or raise --timeout if the asset is slow rather than unresponsive.`;
  } else {
    failure = `Error: the browser engine could not render ${inputPath}. Open that file in a browser to see what it does; the engine's own message is withheld because it quotes the page.`;
  }
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Closing is cleanup. A failure here must not replace the real outcome.
    }
  }
}

if (failure) {
  fail(failure);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
