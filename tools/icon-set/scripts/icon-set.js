#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INSTALL_HELP, installQuestion, installAuthorised, writeConsent } from '../../lib/consent.js';
import { SETS, WEIGHTS, assetPath, buildSvg, nearestNames, searchIcons } from './lib/icons.js';
import { parseFlags, readOptions } from './lib/options.js';

const HERE = fileURLToPath(import.meta.url);
const TOOL = resolve(dirname(HERE), '..');
const packageDir = set => join(TOOL, 'node_modules', SETS[set].package);
const INSTALL = 'node scripts/icon-set.js check --install';
const COMMON = `  --install          ${INSTALL_HELP}
                  WISER_ALLOW_INSTALL=1 also authorizes it; tools/RUNNING.md.
  --help, -h      Print usage without dependencies or configuration.`;
const HELP = {
  check: `icon-set check - survey both pinned local packages
Usage: node scripts/icon-set.js check [--install]
Reports missing or incomplete packages without installing; wrong versions fail.
${COMMON}`,
  search: `icon-set search - search names, titles, tags and categories, all query words
Usage: node scripts/icon-set.js search --query <words> [--limit <n>] [--set <phosphor|health>]
  --query <words>  Required, case-insensitive words; quote multiple words.
  --limit <n>      Positive whole number of matches, default 20.
  --set <set>      phosphor (default) or health; local pinned catalog.
${COMMON}`,
  get: `icon-set get - write one recoloured icon
Usage: node scripts/icon-set.js get --name <icon> --weight <weight> --size <n> --output <path>
  [--set <phosphor|health>] [--color <css colour>] [--accent <css colour>]
  [--fragment --x <n> --y <n>] [--class <name>]
  --name <icon>    Required catalog name; use search to find one.
  --set <set>      phosphor (default) or health.
  --weight <w>     Required: phosphor has ${WEIGHTS.join(', ')};
                  health has filled, outline (48px sources only).
  --size <n>       Required positive number, width and height in pixels.
  --output <path>  Required absolute file path outside this tool; must be free.
                  Parent directory must exist; get writes only this file.
  --color <css>    Foreground CSS colour; default currentColor.
  --accent <css>   Phosphor duotone background colour, source opacity removed.
                  Omit to keep --color at its source opacity.
  --fragment      Write one nested svg with aria-hidden instead of a title.
  --x <n>         Required with --fragment; finite horizontal coordinate.
  --y <n>         Required with --fragment; finite vertical coordinate.
  --class <name>  Optional single CSS class on the outer svg.
${COMMON}`
};
const USAGE = `icon-set - Phosphor Icons 2.1.1, MIT; Health Icons 2.0.0, CC0 icons, MIT package
Usage: node scripts/icon-set.js <check|search|get> [options]
       node scripts/icon-set.js <command> help
       node scripts/icon-set.js help
No arguments prints this usage. Success is one JSON object; errors use stderr
and exit 1. Search returns its list in results. No credentials or configuration.

${Object.values(HELP).join('\n\n')}`;

async function packageState(set) {
  const { package: pkg, version, weights, catalog: catalogPath } = SETS[set];
  const base = packageDir(set);
  const manifest = join(base, 'package.json');
  if (!existsSync(manifest)) return { state: 'absent', installed: false, version: null, missing: [] };
  let data;
  try { data = JSON.parse(readFileSync(manifest, 'utf8')); }
  catch { throw new Error(`${pkg}/package.json is unreadable; remove this tool's node_modules and run ${INSTALL}`); }
  if (data.name !== pkg || data.version !== version) {
    throw new Error(`${pkg} must be exactly ${version}; found ${data.version ?? 'no version'} (package ${data.name ?? 'unnamed'}). Remove this tool's node_modules and run ${INSTALL}`);
  }
  const required = [catalogPath, 'LICENSE', ...weights.map(w => assetPath(set === 'health' ? 'people/doctor' : 'person-simple', w, set))];
  const missing = required.filter(p => {
    try { return !statSync(join(base, p)).isFile(); } catch { return true; }
  });
  if (!missing.includes(catalogPath)) {
    try { await catalog(set); } catch { missing.push(catalogPath); }
  }
  if (!missing.includes('LICENSE')) {
    try { licenceLine(set); } catch { missing.push('LICENSE'); }
  }
  if (data.license !== 'MIT') missing.push('package.json (license must be MIT)');
  return { state: missing.length ? 'incomplete' : 'ready', installed: missing.length === 0, version: data.version, missing };
}

async function ensurePackages(install, sets) {
  const states = {};
  for (const set of sets) states[set] = await packageState(set);
  if (sets.every(set => states[set].installed)) return states;
  const missing = sets.find(set => !states[set].installed);
  const { package: pkg, version } = SETS[missing];
  if (!installAuthorised(HERE, install)) {
    throw new Error(`${installQuestion("the Phosphor and Health Icons icon sets", "draw icons into your pictures", '4.7 MB')}\n\nDetails for the assistant: ${pkg}@${version} is ${states[missing].state}. Installing fetches @phosphor-icons/core@2.1.1 and healthicons@2.0.0 from registry.npmjs.org into ${join(TOOL, 'node_modules')} (about 4.7 MB compressed together); npm writes its configured cache and logs outside this plugin. Run ${INSTALL} to authorize the install, or repeat this command with --install; WISER_ALLOW_INSTALL=1 also authorizes it`);
  }
  // npm ci rebuilds both packages: refuse a wrong version of either first.
  for (const set of Object.keys(SETS)) await packageState(set);
  writeConsent(HERE, 'icon-set', install);
  process.stderr.write(`First run: installing dependencies in ${TOOL}.\n`);
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: TOOL, stdio: ['ignore', 'ignore', 'pipe']
    });
  } catch {
    throw new Error(`npm ci failed in ${TOOL}; confirm Node 18 or newer, directory write permission, and that package-lock.json matches package.json, then remove node_modules there and run ${INSTALL}`);
  }
  for (const set of Object.keys(SETS)) {
    states[set] = await packageState(set);
    if (!states[set].installed) throw new Error(`${SETS[set].package}@${SETS[set].version} is still ${states[set].state}; remove this tool's node_modules and run ${INSTALL}`);
  }
  return states;
}

async function catalog(set) {
  const { package: pkg, catalog: catalogPath } = SETS[set];
  const source = join(packageDir(set), catalogPath);
  if (set === 'health') {
    const rows = JSON.parse(readFileSync(source, 'utf8'));
    if (!Array.isArray(rows) || !rows.length || rows.some(icon =>
      typeof icon.id !== 'string' || !/^[A-Za-z0-9_!-]+$/.test(icon.id) ||
      typeof icon.path !== 'string' || !/^[A-Za-z0-9_!-]+\/[A-Za-z0-9_!-]+$/.test(icon.path) ||
      typeof icon.title !== 'string' || !icon.title.trim() || typeof icon.category !== 'string' ||
      !Array.isArray(icon.tags) || icon.tags.some(tag => typeof tag !== 'string') ||
      !Array.isArray(icon.formats) || !icon.formats.includes('48px')) ||
      new Set(rows.map(icon => icon.path)).size !== rows.length) {
      throw new Error(`the ${pkg} catalog is incomplete; remove this tool's node_modules and run ${INSTALL}`);
    }
    return rows.map(({ id, title, category, tags, path }) => ({ name: id, title, category,
      tags: tags.filter(tag => !/^dhis2:/i.test(tag)), path }));
  }
  const { icons } = await import(pathToFileURL(source).href);
  if (!Array.isArray(icons) || !icons.length || icons.some(icon => !/^[a-z0-9-]+$/.test(icon.name) ||
      !Array.isArray(icon.tags) || !Array.isArray(icon.categories) ||
      [...icon.tags, ...icon.categories].some(s => typeof s !== 'string'))) {
    throw new Error(`the ${pkg} catalog is incomplete; remove this tool's node_modules and run ${INSTALL}`);
  }
  return icons;
}

function licenceLine(set) {
  const { package: pkg, version } = SETS[set];
  const licence = readFileSync(join(packageDir(set), 'LICENSE'), 'utf8');
  const copyright = licence.split(/\r?\n/).find(line => /^Copyright \(c\)/.test(line));
  if (!/^MIT License\r?\n/.test(licence) || !copyright) throw new Error(`the ${pkg} licence is unreadable; restore the pinned package with ${INSTALL}`);
  return set === 'health'
    ? `Health Icons ${version}: icons CC0 1.0 (healthicons.org); package MIT License, ${copyright}`
    : `Phosphor Icons ${version}, MIT License, ${copyright}`;
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'help';
  if (['help', '--help', '-h'].includes(command)) {
    if (argv.length > 1) throw new Error(`unexpected argument "${argv[1]}"; run node scripts/icon-set.js help`);
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!Object.hasOwn(HELP, command)) throw new Error(`unknown command "${command}"; run node scripts/icon-set.js help`);
  const args = argv.slice(1);
  if (args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    process.stdout.write(`${HELP[command]}\n`);
    return;
  }
  let flags, options;
  try {
    flags = parseFlags(command, args);
    options = readOptions(command, flags, TOOL);
  } catch (error) { throw new Error(`${error.message}. Run node scripts/icon-set.js ${command} help for usage`); }
  let result;
  if (command === 'check') {
    const states = flags['--install'] === true ? await ensurePackages(true, Object.keys(SETS)) : {};
    const packages = {};
    for (const set of Object.keys(SETS)) {
      const state = states[set] ?? await packageState(set);
      packages[set] = { package: SETS[set].package, requiredVersion: SETS[set].version, ...state,
        ...(state.installed ? {} : { remediation: `Run ${INSTALL}` }) };
    }
    // Retain the original Phosphor fields for existing callers.
    result = { ...packages.phosphor, packages };
  } else {
    const { set } = options;
    await ensurePackages(flags['--install'], [set]);
    const icons = await catalog(set);
    const licence = licenceLine(set);
    if (command === 'search') result = { results: searchIcons(icons, options.query, options.limit, set), license: licence };
    else {
      // A Health name may be `<category>/<id>`, the catalog's own path, which settles an id two categories share.
      const matches = set === 'health' && options.name.includes('/')
        ? icons.filter(entry => entry.path === options.name)
        : icons.filter(entry => entry.name === options.name);
      const icon = matches[0];
      if (!icon) {
        throw new Error(`unknown icon "${options.name}"; nearest names: ${nearestNames(icons, options.name).join(', ')}. Choose one or use search`);
      }
      if (matches.length > 1) {
        throw new Error(`ambiguous health icon "${options.name}" occurs in more than one category; pass --name as one of ${matches.map(entry => entry.path).join(', ')}`);
      }
      const sourcePath = join(packageDir(set), assetPath(set === 'health' ? icon.path : options.name, options.weight, set));
      let source;
      try { source = readFileSync(sourcePath, 'utf8'); }
      catch { throw new Error(`the SVG for ${options.name}/${options.weight} is missing or unreadable; remove this tool's node_modules and run ${INSTALL}`); }
      const { svg, background } = buildSvg(source, options);
      try { writeFileSync(options.output, svg, { flag: 'wx' }); }
      catch { throw new Error(`could not write ${options.output}; choose a free file path in an existing writable directory`); }
      result = { output: options.output, name: options.name, weight: options.weight, size: options.size,
        fragment: options.fragment, color: options.color, background, license: licence };
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error.message.startsWith('This Wiser skill needs to download and install ') ? '' : 'Error: '}${error.message}\n`);
    process.exitCode = 1;
  });
}
