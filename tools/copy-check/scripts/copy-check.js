#!/usr/bin/env node
/**
 * copy-check: count and match page copy. Node built-ins only.
 *
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { runCopyCheck } from './copy-check-core.js';

try {
  const result = runCopyCheck(process.argv.slice(2));
  if (typeof result === 'string') {
    process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  const message = error instanceof Error && error.message
    ? error.message
    : 'Error: copy-check failed.';
  const line = message.startsWith('Error:') ? message : `Error: copy-check failed: ${message}`;
  process.stderr.write(line.endsWith('\n') ? line : `${line}\n`);
  process.exit(1);
}
