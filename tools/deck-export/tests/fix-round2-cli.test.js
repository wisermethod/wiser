import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../../lib/archive-core.js';

for (const command of ['pdf', 'png']) test(`${command} CLI host passes strict fulfill; identity-converter mutant fails`, async context => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-strict-body-'));
  try {
    const input = join(dir, 'deck.zip');
    const html = '<link rel="stylesheet" href="reveal.css"><div class="reveal"><div class="slides"><section><img src="pixel.png"></section></div></div><script src="reveal.js"></script><script>Reveal.initialize({width:320,height:180});</script>';
    writeFileSync(input, await writeZip([{ name: 'index.html', bytes: new TextEncoder().encode(html) }, { name: 'pixel.png', bytes: new Uint8Array(readFileSync(new URL('../../render/tests/fixtures/shared/pixel.png', import.meta.url))) }], { maxBytes: 8388608 }));
    for (const bad of [false, true]) {
      const run = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('../../render/tests/fixtures/strict-body-cli.mjs', import.meta.url)), fileURLToPath(new URL('../scripts/deck.js', import.meta.url)), command, '--input', input, '--scale', '1', '--output', join(dir, `${bad}.${command === 'pdf' ? 'pdf' : 'zip'}`)], {
        encoding: 'utf8', timeout: 15000, env: { ...process.env, npm_config_offline: 'true', STRICT_BODY_MUTANT: bad ? 'identity' : '' }
      });
      assert.equal(run.status, bad ? 1 : 0, run.stderr);
      const stats = JSON.parse(run.stderr.match(/STRICT_BODY (.*)/)?.[1] || '{}');
      if (bad) { assert.ok(stats.rejected > 0, run.stderr); assert.equal(run.stdout, ''); }
      else { assert.ok(stats.buffered >= 3, run.stderr); assert.equal(stats.rejected, 0); }
      context.diagnostic(JSON.stringify({ command, converter: bad ? 'identity mutant' : 'Buffer', status: run.status, ...stats }));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
