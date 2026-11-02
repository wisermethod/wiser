#!/usr/bin/env node
/**
 * Book Publisher - build print-ready PDF/X-1a and EPUB from markdown.
 *
 * Usage:
 *   node scripts/publish.js help
 *   node scripts/publish.js check [--config <absolute path>] [--install]
 *   node scripts/publish.js init --output <absolute directory> [--title <title>] [--author <name>]
 *   node scripts/publish.js validate --config <absolute path>
 *   node scripts/publish.js build --config <absolute path> [--print-only|--epub-only] [--draft] [--verbose]
 *
 * The rules this file follows are stated once, in
 * standards/script-contract.md. This tool needs no credentials and
 * takes no --env: pandoc, LaTeX, makeindex, and Ghostscript are local runtimes,
 * declared in the Dependencies section of TOOL.md, checked after help parsing.
 */

// Node built-ins and the plugin's shared tools/lib/ helpers only.
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync,
  copyFileSync, realpathSync, statSync, symlinkSync, unlinkSync, rmSync,
  openSync, readSync, closeSync
} from 'node:fs';
import { basename, dirname, join, resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPdfX } from './check-pdfx.js';

import { INSTALL_HELP, INSTALL_ONCE, installQuestion, formatInstallSize, parsedInstallFlag, flagAuthorised, installAuthorised, writeConsent } from '../../lib/consent.js';

const HERE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const TEMPLATES_DIR = join(TOOL_DIR, 'templates');
const FILTERS_DIR = join(TOOL_DIR, 'filters');

// Check each imported package's own manifest: a partial install can contain
// yaml while still missing pdfjs-dist.
const dependencyMarker = (name) => join(TOOL_DIR, 'node_modules', name, 'package.json');

// Allocated bytes measured on macOS ARM64, 2026-10-30 (du -sk times 1024).
const INSTALL_BYTES = 67866624;
const INSTALL_SIZE = formatInstallSize(INSTALL_BYTES);

const COMMANDS = new Set(['build', 'validate', 'check', 'init']);
const DEFAULT_MARGINS = { top: 0.85, bottom: 0.85, outer: 0.85, inner: 1.1 };
// One source for the template's reserved space and its validation minima.
// Match book.cls's existing separation, including its 10pt fallback for an
// unsupported size, so making these lengths explicit does not move a page.
const PRINT_LAYOUT = { footskip: '0.45in', headheight: '14pt', thumbtabwidth: '0.5in' };
function printLayout(config) {
  const size = config.typography?.font_size ? `${config.typography.font_size}pt` : '12pt';
  return { ...PRINT_LAYOUT, headsep: ['11pt', '12pt'].includes(size) ? '0.275in' : '0.25in' };
}
const BOX_DEFAULTS = {
  print: { background_gray: 0.95, border_gray: 0.5, border_width: 0.5, padding: 8 },
  epub: { background: '#f2f2f2', border_color: '#808080', border_width: 1, padding: 0.75 }
};

const USAGE = `Book Publisher - build print-ready PDF/X-1a and EPUB from markdown

Usage:
  node scripts/publish.js help
  node scripts/publish.js check [--config <absolute path>] [--install]
  node scripts/publish.js init --output <absolute directory> [--title <title>] [--author <name>]
  node scripts/publish.js validate --config <absolute path>
  node scripts/publish.js build --config <absolute path> [options]

Commands:
  build            Merge chapters and build the requested outputs
  validate         Check config, chapters, assets, index and project Standing; writes nothing
  init             Write a new book project without installing packages
  check            Survey dependencies; with --config also check the project and TeX files
  help             Print this message

Options:
  --output <dir>   init: new book project directory, absolute. Required.
  --title <text>   init: book title. Defaults to the target directory's name.
  --author <text>  init: author name. Defaults to "Awaiting its owner.".
  --config <path>  Book config YAML, absolute. Required by build/validate; optional for check.
  --print-only     Build only the print PDF and PDF/X-1a
  --epub-only      Build only the EPUB (needs pandoc alone, no LaTeX)
  --draft          Skip the back-of-book index (a faster print build)
  --force-merge    Re-merge chapters even when source.merged already exists
  --cleanup        Remove build temp files after success (kept by default)
  --verbose, -v    Stream pandoc, LaTeX, and Ghostscript output to stderr as UTF-8
  --install        ${INSTALL_HELP}
  --help, -h       Print this message

Print builds with index.enabled: false and index.extractor merge fresh chapters,
build a first PDF, inject TOC/index pages, rebuild, and verify in one invocation.
EPUB-only builds use pandoc alone. A leading flag still implies build.

For an unattended install, set WISER_ALLOW_INSTALL=1.
init accepts only --output, --title, --author and help; it installs nothing.

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Progress and subprocess output go to stderr; stdout carries only the final
// JSON object, so a caller can parse a run without stripping log lines.
function log(message) {
  process.stderr.write(`${message}\n`);
}

async function main() {
// Arguments. Parsed first so help costs nothing: no install, no config, no dependency check.
const argv = process.argv.slice(2);

// Keep the legacy flag-style entry: a leading option implies build.
if (argv.length && argv[0].startsWith('-') && argv[0] !== '--help' && argv[0] !== '-h') {
  argv.unshift('build');
}
const command = argv[0] === '--help' || argv[0] === '-h' ? 'help' : argv[0] ?? 'help';

if (!COMMANDS.has(command) && command !== 'help') {
  fail(`Error: unknown command "${command}". Run "node scripts/publish.js help" for usage.`);
}

const VALUE_FLAGS = new Set(command === 'init' ? ['--output', '--title', '--author'] : command === 'help' ? [] : ['--config']);
const BARE_FLAGS = new Set(command === 'build'
  ? ['--install', '--print-only', '--epub-only', '--draft', '--verbose', '-v', '--help', '-h', '--force-merge', '--cleanup']
  : command === 'init' || command === 'help' ? ['--help', '-h'] : ['--install', '--help', '-h']);

const install = parsedInstallFlag(argv, VALUE_FLAGS);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (valuePositions.has(index)) continue;
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a book that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  // A value beginning with -- cannot be accepted by flag() below. Still name
  // an unknown option there before checking values or doing any work.
  if (valuePositions.has(index) && !option.startsWith('--')) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/publish.js help" for usage.`);
  }
  if (command === 'init' && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unexpected argument "${option}". Run "node scripts/publish.js help" for usage.`);
  }
}

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/publish.js help" for usage.`);
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/publish.js help" for usage.`);
  }
  return value;
}

const verbose = argv.includes('--verbose') || argv.includes('-v');

// System dependencies. Declared in the Dependencies section of TOOL.md; checked
// here after help parsing and only on the command that needs each one. Missing,
// the run fails naming the dependency and its check command, never install steps
// (Script Contract, System dependencies).
// makeindex has no version flag: it treats one as an unknown option and then
// fails on a missing input file, so its exit code cannot separate "present" from
// "absent". Feeding it an empty index on stdin exits 0 when present and writes no
// file, which is the check its row declares. The other three answer --version.
const DEP = {
  pandoc: { bin: 'pandoc', args: ['--version'], name: 'pandoc', show: 'pandoc --version' },
  pdflatex: { bin: 'pdflatex', args: ['--version'], name: 'LaTeX (pdflatex)', show: 'pdflatex --version' },
  makeindex: { bin: 'makeindex', args: ['-q'], input: '', name: 'makeindex', show: "printf '' | makeindex -q" },
  gs: { bin: 'gs', args: ['--version'], name: 'Ghostscript (gs)', show: 'gs --version' },
  kpsewhich: { bin: 'kpsewhich', args: ['--version'], name: 'TeX file lookup (kpsewhich)', show: 'kpsewhich --version' }
};

function depPresent(dep) {
  try {
    // Absent dependencies throw ENOENT. stdin is closed (or an empty pipe) so a
    // runtime that reads stdin cannot hang the check.
    const opts = dep.input !== undefined
      ? { input: dep.input, stdio: ['pipe', 'ignore', 'ignore'] }
      : { stdio: 'ignore' };
    execFileSync(dep.bin, dep.args, opts);
    return true;
  } catch {
    return false;
  }
}

function requireDep(key) {
  const dep = DEP[key];
  if (!depPresent(dep)) {
    fail(`Error: missing ${dep.name}; check: ${dep.show}. See the Dependencies section of TOOL.md; the agent derives install steps from the dependency's own documentation, so none are written here.`);
  }
}

// Keep this inventory aligned with templates/print/book.tex. Package presence
// alone is insufficient: sourcesanspro's pdflatex branch also loads LY1 even
// though this template uses T1. The default avoids that package, preserving its
// sans family for thumb tabs through NFSS instead.
function requireTexFiles(config) {
  requireDep('kpsewhich');
  const packages = [
    'geometry', 'fontenc', 'ulem', 'microtype', 'inputenc', 'babel',
    'amssymb', 'xcolor', 'graphicx', 'float', 'placeins', 'caption',
    'longtable', 'booktabs', 'array', 'calc', 'enumitem', 'needspace',
    'fancyhdr', 'titlesec', 'setspace', 'csquotes', 'listings', 'fancyvrb',
    'makeidx', 'eso-pic', 'tikz', 'hyperref', 'url'
  ];
  // Match the selected template branch, including the Type 1 package loaded
  // by libertinus under this tool's pdflatex engine.
  if (config.typography?.font_family === 'libertinus') {
    packages.push('libertinus', 'libertinus-type1', 'newtxmath',
      'iftex', 'ifxetex', 'ifluatex', 'xkeyval', 'textcomp', 'fontaxes',
      'amsmath', 'ifthen', 'etoolbox', 'centernot');
  } else if (config.typography?.font_family === 'source-serif') {
    packages.push('sourceserifpro');
  } else {
    packages.push('lmodern');
  }
  const files = ['book.cls', ...packages.map((name) => `${name}.sty`),
    't1enc.def', 'utf8.def', 'english.ldf',
    'T1SourceSansPro-TLF.fd', 'SourceSansPro-Bold-tlf-t1.tfm',
    'SourceSansPro-Bold.pfb', 'a_emkxm5.enc'];
  if (config.typography?.font_family === 'libertinus') files.push('binhex.tex');
  if (config.contents?.enabled === true) files.push('etoolbox.sty');
  if (Object.keys(config.boxes ?? {}).length) {
    files.push('mdframed.sty', 'md-frame-0.mdf', 'kvoptions.sty', 'xparse.sty',
      'etoolbox.sty', 'zref-abspage.sty', 'zref-base.sty', 'color.sty',
      'keyval.sty', 'ltxcmds.sty', 'kvsetkeys.sty', 'infwarerr.sty',
      'kvdefinekeys.sty', 'pdftexcmds.sty', 'etexcmds.sty', 'auxhook.sty', 'expl3.sty');
  }
  if (config.typography?.url_font === 'sans') {
    for (const shape of ['Regular', 'It', 'BoldIt']) {
      files.push(`SourceSansPro-${shape}-tlf-t1.tfm`, `SourceSansPro-${shape}.pfb`);
    }
  }
  if (config.typography?.quote_font === 'sans') {
    files.push('sourcesanspro.sty', 'ly1enc.def', 'ot1enc.def',
      'ifxetex.sty', 'ifluatex.sty', 'xkeyval.sty');
    // Modern LaTeX incorporates mweights and marks it loaded in the format.
    // On older kernels sourcesanspro instead needs the separate package.
    let builtInWeights = false;
    try {
      const kernel = execFileSync('kpsewhich', ['latex.ltx'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      builtInWeights = readFileSync(kernel, 'utf8').includes('ver@mweights.sty');
    } catch { /* Without the kernel marker, require the package file. */ }
    if (!builtInWeights) files.push('mweights.sty');
    for (const shape of ['Regular', 'It', 'BoldIt']) {
      files.push(`SourceSansPro-${shape}-tlf-t1.tfm`, `SourceSansPro-${shape}.pfb`);
    }
  }
  const missing = files.filter((file) => {
    try {
      return !execFileSync('kpsewhich', [file], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch { return true; }
  });
  if (missing.length) {
    fail(`Error: missing TeX files for this book:\n- ${missing.map((file) => `${file}; check: kpsewhich ${file}`).join('\n- ')}\nSee the Dependencies section of TOOL.md for the required TeX files.`);
  }
}

if (command === 'init') {
  const output = flag('--output');
  if (!output) fail('Error: init requires --output <absolute directory>. Choose where this book project belongs.');
  if (!isAbsolute(output)) fail('Error: --output must be absolute. Pass the full path of the new book project.');
  const target = guardOutside(output, '--output');
  const title = flag('--title') ?? basename(target);
  const author = flag('--author') ?? 'Awaiting its owner.';
  for (const [name, value] of [['--title', title], ['--author', author]]) {
    if (!value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail(`Error: ${name} must be nonempty text on one line. Correct the value, then run init again.`);
  }
  const { initBook } = await import('./init-book.js');
  const result = initBook({ target, title, author, templates: TEMPLATES_DIR });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return;
}

// A survey never installs implicitly, even with saved consent. An explicit
// --install repairs packages and completes this same check invocation.
function dependencySurvey() {
  return {
    pandoc: depPresent(DEP.pandoc), pdflatex: depPresent(DEP.pdflatex),
    makeindex: depPresent(DEP.makeindex), ghostscript: depPresent(DEP.gs),
    yaml: existsSync(dependencyMarker('yaml')),
    pdfjs: existsSync(dependencyMarker('pdfjs-dist'))
  };
}
if (command === 'check' && !argv.includes('--config')) {
  if (flagAuthorised(install)) ensureDependencies(['yaml', 'pdfjs-dist']);
  process.stdout.write(`${JSON.stringify(dependencySurvey())}\n`);
  return;
}

// Configuration file: a functional input, not a credential file. It is required,
// absolute, and read directly; the tool holds no secrets and takes no --env.
const configArgument = flag('--config');

if (!configArgument) {
  fail('Error: --config is required. Pass --config <absolute path to the book config YAML>.');
}
if (!isAbsolute(configArgument)) {
  fail(`Error: --config must be absolute; got "${configArgument}". Pass a full path, not one relative to the current directory.`);
}
// Canonicalized once, and everything below reads this value rather than the
// caller's spelling: every path in the config is resolved against the config
// file's own directory, so a config reached through a symbolic link would
// otherwise resolve its chapters and its outputs against the link rather than
// against where the file really lives.
const configPath = canonical('--config', configArgument);
if (!existsSync(configPath)) {
  fail(`Error: no file at ${configPath}. Check the path.`);
}

const printOnly = argv.includes('--print-only');
const epubOnly = argv.includes('--epub-only');
const draft = argv.includes('--draft');

if (command === 'build' && printOnly && epubOnly) {
  fail('Error: use at most one of --print-only and --epub-only.');
}

// Dependencies (npm), using the same consent and npm ci for every import.
function ensureDependencies(names) {
  if (names.every((name) => existsSync(dependencyMarker(name)))) return;
  if (!installAuthorised(HERE, install)) {
    fail(
      `${installQuestion('the YAML reader and PDF text-extraction libraries', 'typeset and validate your book', INSTALL_SIZE)}\n\nDetails for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches yaml and pdfjs-dist (and their dependencies) from registry.npmjs.org into ${join(TOOL_DIR, 'node_modules')}/, about ${INSTALL_SIZE} on disk (${INSTALL_BYTES} allocated bytes). npm also writes its own cache and logs outside this plugin. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  writeConsent(HERE, 'Book Publisher', install);
  const authorisation = flagAuthorised(install) ? 'this run' : 'saved Wiser consent';
  log(`Installing dependencies with npm ci in ${TOOL_DIR}, authorised by ${authorisation}. ${INSTALL_ONCE}`);
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // stderr only: npm output on stdout would break the empty-stdout-on-failure rule.
    execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 22.13 or newer and that this directory is writable. Check that package-lock.json is present and matches package.json; npm ci requires that lockfile and will not resolve around it. Run "npm ci" in that directory to see npm's own message.`);
  }
  for (const name of names) {
    const marker = dependencyMarker(name);
    if (!existsSync(marker)) {
      fail(`Error: npm ci finished but ${marker} is still missing. Check that package.json lists every package this script imports.`);
    }
  }
}

if (command === 'check' && !flagAuthorised(install) && !existsSync(dependencyMarker('yaml'))) {
  fail('Error: YAML reader missing; run check --config with --install to check this project and its TeX files.');
}
ensureDependencies(command === 'check' && flagAuthorised(install) ? ['yaml', 'pdfjs-dist'] : ['yaml']);

// The package imports only below the check above, and only dynamically. A static
// import would reach yaml before the check and crash instead of installing.
const { parse: parseYaml, stringify: stringifyYaml } = await import('yaml');

let config;
try {
  config = loadConfig(configPath);
} catch (error) {
  // A config that does not parse would otherwise reach the caller as a YAML
  // library stack trace naming this tool's installation path instead of one line
  // naming the cause and the fix (Script Contract, Output and errors). The
  // library's first line carries the line and column; the rest is a source
  // excerpt already visible in the file.
  const detail = error.message.split('\n')[0].replace(/:\s*$/, '');
  fail(`Error: ${configPath} could not be read as YAML: ${detail}. Fix the config, then run the command again.`);
}

const problems = validateConfig(config);
if (!problems.length && config.index?.terms_file !== undefined) {
  try {
    const { loadIndexTerms } = await import('./index-terms.js');
    config._indexTerms = loadIndexTerms(resolve(config._configDir, config.index.terms_file));
  } catch (error) { problems.push(error.message); }
}
if (problems.length > 0) {
  fail(`Error: ${configPath} is not a valid book config:\n- ${problems.join('\n- ')}`);
}

if (command === 'validate' || command === 'check') {
  const { validateBook } = await import('./validate-book.js');
  const checked = validateBook(config, getChapterFiles(config.source._chaptersPath, config.source?.exclude ?? []));
  if (command === 'check') {
    if (config.output._printPath) requireTexFiles(config);
    process.stdout.write(`${JSON.stringify({ ...dependencySurvey(), configChecked: true, ok: checked.errors.length === 0, title: config.title, indexStrategy: checked.strategy, standingFound: checked.standingFound, errors: checked.errors })}\n`);
    return;
  }
  if (checked.errors.length) {
    fail(`Error: book validation failed:\n- ${checked.errors.join('\n- ')}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    title: config.title,
    authors: authorNames(config),
    trim: { width: config.trim.width, height: config.trim.height },
    index: config.index?.enabled !== false,
    indexStrategy: checked.strategy,
    project: checked.projectRoot,
    standingFound: checked.standingFound,
    chapters: checked.chapters
  })}\n`);
  process.exit(0);
}

// build.
const buildPrint = !epubOnly;
const buildEpub = !printOnly;
const includeIndex = !draft && config.index?.enabled !== false;
const twoPass = buildPrint && config.index?.enabled === false && config.index?.extractor != null;
if (buildPrint && !config.output._printPath) fail('Error: print builds require output.print.');
if (buildEpub && !config.output._epubPath) fail('Error: EPUB builds require output.epub.');
if (twoPass) ensureDependencies(['yaml', 'pdfjs-dist']);

// Output directories come from the config, resolved against the config file's
// directory (the caller's book project). A script never writes inside its own
// directory (Script Contract), so refuse an output that resolves in here.
// The screen's answer replaces the config's own value, so the temp directory,
// the PDFs, and the EPUB below are all written to the path that was cleared.
if (buildPrint) config.output._printPath = guardOutside(config.output._printPath, 'output.print');
if (buildEpub) config.output._epubPath = guardOutside(config.output._epubPath, 'output.epub');

// System dependency checks, after help parsing, only for what this build needs.
if (buildPrint) {
  requireDep('pandoc');
  requireDep('pdflatex');
  if (includeIndex) requireDep('makeindex');
  requireDep('gs');
} else if (buildEpub) {
  requireDep('pandoc');
}

const slug = config.slug || config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Single-pass builds reuse source.merged unless --force-merge is supplied.
// Two-pass builds start fresh; the final pass below uses the injected manuscript.
const forceMerge = argv.includes('--force-merge');
const mergedPath = guardOutside(
  config.source?._mergedPath || (twoPass ? join(config.output._printPath, 'temp', `${slug}-merged.md`) : undefined),
  'source.merged'
);
if (twoPass) log('Step 1/5: Merging chapters');
let mergedContent;
// Terms-file builds always read the current chapters. The persistent merge stays
// unmarked; only the disposable print copy gets regenerated index commands.
const indexSections = config._indexTerms ? [] : undefined;
let indexedContent;
try {
  if (mergedPath && existsSync(mergedPath) && !forceMerge && !twoPass && !indexSections) {
    log(`Using merged file: ${config.source.merged}`);
    mergedContent = readFileSync(mergedPath, 'utf8');
  } else {
    log('Merging chapters...');
    mergedContent = mergeChapters(config, indexSections);
    if (mergedPath) {
      mkdirSync(dirname(mergedPath), { recursive: true });
      writeFileSync(mergedPath, mergedContent);
      log(`  Merged manuscript written to ${mergedPath}`);
    }
  }
  if (indexSections && buildPrint) {
    const { indexChapters } = await import('./index-terms.js');
    indexedContent = indexChapters(indexSections, config._indexTerms);
  }
} catch (error) {
  // The merge runs before the build's own try below, so it carries a handler of
  // its own: an uncaught throw here would reach the caller as a stack trace
  // naming this tool's installation path instead of a message naming the cause
  // and the fix (Script Contract, Output and errors).
  fail(`Error: ${error.message}`);
}

// Edition-specific ISBN swap: if the config names a print ISBN and the merged
// content carries an "**ISBN:** ..." line, replace it, so paperback and hardcover
// editions differ by config without editing chapter source.
if (config.isbn?.print) {
  const isbnPattern = /\*\*ISBN:\*\*\s*[\d-]+/;
  if (isbnPattern.test(mergedContent)) {
    mergedContent = mergedContent.replace(isbnPattern, `**ISBN:** ${config.isbn.print}`);
    if (indexedContent !== undefined) indexedContent = indexedContent.replace(isbnPattern, `**ISBN:** ${config.isbn.print}`);
    log(`  ISBN set to ${config.isbn.print}`);
  }
}

const outputs = {};
const createdTempDirs = [];

try {
  if (buildPrint) {
    const printTempDir = join(config.output._printPath, 'temp');
    mkdirSync(printTempDir, { recursive: true });
    createdTempDirs.push(printTempDir);

    if (twoPass) {
      log('Step 2/5: Building first-pass PDF');
      const firstPassDir = join(printTempDir, 'first-pass');
      mkdirSync(firstPassDir, { recursive: true });
      const firstPass = await buildPrintPdf(config, mergedContent, slug, firstPassDir);
      const firstPassAux = join(firstPassDir, `${slug}.aux`);
      log('Step 3/5: Extracting and injecting page numbers');
      // Checked before this dynamic import, including the interrupted-install
      // case where yaml landed but pdfjs-dist did not.
      ensureDependencies(['yaml', 'pdfjs-dist']);
      const { extractPages } = await import('./extract-pages.js');
      await extractPages({
        pdfPath: firstPass.path, auxPath: firstPassAux, mergedPath,
        extractor: config.index.extractor, generatedContents: config.contents?.enabled === true, log
      });
      mergedContent = readFileSync(mergedPath, 'utf8');
      // Keep the edition-specific ISBN replacement in the final pass too.
      if (config.isbn?.print) {
        mergedContent = mergedContent.replace(/\*\*ISBN:\*\*\s*[\d-]+/, `**ISBN:** ${config.isbn.print}`);
      }
      log('Step 4/5: Building final PDF');
    }
    const built = await buildPrintPdf(config, indexedContent ?? mergedContent, slug, printTempDir);

    // The standard PDF is a deliverable in its own right and the PDF/X-1a source.
    const standardPdf = join(config.output._printPath, `${slug}-interior.pdf`);
    copyFileSync(built.path, standardPdf);
    outputs.print_pdf = standardPdf;
    outputs.pages = built.pages;
    try {
      const { auditPrintFonts } = await import('./font-audit.js');
      outputs.print_fonts = await auditPrintFonts(standardPdf, config,
        readFileSync(join(printTempDir, `${slug}.log`), 'utf8'), log);
    } catch (error) {
      // Even loading the audit or reading its log must not gate a print build.
      const message = String(error.message ?? error).replace(/[\r\n]+/g, ' ');
      outputs.print_fonts = { error: message };
      log(`  Warning: print font audit failed: ${message}`);
    }

    const pdfxPdf = join(config.output._printPath, `${slug}-interior-pdfx.pdf`);
    await convertToPdfX(built.path, pdfxPdf, printTempDir);
    outputs.print_pdfx = pdfxPdf;
    outputs.pdfx = checkPdfX(pdfxPdf);
    if (twoPass) {
      log('Step 5/5: Verifying output');
      const pages = countPages(pdfxPdf);
      if (!isCompletePdf(standardPdf) || !pages || pages !== built.pages) {
        throw new Error('final PDF verification failed: incomplete PDF or mismatched page count');
      }
      log(`  Structurally checked PDF/X output: ${pages} pages (not conformance certification)`);
    }
  }

  if (buildEpub) {
    const epubTempDir = join(config.output._epubPath, 'temp');
    mkdirSync(epubTempDir, { recursive: true });
    createdTempDirs.push(epubTempDir);

    const built = await buildEpubFile(config, mergedContent, slug, epubTempDir);
    outputs.epub = built.path;
  }
} catch (error) {
  // Keep the temp directories on failure: their LaTeX and pandoc logs are how a
  // failed build is diagnosed. The message names the failing step, not raw
  // subprocess output (which streamed to stderr already under --verbose).
  fail(`Error: build failed: ${error.message}. Inspect the logs under the temp directory beside the output, or re-run with --verbose.`);
}

// Retain intermediates by default, including the first-pass PDF and AUX.
// --cleanup removes this run's temp directories only after all steps succeed.
if (argv.includes('--cleanup')) {
  for (const dir of createdTempDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify({ ok: true, title: config.title, outputs })}\n`);

// ============================================================================
// CONFIG
// ============================================================================

function loadConfig(path) {
  const config = parseYaml(readFileSync(path, 'utf8')) || {};
  const configDir = dirname(path);
  config._configDir = configDir;

  if (config.source?.chapters) {
    config.source._chaptersPath = resolve(configDir, config.source.chapters);
  }
  if (config.source?.assets) {
    config.source._assetsPath = resolve(configDir, config.source.assets);
  }
  // 0.1.2 never resolved source.merged and always re-merged to a temp file. The
  // two-pass page-number resolution needs a durable merged manuscript: step 3
  // injects page numbers into it and step 4 rebuilds from it.
  if (config.source?.merged) {
    config.source._mergedPath = resolve(configDir, config.source.merged);
  }
  if (config.output?.print) {
    config.output._printPath = resolve(configDir, config.output.print);
  }
  if (config.output?.epub) {
    config.output._epubPath = resolve(configDir, config.output.epub);
  }
  if (config.covers?.ebook) {
    config.covers._ebookPath = resolve(configDir, config.covers.ebook);
  }
  return config;
}

function validateConfig(config) {
  const errors = [];
  if (!config.title) errors.push('missing: title');
  if (!config.authors || config.authors.length === 0) errors.push('missing: authors');
  if (!config.trim?.width || !config.trim?.height) errors.push('missing: trim.width and trim.height');
  if (!config.source?.chapters) errors.push('missing: source.chapters');
  else if (!existsSync(config.source._chaptersPath)) {
    errors.push(`chapters directory not found: ${config.source.chapters}`);
  }
  if (!config.output?.print && !config.output?.epub) {
    errors.push('missing: output.print or output.epub (nowhere to write)');
  }
  if (config.typography?.quote_font !== undefined && !['body', 'sans'].includes(config.typography.quote_font)) {
    errors.push('typography.quote_font must be body or sans');
  }
  if (config.typography?.emergency_stretch !== undefined &&
      (!Number.isFinite(config.typography.emergency_stretch) || config.typography.emergency_stretch < 0 ||
       config.typography.emergency_stretch > 100)) {
    errors.push('typography.emergency_stretch must be a finite number from 0 to 100 em');
  }
  if (config.typography?.tolerance !== undefined &&
      (!Number.isInteger(config.typography.tolerance) || config.typography.tolerance < 0 || config.typography.tolerance > 10000)) {
    errors.push('typography.tolerance must be an integer from 0 to 10000');
  }
  if (config.typography?.url_font !== undefined && !['mono', 'body', 'sans'].includes(config.typography.url_font)) {
    errors.push('typography.url_font must be mono, body or sans');
  }
  if (config.index?.terms_file !== undefined) {
    if (typeof config.index.terms_file !== 'string' || !config.index.terms_file.trim()) {
      errors.push('index.terms_file must be a nonempty file path');
    }
    if (config.index.enabled === false) errors.push('index.terms_file requires the makeindex strategy (index.enabled: true)');
  }
  for (const key of ['contents', 'headings', 'parts']) {
    if (config[key] !== undefined && (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key]))) {
      errors.push(`${key} must be a mapping`);
    }
  }
  if (config.contents?.enabled !== undefined && typeof config.contents.enabled !== 'boolean') {
    errors.push('contents.enabled must be a boolean');
  }
  if (config.contents?.depth !== undefined && (!Number.isInteger(config.contents.depth) || config.contents.depth < 1 || config.contents.depth > 5)) {
    errors.push('contents.depth must be an integer from 1 to 5 (Markdown heading levels)');
  }
  if (config.headings?.numbered !== undefined && typeof config.headings.numbered !== 'boolean') {
    errors.push('headings.numbered must be a boolean');
  }
  if (config.parts?.enabled !== undefined && typeof config.parts.enabled !== 'boolean') {
    errors.push('parts.enabled must be a boolean');
  }
  if (config.parts?.prefix !== undefined && (typeof config.parts.prefix !== 'string' ||
      !config.parts.prefix.trim() || /[\x00-\x1f\x7f]/.test(config.parts.prefix))) {
    errors.push('parts.prefix must be nonempty text on one line');
  }
  if (config.boxes !== undefined) {
    const mapping = (value) => value && typeof value === 'object' && !Array.isArray(value);
    if (!mapping(config.boxes)) errors.push('boxes must be a mapping of fenced-div class names to styles');
    else for (const [name, box] of Object.entries(config.boxes)) {
      const label = `boxes.${name}`;
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
        errors.push(`${label}: class names must start with an ASCII letter and contain only letters, digits, underscores or hyphens`);
      }
      if (!mapping(box)) { errors.push(`${label} must be a mapping (use {} for the default box)`); continue; }
      for (const format of Object.keys(box)) {
        if (!Object.hasOwn(BOX_DEFAULTS, format)) errors.push(`${label}: unknown format ${format}; use print or epub`);
      }
      for (const [format, defaults] of Object.entries(BOX_DEFAULTS)) {
        const style = box[format];
        if (style === undefined) continue;
        if (!mapping(style)) { errors.push(`${label}.${format} must be a mapping`); continue; }
        for (const [key, value] of Object.entries(style)) {
          const field = `${label}.${format}.${key}`;
          if (!Object.hasOwn(defaults, key)) errors.push(`${field}: unknown box style setting`);
          else if (typeof defaults[key] === 'string') {
            if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) errors.push(`${field} must be a quoted six-digit hex color such as "#f2f2f2"`);
          } else if (!Number.isFinite(value) || value < 0 || (key.endsWith('_gray') && value > 1)) {
            errors.push(`${field} must be ${key.endsWith('_gray') ? 'a number from 0 (black) to 1 (white)' : 'a finite nonnegative number'}`);
          }
        }
      }
      const print = { ...BOX_DEFAULTS.print, ...box.print };
      const margins = printMargins(config);
      const textWidth = (config.trim?.width - margins.inner - margins.outer) * 72.27;
      if (Number.isFinite(print.padding) && Number.isFinite(print.border_width) &&
          Number.isFinite(textWidth) && 2 * (print.padding + print.border_width) >= textWidth) {
        errors.push(`${label}.print padding and border_width must leave a positive text width inside the print margins`);
      }
    }
  }
  if (config.margins !== undefined) {
    if (!config.margins || typeof config.margins !== 'object' || Array.isArray(config.margins)) {
      errors.push('margins must be a mapping of top, bottom, outer and inner in inches');
    } else {
      for (const edge of Object.keys(DEFAULT_MARGINS)) {
        const value = config.margins[edge];
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
          errors.push(`margins.${edge} must be a finite nonnegative number in inches`);
        }
      }
    }
  }
  const margins = printMargins(config);
  const layout = printLayout(config);
  const inches = (length) => parseFloat(length) / (length.endsWith('pt') ? 72.27 : 1);
  const minimums = {
    bottom: [inches(layout.footskip), `footer (footskip ${layout.footskip})`],
    top: [inches(layout.headheight) + inches(layout.headsep),
      `header (headheight ${layout.headheight} plus headsep ${layout.headsep}), even on pages without a header`],
    outer: [inches(layout.thumbtabwidth), `thumb tabs (${layout.thumbtabwidth}), reserved for every manuscript`]
  };
  for (const [edge, [minimum, reason]] of Object.entries(minimums)) {
    if (Number.isFinite(margins[edge]) && margins[edge] < minimum) {
      errors.push(`margins.${edge} must be at least ${minimum} inches for the ${reason}`);
    }
  }
  // Test the margins in force, including when the whole mapping is omitted.
  if (Object.values(margins).every(Number.isFinite)) {
    if (config.trim?.width - margins.outer - margins.inner <= 0) {
      errors.push('margins.outer and margins.inner must leave a positive text width within trim.width');
    }
    if (config.trim?.height - margins.top - margins.bottom <= 0) {
      errors.push('margins.top and margins.bottom must leave a positive text height within trim.height');
    }
  }
  return errors;
}

function printMargins(config) {
  return Object.fromEntries(Object.entries(DEFAULT_MARGINS).map(([edge, fallback]) =>
    [edge, config.margins?.[edge] ?? fallback]));
}

// Only configured books receive the filter or metadata; the default build path
// and EPUB's existing image/comment processing remain unchanged.
function boxFilterArgs(config) {
  if (!Object.keys(config.boxes ?? {}).length) return [];
  const boxes = Object.fromEntries(Object.entries(config.boxes).map(([name, box]) =>
    [name, Object.fromEntries(Object.entries(BOX_DEFAULTS).map(([format, defaults]) =>
      [format, { ...defaults, ...box[format] }]))]));
  return ['--lua-filter', join(FILTERS_DIR, 'boxes-filter.lua'),
    '--metadata', `book-boxes=${JSON.stringify(boxes)}`];
}

function authorNames(config) {
  return (config.authors || []).map((a) => (typeof a === 'object' ? a.name : a));
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is built and before any output directory is created.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. An output directory usually does
 * not exist yet, so a path whose leaf is absent is canonicalized through the
 * deepest ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the build lands.
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
 * directory, and the name test alone let a whole book build write into this
 * directory. Device and inode are a directory's own identity, which no spelling
 * reaches, so every existing ancestor of `target` is compared that way as well.
 * An output directory that does not exist yet has no inode of its own, which is
 * why the walk climbs to the deepest ancestor that does: that ancestor is where
 * the build lands.
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

// Returns the canonical path, and the caller assigns it back over the config's
// own value, so every temp directory, PDF, and EPUB below is written to the
// path this cleared rather than to the spelling the config happened to use.
function guardOutside(target, label) {
  if (!target) return target;
  const resolved = canonical(label, target);
  if (insideToolDirectory(resolved)) {
    fail(`Error: ${label} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts write only to a work directory in the owning root; point ${label} at a path outside this directory.`);
  }
  return resolved;
}

// ============================================================================
// MERGE
// ============================================================================

function getChapterFiles(chaptersDir, exclude = []) {
  // Files excluded from the interior. The legacy generation hardcoded this list
  // in the engine, naming this book's covers and four duplicate appendices, which
  // is data about one book living in a tool. It is configuration here:
  // source.exclude, a list of file names, empty by default. Covers are supplied
  // to the print platform separately and are not typeset into the interior.
  const skip = new Set(exclude);
  return readdirSync(chaptersDir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !skip.has(f))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[0], 10) || 0;
      const numB = parseInt(b.split('-')[0], 10) || 0;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
}

function mergeChapters(config, indexSections) {
  const chaptersDir = config.source._chaptersPath;
  const files = getChapterFiles(chaptersDir, config.source?.exclude ?? []);
  if (files.length === 0) {
    throw new Error(`no markdown files found in ${config.source.chapters} (resolved to ${chaptersDir}). Point source.chapters at the directory that holds the chapter .md files.`);
  }
  const sections = files.map((file) => {
    let content = readFileSync(join(chaptersDir, file), 'utf8');
    // Rewrite chapter-relative asset links (../assets/ -> assets/) so they
    // resolve against the merged document's resource path.
    content = content.replace(/!\[([^\]]*)\]\(\.\.\/([^)]+)\)/g, '![$1]($2)');
    content = content.replace(/\[([^\]]+)\]\(\.\.\/([^)]+)\)/g, '[$1]($2)');
    return content.trim();
  });
  if (indexSections) indexSections.push(...sections);
  return sections.join('\n\n');
}

// ============================================================================
// SUBPROCESS
// ============================================================================

function runCommand(cmd, args, cwd, allowNonZero = false) {
  return new Promise((resolveP, rejectP) => {
    // Child output is captured, never inherited: inheriting would let LaTeX write
    // to our stdout and break the one-JSON-object rule. Under --verbose it is
    // forwarded to our stderr instead, decoded per stream: LaTeX echoes typeset
    // text in its font encoding, so a byte that is not UTF-8 becomes U+FFFD.
    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (stream) => {
      const text = new TextDecoder();
      stream.on('data', (data) => { if (verbose) process.stderr.write(text.decode(data, { stream: true })); });
      stream.on('end', () => { if (verbose) process.stderr.write(text.decode()); });
    };
    forward(proc.stdout);
    forward(proc.stderr);
    proc.on('close', (code) => {
      if (code === 0 || allowNonZero) resolveP(code);
      else rejectP(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', (err) => rejectP(new Error(`could not run ${cmd}: ${err.message}`)));
  });
}

// ============================================================================
// PRINT PDF
// ============================================================================

async function buildPrintPdf(config, mergedContent, slug, tempDir) {
  log('Building print PDF...');

  const actualAssets = config.source?._assetsPath || join(resolve(config._configDir, '..'), 'assets');
  const bookDir = resolve(actualAssets, '..');

  // Symlink assets into the temp dir to avoid spaces-in-path issues with LaTeX.
  // The symlink lives inside the caller's output tree, not this tool directory.
  const assetsSymlink = join(tempDir, 'assets');
  try {
    if (existsSync(assetsSymlink)) unlinkSync(assetsSymlink);
    if (existsSync(actualAssets)) symlinkSync(actualAssets, assetsSymlink, 'dir');
  } catch {
    log('  Note: could not create assets symlink, using the resource path directly.');
  }

  const mergedFile = join(tempDir, `${slug}-source.md`);
  writeFileSync(mergedFile, mergedContent);

  const texFile = join(tempDir, `${slug}.tex`);
  const templateFile = join(TEMPLATES_DIR, 'print', 'book.tex');
  const indexFilter = join(FILTERS_DIR, 'index-filter.lua');
  const formatFilter = join(FILTERS_DIR, 'format-filter.lua');
  const margins = printMargins(config);
  const layout = printLayout(config);
  const textWidth = config.trim.width - margins.outer - margins.inner;
  const roundedWidth = textWidth.toFixed(2);
  // Keep the existing metadata where it fits; otherwise retain the precision
  // needed by the image filter to cap its final LaTeX width safely.
  const imageWidth = Number(roundedWidth) > 0 && Number(roundedWidth) <= textWidth ? roundedWidth : String(textWidth);

  const pandocArgs = [
    mergedFile,
    '-o', texFile,
    '--template', templateFile,
    '--lua-filter', formatFilter,
    '--lua-filter', indexFilter,
    '--lua-filter', join(FILTERS_DIR, 'list-width-filter.lua'),
    '--from', 'markdown+smart+autolink_bare_uris-implicit_figures',
    '--to', 'latex',
    '--top-level-division=chapter',
    '--variable', `paperwidth=${config.trim.width}in`,
    '--variable', `paperheight=${config.trim.height}in`,
    '--variable', `margin-top=${margins.top}in`,
    '--variable', `margin-bottom=${margins.bottom}in`,
    '--variable', `margin-outer=${margins.outer}in`,
    '--variable', `margin-inner=${margins.inner}in`,
    ...Object.entries(layout).flatMap(([key, value]) => ['--variable', `layout-${key}=${value}`]),
    '--metadata', `content-width=${imageWidth}`,
    '--resource-path', bookDir
  ];

  if (config.parts?.enabled === true) {
    pandocArgs.push('--lua-filter', join(FILTERS_DIR, 'parts-filter.lua'),
      '--metadata', `parts-prefix=${config.parts.prefix ?? 'Part '}`);
  }
  pandocArgs.push(...boxFilterArgs(config));
  if (Object.keys(config.boxes ?? {}).length) pandocArgs.push('--variable', 'boxed-divs=true');
  if (config.typography?.font_size) {
    pandocArgs.push('--variable', `fontsize=${config.typography.font_size}pt`);
  }
  if (config.typography?.font_family) {
    pandocArgs.push('--variable', 'fontfamily=true');
    // Only the exact strings requireTexFiles checks select a family; any
    // other value, a list included, keeps the template's Latin Modern.
    const family = config.typography.font_family;
    if (family === 'libertinus' || family === 'source-serif') {
      pandocArgs.push('--variable', `fontfamily-${family}=true`);
    }
  }
  pandocArgs.push('--variable', `url-font=${({ mono: 'tt', body: 'same', sans: 'sf' })[config.typography?.url_font ?? 'mono']}`);
  if (config.typography?.quote_font === 'sans') {
    pandocArgs.push('--variable', 'quote-sans=true');
  }
  pandocArgs.push('--variable', `emergency-stretch=${config.typography?.emergency_stretch ?? 3}em`,
    '--variable', `line-tolerance=${config.typography?.tolerance ?? 200}`);
  if (config.typography?.line_spacing) {
    pandocArgs.push('--variable', `linespacing=${config.typography.line_spacing}`);
  }
  if (includeIndex) {
    pandocArgs.push('--variable', 'include-index=true');
  }
  if (config.contents?.enabled === true) {
    pandocArgs.push('--variable', 'print-contents=true', '--metadata', 'print-contents=true',
      '--variable', `print-contents-depth=${(config.contents.depth ?? 1) - 1}`);
  }
  if (config.headings?.numbered === false) {
    pandocArgs.push('--variable', 'unnumbered-headings=true');
  }

  await runCommand('pandoc', pandocArgs, config._configDir);

  const pdflatexArgs = ['-interaction=nonstopmode', `-output-directory=${tempDir}`, texFile];

  if (config.contents?.enabled === true) {
    // The first .toc can grow into several pages on the next pass, moving
    // both chapter references and index terms. Regenerate the index from each
    // changed .idx and stop only once a PDF has consumed unchanged inputs.
    // Keep this opt-in: books without a contents page retain their pass order.
    let previous;
    let indexedInput;
    const readState = (extension) => {
      const file = join(tempDir, `${slug}.${extension}`);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    };
    for (let pass = 1; pass <= 12; pass += 1) {
      log(`  LaTeX contents pass ${pass}...`);
      // Match the default path's tolerance for recoverable TeX errors, but a
      // stale PDF must never count as output from this pass.
      const passPdf = join(tempDir, `${slug}.pdf`);
      if (existsSync(passPdf)) unlinkSync(passPdf);
      await runCommand('pdflatex', pdflatexArgs, tempDir, true);
      if (!isCompletePdf(passPdf)) {
        throw new Error('pdflatex produced no complete PDF on this contents pass; see the .log file in the temp directory');
      }
      const indexInput = readState('idx');
      if (includeIndex && indexInput !== null && indexInput !== indexedInput) {
        log('  Processing index...');
        await runCommand('makeindex', [`${slug}.idx`], tempDir);
        indexedInput = indexInput;
      }
      const state = JSON.stringify(['aux', 'toc', 'idx', 'ind'].map(readState));
      if (state === previous) break;
      if (pass === 12) {
        throw new Error('contents and index references did not stabilize after 12 LaTeX passes; see the retained .aux, .toc and .idx files');
      }
      previous = state;
    }
  } else {
    // pdflatex exits non-zero on warnings (missing images, rerun-needed), so a
    // non-zero exit here is tolerated; a missing PDF below is the real failure.
    log('  LaTeX pass 1...');
    await runCommand('pdflatex', pdflatexArgs, tempDir, true);

    if (includeIndex) {
      const idxFile = join(tempDir, `${slug}.idx`);
      if (existsSync(idxFile)) {
        log('  Processing index...');
        // Pass the basename with cwd set to tempDir: makeindex derives its output
        // path from the input path, and TeX Live's paranoid openout_any refuses an
        // absolute output path. A relative name keeps the write inside the temp dir.
        await runCommand('makeindex', [`${slug}.idx`], tempDir);
        log('  LaTeX pass 2...');
        await runCommand('pdflatex', pdflatexArgs, tempDir, true);
        log('  LaTeX pass 3...');
        await runCommand('pdflatex', pdflatexArgs, tempDir, true);
      }
    }
  }

  const pdf = join(tempDir, `${slug}.pdf`);
  if (!existsSync(pdf)) {
    throw new Error('pdflatex produced no PDF; see the .log file in the temp directory');
  }
  // TeX measures each run in its actual URL face and local line width. Read the
  // final pass's records even without --verbose; engine output alone is hidden.
  const urlFallbacks = join(tempDir, `${slug}.url-fallbacks`);
  if (existsSync(urlFallbacks)) {
    for (const record of readFileSync(urlFallbacks, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const [, line, width, url] = record.match(/^(\d+)\|([^|]+)\|(.*)$/) ?? [];
      if (url) log(`  Warning: URL letter/digit run wider than the whole line (${width}); internal breaks enabled at ${texFile}:${line}: ${url}`);
    }
  }
  return { path: pdf, pages: countPages(pdf) };
}

// Pages in a finished PDF. LaTeX writes the page tree inside a compressed object
// stream, where a scan of the file's bytes matches nothing, so a real book
// reported no count at all. Ghostscript parses the document and answers from the
// page tree itself; it is already required for every print build (Dependencies,
// TOOL.md), so this asks for no new runtime. The byte scan stays behind it for an
// uncompressed PDF, and null is the last resort the output contract allows.
function countPages(pdf) {
  try {
    // -sFile hands the path to Ghostscript as a value, so a path holding spaces
    // or parentheses needs no PostScript escaping; --permit-file-read grants the
    // one read its default sandbox would otherwise refuse.
    const answer = execFileSync('gs', [
      '-q', '-dNODISPLAY', '-dBATCH', '-dNOPAUSE',
      `--permit-file-read=${pdf}`, `-sFile=${pdf}`,
      '-c', 'File (r) file runpdfbegin pdfpagecount = quit'
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const count = Number.parseInt(answer.trim().split(/\s+/).pop(), 10);
    if (Number.isInteger(count) && count > 0) return count;
  } catch {
    // Fall through to the byte scan.
  }
  const scan = readFileSync(pdf).toString('binary').match(/\/Type\s*\/Page[^s]/g);
  return scan ? scan.length : null;
}

// ============================================================================
// PDF/X-1a
// ============================================================================

function findIccProfile() {
  const profiles = [
    '/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc',
    '/System/Library/ColorSync/Profiles/USWebCoatedSWOP.icc',
    '/usr/share/color/icc/ghostscript/default_cmyk.icc',
    '/usr/share/ghostscript/iccprofiles/default_cmyk.icc',
    '/usr/local/share/ghostscript/iccprofiles/default_cmyk.icc',
    '/opt/homebrew/share/ghostscript/iccprofiles/default_cmyk.icc'
  ];
  const profile = profiles.find((p) => existsSync(p));
  if (!profile) {
    throw new Error(`CMYK ICC profile missing; PDF/X requires an embedded output profile. Looked for: ${profiles.join(', ')}. Install one of these CMYK profiles and rebuild`);
  }
  return profile;
}

async function convertToPdfX(inputPdf, outputPdf, tempDir) {
  log('Converting to PDF/X-1a...');
  const iccProfile = findIccProfile();

  // Pre-flatten: remove layers and transparency that a single-pass conversion
  // may preserve. Best-effort; if it fails, the original PDF is used.
  const flattenedPdf = join(tempDir, 'flattened.pdf');
  let pdfInput = inputPdf;
  try {
    await runCommand('gs', [
      '-dBATCH', '-dNOPAUSE', '-dSAFER', '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.3', '-dAutoRotatePages=/None',
      '-dPreserveAnnots=false', '-dPreserveOCProperties=false',
      '-dDetectDuplicateImages=true',
      '-dColorImageResolution=300', '-dGrayImageResolution=300', '-dMonoImageResolution=1200',
      `-sOutputFile=${flattenedPdf}`, inputPdf
    ], tempDir);
    if (existsSync(flattenedPdf)) pdfInput = flattenedPdf;
  } catch (error) {
    log(`  Flatten pass skipped: ${error.message}`);
  }

  const pdfxDef = join(TEMPLATES_DIR, 'pdfx', 'PDFX_def.ps');
  const gsArgs = [
    '-dPDFX', '-dBATCH', '-dNOPAUSE', '-dNOOUTERSAVE',
    '-dCompatibilityLevel=1.3', '-dAutoRotatePages=/None',
    '-sProcessColorModel=DeviceCMYK', '-sColorConversionStrategy=CMYK',
    '-dPDFSETTINGS=/prepress', '-sDEVICE=pdfwrite',
    `-sOutputFile=${outputPdf}`
  ];

  // Use the same profile for conversion and the OutputIntent. A relative name
  // avoids spaces even when tempDir contains them. SAFER needs an explicit read
  // grant: without it Ghostscript can exit 1 after writing a complete PDF.
  const profileName = 'cmyk-profile.icc';
  copyFileSync(iccProfile, join(tempDir, profileName));
  gsArgs.push(
    `--permit-file-read=${profileName}`,
    `-sOutputICCProfile=${profileName}`,
    `-sICCProfile=${profileName}`
  );
  gsArgs.push(pdfxDef, pdfInput);

  await runCommand('gs', gsArgs, tempDir);
  if (!isCompletePdf(outputPdf)) {
    throw new Error('Ghostscript wrote no complete PDF/X-1a; see the Ghostscript output above (re-run with --verbose)');
  }
}

// A complete PDF starts with the version header and ends with an %%EOF trailer.
// Reads only the head and tail so a large book PDF is not loaded whole.
function isCompletePdf(path) {
  if (!existsSync(path)) return false;
  const { size } = statSync(path);
  if (size < 1024) return false;
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(5);
    readSync(fd, head, 0, 5, 0);
    if (head.toString('latin1') !== '%PDF-') return false;
    const tailLen = Math.min(2048, size);
    const tail = Buffer.alloc(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    return tail.toString('latin1').includes('%%EOF');
  } finally {
    closeSync(fd);
  }
}

// ============================================================================
// EPUB
// ============================================================================

async function buildEpubFile(config, mergedContent, slug, tempDir) {
  log('Building EPUB...');
  const { cleanMarkdownForEpub, postProcessEpub } = await import('./epub.js');

  const mergedFile = join(tempDir, `${slug}-source.md`);
  writeFileSync(mergedFile, cleanMarkdownForEpub(mergedContent, config));

  const epubFile = join(config.output._epubPath, `${slug}.epub`);

  const names = authorNames(config);
  const metadata = {
    title: config.title,
    subtitle: config.subtitle || '',
    author: names,
    publisher: config.publisher?.name || '',
    rights: `Copyright ${new Date().getFullYear()} ${names.join(' and ')}`,
    lang: config.language || 'en',
    description: config.description?.short || '',
    subject: config.description?.keywords || [],
    'toc-title': 'Contents'
  };
  const metadataFile = join(tempDir, 'metadata.yaml');
  writeFileSync(metadataFile, stringifyYaml(metadata));

  const pandocArgs = [
    mergedFile,
    '-o', epubFile,
    '--from', 'markdown+smart+autolink_bare_uris',
    '--to', 'epub3',
    '--lua-filter', join(FILTERS_DIR, 'index-filter.lua'),
    // Fold of the book's own EPUB pipeline. 0.1.2 split at level 1 and pointed
    // --resource-path at the config's parent, which produced a four-item spine
    // and carried one image of ninety-five. Level 3 splits at Parts and Chapters,
    // the resource path is the assets directory the chapters actually reference,
    // and the book supplies its own front matter so pandoc's title page is off.
    '--toc', '--toc-depth=3', '--split-level=3',
    '--metadata-file', metadataFile,
    '--css', join(TEMPLATES_DIR, 'epub-styles.css'),
    '--epub-title-page=false',
    // The merge rewrites chapter links from ../assets/x to assets/x, so the
    // resource path is the directory those are relative to, which is the parent
    // of the assets directory, with assets itself listed as well.
    '--resource-path', [resolve(config.source._assetsPath, '..'), config.source._assetsPath].join(':')
  ];
  if (config.covers?._ebookPath && existsSync(config.covers._ebookPath)) {
    pandocArgs.push('--epub-cover-image', config.covers._ebookPath);
  }
  pandocArgs.push(...boxFilterArgs(config));

  await runCommand('pandoc', pandocArgs, config._configDir);
  if (!existsSync(epubFile)) {
    throw new Error('pandoc produced no EPUB');
  }
  postProcessEpub(epubFile, config);
  const sizeMB = (statSync(epubFile).size / (1024 * 1024)).toFixed(2);
  log(`  EPUB: ${epubFile} (${sizeMB} MB)`);
  return { path: epubFile };
}
}

// Importing this entry point must never run a command or exit the caller.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(resolve(process.argv[1])) === HERE) {
  main().catch((error) => fail(`Error: ${error.message}. Check the input paths and permissions, then run the command again.`));
}
