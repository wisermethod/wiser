#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { presenceFileExists, pruneSessions, recordHookSession } from './lib/binding.mjs';
import { gatewayHome } from './lib/presence.mjs';
import { runHook } from './lib/run.mjs';

/**
 * SessionStart. Writes the binding and the pointer whenever this harness's
 * presence file exists, then drops bindings and pointers whose harness is
 * gone and bindings older than seven days. Prints nothing.
 * @param {Record<string, unknown>} event
 * @returns {null}
 */
export function startSession(event) {
  const home = gatewayHome();
  if (!presenceFileExists(home)) return null;
  try {
    recordHookSession({ home, event });
  } catch {
    // a failed write still prunes; the runner would otherwise hide both
  }
  try {
    pruneSessions(home);
  } catch {
    // exit 0 with no output
  }
  return null;
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
  runHook('SessionStart', (event) => startSession(event));
}
