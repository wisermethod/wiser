import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { offlineEnv } from '../../lib/tests/main-cli.js';
import { runData } from '../scripts/data-core.js';

const files = content => [{ name: 'input.csv', mediaType: 'text/csv', bytes: new TextEncoder().encode(content) }];
const cli = fileURLToPath(new URL('../scripts/data.js', import.meta.url));

test('a narrow header followed by 200,000 fields refuses whole in core and CLI', async t => {
  const content = 'a\n' + Array.from({ length: 200000 }, (_, i) => `v${i}`).join(',');
  const inputFiles = files(content);
  assert.ok(inputFiles[0].bytes.byteLength < 8 * 1024 * 1024);
  for (const input of [
    { command: 'parse' }, { command: 'describe' },
    { command: 'aggregate', groupBy: ['a'], metrics: [{ column: 'a', function: 'count' }] },
    { command: 'chart', x: 'a', y: 'a' }
  ]) await assert.rejects(runData(input, inputFiles), /exceeds 2,048 columns/);

  const dir = mkdtempSync(join(tmpdir(), 'data-wide-row-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'input.csv'), output = join(dir, 'chart.html');
  writeFileSync(file, content);
  for (const args of [['parse'], ['chart', '--x', 'a', '--y', 'a', '--output', output]]) {
    const run = spawnSync(process.execPath, [cli, ...args, '--file', file], { encoding: 'utf8', env: offlineEnv(), timeout: 15000 });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /^Error: the table exceeds 2,048 columns; use a smaller file\.\n$/);
    assert.equal(existsSync(output), false);
  }
});

test('the field cap fires before importing or calling csv-parse', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { createContext, SourceTextModule } from 'node:vm';
    const core = new SourceTextModule(readFileSync(${JSON.stringify(fileURLToPath(new URL('../scripts/data-core.js', import.meta.url)))}, 'utf8'), {
      context: createContext({ TextDecoder, Uint8Array }),
      importModuleDynamically() { throw new Error('CSV parser reached before the column refusal'); }
    });
    await core.link(() => { throw new Error('Unexpected static import'); });
    await core.evaluate();
    for (const delimiter of [',', ';', '\\t', '||']) {
      const content = 'a\\n' + Array.from({ length: 200000 }, (_, i) => 'v' + i).join(delimiter);
      await assert.rejects(core.namespace.runData({ command: 'parse', delimiter }, [{ name: 'wide.csv', mediaType: 'text/csv', bytes: new TextEncoder().encode(content) }]), /exceeds 2,048 columns/);
    }
  `;
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
});

test('every record honors the exact field boundary and the detected record separator', async () => {
  const row = width => Array.from({ length: width }, (_, i) => `v${i}`).join(',');
  const answer = await runData({ command: 'parse' }, files('a\n' + row(2048)));
  assert.equal(answer.rowCount, 1);
  assert.equal(answer.raggedRowCount, 1);
  for (const content of [
    'a\n' + row(2049),
    'a\n"" "",' + row(2048),
    'a\n' + row(1025) + '\r' + row(1025),
    'a\r\n' + row(1025) + '\n' + row(1025),
    'a\r' + row(2049),
    'a\n' + row(2049) + ',"unclosed'
  ]) await assert.rejects(runData({ command: 'parse' }, files(content)), /exceeds 2,048 columns/);
});

test('quoted delimiters, escaped quotes and embedded newlines do not add fields', async () => {
  const emptyQuotes = await runData({ command: 'parse' }, files('a\n"" ""\nnext'));
  assert.equal(emptyQuotes.rowCount, 2);
  assert.equal(emptyQuotes.raggedRowCount, 0);
  for (const delimiter of [',', ';', '|', '\t', '||']) {
    const value = 'one' + delimiter.repeat(3000) + '"two"\r\nlast';
    const quoted = '  "' + value.replace(/"/g, '""') + '"  ';
    const answer = await runData({ command: 'parse', delimiter }, files('a\r\n' + quoted));
    assert.equal(answer.rowCount, 1);
    assert.equal(answer.raggedRowCount, 0);
    assert.deepEqual(answer.columns[0].sampleValues, [value]);
  }
  for (const delimiter of [';', '|', '\t']) {
    await assert.rejects(runData({ command: 'parse' }, files('a' + delimiter + 'b\n' + Array(2049).fill('v').join(delimiter))), /exceeds 2,048 columns/);
  }
});
