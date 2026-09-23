import { appendFileSync } from 'node:fs';

/**
 * Optional trace for a prototype run: set WISER_HOOK_TRACE to an absolute file
 * path and each hook appends its event name, tool, and whether it spoke. Off by
 * default, and a trace write that fails is ignored.
 */
function trace(line) {
  const file = process.env.WISER_HOOK_TRACE;
  if (!file) return;
  try { appendFileSync(file, `${new Date().toISOString()} ${line}\n`); } catch { /* ignored */ }
}

/**
 * Read one hook event from stdin. Unexpected input throws or returns null;
 * the runner turns both into exit 0 with no output.
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function readEvent() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

/**
 * @param {string} hookEventName
 * @param {string} additionalContext
 */
export function writeContext(hookEventName, additionalContext) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  })}\n`);
}

/**
 * Run a hook inside a 3 second budget. Any error, timeout, or empty result
 * exits 0 and prints nothing.
 * @param {string} hookEventName
 * @param {(event: Record<string, unknown>, clock: { started: number, budgetMs: number }) => Promise<string | null | undefined> | string | null | undefined} fn
 */
export function runHook(hookEventName, fn) {
  const started = Date.now();
  const budgetMs = 3000;
  let finished = false;
  const timer = setTimeout(() => {
    if (!finished) process.exit(0);
  }, budgetMs);
  (async () => {
    try {
      const event = await readEvent();
      if (!event) return;
      if (Date.now() - started >= budgetMs) return;
      const text = await fn(event, { started, budgetMs });
      trace(`${hookEventName} tool=${event.tool_name || '-'} spoke=${typeof text === 'string' && text.length > 0}`);
      if (finished) return;
      if (Date.now() - started >= budgetMs) return;
      if (typeof text !== 'string' || text.length === 0) return;
      finished = true;
      clearTimeout(timer);
      writeContext(hookEventName, text);
    } catch {
      // exit 0 with no output
    } finally {
      finished = true;
      clearTimeout(timer);
      process.exit(0);
    }
  })();
}
