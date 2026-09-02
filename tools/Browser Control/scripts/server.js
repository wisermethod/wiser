#!/usr/bin/env node
/**
 * Browser Control - the session host.
 *
 * Started by "browser.js session start", never by hand. Holds one Chromium
 * context open and answers commands on loopback, so that each CLI invocation
 * acts on the same live page instead of launching a browser of its own.
 *
 *   GET  /status    is a host running, and on what
 *   POST /command   {action, params} -> {ok, result} or {ok, error}
 *   POST /shutdown  close the browser, then exit
 *
 * WHO IS ALLOWED TO ASK. Loopback limits who can reach this socket; it does not
 * say who is asking. Three things do.
 *
 *   1. No browser may ask. A page the controlled browser visits can POST here
 *      with fetch(); the same-origin policy stops it reading the reply but not
 *      the command running, and a body of text/plain is a "simple request" that
 *      takes no preflight to send. Every browser attaches Origin (and Sec-Fetch-
 *      Site) to such a request and no command-line client sends one, so a
 *      request carrying either is refused. This is the load-bearing check.
 *   2. Host must be loopback, so a name that resolves here from elsewhere, the
 *      DNS-rebinding shape, does not reach the actions.
 *   3. A per-session token, generated at start and readable only by this user,
 *      must be presented on every endpoint. The client finds it without being
 *      told, so nobody types it. This is defence in depth for a shared machine.
 *
 * WHAT NONE OF THAT DEFENDS AGAINST, said plainly rather than left implied:
 * another process running AS YOU. It can read the token file exactly as the
 * client does, and it could read the browser profile off disk without asking
 * this server at all. That is not solvable at this layer.
 */

import { chmodSync, existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { hardenProfile, launchArgs } from './lib/profile.js';

const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. A screenshot or a download does
 * not exist yet, so a path whose leaf is absent is canonicalized through the
 * deepest ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the write lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem means the real path cannot be known, and a screen that cannot know
 * where a write lands refuses rather than comparing the caller's spelling.
 */
function canonical(candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        throw new Error(`${candidate} could not be resolved to a real path at ${head}; confirm every folder on the way is readable and that no symbolic link on it points at itself`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * True when `target` names this tool's own directory or something beneath it,
 * decided by identity rather than by spelling.
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and the name test alone let a screenshot be written into this
 * directory. Device and inode are a directory's own identity, which no spelling
 * reaches, so every existing ancestor of `target` is compared that way as well.
 */
function insideToolDirectory(target) {
  const root = canonical(TOOL_DIR);
  if (target === root || target.startsWith(root + sep)) return true;

  let rootId;
  try {
    rootId = statSync(root);
  } catch {
    return false;
  }

  let head = target;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

/**
 * Every caller-named path the host acts on, screened here rather than only in
 * browser.js. The client and the host are two processes, and anything that can
 * reach the loopback port reaches the host without passing through the client,
 * so a rule enforced on one side alone is not enforced.
 */
function screened(path, what) {
  if (typeof path !== 'string' || path === '') throw new Error(`${what} is required`);
  if (!isAbsolute(path)) throw new Error(`${what} must be absolute: ${path}`);
  const target = canonical(path);
  if (insideToolDirectory(target)) {
    throw new Error(`${target} is inside the tool directory; name a work directory in the owning root`);
  }
  return target;
}

const options = { port: 4390, profile: undefined, headless: false, unattended: false };

const VALUE_FLAGS = new Set(['--port', '--profile']);
const BARE_FLAGS = new Set(['--headless', '--unattended']);

// Only the four launch flags this host understands. An unknown option is
// refused rather than ignored: a host started with a mistyped flag would
// otherwise look ready and not be what was asked for.
for (let i = 2; i < process.argv.length; i++) {
  const word = process.argv[i];
  if (VALUE_FLAGS.has(word)) {
    const value = process.argv[i + 1];
    if (value === undefined || value.startsWith('-')) {
      process.stderr.write(`Error: ${word} needs a value.\n`);
      process.exit(1);
    }
    if (word === '--port') options.port = Number.parseInt(value, 10);
    else options.profile = value;
    i += 1;
    continue;
  }
  if (BARE_FLAGS.has(word)) {
    if (word === '--headless') options.headless = true;
    else options.unattended = true;
    continue;
  }
  if (word.startsWith('-')) {
    process.stderr.write(`Error: unknown option "${word}".\n`);
    process.exit(1);
  }
  process.stderr.write(`Error: unexpected argument "${word}".\n`);
  process.exit(1);
}

// The client screens --profile before it spawns this process, and this screens
// it again: a host started by hand, or by anything other than browser.js, would
// otherwise put a browser profile inside this tool directory. The screened path
// replaces the argument, so the profile Chromium is given is the one cleared.
try {
  options.profile = screened(options.profile, '--profile');
} catch (error) {
  process.stderr.write(`Error: the session host needs --profile [absolute dir] outside this tool directory: ${error.message}\n`);
  process.exit(1);
}

// devices only from playwright; Chromium launch goes through browser-runtime.
const { devices } = await import('playwright');
const runtime = await import('./lib/browser-runtime.js');

let context = null;
let page = null;
let currentFrame = null;
let server = null;

let networkLog = [];
let consoleLog = [];
let capturingNetwork = false;
let capturingConsole = false;
let blockedPatterns = [];
let tracing = false;
let dialogMode = 'off';
let interactiveElements = [];

const listeners = { request: null, response: null, console: null, pageerror: null, dialog: null };

/**
 * Retry the transient failures a live page produces: an element still
 * animating, an overlay that has not finished closing, a frame mid-swap.
 * A failure that is not transient is raised on the first try.
 */
async function withRetry(work, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work();
    } catch (error) {
      last = error;
      const transient = /timeout|intercepted|detached|not visible|target closed|element is not/i.test(error.message);
      if (!transient || attempt === attempts) throw error;
      await new Promise((r) => { setTimeout(r, 400 * attempt); });
    }
  }
  throw last;
}

/** The active page, replaced if the one we were holding has gone. */
async function ensurePage() {
  if (!context) throw new Error('the browser context is closed');
  try {
    await page.evaluate(() => true);
    return;
  } catch {
    const open = context.pages();
    if (open.length > 0) {
      page = open[open.length - 1];
      try {
        await page.evaluate(() => true);
        return;
      } catch { /* fall through to a fresh page */ }
    }
    page = await context.newPage();
    currentFrame = null;
  }
}

function activeFrame() {
  return currentFrame ?? page;
}

async function pageInfo() {
  try {
    return { url: page.url(), title: await page.title() };
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    return { url: page.url(), title: await page.title().catch(() => '') };
  }
}

/**
 * A path the caller named. Absolute, outside this tool directory, and never on
 * top of a file that already exists: silently replacing a caller's file is a
 * destructive act with nothing to undo it.
 */
function writeTarget(path) {
  const target = screened(path, 'path');
  if (existsSync(target)) {
    throw new Error(`${target} already exists and this tool never overwrites a file; name a path that does not exist yet`);
  }
  mkdirSync(dirname(target), { recursive: true });
  return target;
}

/**
 * A file the caller asks the browser to upload. It is read by the browser
 * rather than by this process, which is exactly why it needs screening here:
 * nothing downstream of setInputFiles will ask where the bytes came from.
 */
function readTarget(path) {
  const target = screened(path, '--file');
  if (!existsSync(target)) throw new Error(`no file at ${target}`);
  return target;
}

/**
 * Interactive elements, numbered, so an agent can act by index instead of
 * guessing a CSS selector from a screenshot. Runs in the page, so it is written
 * as source text. Open shadow roots are traversed because Playwright's selector
 * engine can reach into them.
 */
const INTERACTIVE_ELEMENTS = `(() => {
  const found = [];
  const seen = new WeakSet();
  const QUERY = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="switch"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

  function describe(el) {
    if (seen.has(el)) return;
    seen.add(el);

    const box = el.getBoundingClientRect();
    if (box.width < 5 || box.height < 5) return;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (parseFloat(style.opacity) < 0.1) return;

    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 80);
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const placeholder = el.placeholder || '';
    const role = el.getAttribute('role') || '';

    let description = label || text || placeholder || tag;
    if (el.type && el.type !== 'submit') description = '[' + el.type + '] ' + description;
    if (tag === 'a' && el.href) {
      try { description += ' -> ' + new URL(el.href).pathname; } catch (e) {}
    }

    let selector;
    if (el.id) {
      selector = '#' + CSS.escape(el.id);
    } else if (el.name && tag !== 'a') {
      selector = tag + '[name="' + CSS.escape(el.name) + '"]';
    } else if (label) {
      selector = '[aria-label="' + CSS.escape(label) + '"]';
    } else if (tag === 'a' && el.getAttribute('href')) {
      selector = 'a[href="' + CSS.escape(el.getAttribute('href')) + '"]';
    } else if (text.length > 2 && text.length < 60) {
      selector = tag + ':has-text("' + text.replace(/"/g, '\\\\"') + '")';
    } else {
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        const prefix = parent.id ? '#' + CSS.escape(parent.id) + ' > ' : '';
        selector = siblings.length === 1
          ? prefix + tag
          : prefix + tag + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
      } else {
        selector = tag;
      }
    }

    found.push({
      index: found.length,
      tag,
      type: el.type || role || '',
      description: description.slice(0, 120),
      selector
    });
  }

  function walk(root) {
    try {
      for (const el of root.querySelectorAll(QUERY)) describe(el);
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    } catch (e) {}
  }

  walk(document);
  return found;
})()`;

function targetFor({ selector, index }) {
  if (selector) return selector;
  if (index === undefined || index === null) return null;
  const element = interactiveElements[index];
  if (!element) {
    throw new Error(`element index ${index} is not in the current list; run "snapshot --format interactive" again, the page has changed`);
  }
  return element.selector;
}

/** Cookie metadata only. A cookie value is a live credential and never leaves the browser. */
function describeCookie(cookie) {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    valueLength: typeof cookie.value === 'string' ? cookie.value.length : 0
  };
}

function detach(event) {
  if (listeners[event]) {
    page.removeListener(event, listeners[event]);
    listeners[event] = null;
  }
}

const actions = {
  async navigate({ url, direction, waitUntil = 'load', timeout = 30000 }) {
    interactiveElements = [];
    if (direction === 'back') await page.goBack({ waitUntil, timeout });
    else if (direction === 'forward') await page.goForward({ waitUntil, timeout });
    else if (direction === 'reload') await page.reload({ waitUntil, timeout });
    else if (url) await page.goto(url, { waitUntil, timeout });
    else throw new Error('navigate needs a url or a direction');
    return pageInfo();
  },

  async click({ selector, index, text, coords, button, clickCount, delay, force, timeout }) {
    const frame = activeFrame();
    const target = targetFor({ selector, index });
    await withRetry(async () => {
      if (target) {
        await frame.click(target, { button, clickCount, delay, force, timeout });
      } else if (text) {
        await frame.getByText(text, { exact: false }).first().click({ button, clickCount, delay, force, timeout });
      } else {
        const [x, y] = String(coords).split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('coords must be two numbers, "x,y"');
        await page.mouse.click(x, y, { button, clickCount, delay });
      }
    });
    return pageInfo();
  },

  async type({ selector, index, text, key, clear, delay, submit, timeout }) {
    if (key) {
      await page.keyboard.press(key);
      return pageInfo();
    }
    const frame = activeFrame();
    const locator = frame.locator(targetFor({ selector, index }));
    await withRetry(async () => {
      if (clear) await locator.fill('', { timeout });
      if (delay) await locator.pressSequentially(text, { delay, timeout });
      else await locator.fill(text, { timeout });
      if (submit) await page.keyboard.press('Enter');
    });
    return pageInfo();
  },

  async snapshot({ format, selector }) {
    const frame = activeFrame();
    const info = await pageInfo();

    if (format === 'interactive') {
      interactiveElements = await frame.evaluate(INTERACTIVE_ELEMENTS);
      const lines = interactiveElements.map(
        (el) => `[${el.index}] <${el.tag}>${el.type ? ` (${el.type})` : ''} ${el.description}`
      );
      return { ...info, format, elementCount: interactiveElements.length, content: lines.join('\n') };
    }

    if (format === 'html') {
      const content = selector ? await frame.locator(selector).innerHTML() : await frame.content();
      return { ...info, format, content };
    }

    if (format === 'text') {
      const content = selector ? await frame.locator(selector).innerText() : await frame.locator('body').innerText();
      return { ...info, format, content };
    }

    // The accessibility tree is the cheapest faithful reading of a page. Where a
    // page defeats it, the visible text is a truthful fallback and says so.
    try {
      return { ...info, format: 'accessibility', content: await frame.locator(selector ?? 'body').ariaSnapshot() };
    } catch {
      return { ...info, format: 'text', fallback: 'accessibility tree unavailable on this page', content: await frame.locator('body').innerText() };
    }
  },

  async screenshot({ output, selector, fullPage }) {
    const target = writeTarget(output);
    const shot = { path: target, fullPage: fullPage === true };
    if (selector) await page.locator(selector).screenshot(shot);
    else await page.screenshot(shot);
    return { ...(await pageInfo()), screenshot: target };
  },

  async wait({ selector, text, time, network, hidden, timeout }) {
    const frame = activeFrame();
    if (time !== undefined) await page.waitForTimeout(time);
    else if (network) await page.waitForLoadState('networkidle', { timeout });
    else if (selector) await frame.waitForSelector(selector, { state: hidden ? 'hidden' : 'visible', timeout });
    else await frame.getByText(text).first().waitFor({ state: hidden ? 'hidden' : 'visible', timeout });
    return pageInfo();
  },

  async execute({ code }) {
    const result = await activeFrame().evaluate(code);
    return { ...(await pageInfo()), result };
  },

  async download({ url, output, selector, outputDir, timeout }) {
    if (url) {
      const target = writeTarget(output);
      const host = new URL(url).host;
      // The context's own request client, so the download carries whatever
      // session the visible browser already has. That is also why the failure
      // path never reports what was sent, only what came back.
      let response;
      try {
        response = await context.request.get(url, { timeout });
      } catch (error) {
        throw new Error(`could not reach ${host}: ${causeOnly(error.message).split(':').pop().trim()}`);
      }
      if (!response.ok()) {
        throw new Error(`download refused with status ${response.status()} by ${host}`);
      }
      const body = await response.body();
      await writeFile(target, body);
      return { ...(await pageInfo()), file: target, bytes: body.length };
    }

    const waiting = page.waitForEvent('download', { timeout });
    await page.click(selector, { timeout: 5000 });
    const download = await waiting;
    const target = writeTarget(join(outputDir, download.suggestedFilename()));
    await download.saveAs(target);
    return { ...(await pageInfo()), file: target, filename: download.suggestedFilename() };
  },

  async upload({ selector, files, timeout }) {
    // Screened here, and the screened paths are the ones handed to the browser:
    // the page receives the file this host cleared, not the spelling the
    // request carried.
    const cleared = (Array.isArray(files) ? files : [files]).map(readTarget);
    await page.setInputFiles(selector, cleared, { timeout });
    return { ...(await pageInfo()), uploaded: cleared };
  },

  async tabs({ action, url, index }) {
    const open = context.pages();
    if (action === 'list') {
      const tabs = await Promise.all(
        open.map(async (p, i) => ({ index: i, url: p.url(), title: await p.title().catch(() => ''), active: p === page }))
      );
      return { tabs };
    }
    if (action === 'new') {
      page = await context.newPage();
      currentFrame = null;
      interactiveElements = [];
      if (url) await page.goto(url);
      return pageInfo();
    }
    if (index !== undefined && (index < 0 || index >= open.length)) {
      throw new Error(`tab index ${index} does not exist; there are ${open.length}, numbered from 0`);
    }
    if (action === 'switch') {
      page = open[index];
      currentFrame = null;
      interactiveElements = [];
      await page.bringToFront();
      return pageInfo();
    }
    // close
    const closing = index === undefined ? page : open[index];
    await closing.close();
    const remaining = context.pages();
    page = remaining.length > 0 ? remaining[0] : await context.newPage();
    currentFrame = null;
    interactiveElements = [];
    return pageInfo();
  },

  async network({ action, pattern }) {
    if (action === 'start') {
      detach('request');
      detach('response');
      networkLog = [];
      capturingNetwork = true;
      listeners.request = (request) => {
        if (capturingNetwork) networkLog.push({ kind: 'request', url: request.url(), method: request.method(), at: new Date().toISOString() });
      };
      listeners.response = (response) => {
        if (capturingNetwork) networkLog.push({ kind: 'response', url: response.url(), status: response.status(), at: new Date().toISOString() });
      };
      page.on('request', listeners.request);
      page.on('response', listeners.response);
      return { capturing: true };
    }
    if (action === 'stop') {
      capturingNetwork = false;
      detach('request');
      detach('response');
      const entries = networkLog;
      networkLog = [];
      return { capturing: false, count: entries.length, entries };
    }
    if (action === 'block') {
      await page.route(`**/*${pattern}*`, (route) => route.abort());
      blockedPatterns.push(pattern);
      return { blocked: [...blockedPatterns] };
    }
    // unblock. Every route is removed at once: a route registered under one
    // pattern cannot be removed by naming a different one.
    await page.unrouteAll();
    blockedPatterns = [];
    return { blocked: [] };
  },

  async console({ action }) {
    if (action === 'start') {
      detach('console');
      detach('pageerror');
      consoleLog = [];
      capturingConsole = true;
      listeners.console = (message) => {
        if (capturingConsole) consoleLog.push({ level: message.type(), text: message.text(), at: new Date().toISOString() });
      };
      listeners.pageerror = (error) => {
        if (capturingConsole) consoleLog.push({ level: 'pageerror', text: error.message, at: new Date().toISOString() });
      };
      page.on('console', listeners.console);
      page.on('pageerror', listeners.pageerror);
      return { capturing: true };
    }
    capturingConsole = false;
    detach('console');
    detach('pageerror');
    const entries = consoleLog;
    consoleLog = [];
    return { capturing: false, count: entries.length, entries };
  },

  async trace({ action, output }) {
    if (action === 'status') return { tracing };
    if (action === 'start') {
      if (tracing) return { tracing: true, note: 'already recording' };
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
      return { tracing: true };
    }
    if (!tracing) return { tracing: false, note: 'nothing was being recorded' };
    const target = writeTarget(output);
    await context.tracing.stop({ path: target });
    tracing = false;
    return { tracing: false, file: target };
  },

  async emulate({ action, device, viewport, geolocation }) {
    if (action === 'reset') {
      await page.setViewportSize({ width: 1280, height: 800 });
      return { ...(await pageInfo()), viewport: { width: 1280, height: 800 } };
    }

    const applied = {};

    if (device) {
      const preset = devices[device];
      if (!preset) {
        throw new Error(`unknown device "${device}"; Playwright's own device list names the ones that work`);
      }
      await page.setViewportSize(preset.viewport);
      applied.device = device;
      applied.viewport = preset.viewport;
    }

    if (viewport) {
      const [width, height] = String(viewport).split('x').map(Number);
      if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('viewport must read WxH, for example 390x844');
      await page.setViewportSize({ width, height });
      applied.viewport = { width, height };
    }

    if (geolocation) {
      const [latitude, longitude] = String(geolocation).split(',').map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('geolocation must read lat,long');
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude, longitude });
      applied.geolocation = { latitude, longitude };
    }

    return { ...(await pageInfo()), emulated: applied };
  },

  async frame({ action, by, value }) {
    const frames = page.frames();
    if (action === 'list') {
      return {
        active: currentFrame ? 'iframe' : 'main',
        frames: frames.slice(1).map((f, i) => ({ index: i, name: f.name(), url: f.url() }))
      };
    }
    if (action === 'main') {
      currentFrame = null;
      interactiveElements = [];
      return { active: 'main', url: page.url() };
    }
    if (action === 'current') {
      return { active: currentFrame ? 'iframe' : 'main', url: currentFrame ? currentFrame.url() : page.url() };
    }
    // switch. Index 0 in the caller's numbering is the first iframe; the main
    // page is reached with "frame main".
    let found = null;
    if (by === 'index') found = frames[value + 1];
    else if (by === 'name') found = frames.find((f) => f.name() === value);
    else found = frames.find((f) => f.url().includes(value));
    if (!found) throw new Error(`no frame matched ${by} "${value}"; run "frame list" to see what is on the page`);
    currentFrame = found;
    interactiveElements = [];
    return { active: 'iframe', url: found.url() };
  },

  async scroll({ to, by, infinite, max }) {
    const frame = activeFrame();
    if (to === 'top') await frame.evaluate(() => window.scrollTo(0, 0));
    else if (to === 'bottom') await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    else if (to) await frame.locator(to).scrollIntoViewIfNeeded();
    else if (by !== undefined) await frame.evaluate((amount) => window.scrollBy(0, amount), by);
    else {
      let height = await frame.evaluate(() => document.body.scrollHeight);
      let loads = 0;
      for (let i = 0; i < max; i++) {
        await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        const grown = await frame.evaluate(() => document.body.scrollHeight);
        if (grown === height) break;
        height = grown;
        loads++;
      }
      return { ...(await pageInfo()), loads, stopped: loads < max ? 'page stopped growing' : 'reached --max' };
    }
    interactiveElements = [];
    return pageInfo();
  },

  async mouse({ action, selector, coords, from, to, delta }) {
    const frame = activeFrame();
    if (action === 'hover' || action === 'move') {
      if (selector) await frame.locator(selector).hover();
      else {
        const [x, y] = String(coords).split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('coords must be two numbers, "x,y"');
        await page.mouse.move(x, y);
      }
    } else if (action === 'drag') {
      await frame.locator(from).dragTo(frame.locator(to));
    } else {
      await page.mouse.wheel(0, delta);
    }
    return pageInfo();
  },

  async select({ action, selector, by, option }) {
    const frame = activeFrame();
    if (action === 'list') {
      const options = await frame.locator(selector).locator('option').evaluateAll((nodes) =>
        nodes.map((node, index) => ({ index, value: node.value, label: (node.textContent || '').trim(), selected: node.selected }))
      );
      return { selector, options };
    }
    const chosen = await frame.selectOption(selector, { [by]: option });
    return { ...(await pageInfo()), selected: chosen };
  },

  async cookies({ action, name, value, domain, path, expires }) {
    if (action === 'list') {
      const all = await context.cookies();
      const matching = domain ? all.filter((c) => c.domain.includes(domain)) : all;
      return { count: matching.length, cookies: matching.map(describeCookie) };
    }
    if (action === 'get') {
      const found = (await context.cookies()).find((c) => c.name === name);
      return found ? { cookie: describeCookie(found) } : { cookie: null };
    }
    if (action === 'set') {
      const cookie = { name, value, domain: domain || new URL(page.url()).hostname, path: path || '/' };
      if (expires !== undefined) cookie.expires = Math.floor(Date.now() / 1000) + expires * 86400;
      await context.addCookies([cookie]);
      return { set: describeCookie(cookie) };
    }
    if (action === 'delete') {
      const existed = (await context.cookies()).some((c) => c.name === name);
      if (existed) await context.clearCookies({ name });
      return { name, deleted: existed };
    }
    const before = (await context.cookies()).length;
    await context.clearCookies();
    return { cleared: before };
  },

  async storage({ action, storage, key, value }) {
    const frame = activeFrame();
    const area = storage === 'session' ? 'sessionStorage' : 'localStorage';
    if (action === 'list') {
      const keys = await frame.evaluate((name) => Object.keys(window[name]), area);
      return { storage: area, count: keys.length, keys };
    }
    if (action === 'get') {
      return { storage: area, key, value: await frame.evaluate(([name, k]) => window[name].getItem(k), [area, key]) };
    }
    if (action === 'set') {
      await frame.evaluate(([name, k, v]) => window[name].setItem(k, v), [area, key, value]);
      return { storage: area, key, set: true };
    }
    if (action === 'delete') {
      const existed = await frame.evaluate(([name, k]) => window[name].getItem(k) !== null, [area, key]);
      await frame.evaluate(([name, k]) => window[name].removeItem(k), [area, key]);
      return { storage: area, key, deleted: existed };
    }
    const before = await frame.evaluate((name) => window[name].length, area);
    await frame.evaluate((name) => window[name].clear(), area);
    return { storage: area, cleared: before };
  },

  async dialog({ mode, text }) {
    if (mode === 'status') return { mode: dialogMode };
    detach('dialog');
    dialogMode = mode;
    if (mode === 'accept') listeners.dialog = async (d) => { await d.accept(); };
    else if (mode === 'dismiss') listeners.dialog = async (d) => { await d.dismiss(); };
    else if (mode === 'prompt') listeners.dialog = async (d) => { await d.accept(text ?? ''); };
    if (listeners.dialog) page.on('dialog', listeners.dialog);
    return { mode: dialogMode };
  },

  async check({ assertion, selector, expected, timeout }) {
    const locator = activeFrame().locator(selector);
    const count = await locator.count();
    const info = { assertion, selector };

    if (assertion === 'exists') return { ...info, passed: count > 0, found: count };
    if (assertion === 'count') return { ...info, passed: count === expected, found: count, expected };
    if (assertion === 'visible') return { ...info, passed: count > 0 && await locator.first().isVisible() };
    if (assertion === 'hidden') return { ...info, passed: count === 0 || !(await locator.first().isVisible()) };

    // Everything below needs an element to interrogate. Absent is a failed
    // assertion, reported as one, and never confused with a broken selector.
    if (count === 0) return { ...info, passed: false, detail: 'no element matched this selector' };

    const first = locator.first();
    if (assertion === 'enabled') return { ...info, passed: await first.isEnabled({ timeout }) };
    if (assertion === 'disabled') return { ...info, passed: !(await first.isEnabled({ timeout })) };
    if (assertion === 'checked') return { ...info, passed: await first.isChecked({ timeout }) };
    if (assertion === 'unchecked') return { ...info, passed: !(await first.isChecked({ timeout })) };
    if (assertion === 'text') {
      const actual = await first.innerText({ timeout });
      return { ...info, passed: actual.includes(expected), expected, found: actual.slice(0, 200) };
    }
    const actual = await first.inputValue({ timeout });
    return { ...info, passed: actual === expected, expected, found: actual.slice(0, 200) };
  }
};

async function shutdown() {
  try {
    if (context) await context.close();
  } catch { /* the browser may already be gone */ }
  context = null;
  page = null;
  // The token is worthless once this process is gone, and a stale one left on
  // disk is a file that looks live to whoever reads it next.
  try { rmSync(TOKEN_FILE, { force: true }); } catch { /* best effort */ }
  if (server) server.close();
  process.exit(0);
}

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Playwright appends a call log to its errors, and for a request that log
 * reproduces the headers it sent. On a page the browser is signed in to, those
 * headers carry the session. Only the cause is reported, never the transcript.
 */
function causeOnly(message) {
  return String(message).split(/\n?Call log:/)[0].trim();
}

/**
 * The session token. Written where only this user can read it, and keyed by
 * port so two hosts never share one. The client reads the same path, so the
 * token never reaches a flag, an argument list, or a person.
 *
 * Outside the plugin, so it has a row in tools/AGENTS.md.
 */
const TOKEN_DIR = join(homedir(), '.wiser', 'browser-control');
const TOKEN_FILE = join(TOKEN_DIR, `${options.port}.token`);
const SESSION_TOKEN = randomBytes(32).toString('hex');

function publishToken() {
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  // chmod after the write as well as before: a pre-existing directory keeps
  // whatever mode it had, and mkdirSync's mode argument is ignored then.
  try { chmodSync(TOKEN_DIR, 0o700); } catch { /* best effort on exotic filesystems */ }
  writeFileSync(TOKEN_FILE, SESSION_TOKEN, { mode: 0o600 });
  try { chmodSync(TOKEN_FILE, 0o600); } catch { /* as above */ }
}

/** Constant-time compare that does not leak length through an early return. */
function tokenMatches(presented) {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(SESSION_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Why a request is refused, or null if it may proceed. Runs before the route is
 * read, so /status and /shutdown are held to the same bar as /command: a page
 * that can shut the host down mid-task is a denial of service, and a /status it
 * can read discloses the profile path.
 */
function refuseReason(req) {
  // 1. A browser is asking. No command-line client sets either header.
  if (req.headers.origin !== undefined) return 'a request carrying an Origin header is a browser request, and no browser may drive this session';
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'none') return 'a request carrying Sec-Fetch-Site is a browser request, and no browser may drive this session';

  // 2. Host must be loopback, so a name that merely resolves here is refused.
  const host = String(req.headers.host || '');
  const bare = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (bare !== '127.0.0.1' && bare !== 'localhost' && bare !== '::1') {
    return `Host must be loopback; got "${host}"`;
  }

  // 3. The session token, which the client reads from the same file this wrote.
  if (!tokenMatches(req.headers['x-wiser-session'])) {
    return 'missing or wrong session token; start the host with "session start" and use this tool\'s own client';
  }
  return null;
}

/**
 * The destructive gate, enforced HERE and not only in the client.
 *
 * browser.js refuses these without --confirm before it sends anything, which is
 * the right place for the message a person reads. It is the wrong place for the
 * rule: the client sits above this socket, so anything talking to the socket
 * directly skipped it. The client now marks an authorised call `confirmed:true`
 * and this refuses the call without it, so the gate holds at the boundary that
 * actually performs the act.
 *
 * Kept in step with browser.js's GATED set by name; the pair is checked by the
 * gate script rather than by comment.
 */
const GATED_ACTIONS = {
  cookies: new Set(['delete', 'clear']),
  storage: new Set(['delete', 'clear']),
  upload: null // every upload
};

function gateFailure(action, params, confirmed) {
  if (!Object.hasOwn(GATED_ACTIONS, action)) return null;
  const subs = GATED_ACTIONS[action];
  const key = subs === null ? action : `${action} ${params.action}`;
  if (subs !== null && !subs.has(params.action)) return null;
  if (confirmed) return null;
  return `"${key}" changes state that cannot be restored from here, so it needs --confirm`;
}

function handle(req, res) {
  const refused = refuseReason(req);
  if (refused) {
    // 403 and nothing else: no route echo, no profile path, nothing a caller
    // that failed the bar can learn from the reply.
    return respond(res, 403, { ok: false, error: `refused: ${refused}` });
  }

  if (req.method === 'GET' && req.url === '/status') {
    return respond(res, 200, {
      running: true,
      url: page ? page.url() : null,
      profile: options.profile,
      headless: options.headless
    });
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    respond(res, 200, { running: false });
    return void shutdown();
  }

  if (req.method === 'POST' && req.url === '/command') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      let action;
      try {
        const parsed = JSON.parse(raw);
        action = parsed.action;
        if (!Object.hasOwn(actions, action)) throw new Error(`unknown action "${action}"`);
        const ungated = gateFailure(action, parsed.params ?? {}, parsed.confirmed === true);
        if (ungated) throw new Error(ungated);
        await ensurePage();
        respond(res, 200, { ok: true, result: await actions[action](parsed.params ?? {}) });
      } catch (error) {
        respond(res, 200, { ok: false, error: causeOnly(error.message) });
      }
    });
    return;
  }

  respond(res, 404, { ok: false, error: 'no such endpoint' });
}

hardenProfile(options.profile, { unattended: options.unattended });

try {
  // Runtime appends caller args after container-safe defaults; profile args merge, not replace.
  context = await runtime.launchPersistentContext(options.profile, {
    headless: options.headless,
    viewport: { width: 1280, height: 800 },
    args: launchArgs({ unattended: options.unattended })
  });
} catch (error) {
  const report = await runtime.prepareBrowserRuntime();
  const detail =
    (report && report.remediation) ||
    String(error && error.message ? error.message : error).split('\n')[0];
  process.stderr.write(
    `Error: Chromium cannot launch; check: npm run check:chromium. ${detail}. See the Dependencies section of TOOL.md.\n`
  );
  process.exit(1);
}

const open = context.pages();
page = open.length > 0 ? open[0] : await context.newPage();

context.on('close', () => { shutdown(); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Before the socket exists, so there is no window in which the host answers
// and the client cannot yet authenticate.
try {
  publishToken();
} catch (error) {
  process.stderr.write(
    `Error: could not write the session token to ${TOKEN_FILE}: ${error.message}. ` +
    `The host will not start without it, because an unauthenticated host drives a signed-in browser.\n`
  );
  process.exit(1);
}

server = http.createServer(handle);
server.listen(options.port, '127.0.0.1');
