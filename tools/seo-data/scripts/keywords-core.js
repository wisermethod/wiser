/**
 * seo-data keywords and previous-window - turn Search Console query rows into a keyword report
 *
 * Invoked by scripts/seo-data.js after help is answered. Node built-ins only:
 * no package import, no configuration file, no credential, and no network call.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function helpRef(command) {
  if (command === 'previous-window') return 'node scripts/seo-data.js previous-window help';
  return 'node scripts/seo-data.js keywords help';
}

export async function runKeywords(argv) {
const command = argv[0] ?? 'keywords';

const VALUE_FLAGS = new Set([
  '--queries', '--query-pages', '--previous-queries', '--targets',
  '--start', '--end', '--min-impressions', '--site', '--output', '--archive'
]);
const BARE_FLAGS = new Set(['--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a report that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "${helpRef(command)}" for usage.`);
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
    fail(`Error: ${name} was given more than once and takes one value. Run "${helpRef(command)}" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "${helpRef(command)}" for usage.`);
  }
  return value;
}

// --- Input files ---

function readTextFile(path, what) {
  if (!isAbsolute(path)) {
    fail(`Error: the path for ${what} must be absolute; got "${path}".`);
  }
  if (!existsSync(path)) {
    fail(`Error: no file at ${path}. Pass the absolute path to ${what}.`);
  }
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // The runtime's own message is withheld; it can echo the path or file bytes.
    fail(`Error: could not read ${path}. Confirm it is a readable file, not a directory.`);
  }
}

// --- Output path, checked before any file is read so a bad path fails fast ---

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output directory usually does not exist yet, so a path whose leaf is
 * absent is canonicalized through the deepest ancestor that does exist and the
 * missing components joined back on: that ancestor is where the write would land.
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
 * compared that way. A destination that does not exist yet has no inode of its
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

const outputDir = flag('--output');
let outputTarget;

if (outputDir) {
  // Every other path this tool takes is required to be absolute, and the help
  // text says the same of this one. Accepting a relative spelling resolved it
  // against whatever directory the caller happened to be in, so one argument
  // named a different destination from one shell to the next.
  if (!isAbsolute(outputDir)) {
    fail(`Error: --output must be absolute; got "${outputDir}", which would resolve against whatever directory the caller happened to be in.`);
  }

  // The path this screen resolves is the path mkdirSync and writeFileSync below
  // are given. A screen that resolves one path and lets the write take the
  // caller's original spelling has only checked a string.
  outputTarget = canonical('--output', outputDir);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (outputTarget === toolReal || outputTarget.startsWith(`${toolReal}${sep}`) || descendsFrom(outputTarget, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
}

try {
  const { seoData } = await import('./seo-core.js');
  const { keywordReport } = await import('./keywords-report-core.js');
  const input = { command };
  for (const option of VALUE_FLAGS) if (option !== '--output' && option !== '--archive') {
    const value = flag(option); if (value !== undefined) input[option.slice(2)] = value;
  }
  keywordReport(input, () => '', { validateOnly: true });
  const archive = flag('--archive');
  let result;
  if (archive && command !== 'previous-window') {
    if (!isAbsolute(archive)) fail(`Error: the path for the export archive must be absolute; got "${archive}".`);
    let bytes;
    try { bytes = new Uint8Array(readFileSync(archive)); }
    catch { fail(`Error: could not read ${archive}. Confirm it is a readable file, not a directory.`); }
    result = await seoData(input, [{ name: archive, mediaType: 'application/zip', bytes }]);
  } else {
    // Plain files retain main's local limits. Hosted/ZIP refusal rules belong
    // to seoData; local files need neither UTF-8 re-encoding nor an in-memory ZIP.
    result = keywordReport(input, (name, what) => readTextFile(name, what).replace(/^\uFEFF/, ''), { bounded: false });
  }
  if (outputTarget) {
    mkdirSync(outputTarget, { recursive: true });
    const file = join(outputTarget, `seo-keywords-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`); result.file = file;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) { fail(error.message); }
}
