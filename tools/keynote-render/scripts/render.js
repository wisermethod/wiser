#!/usr/bin/env node
/**
 * keynote-render - native Keynote build and in-place edit from JSON or markdown.
 *
 * Primary agent path (existing deck):
 *   node scripts/render.js sync --md <absolute slides.md> --deck <absolute .key> [--brand ...] [--confirm]
 *   Archives the .key to sibling zArchive/ first (standards/conventions.md § Archives),
 *   diffs markdown SSOT vs live deck, applies minimal update/insert/delete, saves in place.
 *
 * Greenfield:
 *   node scripts/render.js build --spec <absolute .json> ...
 *   node scripts/render.js sync --md <absolute slides.md> --deck <absolute .key> [--brand ...]
 *   (when --deck does not exist yet, sync builds it; no archive step)
 *
 * Low-level mutators (each archives first when the .key exists):
 *   update-slide, insert-slide, delete-slide
 *
 * The rules this file follows are stated once, in
 * system/templates/Script Contract.md. This tool holds no credentials and
 * takes no --env; osascript and Keynote are local runtimes declared in the
 * Dependencies section of TOOL.md and checked after help parsing.
 */

// Node built-ins only. Nothing here may import from outside this tool directory.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'yaml', 'package.json');

const COMMANDS = new Set([
  'check', 'themes', 'layouts', 'build', 'inspect', 'snapshot', 'export',
  'update-slide', 'insert-slide', 'delete-slide', 'sync'
]);

const EXPORT_FORMATS = {
  pdf: { keynote: 'PDF', extension: '.pdf' },
  pptx: { keynote: 'Microsoft PowerPoint', extension: '.pptx' },
  html: { keynote: 'HTML', extension: '.html' },
  images: { keynote: 'slide images', extension: '-images' }
};

const SLIDE_KEYS = new Set(['layout', 'title', 'body', 'texts', 'notes', 'images']);
const IMAGE_KEYS = new Set(['path', 'x', 'y', 'width', 'height']);

const USAGE = `keynote-render - native Keynote build and in-place markdown sync

Primary workstream (agent entry):
  node scripts/render.js sync --md <path.md> --deck <path.key> [--brand <path.yaml>] [--theme "<name>"] [--confirm] [--allow-delete] [--out <dir for snapshot>]

  1. Load the markdown SSOT (--md).
  2. If the .key exists: archive it to sibling zArchive/ (standards/conventions.md § Archives),
     inspect the live deck, diff, apply minimal update/insert/delete, save in place.
  3. If the .key does not exist: full build from markdown (same as build), no archive.
  4. Optionally snapshot and report ops + archivePath.

Low-level mutators (each archives an existing .key first; require --confirm):
  node scripts/render.js update-slide --deck <path.key> --slide <n> [--title ...] [--body ...] [--notes ...] [--texts <json>] [--image <path>] [--confirm]
  node scripts/render.js insert-slide --deck <path.key> --after <n> --layout <master|intent> [--brand ...] [--title ...] [--body ...] [--notes ...] [--confirm]
  node scripts/render.js delete-slide --deck <path.key> --slide <n> [--confirm]

Greenfield / inspection:
  node scripts/render.js help
  node scripts/render.js check
  node scripts/render.js themes
  node scripts/render.js layouts --theme "<installed theme>"
  node scripts/render.js build --spec <path.json> [options]
  node scripts/render.js inspect --deck <path.key> --slide <n>
  node scripts/render.js snapshot --deck <path.key> [--out <dir>] [--confirm]
  node scripts/render.js export --deck <path.key> --format <format> [--out <path>] [--confirm]

Commands:
  sync          Markdown SSOT → archive → diff → patch existing .key (or build if missing)
  update-slide  V1: update title/body/notes/texts/images on one slide in place
  insert-slide  V2: insert a slide after index N (0 = front; omit/--after count = end)
  delete-slide  V2: delete slide N (renumbers remaining)
  check         Report whether osascript and Keynote are present; launches nothing
  themes        List every installed theme name
  layouts       List one theme's master layout names
  build         Build a deck JSON spec into a .key file
  inspect       Report one slide's master, placeholders, text items, and notes
  snapshot      Write one image per slide
  export        Export a deck as pdf, pptx, html, or images
  help          Print this message

Options:
  --md <path>         Markdown deck SSOT, absolute. Required by sync
  --spec <path>       Deck spec JSON, absolute. Required by build
  --deck <path>       Saved .key deck, absolute
  --brand <path>      Brand YAML, absolute
  --theme "<name>"    Installed theme name; overrides the brand's theme
  --out <path>        Output path, absolute (build/export/snapshot)
  --slide <n>         Slide number from 1
  --after <n>         Insert after slide n (0 = before first). insert-slide
  --layout <name>     Master name or brand layout intent
  --title <text>      Slide title
  --body <text|json>  Body string, or JSON array of lines
  --notes <text>      Presenter notes
  --texts <json>      JSON object of semantic keys or indices to text
  --image <path>      Absolute image path to place on the slide (repeatable via JSON in --texts only for multi; single --image)
  --format <fmt>      pdf, pptx, html, or images. Required by export
  --allow-delete      sync only: delete deck slides not present in markdown (off by default)
  --archive-dir <path> Override zArchive directory (same naming rules; absolute)
  --confirm           Required for mutators that change an existing .key; also replaces build/export outputs
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help              Print this message

Archive safety (every mutator on an existing .key):
  Copy to zArchive/ beside the .key as "YY-MM-DD Vn - <original name>" per
  standards/conventions.md § Archives. If the copy fails, the deck is not mutated.
  Result JSON includes archivePath.

Every path is absolute. Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function emit(object) {
  process.stdout.write(`${JSON.stringify(object)}\n`);
  process.exit(0);
}

// Arguments. Parsed first so help costs nothing: no install, no dependency
// check, no file read.
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
  '--spec', '--deck', '--brand', '--theme', '--out', '--slide', '--format',
  '--md', '--after', '--layout', '--title', '--body', '--notes', '--texts',
  '--image', '--archive-dir'
]);
const BARE_FLAGS = new Set([
  '--install','--confirm', '--help', '-h', '--allow-delete']);


// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a deck that looks finished and is not what was asked for.
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

const confirmed = argv.includes('--confirm');

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, or written, and before Keynote is
 * launched.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. An output usually does not exist
 * yet, so a path whose leaf is absent is canonicalized through the deepest
 * ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the write lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know where a write lands
 * refuses rather than falling back to comparing the caller's spelling.
 */
function canonical(label, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${label} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
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
 * ancestor of `target` is compared that way as well. An output that does not
 * exist yet has no inode of its own, which is why the walk climbs to the
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

// Returns the canonical path, so a spec, a deck, or a brand file is read at the
// path this checked rather than at the spelling the caller happened to use, and
// so a default --out derived from it is derived from the real location.
function requirePath(name, value, { mustExist = true } = {}) {
  if (!value) fail(`Error: ${name} is required. Pass ${name} <absolute path>.`);
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". Pass a full path, not one relative to the current directory.`);
  }
  const target = canonical(name, value);
  if (mustExist && !existsSync(target)) fail(`Error: no file at ${target}. Check the path.`);
  return target;
}

// A script never writes inside its own directory (Script Contract), so refuse
// an output that resolves in here before anything else happens. Comparing
// resolved strings alone refused only the direct spelling, which left a case
// variant and a symlinked ancestor pointing at the very directory the refusal
// names, so the comparison is by identity as well. The canonical path is
// returned and is what every caller writes to.
function guardOutside(target, label) {
  const resolved = canonical(label, target);
  if (insideToolDirectory(resolved)) {
    fail(`Error: ${label} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Pass a path in a work directory of the owning root.`);
  }
  return resolved;
}

// The confirmation gate. Opt in only, never interactive, and always evaluated
// before any input is read and before Keynote is launched, so nothing is opened
// on the way to refusing.
function guardExisting(target, label) {
  if (existsSync(target) && !confirmed) {
    fail(`Error: ${label} already exists at ${target}. Pass --confirm to replace it, or choose another path with --out.`);
  }
  return target;
}

// System dependencies. Declared in the Dependencies section of TOOL.md, checked
// here after help parsing and only on a command that reaches Keynote. Missing,
// the run fails naming the dependency and its check command, never install steps
// (Script Contract, System dependencies).
const { keynoteBundle, osascriptPresent } = await import('./lib/jxa.js');

function requireRuntimes() {
  if (!osascriptPresent()) {
    fail("Error: missing osascript; check: osascript -l JavaScript -e 'JSON.stringify(true)'. This tool drives Keynote through JXA and runs on macOS only. See the Dependencies section of TOOL.md.");
  }
  if (!keynoteBundle()) {
    fail('Error: missing Keynote; check: /Applications/Keynote.app or /Applications/Keynote Creator Studio.app exists. See the Dependencies section of TOOL.md; install steps live nowhere in this tool.');
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

// check: presence only. It needs no packages and launches no application, so it
// answers on a copy that has never been installed.
if (command === 'check') {
  const bundle = keynoteBundle();
  emit({ osascript: osascriptPresent(), keynote: Boolean(bundle), keynoteApp: bundle?.app ?? null });
}

// Dependencies (npm). Only a brand file needs a package, so only a branded
// build runs this. The marker is one package's own manifest, never the
// node_modules directory, which an interrupted install leaves behind empty.
function requirePackages() {
  if (existsSync(DEP_MARKER)) return;
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
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes. See SETUP.md.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

try {
  if (command === 'themes') await themes();
  else if (command === 'layouts') await layouts();
  else if (command === 'build') await build();
  else if (command === 'inspect') await inspectSlideCommand();
  else if (command === 'snapshot') await snapshot();
  else if (command === 'export') await exportDeckCommand();
  else if (command === 'update-slide') await updateSlideCommand();
  else if (command === 'insert-slide') await insertSlideCommand();
  else if (command === 'delete-slide') await deleteSlideCommand();
  else if (command === 'sync') await syncCommand();
} catch (error) {
  fail(`Error: ${error.message}`);
}

/**
 * Archive an existing .key before any mutation. On failure the deck must not
 * be touched — archiveBeside throws and we never reach the mutator.
 */
function archiveDeck(deckPath) {
  const archiveDir = flag('--archive-dir')
    ? guardOutside(requirePath('--archive-dir', flag('--archive-dir'), { mustExist: false }), '--archive-dir')
    : undefined;
  // Dynamic import keeps archive.js out of the help/check path; it is local.
  return import('./lib/archive.js').then(({ archiveBeside }) =>
    archiveBeside(deckPath, archiveDir ? { archiveDir } : {}));
}

function requireConfirm(action) {
  if (!confirmed) {
    fail(`Error: ${action} changes an existing deck. Pass --confirm after reviewing the planned change. A copy is written to sibling zArchive/ first (standards/conventions.md § Archives).`);
  }
}

/** Normalize --body: plain string or JSON array of strings → single string. */
function parseBodyFlag(raw) {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      fail(`Error: --body looks like JSON but failed to parse: ${e.message}`);
    }
    if (!Array.isArray(parsed) || !parsed.every((line) => typeof line === 'string')) {
      fail('Error: --body as JSON must be an array of strings.');
    }
    return parsed.join('\n');
  }
  return raw;
}

function parseTextsFlag(raw) {
  if (raw === undefined) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`Error: --texts must be JSON object: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('Error: --texts must be a JSON object mapping keys or indices to text.');
  }
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') fail(`Error: --texts.${k} must be a string.`);
  }
  return parsed;
}

function warningsFromWrite(where, result) {
  const warnings = [];
  for (const [field, status] of [['title', result.titleSet], ['body', result.bodySet]]) {
    if (status === false) warnings.push(`${where}: this master has no ${field} placeholder; that text was not written`);
    if (status === 'hidden') warnings.push(`${where}: this master hides the ${field} placeholder; route that text through "texts" with an item index instead`);
  }
  for (const [index, ok] of Object.entries(result.textsSet ?? {})) {
    if (!ok) warnings.push(`${where}: no text item at index ${index}; that text was not written`);
  }
  return warnings;
}

/** Resolve layout intent + texts keys through brand when present. */
async function resolveSlideContent(slide, brandPath, themeOverride, baseDir) {
  let brandEntry = null;
  if (brandPath) {
    requirePackages();
    const { loadBrand } = await import('./lib/brand.js');
    brandEntry = loadBrand(brandPath);
  }
  const { resolveDeck } = await import('./lib/deck.js');
  // resolveDeck requires a theme only when brand/theme needed for layout map;
  // for pure text updates with no layout, pass a dummy theme if none given.
  const needsTheme = Boolean(slide.layout) || Boolean(brandEntry) || Boolean(themeOverride);
  let theme = themeOverride || brandEntry?.brand?.theme;
  if (!theme && needsTheme && slide.layout && brandEntry?.brand?.layouts?.[slide.layout]) {
    theme = brandEntry.brand.theme;
  }
  if (!theme) {
    // Text-only update with no brand: pass slides through with numeric texts only.
    const texts = slide.texts;
    if (texts) {
      for (const key of Object.keys(texts)) {
        if (!/^\d+$/.test(key)) {
          fail(`Error: texts key "${key}" is not an index, and no --brand maps it. Pass --brand or use numeric indices.`);
        }
      }
    }
    const images = (slide.images ?? []).map((image, j) => {
      const p = image.path;
      if (!isAbsolute(p)) fail(`Error: image path must be absolute; got "${p}".`);
      if (!existsSync(p)) fail(`Error: no image at ${p}.`);
      return { path: p, x: image.x ?? null, y: image.y ?? null, width: image.width ?? null, height: image.height ?? null };
    });
    return {
      theme: null,
      slide: {
        layout: slide.layout,
        title: slide.title,
        body: Array.isArray(slide.body) ? slide.body.join('\n') : slide.body,
        texts: slide.texts,
        notes: slide.notes,
        images,
        replaceImages: slide.replaceImages
      }
    };
  }
  const resolved = resolveDeck(
    [{
      layout: slide.layout,
      title: slide.title,
      body: Array.isArray(slide.body) ? slide.body.join('\n') : slide.body,
      texts: slide.texts,
      notes: slide.notes,
      images: slide.images ?? []
    }],
    brandEntry,
    themeOverride,
    baseDir
  );
  return {
    theme: resolved.theme,
    slide: { ...resolved.slides[0], replaceImages: slide.replaceImages }
  };
}

async function themes() {
  requireRuntimes();
  const { listThemes } = await import('./lib/keynote.js');
  emit({ themes: await listThemes() });
}

async function layouts() {
  const theme = flag('--theme');
  if (!theme) fail('Error: --theme is required. Pass --theme "<installed theme>"; run "themes" to list what is installed.');
  requireRuntimes();
  const { listLayouts } = await import('./lib/keynote.js');
  emit({ theme, layouts: await listLayouts(theme) });
}

async function build() {
  const specPath = requirePath('--spec', flag('--spec'));
  const brandPath = flag('--brand') ? requirePath('--brand', flag('--brand')) : null;
  const themeOverride = flag('--theme') ?? null;

  const outPath = guardOutside(
    flag('--out') ? requirePath('--out', flag('--out'), { mustExist: false })
      : specPath.replace(/\.json$/i, '') + '.key',
    '--out'
  );
  guardExisting(outPath, 'The deck');

  const slides = readSpec(specPath);

  let brandEntry = null;
  if (brandPath) {
    requirePackages();
    const { loadBrand } = await import('./lib/brand.js');
    brandEntry = loadBrand(brandPath);
  }
  const { resolveDeck } = await import('./lib/deck.js');
  const resolved = resolveDeck(slides, brandEntry, themeOverride, dirname(specPath));

  requireRuntimes();
  mkdirSync(dirname(outPath), { recursive: true });
  const { buildDeck } = await import('./lib/keynote.js');
  const result = await buildDeck(resolved.theme, resolved.slides, outPath);

  // Every warning is a defect in the spec or the brand: text that was asked for
  // and is not on the slide. The fix belongs in the spec, never in the .key.
  const warnings = [];
  for (const slide of result.slides) {
    const where = `slide ${slide.slideNumber} (${slide.layout || 'default layout'})`;
    for (const [field, status] of [['title', slide.titleSet], ['body', slide.bodySet]]) {
      if (status === false) warnings.push(`${where}: this master has no ${field} placeholder; that text was not written`);
      if (status === 'hidden') warnings.push(`${where}: this master hides the ${field} placeholder; route that text through "texts" with an item index instead`);
    }
    for (const [index, ok] of Object.entries(slide.textsSet ?? {})) {
      if (!ok) warnings.push(`${where}: no text item at index ${index}; that text was not written`);
    }
  }

  emit({
    name: result.name,
    theme: resolved.theme,
    slideCount: result.slideCount,
    outputPath: outPath,
    slides: result.slides,
    warnings
  });
}

async function inspectSlideCommand() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const slideNumber = Number(flag('--slide'));
  if (!Number.isInteger(slideNumber) || slideNumber < 1) {
    fail('Error: --slide must be a whole number from 1.');
  }
  requireRuntimes();
  const { inspectSlide } = await import('./lib/keynote.js');
  emit(await inspectSlide(deckPath, slideNumber));
}

async function snapshot() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const outDir = guardOutside(
    flag('--out') ? requirePath('--out', flag('--out'), { mustExist: false })
      : deckPath.replace(/\.key$/i, '') + '-slides',
    '--out'
  );
  guardExisting(outDir, 'The snapshot directory');
  requireRuntimes();
  const { snapshotDeck } = await import('./lib/keynote.js');
  emit(await snapshotDeck(deckPath, outDir));
}

async function exportDeckCommand() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const format = String(flag('--format') ?? '').toLowerCase();
  if (!EXPORT_FORMATS[format]) {
    fail(`Error: --format must be one of ${Object.keys(EXPORT_FORMATS).join(', ')}.`);
  }
  const outPath = guardOutside(
    flag('--out') ? requirePath('--out', flag('--out'), { mustExist: false })
      : deckPath.replace(/\.key$/i, '') + EXPORT_FORMATS[format].extension,
    '--out'
  );
  guardExisting(outPath, 'The export');
  requireRuntimes();
  const { exportDeck } = await import('./lib/keynote.js');
  const result = await exportDeck(deckPath, EXPORT_FORMATS[format].keynote, outPath);
  emit({ ...result, format });
}

async function updateSlideCommand() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const slideNumber = Number(flag('--slide'));
  if (!Number.isInteger(slideNumber) || slideNumber < 1) {
    fail('Error: --slide must be a whole number from 1.');
  }
  requireConfirm('update-slide');

  const title = flag('--title');
  const body = parseBodyFlag(flag('--body'));
  const notes = flag('--notes');
  const texts = parseTextsFlag(flag('--texts'));
  const imagePath = flag('--image')
    ? requirePath('--image', flag('--image'))
    : null;
  const layout = flag('--layout');
  const brandPath = flag('--brand') ? requirePath('--brand', flag('--brand')) : null;

  if (title === undefined && body === undefined && notes === undefined && !texts && !imagePath && !layout) {
    fail('Error: update-slide needs at least one of --title, --body, --notes, --texts, --image, --layout.');
  }

  const raw = {
    title,
    body,
    notes,
    texts,
    layout: layout || undefined,
    images: imagePath ? [{ path: imagePath }] : [],
    replaceImages: Boolean(imagePath)
  };
  // Drop undefined fields so writePlaceholders does not clear them
  for (const key of Object.keys(raw)) {
    if (raw[key] === undefined) delete raw[key];
  }

  const { slide } = await resolveSlideContent(
    raw,
    brandPath,
    flag('--theme') ?? null,
    dirname(deckPath)
  );

  requireRuntimes();
  const archivePath = await archiveDeck(deckPath);
  const { updateSlide } = await import('./lib/keynote.js');
  const result = await updateSlide(deckPath, slideNumber, slide);
  const warnings = warningsFromWrite(`slide ${slideNumber}`, result);
  emit({
    op: 'update-slide',
    deck: deckPath,
    archivePath,
    ...result,
    warnings
  });
}

async function insertSlideCommand() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const afterRaw = flag('--after');
  const after = afterRaw === undefined ? null : Number(afterRaw);
  if (afterRaw !== undefined && (!Number.isInteger(after) || after < 0)) {
    fail('Error: --after must be a whole number from 0 (before first slide).');
  }
  requireConfirm('insert-slide');

  const layout = flag('--layout');
  const brandPath = flag('--brand') ? requirePath('--brand', flag('--brand')) : null;
  const title = flag('--title');
  const body = parseBodyFlag(flag('--body'));
  const notes = flag('--notes');
  const texts = parseTextsFlag(flag('--texts'));
  const imagePath = flag('--image')
    ? requirePath('--image', flag('--image'))
    : null;

  const raw = {
    layout: layout || undefined,
    title,
    body,
    notes,
    texts,
    images: imagePath ? [{ path: imagePath }] : []
  };
  for (const key of Object.keys(raw)) {
    if (raw[key] === undefined) delete raw[key];
  }

  const { slide } = await resolveSlideContent(
    raw,
    brandPath,
    flag('--theme') ?? null,
    dirname(deckPath)
  );

  requireRuntimes();
  // Need current count when --after is omitted (append).
  const { inspectDeck, insertSlide } = await import('./lib/keynote.js');
  let afterIndex = after;
  if (afterIndex === null) {
    const live = await inspectDeck(deckPath);
    afterIndex = live.slideCount;
  }

  const archivePath = await archiveDeck(deckPath);
  const result = await insertSlide(deckPath, afterIndex, slide);
  const warnings = warningsFromWrite(`inserted slide ${result.slideNumber}`, result);
  emit({
    op: 'insert-slide',
    deck: deckPath,
    archivePath,
    ...result,
    warnings
  });
}

async function deleteSlideCommand() {
  const deckPath = requirePath('--deck', flag('--deck'));
  const slideNumber = Number(flag('--slide'));
  if (!Number.isInteger(slideNumber) || slideNumber < 1) {
    fail('Error: --slide must be a whole number from 1.');
  }
  requireConfirm('delete-slide');

  requireRuntimes();
  const archivePath = await archiveDeck(deckPath);
  const { deleteSlide } = await import('./lib/keynote.js');
  const result = await deleteSlide(deckPath, slideNumber);
  emit({
    op: 'delete-slide',
    deck: deckPath,
    archivePath,
    ...result
  });
}

/**
 * Primary agent workstream: markdown SSOT → (archive) → diff → patch → verify.
 */
async function syncCommand() {
  const mdPath = requirePath('--md', flag('--md'));
  const deckArg = flag('--deck');
  if (!deckArg) fail('Error: --deck is required. Pass --deck <absolute .key> (existing or destination for a new build).');
  if (!isAbsolute(deckArg)) {
    fail(`Error: --deck must be absolute; got "${deckArg}".`);
  }
  const deckPath = guardOutside(
    requirePath('--deck', deckArg, { mustExist: false }),
    '--deck'
  );
  const brandPath = flag('--brand') ? requirePath('--brand', flag('--brand')) : null;
  const themeOverride = flag('--theme') ?? null;
  const allowDelete = argv.includes('--allow-delete');
  const deckExists = existsSync(deckPath);

  const { parseMarkdownDeck } = await import('./lib/markdown.js');
  const { slides: mdSlides, meta } = parseMarkdownDeck(mdPath);

  // Greenfield: no .key yet → full build from markdown via the existing build path.
  if (!deckExists) {
    if (!brandPath && !themeOverride) {
      fail('Error: building a new deck requires --brand or --theme so Keynote knows which theme to use.');
    }
    // Build writes a new file; --confirm only if something is already there (not).
    guardExisting(deckPath, 'The deck');

    let brandEntry = null;
    if (brandPath) {
      requirePackages();
      const { loadBrand } = await import('./lib/brand.js');
      brandEntry = loadBrand(brandPath);
    }
    const { resolveDeck } = await import('./lib/deck.js');
    // Normalize images for resolveDeck (path only objects)
    const forResolve = mdSlides.map((s) => ({
      layout: s.layout,
      title: s.title,
      body: s.body,
      texts: s.texts,
      notes: s.notes,
      images: (s.images ?? []).map((im) => ({ path: im.path }))
    }));
    const resolved = resolveDeck(forResolve, brandEntry, themeOverride, dirname(mdPath));

    requireRuntimes();
    mkdirSync(dirname(deckPath), { recursive: true });
    const { buildDeck } = await import('./lib/keynote.js');
    const result = await buildDeck(resolved.theme, resolved.slides, deckPath);

    const warnings = [];
    for (const slide of result.slides) {
      warnings.push(...warningsFromWrite(`slide ${slide.slideNumber} (${slide.layout || 'default layout'})`, slide));
    }

    emit({
      op: 'sync',
      mode: 'build',
      markdown: mdPath,
      deck: deckPath,
      archivePath: null,
      theme: resolved.theme,
      slideCount: result.slideCount,
      ops: mdSlides.map((s, i) => ({ op: 'build', slide: i + 1, title: s.title })),
      summary: {
        markdownSlides: mdSlides.length,
        deckSlides: 0,
        built: result.slideCount,
        update: 0,
        insert: 0,
        delete: 0,
        keep: 0
      },
      slides: result.slides,
      warnings,
      meta
    });
  }

  // Existing deck: archive → inspect → diff → apply → verify.
  requireConfirm('sync against an existing deck');
  requireRuntimes();

  const { inspectDeck, applyOps, snapshotDeck, inspectSlide } = await import('./lib/keynote.js');
  const live = await inspectDeck(deckPath);

  const { diffDeck, planApplication } = await import('./lib/diff.js');
  const { ops, summary } = diffDeck(mdSlides, live.slides, { allowDelete });
  const { apply: applyPlan } = planApplication(ops);

  // Resolve brand for inserts/updates that carry layout intents or semantic texts.
  let brandEntry = null;
  if (brandPath) {
    requirePackages();
    const { loadBrand } = await import('./lib/brand.js');
    brandEntry = loadBrand(brandPath);
  }
  const resolveWarnings = [];

  /**
   * Map semantic text keys to indices. Unmapped keys become warnings rather
   * than hard failures on update (a Title master may not expose subtitle).
   */
  function mapTextsSoft(texts, masterOrIntent) {
    if (!texts) return undefined;
    const brand = brandEntry?.brand;
    // Intent → master via brand.layouts, else treat as master name already.
    const master = (brand?.layouts?.[masterOrIntent]) || masterOrIntent || null;
    const keys = (master && brand?.texts?.[master]) || {};
    const byIndex = {};
    for (const [key, value] of Object.entries(texts)) {
      if (/^\d+$/.test(key)) {
        byIndex[key] = value;
      } else if (keys[key] !== undefined) {
        byIndex[String(keys[key])] = value;
      } else {
        resolveWarnings.push(
          `texts key "${key}" is not mapped on layout "${master || '(none)'}"; skipped (add it under texts in the brand, or use a numeric index)`
        );
      }
    }
    return Object.keys(byIndex).length > 0 ? byIndex : undefined;
  }

  /**
   * Resolve one slide's layout intents and text keys through the brand.
   * `layoutHint` is the live master name used only for text-index mapping when
   * the slide has no layout intent (in-place updates must not re-master).
   */
  function resolveOne(slideLike, layoutHint = null) {
    const images = (slideLike.images ?? []).map((im) => {
      if (!existsSync(im.path)) {
        throw new Error(`no image at ${im.path}`);
      }
      return {
        path: im.path,
        x: im.x ?? null,
        y: im.y ?? null,
        width: im.width ?? null,
        height: im.height ?? null
      };
    });

    if (!brandEntry?.brand?.theme && !themeOverride) {
      if (slideLike.texts) {
        for (const key of Object.keys(slideLike.texts)) {
          if (!/^\d+$/.test(key)) {
            throw new Error(
              `texts key "${key}" is not an index, and no --brand maps it. Pass --brand or use numeric indices.`
            );
          }
        }
      }
      return {
        layout: slideLike.layout,
        title: slideLike.title,
        body: slideLike.body,
        texts: slideLike.texts,
        notes: slideLike.notes,
        images,
        replaceImages: Boolean(slideLike.images && slideLike.images.length)
      };
    }

    // Layout intent → master when brand maps it; else pass through.
    let layout = slideLike.layout;
    if (layout && brandEntry?.brand?.layouts?.[layout]) {
      layout = brandEntry.brand.layouts[layout];
    }
    const textMapLayout = layout || layoutHint || null;
    const texts = mapTextsSoft(slideLike.texts, textMapLayout);

    const out = {
      layout: slideLike.layout ? layout : undefined,
      title: slideLike.title,
      body: slideLike.body,
      texts,
      notes: slideLike.notes,
      images,
      replaceImages: Boolean(slideLike.images && slideLike.images.length)
    };
    if (!out.layout) delete out.layout;
    if (!out.texts) delete out.texts;
    return out;
  }

  // Build Keynote ops list from the plan. Skip keep / keep-extra.
  const keynoteOps = [];
  for (const op of applyPlan) {
    if (op.op === 'update') {
      const md = mdSlides[op.slide - 1];
      const liveSlide = live.slides[op.slide - 1];
      const patch = { ...op.patch };
      // Do not re-theme: layout on update is ignored so masters and custom chrome stay.
      delete patch.layout;
      const toResolve = {
        title: patch.title,
        body: patch.body,
        notes: patch.notes,
        // Only resolve texts when the diff asked for a texts change
        texts: patch.texts,
        images: patch.images
      };
      const slideData = resolveOne(toResolve, liveSlide?.layout || null);
      // Only include fields that are actually in the patch so we do not blank others.
      const data = {};
      if (patch.title !== undefined) data.title = slideData.title;
      if (patch.body !== undefined) data.body = slideData.body;
      if (patch.notes !== undefined) data.notes = slideData.notes;
      if (patch.texts !== undefined) data.texts = slideData.texts;
      if (patch.images !== undefined) {
        data.images = slideData.images;
        data.replaceImages = true;
      }
      keynoteOps.push({ op: 'update', slide: op.slide, slideData: data, title: op.title });
    } else if (op.op === 'insert') {
      const md = op.slide;
      // Inserts without a layout intent fall back to theme default master.
      const slideData = resolveOne(md, null);
      keynoteOps.push({
        op: 'insert',
        after: op.after,
        slideData,
        title: op.title
      });
    } else if (op.op === 'delete') {
      keynoteOps.push({ op: 'delete', slide: op.slide, title: op.title });
    }
  }

  // Nothing to do: still succeed with a clear report (no archive when no mutation).
  if (keynoteOps.length === 0) {
    emit({
      op: 'sync',
      mode: 'noop',
      markdown: mdPath,
      deck: deckPath,
      archivePath: null,
      slideCount: live.slideCount,
      ops,
      summary,
      applied: [],
      warnings: [],
      meta
    });
  }

  const archivePath = await archiveDeck(deckPath);
  // Strip display-only fields before JXA
  const jxaOps = keynoteOps.map(({ op: o, slide, after, slideData }) => {
    if (o === 'update') return { op: o, slide, slideData };
    if (o === 'insert') return { op: o, after, slideData };
    if (o === 'delete') return { op: o, slide };
    return { op: o };
  });

  const applied = await applyOps(deckPath, jxaOps);
  const warnings = [...resolveWarnings];
  for (const r of applied.applied) {
    if (r.op === 'update' || r.op === 'insert') {
      warnings.push(...warningsFromWrite(`${r.op} slide ${r.slideNumber}`, r));
    }
  }

  // Verify: inspect one updated slide when any update ran; optional snapshot.
  let verify = null;
  const firstUpdate = applied.applied.find((r) => r.op === 'update');
  if (firstUpdate) {
    verify = await inspectSlide(deckPath, firstUpdate.slideNumber);
  }

  let snapshot = null;
  if (flag('--out')) {
    const outDir = guardOutside(
      requirePath('--out', flag('--out'), { mustExist: false }),
      '--out'
    );
    // Snapshot after mutation: allow replace with the same --confirm already required.
    if (existsSync(outDir) && !confirmed) {
      // already confirmed for sync; treat as allowed
    }
    snapshot = await snapshotDeck(deckPath, outDir);
  }

  emit({
    op: 'sync',
    mode: 'patch',
    markdown: mdPath,
    deck: deckPath,
    archivePath,
    slideCount: applied.slideCount,
    ops,
    summary: {
      ...summary,
      appliedUpdates: applied.applied.filter((r) => r.op === 'update').length,
      appliedInserts: applied.applied.filter((r) => r.op === 'insert').length,
      appliedDeletes: applied.applied.filter((r) => r.op === 'delete').length
    },
    applied: applied.applied,
    verify: verify
      ? {
          slideNumber: verify.slideNumber,
          layout: verify.layout,
          defaultTitle: verify.defaultTitle,
          presenterNotes: verify.presenterNotes
            ? String(verify.presenterNotes).slice(0, 200)
            : null,
          shapeCount: verify.shapeCount
        }
      : null,
    snapshot,
    warnings,
    meta
  });
}

/**
 * Read and check a deck spec. It carries content and nothing else: a spec
 * naming a theme, a brand, or an output path is refused, because those are
 * presentation and delivery, and they arrive as flags. Runs before any package
 * is installed and before Keynote is launched, so a malformed spec costs
 * nothing.
 */
function readSpec(file) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`Error: ${file} is not valid JSON: ${e.message}`);
  }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    fail(`Error: ${file} must hold a JSON object with a "slides" array.`);
  }

  const problems = [];
  for (const key of Object.keys(spec)) {
    if (key !== 'slides') problems.push(`top level: "${key}" is not part of a deck spec; pass presentation on the command line (--theme, --brand, --out)`);
  }
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    problems.push('top level: "slides" must be a non-empty array');
  }

  const slides = [];
  (Array.isArray(spec.slides) ? spec.slides : []).forEach((slide, i) => {
    const where = `slide ${i + 1}`;
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) {
      problems.push(`${where}: must be an object`);
      return;
    }
    for (const key of Object.keys(slide)) {
      if (!SLIDE_KEYS.has(key)) problems.push(`${where}: "${key}" is not a slide field; the fields are ${[...SLIDE_KEYS].join(', ')}`);
    }
    if (slide.layout !== undefined && typeof slide.layout !== 'string') problems.push(`${where}: "layout" must be a layout intent or master name`);
    if (slide.title !== undefined && typeof slide.title !== 'string') problems.push(`${where}: "title" must be text`);
    if (slide.notes !== undefined && typeof slide.notes !== 'string') problems.push(`${where}: "notes" must be text`);
    if (slide.body !== undefined) {
      const lines = Array.isArray(slide.body) ? slide.body : [slide.body];
      if (!lines.every((line) => typeof line === 'string')) problems.push(`${where}: "body" must be text or an array of text lines`);
    }
    if (slide.texts !== undefined) {
      if (!slide.texts || typeof slide.texts !== 'object' || Array.isArray(slide.texts)) {
        problems.push(`${where}: "texts" must map semantic keys or text item indices to text`);
      } else if (!Object.values(slide.texts).every((value) => typeof value === 'string')) {
        problems.push(`${where}: every value under "texts" must be text`);
      }
    }
    if (slide.images !== undefined) {
      if (!Array.isArray(slide.images)) problems.push(`${where}: "images" must be an array`);
      else slide.images.forEach((image, j) => {
        if (!image || typeof image !== 'object' || Array.isArray(image)) { problems.push(`${where}, image ${j + 1}: must be an object`); return; }
        if (typeof image.path !== 'string') problems.push(`${where}, image ${j + 1}: "path" is required`);
        for (const key of Object.keys(image)) {
          if (!IMAGE_KEYS.has(key)) problems.push(`${where}, image ${j + 1}: "${key}" is not an image field; the fields are ${[...IMAGE_KEYS].join(', ')}`);
          else if (key !== 'path' && typeof image[key] !== 'number') problems.push(`${where}, image ${j + 1}: "${key}" must be a number of points`);
        }
      });
    }

    slides.push({
      layout: slide.layout,
      title: slide.title,
      body: Array.isArray(slide.body) ? slide.body.join('\n') : slide.body,
      texts: slide.texts,
      notes: slide.notes,
      images: slide.images ?? []
    });
  });

  if (problems.length > 0) {
    fail(`Error: ${file} is not a valid deck spec:\n- ${problems.join('\n- ')}`);
  }
  return slides;
}
