#!/usr/bin/env node
/**
 * voice-report-html: one static HTML page showing a root's bound voice, from
 * its voice.md, the confirmed voice-lexicon profile that file names, and the
 * voice key's state line in the root's AGENTS.md. Node built-ins only.
 *
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runVoiceReport } from './voice-report-core.js';

export function main(argv) {
  try {
    const result = runVoiceReport(argv);
    if (typeof result === 'string') {
      process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Error: voice-report-html failed.';
    const line = message.startsWith('Error:') ? message : `Error: voice-report-html failed: ${message}`;
    process.stderr.write(line.endsWith('\n') ? line : `${line}\n`);
    process.exitCode = 1;
  }
}

function runAsProgram() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runAsProgram()) main(process.argv.slice(2));
