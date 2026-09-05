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

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
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
 * WHY A FAILED LAUNCH IS NOT ONE THING, AND WHY NEITHER THE WORDS NOR THE WORD
 * `spawn` CAN DECIDE IT.
 *
 * Round 10 found every browser tool responding to `chromiumLaunch === false`
 * with an install and then a forced reinstall, because the caller had reduced
 * this whole report to a boolean. Round 11 found the opposite: a browser that
 * started and died fell to 'unknown' and its only repair was withheld. Round 12
 * measured what the fix for THAT cost: the same first line is what a COMPLETE,
 * HEALTHY browser produces when the machine stops it, and three reviewers drove
 * a forced repair deleting a complete browser on exactly that signature.
 *
 * ROUND 13 IS WHY THIS FUNCTION LOOKS THE WAY IT DOES NOW. The round-12 fix
 * replaced word-matching with a substring test for `spawn` on line one, checked
 * before the host error codes, on the premise that a `spawn` error means the
 * operating system refused to EXECUTE the file, so the file must be wrong.
 * THAT PREMISE IS FALSE. Node builds the syscall name as
 * `this.spawnfile ? 'spawn ' + this.spawnfile : 'spawn'` and reports it for
 * every failure of `fork` AS WELL AS `exec`, and Playwright passes the error
 * through verbatim. So a machine out of memory, out of process slots or out of
 * file descriptors, a `noexec` mount, and an exec refused by policy all said
 * "the bytes are wrong" and earned a destructive repair. Three parties on three
 * providers each drove a complete browser out of existence through it, one of
 * them on a browser whose only defect was a lost execute bit. A directory named
 * `spawn` anywhere in TMPDIR flipped a host failure onto the same path, because
 * the test was still a substring match on a line that quotes a caller's path.
 *
 * AND THERE IS NO CLOSED LIST OF SPAWN ERRNOS TO EXCLUDE. Node forwards native
 * errors, unrecognised ones arrive numerically, and the set depends on the
 * operating system, the filesystem and the spawn options. A fix written as a
 * deny-list is wrong the first time an unfamiliar code appears, because that
 * code falls straight back onto the destructive branch.
 *
 * SO THE DEFAULT IS THAT NOTHING IS REPLACED, AND ONLY POSITIVE EVIDENCE MOVES
 * OFF IT. The question is never "does this line contain a word" but "WHOSE
 * failure is this, and what is the smallest repair":
 *
 *   'artifact'   The bytes are absent or are not a program. `ENOENT`, `ENOEXEC`,
 *                and Darwin's bad-image errnos. An install repairs it, and a
 *                forced replacement is earned when the plain install had nothing
 *                to fetch.
 *   'permission' The build is INTACT and merely not executable: `EACCES` where
 *                the file's own mode is confirmed by `stat` to have lost its
 *                execute bit. Round 12 proved `chmod +x` alone repairs this.
 *                NOTHING IS REPLACED -- destroying a complete browser to restore
 *                a mode bit is the trade the Script Contract forbids by name.
 *   'host'       The machine, its policy or its resources. Refuse; installing a
 *                browser cannot fix a machine and the forced replacement would
 *                destroy on the way to not fixing it.
 *   'crashed'    The process demonstrably started and then ended or stopped
 *                answering. Nothing here can tell a subtly damaged build from a
 *                machine that killed a healthy one, so nothing is replaced; the
 *                run names the one scoped command for a reader who has ruled the
 *                machine out.
 *   'unknown'    Everything else, including every errno this function does not
 *                recognise and every case the evidence leaves ambiguous. The
 *                callers do the one thing safe in both directions: a PLAIN
 *                install, which downloads only what is missing and replaces
 *                nothing, and no forced replacement.
 *
 * THE PHASE MATTERS AND IS NOW RECORDED. `check()` reports where its trial got
 * to. Once the launch has returned a browser object the bytes have demonstrably
 * been executed, so no later failure can mean "the build is absent or wrong" --
 * it can only mean the browser died or stopped answering. Without that, a
 * timeout while closing a page was being classified from the same table as a
 * binary that would not start.
 */

// Errnos where the browser's own bytes are at fault. Deliberately short: this
// is the ONLY set that can earn a destructive repair, so it holds nothing
// ambiguous. Darwin reports a malformed Mach-O and a bad executable as
// "Unknown system error -88" and "-85"; -86 (EBADARCH, wrong CPU type) is NOT
// here, because refetching identical bytes cannot fix an architecture mismatch.
const BYTES_AT_FAULT = new Set(['ENOENT', 'ENOEXEC']);
const DARWIN_BAD_IMAGE = new Set(['-85', '-88']);

// Errnos that name a resource or a policy of THIS MACHINE. Not exhaustive by
// design -- anything absent from both sets falls to 'unknown', which is the safe
// default, rather than being guessed at.
const HOST_RESOURCE = new Set([
  'EAGAIN', 'EWOULDBLOCK', 'EMFILE', 'ENFILE', 'ENOMEM', 'EPERM', 'E2BIG',
  'ETXTBSY', 'EIO', 'EBADF', 'ENOSYS', 'ENOBUFS', 'EBUSY', 'ENOSPC', 'EROFS',
  'EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EOPNOTSUPP', 'ENOTSUP', 'ENAMETOOLONG'
]);

/**
 * Pull the executable path and the errno out of a Node spawn error.
 *
 * The errno is the LAST thing on the line, which is what makes this safe where
 * a substring test was not: a message that merely quotes a path containing the
 * word `spawn` has no errno in that position and does not match. The path is
 * optional and may contain spaces, so it is captured non-greedily up to the
 * errno that ends the line.
 */
function spawnFailure(line) {
  const m = /(?:^|[^\w])spawn(?:\s+(\S.*?))?\s+(E[A-Z0-9]+|Unknown system error\s+(-?\d+))\s*$/.exec(line);
  if (!m) return null;
  return { path: m[1] || '', code: m[3] !== undefined ? m[3] : m[2] };
}

/** True when `path` is a file this account may not execute because of its mode. */
function lostExecuteBit(path) {
  if (!path) return false;
  try {
    const st = statSync(path);
    return st.isFile() && (st.mode & 0o111) === 0;
  } catch {
    return false; // cannot see it: not positive evidence, so not a repair we may make
  }
}

function classifyFailure(error, report) {
  const text = error && error.message ? String(error.message) : '';
  const line = text.split('\n')[0].trim();

  // A library this runtime could not stub is the host, whatever else is said.
  if (report.missingLibs && report.missingLibs.length) return 'host';

  // THE PROCESS ALREADY RAN. Once `check()` has a browser object the bytes have
  // been executed, so nothing after that can mean the build is absent or wrong.
  // This is checked first so no later rule can claim otherwise.
  if (report.launchPhase && report.launchPhase !== 'launch') return 'crashed';

  // Playwright saying outright that the build is not there.
  if (/Executable doesn't exist|please run the following command to download/i.test(line)) {
    return 'artifact';
  }

  // AN EXEC- OR FORK-TIME FAILURE, DECIDED BY ITS ERRNO AND NEVER BY THE WORD.
  const spawned = spawnFailure(line);
  if (spawned) {
    if (BYTES_AT_FAULT.has(spawned.code) || DARWIN_BAD_IMAGE.has(spawned.code)) return 'artifact';
    // EACCES is the one that has to be resolved rather than guessed. The mode on
    // the browser's own file says whether this is the build or the machine, and
    // round 12 measured both: `chmod +x` alone repaired one, and nothing an
    // install can do repairs the other.
    if (spawned.code === 'EACCES') {
      if (lostExecuteBit(spawned.path)) {
        // The caller has to be able to NAME the file, or "restore the execute
        // bit" is advice nobody can act on.
        report.executablePath = spawned.path;
        return 'permission';
      }
      return 'host';
    }
    if (HOST_RESOURCE.has(spawned.code)) return 'host';
    return 'unknown';
  }

  // A host that cannot run browsers at all. These are Playwright's and the
  // dynamic loader's own words; none occurs by accident.
  if (/Host system is missing dependencies|install-deps|error while loading shared libraries|cannot open shared object/i.test(text)) {
    return 'host';
  }
  if (/EPERM|EACCES|EROFS|ENOSPC|ENOMEM|permission denied|mkdtemp/i.test(line)) return 'host';

  // Started and then ended, or stopped answering. Never forced.
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
    missingLibs: [], shimmed: [], remediation: null, failure: null,
    launchPhase: null, executablePath: null
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
  // WHERE THE TRIAL GOT TO, RECORDED, BECAUSE IT CHANGES WHAT A FAILURE MEANS.
  //
  // This block spans a launch, a page, a navigation and a teardown. Round 13
  // found a timeout at ANY of them classified as "the browser started and then
  // stopped before it was ready", which is false for the last three: the browser
  // is alive. Once `launch()` has returned, the bytes have demonstrably been
  // executed, so no later failure can mean the build is absent or wrong either.
  let phase = 'launch';
  let browser;
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
    browser = await chromium.launch(opts);
    phase = 'page';
    const p = await browser.newPage();
    phase = 'navigate';
    await p.goto('about:blank');
    phase = 'teardown';
    await p.close();
    await browser.close();
    browser = undefined;
    report.chromiumLaunch = true;
  } catch (e) {
    report.chromiumLaunch = false;
    report.launchPhase = phase;
    report.remediation = remediationFromLaunchError(e, report.hostClass);
    report.failure = classifyFailure(e, report);
  } finally {
    // THE BROWSER THIS FUNCTION OPENED IS THE ONE IT CLOSES, ON EVERY PATH.
    //
    // Without this, a throw after a successful launch left the browser running
    // and its handles held the event loop open: round 13 drove a caller that
    // printed its complete result and then did not exit for FOUR HOURS, its
    // browser child still alive. Every shipped caller happens to reach
    // process.exit() on the failure path, which masked it, but that mask is
    // accidental and one new caller removes it.
    if (browser) {
      try { await browser.close(); } catch { /* best effort: the report is already written */ }
    }
  }
  return report;
}
