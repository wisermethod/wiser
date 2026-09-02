#!/usr/bin/env node
/**
 * mermaid-to-png - Render a Mermaid diagram file to a PNG.
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js render --file <absolute path> --output <absolute path> [options]
 *
 * The rules this file follows are stated once, in
 * system/templates/Script Contract.md.
 */

// Node built-ins only. Nothing here may import from outside this tool directory.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULTS,
  THEMES,
  UsageError,
  buildShell,
  fitDiagram,
  parseErrorLine,
  pngSize,
  readOptions,
  viewportWidth
} from './render-core.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');
const MERMAID_SCRIPT = join(TOOL_DIR, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const BROWSER_CHECK = 'npm run check:chromium';

const COMMANDS = new Set(['render']);

const USAGE = `mermaid-to-png - Render a Mermaid diagram file to a PNG.

Usage:
  node scripts/render.js help
  node scripts/render.js render --file <absolute path> --output <absolute path> [options]

Commands:
  render           Render the diagram and write the PNG
  help             Print this message

Options:
  --file <path>    The Mermaid diagram to render, absolute. Required.
  --output <path>  Where to write the PNG, absolute, ending in .png. Required;
                   there is no default location. Must sit outside this tool
                   directory.
  --width N        Maximum diagram width in CSS pixels (default: ${DEFAULTS.width})
  --scale N        Device scale factor; the PNG is this many pixels per CSS
                   pixel (default: ${DEFAULTS.scale})
  --theme NAME     ${THEMES.join(', ')} (default: ${DEFAULTS.theme})
  --background C   Background color, or transparent for none
                   (default: ${DEFAULTS.background})
  --timeout MS     How long the diagram has to render before the run gives up
                   (default: ${DEFAULTS.timeout})
  --overwrite      Replace a file already at --output. Without it, an occupied
                   path is refused.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no browser.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read, installed, or written.
 *
 * `readOutputPath` normalizes lexically and follows nothing on disk, so a
 * symbolic link standing in for any ancestor is a spelling it does not match. The
 * output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
 *
 * Filesystem work only, so `render-core.js` stays free of it and its rules stay
 * testable on a copy with nothing installed.
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
 * `readOutputPath` compares names, and a name is not enough here. `realpathSync`
 * preserves whatever case the caller wrote, so on a case-insensitive volume a
 * variant spelling of this tool's own directory canonicalizes to a string
 * carrying none of `directory`'s prefix even though it names that very
 * directory, and the name test alone lets the render through. Device and inode
 * are a directory's own identity, which no spelling reaches, so every existing
 * ancestor of `candidate` is compared that way. An output file does not exist yet
 * and has no inode, which is why the walk climbs to the deepest ancestor that
 * does: that ancestor is where the write lands.
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

let options;

try {
  options = readOptions(argv.slice(1), TOOL_DIR);
} catch (error) {
  if (error instanceof UsageError) {
    fail(`Error: ${error.message}. Run "node scripts/render.js help" for usage.`);
  }
  throw error;
}

// The screen's decision has to be made about the path the write will use, so the
// lexically cleared value is canonicalized and the containment rule is put to it
// again: a symbolic link, a relative spelling and a differently spelled ancestor
// all collapse onto one real path here. The name test alone is not the whole
// screen either, which is what `descendsFrom` beside it closes. `options` carries
// the canonical value from here on, so the overwrite check, `mkdirSync`, the
// screenshot and the size read all use the path that was cleared.
options.outputPath = canonical('--output', options.outputPath);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (
  options.outputPath === toolReal ||
  options.outputPath.startsWith(`${toolReal}${sep}`) ||
  descendsFrom(options.outputPath, toolReal)
) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead. Run "node scripts/render.js help" for usage.`);
}

// The input, read before anything is installed: a path mistake should cost
// nothing and a first-run install is not nothing.
if (!existsSync(options.inputPath)) {
  fail(`Error: no file at ${options.inputPath}. Check the path; an absolute one cannot be misread.`);
}

let diagram;

try {
  diagram = readFileSync(options.inputPath, 'utf8').trim();
} catch {
  fail(`Error: could not read ${options.inputPath}. Point --file at a readable text file holding Mermaid source.`);
}

if (!diagram) {
  fail(`Error: ${options.inputPath} is empty. A Mermaid file opens with its diagram type, such as a graph or sequence declaration.`);
}

// Replacing a file is opted into, never assumed. The check sits here, beside
// the input's, so a refusal costs nothing: no install, no browser, and no
// render whose only result would have been thrown away.
if (!options.overwrite && existsSync(options.outputPath)) {
  fail(`Error: ${options.outputPath} already exists. Pass --overwrite to replace it, or name a path nothing holds yet.`);
}

// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Consent before an install, per the Script Contract's Dependencies clause.
//
// A tool used to install its packages on its own account the first time it was
// called, then tell the caller to run the command again. That is two problems:
// several hundred megabytes could arrive on a machine without anyone agreeing
// to it, and the work then took two runs to do once.
//
// A script cannot ask. Nothing here reads stdin, deliberately, so a run with
// nobody watching fails rather than waiting forever for an answer. So the
// script reports and stops, and whoever is driving it does the asking: the
// report names the packages, the hosts they come from, and the size where it is
// large enough to matter, which is what a person needs in order to answer.
// `--install` on the same command authorises it and the run then COMPLETES
// rather than demanding a re-run. WISER_ALLOW_INSTALL=1 authorises it for an
// unattended run, so automation does not acquire a new way to fail.
function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  const browser = names.includes('playwright');
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: browser ? 'registry.npmjs.org and cdn.playwright.dev' : 'registry.npmjs.org',
    size: browser ? ' The Chromium build alone is several hundred megabytes.' : ''
  };
}

function requireInstallConsent() {
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') return;
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this run did not authorise an install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// Dependencies. Runs before any package import; keep it at the top of every entry script.
if (!existsSync(DEP_MARKER)) {
  requireInstallConsent();
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
}

if (!existsSync(MERMAID_SCRIPT)) {
  fail(`Error: the Mermaid renderer is missing at ${MERMAID_SCRIPT}. Confirm package.json lists mermaid, then run "npm ci" in ${TOOL_DIR}.`);
}

// Shared browser runtime: dynamic import only on the command that needs Chromium.
// Never a top-level static import — help must work on a never-installed copy.
const runtime = await import('./lib/browser-runtime.js');
const browserSurvey = await runtime.check();
if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: ${BROWSER_CHECK}. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

// The output's home is settled before the browser starts: a directory that
// cannot be created is a path problem, and it should not arrive dressed as a
// rendering failure after a browser has been launched for nothing.
try {
  mkdirSync(dirname(options.outputPath), { recursive: true });
} catch {
  fail(`Error: could not create the directory for ${options.outputPath}. Pass a work directory in the owning root that this process may write to.`);
}

async function render() {
  const browser = await runtime.launch();

  try {
    const page = await browser.newPage({
      // The scale factor belongs to the page, not to the screenshot: a
      // screenshot captures device pixels, so this is what puts them there.
      deviceScaleFactor: options.scale,
      viewport: { width: viewportWidth(options.width), height: 800 }
    });

    await page.setContent(buildShell(options));

    // The diagram crosses as text through the DOM, never as markup: a caller's
    // file cannot close an element or open a script this way.
    await page.$eval('.mermaid', (node, source) => {
      node.textContent = source;
    }, diagram);

    await page.addScriptTag({ path: MERMAID_SCRIPT });

    const rendered = await page.evaluate(async (theme) => {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme,
          flowchart: { useMaxWidth: true, htmlLabels: true }
        });
        await window.mermaid.run({ querySelector: '.mermaid' });
        return { ok: true };
      } catch (error) {
        // The message stays in the page; only its shape crosses back out.
        return { ok: false, message: String(error && error.message) };
      }
    }, options.theme);

    if (!rendered.ok) {
      const line = parseErrorLine(rendered.message);
      throw new UsageError(
        line === null
          ? 'the diagram did not parse. Check its syntax, starting with the diagram type on the first line'
          : `the diagram did not parse; the renderer stopped at line ${line}`
      );
    }

    // The render budget, named so a caller who runs out of it knows which
    // number to raise rather than reading it as a broken diagram.
    try {
      await page.waitForSelector('.mermaid svg', { timeout: options.timeout });
    } catch {
      throw new UsageError(`the diagram parsed but did not finish rendering within ${options.timeout} ms. Raise --timeout for a very large diagram; if a Mermaid preview draws it at once, re-run the Dependencies check`);
    }

    // Fonts and the final layout pass settle after the SVG appears, so the
    // measurement below has to wait for them.
    await page.waitForTimeout(500);

    const fitted = await page.evaluate(fitDiagram, options.width);

    if (!fitted) {
      throw new Error('the rendered diagram reported no size to capture');
    }

    const element = await page.$('#container');

    if (!element) {
      throw new Error('the rendered diagram left no element to capture');
    }

    // Capture and write are one call, so the write is given its own report:
    // by this point the diagram has rendered, and what is left to go wrong is
    // the caller's path.
    try {
      await element.screenshot({
        path: options.outputPath,
        type: 'png',
        omitBackground: options.background === 'transparent'
      });
    } catch {
      throw new UsageError(`the diagram rendered but ${options.outputPath} could not be written. Check that this process may write there, and pass a work directory in the owning root`);
    }
  } finally {
    await browser.close();
  }
}

try {
  await render();
} catch (error) {
  if (error instanceof UsageError) {
    fail(`Error: ${error.message}.`);
  }
  // The engine's own message can name cache paths and machine details, so the
  // failure is reported as this tool's, naming the stage that failed.
  fail(`Error: rendering ${options.inputPath} failed in the browser. Confirm the diagram renders in a Mermaid preview, then re-run; if it does, the browser install is the next thing to check with: ${BROWSER_CHECK}`);
}

// Read back rather than calculated: the dimensions reported are the ones the
// file carries, so a caller sizing a layout around them is never told a number
// the PNG does not have.
let size;

try {
  size = pngSize(readFileSync(options.outputPath));
} catch (error) {
  fail(`Error: the render finished but ${options.outputPath} could not be measured: ${error.message}. Re-run; if it repeats, the diagram produced no drawable output.`);
}

process.stdout.write(`${JSON.stringify({
  path: options.outputPath,
  width: size.width,
  height: size.height,
  scale: options.scale,
  maxWidth: options.width,
  theme: options.theme,
  background: options.background
})}\n`);
