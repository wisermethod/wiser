#!/usr/bin/env node
/**
 * site-crawl - a bounded, polite crawl of one site
 *
 * Usage:
 *   node scripts/site-crawl.js help
 *   node scripts/site-crawl.js crawl --start <url> --output <dir>
 *
 * Node built-ins only, no packages, so there is nothing to install and nothing
 * to check before the work runs. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { runSiteCrawl } from './site-crawl-core.js';

async function main() {
  try {
    const result = await runSiteCrawl(process.argv.slice(2));
    if (typeof result === 'string') {
      process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error && error.name === 'UsageError'
      ? error.message
      : `Error: crawl failed: ${error && error.message ? error.message : 'no detail available'}`;
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();
