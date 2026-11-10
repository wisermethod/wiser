import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readZip, writeZip } from '../archive-core.js';
const bytes = text => new TextEncoder().encode(text);
const cap = { maxBytes: 1024 * 1024 };
// Raw empty stored entries bypass the writer's own name checks.
function emptyZip(names) {
  const encoded = names.map(bytes), localSize = encoded.reduce((n, name) => n + 30 + name.length, 0);
  const zip = new Uint8Array(localSize + encoded.reduce((n, name) => n + 46 + name.length, 0) + 22);
  const view = new DataView(zip.buffer);
  let local = 0, center = localSize;
  for (const name of encoded) {
    view.setUint32(local, 0x04034b50, true); view.setUint16(local + 26, name.length, true); zip.set(name, local + 30);
    view.setUint32(center, 0x02014b50, true); view.setUint16(center + 28, name.length, true);
    view.setUint32(center + 42, local, true); zip.set(name, center + 46);
    local += 30 + name.length; center += 46 + name.length;
  }
  view.setUint32(center, 0x06054b50, true); view.setUint16(center + 8, names.length, true); view.setUint16(center + 10, names.length, true);
  view.setUint32(center + 12, center - localSize, true); view.setUint32(center + 16, localSize, true);
  return zip;
}
test('refuses raw entry names above 240 UTF-8 bytes or 16 components, without trimming', async () => {
  for (const name of ['x'.repeat(241), 'é'.repeat(121), Array(17).fill('a').join('/')]) {
    await assert.rejects(readZip(emptyZip([name]), cap), /240 bytes|16 components/);
  }
  for (const name of ['é'.repeat(120), Array(16).fill('a').join('/')]) {
    assert.equal((await readZip(emptyZip([name]), cap))[0].name, name);
  }
});
test('1,000 deeply nested names refuse in milliseconds', t => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readZip } from ${JSON.stringify(new URL('../archive-core.js', import.meta.url).href)};
    const bytes = text => new TextEncoder().encode(text);
    ${emptyZip.toString()}
    const zip = emptyZip(Array.from({length:1000}, (_, i) => 'a/'.repeat(2000) + i));
    const start = performance.now();
    try { await readZip(zip, {maxBytes:8 * 1024 * 1024}); throw Error('accepted deep names'); }
    catch (error) { if (!/240 bytes|16 components/.test(error.message)) throw error; }
    const elapsed = performance.now() - start;
    if (elapsed > 100) throw Error('slow refusal: ' + elapsed + 'ms');
    console.log(elapsed.toFixed(3) + 'ms');
  `], { encoding: 'utf8', timeout: 1500 });
  assert.equal(run.status, 0, run.error?.message || run.stderr);
  t.diagnostic('readZip refusal: ' + run.stdout.trim());
});
test('prefix collisions refuse and 1,000 bounded sibling paths remain valid', async () => {
  await assert.rejects(readZip(emptyZip(['a', 'a/b/c']), cap), /file is also used as a directory/);
  const files = await readZip(emptyZip(Array.from({length:1000}, (_, i) => 'a/'.repeat(15) + i)), cap);
  assert.equal(files.length, 1000);
});
function scratch(t) { const dir = mkdtempSync(join(tmpdir(), 'archive-core-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
for (const method of ['-0', '-9']) test(`reads real Mac zip ${method} with folders, UTF-8 and empty files`, async t => {
  const dir = scratch(t); mkdirSync(join(dir, 'folder')); writeFileSync(join(dir, 'folder', 'café.txt'), 'repeat '.repeat(500)); writeFileSync(join(dir, 'empty'), '');
  const zip = spawnSync('zip', ['-q', method, '-r', 'input.zip', 'folder', 'empty'], { cwd: dir });
  assert.equal(zip.status, 0, zip.stderr.toString());
  const files = await readZip(new Uint8Array(readFileSync(join(dir, 'input.zip'))), cap);
  assert.equal(new TextDecoder().decode(files.find(f => f.name === 'folder/café.txt').bytes), 'repeat '.repeat(500));
  assert.equal(files.find(f => f.name === 'empty').bytes.length, 0);
});
test('writes a deterministic ZIP readable by unzip and by the core', async t => {
  const dir = scratch(t), files = [{ name: 'a/b.txt', bytes: bytes('hello') }];
  const zip = await writeZip(files, cap); assert.deepEqual(zip, await writeZip(files, cap));
  writeFileSync(join(dir, 'out.zip'), zip);
  const run = spawnSync('unzip', ['-p', 'out.zip', 'a/b.txt'], { cwd: dir });
  assert.equal(run.status, 0); assert.equal(run.stdout.toString(), 'hello'); assert.deepEqual(await readZip(zip, cap), files);
});
for (const name of ['/absolute', '../escape', 'a/../../escape', 'C:\\file', '\\absolute']) test(`refuses unsafe name ${name}`, async () => {
  await assert.rejects(writeZip([{ name, bytes: bytes('x') }], cap), /absolute or contains/);
  const zip = await writeZip([{ name: 'a'.repeat(name.length), bytes: bytes('x') }], cap);
  // Change both headers, as a real malicious archive would.
  const view = new DataView(zip.buffer), central = view.getUint32(zip.length - 6, true);
  zip.set(bytes(name), 30); zip.set(bytes(name), central + 46);
  await assert.rejects(readZip(zip, cap), /absolute or contains/);
});
test('refuses archive size, entry count, expanded total, duplicate names and bad CRC', async t => {
  const zip = await writeZip([{ name: 'a', bytes: bytes('body') }], cap);
  await assert.rejects(readZip(zip, { maxBytes: zip.length - 1 }), /input exceeds/);
  await assert.rejects(writeZip([{ name: 'a', bytes: bytes('body') }], { maxBytes: 20 }), /output exceeds/);
  await assert.rejects(writeZip(Array.from({ length: 1001 }, (_, n) => ({ name: `${n}`, bytes: bytes('') })), cap), /1,000/);
  const many = zip.slice(); new DataView(many.buffer).setUint16(many.length - 12, 1001, true); new DataView(many.buffer).setUint16(many.length - 14, 1001, true);
  await assert.rejects(readZip(many, cap), /1,000/);
  await assert.rejects(writeZip([{ name: 'a', bytes: bytes('') }, { name: './a', bytes: bytes('') }], cap), /duplicate/);
  const corrupt = zip.slice(); corrupt[31] ^= 1; await assert.rejects(readZip(corrupt, cap), /CRC/);
  const dir = scratch(t); writeFileSync(join(dir, 'bomb'), '0'.repeat(100000));
  assert.equal(spawnSync('zip', ['-q', '-9', 'bomb.zip', 'bomb'], { cwd: dir }).status, 0);
  await assert.rejects(readZip(new Uint8Array(readFileSync(join(dir, 'bomb.zip'))), { maxBytes: 1000 }), /expanded total/);
});
test('refuses truncated archives, disagreement, symlinks and unsupported compression', async () => {
  const zip = await writeZip([{ name: 'a', bytes: bytes('hello') }], cap);
  await assert.rejects(readZip(zip.slice(0, -1), cap), /end record/);
  const center = new DataView(zip.buffer).getUint32(zip.length - 6, true);
  for (const [offset, value, reason] of [[center + 10, 12, /compression/], [center + 8, 1, /encrypted/], [center + 38, 0xa0000000, /symbolic/]]) {
    const bad = zip.slice(), view = new DataView(bad.buffer);
    if (offset === center + 38) view.setUint32(offset, value, true); else view.setUint16(offset, value, true);
    await assert.rejects(readZip(bad, cap), reason);
  }
  const bad = zip.slice(); bad[30] = 98; await assert.rejects(readZip(bad, cap), /names disagree/);
});
test('module runs in a Worker-like context without Node imports or globals', () => {
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
    import { SourceTextModule, createContext } from 'node:vm';
    import { readFileSync } from 'node:fs';
    const context = createContext({ Uint8Array, TextEncoder, TextDecoder, ReadableStream, DecompressionStream });
    const mod = new SourceTextModule(readFileSync(new URL(${JSON.stringify(new URL('../archive-core.js', import.meta.url).href)}), 'utf8'), { context });
    await mod.link(() => { throw Error('nonportable import'); }); await mod.evaluate();
    const zip = await mod.namespace.writeZip([{ name: 'a', bytes: new TextEncoder().encode('ok') }], { maxBytes: 1024 });
    if ((await mod.namespace.readZip(zip, { maxBytes: 1024 }))[0].name !== 'a') throw Error('round trip');
  `], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
