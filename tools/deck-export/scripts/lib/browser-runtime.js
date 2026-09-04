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
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// Playwright's own default launch timeout, DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT in
// playwright-core, stated here rather than assumed. `launch()` passes no
// timeout and therefore gets this; the trial in `check()` passes it explicitly
// so the two are bounded identically. A trial that gives up sooner than the
// launch it is proving reports "not installed" for a browser that works.
const LAUNCH_TIMEOUT_MS = 3 * 60 * 1000;

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

// Where the compatibility shims are built.
//
// Derived from THIS TOOL'S OWN ROOT, and from nothing else. No environment
// variable is read and no platform is branched on, because both were wrong here
// before: an earlier revision hardcoded the Linux browser-cache default for
// every platform, and read the browser-path variable so literally that the
// documented value "0" - truthy in JavaScript - yielded a RELATIVE path and
// compiled a shared library into a directory named 0 in whatever directory the
// caller happened to be standing in.
//
// The revision after that asked Node where `playwright` resolved from. That is
// correct under npm and wrong under a store-linked install: require.resolve
// returns the REALPATH, so with pnpm or a symlinked node_modules the shims land
// in a shared package store rather than in this tool, which may be shared
// between copies or read-only. Reviewers disagreed about whether that is
// reachable on the supported npm ci path. It does not matter: the tool root is
// knowable without asking the resolver at all.
//
// So: walk up from this file to the nearest package.json, which is the tool's
// own manifest, and build in the node_modules beside it. That directory is
// guaranteed writable (the install just wrote it), already ignored by this
// repository, and inside this tool under every package manager. tools/AGENTS.md
// states exactly that, and now it is true unconditionally.
export function toolRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 12; up += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'cannot place the compatibility shims: no package.json above ' +
    fileURLToPath(import.meta.url) + ', so this tool has no root to build in'
  );
}

// Exported for the gate check, which calls it rather than reading it. Three
// rounds of this build produced checks written against the sentence that
// described this function instead of against the function, and each of them
// reported zero while the code was wrong. A check that can execute it cannot
// make that mistake.
export function libCacheDir() {
  return join(toolRoot(), 'node_modules', '.wiser-lib');
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

  // NOTHING IS DECIDED FROM THIS PATH, and an absent one is not a verdict.
  //
  // `chromium.executablePath()` names Chrome for Testing whatever `headless`
  // is, while a default headless launch runs Chrome Headless Shell -- a
  // different artifact in a different directory. Until round 11 an absent path
  // returned here with a remediation, and the caller turned that into
  // "artifact missing, install it": a COMPLETE, WORKING headless shell was
  // reported absent and a several-hundred-megabyte download demanded, measured
  // against a root holding the shell and no Chrome. The same commit's own
  // comment claimed there was no executable path left deciding anything; there
  // was, and this was it.
  //
  // So the report carries `chromiumBinary` as information and the LAUNCH
  // decides. There is nothing to shim without a binary to inspect, so this
  // returns early -- but it sets no remediation and no failure, and `check()`
  // goes on to try the launch.
  if (!report.chromiumBinary) return report;

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
    return 'dependency: Chromium build (Playwright); check: node scripts/<entry>.js <command> --install, which fetches it from cdn.playwright.dev in the same run and repairs an incomplete or emptied build as well as an absent one. tools/AGENTS.md names the states and where the build lands.';
  }
  if (line) {
    // Keep a short cause without install walkthroughs; still name the capability.
    return `dependency: Chromium launch; check: trial launch of about:blank. Next: ${line}`;
  }
  return 'dependency: Chromium launch; check: trial launch of about:blank. Next: re-run check after fixing the host environment.';
}

/**
 * WHY A FAILED LAUNCH IS NOT ONE THING, AND WHY THE MESSAGE CANNOT DECIDE ALONE.
 *
 * Round 10 found every browser tool responding to `chromiumLaunch === false`
 * with an install and then a forced reinstall, because the caller had reduced
 * this whole report to a boolean. A missing OS library, an absent C compiler,
 * an unwritable shim directory, a denied `mkdtemp` and a sandbox policy all
 * arrive as false -- and all of them sent the run into a destructive browser
 * replacement that could not fix any of them.
 *
 * Round 11 then found the opposite: a browser that started and died fell
 * through to 'unknown' and the forced refetch, its only repair, was withheld.
 * The fix for that mapped "Failed to launch the browser process" to 'artifact'.
 *
 * ROUND 12 MEASURED WHAT THAT COST, AND IT IS THE REASON THIS FUNCTION IS
 * SHAPED THE WAY IT IS NOW. That same first line is what a COMPLETE, HEALTHY
 * browser produces when the machine stops it: no display for a headful launch,
 * a security tool killing the process, an out-of-memory kill, a sandbox policy.
 * Three reviewers reproduced a forced repair deleting a complete browser on
 * exactly that signature, one of them a real 356MB Chrome for Testing removed
 * by `session start`, the command the documentation gives first. And two REAL
 * damage states were being read backwards at the same time: a truncated binary,
 * which is what an interrupted download leaves, matched nothing and fell to
 * 'unknown' so the only repair was withheld; and a browser whose execute bit
 * had been lost carried EACCES on line one, was read as 'host', and the tool
 * told the reader that reinstalling would not help, which was false -- `chmod
 * +x` alone fixed it.
 *
 * Six rounds of adding one more string to a pattern list produced six more
 * wrong answers, so this no longer asks WHICH WORDS the message contains. It
 * asks WHERE THE FAILURE HAPPENED, which is a structural fact the message
 * always carries:
 *
 *   - The operating system refused to EXECUTE the file. Node reports that as a
 *     `spawn` error, and Playwright passes it through verbatim: `spawn ENOEXEC`
 *     for a file that is not a program, `spawn <path> EACCES` for one that may
 *     not be run, `spawn Unknown system error -88` for a half-written Mach-O.
 *     The file itself is wrong. That is 'artifact' and an install repairs it.
 *   - Playwright never got as far as the file, or says outright that it is not
 *     there. That is 'artifact' too.
 *   - The process STARTED and then ended. Nothing here can tell you whether the
 *     bytes were subtly wrong or the machine killed it, because both produce
 *     the same sentence. That is 'crashed', and the callers DO NOT REPLACE THE
 *     BUILD ON IT -- they say what is ambiguous and name the exact scoped
 *     command, so a reader who has ruled out the machine can run it themselves.
 *     A tool must never destroy a working artifact on a guess; making the
 *     reader type one command is the smaller cost by a wide margin.
 *   - Everything else that names a resource this machine denied is 'host'.
 *
 * Measured on isolated roots, every state beside a live control: absent,
 * zero-length, truncated, random bytes and execute-bit-stripped all reach
 * 'artifact'; a denied `mkdtemp` reaches 'host'; a host-killed healthy browser
 * reaches 'crashed' and nothing is deleted.
 *
 * THIS DELIBERATELY NARROWS ROUND 11's FINDING D. A browser that starts and
 * dies is no longer repaired automatically. It is repaired by one named
 * command the reader runs, because the automatic version of that repair was
 * measured deleting browsers nobody had broken.
 */
function classifyFailure(error, report) {
  const text = error && error.message ? String(error.message) : '';
  const line = text.split('\n')[0].trim();

  // A library this runtime could not stub is the host, whatever else is said.
  if (report.missingLibs && report.missingLibs.length) return 'host';

  // EXEC-TIME FAILURE: the OS would not run the file. This is checked BEFORE
  // the host codes on purpose. `spawn <path> EACCES` is a mode bit on the
  // browser's own binary and an install repairs it; `EACCES ... mkdtemp` is a
  // directory this machine denied and an install cannot. Round 12 measured the
  // old order sending the first of those to 'host' and printing a false claim.
  if (/(^|[^\w])spawn([^\w]|$)/i.test(line)) return 'artifact';

  // Playwright saying outright that the build is not there.
  if (/Executable doesn't exist|please run the following command to download/i.test(line)) {
    return 'artifact';
  }

  // A host that cannot run browsers at all. These are Playwright's and the
  // dynamic loader's own words; none occurs by accident.
  if (/Host system is missing dependencies|install-deps|error while loading shared libraries|cannot open shared object/i.test(text)) {
    return 'host';
  }
  if (/EPERM|EACCES|EROFS|ENOSPC|ENOMEM|permission denied|mkdtemp/i.test(line)) return 'host';

  // THE PROCESS STARTED AND THEN ENDED, and this message cannot say why.
  // Never forced. See the note above.
  if (/Failed to launch the browser process|Target page, context or browser has been closed|Target closed|browser has disconnected|Timeout \d+ms exceeded/i.test(line)) {
    return 'crashed';
  }
  return 'unknown';
}

/**
 * WHICH ARTIFACT A FORCED REPAIR MAY TOUCH, AND WHY NOT ALL OF THEM.
 *
 * `playwright install chromium --force` removes and refetches ALL THREE
 * artifacts -- Chrome for Testing, Chrome Headless Shell and FFmpeg -- because
 * Playwright deletes each directory before it downloads into it.
 *
 * Round 11 measured what that costs. A headless tool repairing a corrupted
 * shell deleted a COMPLETE, WORKING 356MB Chrome for Testing, could not
 * refetch it, and aborted before it ever reached the shell it was sent to fix:
 * the artifact that worked was gone and the broken one was untouched. With no
 * PLAYWRIGHT_BROWSERS_PATH set that is the machine's SHARED browser cache, so
 * the loss reaches every other browser tool here and every other Playwright
 * project on that machine. Three reviewers reproduced it independently.
 *
 * Playwright 1.62 can install one artifact: `chromium-headless-shell` is its
 * own target, and `--no-shell` excludes it. So a forced replacement is scoped
 * to the launch shape that actually failed, and the two large artifacts can no
 * longer destroy each other. FFmpeg (2.5MB) is fetched by either target and is
 * cheap to replace; the guarantee is about the ones that are not.
 */
export function forceInstallArgs(options = {}) {
  return options.headless === false
    ? ['install', '--no-shell', 'chromium', '--force']
    : ['install', 'chromium-headless-shell', '--force'];
}

/**
 * Structured survey: installs nothing beyond a userspace stub; proves launch.
 *
 * `options` are the launch options the CALLER is about to use, and passing them
 * is the whole point. Round 10: this trialled a DEFAULT HEADLESS launch, which
 * runs Chrome Headless Shell, while `Browser Control` launches headful, which
 * runs Chrome for Testing -- a different artifact. A hollowed-out Chrome for
 * Testing left this report green and `session start` broken, and `--install`
 * never entered the installer. A capability probe has to probe the capability
 * the caller is about to use.
 *
 * Nothing here throws. `getChromium()` and `prepareBrowserRuntime()` used to sit
 * outside the try, so a partial package install reached the caller as seven
 * frames of Node internals with no cause and no next step.
 */
export async function check(options = {}) {
  const report = {
    playwright: false, chromiumBinary: false, chromiumLaunch: false,
    proxy: Boolean(proxyServer()), hostClass: hostClass(),
    missingLibs: [], shimmed: [], remediation: null, failure: null
  };
  let chromium;
  try {
    chromium = await getChromium();
    report.playwright = true;
  } catch (e) {
    const line = e && e.message ? String(e.message).split('\n')[0].trim() : 'the import failed';
    report.failure = 'host';
    report.remediation =
      'dependency: the playwright package; check: import it from this tool directory. ' +
      `Next: the package is present but did not load (${line}); delete node_modules here and re-run the command with --install.`;
    return report;
  }
  let prepared;
  try {
    prepared = await prepareBrowserRuntime();
  } catch (e) {
    const line = e && e.message ? String(e.message).split('\n')[0].trim() : 'preparation failed';
    report.failure = 'host';
    report.remediation =
      `dependency: the browser runtime on this host; check: prepareBrowserRuntime(). Next: ${line}`;
    return report;
  }
  Object.assign(report, prepared, { failure: null });
  // `chromiumBinary` is NOT consulted here. It names Chrome for Testing on
  // every platform, and a headless tool does not run that binary; round 11
  // measured this early return refusing a working headless shell. The launch
  // below is the test, and it is the same launch the caller is about to make.
  if (report.remediation) {
    // prepareBrowserRuntime only sets this for a host it cannot make launchable:
    // a library it may not stub, or a stubbable one with no compiler.
    report.chromiumLaunch = false;
    report.failure = 'host';
    return report;
  }
  try {
    // A bounded trial, bounded THE SAME WAY the real launch is.
    //
    // Round 10 gave this a timeout because an unbounded hang hangs the tool.
    // Round 11 measured the cost of picking a tighter one than the launch it
    // proves: `launch()` passes no timeout and gets Playwright's own
    // DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT of 3 minutes, so a cold machine whose
    // browser starts in 77 seconds had a trial fail at 60 and was told to
    // download a browser it already had.
    //
    // The args and proxy are merged exactly as `launch()` merges them, for the
    // same reason: a trial that differs from the launch proves a different
    // launch, which is the defect this whole file was rewritten to end.
    const opts = { ...options, args: [...DEFAULT_ARGS, ...(options.args || [])], timeout: LAUNCH_TIMEOUT_MS };
    const server = proxyServer();
    if (server && !opts.proxy) opts.proxy = { server };
    const b = await chromium.launch(opts);
    const p = await b.newPage();
    await p.goto('about:blank');
    await p.close();
    await b.close();
    report.chromiumLaunch = true;
  } catch (e) {
    report.chromiumLaunch = false;
    report.remediation = remediationFromLaunchError(e, report.hostClass);
    report.failure = classifyFailure(e, report);
  }
  return report;
}
