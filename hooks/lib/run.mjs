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
 * The notice line for the person. `runHook` passes a string, and this writes
 * `{"systemMessage":"Wiser: <text>"}`. Session and route keep `writeContext`.
 * @param {string} text
 */
export function writeSystemMessage(text) {
  process.stdout.write(`${JSON.stringify({ systemMessage: `Wiser: ${text}` })}\n`);
}

/**
 * Run a hook inside a 3 second budget. Any error, timeout, or empty result
 * exits 0 and prints nothing.
 *
 * `options.output === 'systemMessage'` writes the notice line. Any other
 * value, including a missing option, writes `hookSpecificOutput` as before.
 * The returned value has to be a string either way.
 * @param {string} hookEventName
 * @param {(event: Record<string, unknown>, clock: { started: number, budgetMs: number }) => Promise<string | null | undefined> | string | null | undefined} fn
 * @param {{ output?: 'systemMessage' }} [options]
 */
export function runHook(hookEventName, fn, options) {
  const output = options && options.output === 'systemMessage' ? 'systemMessage' : 'context';
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
      if (finished) return;
      if (Date.now() - started >= budgetMs) return;
      if (typeof text !== 'string' || text.length === 0) return;
      finished = true;
      clearTimeout(timer);
      if (output === 'systemMessage') writeSystemMessage(text);
      else writeContext(hookEventName, text);
    } catch {
      // exit 0 with no output
    } finally {
      finished = true;
      clearTimeout(timer);
      process.exit(0);
    }
  })();
}
