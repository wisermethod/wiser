import { appendFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

/**
 * One-shot gateway call. `WISER_HOOK_STUB_FILE` is a test seam: a JSON map of
 * action id to a result, or to an array of results consumed in order. When it
 * is set, this does not start the gateway. `WISER_HOOK_STUB_LOG`, when set,
 * receives one line per call.
 *
 * @param {string} actionId
 * @param {unknown} input
 * @param {{ root: string, home: string, dirs: string[], timeoutMs: number }} opts
 * @returns {Promise<Record<string, unknown> | null>}
 */
export function callOnce(actionId, input, opts) {
  const stub = process.env.WISER_HOOK_STUB_FILE;
  if (typeof stub === 'string' && stub.length > 0) return Promise.resolve(stubCall(stub, actionId, input));
  return spawnGateway(['--call', actionId, '--input', '-'], input, opts);
}

/**
 * Roster and ask in one gateway process. Stdin is `{ rows, ask }`. The stub
 * seam still answers by action id: roster first, then ask only when that
 * roster result carries a digest, which is the same stop the gateway uses.
 *
 * @param {unknown} input
 * @param {{ root: string, home: string, dirs: string[], timeoutMs: number }} opts
 * @returns {Promise<Record<string, unknown> | null>}
 */
export function routeOnce(input, opts) {
  const stub = process.env.WISER_HOOK_STUB_FILE;
  if (typeof stub === 'string' && stub.length > 0) return Promise.resolve(stubRoute(stub, input));
  return spawnGateway(['--route', '--input', '-'], input, opts);
}

/** One parse per process so a queue of results advances across calls. */
let stubMemo = null;
let stubPath = '';

/**
 * @param {string} file
 * @param {string} actionId
 * @param {unknown} input
 * @returns {Record<string, unknown> | null}
 */
function stubCall(file, actionId, input) {
  const log = process.env.WISER_HOOK_STUB_LOG;
  if (typeof log === 'string' && log.length > 0) {
    const rows = input && typeof input === 'object' && Array.isArray(input.rows) ? input.rows.length : '';
    appendFileSync(log, `${actionId}${rows === '' ? '' : ` ${rows}`}\n`);
  }
  if (!stubMemo || stubPath !== file) {
    stubMemo = JSON.parse(readFileSync(file, 'utf8'));
    stubPath = file;
  }
  const spec = stubMemo;
  const slot = spec && typeof spec === 'object' ? spec[actionId] : null;
  if (Array.isArray(slot)) {
    const next = slot.shift();
    return next && typeof next === 'object' && !Array.isArray(next) ? next : null;
  }
  if (slot && typeof slot === 'object' && !Array.isArray(slot)) return slot;
  return null;
}

/**
 * @param {string} file
 * @param {unknown} input
 * @returns {Record<string, unknown> | null}
 */
function stubRoute(file, input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const roster = stubCall(file, 'wiser.route.roster', { rows: body.rows });
  const digest = roster && typeof roster.roster_sha256 === 'string' ? roster.roster_sha256 : '';
  if (!digest) return roster;
  return stubCall(file, 'wiser.route.ask', { ask: body.ask, roster_sha256: digest });
}

/**
 * @param {string[]} modeArgs
 * @param {unknown} input
 * @param {{ root: string, home: string, dirs: string[], timeoutMs: number }} opts
 * @returns {Promise<Record<string, unknown> | null>}
 */
function spawnGateway(modeArgs, input, opts) {
  return new Promise((resolve) => {
    if (!(opts.timeoutMs > 0) || !opts.home || !Array.isArray(opts.dirs) || opts.dirs.length === 0) {
      resolve(null);
      return;
    }
    const args = [
      join(opts.root, 'gateway', 'server.js'),
      '--harness', 'claude-code',
      '--home', opts.home,
      ...modeArgs,
    ];
    for (const dir of opts.dirs) args.push('--classifier', dir);
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, opts.timeoutMs);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.length > 2_000_000) {
        child.kill();
        finish(null);
      }
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      if (code !== 0) return finish(null);
      try {
        const line = out.trim().split('\n').pop();
        const value = JSON.parse(line);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return finish(null);
        finish(value);
      } catch {
        finish(null);
      }
    });
    child.stdin.on('error', () => { /* child already gone */ });
    child.stdin.end(JSON.stringify(input));
  });
}
