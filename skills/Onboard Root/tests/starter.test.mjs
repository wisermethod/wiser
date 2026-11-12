import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { personalStarter } from '../scripts/starter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, '../../..');
const prefix = 'system/templates/User Root Template/';
const scriptPath = 'skills/Onboard Root/scripts/starter.mjs';
const skillPath = 'skills/Onboard Root/SKILL.md';
const skill = readFileSync(join(plugin, skillPath), 'utf8');
const step = skill.split('### Step 1: Copy\n')[1].split('### Step 2: Voice\n')[0];
const blocks = [...step.matchAll(/```(?:sh)?\n([\s\S]*?)\n```/g)].map(match => match[1]);
const download = blocks.find(block => block.includes('/starter/personal-'));
const fill = blocks.find(block => block.includes("folder='<folder name>'"));
const grep = blocks.find(block => block.startsWith('grep -rn'));
const expectedId = 'add454da04790528';
const comparePaths = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const available = command => !spawnSync(command, ['--version'], { stdio: 'ignore' }).error;
const missing = commands => commands.filter(command => !available(command));
const needs = commands => {
  const absent = missing(commands);
  return absent.length ? `missing ${absent.join(', ')}` : false;
};

function scratch(t) {
  // Node resolves import.meta.url through macOS's /var -> /private/var link.
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'starter-fixture-')));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function writeFiles(root, files) {
  for (const [path, bytes] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
}

function readFiles(root, directory = '') {
  const files = new Map();
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const pair of readFiles(root, path)) files.set(...pair);
    } else {
      assert.ok(entry.isFile(), `regular file: ${path}`);
      files.set(path, readFileSync(join(root, path)));
    }
  }
  return files;
}

function equalFiles(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(comparePaths), [...expected.keys()].sort(comparePaths));
  for (const [path, bytes] of expected) assert.ok(actual.get(path).equals(bytes), `bytes differ: ${path}`);
}

function trackedTemplate() {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: plugin, encoding: 'utf8' });
  return new Map(tracked.split('\0').filter(Boolean).map(path => [path.slice(prefix.length), readFileSync(join(plugin, path))]));
}

// An independent implementation of today's physical copy, overlay and removal.
function copyToday(t, type = 'personal') {
  const root = join(scratch(t), 'copy');
  for (const path of trackedTemplate().keys()) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(plugin, prefix, path), join(root, path));
  }
  for (const name of ['about', 'design']) copyFileSync(join(root, `prompts/${type}/${name}.md`), join(root, `memory/${name}.md`));
  rmSync(join(root, 'prompts'), { recursive: true });
  const agents = join(root, 'AGENTS.md');
  writeFileSync(agents, Buffer.from(readFileSync(agents).toString('latin1').split('\n').map(line => line === 'type:' ? `type: ${type}` : line).join('\n'), 'latin1'));
  return readFiles(root);
}

function cli(root, args, env = process.env) {
  return spawnSync(process.execPath, [join(root, scriptPath), ...args], { cwd: root, encoding: 'utf8', env });
}

function checkoutCopy(t) {
  const root = scratch(t);
  writeFiles(root, new Map([...trackedTemplate()].map(([path, bytes]) => [prefix + path, bytes])));
  writeFiles(root, new Map([[scriptPath, readFileSync(join(plugin, scriptPath))], [skillPath, Buffer.from(skill)]]));
  // Borrow only the existing tracked-file index; never stage or create a commit.
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: plugin, encoding: 'utf8' }).trim();
  return { root, env: { ...process.env, GIT_DIR: gitDirectory, GIT_WORK_TREE: root } };
}

test('starter matches today\'s copy: 13 files, 11,332 bytes, id add454da04790528', { skip: needs(['git']) }, t => {
  const template = trackedTemplate();
  const original = new Map([...template].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const result = personalStarter(template);
  assert.equal(result.files.size, 13);
  assert.equal([...result.files.values()].reduce((sum, bytes) => sum + bytes.length, 0), 11332);
  assert.equal(result.id, expectedId);
  equalFiles(result.files, copyToday(t));
  equalFiles(template, original);
  result.files.get('CLAUDE.md')[0] ^= 1;
  equalFiles(template, original);
});

function alwaysSection(bytes) {
  // Latin-1 keeps regex offsets identical to byte offsets, including at EOF.
  const sections = [...bytes.toString('latin1').matchAll(/^## Always(?:\r?\n|$)/gm)];
  assert.equal(sections.length, 1, 'C16 section is present and unique');
  const start = sections[0].index;
  const next = /^## /gm;
  next.lastIndex = start + sections[0][0].length;
  return bytes.subarray(start, next.exec(bytes.toString('latin1'))?.index ?? bytes.length);
}

function approvedAlwaysSection() {
  const approved = readFileSync(join(here, 'approved-always-section.txt'));
  assert.equal(createHash('sha256').update(approved).digest('hex'),
    '2cdb643458f3cdb02ee6043c8bea30dd9233a0d4f417d206821f9469b9914ed8',
    'C16 approved bytes changed; updating the starter id does not approve new rules');
  return approved;
}

test('template C16 bytes equal the stored approved section, independently of the starter id', () => {
  const template = readFileSync(join(plugin, prefix, 'AGENTS.md'));
  assert.deepEqual(alwaysSection(template), approvedAlwaysSection());
});

test('C16 pin refuses a coordinated template, stored-copy and starter-metadata change', { skip: needs(['git']) }, t => {
  const { root, env } = checkoutCopy(t);
  const changed = Buffer.from(approvedAlwaysSection().toString().replace('A question gets an answer', 'A QUESTION gets an answer'));
  const agents = join(root, prefix, 'AGENTS.md');
  writeFileSync(agents, Buffer.from(readFileSync(agents).toString().replace(approvedAlwaysSection().toString(), changed.toString())));
  const updatedId = cli(root, ['id'], env).stdout.trim();
  assert.match(updatedId, /^[a-f0-9]{16}$/);
  assert.notEqual(updatedId, expectedId);
  writeFileSync(join(root, skillPath), skill.replaceAll(expectedId, updatedId));
  const testDirectory = join(root, 'skills/Onboard Root/tests');
  mkdirSync(testDirectory, { recursive: true });
  writeFileSync(join(testDirectory, 'approved-always-section.txt'), changed);
  writeFileSync(join(testDirectory, 'starter.test.mjs'), readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll(expectedId, updatedId));
  // Length is unchanged, and both starter ids now agree. Run only the byte
  // approval test: a nonzero result must be the pin, not unrelated metadata.
  const childEnv = { ...env };
  delete childEnv.NODE_TEST_CONTEXT; // The child is a separate test runner.
  const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=^template C16 bytes equal', join(testDirectory, 'starter.test.mjs')], { env: childEnv, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /C16 approved bytes changed/);
});

for (const type of ['personal', 'org', 'client', 'department', 'industry']) {
  test(`template copy for ${type} carries C16 byte for byte and layout 5`, { skip: needs(['git']) }, t => {
    const approved = approvedAlwaysSection();
    const copied = copyToday(t, type).get('AGENTS.md');
    assert.ok(alwaysSection(copied).equals(approved));
    assert.equal((copied.toString('utf8').match(/^layout:/gm) || []).length, 1);
    assert.match(copied.toString('utf8'), /^layout: 5$/m);
    assert.equal((alwaysSection(copied).toString('utf8').match(/^- /gm) || []).length, 5);
    assert.equal(copied.toString('utf8').match(/^## .+$/gm)[0], '## Always', 'C16 precedes all other sections');
    if (type === 'personal') {
      const starter = personalStarter(trackedTemplate()).files.get('AGENTS.md');
      assert.ok(alwaysSection(starter).equals(approved));
      assert.match(starter.toString('utf8'), /^layout: 5$/m);
    }
  });
}

const smallTemplate = agents => new Map([
  ['AGENTS.md', Buffer.from(agents)],
  ['prompts/personal/about.md', Buffer.from('about [name]\n')],
  ['prompts/personal/design.md', Buffer.from('design [name]\n')],
]);

for (const [name, agents] of [['absent', 'type: personal\n'], ['duplicate', 'type:\ntype:\n'], ['CRLF is not exact', 'type:\r\n']]) {
  test(`starter refuses a ${name} exact type: line`, () => {
    assert.throws(() => personalStarter(smallTemplate(agents)), /AGENTS.md.*exactly one.*type:/);
  });
}

test('starter preserves binary bytes, sorts paths as UTF-8 and hashes byte lengths', () => {
  const template = smallTemplate('type:\n\xff\n');
  template.set('\u{10000}', Buffer.from([0, 255, 128]));
  template.set('\ue000', Buffer.from('Zoë'));
  const { files, id } = personalStarter(template);
  const paths = ['AGENTS.md', 'memory/about.md', 'memory/design.md', '\ue000', '\u{10000}'];
  assert.deepEqual([...files.keys()], paths);
  const hash = createHash('sha256');
  for (const path of paths) hash.update(Buffer.concat([Buffer.from(path), Buffer.from([0]), Buffer.from(`${files.get(path).length}`), Buffer.from([0]), files.get(path)]));
  assert.equal(id, hash.digest('hex').slice(0, 16));
  assert.ok(files.get('\u{10000}').equals(template.get('\u{10000}')));
});

test('starter refuses missing sheets and unsafe relative paths', () => {
  const template = smallTemplate('type:\n');
  template.delete('prompts/personal/about.md');
  assert.throws(() => personalStarter(template), /Missing template file: prompts\/personal\/about.md/);
  for (const path of ['../outside', '/absolute', 'a/../b', 'a\\b']) {
    const bad = smallTemplate('type:\n');
    bad.set(path, Buffer.alloc(0));
    assert.throws(() => personalStarter(bad), /Invalid relative template path/);
  }
});

test('starter id and check pass on this checkout', { skip: needs(['git']) }, () => {
  const id = cli(plugin, ['id']);
  assert.equal(id.status, 0, id.stderr);
  assert.equal(id.stdout, `${expectedId}\n`);
  const check = cli(plugin, ['check']);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stderr, '');
  assert.deepEqual(JSON.parse(check.stdout), { id: expectedId, files: 13, bytes: 11332 });
});

test('starter check names a stale SKILL.md id in a temporary checkout', { skip: needs(['git']) }, t => {
  const { root, env } = checkoutCopy(t);
  writeFileSync(join(root, skillPath), skill.replace(expectedId, '0000000000000000'));
  const result = cli(root, ['check'], env);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Stale starter id.*SKILL\.md.*0000000000000000/);
  assert.ok(result.stderr.includes(expectedId));
});

test('starter check names the old and computed ids when tracked bytes change', { skip: needs(['git']) }, t => {
  const { root, env } = checkoutCopy(t);
  const changed = join(root, prefix, 'CLAUDE.md');
  writeFileSync(changed, Buffer.concat([readFileSync(changed), Buffer.from('\nChanged tracked bytes.\n')]));
  const id = cli(root, ['id'], env);
  assert.equal(id.status, 0, id.stderr);
  assert.notEqual(id.stdout.trim(), expectedId);
  const result = cli(root, ['check'], env);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(expectedId));
  assert.ok(result.stderr.includes(id.stdout.trim()));
});

test('starter ignores untracked files and .DS_Store', { skip: needs(['git']) }, t => {
  const { root, env } = checkoutCopy(t);
  writeFileSync(join(root, prefix, 'untracked.txt'), 'not part of the starter');
  writeFileSync(join(root, prefix, '.DS_Store'), 'not part of the starter');
  const result = cli(root, ['id'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expectedId}\n`);
});

test('starter help works without git; unknown flags and unavailable git fail clearly', () => {
  const env = { ...process.env, PATH: '' };
  for (const args of [[], ['help'], ['--help'], ['id', '--help']]) {
    const result = cli(plugin, args, env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: node starter\.mjs/);
    assert.equal(result.stderr, '');
  }
  for (const flag of ['--install', '--env', '--unknown']) {
    const result = cli(plugin, [flag], env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(flag));
    assert.match(result.stderr, /--help/);
  }
  const noGit = cli(plugin, ['id'], env);
  assert.equal(noGit.status, 1);
  assert.equal(noGit.stdout, '');
  assert.match(noGit.stderr, /git is unavailable.*git --version/);
});

test('Step 1 provides fixed commands, the download on the origin of the wiser server in .mcp.json', () => {
  assert.ok(download && fill && grep);
  const url = download.match(/'(https:[^']+)'/)[1];
  const configured = JSON.parse(readFileSync(join(plugin, '.mcp.json'), 'utf8')).mcpServers.wiser.url;
  assert.equal(url, `${new URL(configured).origin}/starter/personal-${expectedId}.tar.gz`);
  assert.match(step, /single quotes, writing every `'` as `'\\''`/);
  assert.doesNotMatch(fill, /\b(?:sed|perl|python)\b/);
});

// BASH5 names a bash 5.2 or later anywhere, for a machine whose bash 5 is not Homebrew's.
const homebrewBash = [process.env.BASH5, '/opt/homebrew/bin/bash', '/usr/local/bin/bash', '/usr/bin/bash'].find(path => {
  if (!path || !existsSync(path)) return false;
  const version = spawnSync(path, ['-c', 'printf "%s" "$BASH_VERSION"'], { encoding: 'utf8' }).stdout?.match(/^(\d+)\.(\d+)/);
  return version && (+version[1] > 5 || (+version[1] === 5 && +version[2] >= 2));
});
const shells = [
  { name: '/bin/bash (macOS bash 3.2)', command: '/bin/bash' },
  { name: 'zsh', command: 'zsh' },
  { name: 'bash 5.2+', command: homebrewBash, absent: 'bash 5.2+ not found at $BASH5, /opt/homebrew/bin/bash, /usr/local/bin/bash or /usr/bin/bash' },
];
const shellNeeds = (shell, commands) => shell.command ? needs([shell.command, ...commands]) : shell.absent;
const filledCommand = (root, folder, person) => fill.replace("'<destination>'", quote(root)).replace("'<folder name>'", quote(folder)).replace("'<person name>'", quote(person));
const grepCommand = root => grep.replace('"<the root>"', quote(root));
const allowedFolder = name => /^[\p{L}\p{N} _.-]+$/u.test(name) && !/^[ .]|[ .]$/.test(name) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name);

test('existing folder with an approved Always section keeps exactly one through the scripted fill', { skip: needs(['/bin/bash', 'git', 'cat']) }, t => {
  // Adoption's section decision is model-led in existing-root.md, not scripted.
  // Exercise the actual fill on an existing file; do not invent an adopter here.
  const root = join(scratch(t), 'Existing folder');
  const files = personalStarter(trackedTemplate()).files;
  files.set('AGENTS.md', Buffer.concat([files.get('AGENTS.md'), Buffer.from('\nLocal filing note stays here.\n')]));
  writeFiles(root, files);
  const before = readFileSync(join(root, 'AGENTS.md'));
  const result = spawnSync('/bin/bash', ['-c', filledCommand(root, 'Existing folder', 'Rowan')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const after = readFileSync(join(root, 'AGENTS.md'));
  assert.deepEqual(alwaysSection(after), approvedAlwaysSection());
  assert.deepEqual(after, Buffer.from(before.toString('utf8').replaceAll('[name]', 'Existing folder')));
});

function expectedFill(files, folder, person) {
  return new Map([...files].map(([path, bytes]) => [path,
    ['AGENTS.md', 'memory/about.md', 'memory/design.md', 'memory/voice.md'].includes(path)
      ? Buffer.from(bytes.toString('utf8').split('[name]').join(path === 'AGENTS.md' ? folder : person))
      : bytes,
  ]));
}

for (const shell of shells) {
  for (const person of ['Rowan', "O'Brien", 'Zoë', 'José María', 'A&B', '$HOME', 'back\\slash', '50% off', '*star*']) {
    test(`fill extracted from SKILL.md under ${shell.name}: ${person}`, { skip: shellNeeds(shell, ['git', 'cat', 'grep']) }, t => {
      const files = personalStarter(trackedTemplate()).files;
      const folder = allowedFolder(person) ? person : 'Rowan';
      // Quotes in the destination itself exercise its quoting independently.
      const root = join(scratch(t), "O'Brien", folder);
      writeFiles(root, files);
      const result = spawnSync(shell.command, ['-c', filledCommand(root, folder, person)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      equalFiles(readFiles(root), expectedFill(files, folder, person));
      const checked = spawnSync(shell.command, ['-c', grepCommand(root)], { encoding: 'utf8' });
      assert.equal(checked.status, 1, checked.stderr); // grep's no-match result.
      assert.equal(checked.stdout, '');
      assert.equal(checked.stderr, '');
    });
  }
  test(`fill preserves missing and multiple trailing newlines under ${shell.name}`, { skip: shellNeeds(shell, ['git', 'cat']) }, t => {
    const files = personalStarter(trackedTemplate()).files;
    files.set('AGENTS.md', Buffer.concat([files.get('AGENTS.md'), Buffer.from('\n\n[name]')]));
    files.set('memory/about.md', Buffer.concat([files.get('memory/about.md'), Buffer.from('\n\n[name]\n\n\n')]));
    const root = join(scratch(t), 'Rowan');
    writeFiles(root, files);
    const result = spawnSync(shell.command, ['-c', filledCommand(root, 'Rowan', 'A&B')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    equalFiles(readFiles(root), expectedFill(files, 'Rowan', 'A&B'));
  });
  test(`fill writes a name holding [name] once, without rescanning it, under ${shell.name}`, { skip: shellNeeds(shell, ['git', 'cat']) }, t => {
    const files = personalStarter(trackedTemplate()).files;
    const root = join(scratch(t), 'Rowan');
    writeFiles(root, files);
    const result = spawnSync(shell.command, ['-c', filledCommand(root, 'Rowan', 'Ann [name]')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    equalFiles(readFiles(root), expectedFill(files, 'Rowan', 'Ann [name]'));
  });
  test(`fill fails where the copy is incomplete, under ${shell.name}`, { skip: shellNeeds(shell, ['git', 'cat']) }, t => {
    const files = personalStarter(trackedTemplate()).files;
    files.delete('memory/voice.md');
    const root = join(scratch(t), 'Rowan');
    writeFiles(root, files);
    const result = spawnSync(shell.command, ['-c', filledCommand(root, 'Rowan', 'Rowan')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  });
  test(`download extracted from SKILL.md under ${shell.name}: a quoted ~ path is refused and makes nothing`, { skip: shellNeeds(shell, ['curl', 'tar', 'mktemp', 'rm']) }, t => {
    const directory = scratch(t);
    const remote = download.match(/'(https:[^']+)'/)[1];
    const command = download.replace(quote(remote), quote('http://127.0.0.1:9/never')).replaceAll("'<destination>'", quote('~/Desktop/Wiser/Ann'));
    const result = spawnSync(shell.command, ['-c', command], { cwd: directory, encoding: 'utf8', env: { ...process.env, HOME: directory } });
    assert.notEqual(result.status, 0);
    assert.deepEqual(readdirSync(directory), [], 'a folder was made');
  });
}

// A dependency-free fixture archive: sorted POSIX ustar with the spec's metadata.
function archive(files) {
  const entries = new Map();
  for (const [path, bytes] of files) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) entries.set(`${parts.slice(0, i).join('/')}/`, null);
    entries.set(path, bytes);
  }
  const blocks = [];
  for (const [path, bytes] of [...entries].sort(([a], [b]) => comparePaths(a, b))) {
    const header = Buffer.alloc(512);
    const octal = (value, offset, length) => header.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length, 'ascii');
    assert.ok(Buffer.byteLength(path) <= 100);
    header.write(path);
    octal(bytes === null ? 0o755 : 0o644, 100, 8);
    octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes?.length ?? 0, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156);
    header.write(bytes === null ? '5' : '0', 156);
    header.write('ustar\0', 257); header.write('00', 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header);
    if (bytes !== null) blocks.push(bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { mtime: 0 });
}

test('HTTP fixture archive follows deterministic gzip and POSIX ustar rules', { skip: needs(['git']) }, () => {
  const files = personalStarter(trackedTemplate()).files;
  const compressed = archive(files);
  assert.ok(compressed.equals(archive(files)));
  assert.equal(compressed.readUInt32LE(4), 0);
  assert.equal(compressed[3] & 8, 0); // no gzip file name
  const tar = gunzipSync(compressed);
  const seen = [];
  const extracted = new Map();
  const string = bytes => bytes.toString('utf8').replace(/\0.*$/s, '');
  const octal = bytes => parseInt(string(bytes), 8);
  for (let at = 0; tar[at];) {
    const header = tar.subarray(at, at + 512);
    const path = string(header.subarray(0, 100));
    const directory = header[156] === 53;
    const size = octal(header.subarray(124, 136));
    assert.doesNotMatch(path, /^(?:\/|\.\/)|(?:^|\/)\.\.(?:\/|$)/);
    assert.equal(string(header.subarray(257, 263)), 'ustar');
    assert.equal(string(header.subarray(263, 265)), '00');
    assert.equal(octal(header.subarray(100, 108)), directory ? 0o755 : 0o644);
    assert.equal(octal(header.subarray(108, 116)), 0);
    assert.equal(octal(header.subarray(116, 124)), 0);
    assert.equal(octal(header.subarray(136, 148)), 0);
    assert.equal(string(header.subarray(265, 297)), '');
    assert.equal(string(header.subarray(297, 329)), '');
    assert.equal(path.endsWith('/'), directory);
    const parts = path.replace(/\/$/, '').split('/');
    for (let i = 1; i < parts.length; i++) assert.ok(seen.includes(`${parts.slice(0, i).join('/')}/`));
    seen.push(path);
    if (!directory) extracted.set(path, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(seen, [...seen].sort(comparePaths));
  equalFiles(extracted, files);
});

function runShell(shell, command, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(shell, ['-c', command], { env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('local download timed out')); }, 10000);
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', status => { clearTimeout(timer); resolveResult({ status, stdout, stderr }); });
  });
}

for (const shell of shells) {
  for (const status of [200, 404]) {
    test(`download extracted from SKILL.md under ${shell.name}: HTTP ${status}`, { skip: shellNeeds(shell, ['git', 'curl', 'tar', 'mktemp', 'rm']) }, async t => {
      const files = personalStarter(trackedTemplate()).files;
      const body = status === 200 ? archive(files) : Buffer.from('Not found\n');
      const server = createServer((request, response) => {
        assert.equal(request.url, `/starter/personal-${expectedId}.tar.gz`);
        response.writeHead(status, { 'Content-Type': status === 200 ? 'application/gzip' : 'text/plain', 'Content-Length': body.length, Connection: 'close' });
        response.end(body);
      });
      await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
      t.after(() => new Promise(resolveClose => server.close(resolveClose)));
      const directory = scratch(t);
      const root = join(directory, "O'Brien destination");
      const tmp = join(directory, 'tmp');
      mkdirSync(root); mkdirSync(tmp);
      const before = status === 404 ? new Map([['keep.txt', Buffer.from('keep exactly\n')]]) : new Map();
      writeFiles(root, before);
      const remote = download.match(/'(https:[^']+)'/)[1];
      const local = `http://127.0.0.1:${server.address().port}/starter/personal-${expectedId}.tar.gz`;
      const command = download.replace(quote(remote), quote(local)).replaceAll("'<destination>'", quote(root));
      const result = await runShell(shell.command, command, { ...process.env, TMPDIR: tmp, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' });
      assert.equal(result.stdout, '');
      if (status === 200) assert.equal(result.status, 0, result.stderr);
      else assert.notEqual(result.status, 0);
      equalFiles(readFiles(root), status === 200 ? files : before);
      assert.deepEqual(readdirSync(tmp), [], 'download removes its temporary file');
    });
  }
  test(`download extracted from SKILL.md under ${shell.name}: a missing destination is refused, made by nothing, and a caller's t survives`, { skip: shellNeeds(shell, ['curl', 'tar', 'mktemp', 'rm']) }, async t => {
    const directory = scratch(t);
    const root = join(directory, 'Wiser', 'Rowan');
    const keep = join(directory, 'keep.txt');
    writeFileSync(keep, 'keep exactly\n');
    const remote = download.match(/'(https:[^']+)'/)[1];
    const command = `t=${quote(keep)}; ` + download.replace(quote(remote), quote('http://127.0.0.1:9/never')).replaceAll("'<destination>'", quote(root)) + `; s=$?; [ "$t" = ${quote(keep)} ] || s=99; exit "$s"`;
    const result = await runShell(shell.command, command, { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' });
    assert.notEqual(result.status, 0);
    assert.notEqual(result.status, 99, 'the download changed the caller\'s t');
    assert.equal(existsSync(join(directory, 'Wiser')), false, 'the download made a folder');
    assert.equal(readFileSync(keep, 'utf8'), 'keep exactly\n');
  });
}
