/**
 * Column-role judgment for one parse profile.
 *
 * Every numeric column is one decision in a single wiser.decide.batch call.
 * The shared caller is the only path to the classifier. A column whose answer
 * is not one of the five roles stays null, and the caller judges it as today.
 * This module computes no statistic.
 */

import { ask } from '../../lib/classifier/ask.mjs';

export const ROLE_OPTIONS = ['quantity', 'identifier', 'year', 'code', 'flag'];
const ACTION = 'wiser.decide.batch';

/**
 * @param {{ columns?: Array<{ name?: string, sampleValues?: unknown }> }} profile
 * @returns {Array<{ id: string, question: string, options: string[] }>}
 */
export function numericDecisions(profile) {
  const columns = Array.isArray(profile && profile.columns) ? profile.columns : [];
  const names = columns.map((column) => column && column.name).filter((name) => typeof name === 'string');
  const decisions = [];
  for (const column of columns) {
    if (!column || column.type !== 'number' || typeof column.name !== 'string') continue;
    const others = names.filter((name) => name !== column.name);
    const samples = Array.isArray(column.sampleValues) ? column.sampleValues : [];
    decisions.push({
      id: column.name,
      question: `Which role does the column ${JSON.stringify(column.name)} have? Its sample values are ${JSON.stringify(samples)}. The file's other columns are ${JSON.stringify(others)}.`,
      options: ROLE_OPTIONS.slice(),
    });
  }
  return decisions;
}

/**
 * @param {{ path?: string, reason?: string | null, answer?: unknown, record?: unknown }} result
 * @param {Array<{ id: string }>} decisions
 */
export function settleRoles(result, decisions) {
  const columns = {};
  for (const decision of decisions) columns[decision.id] = null;
  if (!result || (result.path !== 'classifier' && result.path !== 'replay')) {
    return {
      path: result && typeof result.path === 'string' ? result.path : 'builtin',
      reason: result && result.reason !== undefined ? result.reason : null,
      columns,
      record: null,
    };
  }
  const answers = result.answer && typeof result.answer === 'object' && Array.isArray(result.answer.answers)
    ? result.answer.answers
    : [];
  for (const decision of decisions) {
    const entry = answers.find((item) => item && typeof item === 'object' && item.id === decision.id);
    if (!entry) continue;
    if (typeof entry.status === 'string' && entry.status.length > 0) continue;
    if (typeof entry.choice === 'string' && ROLE_OPTIONS.includes(entry.choice)) {
      columns[decision.id] = entry.choice;
    }
  }
  const any = Object.values(columns).some((role) => role !== null);
  if (!any) {
    return { path: 'builtin', reason: 'not-accepted', columns, record: result.record ?? null };
  }
  return {
    path: result.path,
    reason: result.reason ?? null,
    columns,
    record: result.record ?? null,
  };
}

/**
 * Columns `describe` should compute: every `quantity`, and every column whose
 * role is null. A named role other than quantity is left out.
 * @param {{ path?: string, columns?: Record<string, string | null> }} roles
 * @returns {{ names: string[], paths: Record<string, string> }}
 */
export function columnsForDescribe(roles) {
  const settled = roles && (roles.path === 'classifier' || roles.path === 'replay') ? roles.path : 'builtin';
  const names = [];
  const paths = {};
  const columns = roles && roles.columns && typeof roles.columns === 'object' ? roles.columns : {};
  for (const [name, role] of Object.entries(columns)) {
    if (role === 'quantity') {
      names.push(name);
      paths[name] = settled;
    } else if (role == null) {
      names.push(name);
      paths[name] = 'builtin';
    }
  }
  return { names, paths };
}

/**
 * @param {object} profile
 * @param {{ owningRoot?: string, gatewayHome?: string, replay?: string }} [opts]
 */
export async function judgeRoles(profile, opts = {}) {
  const decisions = numericDecisions(profile);
  if (decisions.length === 0) {
    return { path: 'builtin', reason: 'no-candidates', columns: {}, record: null };
  }
  const input = {
    state: { request: JSON.stringify(profile) },
    decisions,
    allow_uncalibrated: true,
  };
  const result = await ask({
    action: ACTION,
    input,
    owningRoot: opts.owningRoot,
    gatewayHome: opts.gatewayHome,
    replay: opts.replay,
  });
  return settleRoles(result, decisions);
}
