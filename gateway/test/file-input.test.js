import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { screenInputFiles, readInputFiles } from '../src/file-input.js';

const CAP = 2097152;
const DECLARATION = { field: 'attachments', max_bytes: CAP };
const SCHEMA = { type: 'array', minItems: 1, maxItems: 10,
  items: { type: 'string', minLength: 1, maxLength: 4096, pattern: '^/[^\\u0000]*$' } };
const refused = (reason, index) => ({ status: 'invalid_arguments', field: 'attachments', reason,
  ...(index === undefined ? {} : { index }) });

function fixture(t) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'wiser-input-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, data = 'invented attachment bytes') => {
    const path = join(root, name);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, data);
    return path;
  };
  const options = {
    home: join(root, 'gateway'), envPath: write('config/auth-provider.env', 'INVENTED_PROVIDER_MARKER='),
    secretFiles: { sample: write('credentials/bound.key', 'INVENTED_SECRET_MARKER=') },
    secretsDir: join(root, 'secrets'),
  };
  fs.mkdirSync(options.home);
  fs.mkdirSync(options.secretsDir);
  const screen = (paths, declaration = DECLARATION, schema = SCHEMA) => screenInputFiles(paths, declaration, schema, options);
  return { root, write, options, screen };
}

function patchFs(t, name, replacement) {
  t.mock.method(fs, name, replacement);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

function noContent(t) {
  for (const name of ['openSync', 'readSync', 'readFileSync']) {
    patchFs(t, name, () => assert.fail(`unexpected ${name}`));
  }
}

function noFilesystem(t) {
  for (const name of ['lstatSync', 'statSync', 'realpathSync', 'accessSync']) {
    patchFs(t, name, () => assert.fail(`unexpected ${name}`));
  }
  noContent(t);
}

test('importing the file-input module performs no filesystem I/O', async (t) => {
  // Load the source before spying, so the loader's own source read is excluded.
  const source = fs.readFileSync(new URL('../src/file-input.js', import.meta.url), 'utf8')
    .replace("'./errors.js'", JSON.stringify(new URL('../src/errors.js', import.meta.url).href));
  noFilesystem(t);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.deepEqual(Object.keys(module).sort(), ['readInputFiles', 'screenInputFiles']);
});

test('F02 allowed files preserve order, exact bytes, canonical names, types and independent hashes', (t) => {
  const { root, write, screen } = fixture(t);
  const cases = [
    ['report.PDF', 'application/pdf'], ['note.TXT', 'text/plain'], ['note.md', 'text/markdown'],
    ['table.csv', 'text/csv'], ['table.tsv', 'text/tab-separated-values'], ['page.html', 'text/html'],
    ['page.HTM', 'text/html'], ['data.json', 'application/json'], ['image.png', 'image/png'],
    ['image.JPG', 'image/jpeg'], ['image.jpeg', 'image/jpeg'], ['image.gif', 'image/gif'],
    ['image.webp', 'image/webp'], ['archive.zip', 'application/zip'],
    ['document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['unknown.xyz', 'application/octet-stream'], ['no-extension', 'application/octet-stream'],
    ['empty.txt', 'text/plain'],
  ];
  for (let start = 0; start < cases.length; start += 10) {
    const group = cases.slice(start, start + 10);
    const inputs = group.map(([name], i) => ({ path: write(`files/${name}`, name === 'empty.txt' ? Buffer.alloc(0) :
      Buffer.from([0, 255, 19, 128, i, 4])), data: name === 'empty.txt' ? Buffer.alloc(0) : Buffer.from([0, 255, 19, 128, i, 4]) }));
    const batch = screen(inputs.map((entry) => entry.path));
    assert.equal(Array.isArray(batch), true);
    assert.ok(Object.isFrozen(batch));
    const prepared = readInputFiles(batch);
    assert.equal(prepared.length, group.length);
    for (let i = 0; i < group.length; i += 1) {
      const [name, media_type] = group[i];
      const st = fs.statSync(inputs[i].path);
      assert.deepEqual(batch[i], { path: join(root, 'files', name), dev: st.dev, ino: st.ino,
        size: inputs[i].data.length, name, media_type });
      assert.deepEqual(prepared[i], { data: inputs[i].data, name, media_type, size: inputs[i].data.length,
        sha256: createHash('sha256').update(inputs[i].data).digest('hex') });
      assert.match(prepared[i].sha256, /^[0-9a-f]{64}$/);
      assert.equal(Object.hasOwn(prepared[i], 'path'), false);
    }
  }
});

test('F02 canonical basename after rename, dot segments and duplicate occurrences', (t) => {
  const { root, write, screen } = fixture(t);
  const old = write('files/old.txt', 'invented PDF bytes');
  const renamed = join(dirname(old), 'renamed.PDF');
  fs.renameSync(old, renamed);
  fs.mkdirSync(join(root, 'files', 'child'));
  const spelling = `${dirname(renamed)}/child/.././renamed.PDF`;
  const batch = screen([spelling, renamed]);
  assert.deepEqual(batch.map((r) => r.path), [renamed, renamed]);
  const open = fs.openSync;
  const close = fs.closeSync;
  let opens = 0;
  let closes = 0;
  patchFs(t, 'openSync', (path, flags) => {
    opens += 1;
    assert.equal(path, renamed);
    assert.equal(flags, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    return open(path, flags);
  });
  patchFs(t, 'closeSync', (fd) => { closes += 1; return close(fd); });
  const result = readInputFiles(batch);
  assert.deepEqual(result.map((r) => r.name), ['renamed.PDF', 'renamed.PDF']);
  assert.deepEqual(result.map((r) => r.data), [Buffer.from('invented PDF bytes'), Buffer.from('invented PDF bytes')]);
  assert.equal(opens, 2);
  assert.equal(closes, 2);
  result[0].data.fill(0);
  assert.deepEqual(result[1].data, Buffer.from('invented PDF bytes'));
});

const protectedCases = [
  ['gateway home', (f) => f.options.home],
  ['gateway child', (f) => f.write('gateway/ordinary.txt')],
  ['provider basename', (f) => f.write('files/auth-provider.env')],
  ['default env', (f) => f.options.envPath],
  ['default env sibling', (f) => f.write('config/sibling.txt')],
  ['explicit env', (f) => { f.options.envPath = f.write('explicit/config.key'); return f.options.envPath; }],
  ['explicit env sibling', (f) => { f.options.envPath = f.write('explicit/config.key'); return f.write('explicit/sibling.txt'); }],
  ['secret file', (f) => f.options.secretFiles.sample],
  ['secret sibling', (f) => f.write('credentials/sibling.txt')],
  ['secrets child', (f) => f.write('secrets/nested/ordinary.txt')],
  ...['.env', '.env.local', '.env-production', 'settings.env', '.ENV', '.EnV.LOCAL', '.ENV-PRODUCTION', 'SETTINGS.ENV']
    .map((name) => [name, (f) => f.write(`files/${name}`)]),
  ...['memory', 'MEMORY', 'MeMoRy'].map((name) => [`${name} ancestor`, (f) => f.write(`${name}/ordinary.txt`)]),
  ['memory before dot-dot', (f) => {
    f.write('memory/invented.txt');
    f.write('ordinary.txt');
    return `${f.root}/memory/../ordinary.txt`;
  }],
  ['protected hard link', (f) => {
    const path = join(f.root, 'innocent.txt');
    fs.linkSync(f.options.secretFiles.sample, path);
    return path;
  }],
  ['ordinary hard link', (f) => {
    const source = f.write('files/ordinary.txt');
    fs.linkSync(source, join(f.root, 'ordinary-alias.txt'));
    return source;
  }],
  // A key file named through a link guards the directory it resolves into.
  ['linked env target sibling', (f) => {
    fs.mkdirSync(join(f.root, 'safe'));
    fs.symlinkSync(f.write('vault/auth-provider.env', 'INVENTED_PROVIDER_MARKER='), join(f.root, 'safe/provider.env'));
    f.options.envPath = join(f.root, 'safe/provider.env');
    return f.write('vault/token.json');
  }],
  ['linked secret target nested child', (f) => {
    fs.mkdirSync(join(f.root, 'bound'));
    fs.symlinkSync(f.write('keyring/bound.key', 'INVENTED_SECRET_MARKER='), join(f.root, 'bound/sample.key'));
    f.options.secretFiles = { sample: join(f.root, 'bound/sample.key') };
    return f.write('keyring/nested/token.json');
  }],
  // Every link on the way to a key file guards the directory it sits in, not only the last.
  ['sibling of an intermediate directory link', (f) => {
    f.write('store/3/key.env', 'INVENTED_PROVIDER_MARKER=');
    fs.symlinkSync(join(f.root, 'store/3'), join(f.root, 'store/current'));
    fs.mkdirSync(join(f.root, 'cfg'));
    fs.symlinkSync(join(f.root, 'store/current/key.env'), join(f.root, 'cfg/provider.env'));
    f.options.envPath = join(f.root, 'cfg/provider.env');
    return f.write('store/token.json');
  }],
  ['sibling of a two-hop file link', (f) => {
    f.write('vault/3/key.env', 'INVENTED_PROVIDER_MARKER=');
    fs.symlinkSync(join(f.root, 'vault/3/key.env'), join(f.root, 'vault/current.env'));
    fs.mkdirSync(join(f.root, 'cfg'));
    fs.symlinkSync('../vault/current.env', join(f.root, 'cfg/provider.env'));
    f.options.envPath = join(f.root, 'cfg/provider.env');
    return f.write('vault/token.json');
  }],
];

for (const [name, pathFor] of protectedCases) {
  test(`F03 refuses ${name} before any content open/read`, (t) => {
    const f = fixture(t);
    const path = pathFor(f);
    noContent(t);
    assert.deepEqual(f.screen([path]), refused('input_file_refused', 0));
  });
}

test('F03 compares protected file device/inode even through an innocent spelling', (t) => {
  const f = fixture(t);
  const alias = join(f.root, 'innocent.txt');
  fs.linkSync(f.options.secretFiles.sample, alias);
  const lstat = fs.lstatSync;
  // Isolate the protected identity control from the independent multi-link ban.
  patchFs(t, 'lstatSync', (path, ...args) => {
    const st = lstat(path, ...args);
    if (path === alias) st.nlink = 1;
    return st;
  });
  noContent(t);
  assert.deepEqual(f.screen([alias]), refused('input_file_refused', 0));
});

test('F03 compares canonical protected directory identities, not only prefix strings', (t) => {
  const f = fixture(t);
  const candidate = f.write('files/ordinary.txt');
  const id = fs.statSync(dirname(f.options.envPath));
  const lstat = fs.lstatSync;
  patchFs(t, 'lstatSync', (path, ...args) => {
    const st = lstat(path, ...args);
    if (path === dirname(candidate)) { st.dev = id.dev; st.ino = id.ino; }
    return st;
  });
  noContent(t);
  assert.deepEqual(f.screen([candidate]), refused('input_file_refused', 0));
});

test('F03 canonical memory ancestry is refused independently of the supplied spelling', (t) => {
  const f = fixture(t);
  const candidate = f.write('files/ordinary.txt');
  const canonical = join(f.root, 'MEMORY', 'ordinary.txt');
  const realpath = fs.realpathSync;
  patchFs(t, 'realpathSync', (path, ...args) => path === candidate ? canonical : realpath(path, ...args));
  noContent(t);
  assert.deepEqual(f.screen([candidate]), refused('input_file_refused', 0));
});

const badPaths = [
  ['leaf symlink', (f) => { const p = join(f.root, 'leaf'); fs.symlinkSync(f.write('files/ordinary.txt'), p); return p; }],
  ['linked ancestor to temp root', (f) => {
    const link = join(f.root, 'linked-ancestor');
    fs.symlinkSync(f.root, link);
    f.write('files/ordinary.txt');
    return `${link}/files/ordinary.txt`;
  }],
  ['dangling symlink', (f) => { const p = join(f.root, 'dangling'); fs.symlinkSync(join(f.root, 'missing'), p); return p; }],
  ['link before dot-dot', (f) => {
    fs.mkdirSync(join(f.root, 'target'));
    fs.symlinkSync(join(f.root, 'target'), join(f.root, 'link'));
    f.write('ordinary.txt');
    return `${f.root}/link/../ordinary.txt`;
  }],
  ['directory', (f) => { const p = join(f.root, 'directory'); fs.mkdirSync(p); return p; }],
  ['FIFO', (f) => {
    const p = join(f.root, 'fifo');
    const made = spawnSync('mkfifo', [p], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    return p;
  }],
];

for (const [name, pathFor] of badPaths) {
  test(`F04 refuses ${name} before content opens`, (t) => {
    const f = fixture(t);
    const path = pathFor(f);
    noContent(t);
    assert.deepEqual(f.screen([path]), refused('input_file_refused', 0));
  });
}

test('a link chain to a key file still leaves a file outside every hop readable', (t) => {
  const f = fixture(t);
  f.write('store/3/key.env', 'INVENTED_PROVIDER_MARKER=');
  fs.symlinkSync(join(f.root, 'store/3'), join(f.root, 'store/current'));
  fs.mkdirSync(join(f.root, 'cfg'));
  fs.symlinkSync(join(f.root, 'store/current/key.env'), join(f.root, 'cfg/provider.env'));
  f.options.envPath = join(f.root, 'cfg/provider.env');
  const outside = f.write('docs/deck.pdf', 'invented PDF bytes');
  assert.equal(Array.isArray(f.screen([outside])), true);
});

for (const spelling of ['/.vol', '//.vol', '/./.vol', '/.VOL', '/private/../.vol']) {
  test(`volfs spelling ${spelling} is refused by its own check, before any content open`, (t) => {
    // A file outside every guard, and a realpath that keeps the volfs path. Two checks refuse it: the
    // volfs name check, and the walk's identity check, since /.vol's own inode is not a safe integer here.
    const f = fixture(t);
    const st = fs.statSync(f.write('docs/outside.txt'));
    const realpath = fs.realpathSync;
    patchFs(t, 'realpathSync', (value, ...args) => (/\.vol/i.test(value) ? value : realpath(value, ...args)));
    noContent(t);
    assert.deepEqual(f.screen([`${spelling}/${st.dev}/${st.ino}`]), refused('input_file_refused', 0));
  });
}

test('F04 a mode with no read bit is unreadable even when the access check passes', (t) => {
  // As for a privileged uid: the mode check alone refuses it, before any open.
  const f = fixture(t);
  const unreadable = f.write('files/unreadable.txt');
  fs.chmodSync(unreadable, 0);
  patchFs(t, 'accessSync', () => undefined);
  noContent(t);
  assert.deepEqual(f.screen([unreadable]), refused('input_file_unreadable', 0));
});

test('F04 missing, unreadable and uncanonicalizable inputs return only fixed reasons', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.screen([join(f.root, 'missing')]), refused('input_file_unreadable', 0));
  const unreadable = f.write('files/unreadable.txt');
  fs.chmodSync(unreadable, 0);
  try { assert.deepEqual(f.screen([unreadable]), refused('input_file_unreadable', 0)); }
  finally { fs.chmodSync(unreadable, 0o600); }
  const path = f.write('files/uncanonicalizable.txt');
  const realpath = fs.realpathSync;
  patchFs(t, 'realpathSync', (value, ...args) => {
    if (value === path) throw new Error('invented OS text with private configuration and content');
    return realpath(value, ...args);
  });
  noContent(t);
  assert.deepEqual(f.screen([path]), refused('input_file_unreadable', 0));
});

for (const kind of ['character device', 'block device', 'socket']) {
  test(`F04 refuses a simulated ${kind} without opening it`, (t) => {
    const f = fixture(t);
    const path = f.write('files/ordinary.txt');
    const lstat = fs.lstatSync;
    patchFs(t, 'lstatSync', (value, ...args) => {
      const st = lstat(value, ...args);
      if (value === path) st.isFile = () => false;
      return st;
    });
    noContent(t);
    assert.deepEqual(f.screen([path]), refused('input_file_refused', 0));
  });
}

for (const [name, makePaths] of [
  ['empty batch', () => []], ['eleven paths', (p) => Array(11).fill(p)],
  ['empty path', () => ['']], ['overlong path', (p) => [`${dirname(p)}/${'a'.repeat(4097)}`]],
  ['non-string', () => [5]], ['null item', () => [null]], ['sparse array', () => Array(1)],
  ['relative', () => ['relative.txt']], ['tilde', () => ['~/invented.txt']],
  ['URL', () => ['file:///invented.txt']], ['variable spelling', () => ['$HOME/invented.txt']],
  ['NUL', (p) => [`${p}\u0000`]], ['lone high surrogate', (p) => [`${p}\ud800`]],
  ['lone low surrogate', (p) => [`${p}\udfff`]],
  ['foreign drive path', () => ['Z:\\invented\\file.txt']], ['foreign UNC path', () => ['\\\\invented\\file.txt']],
]) {
  test(`F05 refuses ${name} before any filesystem operation`, (t) => {
    const f = fixture(t);
    const paths = makePaths(f.write('files/ordinary.txt'));
    noFilesystem(t);
    const result = f.screen(paths);
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.reason, 'input_file_refused');
    assert.equal(result.field, 'attachments');
  });
}

test('F05 a dollar or percent sign in an absolute path is the file name, never expanded', (t) => {
  const { write, screen } = fixture(t);
  const path = write('files/Pricing $50 at 100%off ${INVENTED} %INVENTED%.pdf', 'invented PDF bytes');
  const batch = screen([path]);
  assert.equal(Array.isArray(batch), true);
  assert.equal(batch[0].name, basename(path));
  assert.deepEqual(readInputFiles(batch)[0].data, Buffer.from('invented PDF bytes'));
});

test('F05 count, code-point length and item regex constraints apply independently', (t) => {
  const f = fixture(t);
  const path = f.write('files/face-\u{1f642}.txt');
  const schema = structuredClone(SCHEMA);
  const points = [...path].length;
  assert.ok(path.length > points);
  schema.items.minLength = schema.items.maxLength = points;
  assert.equal(readInputFiles(f.screen([path], DECLARATION, schema))[0].name, basename(path));
  schema.items.maxLength = points - 1;
  schema.items.minLength = 1;
  assert.deepEqual(f.screen([path], DECLARATION, schema), refused('input_file_refused', 0));
  schema.items.minLength = points + 1;
  schema.items.maxLength = 4096;
  assert.deepEqual(f.screen([path], DECLARATION, schema), refused('input_file_refused', 0));
  schema.items.minLength = 1;
  schema.items.pattern = '\\.pdf$';
  assert.deepEqual(f.screen([path], DECLARATION, schema), refused('input_file_refused', 0));
  delete schema.items.pattern;
  schema.minItems = schema.maxItems = 2;
  assert.deepEqual(f.screen([path], DECLARATION, schema), refused('input_file_refused'));
  assert.equal(readInputFiles(f.screen([path, path], DECLARATION, schema)).length, 2);
  schema.minItems = schema.maxItems = 1;
  assert.deepEqual(f.screen([path, path], DECLARATION, schema), refused('input_file_refused'));
});

test('F06 exact aggregate cap passes, including repeated occurrences and empty files', (t) => {
  const f = fixture(t);
  const half = Buffer.alloc(CAP / 2, 39);
  const path = f.write('files/half.bin', half);
  const empty = f.write('files/empty.bin', Buffer.alloc(0));
  const result = readInputFiles(f.screen([path, path, empty]));
  assert.equal(result.reduce((n, r) => n + r.size, 0), CAP);
  assert.deepEqual(result.map((r) => r.data), [half, half, Buffer.alloc(0)]);
  const full = f.write('files/full.bin', Buffer.alloc(CAP, 17));
  assert.equal(readInputFiles(f.screen([full]))[0].size, CAP);
});

for (const kind of ['one byte over', 'aggregate over', 'sparse source', 'duplicates over']) {
  test(`F06 ${kind} is refused by metadata before any content read`, (t) => {
    const f = fixture(t);
    let paths;
    if (kind === 'one byte over') paths = [f.write('files/over.bin', Buffer.alloc(CAP + 1))];
    if (kind === 'aggregate over') paths = [f.write('files/a.bin', Buffer.alloc(CAP / 2)), f.write('files/b.bin', Buffer.alloc(CAP / 2 + 1))];
    if (kind === 'duplicates over') {
      const path = f.write('files/repeat.bin', Buffer.alloc(CAP / 2 + 1));
      paths = [path, path];
    }
    if (kind === 'sparse source') {
      const path = f.write('files/sparse.bin', Buffer.alloc(0));
      fs.truncateSync(path, CAP + 1);
      paths = [path];
    }
    noContent(t);
    assert.deepEqual(f.screen(paths), refused('input_file_too_large', paths.length - 1));
  });
}

test('F06 all sources are screened before the first content open', (t) => {
  const f = fixture(t);
  const safe = f.write('files/ordinary.txt');
  const forbidden = f.write('files/settings.env');
  noContent(t);
  assert.deepEqual(f.screen([safe, forbidden]), refused('input_file_refused', 1));
});

test('F06 growth between screen and reader refuses without content reads; caps/options are copied', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.txt', Buffer.alloc(4));
  const declaration = { field: 'attachments', max_bytes: 4 };
  const batch = f.screen([path], declaration);
  declaration.max_bytes = CAP;
  declaration.field = 'widened';
  f.options.home = dirname(path);
  fs.appendFileSync(path, 'invented growth');
  noContent(t);
  assert.deepEqual(readInputFiles(batch), refused('input_file_changed', 0));
});

test('the screen snapshots the declared cap before any filesystem operation', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.bin', Buffer.alloc(5));
  const declaration = { field: 'attachments', max_bytes: 4 };
  const lstat = fs.lstatSync;
  patchFs(t, 'lstatSync', (...args) => {
    declaration.max_bytes = CAP;
    return lstat(...args);
  });
  noContent(t);
  assert.deepEqual(f.screen([path], declaration), refused('input_file_too_large', 0));
  assert.equal(declaration.max_bytes, CAP);
});

test('F06 reader rechecks every source before the first content open', (t) => {
  const f = fixture(t);
  const first = f.write('files/first.txt');
  const second = f.write('files/second.txt');
  const batch = f.screen([first, second]);
  fs.chmodSync(second, 0);
  noContent(t);
  try { assert.deepEqual(readInputFiles(batch), refused('input_file_unreadable', 1)); }
  finally { fs.chmodSync(second, 0o600); }
});

test('screen state cannot be forged or mutated into wider permission', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.txt');
  const batch = f.screen([path]);
  assert.throws(() => { batch[0].path = f.options.envPath; }, TypeError);
  assert.throws(() => batch.push(batch[0]), TypeError);
  noFilesystem(t);
  assert.deepEqual(readInputFiles([...batch]), { status: 'invalid_arguments', field: 'input', reason: 'input_file_refused' });
});

for (const stage of ['fstat', 'read', 'final fstat', 'close', 'unsupported open']) {
  test(`F04 reader sanitizes ${stage} failure and closes every opened descriptor`, (t) => {
    const f = fixture(t);
    const path = f.write('files/ordinary.txt');
    const batch = f.screen([path]);
    const open = fs.openSync, close = fs.closeSync, stat = fs.fstatSync;
    let opened = 0, closed = 0, stats = 0;
    patchFs(t, 'openSync', (...args) => {
      if (stage === 'unsupported open') throw Object.assign(new Error('invented private OS text'), { code: 'EINVAL' });
      opened += 1;
      return open(...args);
    });
    patchFs(t, 'closeSync', (fd) => {
      closed += 1;
      close(fd);
      if (stage === 'close') throw new Error('invented private close text');
    });
    patchFs(t, 'fstatSync', (...args) => {
      stats += 1;
      if (stage === 'fstat' || (stage === 'final fstat' && stats === 2)) throw new Error('invented private stat text');
      return stat(...args);
    });
    if (stage === 'read') patchFs(t, 'readSync', () => { throw new Error('invented private read text'); });
    assert.deepEqual(readInputFiles(batch), refused('input_file_unreadable', 0));
    assert.equal(opened, stage === 'unsupported open' ? 0 : 1);
    assert.equal(closed, opened);
  });
}

for (const kind of ['inode replaced', 'hard link introduced', 'descriptor identity unavailable', 'descriptor non-regular']) {
  test(`F04 reader refuses ${kind} before reading and closes the descriptor`, (t) => {
    const f = fixture(t);
    const path = f.write('files/ordinary.txt');
    const batch = f.screen([path]);
    const open = fs.openSync, close = fs.closeSync, stat = fs.fstatSync;
    let closed = 0;
    patchFs(t, 'openSync', (...args) => {
      if (kind === 'inode replaced') { fs.renameSync(path, `${path}.old`); fs.writeFileSync(path, 'invented replacement'); }
      if (kind === 'hard link introduced') fs.linkSync(path, `${path}.alias`);
      return open(...args);
    });
    patchFs(t, 'fstatSync', (...args) => {
      const st = stat(...args);
      if (kind === 'descriptor identity unavailable') st.ino = undefined;
      if (kind === 'descriptor non-regular') st.isFile = () => false;
      return st;
    });
    patchFs(t, 'closeSync', (fd) => { closed += 1; close(fd); });
    patchFs(t, 'readSync', () => assert.fail('unsafe descriptor was read'));
    const reason = kind === 'descriptor identity unavailable' ? 'input_file_refused' : 'input_file_changed';
    assert.deepEqual(readInputFiles(batch), refused(reason, 0));
    assert.equal(closed, 1);
  });
}

test('F04 FIFO swapped in during open is nonblocking, rejected and closed without a read', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.txt');
  const batch = f.screen([path]);
  const open = fs.openSync, close = fs.closeSync;
  let closed = 0;
  patchFs(t, 'openSync', (value, flags) => {
    fs.unlinkSync(path);
    const made = spawnSync('mkfifo', [path], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    assert.ok(flags & fs.constants.O_NONBLOCK);
    return open(value, flags);
  });
  patchFs(t, 'closeSync', (fd) => { closed += 1; close(fd); });
  patchFs(t, 'readSync', () => assert.fail('FIFO was read'));
  assert.deepEqual(readInputFiles(batch), refused('input_file_changed', 0));
  assert.equal(closed, 1);
});

test('F04 no-follow open refuses a leaf link introduced after the last path check', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.txt');
  const target = f.write('files/other.txt');
  const batch = f.screen([path]);
  const open = fs.openSync;
  let opens = 0;
  patchFs(t, 'openSync', (...args) => {
    opens += 1;
    fs.unlinkSync(path);
    fs.symlinkSync(target, path);
    return open(...args);
  });
  patchFs(t, 'readSync', () => assert.fail('linked source was read'));
  patchFs(t, 'closeSync', () => assert.fail('no descriptor should have opened'));
  assert.deepEqual(readInputFiles(batch), refused('input_file_unreadable', 0));
  assert.equal(opens, 1);
});

test('F04 ancestor swapped to a link after open is refused before reading', (t) => {
  const f = fixture(t);
  const path = f.write('files/ordinary.txt');
  const batch = f.screen([path]);
  const open = fs.openSync, close = fs.closeSync;
  let closed = 0;
  patchFs(t, 'openSync', (...args) => {
    const fd = open(...args);
    const moved = join(f.root, 'moved');
    fs.renameSync(dirname(path), moved);
    fs.symlinkSync(moved, dirname(path));
    return fd;
  });
  patchFs(t, 'closeSync', (fd) => { closed += 1; close(fd); });
  patchFs(t, 'readSync', () => assert.fail('changed ancestry was read'));
  assert.deepEqual(readInputFiles(batch), refused('input_file_changed', 0));
  assert.equal(closed, 1);
});

for (const kind of ['growth', 'incomplete', 'same-size change', 'ancestor replacement']) {
  test(`F06 ${kind} during reading refuses with bounded retention and closes`, (t) => {
    const f = fixture(t);
    const path = f.write('files/ordinary.bin', Buffer.alloc(CAP, 29));
    const batch = f.screen([path]);
    const read = fs.readSync, close = fs.closeSync;
    let closed = 0, reads = 0, sourceFd;
    patchFs(t, 'readSync', (fd, data, offset, length, position) => {
      sourceFd = fd;
      reads += 1;
      assert.ok(data.length <= CAP);
      assert.ok(length <= 65536);
      if (kind === 'incomplete' && reads === 2) return 0;
      const n = read(fd, data, offset, length, position);
      if (reads === 1) {
        if (kind === 'growth') fs.appendFileSync(path, Buffer.alloc(1));
        if (kind === 'same-size change') fs.writeFileSync(path, Buffer.alloc(CAP, 30));
        if (kind === 'ancestor replacement') {
          fs.renameSync(dirname(path), join(f.root, 'moved'));
          fs.mkdirSync(dirname(path));
          fs.writeFileSync(path, Buffer.alloc(CAP, 29));
        }
      }
      return n;
    });
    patchFs(t, 'closeSync', (fd) => { if (fd === sourceFd) closed += 1; close(fd); });
    assert.deepEqual(readInputFiles(batch), refused(kind === 'growth' ? 'input_file_too_large' : 'input_file_changed', 0));
    assert.equal(closed, 1);
  });
}
