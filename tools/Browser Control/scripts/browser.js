#!/usr/bin/env node
/**
 * Browser Control - the one command surface for a Chromium session.
 *
 * Session commands manage the browser host process; every other command is sent
 * to a running host over loopback and answers with one JSON object describing
 * the page after the action.
 *
 * The rules this file follows are stated once, in
 * system/templates/Script Contract.md.
 */

// Node built-ins only. Nothing here may import from outside this tool directory.
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs';
import http from 'node:http';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');

// Not 9222: that is Chromium's own remote-debugging port, and a host bound there
// collides with any browser the user started for debugging.
const DEFAULT_PORT = 4390;

const USAGE = `Browser Control - drive a persistent Chromium session.

Usage:
  node scripts/browser.js help
  node scripts/browser.js session start --profile [absolute dir] [--port n] [--headless]
  node scripts/browser.js [command] [subcommand] [options]

Session:
  session start          Launch the browser host. Needs --profile.
  session stop           Close the browser and the host.
  session status         Report whether a host answers on --port.
  session restart        Stop, then start again; needs --profile.

Reading:
  snapshot               Page content. --format accessibility|text|html|interactive
  check                  Assert element state. --assert [name] --selector [s] [--expect v]
  console start|stop     Capture page console output; stop returns what it collected.
  network start|stop     Capture requests; stop returns what it collected.
  network block|unblock  Abort requests whose URL contains --pattern.

Acting:
  navigate               --url [u], or subcommand back|forward|reload
  click                  --index n | --selector s | --text t | --coords x,y
  type                   (--index n | --selector s) --text t, or --key [Key]
  scroll                 --to top|bottom|[selector] | --by [px] | --infinite [--max n]
  mouse hover|move       --selector s | --coords x,y
  mouse drag             --from [selector] --to [selector]
  mouse wheel            --delta [px]
  select list|option     --selector s; option takes --value | --label | --index
  frame list|switch|main|current   switch takes --index | --name | --src
  tabs list|new|switch|close       new takes --url; switch and close take --index
  dialog accept|dismiss|prompt|off|status
  emulate set|reset      set takes --device | --viewport WxH | --geolocation lat,long
  wait                   --selector s [--hidden] | --text t | --time [ms] | --network
  execute                --code "[javascript]"
  screenshot             --output [absolute file] [--selector s] [--fullpage]
  download               --url u --output [absolute file], or --selector s --output-dir [absolute dir]
  upload                 --selector s --file [absolute path] (repeatable) --confirm
  cookies list|get|set|delete|clear
  storage list|get|set|delete|clear
  trace start|stop|status          stop takes --output [absolute file]

Options:
  --port [n]             Host port. Default ${DEFAULT_PORT}.
  --profile [dir]        Absolute directory holding browser profile state. Required
                         by session start and session restart; resolve a work
                         directory in the owning root, per standards/conventions.md.
  --headless             Launch without a visible window. Default off.
  --unattended           Harden the profile for a run with nobody watching:
                         geolocation, microphone, and camera are denied by
                         default so no permission prompt can stall it. Default
                         off, which leaves them at the site default so an
                         attended run is not crippled.
  --confirm              Required by cookies delete, cookies clear, storage delete,
                         storage clear, and upload. Opt-in only; nothing is read
                         from stdin and there is no skip flag.
  --timeout [ms]         Per-action timeout where the command takes one.
  --help                 Print this message

Cookie values are never printed and never written to a file. Sign in by hand in
the visible window; the profile directory keeps the session.

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

// Arguments. Parsed first so help costs nothing: no install, no browser, no host.
const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const COMMANDS = {
  session: ['start', 'stop', 'status', 'restart'],
  snapshot: null,
  check: null,
  console: ['start', 'stop'],
  network: ['start', 'stop', 'block', 'unblock'],
  navigate: ['back', 'forward', 'reload'],
  click: null,
  type: null,
  scroll: null,
  mouse: ['hover', 'move', 'drag', 'wheel'],
  select: ['list', 'option'],
  frame: ['list', 'switch', 'main', 'current'],
  tabs: ['list', 'new', 'switch', 'close'],
  dialog: ['accept', 'dismiss', 'prompt', 'off', 'status'],
  emulate: ['set', 'reset'],
  wait: null,
  execute: null,
  screenshot: null,
  download: null,
  upload: null,
  cookies: ['list', 'get', 'set', 'delete', 'clear'],
  storage: ['list', 'get', 'set', 'delete', 'clear'],
  trace: ['start', 'stop', 'status']
};

// Destruction that is intrinsic to the command, not destruction a caller's own
// code might cause. Each refuses without --confirm, before anything is sent.
const GATED = new Set([
  'cookies delete',
  'cookies clear',
  'storage delete',
  'storage clear',
  'upload'
]);

const ASSERTIONS = new Set([
  'exists', 'visible', 'hidden', 'enabled', 'disabled',
  'checked', 'unchecked', 'text', 'value', 'count'
]);

const command = argv[0];

if (!Object.hasOwn(COMMANDS, command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/browser.js help" for usage.`);
}

const subcommands = COMMANDS[command];
let sub;
let rest = argv.slice(1);

if (subcommands) {
  const candidate = rest[0];
  if (candidate !== undefined && !candidate.startsWith('--')) {
    sub = candidate;
    rest = rest.slice(1);
  }
  // navigate is the one command whose subcommand is optional: --url replaces it.
  if (sub === undefined && command !== 'navigate') {
    fail(`Error: ${command} needs a subcommand: ${subcommands.join(', ')}. Run "node scripts/browser.js help" for usage.`);
  }
  if (sub !== undefined && !subcommands.includes(sub)) {
    fail(`Error: unknown ${command} subcommand "${sub}". Use one of: ${subcommands.join(', ')}.`);
  }
}

// Flags this surface accepts. Anything else is refused by name rather than
// stored and silently ignored when no command reads it.
const VALUE_FLAGS = new Set([
  '--port', '--profile', '--timeout', '--url', '--wait', '--format',
  '--selector', '--index', '--text', '--coords', '--button', '--count',
  '--delay', '--key', '--to', '--by', '--max', '--from', '--delta',
  '--value', '--label', '--name', '--src', '--device', '--viewport',
  '--geolocation', '--time', '--code', '--assert', '--expect', '--pattern',
  '--output', '--output-dir', '--file', '--domain', '--expires', '--path'
]);
const BARE_FLAGS = new Set([
  '--headless', '--unattended', '--confirm', '--force', '--clear', '--submit',
  '--infinite', '--hidden', '--network', '--fullpage', '--session',
  '--help', '-h'
]);

const flags = new Map();

for (let i = 0; i < rest.length; i++) {
  const word = rest[i];
  if (!word.startsWith('--') && !word.startsWith('-')) {
    fail(`Error: unexpected argument "${word}". Options are named; run "node scripts/browser.js help" for usage.`);
  }
  if (!VALUE_FLAGS.has(word) && !BARE_FLAGS.has(word)) {
    fail(`Error: unknown option "${word}". Run "node scripts/browser.js help" for usage.`);
  }
  const next = rest[i + 1];
  // A bare flag is its own value. A value flag claims the next word unless
  // that word is itself an option, in which case the value is missing and
  // flag() refuses later.
  if (BARE_FLAGS.has(word) && !VALUE_FLAGS.has(word)) {
    const existing = flags.get(word);
    if (existing === undefined) flags.set(word, true);
    else if (Array.isArray(existing)) existing.push(true);
    else flags.set(word, [existing, true]);
    continue;
  }
  const value = next === undefined || next.startsWith('--') ? true : rest[++i];
  const existing = flags.get(word);
  if (existing === undefined) flags.set(word, value);
  else if (Array.isArray(existing)) existing.push(value);
  else flags.set(word, [existing, value]);
}

function flag(name) {
  const value = flags.get(name);
  if (Array.isArray(value)) {
    fail(`Error: ${name} was given more than once and takes a single value.`);
  }
  if (value === true) {
    fail(`Error: ${name} needs a value. Run "node scripts/browser.js help" for usage.`);
  }
  return value;
}

function flagList(name) {
  const value = flags.get(name);
  if (value === undefined) return [];
  if (value === true) fail(`Error: ${name} needs a value.`);
  return Array.isArray(value) ? value : [value];
}

function switchOn(name) {
  return flags.get(name) === true;
}

function integer(name, fallback) {
  const value = flag(name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) fail(`Error: ${name} must be a whole number; got "${value}".`);
  return parsed;
}

// The gate. Opt-in, non-interactive, and ahead of every read, spawn, and send.
const gateKey = sub ? `${command} ${sub}` : command;

if (GATED.has(gateKey) && !switchOn('--confirm')) {
  fail(`Error: "${gateKey}" changes state that cannot be restored from here, so it needs --confirm. Re-run the same command with --confirm. There is no skip flag and nothing is read from stdin.`);
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before any browser is launched and before anything is sent to the host.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. A screenshot, a download, and a
 * profile directory usually do not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: a symbolic link standing in for any ancestor
 * cannot hide where the write lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know where a write lands
 * refuses rather than falling back to comparing the caller's spelling.
 */
function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * True when `target` names this tool's own directory or something beneath it,
 * decided by identity rather than by spelling.
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and the name test alone let a browser profile and a screenshot be
 * written into this directory. Device and inode are a directory's own identity,
 * which no spelling reaches, so every existing ancestor of `target` is compared
 * that way as well. A path that does not exist yet has no inode of its own,
 * which is why the walk climbs to the deepest ancestor that does: that ancestor
 * is where the write lands.
 */
function insideToolDirectory(target) {
  const root = canonical('this tool directory', TOOL_DIR);
  if (target === root || target.startsWith(root + sep)) return true;

  let rootId;
  try {
    rootId = statSync(root);
  } catch {
    return false;
  }

  let head = target;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

// One screen, so --profile, --output, --output-dir and --file are all held to
// the same rule. The canonical path is returned and is what travels to the
// host, so the path the host acts on is the path this cleared.
function screenPath(name, value, { directory = false } = {}) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". Pass a path in the owning root's work directory, per standards/conventions.md.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts read and write only in a work directory in the owning root; pass that path instead.`);
  }
  if (directory && existsSync(target) && !statSync(target).isDirectory()) {
    fail(`Error: ${name} names an existing file, not a directory: ${target}`);
  }
  return target;
}

// Paths a caller names. Absolute only: a relative path resolves against whatever
// directory the caller happened to be in, and never inside this tool directory.
function callerPath(name, { directory = false } = {}) {
  const value = flag(name);
  if (value === undefined) return undefined;
  return screenPath(name, value, { directory });
}

const port = integer('--port', DEFAULT_PORT);

function request(method, path, body) {
  return new Promise((accept, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        timeout: 120000,
        headers: payload === undefined
          ? {}
          : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            accept(JSON.parse(raw));
          } catch {
            reject(new Error(`the browser host answered on port ${port} with something that is not JSON`));
          }
        });
      }
    );
    req.on('error', (error) => reject(error));
    req.on('timeout', () => { req.destroy(); reject(new Error('the browser host did not answer within 120 seconds')); });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function hostStatus() {
  try {
    const answer = await request('GET', '/status');
    return answer && answer.running === true ? answer : null;
  } catch {
    return null;
  }
}

// Shuts the host down and reports whether one was running. Used by stop and by
// the first half of restart.
async function stopHost() {
  const status = await hostStatus();
  if (status === null) return false;
  try {
    await request('POST', '/shutdown');
  } catch {
    // The host closes its socket while answering; a dropped connection here
    // is the expected shape of a successful shutdown.
  }
  await waitFor(async () => (await hostStatus()) === null, 10000);
  return true;
}

async function send(action, params) {
  let answer;
  try {
    answer = await request('POST', '/command', { action, params });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      fail(`Error: no browser host answering on port ${port}. Start one with "node scripts/browser.js session start --profile [absolute dir]".`);
    }
    fail(`Error: ${command} failed: ${error.message}`);
  }
  if (!answer.ok) {
    fail(`Error: ${command} failed: ${answer.error}`);
  }
  emit(answer.result);
}

// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Session commands run here; everything else is sent to the host.
if (command === 'session') {
  if (sub === 'status') {
    const status = await hostStatus();
    emit(status === null
      ? { running: false, port }
      : { running: true, port, url: status.url, profile: status.profile, headless: status.headless });
  }

  if (sub === 'stop') emit({ running: false, port, stopped: await stopHost() });

  // start, and both halves of restart. The profile is resolved before restart
  // stops anything, so a restart that named none refuses with the session it was
  // about to replace still standing.
  const profile = callerPath('--profile', { directory: true });
  if (profile === undefined) {
    fail(`Error: session ${sub} needs --profile [absolute dir]. Resolve a work directory in the owning root, per standards/conventions.md; this tool never picks a location of its own.`);
  }

  if (sub === 'restart') await stopHost();

  const running = await hostStatus();
  if (running !== null) {
    fail(`Error: a browser host is already running on port ${port} with profile ${running.profile}. Stop it first, or pass a different --port.`);
  }

  // Dependencies. Before the host is spawned, so a missing install is reported
  // here rather than dying inside a detached child.
  if (!existsSync(DEP_MARKER)) {
    process.stderr.write('First run: installing dependencies in this tool directory.\n');
    try {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      // stderr only: npm output on stdout would break the empty-stdout-on-failure rule.
      execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
    } catch {
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory the first time it runs, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
      fail(`Error: npm ci failed in ${TOOL_DIR}. Delete node_modules there, confirm Node 18 or newer, then run "npm install" by hand.`);
    }
    if (!existsSync(DEP_MARKER)) {
      fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this tool imports.`);
    }
    fail('Dependencies installed. Re-run the command.');
  }

  // System dependency: trial launch via shared browser-runtime (not path-only).
  // Dynamic import only on session start — help must work without node_modules.
  const runtime = await import('./lib/browser-runtime.js');
  const browserSurvey = await runtime.check();
  if (browserSurvey.chromiumLaunch !== true) {
    fail(
      `Error: Chromium cannot launch; check: npm run check:chromium. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
    );
  }

  const headless = switchOn('--headless');
  const unattended = switchOn('--unattended');
  const child = spawn(
    process.execPath,
    [
      join(SCRIPT_DIR, 'server.js'),
      '--port', String(port),
      '--profile', profile,
      ...(headless ? ['--headless'] : []),
      ...(unattended ? ['--unattended'] : [])
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();

  const ready = await waitFor(async () => (await hostStatus()) !== null, 60000);
  if (!ready) {
    fail(`Error: the browser host did not come up on port ${port} within 60 seconds. Run the same command with --headless to see whether a window is being blocked, and confirm "npm run check:chromium" succeeds.`);
  }
  emit({ running: true, port, profile, headless });
}

async function waitFor(condition, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((r) => { setTimeout(r, 250); });
  }
  return false;
}

// Page commands.
switch (command) {
  case 'navigate': {
    const url = flag('--url');
    if (sub === undefined && url === undefined) {
      fail('Error: navigate needs --url [address], or the subcommand back, forward, or reload.');
    }
    if (sub !== undefined && url !== undefined) {
      fail(`Error: navigate takes either --url or the subcommand "${sub}", not both.`);
    }
    await send('navigate', {
      url,
      direction: sub,
      waitUntil: flag('--wait') ?? 'load',
      timeout: integer('--timeout', 30000)
    });
    break;
  }

  case 'snapshot': {
    const format = flag('--format') ?? 'accessibility';
    const allowed = ['accessibility', 'text', 'html', 'interactive'];
    if (!allowed.includes(format)) {
      fail(`Error: --format must be one of: ${allowed.join(', ')}; got "${format}".`);
    }
    await send('snapshot', { format, selector: flag('--selector') });
    break;
  }

  case 'click': {
    const target = {
      index: flags.has('--index') ? integer('--index') : undefined,
      selector: flag('--selector'),
      text: flag('--text'),
      coords: flag('--coords')
    };
    if (Object.values(target).every((v) => v === undefined)) {
      fail('Error: click needs one of --index, --selector, --text, or --coords. Run "snapshot --format interactive" to get indexes.');
    }
    await send('click', {
      ...target,
      button: flag('--button') ?? 'left',
      clickCount: integer('--count', 1),
      delay: flags.has('--delay') ? integer('--delay') : undefined,
      // Playwright's own click option: skip the actionability wait. It is not a
      // gate and skips no confirmation.
      force: switchOn('--force'),
      timeout: integer('--timeout', 5000)
    });
    break;
  }

  case 'type': {
    const key = flag('--key');
    const index = flags.has('--index') ? integer('--index') : undefined;
    const selector = flag('--selector');
    const text = flag('--text');
    if (key === undefined && (text === undefined || (index === undefined && selector === undefined))) {
      fail('Error: type needs --key [Key], or a target (--index or --selector) together with --text.');
    }
    await send('type', {
      key,
      index,
      selector,
      text,
      clear: switchOn('--clear'),
      delay: flags.has('--delay') ? integer('--delay') : undefined,
      submit: switchOn('--submit'),
      timeout: integer('--timeout', 5000)
    });
    break;
  }

  case 'scroll': {
    const to = flag('--to');
    const by = flags.has('--by') ? integer('--by') : undefined;
    const infinite = switchOn('--infinite');
    const chosen = [to !== undefined, by !== undefined, infinite].filter(Boolean).length;
    if (chosen !== 1) {
      fail('Error: scroll needs exactly one of --to [top|bottom|selector], --by [pixels], or --infinite.');
    }
    await send('scroll', { to, by, infinite, max: integer('--max', 10) });
    break;
  }

  case 'mouse': {
    const params = { action: sub };
    if (sub === 'hover' || sub === 'move') {
      params.selector = flag('--selector');
      params.coords = flag('--coords');
      if (params.selector === undefined && params.coords === undefined) {
        fail(`Error: mouse ${sub} needs --selector or --coords x,y.`);
      }
    }
    if (sub === 'drag') {
      params.from = flag('--from');
      params.to = flag('--to');
      if (params.from === undefined || params.to === undefined) {
        fail('Error: mouse drag needs --from [selector] and --to [selector].');
      }
    }
    if (sub === 'wheel') {
      if (!flags.has('--delta')) fail('Error: mouse wheel needs --delta [pixels].');
      params.delta = integer('--delta');
    }
    await send('mouse', params);
    break;
  }

  case 'select': {
    const selector = flag('--selector');
    if (selector === undefined) fail(`Error: select ${sub} needs --selector.`);
    if (sub === 'list') {
      await send('select', { action: 'list', selector });
      break;
    }
    const by = ['value', 'label', 'index'].find((name) => flags.has(`--${name}`));
    if (by === undefined) {
      fail('Error: select option needs one of --value, --label, or --index.');
    }
    await send('select', {
      action: 'option',
      selector,
      by,
      option: by === 'index' ? integer('--index') : flag(`--${by}`)
    });
    break;
  }

  case 'frame': {
    const params = { action: sub };
    if (sub === 'switch') {
      const by = ['index', 'name', 'src'].find((name) => flags.has(`--${name}`));
      if (by === undefined) fail('Error: frame switch needs one of --index, --name, or --src.');
      params.by = by;
      params.value = by === 'index' ? integer('--index') : flag(`--${by}`);
    }
    await send('frame', params);
    break;
  }

  case 'tabs': {
    const params = { action: sub };
    if (sub === 'new') params.url = flag('--url');
    if (sub === 'switch') {
      if (!flags.has('--index')) fail('Error: tabs switch needs --index [n]. Run "tabs list" to see the indexes.');
      params.index = integer('--index');
    }
    if (sub === 'close' && flags.has('--index')) params.index = integer('--index');
    await send('tabs', params);
    break;
  }

  case 'dialog': {
    const params = { mode: sub };
    if (sub === 'prompt') params.text = flag('--text') ?? '';
    await send('dialog', params);
    break;
  }

  case 'emulate': {
    if (sub === 'reset') {
      await send('emulate', { action: 'reset' });
      break;
    }
    const params = {
      action: 'set',
      device: flag('--device'),
      viewport: flag('--viewport'),
      geolocation: flag('--geolocation')
    };
    if (!params.device && !params.viewport && !params.geolocation) {
      fail('Error: emulate set needs at least one of --device, --viewport WxH, or --geolocation lat,long. Locale, timezone, and touch are fixed when the context is created and cannot be changed on a live session.');
    }
    await send('emulate', params);
    break;
  }

  case 'wait': {
    const selector = flag('--selector');
    const text = flag('--text');
    const time = flags.has('--time') ? integer('--time') : undefined;
    const network = switchOn('--network');
    const chosen = [selector !== undefined, text !== undefined, time !== undefined, network].filter(Boolean).length;
    if (chosen !== 1) {
      fail('Error: wait needs exactly one of --selector, --text, --time [ms], or --network.');
    }
    await send('wait', { selector, text, time, network, hidden: switchOn('--hidden'), timeout: integer('--timeout', 30000) });
    break;
  }

  case 'execute': {
    const code = flag('--code');
    if (code === undefined) {
      fail('Error: execute needs --code "[javascript]". There is no --file: a path read straight into a live page is a way to send local files somewhere, and the caller can read the file and pass its contents.');
    }
    await send('execute', { code });
    break;
  }

  case 'check': {
    const assertion = flag('--assert');
    const selector = flag('--selector');
    if (assertion === undefined || selector === undefined) {
      fail(`Error: check needs --assert [name] and --selector [s]. Names: ${[...ASSERTIONS].join(', ')}.`);
    }
    if (!ASSERTIONS.has(assertion)) {
      fail(`Error: unknown assertion "${assertion}". Names: ${[...ASSERTIONS].join(', ')}.`);
    }
    const needsExpected = ['text', 'value', 'count'].includes(assertion);
    const expected = flag('--expect');
    if (needsExpected && expected === undefined) {
      fail(`Error: the "${assertion}" assertion needs --expect [value].`);
    }
    await send('check', {
      assertion,
      selector,
      expected: assertion === 'count' ? integer('--expect') : expected,
      timeout: integer('--timeout', 5000)
    });
    break;
  }

  case 'console':
    await send('console', { action: sub });
    break;

  case 'network': {
    const params = { action: sub };
    if (sub === 'block') {
      params.pattern = flag('--pattern');
      if (params.pattern === undefined) fail('Error: network block needs --pattern [text the URL contains].');
    }
    await send('network', params);
    break;
  }

  case 'screenshot': {
    const output = callerPath('--output');
    if (output === undefined) fail('Error: screenshot needs --output [absolute file path].');
    await send('screenshot', { output, selector: flag('--selector'), fullPage: switchOn('--fullpage') });
    break;
  }

  case 'download': {
    const url = flag('--url');
    const output = callerPath('--output');
    const outputDir = callerPath('--output-dir', { directory: true });
    if (url !== undefined) {
      if (output === undefined) fail('Error: download --url needs --output [absolute file path].');
      await send('download', { url, output, timeout: integer('--timeout', 30000) });
      break;
    }
    const selector = flag('--selector');
    if (selector === undefined || outputDir === undefined) {
      fail('Error: download needs either --url with --output [absolute file], or --selector with --output-dir [absolute dir].');
    }
    await send('download', { selector, outputDir, timeout: integer('--timeout', 30000) });
    break;
  }

  case 'upload': {
    const selector = flag('--selector');
    const files = flagList('--file');
    if (selector === undefined || files.length === 0) {
      fail('Error: upload needs --selector [s] and at least one --file [absolute path].');
    }
    // Screened by the same rule as every other caller-named path, and the
    // screened paths are what travel to the host. An upload hands a file to a
    // web page, so a --file inside this tool directory would put this tool's
    // own contents on someone else's form; absoluteness alone never said so.
    // The host screens them again on its own side: this half of the split
    // cannot be the only place the rule holds.
    const screened = files.map((file) => {
      const target = screenPath('--file', file);
      if (!existsSync(target)) fail(`Error: no file at ${target}.`);
      return target;
    });
    await send('upload', { selector, files: screened, timeout: integer('--timeout', 5000) });
    break;
  }

  case 'cookies': {
    const params = { action: sub };
    if (sub === 'list') params.domain = flag('--domain');
    if (sub === 'get' || sub === 'delete') {
      params.name = flag('--name');
      if (params.name === undefined) fail(`Error: cookies ${sub} needs --name.`);
    }
    if (sub === 'set') {
      params.name = flag('--name');
      params.value = flag('--value');
      if (params.name === undefined || params.value === undefined) {
        fail('Error: cookies set needs --name and --value. Use it for page state such as a consent or locale cookie; sign in by hand in the visible window rather than pasting a session token here.');
      }
      params.domain = flag('--domain');
      params.path = flag('--path');
      if (flags.has('--expires')) params.expires = integer('--expires');
    }
    await send('cookies', params);
    break;
  }

  case 'storage': {
    const params = { action: sub, storage: switchOn('--session') ? 'session' : 'local' };
    if (sub === 'get' || sub === 'delete' || sub === 'set') {
      params.key = flag('--key');
      if (params.key === undefined) fail(`Error: storage ${sub} needs --key.`);
    }
    if (sub === 'set') {
      params.value = flag('--value');
      if (params.value === undefined) fail('Error: storage set needs --value.');
    }
    await send('storage', params);
    break;
  }

  case 'trace': {
    const params = { action: sub };
    if (sub === 'stop') {
      params.output = callerPath('--output');
      if (params.output === undefined) fail('Error: trace stop needs --output [absolute file path], ending in .zip.');
    }
    await send('trace', params);
    break;
  }

  default:
    fail(`Error: "${command}" is listed but not wired. Run "node scripts/browser.js help" for usage.`);
}
