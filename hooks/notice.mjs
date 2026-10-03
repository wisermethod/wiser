#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook } from './lib/run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 16384;
const TEXT_CAP = 500;
// Under the runner's 3 second exit, so a stalled socket still ends first.
const NOTICE_DEADLINE_MS = 2500;

/**
 * `WISER_NOTICE_TEST_LOOPBACK=1` is a test seam: also accept http whose
 * hostname is 127.0.0.1, localhost, or [::1]. When it is unset, only https
 * is accepted. The request is the origin plus `/notice`.
 * @param {string} raw
 * @returns {string | null}
 */
export function resolveNoticeUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '') return null;
  const loopback = process.env.WISER_NOTICE_TEST_LOOPBACK === '1'
    && url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
  if (url.protocol !== 'https:' && !loopback) return null;
  return `${url.origin}/notice`;
}

/**
 * SessionStart. The event is read and discarded. Nothing from it, the
 * environment, the working folder, or the session is sent. Returns the
 * notice text, or null when there is nothing to show.
 * @param {Record<string, unknown>} event
 * @param {{ started: number, budgetMs: number }} clock
 * @returns {Promise<string | null>}
 */
export async function showNotice(event, clock) {
  void event;
  if (process.env.WISER_DISABLE_NOTICES === '1') return null;
  const configured = readConfiguredUrl(pluginRoot());
  if (configured === null) return null;
  const target = resolveNoticeUrl(configured);
  if (target === null) return null;
  const deadlineMs = noticeDeadline(clock);
  if (!(deadlineMs > 0)) return null;
  return readNotice(target, deadlineMs);
}

/**
 * @returns {string}
 */
function pluginRoot() {
  const fromEnv = process.env.CLAUDE_PLUGIN_ROOT;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return dirname(HERE);
}

/**
 * @param {string} root
 * @returns {string | null}
 */
function readConfiguredUrl(root) {
  let raw;
  try {
    raw = readFileSync(join(root, '.mcp.json'), 'utf8');
  } catch {
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const servers = doc.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return null;
  const wiser = servers.wiser;
  if (!wiser || typeof wiser !== 'object' || Array.isArray(wiser)) return null;
  if (typeof wiser.url !== 'string') return null;
  return wiser.url;
}

/**
 * @param {{ started: number, budgetMs: number }} clock
 * @returns {number}
 */
function noticeDeadline(clock) {
  if (!clock || typeof clock.started !== 'number' || typeof clock.budgetMs !== 'number') return 0;
  const remaining = clock.budgetMs - (Date.now() - clock.started);
  if (!(remaining > 0)) return 0;
  return Math.min(remaining, NOTICE_DEADLINE_MS);
}

/**
 * @param {string} target
 * @param {number} deadlineMs
 * @returns {Promise<string | null>}
 */
async function readNotice(target, deadlineMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (response.status !== 200) {
      dropBody(response);
      return null;
    }
    const raw = await readLimited(response, controller.signal);
    if (raw === null) return null;
    return parseNotice(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Response} response
 */
function dropBody(response) {
  try {
    const body = response.body;
    if (body) body.cancel().catch(() => {});
  } catch {
    // already unusable
  }
}

/**
 * Count bytes while reading. Over the limit, or an abort, returns null
 * before any parse.
 * @param {Response} response
 * @param {AbortSignal} signal
 * @returns {Promise<string | null>}
 */
async function readLimited(response, signal) {
  const body = response.body;
  if (!body) return null;
  const reader = body.getReader();
  const parts = [];
  let seen = 0;
  try {
    for (;;) {
      const step = await readOrAbort(reader, signal);
      if (step.done) break;
      seen += step.value.byteLength;
      if (seen > BODY_LIMIT) return null;
      parts.push(Buffer.from(step.value));
    }
  } catch {
    return null;
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts).toString('utf8');
}

/**
 * Reject as soon as the deadline fires, including when the socket has
 * delivered headers and then stops.
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @param {AbortSignal} signal
 * @returns {Promise<{ done: boolean, value?: Uint8Array }>}
 */
function readOrAbort(reader, signal) {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const fail = () => {
      reader.cancel().catch(() => {});
      reject(abortError(signal));
    };
    signal.addEventListener('abort', fail, { once: true });
    reader.read().then((step) => {
      signal.removeEventListener('abort', fail);
      resolve(step);
    }, (err) => {
      signal.removeEventListener('abort', fail);
      reject(err);
    });
  });
}

/**
 * @param {AbortSignal} signal
 * @returns {Error}
 */
function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error('aborted');
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
function parseNotice(raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (typeof doc.text !== 'string') return null;
  const text = sanitiseNotice(doc.text);
  if (text.length === 0) return null;
  return text;
}

/**
 * C0, C1, and format characters become spaces. Trim, then cap without
 * splitting a surrogate pair.
 * @param {string} text
 * @returns {string}
 */
function sanitiseNotice(text) {
  const spaced = text.replace(/[\p{Cc}\p{Cf}]/gu, ' ');
  const trimmed = spaced.trim();
  if (trimmed.length <= TEXT_CAP) return trimmed;
  let end = TEXT_CAP;
  const unit = trimmed.charCodeAt(end - 1);
  if (unit >= 0xD800 && unit <= 0xDBFF) end -= 1;
  return trimmed.slice(0, end);
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
  runHook('SessionStart', (event, clock) => showNotice(event, clock), { output: 'systemMessage' });
}
