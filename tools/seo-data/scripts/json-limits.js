/** Bounded token walk before JSON.parse. The stack is bounded; neither
 * values nor strings are copied (only short object keys used to select a rule).
 * JSON.parse still owns syntax validation and its caller's existing diagnostic.
 */
import { checkAnswerListSize } from './answer-size.js';

export const KEYWORD_ROWS = 10000;
const MAX_VALUES = 100000;
const MAX_DEPTH = 64;
const MAX_STRING_CHARACTERS = 2 * 1024 * 1024;
const fail = message => { throw new Error(`Error: ${message}; refused whole.`); };
const auditRules = {
  targetKeywords: '{"keyword":"","position":0,"clicks":0,"impressions":0,"ctr":0,"status":"ranking"}'.length,
  searchConsole: {
    topQueries: '{"query":"","clicks":0,"impressions":0,"ctr":0,"position":0}'.length,
    topPages: '{"page":"","clicks":0,"impressions":0,"ctr":0,"position":0}'.length,
  },
  analytics: { organicTraffic: { rows: '{"date":0,"users":0,"sessions":0,"pageViews":0}'.length } },
};
const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
function shortKey(text, start, end) {
  // Every rule key fits even when written entirely as Unicode escapes.
  if (end - start > 128) return '';
  return text.slice(start, end).replace(/\\(u[\da-fA-F]{4}|["\\/bfnrt])/g,
    (_, value) => value[0] === 'u' ? String.fromCharCode(parseInt(value.slice(1), 16)) : escapes[value]);
}

export function checkJsonText(text, { kind, budget = { values: 0, strings: 0 } } = {}) {
  const stack = [];
  const rules = kind === 'audit' ? auditRules : { rows: 'keywords' };
  let root = true;
  for (let at = 0; at < text.length;) {
    const char = text[at];
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') { at++; continue; }
    const parent = stack[stack.length - 1];
    if (char === ']' || char === '}') { stack.pop(); at++; continue; }
    if (char === ',') { if (parent) parent.state = parent.array ? 'value' : 'key'; at++; continue; }
    if (char === ':') { if (parent) parent.state = 'value'; at++; continue; }
    let end = at + 1;
    if (char === '"') {
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      budget.strings = (budget.strings || 0) + end - at - 1;
      if (budget.strings > MAX_STRING_CHARACTERS) fail('JSON string text exceeds 2,097,152 characters across the supplied inputs');
      if (parent && !parent.array && parent.state === 'key') {
        parent.key = shortKey(text, at + 1, end);
        parent.state = 'colon';
        at = end + 1;
        continue;
      }
    }
    let rule = null;
    if (parent) {
      if (parent.array && parent.state === 'value') {
        const count = ++parent.count;
        if (typeof parent.rule === 'number') checkAnswerListSize(count, parent.rule);
        if (parent.rule === 'keywords' && count > KEYWORD_ROWS) fail('keyword input exceeds 10,000 rows');
        if (count > KEYWORD_ROWS) fail('JSON array exceeds 10,000 elements');
      } else if (!parent.array && parent.rule && Object.hasOwn(parent.rule, parent.key)) {
        rule = parent.rule[parent.key];
      }
      parent.state = 'comma';
    } else if (root) {
      rule = kind === 'keywords' && char === '[' ? 'keywords' : rules;
      root = false;
    }
    if (++budget.values > MAX_VALUES) fail('JSON exceeds 100,000 values across the supplied inputs');
    if (char === '{' || char === '[') {
      if (stack.length >= MAX_DEPTH) fail('JSON nesting exceeds 64');
      stack.push({ array: char === '[', state: char === '[' ? 'value' : 'key', key: '', count: 0, rule });
      at++;
    } else if (char === '"') at = end + 1;
    else {
      // A scalar ends at JSON whitespace or punctuation. Malformed scalars are
      // counted too, then rejected by JSON.parse without quoting their bytes.
      while (end < text.length && !' \n\r\t,]}:{["'.includes(text[end])) end++;
      at = end;
    }
  }
}
