#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runHook } from './lib/run.mjs';

/**
 * The one line the session reads at every start, resume, clear and compact.
 * It reminds the session where a person's standing preferences are kept; it
 * enforces nothing, and Claude Code's own memory stays the person's setting.
 */
export const PREFERENCES_REMINDER = 'Wiser keeps a person\'s standing preferences, how they want sessions to work with them in any work, on their Wiser account, not in Claude Code\'s own memory. When the person\'s own turn states one, follow Wiser\'s Save Preference skill on whether and when to offer keeping it there; where Wiser is not connected or saving is not open, that skill says so.';

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
