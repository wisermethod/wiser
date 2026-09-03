#!/usr/bin/env node
/**
 * tag-audit - which analytics and behavior tags a live page serves
 *
 * Usage:
 *   node scripts/tag-audit.js help
 *   node scripts/tag-audit.js audit --url <http or https url>
 *
 * No configuration file and no credentials. undici is installed on first
 * network run so Node fetch honors HTTPS_PROXY in proxy-mediated sandboxes.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Detection patterns. Each tag is present when any of its patterns matches the
// served HTML; the first capturing match supplies the id, where one exists.
const DETECTORS = [
  {
    key: 'clarity',
    label: 'Microsoft Clarity',
    patterns: [
      /clarity\.ms\/tag\/([a-z0-9]+)/i,
      /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]+)["']/i
    ]
  },
  {
    key: 'ga4',
    label: 'Google Analytics 4',
    patterns: [
      /gtag\/js\?id=(G-[A-Z0-9]+)/i,
      /gtag\(\s*["']config["']\s*,\s*["'](G-[A-Z0-9]+)["']/i
    ]
  },
  {
    key: 'gtm',
    label: 'Google Tag Manager',
    patterns: [
      /gtm\.js\?id=(GTM-[A-Z0-9]+)/i,
      /(GTM-[A-Z0-9]+)/
    ]
  },
  {
    key: 'hotjar',
    label: 'Hotjar',
    patterns: [/hjid\s*[:=]\s*(\d+)/i, /static\.hotjar\.com/i]
  },
  {
    key: 'plausible',
    label: 'Plausible',
    patterns: [/plausible\.io\/js\/[^"']*/i]
  },
  {
    key: 'metaPixel',
    label: 'Meta Pixel',
    patterns: [/fbq\(\s*["']init["']\s*,\s*["'](\d+)["']/i, /connect\.facebook\.net\/[^"']*fbevents\.js/i]
  },
  {
    key: 'segment',
    label: 'Segment',
    patterns: [/cdn\.segment\.com\/analytics\.js\/v1\/([a-z0-9]+)/i, /cdn\.segment\.com/i]
  }
];

const TIMEOUT_MS = 20000;

// A compatibility prefix so naive user-agent sniffing serves the same markup a
// browser would get. It names this tool and nothing about who is running it.
const USER_AGENT = 'Mozilla/5.0 (compatible; tag-audit; instrumentation audit)';

const COMMANDS = new Set(['audit']);

const USAGE = `tag-audit - which analytics and behavior tags a live page serves

Usage:
  node scripts/tag-audit.js help
  node scripts/tag-audit.js audit --url <http or https url>

Commands:
  audit            Fetch the page and report the tags its HTML carries
  help             Print this message

Options:
  --url <url>      Page to audit. http or https only; a bare host gains https://
  --install   Authorise the first-run install. Without it a tool that is
              not installed yet reports what it would fetch, and from
              where, and stops. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Detects: Microsoft Clarity, Google Analytics 4, Google Tag Manager, Hotjar,
Plausible, Meta Pixel, Segment.

Reads the served HTML (reported as method: served-html). A loader injected only
after hydration will not appear, so a negative result is not proof of absence;
confirm with a tool that drives a real browser.

Needs no credentials and no configuration file. Success prints one JSON object
to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no configuration.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/tag-audit.js help" for usage.`);
}

// After help: install undici when needed and honor HTTPS_PROXY for Node fetch.
const UNDICI_MARKER = join(TOOL_DIR, 'node_modules', 'undici', 'package.json');
// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Consent before an install, per the Script Contract's Dependencies clause.
//
// A tool used to install its packages on its own account the first time it was
// called, then tell the caller to run the command again. That is two problems:
// several hundred megabytes could arrive on a machine without anyone agreeing
// to it, and the work then took two runs to do once.
//
// A script cannot ask. Nothing here reads stdin, deliberately, so a run with
// nobody watching fails rather than waiting forever for an answer. So the
// script reports and stops, and whoever is driving it does the asking: the
// report names the packages, the hosts they come from, and the size where it is
// large enough to matter, which is what a person needs in order to answer.
// `--install` on the same command authorises it and the run then COMPLETES
// rather than demanding a re-run. WISER_ALLOW_INSTALL=1 authorises it for an
// unattended run, so automation does not acquire a new way to fail.
function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  const browser = names.includes('playwright');
  // A browser tool's authorised run makes TWO fetches, to two different places,
  // and this report used to fold them into one clause that was wrong about both
  // halves: `from registry.npmjs.org and cdn.playwright.dev into <TOOL_DIR>`
  // read as though the Chromium build landed in this directory, which it does
  // not, and it omitted the Microsoft fallback host that the browser message a
  // few lines down gets right. An egress allowlist built from that sentence is
  // short by a host and a disk-space estimate built from it looks in the wrong
  // place. So `hosts` is now only what NPM contacts -- which is the whole truth
  // for the clause it sits in -- and the browser fetch is a sentence of its own
  // with its own hosts and its own destination.
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: 'registry.npmjs.org',
    size: browser
      ? ' This run then fetches the Chromium build that package drives, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
      : ''
  };
}

// `what` is 'packages' or 'browser'. Round 6 found the browser case reported the
// package case: a tool whose packages are installed and whose browser build is
// not is a real state -- every machine that ran a browser tool before the
// installer existed is in it -- and the report a person answers must not open
// "this tool is not installed yet", nor name a registry fetch and an npm cache
// write that this install will not make.
function requireInstallConsent(what) {
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') return;
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this run did not authorise an install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this run did not authorise an install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// Flags are refused here, ABOVE the install. The Script Contract requires an
// option this script does not name to be refused "before any work, any
// dependency install, and any network request", and round 5 found this script
// installing first and refusing after. With --install now authorising the
// fetch, a mistyped option would otherwise cost the whole download before
// anything told the caller they had mistyped it.
const VALUE_FLAGS = new Set(['--url']);
const BARE_FLAGS = new Set([
  '--install','--help', '-h']);

// The position after each value flag belongs to that flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a success object that looks finished and is not what was asked.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/tag-audit.js help" for usage.`);
  }
}

// The REQUIRED argument, checked here too, above the install, and for the same
// reason the unknown-flag loop above is. Round 7 measured two forms that still
// cost a full install before anything told the caller what was wrong:
//
//   audit --install                 -> installed, THEN "--url is required"
//   audit --url --zzz --install     -> installed, THEN "--url needs a value"
//
// The second is why this is not redundant with the loop above: `valuePositions`
// marks the word after `--url` as that flag's VALUE and skips it, so an unknown
// option sitting in a value slot is not an unknown option to that loop at all.
// `flag()` refuses a value beginning with `--`, which is exactly that case. It
// is a function declaration and imports nothing, so calling it here runs before
// the packages do.
{
  const raw = flag('--url');
  if (!raw) {
    fail('Error: --url is required. Run "node scripts/tag-audit.js help" for usage.');
  }
}

if (!existsSync(UNDICI_MARKER)) {
  requireInstallConsent('packages');
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
      cwd: TOOL_DIR,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  } catch {
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires. A lockfile missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
}
{
  const server =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';
  if (typeof server === 'string' && server.trim() !== '') {
    const undici = await import('undici');
    if (typeof undici.setGlobalDispatcher === 'function' && undici.ProxyAgent) {
      undici.setGlobalDispatcher(new undici.ProxyAgent(server.trim()));
    }
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/tag-audit.js help" for usage.`);
  }
  return value;
}

// Target. Validated before any network call, and restricted to the two schemes
// this tool fetches: it reads web pages and never a path on this machine.
function resolveTarget(raw) {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    fail(`Error: --url is not a valid URL: "${raw}". Pass a page address such as https://example.com/pricing.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`Error: --url must be http or https; got "${parsed.protocol}". This tool fetches web pages only.`);
  }
  return parsed;
}

function detect(html) {
  const found = {};
  for (const detector of DETECTORS) {
    let present = false;
    let id = null;
    for (const pattern of detector.patterns) {
      const match = html.match(pattern);
      if (match) {
        present = true;
        if (match[1] && !id) id = match[1];
      }
    }
    found[detector.key] = { label: detector.label, present, id };
  }
  return found;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT }
  });
  return { status: response.status, finalUrl: response.url, html: await response.text() };
}

async function main() {
  const raw = flag('--url');

  if (!raw) {
    fail('Error: --url is required. Run "node scripts/tag-audit.js help" for usage.');
  }

  const target = resolveTarget(raw);

  let fetched;

  try {
    fetched = await fetchHtml(target.href);
  } catch (error) {
    // The cause is named, never the runtime's or the host's own message.
    const reason = error && error.name === 'TimeoutError'
      ? `no response within ${TIMEOUT_MS / 1000} seconds`
      : 'the request did not complete';
    fail(`Error: could not fetch ${target.href}: ${reason}. Confirm the host is reachable from this machine, then re-run.`);
  }

  if (fetched.status < 200 || fetched.status >= 300) {
    fail(`Error: ${target.href} returned HTTP ${fetched.status} (landed on ${fetched.finalUrl}). Auditing an error page would report every tag absent, so this is a failure rather than a result.`);
  }

  const tags = detect(fetched.html);
  const entries = Object.values(tags);
  const present = entries.filter((tag) => tag.present).map((tag) => tag.label);
  const missing = entries.filter((tag) => !tag.present).map((tag) => tag.label);

  const result = {
    url: target.href,
    final_url: fetched.finalUrl,
    http_status: fetched.status,
    method: 'served-html',
    html_bytes: fetched.html.length,
    tags,
    summary: { present },
    missing_note: missing.length
      ? `Not detected in served HTML: ${missing.join(', ')}. A loader injected only after hydration will not appear here; confirm with a browser-driving tool before concluding one is absent.`
      : null
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  // This message is ours; the fetch path reports its own cause above.
  fail(`Error: audit failed unexpectedly: ${error && error.message ? error.message : 'no detail available'}`);
});
