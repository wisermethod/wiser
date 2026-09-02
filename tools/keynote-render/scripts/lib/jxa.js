/**
 * The osascript seam. Every Keynote operation this tool performs is a JXA
 * script handed to /usr/bin/osascript; nothing else in the tool talks to the
 * application. Node built-ins only, per the Script Contract.
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const OSASCRIPT = '/usr/bin/osascript';

// Keynote 15.1 and later can install as a separate "Creator Studio" bundle.
// Which bundle is present decides the name every script must address, in both
// the JXA spelling and the AppleScript spelling, so both are rewritten below.
const BUNDLES = [
  { path: '/Applications/Keynote Creator Studio.app', app: 'Keynote Creator Studio' },
  { path: '/Applications/Keynote.app', app: 'Keynote' }
];

/** The installed Keynote bundle, or null when neither name is in /Applications. */
export function keynoteBundle() {
  return BUNDLES.find((b) => existsSync(b.path)) ?? null;
}

/** True when osascript answers a trivial JXA expression. Launches no application. */
export function osascriptPresent() {
  try {
    execFileSync(OSASCRIPT, ['-l', 'JavaScript', '-e', 'JSON.stringify(true)'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// AppleScript error codes worth translating. Anything else is reported with its
// code and osascript's own line, which is local diagnostic output: this tool
// holds no credential and opens no connection, so nothing in that line can be one.
const FIXES = {
  '-1743': 'Keynote automation is not permitted for this terminal. Allow it under System Settings, Privacy & Security, Automation, then run the command again.',
  '-1728': 'Keynote could not find the document, slide, or item the command named.',
  '-1700': 'Keynote refused the value type this operation passed.',
  '-1708': 'Keynote does not understand this command; the installed version may not support it.',
  '-10810': 'Keynote could not be launched.',
  '-128': 'The operation was cancelled in the Keynote interface.'
};

export class KeynoteError extends Error {
  constructor(stderr, exitCode) {
    const raw = String(stderr).trim();
    const code = (raw.match(/\((-?\d+)\)\s*$/) ?? [])[1];
    // osascript wraps a raised message in its own prefixes and trailing code.
    // -2700 is the generic "the script raised" code, so it carries no meaning
    // for a caller and is dropped; a real Keynote code is kept for diagnosis.
    const detail = raw
      .replace(/^execution error:\s*/i, '')
      .replace(/\s*\(-?\d+\)$/, '')
      .replace(/^(Error:\s*)+/i, '')
      .trim();
    const fix = code ? FIXES[code] : undefined;
    const suffix = code && code !== '-2700' ? ` (AppleScript ${code})` : '';
    super(
      fix ? `${fix}${suffix}`
        : detail ? `${detail}${suffix}`
          : `Keynote scripting failed (osascript exit ${exitCode ?? 'unknown'}).`
    );
    this.name = 'KeynoteError';
    this.appleScriptCode = code ? Number(code) : null;
  }
}

/**
 * Run a JXA body against Keynote and return its parsed JSON result.
 *
 * The body is wrapped in run(argv) because that is the entry point osascript
 * calls, and `params` arrives as a JSON string in argv[0] rather than being
 * interpolated into the script, so deck text carrying quotes cannot break it.
 * The body returns a JSON string; anything else comes back as a raw string.
 */
export function runJXA(body, params = {}, { timeout = 60_000 } = {}) {
  const bundle = keynoteBundle();
  const script = rewriteAppName(
    `function run(argv) {\n  const params = JSON.parse(argv[0]);\n${body}\n}\n`,
    bundle?.app ?? 'Keynote'
  );

  return new Promise((resolvePromise, reject) => {
    execFile(
      OSASCRIPT,
      ['-l', 'JavaScript', '-e', script, JSON.stringify(params)],
      { timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            reject(new Error(`Keynote did not answer within ${timeout / 1000}s. A dialog may be open in Keynote, or the deck may be larger than this timeout allows.`));
            return;
          }
          reject(new KeynoteError(stderr || error.message, error.code));
          return;
        }
        const text = String(stdout).trim();
        if (!text) {
          resolvePromise(undefined);
          return;
        }
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          resolvePromise(text);
        }
      }
    );
  });
}

function rewriteAppName(script, app) {
  if (app === 'Keynote') return script;
  return script
    .replaceAll('Application("Keynote")', `Application("${app}")`)
    .replaceAll('application "Keynote"', `application "${app}"`);
}
