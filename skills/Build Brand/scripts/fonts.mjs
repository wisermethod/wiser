#!/usr/bin/env node
// system/templates/Script Contract.md; user-facing rules: tools/RUNNING.md.
import { createHash } from 'node:crypto';
import { cpSync, createWriteStream, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { INSTALL_SCOPE, installAuthorised, writeConsent } from '../../../tools/lib/consent.js';

const SCRIPT = fileURLToPath(import.meta.url);
const SKILL = resolve(dirname(SCRIPT), '..');
export const INSTALL = 'node scripts/fonts.mjs check --install';
const HELP = `Build Brand fonts: survey, list assets or install pinned open-licence files.
Usage: node scripts/fonts.mjs help
       node scripts/fonts.mjs check [--install] [--from <absolute path>] [--family <name>]...
       node scripts/fonts.mjs assets [--library <absolute parts.json>]
       node scripts/fonts.mjs check help
  --install          Authorise this install. ${INSTALL_SCOPE}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --family <name>    Repeatable parts.json fonts key; check/install only these
                     families, including their licences. Omit for the whole pack.
  --from <path>      Request installation from an absolute local pack tar, or a
                     directory of asset-named files with --family, instead of
                     HTTPS; requires --install, WISER_ALLOW_INSTALL=1 or consent.
  --library <file>   Absolute parts.json; default: this skill's parts/parts.json.
  --directory <dir>  Absolute install directory; default: fonts/ beside library.
                     These two overrides also support isolated test libraries.
  --help, -h         Print usage without opening files or reading consent.
A plain check surveys, even with consent or WISER_ALLOW_INSTALL=1. It writes
nothing and returns one JSON object, exit 0, with installed, missing and changed.
With --family it also names the families, and fetches only their individual release
assets. Without --family an install fetches the whole pack (about 4.5 MB).
assets prints a JSON array in parts.json order: asset, path, sha256 and bytes.
Asset names drop fonts/, replace / with -- and each space with _.
Installs verify sizes and hashes before writing fonts/; consent follows
tools/RUNNING.md. HTTPS uses OS-temp files removed at the end. No packages, credentials or
configuration are needed. assets writes nothing and never reads consent.
Failure: stderr only, exit 1, with the cause and fix. See tools/RUNNING.md.`;
const hash = data => createHash('sha256').update(data).digest('hex');
const own = (object, key) => Object.hasOwn(object, key);
const stop = message => { throw new Error(`${message}. See node scripts/fonts.mjs help`); };

// Resolve even a not-yet-created destination; never open a protected source.
function screened(candidate, flag) {
  if (typeof candidate !== 'string' || !isAbsolute(candidate) || candidate.includes('\0')) stop(`${flag} requires an absolute path`);
  let head = candidate; const tail = [];
  for (;;) {
    try { lstatSync(head); head = join(realpathSync(head), ...tail); break; }
    catch (error) {
      if (error.code !== 'ENOENT') stop(`${flag} cannot resolve path; repair links or permissions`);
      try { lstatSync(head); stop(`${flag} has a broken symbolic link`); }
      catch (probe) { if (probe.code !== 'ENOENT') throw probe; }
      const parent = dirname(head);
      if (parent === head) stop(`${flag} cannot resolve path`);
      tail.unshift(basename(head)); head = parent;
    }
  }
  if (head.split(sep).some(part => part === 'memory' || /^\.env(?:\.|$)/i.test(part))) stop(`${flag} is a protected path`);
  return head;
}

function memberPath(path) {
  if (typeof path !== 'string' || !path || /[\\:\x00-\x1f]/.test(path) || isAbsolute(path) || path.split('/').some(p => !p || p === '.' || p === '..')) stop(`unsafe pack member path ${JSON.stringify(path)}`);
  return path;
}
function fingerprint(file, at) {
  if (!/^[a-f0-9]{64}$/.test(file?.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) stop(`${at} needs sha256 and bytes in parts.json`);
  return file;
}
export function assetName(path) {
  if (typeof path !== 'string' || !path.startsWith('fonts/')) stop('asset path must be relative to parts/fonts/');
  return memberPath(path.slice(6)).replaceAll('/', '--').replaceAll(' ', '_');
}
export function members(library, families) {
  const expected = new Map();
  const add = (path, entry) => {
    if (typeof path !== 'string' || !path.startsWith('fonts/')) stop('parts.json files must be relative to parts/fonts/');
    const name = memberPath(path.slice(6));
    if (expected.has(name)) stop(`duplicate parts.json member ${name}`);
    expected.set(name, { path, ...fingerprint(entry, name) });
  };
  if (!library.fonts || typeof library.fonts !== 'object' || Array.isArray(library.fonts)) stop('parts.json needs fonts');
  for (const family of families || Object.keys(library.fonts)) {
    if (!own(library.fonts, family)) stop(`unknown family ${JSON.stringify(family)}; use a key of parts.json fonts`);
    const font = library.fonts[family];
    if (!Array.isArray(font.files) || !font.files.length) stop('parts.json needs font files');
    for (const file of font.files) add(file.path, { sha256: file.sha256, bytes: file.bytes });
    add(font.licenceFile, { sha256: font.licenceSha256, bytes: font.licenceBytes });
  }
  if (!expected.size) stop('parts.json names no font pack members');
  return expected;
}
function assets(expected) {
  const names = new Set();
  return [...expected.values()].map(({ path, sha256, bytes }) => {
    const asset = assetName(path);
    if (names.has(asset)) stop(`duplicate release asset name ${asset}; use distinct member paths`);
    names.add(asset);
    return { asset, path, sha256, bytes };
  });
}

// Do not canonicalize a caller's destination link into permission to write there.
function safeDirectory(directory) {
  for (let path = directory; ; path = dirname(path)) {
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isDirectory()) stop(`unsafe install destination ${path}; remove the link or conflicting entry`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(path) === path) break;
  }
}

// Existing links within fonts/ are never followed, for either checking or writing.
function safeTarget(directory, name) {
  let path = directory;
  const parts = name.split('/');
  for (let i = 0; i <= parts.length; i++) {
    if (i) path = join(path, parts[i - 1]);
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || (i < parts.length ? !info.isDirectory() : !info.isFile())) stop(`unsafe install destination ${path}; remove the link or conflicting entry`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return path;
}
export function checkPack(library, directory = join(SKILL, 'parts/fonts'), families) {
  const missing = [], changed = [];
  for (const [name, entry] of members(library, families)) {
    try {
      const data = readFileSync(safeTarget(directory, name));
      if (data.length !== entry.bytes || hash(data) !== entry.sha256) changed.push(entry.path);
    } catch (error) {
      (error.code === 'ENOENT' ? missing : changed).push(entry.path);
    }
  }
  return { installed: !missing.length && !changed.length, missing, changed };
}

function octal(header, start, length) {
  const value = header.toString('ascii', start, start + length).replace(/\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(value)) stop('invalid tar numeric field; use the pinned pack');
  const result = parseInt(value, 8);
  if (!Number.isSafeInteger(result)) stop('tar size is too large');
  return result;
}
// Deliberately support only regular ustar files, not links or metadata extensions.
export function readTar(data, expected) {
  const files = new Map(); let offset = 0, ended = false;
  if (data.length % 512) stop('truncated tar; use the pinned pack');
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (offset + 1024 > data.length || !data.subarray(offset).every(byte => byte === 0)) stop('invalid tar end blocks');
      ended = true; break;
    }
    const checksum = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (checksum !== octal(header, 148, 8)) stop('tar header checksum differs');
    const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/s, '');
    const magic = field(257, 6);
    if (magic && magic !== 'ustar' && magic !== 'ustar ') stop('unsupported tar format; use the pinned pack');
    const prefix = magic ? field(345, 155) : '';
    const name = memberPath((prefix ? `${prefix}/` : '') + field(0, 100));
    if (header[156] !== 0 && header[156] !== 48) stop(`pack member ${name} is not a regular file`);
    if (!expected.has(name)) stop(`pack member ${name} is not named in parts.json`);
    if (files.has(name)) stop(`duplicate pack member ${name}`);
    const size = octal(header, 124, 12), entry = expected.get(name);
    const end = offset + 512 + size;
    if (end > data.length || size !== entry.bytes) stop(`pack member ${name} size differs`);
    const bytes = data.subarray(offset + 512, end);
    if (hash(bytes) !== entry.sha256) stop(`pack member ${name} sha256 differs`);
    files.set(name, bytes);
    offset = Math.ceil(end / 512) * 512;
  }
  if (!ended) stop('tar end blocks are missing');
  if (files.size !== expected.size) stop('tar is missing members named in parts.json');
  return files;
}

async function download(url, destination, limit, redirects = 0) {
  if (url.protocol !== 'https:') stop('fontPack.url and redirects must use https');
  const response = await new Promise((accept, reject) => {
    const request = get(url, accept);
    request.setTimeout(30000, () => request.destroy(new Error('HTTPS download timed out; retry the install')));
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.resume();
    if (redirects >= 5 || !response.headers.location) stop('font pack redirect limit (five) or missing Location; retry with --from');
    return download(new URL(response.headers.location, url), destination, limit, redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.resume(); stop(`HTTPS ${response.statusCode} from ${url.origin}${url.pathname}; retry or use --from`);
  }
  let received = 0;
  const bound = new Transform({ transform(chunk, encoding, done) {
    received += chunk.length;
    done(received > limit ? new Error('font pack size exceeds parts.json; use the pinned pack') : null, chunk);
  } });
  await pipeline(response, bound, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

async function install(library, directory, from, authorised) {
  const pack = fingerprint(library.fontPack, 'fontPack'), expected = members(library);
  let url;
  try { url = new URL(pack.url); } catch { stop('fontPack.url is invalid'); }
  if (url.protocol !== 'https:' || !pack.name) stop('fontPack needs a name and https URL');
  if (!installAuthorised(SCRIPT, authorised)) stop(`${INSTALL_SCOPE} Installing ${pack.name} fetches ${pack.bytes} bytes (about ${(pack.bytes / 1e6).toFixed(1)} MB) from ${url.hostname} (${pack.url}; GitHub redirects to release-assets.githubusercontent.com)${from ? `, using local copy ${from}` : ''} into ${directory}. Run ${INSTALL} to authorize it; WISER_ALLOW_INSTALL=1 or valid person or matching copy consent also authorizes it`);
  // All options and metadata have been checked before consent or temp writes.
  writeConsent(SCRIPT, 'Build Brand fonts', authorised);
  process.stderr.write(`First run: installing dependencies (${pack.name}) in ${directory}.\n`);
  const temp = mkdtempSync(join(tmpdir(), 'wiser-brand-fonts-'));
  try {
    const archive = from || join(temp, 'fonts.tar');
    if (!from) await download(url, archive, pack.bytes);
    if (!statSync(archive).isFile() || statSync(archive).size !== pack.bytes) stop('font pack size differs from parts.json; use the pinned pack');
    const data = readFileSync(archive);
    if (hash(data) !== pack.sha256) stop('font pack sha256 differs from parts.json; use the pinned pack');
    const files = readTar(data, expected);
    stageFamilies(directory, files);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function installFamilies(library, directory, from, authorised, families) {
  const expected = members(library, families), files = assets(expected);
  let base;
  try { base = new URL('.', library.fontPack.url); } catch { stop('fontPack.url is invalid'); }
  if (base.protocol !== 'https:') stop('fontPack.url and redirects must use https');
  for (const name of expected.keys()) safeTarget(directory, name);
  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  if (!installAuthorised(SCRIPT, authorised)) stop(`${INSTALL_SCOPE} Installing families ${families.join(', ')} fetches ${bytes} bytes from ${base.hostname} (${base.href}; GitHub redirects to release-assets.githubusercontent.com)${from ? `, using local assets ${from}` : ''} into ${directory}. Run ${INSTALL} with --family to authorize it; WISER_ALLOW_INSTALL=1 or valid person or matching copy consent also authorizes it`);
  // The simple path fetches families without asking, so this fetch records no consent.
  process.stderr.write(`First run: installing dependencies (${families.join(', ')}) in ${directory}.\n`);
  const temp = mkdtempSync(join(tmpdir(), 'wiser-brand-fonts-')), verified = new Map();
  try {
    for (const entry of files) {
      const file = from ? screened(join(from, entry.asset), '--from asset') : join(temp, entry.asset);
      if (!from) await download(new URL(encodeURIComponent(entry.asset), base), file, entry.bytes);
      let info;
      try { info = statSync(file); } catch { stop(`asset ${entry.asset} is missing or unreadable; supply every family member`); }
      if (!info.isFile()) stop(`asset ${entry.asset} is not a regular file`);
      if (info.size !== entry.bytes) stop(`asset ${entry.asset} size differs from parts.json; use the pinned file`);
      const data = readFileSync(file);
      if (data.length !== entry.bytes) stop(`asset ${entry.asset} size differs from parts.json; use the pinned file`);
      if (hash(data) !== entry.sha256) stop(`asset ${entry.asset} sha256 differs from parts.json; use the pinned file`);
      verified.set(entry.path.slice(6), data);
    }
    stageFamilies(directory, verified);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function stageFamilies(directory, verified) {
  const swaps = [];
  let stage, createdDirectory, installed = false, retainStage = false;
  try {
    // Validate every requested member before creating any install directory or file.
    safeDirectory(directory);
    for (const name of verified.keys()) safeTarget(directory, name);
    createdDirectory = mkdirSync(directory, { recursive: true });
    stage = mkdtempSync(join(directory, '.install-'));
    const next = join(stage, 'next'), previous = join(stage, 'previous');
    mkdirSync(next); mkdirSync(previous);
    // Stage complete top-level family directories beside their destinations.
    // Preserve unlisted existing entries; originals stay untouched until publish.
    for (const name of new Set([...verified.keys()].map(name => name.split('/')[0]))) {
      const target = join(directory, name), replacement = join(next, name);
      let existed = true;
      try { lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; existed = false; }
      if (existed) cpSync(target, replacement, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
      swaps.push({ target, replacement, backup: join(previous, name), existed, moved: false, published: false });
    }
    for (const [name, data] of verified) {
      const target = safeTarget(next, name); mkdirSync(dirname(target), { recursive: true });
      rmSync(target, { force: true });
      writeFileSync(target, data, { flag: 'wx', mode: 0o644 });
    }
    safeDirectory(directory);
    for (const name of verified.keys()) safeTarget(directory, name);
    for (const swap of swaps) {
      if (swap.existed) { renameSync(swap.target, swap.backup); swap.moved = true; }
      renameSync(swap.replacement, swap.target); swap.published = true;
    }
    installed = true;
  } catch (error) {
    try {
      for (const swap of [...swaps].reverse()) {
        if (swap.published) rmSync(swap.target, { recursive: true, force: true });
        if (swap.moved) renameSync(swap.backup, swap.target);
      }
    } catch (rollback) {
      // Never erase the originals if the filesystem also refuses their restore.
      retainStage = true;
      throw new Error(`${error.message}; rollback failed: ${rollback.message}; recover originals from ${stage}`);
    }
    throw error;
  } finally {
    if (stage && !retainStage) rmSync(stage, { recursive: true, force: true });
    if (createdDirectory && !installed && !retainStage) {
      for (let path = directory; ; path = dirname(path)) {
        rmdirSync(path);
        if (path === createdDirectory) break;
      }
    }
  }
}

export async function run(argv) {
  if (!argv.length || (argv.length === 1 && ['help', '--help', '-h'].includes(argv[0])) || (argv.length === 2 && ['check', 'assets'].includes(argv[0]) && ['help', '--help', '-h'].includes(argv[1]))) return HELP;
  const command = argv[0];
  if (!['check', 'assets'].includes(command)) stop(`unknown command ${JSON.stringify(command)}`);
  const options = {};
  const flags = command === 'check' ? ['--install', '--from', '--library', '--directory', '--family'] : ['--library'];
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (!flags.includes(flag)) stop(`unknown option ${flag}`);
    if (flag !== '--family' && own(options, flag)) stop(`duplicate option ${flag}`);
    if (flag === '--install') options[flag] = true;
    else {
      const value = argv[++i];
      if (flag === '--family') {
        if (!value || value.startsWith('--')) stop('--family requires a family name');
        (options[flag] ||= []).push(value); continue;
      }
      if (!value || !isAbsolute(value)) stop(`${flag} requires an absolute path`);
      options[flag] = value;
    }
  }
  const libraryPath = screened(options['--library'] || join(SKILL, 'parts/parts.json'), '--library');
  let library;
  try { library = JSON.parse(readFileSync(libraryPath, 'utf8')); }
  catch { stop('--library is unreadable or invalid JSON; use a valid parts.json'); }
  if (command === 'assets') return assets(members(library));
  const families = options['--family'] ? [...new Set(options['--family'])] : undefined;
  if (families) members(library, families); // Unknown families fail before any install side effect.
  const defaultDirectory = join(dirname(libraryPath), 'fonts');
  if (families) safeDirectory(options['--directory'] || defaultDirectory);
  const directory = screened(options['--directory'] || defaultDirectory, '--directory');
  if (!options['--directory'] && directory !== defaultDirectory) stop('parts/fonts resolves outside its library; remove the directory link');
  const from = options['--from'] ? screened(options['--from'], '--from') : null;
  if (from) {
    if (families) {
      try { if (!statSync(from).isDirectory()) stop('--from needs an asset directory with --family'); }
      catch { stop('--from needs a readable asset directory with --family'); }
    } else {
      try { if (!statSync(from).isFile()) stop('--from needs a regular pack file'); }
      catch { stop('--from needs a readable regular pack file; supply the pinned local archive'); }
    }
  }
  let state = checkPack(library, directory, families);
  if (!state.installed && (options['--install'] || from)) {
    if (families) await installFamilies(library, directory, from, options['--install'] === true, families);
    else await install(library, directory, from, options['--install'] === true);
    state = checkPack(library, directory, families);
    if (!state.installed) stop(`font pack is still incomplete; run ${INSTALL}`);
  }
  return { pack: library.fontPack?.name, directory, ...(families ? { families } : {}), ...state, ...(state.installed ? {} : { remediation: INSTALL }) };
}
export async function main(argv = process.argv.slice(2)) {
  try { const result = await run(argv); process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result)}\n`); }
  catch (error) { process.stderr.write(`Error: ${error.message}\nRetry with the pinned pack and writable paths; see node scripts/fonts.mjs help.\n`); process.exitCode = 1; }
}
if (process.argv[1] && realpathSync(process.argv[1]) === SCRIPT) await main();
