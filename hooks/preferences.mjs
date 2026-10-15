#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runHook } from './lib/run.mjs';

/**
 * The one line the session reads at every start, resume, clear and compact.
 * It reminds the session where a person's standing preferences are kept; it
 * enforces nothing, and Claude Code's own memory stays the person's setting.
 */
export const PREFERENCES_REMINDER = 'Wiser keeps this person\'s standing preferences, how they want sessions to work with them in any work, on their Wiser account, so every app they use with Wiser gets them. When they state one, such as how sessions should work from now on, load Wiser\'s Save Preference skill to offer keeping it there, rather than keeping it only in Claude Code\'s own memory.';

/**
 * SessionStart. Prints the reminder as context for the model, whatever the
 * event's source, reading nothing and writing nothing.
 * @returns {string}
 */
export function preferencesReminder() {
  return PREFERENCES_REMINDER;
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
  runHook('SessionStart', () => preferencesReminder());
}
