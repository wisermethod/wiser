import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const command of ['html', 'url']) test(`${command} CLI host passes strict fulfill; identity-converter mutant fails`, context => {
  const dir = mkdtempSync(join(tmpdir(), 'render-strict-body-'));
  try {
    for (const bad of [false, true]) {
      const input = command === 'html' ? ['--input', fileURLToPath(new URL('./fixtures/shared/page.zip', import.meta.url))] : ['--url', 'https://public.example/page'];
      const run = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('./fixtures/strict-body-cli.mjs', import.meta.url)), fileURLToPath(new URL('../scripts/render.js', import.meta.url)), command, ...input, '--width', '240', '--height', '100', '--output', join(dir, `${bad}.png`)], {
        encoding: 'utf8', timeout: 15000, env: { ...process.env, npm_config_offline: 'true', STRICT_BODY_MUTANT: bad ? 'identity' : '', STRICT_BODY_NETWORK: 'true' }
      });
      assert.equal(run.status, bad ? 1 : 0, run.stderr);
      const stats = JSON.parse(run.stderr.match(/STRICT_BODY (.*)/)?.[1] || '{}');
      if (bad) { assert.ok(stats.rejected > 0, run.stderr); assert.equal(run.stdout, ''); }
      else { assert.ok(stats.buffered >= 2, run.stderr); assert.equal(stats.rejected, 0); }
      context.diagnostic(JSON.stringify({ command, converter: bad ? 'identity mutant' : 'Buffer', status: run.status, ...stats }));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
