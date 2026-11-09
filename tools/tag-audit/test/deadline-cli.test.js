import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { offlineEnv } from '../../lib/tests/main-cli.js';

for (const phase of ['preflight', 'caller', 'redirect']) {
  test(`CLI fails at its 20-second deadline through stalled ${phase} DNS`, () => {
    const run = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('./fixtures/deadline.mjs', import.meta.url)),
      fileURLToPath(new URL('../scripts/tag-audit.js', import.meta.url)), 'audit', '--url', 'https://page.test/'], {
      env: offlineEnv({ TAG_AUDIT_DEADLINE_PHASE: phase }), encoding: 'utf8', timeout: 3000
    });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.equal(run.stderr, 'Error: could not fetch https://page.test/: no response within 20 seconds. Confirm the host is reachable from this machine, then re-run.\n');
  });
}
