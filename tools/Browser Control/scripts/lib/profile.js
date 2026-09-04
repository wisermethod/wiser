/**
 * Browser Control - profile hardening.
 *
 * Native Chromium prompts (save-password bubbles, autofill, translate bars,
 * permission and download prompts, restore-session nags, the first-run screen)
 * stall an automated run because nothing on the page can dismiss them. They are
 * suppressed by editing the profile's own preference files before launch, which
 * is a different surface from JavaScript dialogs; those are handled at runtime
 * by the dialog command.
 *
 * The edit is conservative by design: it never deletes a profile, it touches
 * only the preference keys named here, it backs up each file before writing, it
 * is idempotent, and it declines to write to a profile another browser is
 * currently using.
 */

import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Chromium content settings: 2 blocks.
const BLOCK = 2;

function standardPreferences() {
  return {
    credentials_enable_service: false,
    credentials_enable_autosignin: false,
    profile: {
      password_manager_enabled: false,
      exit_type: 'Normal',
      default_content_setting_values: { notifications: BLOCK }
    },
    autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false },
    payments: { can_make_payment_enabled: false },
    translate: { enabled: false },
    download: { prompt_for_download: false, directory_upgrade: true },
    browser: { has_seen_welcome_page: true, check_default_browser: false }
  };
}

/**
 * Unattended runs additionally deny geolocation, microphone, and camera by
 * default, so a page asking for one fails instead of waiting on a prompt no
 * agent can answer. An attended profile leaves them at the site default, since
 * blocking them silently breaks interactive use.
 */
function unattendedPreferences() {
  const preferences = standardPreferences();
  preferences.profile.default_content_setting_values = {
    ...preferences.profile.default_content_setting_values,
    geolocation: BLOCK,
    media_stream_mic: BLOCK,
    media_stream_camera: BLOCK
  };
  // 5 opens the new-tab page instead of restoring the previous session.
  preferences.session = { restore_on_startup: 5 };
  return preferences;
}

function localStatePreferences() {
  return { browser: { check_default_browser: false, default_browser_setting_enabled: false } };
}

/**
 * Extra Chromium switches, added only where Playwright does not already pass an
 * equivalent. Never add a second --disable-features: Chromium keeps the last
 * occurrence of a repeated switch, so a second one silently replaces the list
 * Playwright curated. Prompt suppression therefore rides on preferences instead.
 */
export function launchArgs({ unattended }) {
  return unattended ? ['--disable-notifications'] : [];
}

/**
 * True when a browser is holding this profile. The singleton markers are
 * symlinks whose targets do not exist, so they have to be checked without
 * following the link.
 */
export function isProfileInUse(profileDir) {
  return ['SingletonLock', 'SingletonSocket'].some((marker) => {
    try {
      lstatSync(join(profileDir, marker));
      return true;
    } catch {
      return false;
    }
  });
}

function mergeInto(target, patch) {
  const out = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeInto(out[key], value)
      : value;
  }
  return out;
}

function readJson(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt or caught mid-write. Returning null tells the caller to leave it
    // alone rather than overwrite a file it cannot read.
    return null;
  }
}

function patchJson(filePath, patch, notes) {
  const existing = readJson(filePath);
  if (existing === null) {
    notes.push(`left ${filePath} untouched: it is not valid JSON`);
    return;
  }
  if (existsSync(filePath)) {
    copyFileSync(filePath, `${filePath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  }
  writeFileSync(filePath, JSON.stringify(mergeInto(existing, patch)));
}

/**
 * Prepare a profile directory for launch.
 *
 * @param {string} profileDir absolute path to the profile, named by the caller
 * @param {{unattended?: boolean}} options
 * @returns {{hardened: boolean, notes: string[]}}
 */
export function hardenProfile(profileDir, { unattended = false } = {}) {
  const notes = [];
  mkdirSync(profileDir, { recursive: true });

  // THE PROFILE IS THE SIGN-IN STORE, SO ONLY ITS OWNER MAY WALK INTO IT.
  //
  // TOOL.md names this the first of three paths that hold credential material.
  // It was being created at the process umask -- 0755 on a default macOS or
  // Linux account -- so any other account on the machine could traverse and
  // read it. Round 12 measured it: 2 of 57 files in a live profile were
  // world-readable, and while Chromium sets 0600 on the cookie store itself,
  // the directory around it was open. Twelve gate rounds checked that the
  // documentation NAMED the three paths and none of them ran `stat`.
  //
  // The directory is the durable control: Chromium rewrites Preferences and
  // Local State on its own schedule, so a mode set on those files does not
  // survive, while a mode on the directory blocks traversal regardless. Set
  // after mkdir as well, because a directory that already existed keeps the
  // mode it had and mkdir's mode argument is ignored then -- the same reason
  // publishToken() chmods after creating.
  try { chmodSync(profileDir, 0o700); } catch { /* best effort on exotic filesystems */ }

  if (isProfileInUse(profileDir)) {
    notes.push('another browser is using this profile, so its preferences were left as they are');
    return { hardened: false, notes };
  }

  const preferences = unattended ? unattendedPreferences() : standardPreferences();

  // "Default" always exists once Chromium has run; a second sub-profile is
  // patched only when the browser itself created one.
  const subProfiles = ['Default'];
  if (existsSync(join(profileDir, 'Profile 1'))) subProfiles.push('Profile 1');

  for (const sub of subProfiles) {
    mkdirSync(join(profileDir, sub), { recursive: true });
    patchJson(join(profileDir, sub, 'Preferences'), preferences, notes);
  }

  patchJson(join(profileDir, 'Local State'), localStatePreferences(), notes);

  return { hardened: true, notes };
}
