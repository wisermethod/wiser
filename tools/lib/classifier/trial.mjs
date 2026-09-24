import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import {
  defaultGatewayHome,
  defaultProviderEnvPath,
  readClassifierKey,
  wiserUserConfigDir,
} from '../../../gateway/src/paths.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

/** Per-run dollar figures. standards/primitives.md does not set these; the trial brief does. */
export const COST_TABLE = {
  host: {
    opus: { median: 0.55, p90: 1.4 },
    sonnet: { median: 0.2, p90: 0.55 },
    haiku: { median: 0.05, p90: 0.15 },
  },
  judge: { median: 0.1, p90: 0.25 },
};

const CLASSIFIER_USD_PER_CALL_DEFAULT = 0.00015;

const EMPTY_ENV = 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=\n';

const HOST_ALLOWED = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'Skill',
  'Agent',
  'Task',
  'TodoWrite',
  'mcp__wiser-gateway__search_actions',
  'mcp__wiser-gateway__describe_action',
  'mcp__wiser-gateway__list_connections',
];

const SCORE_DISALLOWED = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Agent',
  'Task',
  'Skill',
  'NotebookEdit',
  'TodoWrite',
];

/**
 * Scoring prompt. The packet replaces {{PACKET}} so the output contract
 * stays first and last. Score what is on the page.
 */
export const SCORING_PROMPT = `Output contract: reply with one fenced JSON block and nothing else, of the shape {"scores": {...}, "reasons": {...}}.

Score each rubric item 1 only when the deliverable fully meets the item as written. Score 0 when it does not, meets it in part, or it cannot be told. Score what is on the page, not a review the deliverable says it ran. Give one short reason for each 0.

{{PACKET}}

Output contract: reply with one fenced JSON block and nothing else, of the shape {"scores": {...}, "reasons": {...}}.
`;

const USAGE = `Usage: trial.mjs <command> [flags]

Commands:
  help, --help
      Print this usage and exit 0. Reads nothing.
  plan --work <abs dir> [--ceiling-file <abs file>]
      Read <work>/spec.json, write <work>/plan.json, print the plan.
  ceiling --ceiling-file <abs file> --usd <number>
      Write {"usd": n, "set": "YYYY-MM-DD"}. Refuses a non-positive or non-finite number.
  run --work <abs dir> [--go] [--keep-temp] [--key-file <abs file>]
      Run the paired trial in plan.order. Refuses when plan.json is missing, and
      when plan.json says needs_go and --go is absent.
  blind --work <abs dir> [--seed <n>]
      Write blind packets and blind/map.json for every valid run.
  score --work <abs dir> [--model <id>]
      Score each packet that has no score yet.
  report --work <abs dir>
      Write <work>/verdict.json and print it.
  keyscan --work <abs dir> [--key-file <abs file>] [<extra abs dir> ...]
      Scan named directories for the classifier key. Prints counts, the key's
      length, and the first 12 hex of its sha256. Exit 0 when the verdict is
      clean; otherwise the same object goes to stderr and the exit is 1.

--work is the trial directory in the owning root. It is screened and refused
inside this plugin or inside the directory that holds --key-file.
--key-file defaults to the platform auth-provider.env of the real home.
Paths are absolute. An unknown flag is refused by that name.

Success prints one JSON object and exits 0. Failure prints to stderr only and
exits 1. The script writes under --work and under a temp directory, never
inside its own directory. Temp state is removed at the end of run unless
--keep-temp is passed.

WISER_TRIAL_HOST, when set, names an executable run in place of claude with
the same argv. It is a test seam, read only by this script, and it is not
passed to the host.
`;

const COMMANDS = new Set(['plan', 'ceiling', 'run', 'blind', 'score', 'report', 'keyscan']);

const FLAGS = {
  plan: { value: ['--work', '--ceiling-file'], bare: [] },
  ceiling: { value: ['--ceiling-file', '--usd'], bare: [] },
  run: { value: ['--work', '--key-file'], bare: ['--go', '--keep-temp'] },
  blind: { value: ['--work', '--seed'], bare: [] },
  score: { value: ['--work', '--model'], bare: [] },
  report: { value: ['--work'], bare: [] },
  keyscan: { value: ['--work', '--key-file'], bare: [], rest: true },
};

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded interleaved order. Each case-repeat is kept as a pair so one arm
 * cannot occupy the whole prefix. Repeats are 1-based.
 * @param {string[]} caseIds
 * @param {number} repeats
 * @param {number} seed
 * @returns {string[]}
 */
export function seededOrder(caseIds, repeats, seed) {
  const pairs = [];
  for (const id of caseIds) {
    for (let r = 1; r <= repeats; r += 1) pairs.push([id, r]);
  }
  const rng = mulberry32(Number(seed) >>> 0);
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = pairs[i];
    pairs[i] = pairs[j];
    pairs[j] = swap;
  }
  const order = [];
  for (const [id, r] of pairs) {
    const cFirst = rng() < 0.5;
    if (cFirst) order.push(`${id}-C-${r}`, `${id}-E-${r}`);
    else order.push(`${id}-E-${r}`, `${id}-C-${r}`);
  }
  return order;
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function medianOf(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2) return xs[mid];
  return (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Nearest-rank p90.
 * @param {number[]} values
 * @returns {number | null}
 */
function p90Of(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil(0.9 * xs.length) - 1));
  return xs[idx];
}

/**
 * @param {string} model
 * @returns {{ median: number, p90: number } | null}
 */
function defaultHostFigures(model) {
  const id = String(model || '').toLowerCase();
  for (const name of ['opus', 'sonnet', 'haiku']) {
    if (id.includes(name)) return COST_TABLE.host[name];
  }
  return null;
}

/**
 * @param {string} message
 * @returns {Error}
 */
function fail(message) {
  const error = new Error(message);
  error.trialFailure = true;
  return error;
}

/**
 * @param {string} p
 * @returns {string}
 */
function canonicalPath(p) {
  let base = resolve(p);
  const below = [];
  while (!existsSync(base)) {
    const parent = dirname(base);
    if (parent === base) throw fail(`path cannot be resolved: ${p}`);
    below.unshift(base.slice(parent.length + 1));
    base = parent;
  }
  let real;
  try {
    real = realpathSync(base);
  } catch {
    throw fail(`path cannot be resolved: ${p}`);
  }
  return below.length ? join(real, ...below) : real;
}

/**
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isWithin(child, parent) {
  let parentStat;
  try {
    parentStat = statSync(realpathSync(parent));
  } catch {
    return false;
  }
  let dir;
  try {
    dir = canonicalPath(child);
  } catch {
    return false;
  }
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
  try {
    dir = realpathSync(dir);
  } catch {
    return false;
  }
  for (;;) {
    let st;
    try {
      st = statSync(dir);
    } catch {
      return false;
    }
    if (st.dev === parentStat.dev && st.ino === parentStat.ino) return true;
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

/**
 * Screen a caller-named path. Returns the canonical path.
 * @param {string} label
 * @param {string} raw
 * @param {{ refuseDirs?: string[], mustExist?: boolean }} [opts]
 * @returns {string}
 */
function screenPath(label, raw, opts = {}) {
  if (typeof raw !== 'string' || raw.length === 0) throw fail(`${label} needs a path.`);
  if (!isAbsolute(raw)) throw fail(`${label} must be an absolute path. Got "${raw}".`);
  const canon = canonicalPath(raw);
  if (opts.mustExist && !existsSync(canon)) throw fail(`${label} does not exist: ${canon}`);
  for (const dir of opts.refuseDirs || []) {
    if (dir && isWithin(canon, dir)) {
      throw fail(`${label} resolves inside ${dir}. Pass a path outside it. Run trial.mjs help.`);
    }
  }
  if (isWithin(canon, PLUGIN_ROOT)) {
    throw fail(`${label} resolves inside the plugin (${PLUGIN_ROOT}). Pass a path outside it. Run trial.mjs help.`);
  }
  if (isWithin(canon, SCRIPT_DIR)) {
    throw fail(`${label} resolves inside the script directory. Run trial.mjs help.`);
  }
  return canon;
}

/**
 * @param {string} value
 * @returns {Record<string, string>}
 */
function parseFrontmatter(text) {
  const out = {};
  if (typeof text !== 'string' || !text.startsWith('---')) return out;
  const nl = text.indexOf('\n');
  if (nl < 0) return out;
  const rest = text.slice(nl + 1);
  const end = rest.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (end < 0) return out;
  for (const raw of rest.slice(0, end).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim();
  }
  return out;
}

/**
 * @param {string} text
 * @param {Record<string, string>} updates
 * @returns {string}
 */
function setFrontmatter(text, updates) {
  const keysLeft = { ...updates };
  if (typeof text !== 'string' || !text.startsWith('---')) {
    const lines = Object.entries(updates).map(([k, v]) => `${k}: ${v}`);
    return `---\n${lines.join('\n')}\n---\n\n${text || ''}`;
  }
  const nl = text.indexOf('\n');
  const rest = text.slice(nl + 1);
  const end = rest.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (end < 0) {
    const lines = Object.entries(updates).map(([k, v]) => `${k}: ${v}`);
    return `---\n${lines.join('\n')}\n---\n\n${text}`;
  }
  const fm = rest.slice(0, end);
  const match = rest.slice(end).match(/\r?\n---\s*(?:\r?\n|$)/);
  const after = rest.slice(end + (match ? match[0].length : 0));
  const next = [];
  for (const raw of fm.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^([A-Za-z0-9_]+):/);
    if (m && Object.prototype.hasOwnProperty.call(keysLeft, m[1])) {
      next.push(`${m[1]}: ${keysLeft[m[1]]}`);
      delete keysLeft[m[1]];
    } else next.push(line);
  }
  for (const [k, v] of Object.entries(keysLeft)) next.push(`${k}: ${v}`);
  const body = after.startsWith('\n') ? after : `\n${after}`;
  return `---\n${next.join('\n')}\n---${body.startsWith('\n') ? body : `\n${body}`}`;
}

/**
 * @param {string} root
 * @param {(abs: string, rel: string, ent: import('node:fs').Dirent) => void} onFile
 * @param {{ skipGit?: boolean }} [opts]
 */
function walkFiles(root, onFile, opts = {}) {
  if (!existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (opts.skipGit && ent.name === '.git') continue;
      const abs = join(dir, ent.name);
      if (ent.isSymbolicLink()) {
        onFile(abs, relative(root, abs).split(sep).join('/'), ent);
        continue;
      }
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) onFile(abs, relative(root, abs).split(sep).join('/'), ent);
    }
  }
}

/**
 * sha256 over sorted relative path and file sha256 pairs.
 * @param {string} root
 * @returns {string}
 */
function contentDigest(root) {
  const pairs = [];
  walkFiles(root, (abs, rel, ent) => {
    if (ent.isSymbolicLink()) {
      let target = '';
      try { target = readlinkSync(abs); } catch { target = ''; }
      pairs.push([rel, createHash('sha256').update(`symlink:${target}`).digest('hex')]);
      return;
    }
    if (!ent.isFile()) return;
    let bytes;
    try { bytes = readFileSync(abs); } catch { return; }
    pairs.push([rel, createHash('sha256').update(bytes).digest('hex')]);
  }, { skipGit: true });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const body = pairs.map(([p, h]) => `${p}\t${h}`).join('\n');
  return createHash('sha256').update(body).digest('hex');
}

/**
 * @param {string} dir
 * @returns {Record<string, string>}
 */
function hashFiles(dir) {
  const out = {};
  walkFiles(dir, (abs, _rel, ent) => {
    if (ent.isSymbolicLink()) {
      let target = '';
      try { target = readlinkSync(abs); } catch { target = ''; }
      out[abs] = createHash('sha256').update(`symlink:${target}`).digest('hex');
      return;
    }
    if (!ent.isFile()) return;
    try {
      out[abs] = createHash('sha256').update(readFileSync(abs)).digest('hex');
    } catch { /* unreadable file is a change the next walk still names */ }
  });
  return out;
}

/**
 * @param {string} file
 * @returns {string | null}
 */
function hashOne(file) {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The pid a presence file names, or null.
 * @param {string} file
 * @returns {number | null}
 */
function presencePid(file) {
  try {
    const pid = JSON.parse(readFileSync(file, 'utf8')).pid;
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * The process and its ancestors, nearest first; empty when `ps` does not know the pid.
 * @param {number} pid
 * @returns {number[]}
 */
function ancestorsOf(pid) {
  const chain = [];
  let cur = pid;
  while (Number.isInteger(cur) && cur > 1 && chain.length < 64) {
    let out = '';
    try {
      out = execFileSync('ps', ['-o', 'ppid=', '-p', String(cur)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      break;
    }
    chain.push(cur);
    const next = Number.parseInt(out, 10);
    if (!Number.isInteger(next) || next === cur) break;
    cur = next;
  }
  return chain;
}

/**
 * Watches every other harness's presence file under the real gateway home while
 * the runs go, and records, the first time a file names a pid, whether that
 * process was alive and whether this script is among its ancestors. Another
 * session's gateway, a reviewer's especially, often exits before the runs end,
 * so it is judged when it writes rather than afterwards.
 * @param {string} realGateway
 */
function watchPresence(realGateway) {
  const seen = new Map();
  const dir = join(realGateway, 'classifier-status');
  const poll = () => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = join(dir, name);
      const pid = presencePid(file);
      const key = `${file}\0${pid}`;
      if (pid == null || seen.has(key)) continue;
      const chain = ancestorsOf(pid);
      seen.set(key, {
        path: file,
        pid,
        alive: chain[0] === pid,
        ours: chain.includes(process.pid),
        ancestors: chain,
        at: new Date().toISOString(),
      });
    }
  };
  poll();
  const timer = setInterval(poll, 2000);
  return {
    seen,
    finish() {
      clearInterval(timer);
      poll();
      return [...seen.values()];
    },
  };
}

/**
 * Judges what changed in the real gateway home and the key file between the
 * before-hash and the after-hash. A trial's gateway and hooks run in its own
 * trial home, so what one could leave behind here is its session id in a file
 * or its own process in a presence file; the person's other sessions write here
 * all the time. So:
 * - the key file changing stops the run;
 * - a presence file, `classifier-status/<harness>.json`, `claude-code.json`
 *   included, is attributed when the watcher saw the process it names alive and
 *   outside this script's process tree, and stops the run otherwise;
 * - any other change is attributed only when every presence file that changed
 *   was attributed and no file here names a trial session id, and stops the run
 *   otherwise.
 * @param {string[]} changed
 * @param {string} realGateway
 * @param {Map<string, object>} seen
 * @param {{ keyFile: string, sessionIds: string[] }} opts
 * @returns {{ stops: string[], attributed: object[] }}
 */
function judgeChanges(changed, realGateway, seen, opts) {
  const stops = [];
  const attributed = [];
  const dir = join(realGateway, 'classifier-status');
  const rest = [];
  for (const file of changed) {
    if (file === opts.keyFile) { stops.push(file); continue; }
    const presence = dirname(file) === dir && file.endsWith('.json');
    if (!presence) { rest.push(file); continue; }
    const pid = existsSync(file) ? presencePid(file) : null;
    const obs = pid == null ? null : seen.get(`${file}\0${pid}`);
    if (obs && obs.alive && !obs.ours) attributed.push(obs);
    else stops.push(file);
  }
  const named = [];
  for (const id of opts.sessionIds || []) {
    if (id) named.push(...filesContaining(realGateway, id));
  }
  for (const file of rest) {
    if (stops.length === 0 && named.length === 0) attributed.push({ path: file, reason: 'another live session: every changed presence file attributed and no trial session named' });
    else stops.push(file);
  }
  for (const file of named) if (!stops.includes(file)) stops.push(file);
  return { stops, attributed };
}

/**
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 * @returns {string[]}
 */
function changedPaths(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((p) => before[p] !== after[p]).sort();
}

/**
 * @param {string} model
 * @param {string} work
 * @returns {number[]}
 */
function historyUsd(model, work) {
  const parent = dirname(work);
  const found = [];
  walkFiles(parent, (abs, _rel, ent) => {
    if (!ent.isFile() || !abs.endsWith(`${sep}meta.json`)) return;
    let doc;
    try { doc = JSON.parse(readFileSync(abs, 'utf8')); } catch { return; }
    if (!doc || typeof doc !== 'object') return;
    if (doc.model !== model) return;
    if (typeof doc.usd !== 'number' || !Number.isFinite(doc.usd)) return;
    found.push(doc.usd);
  });
  return found;
}

/**
 * @param {unknown} spec
 * @param {string} tree
 */
function validateSpec(spec, tree) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw fail('spec.json must be one JSON object. Run trial.mjs help.');
  }
  if (spec.kind !== 'routing' && spec.kind !== 'seam') {
    throw fail(`kind must be "routing" or "seam"; got ${JSON.stringify(spec.kind)}. Run trial.mjs help.`);
  }
  if (!Array.isArray(spec.cases) || spec.cases.length === 0) {
    throw fail('spec has no cases. Add at least one case with id, ask, and rubric.');
  }
  spec.cases.forEach((item, index) => {
    const where = item && typeof item.id === 'string' && item.id ? `case ${item.id}` : `case ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail(`${where} is not an object.`);
    if (typeof item.id !== 'string' || item.id.length === 0) throw fail(`${where} has no id.`);
    if (typeof item.ask !== 'string' || item.ask.length === 0) throw fail(`${where} has no ask.`);
    if (!Array.isArray(item.rubric) || item.rubric.length === 0) throw fail(`${where} has no rubric.`);
    for (const rub of item.rubric) {
      if (!rub || typeof rub.id !== 'string' || rub.id.length === 0) {
        throw fail(`${where} rubric item has no id.`);
      }
    }
    if (item.none === true) {
      const ids = item.rubric.map((rub) => rub.id);
      if (typeof item.none_item !== 'string' || !ids.includes(item.none_item)) {
        throw fail(`${where} has none: true and needs none_item set to one of its rubric ids.`);
      }
    }
  });
  if (!spec.cases.some((item) => item.none === true)) {
    throw fail('spec needs at least one case with "none": true.');
  }
  if (!Number.isInteger(spec.repeats) || spec.repeats < 3) {
    throw fail(`repeats must be an integer of 3 or more; got ${JSON.stringify(spec.repeats)}.`);
  }
  if (typeof spec.tree !== 'string' || !isAbsolute(spec.tree)) {
    throw fail('tree must be an absolute path.');
  }
  if (typeof spec.classifier !== 'string' || !isAbsolute(spec.classifier)) {
    throw fail('classifier must be an absolute path.');
  }
  if (!existsSync(join(tree, 'gateway', 'server.js'))) {
    throw fail(`tree has no gateway/server.js: ${tree}`);
  }
  if (!existsSync(join(tree, 'skills', 'AGENTS.md'))) {
    throw fail(`tree has no skills/AGENTS.md: ${tree}`);
  }
}

/**
 * @param {object} spec
 * @param {string} work
 * @param {number | null} ceiling
 * @returns {object}
 */
function buildPlan(spec, work, ceiling) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw fail('spec.json must be one JSON object. Run trial.mjs help.');
  }
  if (typeof spec.tree !== 'string' || !isAbsolute(spec.tree)) throw fail('tree must be an absolute path.');
  if (typeof spec.classifier !== 'string' || !isAbsolute(spec.classifier)) throw fail('classifier must be an absolute path.');
  const tree = canonicalPath(spec.tree);
  validateSpec(spec, tree);
  const classifier = canonicalPath(spec.classifier);
  if (!existsSync(classifier)) throw fail(`classifier does not exist: ${classifier}`);
  const cases = spec.cases;
  const repeats = spec.repeats;
  const hostRuns = cases.length * repeats * 2;
  const judgeRuns = hostRuns;
  const cRuns = cases.length * repeats;
  const perCall = spec.kind === 'routing'
    ? 2
    : (Number.isInteger(spec.calls_per_run) && spec.calls_per_run > 0 ? spec.calls_per_run : 2);
  const classifierCalls = perCall * cRuns;

  let usdPerRun = null;
  let usdP90 = null;
  let source = 'default';
  if (typeof spec.usd_per_run === 'number' && Number.isFinite(spec.usd_per_run)) {
    usdPerRun = spec.usd_per_run;
    usdP90 = spec.usd_per_run;
    source = 'spec';
  } else {
    const past = historyUsd(typeof spec.model === 'string' ? spec.model : '', work);
    if (past.length > 0) {
      usdPerRun = medianOf(past);
      usdP90 = p90Of(past);
      source = 'history';
    } else {
      const figures = defaultHostFigures(spec.model);
      source = 'default';
      if (figures) {
        usdPerRun = figures.median;
        usdP90 = figures.p90;
      }
    }
  }

  const judge = COST_TABLE.judge;
  const usdExpected = usdPerRun == null ? null : hostRuns * usdPerRun + judgeRuns * judge.median;
  const usdWorst = usdP90 == null ? null : hostRuns * usdP90 + judgeRuns * judge.p90;
  const needsGo = ceiling == null || usdWorst == null || usdWorst > ceiling;
  const seed = Number.isFinite(spec.seed) ? spec.seed : 1;
  return {
    host_runs: hostRuns,
    judge_runs: judgeRuns,
    classifier_calls_estimate: classifierCalls,
    usd_per_run: usdPerRun,
    source,
    usd_p90: usdP90,
    usd_expected: usdExpected,
    usd_worst: usdWorst,
    ceiling_usd: ceiling,
    needs_go: needsGo,
    order: seededOrder(cases.map((item) => item.id), repeats, seed),
  };
}

/**
 * @param {string} file
 * @returns {number | null}
 */
function readCeiling(file) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw fail(`ceiling file is not JSON: ${file}`);
  }
  if (!doc || typeof doc.usd !== 'number' || !Number.isFinite(doc.usd) || doc.usd <= 0) {
    throw fail(`ceiling file needs a positive finite usd: ${file}`);
  }
  return doc.usd;
}

/**
 * @param {string} work
 * @returns {object}
 */
function readSpec(work) {
  const file = join(work, 'spec.json');
  if (!existsSync(file)) throw fail(`no spec.json in ${work}. Write the trial spec there.`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw fail(`spec.json is not JSON: ${file}`);
  }
}

function todayStamp() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param {string} cmd
 * @returns {boolean}
 */
function commandOnPath(cmd) {
  if (typeof cmd !== 'string' || cmd.length === 0) return false;
  if (cmd.includes('/') || isAbsolute(cmd)) {
    try { return statSync(cmd).isFile(); } catch { return false; }
  }
  return (process.env.PATH || '').split(delimiter).some((dir) => {
    if (!dir) return false;
    try { return statSync(join(dir, cmd)).isFile(); } catch { return false; }
  });
}

/**
 * Child environment: drop CLAUDE* (except CLAUDE_CONFIG_DIR), WISER_*, and LAUNCHER_*.
 * @returns {NodeJS.ProcessEnv}
 */
function childEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('WISER_') || key.startsWith('LAUNCHER_')) continue;
    if (key.startsWith('CLAUDE') && key !== 'CLAUDE_CONFIG_DIR') continue;
    env[key] = value;
  }
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  return env;
}

/**
 * @param {string} home
 * @param {'C' | 'E'} arm
 * @param {string} keyFile
 * @returns {string}
 */
function makeTrialHome(home, arm, keyFile) {
  const cfg = wiserUserConfigDir(process.platform, process.env, home);
  mkdirSync(cfg, { recursive: true, mode: 0o700 });
  try { chmodSync(cfg, 0o700); } catch { /* platform may ignore */ }
  const envFile = join(cfg, 'auth-provider.env');
  if (arm === 'C') symlinkSync(keyFile, envFile);
  else {
    writeFileSync(envFile, EMPTY_ENV, { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(envFile, 0o600); } catch { /* created with mode */ }
  }
  return home;
}

/**
 * @param {string} repo
 * @param {string} commit
 * @param {string} dest
 * @returns {Promise<void>}
 */
function exportCommit(repo, commit, dest) {
  return new Promise((resolvePromise, reject) => {
    mkdirSync(dest, { recursive: true });
    const git = spawn('git', ['-C', repo, 'archive', '--format=tar', commit], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tar = spawn('tar', ['-x', '-C', dest], { stdio: ['pipe', 'ignore', 'pipe'] });
    let gitErr = '';
    let tarErr = '';
    git.stderr.on('data', (chunk) => { gitErr += chunk; });
    tar.stderr.on('data', (chunk) => { tarErr += chunk; });
    git.stdout.pipe(tar.stdin);
    git.on('error', reject);
    tar.on('error', reject);
    let gitCode = null;
    let tarCode = null;
    const finish = () => {
      if (gitCode === null || tarCode === null) return;
      if (gitCode !== 0 || tarCode !== 0) {
        reject(fail(`git archive ${commit} failed: ${(gitErr || tarErr).trim() || `git ${gitCode}, tar ${tarCode}`}`));
        return;
      }
      resolvePromise();
    };
    git.on('close', (code) => { gitCode = code; finish(); });
    tar.on('close', (code) => { tarCode = code; finish(); });
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(contentToText).join('\n');
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content != null) return contentToText(content.content);
  }
  return '';
}

/**
 * @param {object} event
 * @returns {string[]}
 */
function toolResultTexts(event) {
  const texts = [];
  const visit = (node, parentTool) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parentTool);
      return;
    }
    if (node.type === 'tool_result') {
      texts.push(contentToText(node.content != null ? node.content : node.text));
      return;
    }
    for (const value of Object.values(node)) visit(value, parentTool);
  };
  visit(event, false);
  return texts;
}

/**
 * @param {string} tree
 * @returns {{ rel: string, nameLine: string, typeLine: string }[]}
 */
function typedCandidates(tree) {
  const out = [];
  for (const family of [['skills', 'SKILL.md', 'skill'], ['experts', 'EXPERT.md', 'expert']]) {
    const [dirName, fileName, typeName] = family;
    const dir = join(tree, dirName);
    if (!existsSync(dir)) continue;
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const file = join(dir, name, fileName);
      if (!existsSync(file)) continue;
      let text = '';
      try { text = readFileSync(file, 'utf8'); } catch { continue; }
      const fm = parseFrontmatter(text);
      const fmName = fm.name || name;
      const fmType = fm.type || typeName;
      out.push({
        rel: `${dirName}/${name}/${fileName}`,
        nameLine: `name: ${fmName}`,
        typeLine: `type: ${fmType}`,
      });
    }
  }
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

/**
 * @param {string} stdout
 * @param {{ rel: string, nameLine: string, typeLine: string }[]} candidates
 */
function parseStream(stdout, candidates) {
  let result = null;
  let sessionId = null;
  const opened = [];
  const seen = new Set();
  for (const line of String(stdout || '').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event && typeof event.session_id === 'string' && event.session_id && !sessionId) {
      sessionId = event.session_id;
    }
    if (event && event.type === 'result') {
      result = event;
      if (typeof event.session_id === 'string' && event.session_id) sessionId = event.session_id;
    }
    for (const text of toolResultTexts(event)) {
      for (const candidate of candidates) {
        if (seen.has(candidate.rel)) continue;
        if (text.includes(candidate.nameLine) && text.includes(candidate.typeLine)) {
          seen.add(candidate.rel);
          opened.push(candidate.rel);
        }
      }
    }
  }
  return { result, sessionId, opened };
}

/**
 * @param {string} home
 * @returns {object[]}
 */
function auditLines(home) {
  const lines = [];
  walkFiles(home, (abs, _rel, ent) => {
    if (ent.isSymbolicLink() || !ent.isFile()) return;
    if (abs.endsWith(`${sep}auth-provider.env`)) return;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { return; }
    for (const line of text.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      try {
        const doc = JSON.parse(line);
        if (doc && typeof doc === 'object' && typeof doc.op === 'string') lines.push(doc);
      } catch { /* not an audit line */ }
    }
  });
  return lines;
}

/**
 * @param {string} dir
 * @param {string} needle
 * @returns {string[]}
 */
function filesContaining(dir, needle) {
  if (!needle || !existsSync(dir)) return [];
  const buf = Buffer.from(needle);
  const hits = [];
  walkFiles(dir, (abs, _rel, ent) => {
    if (ent.isSymbolicLink()) {
      if (abs.includes(needle)) hits.push(abs);
      return;
    }
    if (!ent.isFile()) return;
    if (abs.includes(needle)) {
      hits.push(abs);
      return;
    }
    try {
      if (readFileSync(abs).includes(buf)) hits.push(abs);
    } catch { /* skip unreadable */ }
  });
  return hits;
}

/**
 * @param {string[]} argv
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, deadlineS: number }} opts
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean, error: string | null }>}
 */
function spawnHost(argv, opts) {
  return new Promise((resolvePromise) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: opts.cwd,
      env: opts.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const killGroup = (signal) => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGKILL');
    }, Math.max(1, opts.deadlineS) * 1000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 32_000_000) {
        timedOut = true;
        killGroup('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000);
    });
    child.on('error', (error) => {
      finish({ code: null, stdout, stderr, timedOut, error: error.message });
    });
    child.on('close', (code) => {
      finish({ code, stdout, stderr, timedOut, error: null });
    });
  });
}

/**
 * @param {string} id
 * @returns {{ caseId: string, arm: string, repeat: number } | null}
 */
function parseRunId(id) {
  const match = /^(.*)-(C|E)-(\d+)$/.exec(id);
  if (!match) return null;
  return { caseId: match[1], arm: match[2], repeat: Number(match[3]) };
}

/**
 * @param {{ server: string, classifier: string, secrets: string, trialHome: string }} opts
 * @returns {Promise<string | null>}
 */
function lockProof(opts) {
  const args = [
    opts.server,
    '--harness', 'claude-code',
    '--classifier', opts.classifier,
    '--provider', 'local-file',
    '--secrets', opts.secrets,
  ];
  const env = { ...process.env, HOME: opts.trialHome };
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.on('error', () => {});
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    let status = null;
    let stderr = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
      }
      resolvePromise({ status: value, stderr });
    };
    const timer = setTimeout(() => finish(null), 120000);
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (!msg || msg.id !== 2) return;
      const content = msg.result && Array.isArray(msg.result.content) ? msg.result.content : [];
      for (const block of content) {
        try {
          const body = JSON.parse(block.text || '');
          if (body && typeof body.status === 'string') status = body.status;
        } catch { /* not the result body */ }
      }
      finish(status);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => finish(null));
    child.on('close', () => finish(status));
    const rpc = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'wiser-trial', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'execute', arguments: { action: 'google.gmail.list_messages', input: {} } } },
    ];
    child.stdin.write(`${rpc.map((msg) => JSON.stringify(msg)).join('\n')}\n`);
    child.stderr.on('end', () => {
      if (stderr.length > 800) stderr = stderr.slice(0, 800);
    });
  });
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {object} spec
 */
function copyRoot(src, dest, spec, fromTemplate) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    dereference: false,
    filter: (path) => {
      const base = path.split(sep).pop();
      return base !== '.git';
    },
  });
  const agents = join(dest, 'AGENTS.md');
  let text = '';
  try { text = readFileSync(agents, 'utf8'); } catch {
    throw fail(`root copy has no AGENTS.md: ${dest}`);
  }
  // Only a root built from the template is given a declaration; a root the person names keeps its own.
  if (fromTemplate) {
    writeFileSync(agents, setFrontmatter(text, {
      root: 'trial',
      type: 'personal',
      classifier_refusal: 'no',
    }));
  }
  const files = spec.root_files && typeof spec.root_files === 'object' ? spec.root_files : {};
  for (const [rel, content] of Object.entries(files)) {
    if (typeof rel !== 'string' || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      throw fail(`root_files path escapes the root: ${rel}`);
    }
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof content === 'string' ? content : String(content));
  }
}

/**
 * @param {string[]} argv
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, deadlineS: number }} opts
 * @returns {Promise<{ stdout: string, stderr: string, timedOut: boolean, error: string | null }>}
 */
async function runHost(argv, opts) {
  return spawnHost(argv, opts);
}

/**
 * @param {object} spec
 * @param {object} plan
 * @param {object} flags
 * @param {string} work
 * @param {string} keyFile
 * @returns {Promise<object>}
 */
async function commandRun(spec, plan, flags, work, keyFile) {
  const keep = flags['--keep-temp'] === true;
  const temp = mkdtempSync(join(tmpdir(), 'wiser-classifier-trial-'));
  const secrets = join(temp, 'secrets');
  mkdirSync(secrets, { mode: 0o700 });
  try { chmodSync(secrets, 0o700); } catch { /* umask */ }
  mkdirSync(join(temp, 'homes'));
  mkdirSync(join(temp, 'roots'));
  let removed = false;
  const removeTemp = () => {
    if (keep || removed) return;
    rmSync(temp, { recursive: true, force: true });
    removed = true;
  };
  try {
    const keyPresent = readClassifierKey(keyFile) != null;
    if (!existsSync(keyFile) || !keyPresent) {
      throw fail('key_present: false. The key file has no WISER_CLASSIFIER_KEY value. Set that line and re-run.');
    }
    const classifier = canonicalPath(spec.classifier);
    if (!existsSync(classifier) || !statSync(classifier).isDirectory()) {
      throw fail(`classifier directory does not exist: ${classifier}`);
    }
    const hostBin = process.env.WISER_TRIAL_HOST || 'claude';
    if (!commandOnPath(hostBin)) {
      throw fail(`${hostBin === 'claude' ? 'claude' : 'WISER_TRIAL_HOST'} is not on the path. Install the host or set WISER_TRIAL_HOST to an executable.`);
    }

    let tree = canonicalPath(spec.tree);
    let commit = null;
    if (typeof spec.commit === 'string' && spec.commit.length > 0) {
      commit = spec.commit;
      const exported = join(temp, 'tree');
      await exportCommit(tree, commit, exported);
      tree = exported;
    }
    const digest = contentDigest(tree);

    const fromTemplate = !(typeof spec.root === 'string' && spec.root.length > 0);
    const rootSrc = fromTemplate
      ? join(tree, 'system', 'templates', 'User Root Template')
      : canonicalPath(spec.root);
    if (!existsSync(rootSrc)) throw fail(`root source does not exist: ${rootSrc}`);

    const proofHome = join(temp, 'homes', 'lock-proof');
    mkdirSync(proofHome, { recursive: true });
    makeTrialHome(proofHome, 'C', keyFile);
    const proof = await lockProof({
      server: join(tree, 'gateway', 'server.js'),
      classifier,
      secrets,
      trialHome: proofHome,
    });
    const proofStatus = proof && proof.status;
    if (proofStatus !== 'needs_connect') {
      const detail = proof && proof.stderr
        ? ` ${String(proof.stderr).replace(/WISER_CLASSIFIER_KEY=\S*/g, 'WISER_CLASSIFIER_KEY=<redacted>').slice(0, 400)}`
        : '';
      throw fail(`lock proof returned ${proofStatus == null ? 'no answer' : proofStatus}, not needs_connect. No host run was started.${detail}`);
    }

    const realGateway = defaultGatewayHome();
    const before = hashFiles(realGateway);
    const keyHashBefore = hashOne(keyFile);
    if (keyHashBefore) before[keyFile] = keyHashBefore;
    const watch = watchPresence(realGateway);

    const candidates = typedCandidates(tree);
    const model = typeof spec.model === 'string' ? spec.model : '';
    const effort = typeof spec.effort === 'string' && spec.effort.length > 0 ? spec.effort : null;
    const maxTurns = Number.isInteger(spec.max_turns) && spec.max_turns > 0 ? spec.max_turns : 30;
    const deadlineS = Number.isFinite(spec.deadline_s) && spec.deadline_s > 0 ? spec.deadline_s : 720;
    const usageLog = spec.usage_log === true;
    const p90 = typeof plan.usd_p90 === 'number' && Number.isFinite(plan.usd_p90) ? plan.usd_p90 : 0;
    const cases = new Map(spec.cases.map((item) => [item.id, item]));
    const footprints = [];
    let spend = 0;
    let validCount = 0;

    for (const id of plan.order) {
      const parsed = parseRunId(id);
      if (!parsed || !cases.has(parsed.caseId)) throw fail(`plan.order id is not a case run: ${id}. Re-run plan.`);
      const caseSpec = cases.get(parsed.caseId);
      let meta = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const trialHome = join(temp, 'homes', id);
        rmSync(trialHome, { recursive: true, force: true });
        mkdirSync(trialHome, { recursive: true });
        makeTrialHome(trialHome, parsed.arm, keyFile);
        const root = join(temp, 'roots', id);
        copyRoot(rootSrc, root, spec, fromTemplate);
        const moved = { HOME: trialHome };
        let usagePath = null;
        if (usageLog) {
          usagePath = join(temp, `usage-${id}.log`);
          moved.WISER_EXP_USAGE_LOG = usagePath;
        }
        const mcpPath = join(temp, `mcp-${id}.json`);
        const mcp = {
          mcpServers: {
            'wiser-gateway': {
              type: 'stdio',
              command: 'node',
              args: [
                join(tree, 'gateway', 'server.js'),
                '--harness', 'claude-code',
                '--classifier', classifier,
                '--provider', 'local-file',
                '--secrets', secrets,
              ],
              env: moved,
            },
          },
        };
        writeFileSync(mcpPath, JSON.stringify(mcp));
        const settings = { env: moved };
        const argv = [
          hostBin,
          '-p', caseSpec.ask,
          '--model', model,
        ];
        if (effort) argv.push('--effort', effort);
        argv.push(
          '--output-format', 'stream-json',
          '--verbose',
          '--strict-mcp-config',
          '--mcp-config', mcpPath,
          '--plugin-dir', tree,
          '--add-dir', tree,
          '--max-turns', String(maxTurns),
          '--setting-sources', 'project,local',
          '--no-session-persistence',
          '--settings', JSON.stringify(settings),
          '--permission-mode', 'acceptEdits',
          '--allowedTools',
          ...HOST_ALLOWED,
        );
        const started = Date.now();
        const run = await runHost(argv, { cwd: root, env: childEnv(), deadlineS });
        const wall = Date.now() - started;
        const parsedStream = parseStream(run.stdout, candidates);
        const result = parsedStream.result;
        const reasons = [];
        if (run.error) reasons.push(`spawn: ${run.error}`);
        if (run.timedOut) reasons.push('deadline');
        if (!result) reasons.push('no result event');
        else if (result.subtype !== 'success') reasons.push(`subtype ${result.subtype == null ? 'missing' : result.subtype}`);
        const valid = reasons.length === 0;
        let usd = 0;
        if (!result) usd = p90;
        else if (typeof result.total_cost_usd === 'number' && Number.isFinite(result.total_cost_usd)) usd = result.total_cost_usd;
        const audit = auditLines(trialHome);
        const firstParty = audit
          .filter((line) => typeof line.action === 'string' && line.action.startsWith('wiser.'))
          .map((line) => ({
            action: line.action,
            status: line.status ?? null,
            reason: line.reason ?? null,
          }));
        let classifierCalls = 0;
        if (usageLog && usagePath && existsSync(usagePath)) {
          const text = readFileSync(usagePath, 'utf8');
          classifierCalls = text.split('\n').filter((line) => line.length > 0).length;
        } else {
          classifierCalls = firstParty.filter((line) => line.status === 'ok').length;
        }
        const opened = parsedStream.opened;
        let reached = null;
        if (spec.kind === 'routing') {
          if (caseSpec.expect === 'none') reached = opened.length === 0;
          else reached = opened.includes(caseSpec.expect);
        }
        const sessionId = parsedStream.sessionId || (result && result.session_id) || null;
        const bindingFile = sessionId
          ? join(defaultGatewayHome(trialHome), 'classifier-sessions', `${sessionId}.json`)
          : '';
        meta = {
          id,
          case: parsed.caseId,
          arm: parsed.arm,
          repeat: parsed.repeat,
          model,
          valid,
          invalid_reasons: reasons,
          usd,
          wall_ms: wall,
          turns: result && Number.isFinite(result.num_turns) ? result.num_turns : null,
          opened,
          first_opened: opened[0] || null,
          reached,
          classifier_calls: classifierCalls,
          first_party: firstParty,
          session_id: sessionId,
          binding_in_trial_home: Boolean(sessionId) && existsSync(bindingFile),
          at: new Date().toISOString(),
        };
        const runDir = join(work, 'runs', id);
        mkdirSync(runDir, { recursive: true });
        writeFileSync(join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
        const deliverable = result && typeof result.result === 'string' ? result.result : '';
        writeFileSync(join(runDir, 'deliverable.md'), deliverable);
        writeFileSync(join(runDir, 'stream.jsonl'), run.stdout);
        spend += usd;

        const escaped = audit.filter((line) => (
          line.op === 'execute'
          && typeof line.action === 'string'
          && !line.action.startsWith('wiser.')
          && line.status === 'ok'
        ));
        if (escaped.length) {
          throw fail(`a connector execute returned ok in ${id}: ${escaped.map((line) => line.action).join(', ')}`);
        }
        const sessionHits = sessionId ? filesContaining(realGateway, sessionId) : [];
        footprints.push({ id, session_id: sessionId, session_in_real_gateway: sessionHits });
        if (sessionHits.length) {
          throw fail(`session id of ${id} appears in the real gateway home: ${sessionHits.join(', ')}`);
        }
        if (valid) break;
        if (attempt === 2) {
          throw fail(`run ${id} was invalid twice (${reasons.join('; ')}).`);
        }
      }
      if (meta && meta.valid) validCount += 1;
      if (typeof plan.usd_worst === 'number' && Number.isFinite(plan.usd_worst) && spend > plan.usd_worst) {
        throw fail(`spend ${spend} passed the plan usd_worst ${plan.usd_worst}. Stopped after ${id}.`);
      }
    }

    const observed = watch.finish();
    const after = hashFiles(realGateway);
    const keyHashAfter = hashOne(keyFile);
    if (keyHashAfter) after[keyFile] = keyHashAfter;
    const changed = changedPaths(before, after);
    const { stops, attributed } = judgeChanges(changed, realGateway, watch.seen, {
      keyFile,
      sessionIds: footprints.map((f) => f.session_id).filter(Boolean),
    });
    const safety = {
      lock_proof: { status: 'needs_connect', action: 'google.gmail.list_messages' },
      before,
      after,
      changed,
      stops,
      attributed,
      presence_observed: observed,
      tree: { commit, digest },
      runs: footprints,
    };
    writeFileSync(join(work, 'safety.json'), `${JSON.stringify(safety, null, 2)}\n`);
    if (stops.length) {
      throw fail(`the real gateway home or key file changed:\n${stops.join('\n')}`);
    }
    removeTemp();
    return {
      ok: true,
      work,
      key_present: true,
      host_runs: plan.order.length,
      valid: validCount,
      tree: { commit, digest },
      lock_proof: 'needs_connect',
      spend_usd: spend,
      temp_dir: keep ? temp : temp,
      temp_removed: !keep,
    };
  } catch (error) {
    removeTemp();
    if (error && error.trialFailure) {
      error.message = `${error.message}\ntemp removed: ${keep ? 'kept ' : ''}${temp}`;
    }
    throw error;
  }
}

/**
 * @param {string} text
 * @returns {object | null}
 */
function lastFencedJson(text) {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  let last = null;
  while ((match = re.exec(String(text || '')))) last = match[1];
  if (last == null) return null;
  try { return JSON.parse(last); } catch { return null; }
}

/**
 * @param {string} stdout
 * @returns {{ doc: object | null, usd: number | null }}
 */
function parseJudgeOutput(stdout) {
  let resultText = stdout;
  let usd = null;
  const trimmed = String(stdout || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const outer = JSON.parse(trimmed);
      if (outer && typeof outer.result === 'string') resultText = outer.result;
      if (outer && typeof outer.total_cost_usd === 'number' && Number.isFinite(outer.total_cost_usd)) {
        usd = outer.total_cost_usd;
      }
    } catch { /* the body itself may be fenced text */ }
  }
  const doc = lastFencedJson(resultText) || lastFencedJson(stdout);
  return { doc, usd };
}

/**
 * @param {object} doc
 * @param {string[]} rubricIds
 * @returns {boolean}
 */
function scoresValid(doc, rubricIds) {
  if (!doc || typeof doc !== 'object' || !doc.scores || typeof doc.scores !== 'object') return false;
  for (const id of rubricIds) {
    const value = doc.scores[id];
    if (value !== 0 && value !== 1) return false;
  }
  return true;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  if (argv.length === 0) throw fail('a command is required. Run trial.mjs help.');
  if (argv.includes('help') || argv.includes('--help')) return { help: true };
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    if (command.startsWith('-')) throw fail(`unknown option "${command}". Run trial.mjs help.`);
    throw fail(`unknown command "${command}". Run trial.mjs help.`);
  }
  const spec = FLAGS[command];
  const valueFlags = new Set(spec.value);
  const bareFlags = new Set(spec.bare);
  const flags = {};
  const rest = [];
  for (let i = 1; i < argv.length; i += 1) {
    const word = argv[i];
    if (bareFlags.has(word)) {
      if (Object.prototype.hasOwnProperty.call(flags, word)) throw fail(`${word} was given more than once.`);
      flags[word] = true;
      continue;
    }
    if (valueFlags.has(word)) {
      if (Object.prototype.hasOwnProperty.call(flags, word)) throw fail(`${word} was given more than once.`);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw fail(`${word} needs a value.`);
      flags[word] = value;
      i += 1;
      continue;
    }
    if (word.startsWith('-')) throw fail(`unknown option "${word}". Run trial.mjs help.`);
    if (!spec.rest) throw fail(`unexpected argument "${word}". Run trial.mjs help.`);
    rest.push(word);
  }
  return { help: false, command, flags, rest };
}

/**
 * @param {string} raw
 * @param {string[]} refuseDirs
 * @returns {string}
 */
function screenWork(raw, refuseDirs = []) {
  let keyDir = null;
  try { keyDir = dirname(canonicalPath(defaultProviderEnvPath())); } catch { keyDir = null; }
  const dirs = [...(refuseDirs || [])];
  if (keyDir) dirs.push(keyDir);
  return screenPath('--work', raw, { mustExist: true, refuseDirs: dirs });
}

/**
 * @param {object} flags
 * @param {string[]} [extraRefuse]
 * @returns {string}
 */
function keyFileFrom(flags, extraRefuse = []) {
  const raw = flags['--key-file'] || defaultProviderEnvPath();
  return screenPath('--key-file', raw, { mustExist: false, refuseDirs: extraRefuse });
}

function positiveNumber(raw, label) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw fail(`${label} must be a positive finite number; got ${JSON.stringify(raw)}.`);
  return n;
}

/**
 * @param {string} command
 * @param {Record<string, string | true>} flags
 * @param {string[]} rest
 * @returns {Promise<object>}
 */
async function dispatch(command, flags, rest) {
  if (command === 'ceiling') {
    if (!flags['--ceiling-file']) throw fail('--ceiling-file is required. Run trial.mjs help.');
    if (flags['--usd'] === undefined) throw fail('--usd is required. Run trial.mjs help.');
    const usd = positiveNumber(flags['--usd'], '--usd');
    const file = screenPath('--ceiling-file', flags['--ceiling-file']);
    mkdirSync(dirname(file), { recursive: true });
    const doc = { usd, set: todayStamp() };
    writeFileSync(file, `${JSON.stringify(doc)}\n`);
    return doc;
  }

  if (command === 'plan') {
    if (!flags['--work']) throw fail('--work is required. Run trial.mjs help.');
    const work = screenWork(flags['--work']);
    let ceiling = null;
    if (flags['--ceiling-file']) {
      const file = screenPath('--ceiling-file', flags['--ceiling-file'], { mustExist: true });
      ceiling = readCeiling(file);
    }
    const spec = readSpec(work);
    const plan = buildPlan(spec, work, ceiling);
    writeFileSync(join(work, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    return plan;
  }

  if (command === 'run') {
    if (!flags['--work']) throw fail('--work is required. Run trial.mjs help.');
    const keyFile = flags['--key-file']
      ? screenPath('--key-file', flags['--key-file'], { mustExist: true })
      : defaultProviderEnvPath();
    const keyDir = dirname(keyFile);
    const work = screenWork(flags['--work'], [keyDir]);
    const planFile = join(work, 'plan.json');
    if (!existsSync(planFile)) throw fail(`no plan.json in ${work}. Run trial.mjs plan --work ${work}.`);
    let plan;
    try { plan = JSON.parse(readFileSync(planFile, 'utf8')); } catch {
      throw fail(`plan.json is not JSON: ${planFile}`);
    }
    if (!plan || !Array.isArray(plan.order)) throw fail('plan.json has no order. Run trial.mjs plan again.');
    if (plan.needs_go === true && flags['--go'] !== true) {
      throw fail('plan.json says needs_go. Re-run with --go after you accept the ceiling, or set a ceiling and re-run plan.');
    }
    const spec = readSpec(work);
    return commandRun(spec, plan, flags, work, keyFile);
  }

  if (command === 'blind') {
    if (!flags['--work']) throw fail('--work is required. Run trial.mjs help.');
    const work = screenWork(flags['--work']);
    const spec = readSpec(work);
    const seed = flags['--seed'] !== undefined ? Number(flags['--seed']) : (Number.isFinite(spec.seed) ? spec.seed : 1);
    if (!Number.isFinite(seed)) throw fail('--seed must be a finite number.');
    const cases = new Map((spec.cases || []).map((item) => [item.id, item]));
    const runDir = join(work, 'runs');
    const metas = [];
    if (existsSync(runDir)) {
      for (const name of readdirSync(runDir)) {
        const file = join(runDir, name, 'meta.json');
        if (!existsSync(file)) continue;
        try {
          const meta = JSON.parse(readFileSync(file, 'utf8'));
          if (meta && meta.valid === true) metas.push(meta);
        } catch { /* skip a broken record */ }
      }
    }
    metas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const packets = metas.map((meta) => {
      const oid = createHash('sha256').update(`${seed}:${meta.id}`).digest('hex').slice(0, 10);
      return { oid, meta };
    });
    const rng = mulberry32(Number(seed) >>> 0);
    for (let i = packets.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = packets[i];
      packets[i] = packets[j];
      packets[j] = swap;
    }
    const dir = join(work, 'blind', 'packets');
    mkdirSync(dir, { recursive: true });
    const map = {};
    const order = [];
    for (const packet of packets) {
      const meta = packet.meta;
      const caseSpec = cases.get(meta.case) || { ask: '', rubric: [] };
      let deliverable = '';
      try { deliverable = readFileSync(join(work, 'runs', meta.id, 'deliverable.md'), 'utf8'); } catch { deliverable = ''; }
      const rubric = (caseSpec.rubric || []).map((item) => `- ${item.id}: ${item.text}`).join('\n');
      const body = `## Ask\n\n${caseSpec.ask}\n\n## Rubric\n\n${rubric}\n\n## Deliverable\n\n${deliverable}`;
      writeFileSync(join(dir, `${packet.oid}.md`), body);
      map[packet.oid] = meta.id;
      order.push(packet.oid);
    }
    const doc = { seed, order, map };
    writeFileSync(join(work, 'blind', 'map.json'), `${JSON.stringify(doc, null, 2)}\n`);
    return doc;
  }

  if (command === 'score') {
    if (!flags['--work']) throw fail('--work is required. Run trial.mjs help.');
    const work = screenWork(flags['--work']);
    const spec = readSpec(work);
    const mapFile = join(work, 'blind', 'map.json');
    if (!existsSync(mapFile)) throw fail(`no blind/map.json in ${work}. Run trial.mjs blind --work ${work}.`);
    const mapDoc = JSON.parse(readFileSync(mapFile, 'utf8'));
    const cases = new Map((spec.cases || []).map((item) => [item.id, item]));
    const hostBin = process.env.WISER_TRIAL_HOST || 'claude';
    if (!commandOnPath(hostBin)) {
      throw fail(`${hostBin === 'claude' ? 'claude' : 'WISER_TRIAL_HOST'} is not on the path.`);
    }
    const deadlineS = Number.isFinite(spec.deadline_s) && spec.deadline_s > 0 ? spec.deadline_s : 120;
    const temp = mkdtempSync(join(tmpdir(), 'wiser-classifier-trial-'));
    const scoresDir = join(work, 'scores');
    mkdirSync(scoresDir, { recursive: true });
    let scored = 0;
    let unparsed = 0;
    try {
      const emptyMcp = join(temp, 'mcp.json');
      writeFileSync(emptyMcp, `${JSON.stringify({ mcpServers: {} })}\n`);
      for (const [oid, runId] of Object.entries(mapDoc.map || {})) {
        const dest = join(scoresDir, `${oid}.json`);
        if (existsSync(dest)) continue;
        const packetPath = join(work, 'blind', 'packets', `${oid}.md`);
        const packet = readFileSync(packetPath, 'utf8');
        const parsedId = parseRunId(runId);
        const caseSpec = parsedId ? cases.get(parsedId.caseId) : null;
        const rubricIds = caseSpec ? caseSpec.rubric.map((item) => item.id) : [];
        const prompt = SCORING_PROMPT.replace('{{PACKET}}', packet);
        let accepted = null;
        let usd = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const cwd = join(temp, `judge-${oid}-${attempt}`);
          mkdirSync(cwd, { recursive: true });
          const argv = [hostBin, '-p', prompt];
          if (flags['--model']) argv.push('--model', flags['--model']);
          argv.push(
            '--output-format', 'json',
            '--max-turns', '1',
            '--strict-mcp-config',
            '--mcp-config', emptyMcp,
            '--setting-sources', 'project,local',
            '--no-session-persistence',
            '--disallowedTools',
            ...SCORE_DISALLOWED,
          );
          const run = await runHost(argv, { cwd, env: childEnv(), deadlineS });
          const parsed = parseJudgeOutput(run.stdout);
          usd = parsed.usd;
          if (scoresValid(parsed.doc, rubricIds)) {
            accepted = parsed.doc;
            break;
          }
        }
        if (!accepted) {
          writeFileSync(dest, `${JSON.stringify({
            oid, status: 'unparsed', scores: null, reasons: null, score: null, usd: usd ?? null,
          }, null, 2)}\n`);
          unparsed += 1;
          continue;
        }
        const scores = {};
        for (const id of rubricIds) scores[id] = accepted.scores[id];
        const reasons = accepted.reasons && typeof accepted.reasons === 'object' ? accepted.reasons : {};
        const score = rubricIds.reduce((sum, id) => sum + scores[id], 0);
        writeFileSync(dest, `${JSON.stringify({ oid, scores, reasons, score, usd: usd ?? null }, null, 2)}\n`);
        scored += 1;
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    return { ok: true, work, scored, unparsed };
  }

  if (command === 'report') {
    if (!flags['--work']) throw fail('--work is required. Run trial.mjs help.');
    const work = screenWork(flags['--work']);
    return writeReport(work);
  }

  throw fail(`unknown command "${command}". Run trial.mjs help.`);
}

/**
 * Keyscan may look inside the plugin. Screen for absolute and canonical only.
 * @param {string} raw
 * @returns {string}
 */
function screenScanDir(raw) {
  if (typeof raw !== 'string' || !isAbsolute(raw)) throw fail(`directory must be an absolute path. Got ${JSON.stringify(raw)}.`);
  const canon = canonicalPath(raw);
  if (!existsSync(canon)) throw fail(`directory does not exist: ${canon}`);
  return canon;
}

/**
 * @param {string} work
 * @param {string} keyFile
 * @param {string[]} extraRaw
 * @returns {object}
 */
function commandKeyscan(work, keyFile, extraRaw) {
  const extras = extraRaw.map(screenScanDir);
  const key = readClassifierKey(existsSync(keyFile) ? keyFile : null);
  const doc = {
    verdict: 'instrument_failed',
    key_length: key ? key.length : 0,
    key_sha256_12: key ? createHash('sha256').update(key).digest('hex').slice(0, 12) : null,
    files_scanned: 0,
    hits: 0,
    hit_paths: [],
    controls: { memory: false, plant: false },
  };
  if (!key) return doc;
  doc.controls.memory = `control:${key}:control`.includes(key) && !'no-key-here'.includes(key);
  const token = randomBytes(16).toString('hex');
  const plant = join(work, '.wiser-trial-keyscan-plant');
  writeFileSync(plant, token);
  const dirs = [work, ...extras];
  const hits = [];
  let scanned = 0;
  let plantFound = false;
  const needle = Buffer.from(key);
  const tokenBuf = Buffer.from(token);
  for (const dir of dirs) {
    walkFiles(dir, (abs, _rel, ent) => {
      if (ent.isDirectory && ent.isDirectory()) return;
      if (!ent.isFile() && !ent.isSymbolicLink()) return;
      scanned += 1;
      let bytes;
      try { bytes = readFileSync(abs); } catch { return; }
      if (bytes.includes(needle)) hits.push(abs);
      if (bytes.includes(tokenBuf)) plantFound = true;
    });
  }
  doc.files_scanned = scanned;
  doc.controls.plant = plantFound;
  try { rmSync(plant, { force: true }); } catch { /* checked below */ }
  if (existsSync(plant)) doc.controls.plant = false;
  doc.hits = hits.length;
  doc.hit_paths = hits.sort();
  if (doc.controls.memory && doc.controls.plant && hits.length === 0) doc.verdict = 'clean';
  else if (!doc.controls.memory || !doc.controls.plant) doc.verdict = 'instrument_failed';
  else doc.verdict = 'hit';
  return doc;
}

/**
 * @param {object[]} runs
 * @param {(run: object) => number | null} pick
 * @returns {number[]}
 */
function perRepeatMedians(runs, pick) {
  const by = new Map();
  for (const run of runs) {
    const value = pick(run);
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const list = by.get(run.repeat) || [];
    list.push(value);
    by.set(run.repeat, list);
  }
  return [...by.keys()].sort((a, b) => a - b).map((key) => medianOf(by.get(key)));
}

/**
 * Pass lines: standards/primitives.md ## Classifier Seam.
 * @param {string} work
 * @returns {object}
 */
function writeReport(work) {
  const spec = readSpec(work);
  let plan = {};
  try { plan = JSON.parse(readFileSync(join(work, 'plan.json'), 'utf8')); } catch { plan = {}; }
  let mapDoc = { map: {} };
  try { mapDoc = JSON.parse(readFileSync(join(work, 'blind', 'map.json'), 'utf8')); } catch { mapDoc = { map: {} }; }
  const runToOid = {};
  for (const [oid, id] of Object.entries(mapDoc.map || {})) runToOid[id] = oid;
  const metas = [];
  const runDir = join(work, 'runs');
  if (existsSync(runDir)) {
    for (const name of readdirSync(runDir)) {
      const file = join(runDir, name, 'meta.json');
      if (!existsSync(file)) continue;
      try { metas.push(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* skip */ }
    }
  }
  const order = Array.isArray(plan.order) ? plan.order : metas.map((meta) => meta.id);
  const byId = new Map(metas.map((meta) => [meta.id, meta]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  const rate = typeof spec.classifier_usd_per_call === 'number' && Number.isFinite(spec.classifier_usd_per_call)
    ? spec.classifier_usd_per_call
    : CLASSIFIER_USD_PER_CALL_DEFAULT;
  const scoreByRun = {};
  for (const meta of ordered) {
    const oid = runToOid[meta.id];
    if (!oid) continue;
    const file = join(work, 'scores', `${oid}.json`);
    if (!existsSync(file)) continue;
    try { scoreByRun[meta.id] = JSON.parse(readFileSync(file, 'utf8')); } catch { /* skip */ }
  }
  const totalOf = (meta) => {
    const row = scoreByRun[meta.id];
    if (!row || row.status === 'unparsed' || typeof row.score !== 'number') return null;
    return row.score;
  };
  const arms = {};
  for (const arm of ['C', 'E']) {
    const rows = ordered.filter((meta) => meta.arm === arm);
    const scores = rows.map(totalOf).filter((v) => v != null);
    const usd = rows.map((meta) => meta.usd);
    arms[arm] = {
      runs: rows.length,
      valid: rows.filter((meta) => meta.valid === true).length,
      scores,
      median: medianOf(scores),
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      usd,
      usd_total: usd.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0),
      wall_s: rows.map((meta) => (Number.isFinite(meta.wall_ms) ? meta.wall_ms / 1000 : null)),
      classifier_calls: rows.reduce((sum, meta) => sum + (Number.isFinite(meta.classifier_calls) ? meta.classifier_calls : 0), 0),
    };
  }
  let reached = null;
  if (spec.kind === 'routing') {
    reached = { C: {}, E: {} };
    for (const item of spec.cases || []) {
      for (const arm of ['C', 'E']) {
        const rows = ordered.filter((meta) => meta.arm === arm && meta.case === item.id);
        reached[arm][item.id] = rows.filter((meta) => meta.reached === true).length;
      }
    }
  }
  const items = (spec.cases || []).map((item) => (Array.isArray(item.rubric) ? item.rubric.length : 0));
  const itemsPerRun = items.length ? items.reduce((a, b) => a + b, 0) / items.length : 0;
  const cMedian = arms.C.median;
  const eMedian = arms.E.median;
  const gap = cMedian == null || eMedian == null ? null : eMedian - cMedian;
  const allowance = 0.02 * itemsPerRun;
  const lineA = {
    pass: gap != null && gap <= allowance + 1e-9,
    c_median: cMedian,
    e_median: eMedian,
    items_per_run: itemsPerRun,
    allowance,
    gap,
  };
  const lineBCases = [];
  let lineBPass = true;
  for (const item of spec.cases || []) {
    if (item.none !== true) continue;
    const scores = ordered
      .filter((meta) => meta.arm === 'C' && meta.case === item.id)
      .map((meta) => {
        const row = scoreByRun[meta.id];
        return row && row.scores ? row.scores[item.none_item] : null;
      });
    const pass = scores.length > 0 && scores.every((value) => value === 1);
    if (!pass) lineBPass = false;
    lineBCases.push({ id: item.id, none_item: item.none_item, scores, pass });
  }
  if (!(spec.cases || []).some((item) => item.none === true)) lineBPass = false;
  const lineB = { pass: lineBPass, cases: lineBCases };
  const lineCCases = {};
  let lineCPass = true;
  for (const item of spec.cases || []) {
    const cScores = ordered.filter((meta) => meta.arm === 'C' && meta.case === item.id).map(totalOf).filter((v) => v != null);
    const eScores = ordered.filter((meta) => meta.arm === 'E' && meta.case === item.id).map(totalOf).filter((v) => v != null);
    const cMed = medianOf(cScores);
    const eMed = medianOf(eScores);
    const caseGap = cMed == null || eMed == null ? null : eMed - cMed;
    const pass = caseGap != null && caseGap <= 1 + 1e-9;
    if (!pass) lineCPass = false;
    lineCCases[item.id] = { c_median: cMed, e_median: eMed, gap: caseGap, pass };
  }
  const lineC = { pass: lineCPass && (spec.cases || []).length > 0, cases: lineCCases };
  const costOf = (meta) => {
    if (typeof meta.usd !== 'number' || !Number.isFinite(meta.usd)) return null;
    const calls = Number.isFinite(meta.classifier_calls) ? meta.classifier_calls : 0;
    return meta.usd + calls * rate;
  };
  const wallOf = (meta) => (Number.isFinite(meta.wall_ms) ? meta.wall_ms / 1000 : null);
  function lineDE(pick) {
    const cRows = ordered.filter((meta) => meta.arm === 'C');
    const eRows = ordered.filter((meta) => meta.arm === 'E');
    const cPer = perRepeatMedians(cRows, pick);
    const ePer = perRepeatMedians(eRows, pick);
    const cMed = medianOf(cPer);
    const eLow = ePer.length ? Math.min(...ePer) : null;
    return {
      pass: cMed != null && eLow != null && cMed < eLow,
      c_median: cMed,
      e_low: eLow,
      c_per_repeat: cPer,
      e_per_repeat: ePer,
    };
  }
  const lineD = lineDE(wallOf);
  const lineE = { ...lineDE(costOf), classifier_usd_per_call: rate };
  const seamPasses = lineA.pass && lineB.pass && lineC.pass && lineD.pass && lineE.pass;
  const cScores = arms.C.scores;
  const eScores = arms.E.scores;
  const overlap = cScores.length > 0 && eScores.length > 0
    && Math.min(...cScores) <= Math.max(...eScores)
    && Math.min(...eScores) <= Math.max(...cScores);
  const repeats = Number.isInteger(spec.repeats) ? spec.repeats : null;
  let hostUsd = 0;
  let judgeUsd = 0;
  for (const meta of ordered) {
    if (Number.isFinite(meta.usd)) hostUsd += meta.usd;
    const row = scoreByRun[meta.id];
    if (row && Number.isFinite(row.usd)) judgeUsd += row.usd;
  }
  const verdict = {
    kind: spec.kind || null,
    repeats,
    arms,
    reached,
    lines: { a: lineA, b: lineB, c: lineC, d: lineD, e: lineE },
    seam_passes: seamPasses,
    overlap,
    noise_note: overlap ? `no difference detected at n = ${repeats}` : null,
    release: 'a separate decision; this verdict releases nothing',
    estimate: {
      usd_expected: plan.usd_expected ?? null,
      usd_worst: plan.usd_worst ?? null,
    },
    actual: { host_usd: hostUsd, judge_usd: judgeUsd, usd: hostUsd + judgeUsd },
  };
  writeFileSync(join(work, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
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
    let result;
    if (parsed.command === 'run') {
      result = await dispatch(parsed.command, parsed.flags, parsed.rest);
    } else if (parsed.command === 'keyscan') {
      if (!parsed.flags['--work']) throw fail('--work is required. Run trial.mjs help.');
      const keyFile = parsed.flags['--key-file']
        ? screenPath('--key-file', parsed.flags['--key-file'])
        : defaultProviderEnvPath();
      const work = screenWork(parsed.flags['--work'], [dirname(canonicalPath(keyFile))]);
      result = commandKeyscan(work, existsSync(keyFile) ? keyFile : keyFile, parsed.rest);
      const text = `${JSON.stringify(result)}\n`;
      if (result.verdict === 'clean') {
        process.stdout.write(text);
        return 0;
      }
      process.stderr.write(text);
      return 1;
    } else {
      result = await dispatch(parsed.command, parsed.flags, parsed.rest);
    }
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
  main().then((code) => { process.exit(code); });
}

export { main, EMPTY_ENV };
