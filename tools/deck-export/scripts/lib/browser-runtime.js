/**
 * browser-runtime.js: the shared Chromium launch runtime for this plugin's browser tools.
 *
 * This file is vendored verbatim into each browser tool's scripts/lib/ directory,
 * so every copy is byte-identical. Change one and change them all in the same act;
 * a copy that drifts is a tool that launches differently from its siblings.
 *
 * Self-contained per Script Contract: imports only Node built-ins and the tool's
 * own node_modules ('playwright'). No path reaches outside the tool directory.
 *
 * What it does, and why it exists
 * -------------------------------
 * Chromium on a fresh Linux host (notably Claude Cowork's sandbox) links a small
 * set of X11 shared libraries that the base image may not ship. On the Cowork
 * image the ONLY missing library is libXdamage.so.1; every other Chromium runtime
 * lib is present. Playwright refuses to launch in two ways:
 *   1. a pre-flight host-requirements validation that throws before spawn, and
 *   2. the dynamic loader, which cannot start a binary whose DT_NEEDED lib is absent.
 *
 * This module makes launch work WITHOUT root and WITHOUT expanding the network
 * allowlist:
 *   - It detects missing libraries with `ldd` on the actual Chromium binary.
 *   - For libraries that Chromium hard-links but only calls on the X11 backend
 *     (headless never invokes them), it builds a truthful userspace stub with the
 *     host C compiler and puts it on LD_LIBRARY_PATH. libXdamage's stub reports the
 *     Damage extension absent — the correct answer on a host with no X server.
 *   - It sets PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 (defensive; once the lib
 *     resolves, Playwright's own validator also passes) and passes container-safe
 *     launch args, and forwards HTTPS_PROXY into Chromium for CDN-loaded content.
 *
 * It NEVER installs system packages and NEVER calls sudo. If a missing library is
 * not in the headless-safe stubbable set, or no compiler is present, it stops and
 * reports the failed check, the missing capability, and the one next step for the
 * host class — per the Script Contract's System dependencies clause.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

// Playwright is loaded lazily, never at module load. Importing this module must
// not pull in playwright, so a tool that vendors it still answers `help`/`--help`
// on a copy that has never been installed (Script Contract: Help without
// configuration). The browser package is imported only inside the functions that
// actually touch a browser.
let _chromium;
async function getChromium() {
  if (!_chromium) ({ chromium: _chromium } = await import('playwright'));
  return _chromium;
}

// Container-safe defaults. --no-sandbox: the Chromium sandbox needs privileges a
// no-new-privileges sandbox denies. --disable-dev-shm-usage: guards against a tiny
// /dev/shm. --disable-gpu: no GPU in headless server contexts. All are inert where
// unneeded, so they are safe to apply on every host.
const DEFAULT_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

// Libraries Chromium links (DT_NEEDED) but only calls on the X11 Ozone backend.
// Headless Chromium (Ozone 'headless') never connects to X, so these are never
// invoked and a symbol-only stub is correct. Keep this set SMALL and audited: a
// library the browser actually uses must never be stubbed.
const SHIMMABLE = {
  'libXdamage.so.1': {
    src: `/* Truthful stub for libXdamage.so.1.
 * Chromium references 4 XDamage symbols but only on the X11 backend.
 * Headless never calls them. QueryExtension returns False = "no X Damage
 * extension here", the correct answer with no X server. */
int  XDamageQueryExtension(void *d, int *ev, int *er){ if(ev)*ev=0; if(er)*er=0; return 0; }
unsigned long XDamageCreate(void *d, unsigned long w, int l){ return 0; }
void XDamageDestroy(void *d, unsigned long dm){ }
void XDamageSubtract(void *d, unsigned long dm, unsigned long a, unsigned long b){ }
`
  }
};

function proxyServer() {
  const s = process.env.HTTPS_PROXY || process.env.https_proxy ||
            process.env.HTTP_PROXY || process.env.http_proxy || '';
  return typeof s === 'string' && s.trim() ? s.trim() : '';
}

// Machine-wide cache beside the Playwright browser cache the platform already
// blesses (Playwright downloads Chromium here). Not inside any tool directory.
function libCacheDir() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ||
               join(homedir(), '.cache', 'ms-playwright');
  return join(base, '.wiser-lib');
}

function missingLibs(execPath) {
  try {
    const out = execFileSync('ldd', [execPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [...out.matchAll(/^\s*(\S+)\s*=>\s*not found/gm)].map((m) => m[1]);
  } catch {
    return []; // ldd absent or non-ELF: treat as "nothing provably missing".
  }
}

function haveCompiler() {
  for (const cc of ['cc', 'gcc']) {
    try { execFileSync(cc, ['--version'], { stdio: 'ignore' }); return cc; } catch { /* next */ }
  }
  return null;
}

function hostClass() {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  try { if (typeof process.getuid === 'function' && process.getuid() === 0) return 'linux-root'; } catch { /* */ }
  return 'linux-unprivileged';
}

function buildShim(lib, dir, cc) {
  const src = join(dir, lib.replace(/[^\w.]/g, '_') + '.c');
  writeFileSync(src, SHIMMABLE[lib].src);
  const so = join(dir, lib);
  execFileSync(cc, ['-shared', '-fPIC', `-Wl,-soname,${lib}`, '-o', so, src], { stdio: 'ignore' });
  return so;
}

/**
 * Make the browser launchable on this host and return a structured report.
 * Mutates process.env (LD_LIBRARY_PATH, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS)
 * so a subsequent chromium.launch() in this process — or a child it spawns —
 * inherits the shim. Idempotent; never installs system packages; never sudo.
 */
export async function prepareBrowserRuntime() {
  const chromium = await getChromium();
  const report = {
    playwright: true, chromiumBinary: false, chromiumLaunch: null,
    proxy: Boolean(proxyServer()), hostClass: hostClass(),
    missingLibs: [], shimmed: [], remediation: null
  };

  let execPath = '';
  try { execPath = chromium.executablePath(); } catch { /* */ }
  report.chromiumBinary = Boolean(execPath) && existsSync(execPath);
  if (!report.chromiumBinary) {
    // Name the dependency and its check; do not embed an install walkthrough
    // (Script Contract: System dependencies). The agent reads current docs.
    report.remediation = 'dependency: Chromium build (Playwright); check: chromium.executablePath() exists; not present.';
    return report;
  }

  const missing = missingLibs(execPath);
  report.missingLibs = missing;
  const stubbable = missing.filter((l) => l in SHIMMABLE);
  const blocking = missing.filter((l) => !(l in SHIMMABLE));

  if (stubbable.length) {
    const cc = haveCompiler();
    if (!cc) {
      // Name the dependency and the single smallest next step; no install menu.
      report.remediation =
        `dependency: ${stubbable.join(', ')} (Chromium OS library); check: ldd <chromium> shows it not found. ` +
        `Next: provide a C compiler (cc/gcc) so it can be stubbed in userspace, or add the library to the base image.`;
      return report;
    }
    const dir = libCacheDir();
    mkdirSync(dir, { recursive: true });
    for (const lib of stubbable) {
      if (!existsSync(join(dir, lib))) buildShim(lib, dir, cc);
      report.shimmed.push(lib);
    }
    process.env.LD_LIBRARY_PATH = dir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
    process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
  }

  if (blocking.length) {
    // Not headless-safe to stub: name them and the smallest next step only.
    report.remediation =
      `dependency: ${blocking.join(', ')} (Chromium OS libraries, not headless-safe to stub); ` +
      `check: ldd <chromium> shows them not found. Next: add them to the base image.`;
  }
  return report;
}

/** Drop-in for chromium.launch(): applies runtime prep, default args, proxy. */
export async function launch(options = {}) {
  await prepareBrowserRuntime();
  const chromium = await getChromium();
  const server = proxyServer();
  const opts = { ...options, args: [...DEFAULT_ARGS, ...(options.args || [])] };
  if (server && !opts.proxy) opts.proxy = { server };
  return chromium.launch(opts);
}

/** Drop-in for chromium.launchPersistentContext() (Browser Control). */
export async function launchPersistentContext(userDataDir, options = {}) {
  await prepareBrowserRuntime();
  const chromium = await getChromium();
  const server = proxyServer();
  const opts = { ...options, args: [...DEFAULT_ARGS, ...(options.args || [])] };
  if (server && !opts.proxy) opts.proxy = { server };
  return chromium.launchPersistentContext(userDataDir, opts);
}

/**
 * Map a raw launch error into Script Contract remediation: dependency + check +
 * one next step. Never paste Playwright's root-only install-deps wall.
 */
function remediationFromLaunchError(error, host) {
  const line = error && error.message ? String(error.message).split('\n')[0].trim() : '';
  if (/install-deps|missing dependencies to run browsers/i.test(line)) {
    return (
      'dependency: Chromium OS libraries; check: chromiumLaunch trial reports false. ' +
      'Next: provide a C compiler so userspace stubs can be built, or add the missing libraries to the base image' +
      (host ? ` (hostClass=${host})` : '') +
      '.'
    );
  }
  if (/Executable doesn't exist|browserType\.launch/i.test(line) && /exist/i.test(line)) {
    return 'dependency: Chromium build (Playwright); check: chromium.executablePath() exists; not present.';
  }
  if (line) {
    // Keep a short cause without install walkthroughs; still name the capability.
    return `dependency: Chromium launch; check: trial launch of about:blank. Next: ${line}`;
  }
  return 'dependency: Chromium launch; check: trial launch of about:blank. Next: re-run check after fixing the host environment.';
}

/** Structured survey: installs nothing beyond a userspace stub; proves launch. */
export async function check() {
  const chromium = await getChromium();
  const report = await prepareBrowserRuntime();
  if (report.chromiumBinary && !report.remediation) {
    try {
      const b = await chromium.launch({ args: DEFAULT_ARGS });
      const p = await b.newPage();
      await p.goto('about:blank');
      await p.close();
      await b.close();
      report.chromiumLaunch = true;
    } catch (e) {
      report.chromiumLaunch = false;
      report.remediation = remediationFromLaunchError(e, report.hostClass);
    }
  } else {
    report.chromiumLaunch = false;
  }
  return report;
}
