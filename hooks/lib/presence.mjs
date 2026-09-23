import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGatewayHome } from '../../gateway/src/paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Plugin root that holds this hooks directory. */
export const pluginRoot = resolve(HERE, '..', '..');

/**
 * Gateway home, the same default `gateway/src/paths.js` uses.
 * @returns {string}
 */
export function gatewayHome() {
  return defaultGatewayHome();
}

/**
 * @param {string} [home]
 * @returns {Record<string, unknown> | null}
 */
export function readClassifierStatus(home = gatewayHome()) {
  try {
    const file = join(home, 'classifier-status', 'claude-code.json');
    const text = readFileSync(file, 'utf8');
    const doc = JSON.parse(text);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * True when the process is alive. `kill` with signal 0 throws ESRCH when it
 * is gone. EPERM means it exists and this user cannot signal it, so it is alive.
 * @param {unknown} pid
 * @returns {boolean}
 */
export function pidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

/**
 * Attached only when the presence file says so and that process is alive.
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {boolean}
 */
export function isAttached(doc) {
  if (!doc || doc.attached !== true) return false;
  return pidAlive(doc.pid);
}

/**
 * Absolute classifier directories named by the presence file. Nothing else.
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {string[]}
 */
export function classifierDirs(doc) {
  if (!doc || !Array.isArray(doc.classifier_dirs)) return [];
  return doc.classifier_dirs.filter((dir) => typeof dir === 'string' && isAbsolute(dir));
}

/**
 * Frontmatter value of `classifier_refusal`, or undefined when the file has
 * no such key in its opening frontmatter. The value is the refusal, not the
 * presence of the key.
 * @param {string} text
 * @returns {string | undefined}
 */
export function classifierRefusalValue(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return undefined;
  const nl = text.indexOf('\n');
  if (nl < 0) return undefined;
  const rest = text.slice(nl + 1);
  const end = rest.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (end < 0) return undefined;
  const fm = rest.slice(0, end);
  for (const raw of fm.split(/\n/)) {
    const line = raw.replace(/\r$/, '');
    const match = line.match(/^classifier_refusal:\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[1];
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

/**
 * Walk from `cwd` up to the filesystem root. The first AGENTS.md whose
 * frontmatter says `classifier_refusal: yes` refuses. A nearer file that says
 * `no`, or that has no such key, does not stop the walk. A file that exists
 * and cannot be read refuses: the check fails closed.
 * @param {string} cwd
 * @returns {boolean}
 */
export function isRefused(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return false;
  let dir = resolve(cwd);
  try {
    const st = lstatSync(dir);
    dir = st.isDirectory() ? realpathSync(dir) : dirname(realpathSync(dir));
  } catch {
    dir = resolve(cwd);
  }
  const root = parse(dir).root;
  const seen = new Set();
  while (!seen.has(dir)) {
    seen.add(dir);
    const file = join(dir, 'AGENTS.md');
    if (existsSync(file)) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        // An existing file that cannot be read is a refusal. A missing file is not.
        return true;
      }
      const value = classifierRefusalValue(text);
      if (typeof value === 'string' && value.toLowerCase() === 'yes') return true;
    }
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/**
 * The frontmatter value of `key` in an AGENTS.md text, or undefined.
 * @param {string} text
 * @param {string} key
 * @returns {string | undefined}
 */
function frontmatterValue(text, key) {
  if (typeof text !== 'string' || !text.startsWith('---')) return undefined;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (end < 0) return undefined;
  for (const raw of rest.slice(0, end).split(/\n/)) {
    const m = raw.replace(/\r$/, '').match(new RegExp(`^${key}:\\s*(.*?)\\s*$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

/**
 * The directory a hook reasons from: `cwd` resolved once through any symlink,
 * so the ownership and refusal checks walk the same path.
 * @param {string} cwd
 * @returns {string | null}
 */
export function canonicalDir(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  try {
    const real = realpathSync(resolve(cwd));
    return statSync(real).isDirectory() ? real : dirname(real);
  } catch {
    return resolve(cwd);
  }
}

/**
 * The owning root: the nearest directory at or above `cwd` whose AGENTS.md
 * declares a non-blank `type:`, the constitution's test for an owning-root
 * candidate (`wiser/AGENTS.md`, Determining the owning root). A plugin root or
 * a workspace container declares `root:` and no `type:`, and is not one. Null
 * when there is none; a hook then sends nothing, because the root that would
 * own the request, and whether it refuses (standards/user-root.md C13), is not
 * known before the model resolves it.
 * @param {string} cwd
 * @returns {string | null}
 */
export function owningRoot(cwd) {
  let dir = canonicalDir(cwd);
  if (!dir) return null;
  const seen = new Set();
  while (!seen.has(dir)) {
    seen.add(dir);
    const file = join(dir, 'AGENTS.md');
    if (existsSync(file)) {
      const value = frontmatterValue(readFileSync(file, 'utf8'), 'type');
      if (typeof value === 'string' && value.length > 0) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Shared hook gate. Null means print nothing: missing cwd, not attached, or refused.
 * A read error throws so the hook runner prints nothing.
 * @param {unknown} event
 * @returns {{ cwd: string, home: string, status: Record<string, unknown>, dirs: string[] } | null}
 */
export function gate(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const cwd = event.cwd;
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  const home = gatewayHome();
  const status = readClassifierStatus(home);
  if (!isAttached(status)) return null;
  const dir = canonicalDir(cwd);
  if (!dir || isRefused(dir)) return null;
  if (!owningRoot(dir)) return null;
  return { cwd, home, status, dirs: classifierDirs(status) };
}

/**
 * True when `filePath` is a SKILL.md under this plugin's skills/, or an
 * EXPERT.md under this plugin's experts/.
 * @param {unknown} filePath
 * @param {string} [root]
 * @returns {boolean}
 */
export function isPluginSkillOrExpert(filePath, root = pluginRoot) {
  if (typeof filePath !== 'string' || !filePath) return false;
  const norm = filePath.replaceAll('\\', '/');
  const skill = norm.endsWith('/SKILL.md');
  const expert = norm.endsWith('/EXPERT.md');
  if (!skill && !expert) return false;
  const abs = isAbsolute(filePath) ? filePath : null;
  if (!abs) return false;
  let file = resolve(abs);
  try { file = realpathSync(file); } catch { /* lexical path still has to sit under the family */ }
  const family = skill ? 'skills' : 'experts';
  let base = resolve(root, family);
  try { base = realpathSync(base); } catch { /* the family directory is part of this plugin */ }
  const rel = relative(base, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false;
  return true;
}
