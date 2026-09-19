#!/usr/bin/env node
/**
 * page-speed - PageSpeed Insights v5 readings for one URL and one strategy
 *
 * Usage:
 *   node scripts/page-speed.js help
 *   node scripts/page-speed.js run --url <url> --strategy <mobile|desktop>
 *
 * Node built-ins only, no packages, so there is nothing to install and nothing
 * to check before the work runs. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { runPageSpeed } from './page-speed-core.js';

async function main() {
  try {
    const result = await runPageSpeed(process.argv.slice(2));
    if (typeof result === 'string') {
      process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error && error.name === 'UsageError'
      ? error.message
      : `Error: run failed: ${error && error.message ? error.message : 'no detail available'}`;
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();
