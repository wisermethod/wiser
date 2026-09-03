#!/usr/bin/env node
/**
 * image-overlay - composite an overlay image over a base image
 *
 * Usage:
 *   node scripts/overlay.js help
 *   node scripts/overlay.js compose --base <path> --overlay <path> [--output <path>] [--overwrite] [--confirm]
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'sharp', 'package.json');

const COMMANDS = new Set(['compose']);
const VALUE_FLAGS = new Set(['--base', '--overlay', '--output']);
const SWITCH_FLAGS = new Set([
  '--install','--overwrite', '--confirm']);
const WRITABLE_EXTENSIONS = new Map([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg']
]);

const USAGE = `image-overlay - composite an overlay image over a base image

Usage:
  node scripts/overlay.js help
  node scripts/overlay.js compose --base <path> --overlay <path> [--output <path>]
                                 [--overwrite] [--confirm]

Commands:
  compose            Stretch the overlay to the base's pixel dimensions, composite
                     it over the base, and write the flattened result
  help               Print this message

Options:
  --base <path>      Base image, absolute path. Required.
  --overlay <path>   Overlay image, absolute path. Its transparency is what lets
                     the base show through. Required.
  --output <path>    File path to write the result to, absolute, ending .png,
                     .jpg, or .jpeg. Missing parent directories are created.
                     Omit to write back onto the base image in place.
  --overwrite        Permits replacing a file that already exists at --output.
                     Opt-in; never prompted for.
  --confirm          Permits an in-place run, which destroys the base image
                     irrecoverably. Opt-in; never prompted for. --overwrite does
                     not stand in for it, and it does not stand in for --overwrite.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help             Print this message

Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a usage mistake, an unreadable image,
an unconfirmed in-place run, or an unpermitted replacement goes to stderr with
exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no file read.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/overlay.js help" for usage.`);
}

// Every argument is claimed by a flag this tool knows. An unknown one is refused
// rather than ignored: silently dropping a destination flag would turn a run
// that named an output into an in-place run.
const values = new Map();
const switches = new Set();

for (let index = 1; index < argv.length; index += 1) {
  const argument = argv[index];
  if (VALUE_FLAGS.has(argument)) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${argument} needs a value. Run "node scripts/overlay.js help" for usage.`);
    }
    values.set(argument, value);
    index += 1;
  } else if (SWITCH_FLAGS.has(argument)) {
    switches.add(argument);
  } else if (argument.startsWith('-')) {
    fail(`Error: unknown option "${argument}". Run "node scripts/overlay.js help" for usage.`);
  } else {
    fail(`Error: unexpected argument "${argument}". Run "node scripts/overlay.js help" for usage.`);
  }
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. The destination usually does not
 * exist yet, so a path whose leaf is absent is canonicalized through the
 * deepest ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the write lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know where a write lands
 * refuses rather than falling back to comparing the caller's spelling.
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
 * True when `target` names this tool's own directory or something beneath it,
 * decided by identity rather than by spelling.
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and the name test alone lets the write through. Device and inode
 * are a directory's own identity, which no spelling reaches, so every existing
 * ancestor of `target` is compared that way as well. A destination that does
 * not exist yet has no inode of its own, which is why the walk climbs to the
 * deepest ancestor that does: that ancestor is where the write lands.
 */
function insideToolDirectory(target) {
  const root = canonical('this tool directory', TOOL_DIR);
  if (target === root || target.startsWith(root + sep)) return true;

  let rootId;
  try {
    rootId = statSync(root);
  } catch {
    return false;
  }

  let head = target;
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

// Returns the canonical path, so the image library is handed the path this
// checked rather than the spelling the caller used. --base is also the
// destination of an in-place run, and the destination screen below runs on this
// same value, so the two can never disagree about which file is meant.
function requireImagePath(name) {
  const value = values.get(name);
  if (!value) {
    fail(`Error: ${name} is required. Run "node scripts/overlay.js help" for usage.`);
  }
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". Pass a full path, not one relative to the current directory.`);
  }
  const target = canonical(name, value);
  if (!existsSync(target)) {
    fail(`Error: no file at ${target}. Check the path passed to ${name}.`);
  }
  return target;
}

// Same file, whatever the two paths look like: a case-insensitive volume, a
// symlink, and a path with a "." segment all reach one inode.
function sameFile(left, right) {
  if (left === right) return true;
  if (!existsSync(left) || !existsSync(right)) return false;
  const a = statSync(left);
  const b = statSync(right);
  return a.dev === b.dev && a.ino === b.ino;
}

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install and an ungranted write never opens an image.
const basePath = requireImagePath('--base');
const overlayPath = requireImagePath('--overlay');

const outputFlag = values.get('--output');
if (outputFlag !== undefined && !isAbsolute(outputFlag)) {
  fail(`Error: --output must be absolute; got "${outputFlag}". Pass a full path, not one relative to the current directory.`);
}

// Canonicalized, and every use below is of this value rather than of
// `outputFlag`: the path that gets written has to be the path this screened.
// Comparing resolved strings alone refused only the direct spelling, which left
// a case variant and a symlinked ancestor writing into the very directory the
// refusal names, so the comparison is by identity as well.
const outPath = canonical('the destination', outputFlag ?? basePath);

if (insideToolDirectory(outPath)) {
  fail(`Error: the destination resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path instead.`);
}

if (existsSync(outPath) && statSync(outPath).isDirectory()) {
  fail(`Error: --output names a file, and ${outPath} is a directory. Pass the full path of the file to write, ending .png, .jpg, or .jpeg.`);
}

// In place means the write lands on the input, whether that came of omitting
// --output or of naming the base with it.
const inPlace = sameFile(outPath, basePath);

const extension = extname(outPath).toLowerCase();
const format = WRITABLE_EXTENSIONS.get(extension);

if (!format) {
  const named = inPlace
    ? `the base image ends in "${extension || 'nothing'}", so an in-place run would write bytes of another format under that name. Pass --output with a .png, .jpg, or .jpeg path`
    : `--output ends in "${extension || 'nothing'}". Pass a path ending .png, .jpg, or .jpeg`;
  fail(`Error: this tool writes PNG and JPEG only, and encodes from the destination extension; ${named}.`);
}

// The two gates, both opt-in, both ahead of every read: neither destroying the
// original nor replacing another file happens on a run that did not ask for it.
if (inPlace) {
  if (!switches.has('--confirm')) {
    const why = outputFlag === undefined
      ? 'omitting --output writes the result back onto the base image'
      : '--output names the base image itself';
    fail(`Error: ${why}, which destroys ${basePath} irrecoverably, so this run needs --confirm. Re-run the same command with --confirm, or pass --output with a path of its own. --overwrite permits replacing a separate file and does not cover this.`);
  }
} else if (existsSync(outPath)) {
  if (!switches.has('--overwrite')) {
    fail(`Error: a file already exists at ${outPath}, so this run needs --overwrite. Re-run the same command with --overwrite to replace that file, or pass --output with a path that does not exist yet.`);
  }
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
  // A browser tool's authorised run makes TWO fetches, to two different places,
  // and this report used to fold them into one clause that was wrong about both
  // halves: `from registry.npmjs.org and cdn.playwright.dev into <TOOL_DIR>`
  // read as though the Chromium build landed in this directory, which it does
  // not, and it omitted the Microsoft fallback host that the browser message a
  // few lines down gets right. An egress allowlist built from that sentence is
  // short by a host and a disk-space estimate built from it looks in the wrong
  // place. So `hosts` is now only what NPM contacts -- which is the whole truth
  // for the clause it sits in -- and the browser fetch is a sentence of its own
  // with its own hosts and its own destination.
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: 'registry.npmjs.org',
    size: browser
      ? ' This run then fetches the Chromium build that package drives, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
      : ''
  };
}

// `what` is 'packages' or 'browser'. Round 6 found the browser case reported the
// package case: a tool whose packages are installed and whose browser build is
// not is a real state -- every machine that ran a browser tool before the
// installer existed is in it -- and the report a person answers must not open
// "this tool is not installed yet", nor name a registry fetch and an npm cache
// write that this install will not make.
function requireInstallConsent(what) {
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') return;
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this run did not authorise an install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this run did not authorise an install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// Dependencies. Runs before any package import; keep it above the dynamic import.
if (!existsSync(DEP_MARKER)) {
  requireInstallConsent('packages');
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
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

// Packages import only below this line, and only dynamically. A static import
// would run before the check above and crash instead of installing.
const sharp = (await import('sharp')).default;

// Every message below is ours. The library's own text is withheld throughout:
// it quotes paths and, on a malformed file, bytes of the input.
let baseMeta;
try {
  baseMeta = await sharp(basePath).metadata();
} catch {
  fail(`Error: could not read ${basePath} as an image. Confirm --base names an image file this tool can decode.`);
}

if (!baseMeta.width || !baseMeta.height) {
  fail(`Error: ${basePath} reports no pixel dimensions, so there is nothing to size the overlay against. Pass a raster image as --base.`);
}

let overlayMeta;
let overlayBuffer;
try {
  overlayMeta = await sharp(overlayPath).metadata();
  overlayBuffer = await sharp(overlayPath)
    .resize(baseMeta.width, baseMeta.height, { fit: 'fill' })
    .toBuffer();
} catch {
  fail(`Error: could not read ${overlayPath} as an image. Confirm --overlay names an image file this tool can decode.`);
}

const overlayResized = overlayMeta.width !== baseMeta.width || overlayMeta.height !== baseMeta.height;
if (overlayResized) {
  process.stderr.write(
    `Note: the overlay was stretched from ${overlayMeta.width}x${overlayMeta.height} to ${baseMeta.width}x${baseMeta.height}; it is not scaled proportionally.\n`
  );
}

// Encoded to a buffer, then written: the destination is sometimes the base image
// itself, and an image library cannot stream a file onto its own input.
let result;
try {
  const composited = sharp(basePath).composite([{ input: overlayBuffer, blend: 'over' }]);
  result = await (format === 'jpeg'
    ? composited.jpeg({ quality: 90 })
    : composited.png({ compressionLevel: 9 })
  ).toBuffer();
} catch {
  fail(`Error: compose failed while encoding ${format}. Confirm both images decode on their own, then re-run.`);
}

// The destination's missing parents are made here rather than at validation, so
// a run that fails earlier leaves no empty directory behind.
const outDir = dirname(outPath);
try {
  mkdirSync(outDir, { recursive: true });
} catch {
  fail(`Error: could not create ${outDir} for the result. Confirm every part of that path names a directory and that the location is writable.`);
}

try {
  writeFileSync(outPath, result);
} catch {
  fail(`Error: could not write ${outPath}. Confirm the directory is writable.`);
}

process.stdout.write(
  `${JSON.stringify({
    base: basePath,
    overlay: overlayPath,
    output: outPath,
    inPlace,
    format,
    width: baseMeta.width,
    height: baseMeta.height,
    overlayResized,
    bytes: result.length
  })}\n`
);
