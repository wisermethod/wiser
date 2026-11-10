import { existsSync, readFileSync } from 'node:fs';
/**
 * Reads the request file. The parser's own message is never echoed: it quotes
 * the first bytes of whatever it was handed, and this path is a caller-supplied
 * argument that can land on any readable file.
 *
 * `requestPath` arrives already screened by the entry script: absolute,
 * canonicalized, and cleared of this tool's own directory. It is used exactly
 * as given, because re-resolving it here against the current directory would
 * open a path the screen never saw.
 */
export function loadRequest(requestPath, fail) {
  if (!existsSync(requestPath)) {
    fail(`Error: no file at ${requestPath}. Check the path passed to --request.`);
  }

  let text;

  try {
    text = readFileSync(requestPath, 'utf8');
  } catch (error) {
    fail(`Error: could not read ${requestPath}: ${error.code || 'read failed'}.`);
  }

  try {
    return { request: JSON.parse(text), requestPath };
  } catch {
    fail(`Error: ${requestPath} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`);
  }
}

