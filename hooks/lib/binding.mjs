import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  classifierRefusalValue,
  isRefused,
  owningRoot,
  pidAlive,
} from './presence.mjs';

/** A session id is a file name. Anything else is not written and not read. */
export const SESSION_ID_RE = /^[A-Za-z0-9-]{8,128}$/;

const SESSIONS = 'classifier-sessions';
const PRESENCE = join('classifier-status', 'claude-code.json');
const TEN_MIN_MS = 10 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_WAIT_MS = 1000;
const LOCK_STALE_MS = 10 * 1000;
const LOCK_SLEEP_MS = 5;
const DEFAULT_SCAN_DEPTH = 6;
const DEFAULT_SCAN_CAP = 5000;
const SKIP_NAMES = new Set(['node_modules', '__pycache__']);

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function validSessionId(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function validPid(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * @param {string} home
 * @returns {string}
 */
export function sessionsDir(home) {
  return join(home, SESSIONS);
}

/**
 * The harness presence file. Existence is the write condition; attachment is not.
 * @param {string} home
 * @returns {boolean}
 */
export function presenceFileExists(home) {
  try {
    return statSync(join(home, PRESENCE)).isFile();
  } catch {
    return false;
  }
}

/**
 * Start time of `pid` as the OS reports it. One function, so a writer and a
 * reader cannot drift. Unreadable is the string `unknown`, which a reader
 * treats as unverifiable.
 * @param {number} pid
 * @returns {string}
 */
function readHarnessStartedFromOs(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    });
    const text = String(out).trim();
    return text.length > 0 ? text : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * @param {number} pid
 * @param {(pid: number) => string} [reader]
 * @returns {string}
 */
export function harnessStarted(pid, reader = readHarnessStartedFromOs) {
  if (!validPid(pid)) return 'unknown';
  try {
    const value = reader(pid);
    if (typeof value !== 'string') return 'unknown';
    const text = value.trim();
    return text.length > 0 ? text : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * @param {number} pid
 * @returns {string}
 */
function readHarnessArgsFromOs(pid) {
  try {
    return String(execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 4 * 1024 * 1024,
    }));
  } catch {
    return '';
  }
}

/**
 * @param {number} pid
 * @param {(pid: number) => string} [reader]
 * @returns {string}
 */
export function harnessArgs(pid, reader = readHarnessArgsFromOs) {
  if (!validPid(pid)) return '';
  try {
    const value = reader(pid);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

const MAX_ANCESTOR_STEPS = 32;

/**
 * Parent pid as `ps` reports it. Unreadable is null, which fails the walk closed.
 * @param {number} pid
 * @returns {number | null}
 */
function readParentPidFromOs(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    });
    const text = String(out).trim();
    if (!/^[0-9]+$/.test(text)) return null;
    const parent = Number(text);
    return parent > 0 ? parent : null;
  } catch {
    return null;
  }
}

/**
 * True when `pid` is `start` or an ancestor of it. The walk begins at `start`
 * (default `process.ppid`), reads each parent, takes at most 32 steps, and
 * stops at pid 1. `reader` is the parent lookup, injected by tests.
 * @param {number} pid
 * @param {{ start?: number, reader?: (pid: number) => number | null }} [opts]
 * @returns {boolean}
 */
export function isAncestorPid(pid, opts = {}) {
  if (!validPid(pid)) return false;
  const reader = typeof opts.reader === 'function' ? opts.reader : readParentPidFromOs;
  let current = validPid(opts.start) ? opts.start : process.ppid;
  for (let step = 0; step < MAX_ANCESTOR_STEPS; step += 1) {
    if (!validPid(current)) return false;
    if (current === pid) return true;
    if (current === 1) return false;
    let parent;
    try {
      parent = reader(current);
    } catch {
      return false;
    }
    if (typeof parent === 'string' && /^[0-9]+$/.test(parent)) parent = Number(parent);
    current = parent;
  }
  return false;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function directoryExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * An absolute value must already be a directory. A relative value is resolved
 * against the event cwd. Anything else is unresolved.
 * @param {string} joined
 * @param {string} cwd
 * @returns {string | null}
 */
function resolveAddDirValue(joined, cwd) {
  if (!joined) return null;
  if (isAbsolute(joined)) return directoryExists(joined) ? joined : null;
  if (!cwd || !cwd.trim()) return null;
  const resolved = resolve(cwd, joined);
  return directoryExists(resolved) ? resolved : null;
}

/**
 * Longest space-joined run that resolves to an existing directory.
 * `ps` prints an unquoted path with spaces as several tokens.
 * @param {string[]} tokens
 * @param {string} cwd
 * @returns {{ path: string, consumed: number } | null}
 */
function longestDir(tokens, cwd) {
  const limit = Math.min(tokens.length, 64);
  for (let n = limit; n >= 1; n -= 1) {
    const joined = tokens.slice(0, n).join(' ');
    const path = resolveAddDirValue(joined, cwd);
    if (path) return { path, consumed: n };
  }
  return null;
}

/**
 * `--add-dir <dir>` and `--add-dir=<dir>` from a harness argument string.
 * A relative value resolves against `cwd`. `unresolved` is true when any
 * value cannot be resolved to an existing directory.
 * @param {string} argsText
 * @param {string} [cwd]
 * @returns {{ dirs: string[], unresolved: boolean }}
 */
export function addDirsFromArgs(argsText, cwd = '') {
  if (typeof argsText !== 'string' || argsText.trim().length === 0) {
    return { dirs: [], unresolved: false };
  }
  const tokens = argsText.trim().split(/\s+/);
  const dirs = [];
  let unresolved = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let rest = null;
    let embedded = false;
    if (token === '--add-dir') {
      rest = tokens.slice(i + 1);
    } else if (token.startsWith('--add-dir=')) {
      const first = token.slice('--add-dir='.length);
      if (!first) {
        unresolved = true;
        continue;
      }
      rest = [first, ...tokens.slice(i + 1)];
      embedded = true;
    }
    if (!rest) continue;
    const match = longestDir(rest, cwd);
    if (!match) {
      unresolved = true;
      continue;
    }
    dirs.push(match.path);
    i += embedded ? match.consumed - 1 : match.consumed;
  }
  return { dirs, unresolved };
}

/**
 * @param {string} entry
 * @param {string} cwd
 * @param {string} homeDir
 * @returns {string}
 */
function expandDirectory(entry, cwd, homeDir) {
  let text = entry;
  if (text === '~') text = homeDir;
  else if (text.startsWith('~/')) text = join(homeDir, text.slice(2));
  return isAbsolute(text) ? text : resolve(cwd || homeDir, text);
}

/**
 * `permissions.additionalDirectories` from one settings file. Missing or
 * unparseable contributes nothing.
 * @param {string} file
 * @param {string} cwd
 * @param {string} homeDir
 * @returns {string[]}
 */
function additionalDirectories(file, cwd, homeDir) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return [];
  }
  const list = doc && doc.permissions && doc.permissions.additionalDirectories;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    out.push(expandDirectory(entry.trim(), cwd, homeDir));
  }
  return out;
}

/**
 * @param {string} base
 * @returns {string[]}
 */
function projectSettings(base) {
  return [
    join(base, '.claude', 'settings.json'),
    join(base, '.claude', 'settings.local.json'),
  ];
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function sameDirectory(left, right) {
  if (!left || !right || !left.trim() || !right.trim()) return false;
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

/**
 * Composed directories: cwd, every `--add-dir` on the harness, user settings,
 * project settings under `CLAUDE_PROJECT_DIR` when set, and the event cwd's
 * project settings when that directory differs. `unresolved` means an
 * `--add-dir` value could not be resolved to an existing directory.
 * @param {{ cwd?: string, harnessPid: number, argsReader?: (pid: number) => string, homeDir?: string, projectDir?: string }} opts
 * @returns {{ dirs: string[], unresolved: boolean }}
 */
export function composedDirectories(opts) {
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
  const homeDir = opts.homeDir || homedir();
  const projectDir = typeof opts.projectDir === 'string' ? opts.projectDir : '';
  const dirs = [];
  if (cwd.trim().length > 0) dirs.push(cwd);
  const args = harnessArgs(opts.harnessPid, opts.argsReader);
  const added = addDirsFromArgs(args, cwd);
  for (const dir of added.dirs) dirs.push(dir);
  const settings = [join(homeDir, '.claude', 'settings.json')];
  if (projectDir.trim().length > 0) settings.push(...projectSettings(projectDir));
  if (cwd.trim().length > 0 && !sameDirectory(cwd, projectDir)) {
    settings.push(...projectSettings(cwd));
  }
  const base = cwd.trim().length > 0 ? cwd : (projectDir.trim().length > 0 ? projectDir : homeDir);
  for (const file of settings) {
    for (const dir of additionalDirectories(file, base, homeDir)) dirs.push(dir);
  }
  return { dirs, unresolved: added.unresolved };
}

/**
 * @param {string[]} dirs
 * @returns {string[]}
 */
function rootsOf(dirs) {
  const found = new Set();
  for (const dir of dirs) {
    const root = owningRoot(dir);
    if (!root) continue;
    try {
      found.add(realpathSync(root));
    } catch {
      found.add(root);
    }
  }
  return [...found].sort();
}

/**
 * AGENTS.md below `root`, depth at most `depthLimit`, skipping dot directories,
 * `.git`, `node_modules`, `.venv` and `__pycache__`. The cap is directories
 * visited. A hit is `descendant`; exceeding the cap is `scan-cap`.
 * @param {string} root
 * @param {{ depthLimit?: number, cap?: number }} [limits]
 * @returns {'descendant' | 'scan-cap' | null}
 */
function scanDescendants(root, limits = {}) {
  const depthLimit = limits.depthLimit ?? DEFAULT_SCAN_DEPTH;
  const cap = limits.cap ?? DEFAULT_SCAN_CAP;
  let visited = 0;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    visited += 1;
    if (visited > cap) return 'scan-cap';
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (depth > 0 && entries.some((ent) => ent.isFile() && ent.name === 'AGENTS.md')) {
      try {
        const value = classifierRefusalValue(readFileSync(join(dir, 'AGENTS.md'), 'utf8'));
        if (typeof value === 'string' && value.toLowerCase() === 'yes') return 'descendant';
      } catch {
        // an unreadable file is not a declaration
      }
    }
    if (depth >= depthLimit) continue;
    for (const ent of entries) {
      if (ent.isSymbolicLink() || !ent.isDirectory()) continue;
      const name = ent.name;
      if (name.startsWith('.') || SKIP_NAMES.has(name)) continue;
      queue.push({ dir: join(dir, name), depth: depth + 1 });
    }
  }
  return null;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function sameRoots(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

/**
 * @param {string} file
 * @returns {Record<string, unknown> | null}
 */
function readJson(file) {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * @param {string} home
 * @param {string} sessionId
 * @returns {Record<string, unknown> | null}
 */
export function readBinding(home, sessionId) {
  if (!validSessionId(sessionId)) return null;
  const doc = readJson(join(sessionsDir(home), `${sessionId}.json`));
  if (!doc || doc.session_id !== sessionId) return null;
  if (!validPid(doc.harness_pid)) return null;
  // A pending binding is written before `ps`, so it has no harness_started yet.
  if (doc.pending === true) return doc;
  if (typeof doc.harness_started !== 'string') return null;
  return doc;
}

/**
 * @param {string} home
 * @param {number} harnessPid
 * @returns {Record<string, unknown> | null}
 */
export function readPointer(home, harnessPid) {
  if (!validPid(harnessPid)) return null;
  const doc = readJson(join(sessionsDir(home), `current-${harnessPid}.json`));
  if (!doc || typeof doc.session_id !== 'string') return null;
  return doc;
}

/**
 * @param {string} file
 * @param {unknown} value
 */
function writeJsonAtomic(file, value) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* umask already applied; the chmod is the guarantee */ }
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* mode on writeFileSync is the first attempt */ }
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* the temp file was created 0600 */ }
}

/**
 * @param {number} ms
 */
function sleepMs(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @param {string} home
 * @param {number} harnessPid
 * @returns {string}
 */
function harnessLockPath(home, harnessPid) {
  return join(sessionsDir(home), `lock-${harnessPid}`);
}

/**
 * Exclusive directory per harness. A directory older than 10s is stale: it is
 * removed and the removal is reported. The wait is at most one second.
 * @param {string} home
 * @param {number} harnessPid
 * @returns {{ ok: true, staleLockRemoved: boolean, release: () => void } | { ok: false, reason: 'lock', staleLockRemoved: boolean }}
 */
function acquireHarnessLock(home, harnessPid) {
  const dir = harnessLockPath(home, harnessPid);
  mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
  try { chmodSync(sessionsDir(home), 0o700); } catch { /* umask already applied */ }
  const deadline = Date.now() + LOCK_WAIT_MS;
  let staleLockRemoved = false;
  let notedWait = false;
  for (;;) {
    try {
      mkdirSync(dir);
      return {
        ok: true,
        staleLockRemoved,
        release() {
          try { rmSync(dir, { recursive: true, force: true }); } catch { /* already released */ }
        },
      };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
      let stale = false;
      try {
        stale = Date.now() - statSync(dir).mtimeMs > LOCK_STALE_MS;
      } catch {
        stale = false;
      }
      if (stale) {
        try {
          rmSync(dir, { recursive: true, force: true });
          staleLockRemoved = true;
          continue;
        } catch {
          /* the holder may have released between the stat and the removal */
        }
      }
      if (Date.now() >= deadline) return { ok: false, reason: 'lock', staleLockRemoved };
      const waitFile = process.env.WISER_BINDING_LOCK_WAIT_FILE;
      if (typeof waitFile === 'string' && waitFile.length > 0 && !notedWait) {
        notedWait = true;
        try { writeFileSync(waitFile, 'waiting\n'); } catch { /* the test reads only that the file exists */ }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { ok: false, reason: 'lock', staleLockRemoved };
      sleepMs(Math.min(LOCK_SLEEP_MS, remaining));
    }
  }
}

/**
 * @param {Record<string, unknown> | null} result
 * @param {{ staleLockRemoved?: boolean }} lock
 * @returns {Record<string, unknown> | null}
 */
function stampLock(result, lock) {
  if (result && lock.staleLockRemoved) result.staleLockRemoved = true;
  return result;
}

/**
 * @param {string} home
 * @param {number} harnessPid
 * @param {() => Record<string, unknown> | null} fn
 * @returns {Record<string, unknown> | null}
 */
function withHarnessLock(home, harnessPid, fn) {
  const lock = acquireHarnessLock(home, harnessPid);
  if (!lock.ok) {
    const failed = { ok: false, reason: 'lock', lost: true };
    if (lock.staleLockRemoved) failed.staleLockRemoved = true;
    return failed;
  }
  try {
    return stampLock(fn(), lock);
  } finally {
    lock.release();
  }
}

/**
 * @param {Record<string, unknown> | null} pointer
 * @returns {number}
 */
function nextGeneration(pointer) {
  const current = pointer && Number.isInteger(pointer.generation) ? pointer.generation : 0;
  return current + 1;
}

/**
 * @param {Record<string, unknown> | null} pointer
 * @returns {{ session_id: unknown, generation: unknown, hook_started_ms: unknown } | null}
 */
function pointerView(pointer) {
  if (!pointer) return null;
  return {
    session_id: pointer.session_id,
    generation: pointer.generation,
    hook_started_ms: pointer.hook_started_ms,
  };
}

/**
 * @param {{ session_id: unknown, generation: unknown, hook_started_ms: unknown } | null} left
 * @param {{ session_id: unknown, generation: unknown, hook_started_ms: unknown } | null} right
 * @returns {boolean}
 */
function samePointerView(left, right) {
  if (left === null || right === null) return left === right;
  return left.session_id === right.session_id
    && left.generation === right.generation
    && left.hook_started_ms === right.hook_started_ms;
}

/**
 * @param {string} cwd
 * @returns {string}
 */
function storedCwd(cwd) {
  if (!cwd) return '';
  try {
    const real = realpathSync(cwd);
    return statSync(real).isDirectory() ? real : cwd;
  } catch {
    return cwd;
  }
}

/**
 * The pending pointer, then the pending binding, before any argument, settings,
 * `ps`, realpath, or descendant read. Both are written under the harness lock.
 * A newer pointer or binding is left in place. An equal `hook_started_ms` with
 * a different session id writes the pointer pending and does not choose.
 * `beforeWrite` runs inside the lock before that write. `whileLocked` runs
 * inside the lock after it. A thrown callback releases the lock and leaves
 * whatever was already written.
 * @param {{
 *   home: string,
 *   sessionId: unknown,
 *   harnessPid: number,
 *   cwd?: string,
 *   now?: number,
 *   hookStartedMs?: number,
 *   beforeWrite?: () => void,
 *   whileLocked?: (held: { generation: number, sessionId: string, hookStartedMs: number }) => void,
 * }} opts
 * @returns {{ ok: true, lost: false, hookStartedMs: number, generation: number, previous: Record<string, unknown> | null } | { ok: false, reason: string, lost: boolean, hookStartedMs?: number, generation?: number, previous?: Record<string, unknown> | null, pending?: boolean } | null}
 */
export function writePendingSession(opts) {
  const sessionId = opts.sessionId;
  if (!validSessionId(sessionId)) return null;
  const harnessPid = opts.harnessPid;
  if (!validPid(harnessPid)) return null;
  const hookStartedMs = typeof opts.hookStartedMs === 'number' ? opts.hookStartedMs : Date.now();
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  return withHarnessLock(opts.home, harnessPid, () => {
    const previous = readBinding(opts.home, sessionId);
    const current = readPointer(opts.home, harnessPid);
    if (current && typeof current.hook_started_ms === 'number' && current.hook_started_ms > hookStartedMs) {
      return { ok: false, reason: 'lost', lost: true, hookStartedMs, previous };
    }
    if (previous && typeof previous.hook_started_ms === 'number' && previous.hook_started_ms > hookStartedMs) {
      return { ok: false, reason: 'lost', lost: true, hookStartedMs, previous };
    }
    if (typeof opts.beforeWrite === 'function') opts.beforeWrite();
    const tie = Boolean(
      current
      && current.hook_started_ms === hookStartedMs
      && current.session_id !== sessionId,
    );
    const generation = nextGeneration(current);
    const writtenAt = new Date(now).toISOString();
    const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
    const sessions = sessionsDir(opts.home);
    // The pointer is the first transition write. Pending carries no harness_started.
    writeJsonAtomic(join(sessions, `current-${harnessPid}.json`), {
      v: 1,
      session_id: sessionId,
      harness_pid: harnessPid,
      hook_started_ms: hookStartedMs,
      generation,
      pending: true,
      written_at: writtenAt,
    });
    writeJsonAtomic(join(sessions, `${sessionId}.json`), {
      v: 1,
      session_id: sessionId,
      harness_pid: harnessPid,
      hook_started_ms: hookStartedMs,
      generation,
      cwd,
      roots: [],
      owning_root: null,
      refused: true,
      refused_by: 'pending',
      pending: true,
      written_at: writtenAt,
      descendant_scan_at: null,
      descendant_reason: null,
    });
    if (typeof opts.whileLocked === 'function') {
      opts.whileLocked({ generation, sessionId, hookStartedMs });
    }
    if (tie) {
      return {
        ok: false, reason: 'tie', lost: false, pending: true, hookStartedMs, generation, previous,
      };
    }
    return { ok: true, lost: false, hookStartedMs, generation, previous };
  });
}

/**
 * The final binding and the final pointer. Slow reads happen first. Under the
 * lock again, both are written only when the pointer still names this session
 * at `generation` (the generation the pending write stored). The final pointer
 * takes the next generation, and the binding carries that same generation and
 * `hook_started_ms`.
 * @param {{
 *   home: string,
 *   sessionId: unknown,
 *   harnessPid: number,
 *   hookStartedMs: number,
 *   generation?: number,
 *   cwd?: string,
 *   now?: number,
 *   homeDir?: string,
 *   projectDir?: string,
 *   previous?: Record<string, unknown> | null,
 *   harnessStartedReader?: (pid: number) => string,
 *   argsReader?: (pid: number) => string,
 *   scanDepth?: number,
 *   scanLimit?: number,
 * }} opts
 * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: string, lost?: boolean } | null}
 */
export function finishSession(opts) {
  const sessionId = opts.sessionId;
  if (!validSessionId(sessionId)) return null;
  const harnessPid = opts.harnessPid;
  if (!validPid(harnessPid)) return null;
  const hookStartedMs = opts.hookStartedMs;
  if (typeof hookStartedMs !== 'number') return { ok: false, reason: 'lost', lost: true };
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
  const started = harnessStarted(harnessPid, opts.harnessStartedReader);
  const composed = composedDirectories({
    cwd,
    harnessPid,
    argsReader: opts.argsReader,
    homeDir: opts.homeDir,
    projectDir: opts.projectDir,
  });
  const roots = rootsOf(composed.dirs);
  let refused = false;
  let refusedBy = null;
  if (composed.unresolved) {
    refused = true;
    refusedBy = 'unresolved-add-dir';
  }
  if (!refused) {
    for (const dir of composed.dirs) {
      if (isRefused(dir)) {
        refused = true;
        refusedBy = 'at-or-above';
        break;
      }
    }
  }
  if (!refused) {
    for (const root of roots) {
      if (isRefused(root)) {
        refused = true;
        refusedBy = 'at-or-above';
        break;
      }
    }
  }

  const existing = opts.previous && opts.previous.pending !== true ? opts.previous : null;
  const scanFresh = Boolean(
    existing
    && sameRoots(existing.roots, roots)
    && typeof existing.descendant_scan_at === 'number'
    && now >= existing.descendant_scan_at
    && now - existing.descendant_scan_at < TEN_MIN_MS,
  );
  let descendantReason = null;
  let descendantScanAt = null;
  if (scanFresh) {
    descendantReason = typeof existing.descendant_reason === 'string' ? existing.descendant_reason : null;
    descendantScanAt = existing.descendant_scan_at;
    if (!refused && (descendantReason === 'descendant' || descendantReason === 'scan-cap')) {
      refused = true;
      refusedBy = descendantReason;
    }
  } else if (!refused) {
    const limits = { depthLimit: opts.scanDepth, cap: opts.scanLimit };
    for (const root of roots) {
      const found = scanDescendants(root, limits);
      if (found) {
        descendantReason = found;
        refused = true;
        refusedBy = found;
        break;
      }
    }
    descendantScanAt = now;
  }

  const writtenAt = new Date(now).toISOString();
  const stored = storedCwd(cwd);
  return withHarnessLock(opts.home, harnessPid, () => {
    const pointer = readPointer(opts.home, harnessPid);
    const namesUs = Boolean(
      pointer
      && pointer.session_id === sessionId
      && pointer.hook_started_ms === hookStartedMs,
    );
    const generationMatches = !Number.isInteger(opts.generation)
      || Boolean(pointer && pointer.generation === opts.generation);
    if (!namesUs || !generationMatches) return { ok: false, reason: 'lost', lost: true };
    const generation = nextGeneration(pointer);
    const sessions = sessionsDir(opts.home);
    const binding = {
      v: 1,
      session_id: sessionId,
      harness_pid: harnessPid,
      harness_started: started,
      hook_started_ms: hookStartedMs,
      generation,
      cwd: stored,
      roots,
      owning_root: roots.length === 1 ? roots[0] : null,
      refused,
      refused_by: refusedBy,
      pending: false,
      written_at: writtenAt,
      descendant_scan_at: descendantScanAt,
      descendant_reason: descendantReason,
    };
    writeJsonAtomic(join(sessions, `${sessionId}.json`), binding);
    writeJsonAtomic(join(sessions, `current-${harnessPid}.json`), {
      v: 1,
      session_id: sessionId,
      harness_pid: harnessPid,
      harness_started: started,
      hook_started_ms: hookStartedMs,
      generation,
      pending: false,
      written_at: writtenAt,
    });
    return verify({
      home: opts.home,
      harnessPid,
      sessionId,
      harnessStartedReader: opts.harnessStartedReader,
    });
  });
}

/**
 * Pending binding and pointer first, then the final binding. Returns verify's
 * result, `{ ok: false, reason: 'lost' }` when a newer hook owns the pointer,
 * or null when the session id or the pid cannot be a file name.
 * @param {{
 *   home: string,
 *   sessionId: unknown,
 *   harnessPid: number,
 *   cwd?: string,
 *   now?: number,
 *   hookStartedMs?: number,
 *   homeDir?: string,
 *   projectDir?: string,
 *   harnessStartedReader?: (pid: number) => string,
 *   argsReader?: (pid: number) => string,
 *   scanDepth?: number,
 *   scanLimit?: number,
 * }} opts
 * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: string, lost?: boolean } | null}
 */
export function writeSession(opts) {
  const pending = writePendingSession(opts);
  if (!pending || pending.ok !== true) return pending;
  const finished = finishSession({
    ...opts,
    hookStartedMs: pending.hookStartedMs,
    generation: pending.generation,
    previous: pending.previous,
  });
  if (finished && pending.staleLockRemoved && !finished.staleLockRemoved) {
    finished.staleLockRemoved = true;
  }
  return finished;
}

/**
 * Identity only. The caller still applies `refused`, `roots` and `owning_root`.
 * `pending: true` is not sendable. `sessionId` null means the caller has no
 * per-call session (the long-running gateway) and the pointer's session is
 * the current one.
 * `betweenReads` runs after the binding is read and before the pointer is
 * read again, so a test can move the pointer between the two reads.
 * @param {{ home: string, harnessPid: unknown, sessionId?: string | null, harnessStartedReader?: (pid: number) => string, betweenReads?: () => void }} opts
 * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: 'no-harness' | 'no-pointer' | 'stale-session' | 'no-binding' | 'unverifiable' | 'pending' }}
 */
export function verify(opts) {
  const harnessPid = opts.harnessPid;
  if (!validPid(harnessPid)) return { ok: false, reason: 'no-harness' };
  const started = harnessStarted(harnessPid, opts.harnessStartedReader);
  if (started === 'unknown') return { ok: false, reason: 'unverifiable' };
  const first = readPointer(opts.home, harnessPid);
  const binding = first && typeof first.session_id === 'string'
    ? readBinding(opts.home, first.session_id)
    : null;
  if (typeof opts.betweenReads === 'function') opts.betweenReads();
  const second = readPointer(opts.home, harnessPid);
  if (!samePointerView(pointerView(first), pointerView(second))) {
    return { ok: false, reason: 'stale-session' };
  }
  if (!first) return { ok: false, reason: 'no-pointer' };
  if (first.harness_pid !== harnessPid) return { ok: false, reason: 'stale-session' };
  if (opts.sessionId != null && opts.sessionId !== first.session_id) {
    return { ok: false, reason: 'stale-session' };
  }
  if (first.pending === true) return { ok: false, reason: 'pending' };
  if (!binding) return { ok: false, reason: 'no-binding' };
  if (binding.pending === true) return { ok: false, reason: 'pending' };
  if (binding.generation !== first.generation || binding.hook_started_ms !== first.hook_started_ms) {
    return { ok: false, reason: 'stale-session' };
  }
  if (first.harness_started === 'unknown' || binding.harness_started === 'unknown') {
    return { ok: false, reason: 'unverifiable' };
  }
  if (first.harness_started !== started || binding.harness_pid !== harnessPid || binding.harness_started !== started) {
    return { ok: false, reason: 'stale-session' };
  }
  return { ok: true, binding };
}

/**
 * What both hooks write, once the presence file exists. `CLAUDE_PID`, when
 * set, has to be this process's parent; a difference writes nothing.
 * After the presence check and the session-id check, the pending pointer is
 * written before `ps`, realpath, settings, or a scan. `hookStartedMs` is the
 * hook's own start, defaulting to now before any of those reads.
 * @param {{ home: string, event: unknown, homeDir?: string, projectDir?: string, hookStartedMs?: number, harnessStartedReader?: (pid: number) => string, argsReader?: (pid: number) => string, now?: number, scanDepth?: number, scanLimit?: number }} opts
 * @returns {ReturnType<typeof writeSession> | null}
 */
export function recordHookSession(opts) {
  const hookStartedMs = typeof opts.hookStartedMs === 'number' ? opts.hookStartedMs : Date.now();
  if (!presenceFileExists(opts.home)) return null;
  const claimed = process.env.CLAUDE_PID;
  if (typeof claimed === 'string' && claimed.length > 0 && claimed !== String(process.ppid)) return null;
  const event = opts.event;
  const sessionId = event && typeof event === 'object' ? event.session_id : undefined;
  const cwd = event && typeof event === 'object' && typeof event.cwd === 'string' ? event.cwd : '';
  if (!validSessionId(sessionId)) return null;
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  const projectDir = typeof opts.projectDir === 'string'
    ? opts.projectDir
    : (typeof fromEnv === 'string' ? fromEnv : '');
  return writeSession({
    home: opts.home,
    sessionId,
    harnessPid: process.ppid,
    cwd,
    now: opts.now,
    hookStartedMs,
    homeDir: opts.homeDir,
    projectDir,
    harnessStartedReader: opts.harnessStartedReader,
    argsReader: opts.argsReader,
    scanDepth: opts.scanDepth,
    scanLimit: opts.scanLimit,
  });
}

/**
 * Bindings and pointers whose harness is gone, and bindings older than seven
 * days. A pointer is removed only when its harness is gone.
 * @param {string} home
 * @param {{ now?: number }} [opts]
 */
export function pruneSessions(home, opts = {}) {
  const dir = sessionsDir(home);
  if (!existsSync(dir)) return;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (name.startsWith('current-')) {
      const pointer = readJson(file);
      if (!pointer || !pidAlive(pointer.harness_pid)) {
        try { unlinkSync(file); } catch { /* already gone */ }
      }
      continue;
    }
    const sessionId = name.slice(0, -'.json'.length);
    if (!validSessionId(sessionId)) continue;
    const binding = readBinding(home, sessionId);
    let old = false;
    if (binding && typeof binding.written_at === 'string') {
      const written = Date.parse(binding.written_at);
      old = Number.isFinite(written) && now - written > SEVEN_DAYS_MS;
    } else {
      try {
        old = now - statSync(file).mtimeMs > SEVEN_DAYS_MS;
      } catch {
        old = false;
      }
    }
    const dead = !binding || !pidAlive(binding.harness_pid);
    if (dead || old) {
      try { unlinkSync(file); } catch { /* already gone */ }
    }
  }
}
