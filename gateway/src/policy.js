import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {object} Policy
 * @property {string[]} [roles]
 * @property {string} [default_role]
 * @property {object[]} rules
 */

/**
 * Load the shipped default and overlay `<home>/policy.json` if present.
 * An overlay replaces `rules` wholesale when it names them; it does not merge rows.
 *
 * @param {{ home?: string | null, defaultPath: string }} opts
 * @returns {Policy}
 */
export function loadPolicy({ home, defaultPath }) {
  const defaults = JSON.parse(readFileSync(defaultPath, 'utf8'));
  if (!home) return defaults;
  const overlayPath = join(home, 'policy.json');
  if (!existsSync(overlayPath)) return defaults;
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  return {
    ...defaults,
    ...overlay,
    rules: Object.prototype.hasOwnProperty.call(overlay, 'rules') ? overlay.rules : defaults.rules,
  };
}

/**
 * A rule field matches when it is absent, `"*"`, equal to the value, or an array containing it.
 * @param {unknown} ruleVal
 * @param {unknown} actual
 */
export function fieldMatches(ruleVal, actual) {
  if (ruleVal === undefined || ruleVal === null || ruleVal === '*') return true;
  if (Array.isArray(ruleVal)) return ruleVal.includes(actual);
  return ruleVal === actual;
}

/**
 * First matching rule wins. `op` is `execute` | `startConnect` | `connectStatus`.
 *
 * @param {Policy} policy
 * @param {{ harness?: string, role?: string, service?: string, module?: string, privilege?: string, risk?: string, op?: string }} ctx
 * @returns {{ effect: 'allow' | 'deny' | 'confirm', rule: object | null }}
 */
export function evaluate(policy, ctx) {
  const rules = Array.isArray(policy?.rules) ? policy.rules : [];
  for (const rule of rules) {
    if (!fieldMatches(rule.harness, ctx.harness)) continue;
    if (!fieldMatches(rule.role, ctx.role)) continue;
    if (!fieldMatches(rule.service, ctx.service)) continue;
    if (!fieldMatches(rule.module, ctx.module)) continue;
    if (!fieldMatches(rule.privilege, ctx.privilege)) continue;
    if (!fieldMatches(rule.risk, ctx.risk)) continue;
    if (!fieldMatches(rule.op, ctx.op)) continue;
    const effect = rule.effect;
    if (effect !== 'allow' && effect !== 'deny' && effect !== 'confirm') continue;
    return { effect, rule };
  }
  return { effect: 'deny', rule: null };
}
