import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { portable } from './portable-loader.js';
import { network } from './fixtures/network.mjs';
const fixtures = new URL('./fixtures/shared/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', fixtures)));
let browser, core;
before(async () => { browser = await launch(); core = await portable(new URL('../scripts/render-core.js', import.meta.url)); });
after(async () => { await browser?.close(); });
const mermaidScript = new Uint8Array(readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url)));
for (const c of cases) test(c.name, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'render-shared-'));
  try {
    const expected = JSON.parse(readFileSync(new URL(c.expected, fixtures)));
    const file = c.oversize ? {name:'large.html',bytes:new Uint8Array(8388609)} : c.file ? { name: c.file, mediaType: 'application/octet-stream', bytes: new Uint8Array(readFileSync(new URL(c.file, fixtures))) } : null;
    const fake = network(c.network);
    let output;
    if (expected.error) await assert.rejects(core[c.core](c.input, file ? [file] : [], { browser, mermaidScript, responseBody: bytes => Buffer.from(bytes), ...fake }), { message: expected.error });
    else {
      output = await core[c.core](c.input, file ? [file] : [], { browser, mermaidScript, responseBody: bytes => Buffer.from(bytes), ...fake });
      assert.deepEqual(JSON.parse(JSON.stringify(output.answer)), expected);
      assert.ok(output.files[0].bytes.length > 100);
    }
    if (c.network) assert.ok(fake.requests.every(url => new URL(url).hostname === 'public.example'));
    const args = [fileURLToPath(new URL('../scripts/render.js', import.meta.url)), c.command];
    if (file) { const path = join(scratch, file.name); writeFileSync(path, file.bytes); args.push(c.command === 'html' ? '--input' : '--file', path); }
    const outputPath = join(scratch, c.input.output ?? 'render.png');
    args.push('--output', outputPath);
    for (const [key, value] of Object.entries(c.input)) {
      if (key === 'output') continue;
      args.push('--' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), String(value));
    }
    const cli = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('./fixtures/cli-network.mjs', import.meta.url)), ...args], { encoding: 'utf8', env: { ...process.env, RENDER_NETWORK: c.network || 'public', npm_config_offline: 'true' }, timeout: 65000 });
    assert.equal(cli.status, expected.error ? 1 : 0, cli.stderr);
    if (expected.error) { assert.equal(cli.stdout, ''); assert.equal(cli.stderr.trim(), expected.error); assert.throws(() => readFileSync(outputPath), { code: 'ENOENT' }); }
    else {
      assert.equal(cli.stderr, '');
      const answer = JSON.parse(cli.stdout); answer[c.command === 'mermaid' ? 'path' : 'output'] = c.input.output ?? 'render.png';
      assert.deepEqual(answer, expected);
      assert.deepEqual(new Uint8Array(readFileSync(outputPath)), output.files[0].bytes, 'CLI and core picture bytes');
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
