#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { wiserUserConfigDir, defaultGatewayHome } from '../../../../../../gateway/src/paths.js';

const argv = process.argv.slice(2);

function flag(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function writeCapture(doc) {
  const dir = process.env.TRIAL_CAPTURE_DIR;
  const mcp = flag('--mcp-config');
  const targets = [];
  if (dir) targets.push(dir);
  if (mcp) targets.push(dirname(mcp));
  for (const target of targets) {
    try {
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, `capture-${process.pid}-${Date.now()}.json`), `${JSON.stringify(doc)}\n`);
    } catch { /* the trial still has stdout */ }
  }
}

const format = flag('--output-format');
const prompt = flag('-p') || '';

if (format === 'json') {
  const fails = Number(process.env.TRIAL_SCORE_FAILS || 0);
  const state = process.env.TRIAL_SCORE_STATE;
  let seen = 0;
  if (state) {
    try { seen = Number(readFileSync(state, 'utf8')) || 0; } catch { seen = 0; }
    try { writeFileSync(state, String(seen + 1)); } catch { /* counter is best-effort */ }
  }
  const bad = seen < fails;
  const ids = [...prompt.matchAll(/^- ([A-Za-z0-9_-]+):/gm)].map((match) => match[1]);
  const scores = {};
  const reasons = {};
  for (const id of ids) {
    scores[id] = 1;
    reasons[id] = '';
  }
  const fenced = `\`\`\`json\n${JSON.stringify({ scores, reasons })}\n\`\`\``;
  const out = bad
    ? { type: 'result', subtype: 'success', result: 'no score block here', total_cost_usd: 0.02 }
    : { type: 'result', subtype: 'success', result: fenced, total_cost_usd: 0.01, session_id: 'judge-1' };
  let mcpServers = null;
  const mcp = flag('--mcp-config');
  if (mcp) {
    try { mcpServers = JSON.parse(readFileSync(mcp, 'utf8')).mcpServers; } catch { mcpServers = null; }
  }
  writeCapture({ mode: 'score', argv, mcpServers, disallowed: argv.includes('--disallowedTools') });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let settings = {};
try { settings = JSON.parse(flag('--settings') || '{}'); } catch { settings = {}; }
const trialHome = settings && settings.env ? settings.env.HOME : '';
const auth = trialHome
  ? join(wiserUserConfigDir(process.platform, process.env, trialHome), 'auth-provider.env')
  : '';
let link = false;
try { link = lstatSync(auth).isSymbolicLink(); } catch { link = false; }

let mcpEnv = null;
let mcpArgs = null;
const mcp = flag('--mcp-config');
if (mcp) {
  try {
    const cfg = JSON.parse(readFileSync(mcp, 'utf8'));
    const server = cfg.mcpServers && cfg.mcpServers['wiser-gateway'];
    mcpEnv = server ? server.env : null;
    mcpArgs = server ? server.args : null;
  } catch { /* captured as null */ }
}

const envKeys = Object.keys(process.env);
writeCapture({
  mode: 'host',
  argv,
  link,
  trialHome,
  mcpEnv,
  mcpArgs,
  pluginDir: flag('--plugin-dir'),
  env: {
    HOME: process.env.HOME || null,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || null,
    CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID || null,
    CLAUDE_PID: process.env.CLAUDE_PID || null,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY || null,
    wiser: envKeys.filter((key) => key.startsWith('WISER_')),
    claude: envKeys.filter((key) => key.startsWith('CLAUDE')),
    launcher: envKeys.filter((key) => key.startsWith('LAUNCHER_')),
  },
});

if (process.env.TRIAL_SENTINEL) {
  try { writeFileSync(process.env.TRIAL_SENTINEL, 'invoked\n'); } catch { /* absence is the signal */ }
}

const sessionId = prompt.includes('PLANT_SESSION') ? 'sess-planted-trial-0001' : `sess-${process.pid}`;
const realGateway = defaultGatewayHome();
if (prompt.includes('PLANT_GATEWAY')) {
  mkdirSync(realGateway, { recursive: true });
  writeFileSync(join(realGateway, 'planted-by-host.txt'), 'changed\n');
}
// Presence files another harness's gateway would write: a live process outside the trial,
// a dead one, and this host's own process, which descends from the runner.
for (const [marker, pidOf] of [
  ['PLANT_PRESENCE_LIVE', () => Number(process.env.FAKE_LIVE_PID)],
  ['PLANT_PRESENCE_DEAD', () => 2147483000],
  ['PLANT_PRESENCE_OURS', () => process.pid],
]) {
  if (!prompt.includes(marker)) continue;
  mkdirSync(join(realGateway, 'classifier-status'), { recursive: true });
  writeFileSync(join(realGateway, 'classifier-status', 'codex.json'), `${JSON.stringify({ attached: false, pid: pidOf() })}\n`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}
if (prompt.includes('PLANT_SESSION')) {
  mkdirSync(realGateway, { recursive: true });
  writeFileSync(join(realGateway, 'leak.txt'), `${sessionId}\n`);
}

if (trialHome && link) {
  const gw = defaultGatewayHome(trialHome);
  mkdirSync(join(gw, 'classifier-sessions'), { recursive: true });
  writeFileSync(join(gw, 'classifier-sessions', `${sessionId}.json`), '{}\n');
  const audit = [
    { op: 'execute', action: 'wiser.route.roster', status: 'ok', reason: null },
    { op: 'execute', action: 'wiser.route.ask', status: 'ok', reason: null },
  ];
  mkdirSync(gw, { recursive: true });
  writeFileSync(join(gw, 'audit.jsonl'), `${audit.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

const plugin = flag('--plugin-dir');
let expectLine = 'none';
let via = 'read';
if (plugin) {
  try {
    const table = JSON.parse(readFileSync(join(plugin, 'trial-open.json'), 'utf8'));
    const row = table[prompt];
    if (row && typeof row.expect === 'string') expectLine = row.expect;
    if (row && row.via === 'bash') via = 'bash';
  } catch { /* no table: open nothing */ }
}
const events = [{ type: 'system', subtype: 'init', session_id: sessionId }];
if (link && expectLine && expectLine !== 'none' && plugin) {
  const file = join(plugin, expectLine);
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { text = ''; }
  const tool = via === 'bash'
    ? { type: 'tool_use', id: 't1', name: 'Bash', input: { command: `cat ${JSON.stringify(file)}` } }
    : { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: file } };
  events.push({ type: 'assistant', message: { role: 'assistant', content: [tool] } });
  events.push({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
  });
}
events.push({
  type: 'result',
  subtype: 'success',
  result: 'The page says the work is done.',
  total_cost_usd: 0.2,
  session_id: sessionId,
  num_turns: 2,
});
for (const event of events) process.stdout.write(`${JSON.stringify(event)}\n`);
