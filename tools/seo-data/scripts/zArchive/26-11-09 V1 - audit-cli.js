/**
 * seo-data audit - consolidate Search Console and Analytics results into one audit dataset
 *
 * Invoked by scripts/seo-data.js after help is answered. Node built-ins only:
 * no package import, no configuration file, no credential, and no network call.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

export async function runAudit(argv) {

const VALUE_FLAGS = new Set(['--input']);
const BARE_FLAGS = new Set(['--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a dataset that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/seo-data.js audit help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  // A SECOND OCCURRENCE IS A USAGE MISTAKE, NOT A PREFERENCE.
  //
  // First-wins silently discarded the rest. Round 12 drove two --file paths at
  // this tool and got a clean, confident, correct-looking object about ONE of
  // them, exit 0, with no signal that the other had been dropped -- which the
  // Script Contract forbids by name. Round 11 fixed this class in Browser
  // Control's switch reader; data-join, data-chart, tag-audit and video-edit
  // already refused. This is the same refusal, in the tools the fix missed.
  // Flags that are documented as repeatable are read somewhere other than here.
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/seo-data.js audit help" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/seo-data.js audit help" for usage.`);
  }
  return value;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read and before the dependency check.
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

/**
 * True when `target` names this tool's own directory or something beneath it,
 * decided by identity rather than by spelling.
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and a name test alone lets the read through. Device and inode are
 * a directory's own identity, which no spelling reaches, so every existing
 * ancestor of `target` is compared that way as well.
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

/**
 * The one path this command reads, resolved once and returned, so that what is
 * opened below is the path this screen cleared rather than the spelling the
 * caller happened to use. Absolute because the help text says absolute: a
 * relative path resolves against whichever directory the caller was in, which
 * is not a location this tool can reason about. Outside this tool directory
 * because a tool reads the caller's data, never its own installation.
 */
function screenedInputPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). This tool reads the caller's data; pass a path in a work directory in the owning root.`);
  }
  return target;
}

const inputArgument = flag('--input');
if (!inputArgument) {
  fail('Error: --input is required. Pass the absolute path to the audit input bundle. Run "node scripts/seo-data.js audit help" for usage.');
}
// Screened before the existence check, so a path this tool must not read is
// refused without the tool ever asking the filesystem about it. Everything
// below uses the value this returns, never `inputArgument`.
const inputPath = screenedInputPath('--input', inputArgument);
if (!existsSync(inputPath)) {
  fail(`Error: no file at ${inputPath}. Pass the absolute path to the audit input bundle.`);
}

let bytes;
try { bytes = new Uint8Array(readFileSync(inputPath)); }
catch { fail(`Error: could not read ${inputPath}. Confirm it is a readable file, not a directory.`); }
try {
  const { seoData } = await import('./seo-core.js');
  const result = await seoData({ command: 'audit', ...(/\.zip$/i.test(inputPath) ? {} : { input: inputPath }) }, [{ name: inputPath, mediaType: /\.zip$/i.test(inputPath) ? 'application/zip' : 'application/json', bytes }]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) { fail(error.message); }
}
