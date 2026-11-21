import {
  linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INSTALL_HELP, installAuthorised, installQuestion, writeConsent } from '../../lib/consent.js';
import { FILTER_TYPES, MAX_PACKAGE_BYTES, runWordDocument } from './word-document-core.js';

const ENTRY = fileURLToPath(import.meta.url);
const TOOL_DIR = realpathSync.native(dirname(dirname(ENTRY)));
const TOOL_ID = statSync(TOOL_DIR, { bigint: true });
const PACKAGES = {
  '@xmldom/xmldom': '0.8.13', fflate: '0.8.3', pend: '1.2.0', saxes: '6.0.0', xmlchars: '2.2.0', yauzl: '3.4.0',
};
const HINT = 'Run "node scripts/word-document.js help" for usage.';
const COMMANDS = {
  create: {
    syntax: 'create --output <docx> [--input <json> | [--title <title>] [--text <body>]]',
    description: 'Create a Word document from JSON, inline text, or an empty page.',
    flags: ['output', 'input', 'title', 'text'],
  },
  'list-changes': {
    syntax: 'list-changes --input <docx>',
    description: 'List pending main-document revisions and their selection IDs.',
    flags: ['input'],
  },
  'add-change': {
    syntax: 'add-change --input <docx> --output <docx> --type <type> --text <text> --author <name> [--position <offset>] [--format <style>]',
    description: 'Add a tracked insertion, deletion, or run formatting change.',
    flags: ['input', 'output', 'type', 'text', 'author', 'position', 'format'],
  },
  'apply-change': {
    syntax: 'apply-change --input <docx> --change-id <id> [--confirm <token> --output <docx>]',
    description: 'Preview or accept the named revision.',
    flags: ['input', 'change-id', 'confirm', 'output'],
  },
  'reject-change': {
    syntax: 'reject-change --input <docx> --change-id <id> [--confirm <token> --output <docx>]',
    description: 'Preview or reject the named revision.',
    flags: ['input', 'change-id', 'confirm', 'output'],
  },
  'apply-all': {
    syntax: 'apply-all --input <docx> [--filter-author <name>] [--filter-type <type>] [--confirm <token> --output <docx>]',
    description: 'Preview or accept a batch of revisions, optionally filtered by exact author and case-insensitive type.',
    flags: ['input', 'filter-author', 'filter-type', 'confirm', 'output'],
  },
  'list-comments': {
    syntax: 'list-comments --input <docx>',
    description: 'List comments, their authors, and the text in their anchors.',
    flags: ['input'],
  },
  'add-comment': {
    syntax: 'add-comment --input <docx> --output <docx> --text <comment> --author <name> [--initials <letters>] [--position <offset>] [--length <count>]',
    description: 'Add a comment at a point or around a text range.',
    flags: ['input', 'output', 'text', 'author', 'initials', 'position', 'length'],
  },
};
const REVIEW_COMMANDS = new Set(['apply-change', 'reject-change', 'apply-all']);

function help(command) {
  const commands = command ? [COMMANDS[command]] : Object.values(COMMANDS);
  return [
    'Usage: node scripts/word-document.js <command> [options]',
    '       node scripts/word-document.js help [command]',
    '',
    ...commands.flatMap(({ syntax, description }) => [`  ${syntax}`, `    ${description}`]),
    '',
    '--install   ' + INSTALL_HELP,
    '--help, -h  Print usage. -o is an alias for --output on commands that write.',
    '',
    '--input and --output take absolute paths. Every output is a fresh .docx.',
    '--position and --length count Unicode code points. Paragraphs are separated by one line break.',
    '--author is required for new revisions and comments. --initials defaults to the first letters of up to three author words.',
    '--type accepts insertion, deletion or formatting. Formatting requires --format bold, italic or underline.',
    '--filter-type accepts ' + FILTER_TYPES.join(', ') + '.',
    'For apply or reject, run without --confirm and --output, show every returned change to the person,',
    'then use that run’s --confirm token and a fresh --output only after their explicit approval.',
    'Run help with no command to see all flags.',
  ].join('\n');
}

function usage(message) {
  throw new Error(`${message} ${HINT}`);
}

function natural(value, flag, minimum = 0) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
    usage(`${flag} must be a whole number of at least ${minimum}.`);
  }
  return Number(value);
}

function parse(argv) {
  let [command, ...rest] = argv;
  let showHelp = command === 'help' || command === '--help' || command === '-h' || command === undefined;
  if (showHelp) {
    command = rest.shift();
    if (command !== undefined && !Object.hasOwn(COMMANDS, command)) {
      usage(`${command.startsWith('-') ? 'Unknown option' : 'Unknown command'} ${command}.`);
    }
  }
  const spec = COMMANDS[command];
  if (!showHelp && !Object.hasOwn(COMMANDS, command)) {
    usage(`${command.startsWith('-') ? 'Unknown option' : 'Unknown command'} ${command}.`);
  }

  const args = Object.create(null);
  const seen = new Set();
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    const equal = token.indexOf('=');
    const name = equal < 0 ? token : token.slice(0, equal);
    const key = { '-o': 'output', '-h': 'help' }[name] ?? name.slice(2);
    const single = name === '--install' || name === '--help' || name === '-h';
    const valueFlag = (name.startsWith('--') || name === '-o') && spec?.flags.includes(key);
    if ((!single && !valueFlag) || (single && equal >= 0)) usage(`Unknown option ${token}.`);
    if (seen.has(key)) usage(`Repeated option ${name}.`);
    seen.add(key);
    if (key === 'help' && single) showHelp = true;
    else if (single) args.install = true;
    else {
      const value = equal < 0 ? rest[++index] : token.slice(equal + 1);
      if (value === undefined) usage(`${name} needs a value.`);
      if (equal < 0 && value.startsWith('-')) {
        usage(`${name} needs a value before ${value}. For text beginning with a dash, use ${name}=<value>.`);
      }
      args[key] = value;
    }
  }
  if (showHelp) return { help: command };
  if (command !== 'create' && !args.input) usage('--input is required.');
  if (['create', 'add-change', 'add-comment'].includes(command) && !args.output) usage('--output is required.');
  if (command === 'create' && args.input !== undefined &&
      (!args.input || args.title !== undefined || args.text !== undefined)) {
    usage('Use --input with a JSON path, or use --title and --text.');
  }
  if (['add-change', 'add-comment'].includes(command)) {
    if (!args.text) usage('--text is required.');
    if (!args.author?.trim()) usage('--author is required. Supply a nonblank author name.');
  }
  if (command === 'add-change') {
    if (!['insertion', 'deletion', 'formatting'].includes(args.type)) {
      usage('--type must be insertion, deletion or formatting.');
    }
    if (args.type === 'formatting' ? !['bold', 'italic', 'underline'].includes(args.format) : args.format !== undefined) {
      usage('Use --format bold, italic or underline with --type formatting only.');
    }
  }
  if (REVIEW_COMMANDS.has(command)) {
    if (command !== 'apply-all') args.changeId = natural(args['change-id'], '--change-id', 1);
    if ((args.confirm === undefined) !== (args.output === undefined) ||
        (args.confirm !== undefined && !/^[0-9a-f]{64}$/.test(args.confirm)) ||
        args.output === '') {
      usage('Preview without --confirm and --output. After explicit approval, pass the preview token with --confirm and a fresh --output.');
    }
    args.filterAuthor = args['filter-author'];
    args.filterType = args['filter-type']?.toLowerCase();
    if (args.filterType !== undefined && !FILTER_TYPES.includes(args.filterType)) usage('Unknown --filter-type.');
  }
  for (const flag of ['position', 'length']) {
    if (args[flag] !== undefined) args[flag] = natural(args[flag], `--${flag}`);
  }
  return { command, args };
}

function canonical(flag, value) {
  if (!isAbsolute(value) || value.includes('\0')) usage(`${flag} needs an absolute path.`);
  let head = value;
  const missing = [];
  for (;;) {
    try {
      lstatSync(head);
    } catch (error) {
      const parent = dirname(head);
      if (error.code !== 'ENOENT' || parent === head) {
        throw new Error(`Cannot resolve ${flag}. Check the path and its parents.`);
      }
      missing.unshift(basename(head));
      head = parent;
      continue;
    }
    try {
      if (missing.includes('..')) throw new Error();
      return join(realpathSync.native(head), ...missing);
    } catch {
      throw new Error(`Cannot resolve ${flag}. Repair any broken or looping symlink and check its parents.`);
    }
  }
}

function requireExtension(path, ext, flag) {
  if (extname(path).toLowerCase() !== ext) usage(`${flag} must resolve to a ${ext} path.`);
}

function inputPath(value, extension) {
  const path = canonical('--input', value);
  requireExtension(path, extension, '--input');
  let info;
  try { info = statSync(path); } catch {
    throw new Error('Cannot read --input. Pass an existing readable file.');
  }
  if (!info.isFile() || info.size > MAX_PACKAGE_BYTES) {
    throw new Error('--input must be a readable file of at most 256 MiB. Pass a smaller valid file.');
  }
  return path;
}

function outputPath(value, allowNewParents) {
  const path = canonical('--output', value);
  requireExtension(path, '.docx', '--output');
  try {
    lstatSync(path);
    throw new Error('--output already exists. Choose a fresh filename.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let parent = dirname(path);
  for (;;) {
    let info;
    try {
      info = statSync(parent, { bigint: true });
    } catch (error) {
      if (error.code !== 'ENOENT' || !allowNewParents || parent === dirname(parent)) {
        throw new Error('Cannot access the --output directory. Choose a writable working directory.');
      }
      parent = dirname(parent);
      continue;
    }
    if (!info.isDirectory()) throw new Error('--output parent is not a directory. Choose a working directory.');
    if (info.dev === TOOL_ID.dev && info.ino === TOOL_ID.ino) {
      throw new Error('--output resolves inside this tool. Choose a working directory outside the tool.');
    }
    if (parent === dirname(parent)) break;
    parent = dirname(parent);
  }
  return path;
}

function hasPackage(name, version) {
  try {
    return JSON.parse(readFileSync(join(TOOL_DIR, 'node_modules', name, 'package.json'), 'utf8')).version === version;
  } catch {
    return false;
  }
}

async function loadCodec(install) {
  if (!Object.entries(PACKAGES).every(([name, version]) => hasPackage(name, version))) {
    const packages = Object.entries(PACKAGES).map(([name, version]) => `${name}@${version}`).join(', ');
    if (!installAuthorised(ENTRY, install)) {
      const question = installQuestion('the pinned Word XML and ZIP packages', 'read and write Word documents');
      throw new Error(`${question}\nMissing packages: ${packages} from registry.npmjs.org into ${join(TOOL_DIR, 'node_modules')}. On approval, rerun with --install or WISER_ALLOW_INSTALL=1.`);
    }
    writeConsent(ENTRY, 'word-document', install);
    process.stderr.write(`First run: installing dependencies into ${join(TOOL_DIR, 'node_modules')}\n`);
    const npm = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: TOOL_DIR, encoding: 'utf8', shell: process.platform === 'win32',
    });
    if (npm.error) {
      throw new Error(`Could not start npm (${npm.error.code ?? 'spawn failed'}). Check that npm is on PATH and retry.`);
    }
    if (npm.status !== 0) {
      const code = npm.stderr?.match(/^npm (?:ERR!|error) code ([A-Z0-9_]+)\s*$/m)?.[1];
      throw new Error(`npm ci failed (${code ?? (npm.signal || `exit ${npm.status}`)}). Check npm, its local cache or registry.npmjs.org access, and write permission for the tool directory, then retry.`);
    }
    if (!Object.entries(PACKAGES).every(([name, version]) => hasPackage(name, version))) {
      throw new Error('npm ci finished with pinned packages missing. Check the install location and rerun with the shipped package lock.');
    }
  }
  try {
    const [{ DOMParser, XMLSerializer }, { zipSync }, { SaxesParser }, { default: yauzl }] = await Promise.all([
      import('@xmldom/xmldom'), import('fflate'), import('saxes'), import('yauzl'),
    ]);
    async function* zipEntries(bytes) {
      const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const zip = await yauzl.fromBufferPromise(buffer, {
        lazyEntries: true, strictFileNames: true, validateEntrySizes: true,
      });
      try {
        for await (const entry of zip.eachEntry()) {
          yield {
            name: entry.fileName, size: entry.uncompressedSize, crc: entry.crc32, encrypted: entry.isEncrypted(),
            async read() {
              const chunks = [];
              const stream = await zip.openReadStreamPromise(entry);
              for await (const chunk of stream) chunks.push(chunk);
              return Buffer.concat(chunks);
            },
          };
        }
      } finally {
        zip.close();
      }
    }
    return { DOMParser, XMLSerializer, SaxesParser, zipSync, zipEntries };
  } catch {
    throw new Error('The pinned Word packages could not load. Repair the tool-local node_modules and retry.');
  }
}

function readCreationSpec(path) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
    const spec = JSON.parse(text);
    const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]/g) ?? [];
    const keys = new Set();
    let depth = 0;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token === '{' || token === '[') depth++;
      else if (token === '}' || token === ']') depth--;
      else if (depth === 1 && token.startsWith('"') && tokens[index + 1] === ':') {
        const key = JSON.parse(token);
        if (keys.has(key)) throw new Error();
        keys.add(key);
      }
    }
    return spec;
  } catch {
    throw new Error('--input must contain readable UTF-8 JSON with unique keys. Correct the creation file and retry.');
  }
}

function approvalToken(command, args, bytes) {
  const selection = JSON.stringify([command, args.changeId, args.filterAuthor, args.filterType]);
  return createHash('sha256').update('word-document review v1\0').update(selection).update('\0').update(bytes).digest('hex');
}

function publish(path, bytes, allowNewParents) {
  const parent = dirname(path);
  let staging;
  try {
    if (allowNewParents) mkdirSync(parent, { recursive: true });
    staging = mkdtempSync(join(parent, '.wiser-word-document-'));
    const staged = join(staging, 'document.docx');
    writeFileSync(staged, bytes, { flag: 'wx', mode: 0o600 });
    if (statSync(staged).size !== bytes.length) throw new Error();
    // A hard-link publication either acquires the requested name or leaves it intact.
    linkSync(staged, path);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('--output already exists. Choose a fresh filename.');
    throw new Error('Could not publish the DOCX. Choose a writable output directory on a filesystem that supports hard links.');
  } finally {
    if (staging) {
      try { rmSync(staging, { recursive: true, force: true }); }
      catch { process.stderr.write(`Could not remove temporary staging directory ${staging}. Remove it after checking the output.\n`); }
    }
  }
}

export async function main(argv) {
  const parsed = parse(argv);
  if (Object.hasOwn(parsed, 'help')) {
    process.stdout.write(help(parsed.help) + '\n');
    return;
  }
  const { command, args } = parsed;
  const creating = command === 'create';
  const input = args.input === undefined ? null : inputPath(args.input, creating ? '.json' : '.docx');
  const output = args.output === undefined ? null : outputPath(args.output, creating);
  let bytes;
  if (creating) args.spec = input ? readCreationSpec(input) : {
    title: args.title ?? '',
    paragraphs: args.text === undefined ? [] : [args.text],
  };
  else {
    try { bytes = readFileSync(input); } catch {
      throw new Error('Could not read --input. Check its permissions and pass a readable Word document.');
    }
  }
  const isReview = REVIEW_COMMANDS.has(command);
  const token = isReview ? approvalToken(command, args, bytes) : null;
  if (args.confirm !== undefined && args.confirm !== token) {
    throw new Error('The confirmation token does not match this input, action, or selection. Preview this exact command again and get fresh approval.');
  }
  const codec = await loadCodec(args.install);
  const receipt = await runWordDocument(codec, command, args, bytes, {
    date: new Date().toISOString(),
    approved: args.confirm !== undefined,
  });
  if (receipt.bytes) publish(output, receipt.bytes, creating);
  const result = { command, ...receipt.result };
  if (output) result.output = output;
  if (isReview && !output) {
    result.confirmationRequired = receipt.result.changes.length > 0;
    result.confirmationToken = result.confirmationRequired ? token : null;
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
