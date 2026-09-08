import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { evaluate, loadPolicy } from '../src/policy.js';
import { makeHome } from './fake-provider.js';

const DEFAULT_PATH = fileURLToPath(new URL('../policy.default.json', import.meta.url));

function decision(ctx, policy) {
  return evaluate(policy || loadPolicy({ home: null, defaultPath: DEFAULT_PATH }), ctx);
}

test('readonly plus write is deny', () => {
  const { effect, rule } = decision({
    role: 'readonly',
    privilege: 'write',
    op: 'execute',
    service: 'github',
    module: 'repos',
    risk: 'low',
  });
  assert.equal(effect, 'deny');
  assert.equal(rule.effect, 'deny');
});

test('runtime plus destructive is confirm', () => {
  const { effect } = decision({
    role: 'runtime',
    privilege: 'write',
    op: 'execute',
    risk: 'destructive',
  });
  assert.equal(effect, 'confirm');
});

test('runtime plus admin is deny', () => {
  const { effect } = decision({
    role: 'runtime',
    privilege: 'admin',
    op: 'execute',
  });
  assert.equal(effect, 'deny');
});

test('runtime startConnect is allow', () => {
  const { effect } = decision({
    role: 'runtime',
    privilege: 'write',
    op: 'startConnect',
  });
  assert.equal(effect, 'allow');
});

test('a string, array, or * / absent field matches', () => {
  const policy = {
    rules: [
      { role: ['runtime'], service: '*', effect: 'allow' },
      { effect: 'deny' },
    ],
  };
  assert.equal(decision({ role: 'runtime', service: 'github' }, policy).effect, 'allow');
  assert.equal(decision({ role: 'readonly', service: 'github' }, policy).effect, 'deny');
});

test('shipped default has no setup role', () => {
  const policy = loadPolicy({ home: null, defaultPath: DEFAULT_PATH });
  assert.deepEqual(policy.roles, ['runtime', 'readonly']);
  assert.equal(decision({ role: 'runtime', privilege: 'admin', op: 'execute' }).effect, 'deny');
});

test('overlay replaces rules wholesale', () => {
  const home = makeHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'policy.json'), JSON.stringify({
    default_role: 'readonly',
    rules: [{ role: '*', effect: 'deny' }],
  }));
  const policy = loadPolicy({ home, defaultPath: DEFAULT_PATH });
  assert.equal(policy.default_role, 'readonly');
  assert.equal(policy.rules.length, 1);
  assert.equal(evaluate(policy, { role: 'runtime', op: 'execute' }).effect, 'deny');
});
