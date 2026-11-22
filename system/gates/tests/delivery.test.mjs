import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const gate = fileURLToPath(new URL('../delivery.sh', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));

for (const [name, argument] of [['self-test', '--self-test'], ['working tree', root]]) {
  test('delivery gate: ' + name, t => {
    const result = spawnSync('sh', [gate, argument], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    t.diagnostic(result.stdout.trimEnd());
  });
}
