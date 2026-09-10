#!/usr/bin/env node
/**
 * image - edit an existing image, or composite an overlay over a base
 *
 * Usage:
 *   node scripts/image.js help
 *   node scripts/image.js edit --file <path> --output <path> [operations]
 *   node scripts/image.js compose --base <path> --overlay <path> [--output <path>] [--overwrite] [--confirm]
 *
 * Node built-ins, this tool's own files, and tools/lib/. The rules every
 * shipped script follows are stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installAuthorised, writeConsent } from '../../lib/consent.js';

import {
  ALPHA_ENCODERS,
  BLUR_MAX,
  BLUR_MIN,
  CONTRAST_PIVOT,
  PNG_COMPRESSION_LEVEL,
  QUALITY,
  ROTATIONS,
  SHARPEN_DEADBAND,
  SHARPEN_MAX,
  SHARPEN_MIN,
  encoderFor,
  isInsideDirectory,
  offsetLandsOnCanvas,
  outputParent,
  outputRefusal,
  parseDimensions,
  parseOffset,
  placeOnCanvas,
  planEdit,
  samePath
} from './edit-core.js';

const HERE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'sharp', 'package.json');

const SUBCOMMANDS = new Set(['edit', 'compose']);

const EDIT_VALUE_FLAGS = new Set(['--file', '--output', '--resize', '--crop', '--rotate', '--blur', '--brightness', '--contrast', '--sharpness', '--canvas', '--at']);
const EDIT_BARE_FLAGS = new Set([
  '--install','--grayscale', '--overwrite', '--help']);

const COMPOSE_VALUE_FLAGS = new Set(['--base', '--overlay', '--output']);
const COMPOSE_SWITCH_FLAGS = new Set([
  '--install','--overwrite', '--confirm']);
const COMPOSE_WRITABLE_EXTENSIONS = new Map([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg']
]);

const USAGE = `image - edit an existing image, or composite an overlay over a base

Usage:
  node scripts/image.js help
  node scripts/image.js edit --file <path> --output <path> [operations]
  node scripts/image.js compose --base <path> --overlay <path> [--output <path>]
                                [--overwrite] [--confirm]

Commands:
  edit             Read the image, apply the operations, write the result
  compose          Stretch the overlay to the base's pixel dimensions, composite
                   it over the base, and write the flattened result
  help             Print this message

Run "node scripts/image.js <command> help" for that command's options.

  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a usage mistake, an unreadable image,
an unconfirmed in-place compose, or an unpermitted replacement goes to stderr
with exit 1.`;

const EDIT_USAGE = `image edit - apply local edits to an existing image file

Usage:
  node scripts/image.js edit help
  node scripts/image.js edit --file <path> --output <path> [operations]

Commands:
  edit                Read the image, apply the operations, write the result
  help                Print this message

Required:
  --file <path>       Image to read: absolute, and outside this tool directory.
  --output <path>     Image to write: the path of the file itself, absolute,
                      ending .png/.jpg/.jpeg/.webp. Must differ from --file and
                      sit outside this tool directory. The extension chooses the
                      format, and missing folders on the way are created.

Operations, applied in this order:
  --rotate N          Turn clockwise: ${ROTATIONS.join(', ')}.
  --crop WxH          Center crop to W by H, clamped to what is there.
  --resize WxH        Resize to exactly W by H; the aspect ratio is not kept.
  --grayscale         Convert to a true single-channel gray.
  --blur N            Gaussian blur radius, ${BLUR_MIN} to ${BLUR_MAX}.
  --brightness N      Brightness multiplier above 0; 1 leaves it alone.
  --contrast N        Contrast multiplier above 0 around mid-gray; 1 leaves it alone.
  --sharpness N       Sharpen, ${SHARPEN_MIN} to ${SHARPEN_MAX}; 1 leaves it alone.
                      To soften instead, use --blur.
  --canvas WxH        Place the edited image on a transparent canvas of W by H.
                      Needs an output that carries an alpha channel: .png or
                      .webp, never .jpg or .jpeg.
  --at X,Y            Where the image's top left corner sits on that canvas, in
                      pixels, either sign. Whatever falls outside the canvas is
                      clipped; the canvas is never grown. Needs --canvas.
                      Default 0,0.

Other:
  --overwrite         Replace a file already at --output. Without it, an
                      occupied path is refused and nothing is written.
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help              Print this message

Reads the one image the caller names and writes the one image the caller names,
leaving the input untouched. Needs no credentials and no configuration file, so
no command takes --env. Success prints one JSON object to stdout; failures go to
stderr with exit 1.`;

const COMPOSE_USAGE = `image compose - composite an overlay image over a base image

Usage:
  node scripts/image.js compose help
  node scripts/image.js compose --base <path> --overlay <path> [--output <path>]
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
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help             Print this message

Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a usage mistake, an unreadable image,
an unconfirmed in-place run, or an unpermitted replacement goes to stderr with
exit 1.`;

const SUB_USAGE = {
  edit: EDIT_USAGE,
  compose: COMPOSE_USAGE,
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function helpRef(command) {
  return `node scripts/image.js ${command} help`;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. `realpathSync` resolves every
 * component against the filesystem, which turns the comparison below from a
 * string check into an identity check. A path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on, so a symbolic link standing in for any ancestor
 * cannot hide where the path lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know what it is looking
 * at refuses rather than falling back to the caller's spelling.
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

function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

const WILL_FETCH_BROWSER = false;

function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  const browser = names.includes('playwright');
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: 'registry.npmjs.org',
    size: browser && WILL_FETCH_BROWSER
      ? ' This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
      : ''
  };
}

function requireInstallConsent(what) {
  if (installAuthorised(HERE)) {
    writeConsent(HERE, 'image');
    return;
  }
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

function ensureDependencies() {
  if (existsSync(DEP_MARKER)) return;
  requireInstallConsent('packages');
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

async function runEdit(argv) {
  const usageCmd = helpRef('edit');

  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }

  // The position after each value flag belongs to that flag. A negative offset
  // opens with a dash and is a value, not a flag; without this the sweep below
  // would refuse "-40,-30" as an invented option.
  const valuePositions = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (EDIT_VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
  }

  // An unrecognized flag is refused rather than ignored: a silently dropped
  // operation returns a file that looks finished and is not what was asked for.
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith('-') && !EDIT_VALUE_FLAGS.has(option) && !EDIT_BARE_FLAGS.has(option)) {
      fail(`Error: unknown option "${option}". Run "${usageCmd}" for usage.`);
    }
  }

  // The whole argument has to be the number: parseFloat alone reads "2px" as 2
  // and would edit by an amount the caller never asked for.
  function number(raw) {
    const value = Number.parseFloat(raw);
    return /^\d*\.?\d+$/.test(raw.trim()) && Number.isFinite(value) ? value : null;
  }

  function positiveNumber(name, raw) {
    if (raw === undefined) return undefined;
    const value = number(raw);
    if (value === null || value <= 0) {
      fail(`Error: ${name} must be a number above 0, where 1 leaves the image alone; got "${raw}".`);
    }
    return value;
  }

  function rangedNumber(name, raw, min, max, hint = '') {
    if (raw === undefined) return undefined;
    const value = number(raw);
    if (value === null || value < min || value > max) {
      fail(`Error: ${name} must be a number from ${min} to ${max}; got "${raw}".${hint ? ` ${hint}` : ''}`);
    }
    return value;
  }

  /**
   * True when `candidate` names `directory` itself or something beneath it,
   * decided by identity rather than by spelling.
   *
   * `isInsideDirectory` compares names, and a name is not enough here.
   * `realpathSync` preserves whatever case the caller wrote, so on a
   * case-insensitive volume a variant spelling of this tool's own directory
   * canonicalizes to a string that carries none of `directory`'s prefix even
   * though it names that very directory, and the name test alone lets the write
   * through. Device and inode are a directory's own identity, which no spelling
   * reaches, so every existing ancestor of `candidate` is compared that way. An
   * output file does not exist yet and has no inode, which is why the walk climbs
   * to the deepest ancestor that does: that ancestor is where the write lands.
   *
   * Filesystem work only, so `edit-core.js` stays free of it and its rules stay
   * testable on a copy with nothing installed.
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

  function dimensions(name, raw) {
    if (raw === undefined) return null;
    const parsed = parseDimensions(raw);
    if (!parsed) {
      fail(`Error: ${name} must be two whole positive numbers as WxH, such as 1440x810; got "${raw}".`);
    }
    return parsed;
  }

  // Built-in-only validation, before the dependency check, so a usage mistake
  // never triggers an install and never opens an image.
  const filePath = flag('--file');
  if (!filePath) {
    fail(`Error: --file is required. Pass the absolute path to the image to edit. Run "${usageCmd}" for usage.`);
  }
  if (!isAbsolute(filePath)) {
    fail(`Error: --file must be absolute; got "${filePath}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  if (!existsSync(filePath)) {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the image to edit.`);
  }
  // Everything past this point works on `fileReal`, the canonical path, and never
  // on the caller's spelling. The extension test below is the reason it has to:
  // a name test run on the spelling says nothing about the file that is opened,
  // since a link spelled .png can name an .svg.
  const toolReal = canonical('this tool directory', TOOL_DIR);
  const fileReal = canonical('--file', filePath);
  // The read side carries the same containment rule as the write side. This
  // directory holds the scripts and whatever an install left in it, and none of
  // that is a picture to re-encode into somewhere else. `descendsFrom` decides it
  // by identity, because `realpathSync` keeps whatever case the caller wrote and
  // a variant spelling of this directory on a case-insensitive volume carries
  // none of the prefix the name test looks for.
  if (isInsideDirectory(fileReal, toolReal) || descendsFrom(fileReal, toolReal)) {
    fail(`Error: --file resolves inside this tool directory (${toolReal}). Scripts read only from a work directory in the owning root; pass that path instead.`);
  }
  if (/\.svg$/i.test(fileReal)) {
    // The imaging library would rasterize it silently, at the size the file
    // declares and with no browser, so webfonts and CSS would be lost.
    fail(`Error: --file is an SVG (${fileReal}). Vector artwork is rendered by the render svg tool, which sizes it and resolves its fonts; edit the PNG that comes out of that.`);
  }

  const outputPath = flag('--output');
  if (!outputPath) {
    fail('Error: --output is required. Pass the absolute path of the image to write, in a work directory in the owning root.');
  }
  if (!isAbsolute(outputPath)) {
    fail(`Error: --output must be absolute; got "${outputPath}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  // Both sides of both comparisons are canonicalized, so a symbolic link, a
  // relative spelling, and a path through a differently spelled ancestor all
  // collapse onto one real path and are refused exactly as the direct spelling
  // is. Comparing resolved strings alone refused only the direct spelling, which
  // left a symlinked --output writing into the very directory this refusal names.
  // The name comparison is not the whole screen either, which is what
  // `descendsFrom` beside it closes.
  const outputReal = canonical('--output', outputPath);
  if (isInsideDirectory(outputReal, toolReal) || descendsFrom(outputReal, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
  // The extension is read off the canonical destination, which is the file that
  // gets the bytes. Reading it off the spelling would let a link named .png stand
  // in front of a .jpg and put one format's bytes behind another's name, which is
  // the very thing this refusal exists to prevent.
  const encoder = encoderFor(outputReal);
  if (!encoder) {
    fail(`Error: --output must end in .png, .jpg, .jpeg, or .webp; got "${outputReal}". The extension chooses the format, so this tool will not put one format's bytes behind another's name.`);
  }
  if (samePath(fileReal, outputReal)) {
    // Ahead of the overwrite gate, and not a case --overwrite reaches: editing in
    // place is not offered here at all, at any flag.
    fail('Error: --output must name a different file than --file. This tool edits into a new file and leaves the original as it was.');
  }

  // The overwrite gate. Built-ins only and ahead of the dependency check, so a
  // run that would have destroyed a file opens no image and installs nothing.
  // A path this account cannot even look at throws rather than answering; that is
  // the folder-making below to report, in its own words, not a stack trace here.
  let existing;
  try {
    existing = statSync(outputReal, { throwIfNoEntry: false });
  } catch {
    existing = undefined;
  }
  const refusal = outputRefusal({
    exists: Boolean(existing),
    isDirectory: Boolean(existing?.isDirectory()),
    overwrite: argv.includes('--overwrite')
  });
  if (refusal === 'directory') {
    fail(`Error: --output names an existing directory (${outputReal}). Pass the path of the image file to write, not the folder to write it into.`);
  }
  if (refusal === 'exists') {
    fail(`Error: a file already exists at ${outputReal}. Pass --overwrite to replace it, or name a path that is free.`);
  }

  const outputDir = outputParent(outputReal);

  const rotateRaw = flag('--rotate');
  let rotate = null;
  if (rotateRaw !== undefined) {
    rotate = Number.parseInt(rotateRaw, 10);
    if (!/^\d+$/.test(rotateRaw.trim()) || !ROTATIONS.includes(rotate)) {
      fail(`Error: --rotate must be one of ${ROTATIONS.join(', ')}; got "${rotateRaw}". This tool turns by quarters only.`);
    }
  }

  const crop = dimensions('--crop', flag('--crop'));
  const resizeTo = dimensions('--resize', flag('--resize'));
  const grayscale = argv.includes('--grayscale');
  const blur = rangedNumber('--blur', flag('--blur'), BLUR_MIN, BLUR_MAX);
  const brightness = positiveNumber('--brightness', flag('--brightness'));
  const contrast = positiveNumber('--contrast', flag('--contrast'));
  const sharpness = rangedNumber(
    '--sharpness',
    flag('--sharpness'),
    SHARPEN_MIN,
    SHARPEN_MAX,
    'Sharpening is the amount above 1. To soften instead, use --blur.'
  );

  const canvas = dimensions('--canvas', flag('--canvas'));
  const atRaw = flag('--at');
  let offset = null;
  if (atRaw !== undefined) {
    offset = parseOffset(atRaw);
    if (!offset) {
      fail(`Error: --at must be two whole numbers as X,Y, either sign, such as 120,-40; got "${atRaw}". It is where the image's top left corner sits on the canvas, in pixels.`);
    }
  }
  if (offset && !canvas) {
    fail('Error: --at needs --canvas. An offset is a position on a canvas, and without one there is nothing to position against.');
  }
  if (canvas) {
    if (!offset) offset = { x: 0, y: 0 };
    if (!ALPHA_ENCODERS.has(encoder)) {
      fail(`Error: --canvas lays the image on a transparent background, and ${encoder} has no alpha channel, so that background would arrive filled in. Name an output ending .png or .webp.`);
    }
    // The half of the placement that needs no image: an x at or past the canvas's
    // own width, or a y past its height, leaves nothing on the canvas whatever the
    // image measures. Refused here, so a mistyped offset costs no install.
    if (!offsetLandsOnCanvas(canvas, offset)) {
      fail(`Error: --at ${offset.x},${offset.y} starts the image past the right or bottom edge of a ${canvas.width}x${canvas.height} canvas, so no image of any size would land on it. Pass an x below ${canvas.width} and a y below ${canvas.height}.`);
    }
  }

  ensureDependencies();
  const sharp = (await import('sharp')).default;

  // The screened path, not the spelling: `fileReal` is what every check above
  // decided about, so it is what the imaging library opens.
  let image = sharp(fileReal);
  let source;
  try {
    const metadata = await image.metadata();
    if (!(metadata.width > 0) || !(metadata.height > 0)) throw new Error('no dimensions');
    source = { width: metadata.width, height: metadata.height };
  } catch {
    // The library's own message is withheld; it can quote bytes of the file.
    fail(`Error: could not read ${fileReal} as an image. Pass a PNG, JPEG, WEBP, GIF, AVIF, or TIFF file; a file with an image extension is not always image data.`);
  }

  const plan = planEdit({ source, rotate, crop, resize: resizeTo });

  if (rotate) image = image.rotate(rotate);
  if (plan.extract) image = image.extract(plan.extract);
  if (plan.resize) image = image.resize(plan.resize.width, plan.resize.height, { fit: 'fill' });
  if (grayscale) image = image.grayscale().toColorspace('b-w');
  if (blur !== undefined) image = image.blur(blur);
  if (brightness !== undefined && brightness !== 1) image = image.modulate({ brightness });
  if (contrast !== undefined && contrast !== 1) {
    // A straight line through mid-gray: output = (input - pivot) * contrast + pivot.
    image = image.linear(contrast, CONTRAST_PIVOT * (1 - contrast));
  }
  if (sharpness !== undefined && sharpness - SHARPEN_MIN >= SHARPEN_DEADBAND) {
    image = image.sharpen({ sigma: sharpness - SHARPEN_MIN });
  }

  // The placement, last, so the offset is measured against the image every
  // operation above already finished with. The edited pixels go to a buffer and a
  // fresh pipeline starts from the canvas: one image library cannot both hold a
  // pipeline and composite that same pipeline onto another.
  if (canvas) {
    let edited;
    try {
      // PNG for the handoff: lossless, and the only intermediate that carries the
      // alpha an already-transparent input arrived with.
      edited = await image.png().toBuffer({ resolveWithObject: true });
    } catch {
      // Withheld for the same reason as the read above.
      fail(`Error: could not apply the operations to ${fileReal} before placing it. See Troubleshooting in TOOL.md; an operation whose result is past what the imaging library will allocate is the usual cause.`);
    }

    const placement = placeOnCanvas({ width: edited.info.width, height: edited.info.height }, canvas, offset);
    if (!placement) {
      fail(`Error: --at ${offset.x},${offset.y} places a ${edited.info.width}x${edited.info.height} image entirely outside a ${canvas.width}x${canvas.height} canvas, so the result would be blank. Check the offset's sign and the size the operations left; an empty canvas is not written.`);
    }

    let placedBuffer = edited.data;
    if (placement.clipped) {
      try {
        placedBuffer = await sharp(edited.data).extract(placement.extract).png().toBuffer();
      } catch {
        fail(`Error: could not take the ${placement.extract.width}x${placement.extract.height} region that falls on the canvas out of the edited image. See Troubleshooting in TOOL.md.`);
      }
      process.stderr.write(
        `Note: the placement clipped the image from ${edited.info.width}x${edited.info.height} to the ${placement.extract.width}x${placement.extract.height} of it that falls on a ${canvas.width}x${canvas.height} canvas at ${offset.x},${offset.y}; the canvas is not grown to fit.\n`
      );
    }

    image = sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    }).composite([{ input: placedBuffer, left: placement.left, top: placement.top, blend: 'over' }]);
  }

  if (encoder === 'jpeg') image = image.jpeg({ quality: QUALITY });
  else if (encoder === 'webp') image = image.webp({ quality: QUALITY });
  else image = image.png({ compressionLevel: PNG_COMPRESSION_LEVEL });

  // The folder is made here rather than during validation, so a run that refuses
  // for any other reason leaves nothing at all behind it on disk.
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {
    fail(`Error: could not create ${outputDir}. Confirm the path is writable by this account, or point --output somewhere it is.`);
  }

  let written;
  try {
    written = await image.toFile(outputReal);
  } catch {
    fail(`Error: could not write ${outputReal}. See Troubleshooting in TOOL.md; a folder that is not writable and an output size past what the imaging library will allocate are the two usual causes.`);
  }

  process.stdout.write(`${JSON.stringify({
    output: outputReal,
    format: encoder,
    width: written.width,
    height: written.height,
    sourceWidth: source.width,
    sourceHeight: source.height,
    bytes: written.size
  })}\n`);
}

async function runCompose(argv) {
  const usageCmd = helpRef('compose');
  const values = new Map();
  const switches = new Set();

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (COMPOSE_VALUE_FLAGS.has(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        fail(`Error: ${argument} needs a value. Run "${usageCmd}" for usage.`);
      }
      // A SECOND OCCURRENCE IS A USAGE MISTAKE, NOT A PREFERENCE. The Map was
      // last-wins, so two --base paths composited the second and discarded the
      // first with no signal at all -- exit 0 and a correct-looking object about
      // an image the caller did not name second. None of this tool's flags is
      // repeatable. The Script Contract forbids silently dropping accepted input.
      if (values.has(argument)) {
        fail(`Error: ${argument} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
      }
      values.set(argument, value);
      index += 1;
    } else if (COMPOSE_SWITCH_FLAGS.has(argument)) {
      switches.add(argument);
    } else if (argument.startsWith('-')) {
      fail(`Error: unknown option "${argument}". Run "${usageCmd}" for usage.`);
    } else {
      fail(`Error: unexpected argument "${argument}". Run "${usageCmd}" for usage.`);
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
      fail(`Error: ${name} is required. Run "${usageCmd}" for usage.`);
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
  const format = COMPOSE_WRITABLE_EXTENSIONS.get(extension);

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

  ensureDependencies();
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
}

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!SUBCOMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/image.js help" for usage.`);
}

if (argv[1] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${SUB_USAGE[command]}\n`);
  process.exit(0);
}


if (command === 'edit') await runEdit(argv);
else if (command === 'compose') await runCompose(argv);
