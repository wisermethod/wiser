/**
 * Element pick for one interactive snapshot.
 *
 * Text entry, which is the verb `type`, is a `<textarea>`, an `<input>` whose
 * type is `text`, `search`, `email`, `password`, `tel`, `url`, or `number`
 * (a missing type is `text`, the HTML default), or a record marked editable.
 * A record is marked editable when it contains `contenteditable` or the word
 * `editable`. Every other tag and input type is `click`, including `select`,
 * checkbox, radio, file, button, submit, and the date and color controls.
 *
 * Records are read by the `[n]` each one carries at the start of a line, never
 * by line position: a label may contain a newline. The shared caller is the
 * only path to the classifier. This module does not act on the page.
 */

import { readFileSync } from 'node:fs';
import { ask } from '../../../lib/classifier/ask.mjs';

const ACTION = 'wiser.browser.pick';
const BATCH = 255;
const TEXT_ENTRY_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'tel', 'url', 'number',
]);
const RECORD_RE = /(?:^|\n)\[(\d+)\] /g;
const TAG_RE = /^<([A-Za-z][A-Za-z0-9]*)>/;
const TYPE_RE = /^<[A-Za-z][A-Za-z0-9]*>\s+\(([^)]*)\)/;

/**
 * @param {string} name
 * @returns {'click' | 'type'}
 */
export function verbFor(name) {
  const tagMatch = TAG_RE.exec(name);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
  const typeMatch = TYPE_RE.exec(name);
  const inputType = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
  const editable = /contenteditable/i.test(name) || /\beditable\b/i.test(name);
  if (tag === 'textarea') return 'type';
  if (tag === 'input' && TEXT_ENTRY_INPUT_TYPES.has(inputType || 'text')) return 'type';
  if (editable) return 'type';
  return 'click';
}

/**
 * Numbered records in the order their own numbers appear.
 * @param {unknown} content
 * @returns {Array<{ number: number, name: string, verb: 'click' | 'type' }>}
 */
export function parseRecords(content) {
  const text = typeof content === 'string' ? content : '';
  const marks = [];
  for (const match of text.matchAll(RECORD_RE)) {
    marks.push({
      number: Number(match[1]),
      bodyStart: match.index + match[0].length,
      start: match.index,
    });
  }
  const records = [];
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    let name = text.slice(marks[i].bodyStart, end);
    if (name.endsWith('\n')) name = name.slice(0, -1);
    records.push({ number: marks[i].number, name, verb: verbFor(name) });
  }
  return records;
}

/**
 * @param {unknown} answer
 * @param {Array<{ number: number, verb: string }>} batch
 * @returns {{ index: number, verb: 'click' | 'type' } | null}
 */
function acceptPick(answer, batch) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null;
  if (typeof answer.status === 'string' && answer.status.length > 0) return null;
  const index = answer.index;
  const verb = answer.verb;
  if (!Number.isInteger(index) || index < 0 || index >= batch.length) return null;
  if (verb !== 'click' && verb !== 'type') return null;
  if (batch[index].verb !== verb) return null;
  return { index: batch[index].number, verb };
}

/**
 * @param {unknown} replay
 * @param {number} count
 * @returns {object[]}
 */
function loadReplayRecords(replay, count) {
  let parsed = replay;
  if (typeof replay === 'string') {
    let text;
    try {
      text = readFileSync(replay, 'utf8');
    } catch {
      throw new Error('classifier record does not match this judgment');
    }
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('classifier record does not match this judgment');
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== count) {
    throw new Error('classifier record does not match this judgment');
  }
  if (parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('classifier record does not match this judgment');
  }
  return parsed;
}

/**
 * @param {unknown} snapshot
 * @param {{ goal: string, owningRoot?: string, gatewayHome?: string, replay?: unknown }} opts
 */
export async function pickFromSnapshot(snapshot, opts) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || typeof snapshot.content !== 'string') {
    throw new Error('snapshot must be one JSON object with a string content field');
  }
  if (snapshot.format !== undefined && snapshot.format !== 'interactive') {
    throw new Error('snapshot must be an interactive snapshot');
  }
  const records = parseRecords(snapshot.content);
  const batches = [];
  for (let i = 0; i < records.length; i += BATCH) batches.push(records.slice(i, i + BATCH));
  const out = {
    goal: opts.goal,
    elementCount: records.length,
    pick: null,
    classifier: { path: 'builtin', reason: 'no-candidates', batches: 0, records: [] },
  };
  if (batches.length === 0) return out;

  const replayRecords = opts.replay == null || opts.replay === ''
    ? null
    : loadReplayRecords(opts.replay, batches.length);
  const settled = [];
  for (let b = 0; b < batches.length; b += 1) {
    const input = {
      goal: opts.goal,
      elements: batches[b].map((el) => ({ verb: el.verb, name: el.name })),
      allow_uncalibrated: true,
    };
    settled.push(await ask({
      action: ACTION,
      input,
      owningRoot: opts.owningRoot,
      gatewayHome: opts.gatewayHome,
      replay: replayRecords ? replayRecords[b] : undefined,
    }));
  }

  let best = null;
  let bestPath = null;
  for (let b = 0; b < settled.length; b += 1) {
    const result = settled[b];
    if (result.path !== 'classifier' && result.path !== 'replay') continue;
    const hit = acceptPick(result.answer, batches[b]);
    if (!hit) continue;
    if (!best || hit.index < best.index) {
      best = hit;
      bestPath = result.path;
    }
  }
  const recordsOut = settled.map((result) => result.record);
  if (!best) {
    const answered = settled.some((result) => result.path === 'classifier' || result.path === 'replay');
    const first = settled[0];
    out.classifier = {
      path: 'builtin',
      reason: answered ? 'not-accepted' : first.reason,
      batches: batches.length,
      records: recordsOut,
    };
    return out;
  }
  out.pick = best;
  out.classifier = {
    path: bestPath,
    reason: null,
    batches: batches.length,
    records: recordsOut,
  };
  return out;
}
