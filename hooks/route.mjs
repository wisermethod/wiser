#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { presenceFileExists, recordHookSession } from './lib/binding.mjs';
import { routeOnce } from './lib/call.mjs';
import { gate, gatewayHome, pluginRoot } from './lib/presence.mjs';
import { buildRoster } from './lib/roster.mjs';
import { runHook } from './lib/run.mjs';

/**
 * The named asks `wiser/AGENTS.md` lists, each handled before any call is
 * made; compared after trimming, dropping a closing mark, and lowering case,
 * whole or followed by more words.
 */
export const NAMED_ASKS = new Set([
  'update root', 'update this root', 'check root', 'is this root current',
  'set up connectors', 'setup connectors', 'enable connectors', 'install connectors',
  'wrap up',
]);

/** @param {string} ask */
export function isNamedAsk(ask) {
  const key = String(ask).trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[.!?,;:\s]+$/, '').trim().toLowerCase();
  if (NAMED_ASKS.has(key)) return true;
  // A named ask with a target or a qualifier after it is still that ask.
  for (const named of NAMED_ASKS) if (key.startsWith(`${named} `)) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} event
 * @returns {string | null}
 */
function promptText(event) {
  if (typeof event.prompt === 'string') return event.prompt;
  if (typeof event.user_input === 'string') return event.user_input;
  return null;
}

/**
 * A confident route has a target and no refusal status. `confidence` is the
 * probability the line reports as `p`.
 * @param {unknown} answer
 * @returns {string | null}
 */
export function formatRoute(answer, rows) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null;
  if (typeof answer.status === 'string' && answer.status.length > 0) return null;
  if (answer.pass !== true) return null;
  if (typeof answer.target !== 'string' || answer.target.length === 0) return null;
  if (/[\r\n]/.test(answer.target)) return null;
  if (typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) || answer.confidence <= 0 || answer.confidence > 1) return null;
  if (Array.isArray(rows) && !rows.some((row) => row.family === answer.family && row.name === answer.target)) return null;
  // A request enters at a skill or an expert; a tool is what they call, so a
  // tool answer is not a route and the routing table is read as today.
  const where = { skill: 'skills', expert: 'experts' }[answer.family];
  if (!where) return null;
  const typed = { skill: 'SKILL.md', expert: 'EXPERT.md' }[answer.family];
  const file = where ? `${where}/${answer.target}/${typed}` : answer.target;
  return `WISER routing (classifier): ${file}, p=${answer.confidence}. Load that file unless the request names another, or names an output that file does not yield.`;
}

/**
 * @param {Record<string, unknown>} event
 * @param {{ started: number, budgetMs: number }} clock
 * @returns {Promise<string | null>}
 */
export async function routePrompt(event, clock) {
  const hookStartedMs = Date.now();
  // The binding is written before any routing decision, including a refusal,
  // so a /clear into a refusing root moves the pointer.
  let recorded = null;
  try {
    const home = gatewayHome();
    if (presenceFileExists(home)) recorded = recordHookSession({ home, event, hookStartedMs });
  } catch {
    recorded = null;
  }
  const opened = gate(event);
  if (!opened || opened.dirs.length === 0) return null;
  if (!recorded || recorded.ok !== true) return null;
  if (recorded.binding.refused === true) return null;
  if (typeof recorded.binding.owning_root !== 'string' || recorded.binding.owning_root.length === 0) return null;
  const raw = promptText(event);
  if (typeof raw !== 'string') return null;
  const ask = raw.trim();
  if (!ask || ask.startsWith('/') || isNamedAsk(ask)) return null;
  if (Date.now() - clock.started >= clock.budgetMs) return null;

  const rows = buildRoster(pluginRoot);
  if (rows.length === 0) return null;
  const timeoutMs = clock.budgetMs - (Date.now() - clock.started);
  if (timeoutMs <= 0) return null;
  const answer = await routeOnce({ rows, ask }, {
    root: pluginRoot,
    home: opened.home,
    dirs: opened.dirs,
    timeoutMs,
  });
  return formatRoute(answer, rows);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  runHook('UserPromptSubmit', (event, clock) => routePrompt(event, clock));
}
