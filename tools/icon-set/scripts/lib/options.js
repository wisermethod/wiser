import { lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { SETS } from './icons.js';

export const VALUE_FLAGS = {
  check: [], search: ['--query', '--limit', '--set'],
  get: ['--name', '--weight', '--size', '--output', '--color', '--accent', '--x', '--y', '--class', '--set']
};
export const BARE_FLAGS = { check: ['--install'], search: ['--install'], get: ['--install', '--fragment'] };

export function parseFlags(command, argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (![...VALUE_FLAGS[command], ...BARE_FLAGS[command]].includes(key)) {
      throw new Error(`${key.startsWith('-') ? 'unknown option' : 'unexpected argument'} "${key}"`);
    }
    if (Object.hasOwn(flags, key)) throw new Error(`${key} was given more than once; pass it once`);
    if (BARE_FLAGS[command].includes(key)) flags[key] = true;
    else {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${key} needs a value`);
      flags[key] = argv[++i];
    }
  }
  return flags;
}

function required(flags, key) {
  if (!flags[key]?.trim()) throw new Error(`${key} is required; pass a non-empty value`);
  return flags[key];
}

function number(key, raw, positive = false) {
  const n = Number(raw);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(n) || (positive && n <= 0)) {
    throw new Error(`${key} must be a ${positive ? 'positive' : 'finite'} number without units`);
  }
  return n;
}

// CSS colour values are attribute values, never stylesheets or paint servers.
// Accept colour words, hex, the CSS colour functions, and custom properties.
export function colorValue(key, raw) {
  const value = raw.trim();
  if (/^[a-z]+$/i.test(value) || /^#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value) ||
      /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([a-z\d.%+,/\s-]+\)$/i.test(value) ||
      /^var\(--[a-z\d_-]+\)$/i.test(value)) return value;
  throw new Error(`${key} must be a CSS colour: a colour word, hex, colour function, or var(--name); URLs and markup are refused`);
}

// Resolve the deepest existing ancestor, including a symlink standing in for
// a parent; a dangling symlink or unreadable path cannot be cleared.
export function canonical(candidate) {
  let head = resolve(candidate);
  const tail = [];
  for (;;) {
    try {
      lstatSync(head);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('--output cannot be resolved; check that every parent is a readable directory');
      const parent = dirname(head);
      if (parent === head) throw new Error('--output cannot be resolved; choose a readable path');
      tail.unshift(basename(head));
      head = parent;
      continue;
    }
    try { return join(realpathSync(head), ...tail); }
    catch { throw new Error('--output cannot be resolved; repair the symbolic link or choose a readable path'); }
  }
}

// True when `candidate` names `directory` or something beneath it, decided by device and inode rather than by
// spelling: on a case-insensitive volume a variant spelling of this tool's directory canonicalizes to a string
// that carries none of its prefix. The walk climbs to the deepest ancestor that exists, where the write lands.
function descendsFrom(candidate, directory) {
  let root;
  try { root = statSync(directory); } catch { return false; }
  let head = candidate;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === root.dev && id.ino === root.ino) return true;
    } catch { /* absent: its parent decides */ }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

export function screenOutput(raw, toolDir) {
  if (!isAbsolute(raw)) throw new Error('--output must be absolute; pass a resolved path in the owning root');
  const output = canonical(raw);
  const tool = realpathSync(toolDir);
  if (output === tool || output.startsWith(`${tool}${sep}`) || descendsFrom(output, tool)) {
    throw new Error('--output resolves inside this tool directory; choose a work directory in the owning root');
  }
  try {
    lstatSync(output);
    throw new Error('--output already exists; choose a free path so no file is replaced');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    if (!statSync(dirname(output)).isDirectory()) throw new Error();
  } catch { throw new Error('--output parent must be an existing directory; create it before running get'); }
  return output;
}

export function readOptions(command, flags, toolDir) {
  if (command === 'check') return {};
  const set = flags['--set'] ?? 'phosphor';
  if (!Object.hasOwn(SETS, set)) throw new Error(`unknown set "${set}"; --set must be phosphor or health`);
  if (command === 'search') {
    const query = required(flags, '--query');
    const limit = flags['--limit'] ?? '20';
    if (!/^\d+$/.test(limit) || !Number.isSafeInteger(Number(limit)) || Number(limit) < 1) {
      throw new Error('--limit must be a positive whole number');
    }
    return { set, query, limit: Number(limit) };
  }
  const name = required(flags, '--name');
  const weight = required(flags, '--weight');
  const weights = SETS[set].weights;
  if (!weights.includes(weight)) throw new Error(`unknown weight "${weight}" for ${set}; --weight must be ${weights.join(', ')}`);
  const size = number('--size', required(flags, '--size'), true);
  const output = screenOutput(required(flags, '--output'), toolDir);
  const color = colorValue('--color', flags['--color'] ?? 'currentColor');
  const accent = flags['--accent'] === undefined ? undefined : colorValue('--accent', flags['--accent']);
  if (accent !== undefined && (set !== 'phosphor' || weight !== 'duotone')) {
    throw new Error('--accent requires --weight duotone and --set phosphor');
  }
  const fragment = flags['--fragment'] === true;
  if (!fragment && (flags['--x'] !== undefined || flags['--y'] !== undefined)) throw new Error('--x and --y require --fragment');
  const x = fragment ? number('--x', required(flags, '--x')) : undefined;
  const y = fragment ? number('--y', required(flags, '--y')) : undefined;
  const className = flags['--class'];
  if (className !== undefined && !/^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/.test(className)) throw new Error('--class must be one CSS class name');
  return { set, name, weight, size, output, color, accent, fragment, x, y, className };
}
