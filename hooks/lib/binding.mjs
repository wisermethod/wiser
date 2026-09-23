import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
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

/**
 * @param {string} path
 * @returns {boolean}
 */
function isExistingAbsDir(path) {
  if (!isAbsolute(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Longest space-joined run of `tokens` that is an existing absolute directory.
 * `ps` prints an unquoted path with spaces as several tokens.
 * @param {string[]} tokens
 * @returns {{ path: string, consumed: number } | null}
 */
function longestAbsDir(tokens) {
  const limit = Math.min(tokens.length, 64);
  for (let n = limit; n >= 1; n -= 1) {
    const joined = tokens.slice(0, n).join(' ');
    if (isExistingAbsDir(joined)) return { path: joined, consumed: n };
  }
  return null;
}

/**
 * `--add-dir <dir>` and `--add-dir=<dir>` from a harness argument string.
 * @param {string} argsText
 * @returns {string[]}
 */
export function addDirsFromArgs(argsText) {
  if (typeof argsText !== 'string' || argsText.trim().length === 0) return [];
  const tokens = argsText.trim().split(/\s+/);
  const found = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let rest = null;
    let embedded = false;
    if (token === '--add-dir') {
      rest = tokens.slice(i + 1);
    } else if (token.startsWith('--add-dir=')) {
      const first = token.slice('--add-dir='.length);
      if (!first) continue;
      rest = [first, ...tokens.slice(i + 1)];
      embedded = true;
    }
    if (!rest) continue;
    const match = longestAbsDir(rest);
    if (!match) continue;
    found.push(match.path);
    i += embedded ? match.consumed - 1 : match.consumed;
  }
  return found;
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
 * Composed directories: cwd, every `--add-dir` on the harness, and every
 * `permissions.additionalDirectories` entry from the three settings files.
 * @param {{ cwd?: string, harnessPid: number, argsReader?: (pid: number) => string, homeDir?: string }} opts
 * @returns {string[]}
 */
export function composedDirectories(opts) {
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
  const homeDir = opts.homeDir || homedir();
  const dirs = [];
  if (cwd.trim().length > 0) dirs.push(cwd);
  const args = harnessArgs(opts.harnessPid, opts.argsReader);
  for (const dir of addDirsFromArgs(args)) dirs.push(dir);
  const settings = [
    join(homeDir, '.claude', 'settings.json'),
    ...(cwd.trim().length > 0 ? [
      join(cwd, '.claude', 'settings.json'),
      join(cwd, '.claude', 'settings.local.json'),
    ] : []),
  ];
  for (const file of settings) {
    for (const dir of additionalDirectories(file, cwd, homeDir)) dirs.push(dir);
  }
  return dirs;
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
 * Write the binding, then the pointer. Returns verify's result, or null when
 * the session id or the pid cannot be a file name.
 * @param {{
 *   home: string,
 *   sessionId: unknown,
 *   harnessPid: number,
 *   cwd?: string,
 *   now?: number,
 *   homeDir?: string,
 *   harnessStartedReader?: (pid: number) => string,
 *   argsReader?: (pid: number) => string,
 *   scanDepth?: number,
 *   scanLimit?: number,
 * }} opts
 * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: string } | null}
 */
export function writeSession(opts) {
  const sessionId = opts.sessionId;
  if (!validSessionId(sessionId)) return null;
  const harnessPid = opts.harnessPid;
  if (!validPid(harnessPid)) return null;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
  const started = harnessStarted(harnessPid, opts.harnessStartedReader);
  const composed = composedDirectories({
    cwd,
    harnessPid,
    argsReader: opts.argsReader,
    homeDir: opts.homeDir,
  });
  const roots = rootsOf(composed);
  let refused = false;
  let refusedBy = null;
  for (const dir of composed) {
    if (isRefused(dir)) {
      refused = true;
      refusedBy = 'at-or-above';
      break;
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

  const existing = readBinding(opts.home, sessionId);
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
  const binding = {
    v: 1,
    session_id: sessionId,
    harness_pid: harnessPid,
    harness_started: started,
    cwd: storedCwd(cwd),
    roots,
    owning_root: roots.length === 1 ? roots[0] : null,
    refused,
    refused_by: refusedBy,
    written_at: writtenAt,
    descendant_scan_at: descendantScanAt,
    descendant_reason: descendantReason,
  };
  writeJsonAtomic(join(sessionsDir(opts.home), `${sessionId}.json`), binding);
  writeJsonAtomic(join(sessionsDir(opts.home), `current-${harnessPid}.json`), {
    v: 1,
    session_id: sessionId,
    harness_pid: harnessPid,
    harness_started: started,
    written_at: writtenAt,
  });
  return verify({
    home: opts.home,
    harnessPid,
    sessionId,
    harnessStartedReader: opts.harnessStartedReader,
  });
}

/**
 * Identity only. The caller still applies `refused`, `roots` and `owning_root`.
 * `sessionId` null means the caller has no per-call session (the long-running
 * gateway) and the pointer's session is the current one.
 * @param {{ home: string, harnessPid: unknown, sessionId?: string | null, harnessStartedReader?: (pid: number) => string }} opts
 * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: 'no-harness' | 'no-pointer' | 'stale-session' | 'no-binding' | 'unverifiable' }}
 */
export function verify(opts) {
  const harnessPid = opts.harnessPid;
  if (!validPid(harnessPid)) return { ok: false, reason: 'no-harness' };
  const started = harnessStarted(harnessPid, opts.harnessStartedReader);
  if (started === 'unknown') return { ok: false, reason: 'unverifiable' };
  const pointer = readPointer(opts.home, harnessPid);
  if (!pointer) return { ok: false, reason: 'no-pointer' };
  if (pointer.harness_pid !== harnessPid) return { ok: false, reason: 'stale-session' };
  if (pointer.harness_started === 'unknown') return { ok: false, reason: 'unverifiable' };
  if (pointer.harness_started !== started) return { ok: false, reason: 'stale-session' };
  if (opts.sessionId != null && opts.sessionId !== pointer.session_id) {
    return { ok: false, reason: 'stale-session' };
  }
  const binding = readBinding(opts.home, pointer.session_id);
  if (!binding) return { ok: false, reason: 'no-binding' };
  if (binding.harness_started === 'unknown') return { ok: false, reason: 'unverifiable' };
  if (binding.harness_pid !== harnessPid || binding.harness_started !== started) {
    return { ok: false, reason: 'stale-session' };
  }
  return { ok: true, binding };
}

/**
 * What both hooks write, once the presence file exists. `CLAUDE_PID`, when
 * set, has to be this process's parent; a difference writes nothing.
 * @param {{ home: string, event: unknown, homeDir?: string, harnessStartedReader?: (pid: number) => string, argsReader?: (pid: number) => string, now?: number, scanDepth?: number, scanLimit?: number }} opts
 * @returns {ReturnType<typeof writeSession> | null}
 */
export function recordHookSession(opts) {
  if (!presenceFileExists(opts.home)) return null;
  const claimed = process.env.CLAUDE_PID;
  if (typeof claimed === 'string' && claimed.length > 0 && claimed !== String(process.ppid)) return null;
  const event = opts.event;
  const sessionId = event && typeof event === 'object' ? event.session_id : undefined;
  const cwd = event && typeof event === 'object' && typeof event.cwd === 'string' ? event.cwd : '';
  if (!validSessionId(sessionId)) return null;
  return writeSession({
    home: opts.home,
    sessionId,
    harnessPid: process.ppid,
    cwd,
    now: opts.now,
    homeDir: opts.homeDir,
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
