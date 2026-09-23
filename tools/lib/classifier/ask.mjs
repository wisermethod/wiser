import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callOnce } from '../../../hooks/lib/call.mjs';
import {
  classifierDirs,
  gatewayHome as defaultGatewayHome,
  isAttached,
  isRefused,
  pluginRoot,
  readClassifierStatus,
} from '../../../hooks/lib/presence.mjs';

const USAGE = `Usage: ask.mjs help | --help
  ask.mjs --action <id> --input - [--owning-root <abs dir>] [--gateway-home <abs dir>] [--replay <file>] [--timeout-ms <n>]

Put one closed judgment to the classifier and print one JSON object.
--input - reads one JSON value from stdin. Any other --input value is that
JSON value. --replay is a record file from an earlier call; a record that
does not match this judgment is refused. --owning-root is the absolute
owning root. --gateway-home is the gateway home when the gateway was
started with --home. --timeout-ms defaults to 20000.

help and --help print this usage and exit 0. An unknown flag, a missing
--action or --input, unparseable input, and a replay that does not match
this judgment print to stderr and exit 1. Every other result exits 0.
`;

const VALUE_FLAGS = new Set([
  '--action',
  '--owning-root',
  '--gateway-home',
  '--replay',
  '--timeout-ms',
  '--input',
]);

/**
 * Canonical JSON: object keys sorted recursively, no whitespace.
 * Arrays keep their order. The value is not mutated.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  const text = JSON.stringify(canonicalize(value));
  if (typeof text !== 'string') throw new Error('unparseable input: expected one JSON value.');
  return text;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function inputSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * @param {string} reason
 */
function builtin(reason) {
  return { path: 'builtin', reason, answer: null, record: null };
}

/**
 * @param {unknown} replay
 * @returns {Record<string, unknown>}
 */
function loadReplay(replay) {
  let record = replay;
  if (typeof replay === 'string') {
    let text;
    try {
      text = readFileSync(replay, 'utf8');
    } catch (error) {
      throw new Error(`classifier record does not match this judgment (${error.code || 'unreadable'})`);
    }
    try {
      record = JSON.parse(text);
    } catch {
      throw new Error('classifier record does not match this judgment');
    }
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('classifier record does not match this judgment');
  }
  return record;
}

/**
 * One closed judgment. Replay is decided before any presence read or call.
 * A builtin path sends nothing and carries no record. The answer is returned
 * as received.
 *
 * @param {{ action?: string, input?: unknown, owningRoot?: string, gatewayHome?: string, replay?: unknown, timeoutMs?: number }} [opts]
 * @returns {Promise<{ path: 'classifier' | 'builtin' | 'replay', reason: string | null, answer: object | null, record: object | null }>}
 */
export async function ask(opts = {}) {
  const action = opts.action;
  const input = opts.input;
  const hash = inputSha256(input);
  if (opts.replay != null && opts.replay !== '') {
    const record = loadReplay(opts.replay);
    if (record.action !== action || record.input_sha256 !== hash) {
      throw new Error('classifier record does not match this judgment');
    }
    return {
      path: 'replay',
      reason: null,
      answer: record.answer && typeof record.answer === 'object' ? record.answer : null,
      record,
    };
  }

  const root = opts.owningRoot;
  if (typeof root !== 'string' || !isAbsolute(root)) return builtin('no-owning-root');
  try {
    readFileSync(join(root, 'AGENTS.md'), 'utf8');
  } catch {
    return builtin('unreadable-root');
  }
  if (isRefused(root)) return builtin('refused');

  const home = typeof opts.gatewayHome === 'string' && opts.gatewayHome.length > 0
    ? opts.gatewayHome
    : defaultGatewayHome();
  const status = readClassifierStatus(home);
  const dirs = classifierDirs(status);
  if (!isAttached(status) || dirs.length === 0) return builtin('no-classifier');

  const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : 20000;
  const started = Date.now();
  const answer = await callOnce(action, input, {
    root: pluginRoot,
    home,
    dirs,
    timeoutMs,
  });
  const ms = Date.now() - started;
  if (answer == null) return builtin('unavailable');
  if (typeof answer.status === 'string' && answer.status.length > 0) return builtin(answer.status);
  return {
    path: 'classifier',
    reason: null,
    answer,
    record: {
      action,
      input_sha256: hash,
      input,
      answer,
      path: 'classifier',
      ms,
      at: new Date().toISOString(),
    },
  };
}

/**
 * @param {string[]} argv
 * @returns {{ help: true } | { help: false, flags: Record<string, string> }}
 */
function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('help') || argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    if (!VALUE_FLAGS.has(word)) {
      throw new Error(`unknown option "${word}". Run ask.mjs help.`);
    }
    if (Object.prototype.hasOwnProperty.call(flags, word)) {
      throw new Error(`${word} was given more than once.`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${word} needs a value.`);
    }
    flags[word] = value;
    i += 1;
  }
  if (!flags['--action']) throw new Error('--action is required. Run ask.mjs help.');
  if (!flags['--input']) throw new Error('--input is required. Run ask.mjs help.');
  return { help: false, flags };
}

/**
 * @param {string[]} [argv]
 * @returns {Promise<number>}
 */
async function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    const flags = parsed.flags;
    let input;
    try {
      const text = flags['--input'] === '-' ? readFileSync(0, 'utf8') : flags['--input'];
      input = JSON.parse(text);
    } catch {
      throw new Error('unparseable input: expected one JSON value.');
    }
    let timeoutMs;
    if (flags['--timeout-ms'] !== undefined) {
      if (!/^[0-9]+$/.test(flags['--timeout-ms']) || Number(flags['--timeout-ms']) <= 0) {
        throw new Error('--timeout-ms needs a positive integer.');
      }
      timeoutMs = Number(flags['--timeout-ms']);
    }
    const result = await ask({
      action: flags['--action'],
      input,
      owningRoot: flags['--owning-root'],
      gatewayHome: flags['--gateway-home'],
      replay: flags['--replay'],
      timeoutMs,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : error}\n`);
    return 1;
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    try {
      return pathToFileURL(entry).href === import.meta.url;
    } catch {
      return false;
    }
  }
}

if (invokedDirectly()) {
  main().then((code) => {
    process.exit(code);
  });
}
